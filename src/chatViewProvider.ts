import * as vscode from 'vscode';
import * as path from 'path';
import { emotionEmoji, normalizeEmotionKey } from './emotionAssets';
import { rolePackPath } from './config';
import { getEffectiveConfig } from './runtimeConfig';
import { getSharedAppDataHint, KernelClient, type StoredMessage } from './kernelClient';
import {
  listRoleOptions,
  readMetaActionTemplates,
  readRoleDisplayName,
  readSceneWelcome,
  resolveEmotionImagePath,
  type MetaActionTemplates,
  type RoleOption,
} from './rolePack';
import { emitSettingsChanged } from './settingsEvents';
import { ensureSetup } from './setup';
import { KernelStatusBar } from './statusBar';
import type { SettingsController } from './settingsViewProvider';
import type {
  ChatLine,
  ChatPatchPayload,
  HostToWebviewMessage,
  SettingsSection,
  WebviewToHostMessage,
} from './webviewProtocol';
import { buildWebviewHtml } from './webviewHtml';
import {
  clampPortraitPaneHeight,
  resolvePortraitPaneHeight,
} from './chatLayoutConfig';

const SCENE_ID = 'vscode';
const SESSION_KEY = 'oclive.sessionId';
const ATTACH_HINT_KEY = 'oclive.attachHintShown';
const POLL_INTERVAL_VISIBLE_MS = 15000;
const POLL_INTERVAL_HIDDEN_MS = 60000;
const EDITOR_DEBOUNCE_MS = 280;

function storedMessageToLine(msg: StoredMessage): ChatLine {
  const sender = msg.sender.toLowerCase();
  const role: ChatLine['role']
    = sender === 'user' ? 'user' : sender === 'assistant' ? 'assistant' : 'system';
  return { role, text: msg.content, id: msg.id };
}

export class ChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'oclive.chatView';

  private view?: vscode.WebviewView;
  private settingsPanel?: vscode.WebviewPanel;
  private readonly lines: ChatLine[] = [];
  private roleName = '';
  private roleSwitching = false;
  private switchRoleInFlight = false;
  private portraitEmotion = 'neutral';
  private portraitWebviewSrc = '';
  private portraitEmoji = '😐';
  private sending = false;
  private identityLabel = '';
  private welcomed = false;
  private pollTimer: ReturnType<typeof setInterval> | undefined;
  private pollBusy = false;
  private pollIntervalMs = POLL_INTERVAL_VISIBLE_MS;
  private webviewVisible = true;
  private connectionSummary = '';
  private llmSummary = '';
  private attachHintVisible = false;
  private editorChip = '';
  private shellReady = false;
  private viewMode: 'chat' | 'settings' = 'chat';
  private htmlLoaded = false;
  private roleOptionsCache: RoleOption[] | null = null;
  private roleOptionsCacheKey = '';
  private editorDebounceTimer: ReturnType<typeof setTimeout> | undefined;
  private resizeDebounceTimer: ReturnType<typeof setTimeout> | undefined;
  private editorSub?: vscode.Disposable;
  private visibilitySub?: vscode.Disposable;
  private sendAbort?: AbortController;
  private thinkingTimer?: ReturnType<typeof setInterval>;
  private thinkingSeconds = 0;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly kernel: KernelClient,
    private readonly context: vscode.ExtensionContext,
    private readonly statusBar: KernelStatusBar,
    private readonly settingsController: SettingsController,
  ) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this.view = webviewView;
    this.settingsController.bindPostMessage((msg) => {
      void this.postToWebview(msg);
    });
    this.updateWebviewRoots();
    this.ensureWebviewHtml();

    webviewView.webview.onDidReceiveMessage(async (msg: WebviewToHostMessage) => {
      await this.handleWebviewMessage(msg);
    });

    this.visibilitySub?.dispose();
    this.visibilitySub = webviewView.onDidChangeVisibility(() => {
      this.webviewVisible = webviewView.visible;
      this.restartRoleSnapshotPoll();
    });
    this.webviewVisible = webviewView.visible;

    this.startEditorContextWatch();
    void this.bootstrap();
    this.startRoleSnapshotPoll();
  }

  private async handleWebviewMessage(msg: WebviewToHostMessage): Promise<void> {
    if (msg.type === 'ready') {
      if (this.viewMode === 'settings') {
        await this.settingsController.handleMessage(msg);
      }
      return;
    }
    if (this.viewMode === 'settings') {
      await this.settingsController.handleMessage(msg);
      return;
    }
    switch (msg.type) {
      case 'shellReady':
        this.shellReady = true;
        this.roleSwitching = false;
        this.postChatPatch(this.buildFullPatch());
        break;
      case 'send':
        await this.handleSend(msg.text.trim());
        break;
      case 'stopGeneration':
        this.handleStop();
        break;
      case 'undoTurn':
        await this.handleUndoTurn();
        break;
      case 'regenerate':
        await this.handleRegenerate();
        break;
      case 'editResend':
        await this.handleEditResend(msg.messageId, msg.newText);
        break;
      case 'deleteMessage':
        await this.handleDeleteMessage(msg.messageId);
        break;
      case 'openSettings':
        await this.openSettings(msg.section);
        break;
      case 'newChat':
        await this.startNewChat();
        break;
      case 'resizePortraitPane':
        await this.handleResizePortraitPane(msg.height);
        break;
      case 'selectRole':
        await this.switchRole(msg.roleId);
        break;
      case 'dismissHint':
        this.attachHintVisible = false;
        void this.context.globalState.update(ATTACH_HINT_KEY, true);
        this.lines.splice(
          0,
          this.lines.length,
          ...this.lines.filter((l) => !l.dismissible),
        );
        this.postChatPatch({ lines: [...this.lines] });
        break;
      case 'closeSettings':
        await this.closeSettings();
        break;
      default:
        break;
    }
  }

  disposePoll(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
  }

  disposeAll(): void {
    this.disposePoll();
    this.visibilitySub?.dispose();
    this.visibilitySub = undefined;
    this.editorSub?.dispose();
    this.editorSub = undefined;
    if (this.editorDebounceTimer) {
      clearTimeout(this.editorDebounceTimer);
      this.editorDebounceTimer = undefined;
    }
    if (this.resizeDebounceTimer) {
      clearTimeout(this.resizeDebounceTimer);
      this.resizeDebounceTimer = undefined;
    }
    this.settingsPanel?.dispose();
    this.settingsPanel = undefined;
  }

  async openSettings(section?: SettingsSection): Promise<void> {
    const cfg = vscode.workspace.getConfiguration('oclive');
    const placement = cfg.get<string>('settings.placement') ?? 'sidebar';
    if (placement === 'editor-beside') {
      await this.openSettingsBeside(section);
      return;
    }
    if (section) {
      this.settingsController.setInitialSection(section);
    }
    this.viewMode = 'settings';
    this.postToWebview({ type: 'view', view: 'settings', initialSection: section });
    await this.settingsController.pushState();
  }

  async closeSettings(): Promise<void> {
    if (this.settingsPanel) {
      this.settingsPanel.dispose();
      this.settingsPanel = undefined;
      return;
    }
    this.roleSwitching = false;
    this.viewMode = 'chat';
    this.postToWebview({ type: 'view', view: 'chat' });
    this.postChatPatch(this.buildFullPatch());
  }

  async onSettingsLayoutChanged(): Promise<void> {
    if (this.viewMode === 'chat') {
      this.invalidateRoleOptionsCache();
      this.postChatPatch(this.buildFullPatch());
    }
  }

  private async openSettingsBeside(section?: SettingsSection): Promise<void> {
    if (section) {
      this.settingsController.setInitialSection(section);
    }
    if (this.settingsPanel) {
      this.settingsPanel.reveal(vscode.ViewColumn.Beside);
      await this.settingsController.pushState();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'oclive.settingsBeside',
      'OCLive 设置',
      vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: false },
    );
    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };
    panel.webview.html = buildWebviewHtml(this.extensionUri, panel.webview, {
      maxWidthPx: 420,
    });
    panel.webview.onDidReceiveMessage(async (msg) => {
      await this.settingsController.handleMessage(msg as WebviewToHostMessage);
    });
    panel.onDidDispose(() => {
      this.settingsPanel = undefined;
      this.settingsController.bindPostMessage((m) => {
        void this.postToWebview(m);
      });
    });
    this.settingsPanel = panel;
    this.settingsController.bindPostMessage((m) => {
      void panel.webview.postMessage(m);
    });
    void panel.webview.postMessage({ type: 'view', view: 'settings', initialSection: section });
    await this.settingsController.pushState();
  }

  async refreshStatusContext(): Promise<void> {
    await this.refreshIdentityLabel();
    if (this.viewMode === 'chat') {
      this.postChatPatch(this.buildFullPatch());
    }
  }

  async refreshLlmContext(): Promise<void> {
    const config = getEffectiveConfig();
    if (!config.rolesDir) {
      this.llmSummary = '';
      return;
    }
    try {
      const roleId = this.currentRoleIdFromConfig();
      const sessionId = this.context.globalState.get<string>(SESSION_KEY);
      const llm = await this.kernel.getLlmUserSettings(roleId, sessionId, config);
      if (!llm) {
        this.llmSummary = '未读取';
        return;
      }
      const model = llm.effectiveModel?.trim() || '未配置';
      const reach =
        llm.provider === 'cloud'
          ? '云端'
          : llm.ollamaReachable
            ? 'Ollama 可达'
            : 'Ollama 不可达';
      this.llmSummary = `${model} · ${reach}`;
    } catch {
      this.llmSummary = '';
    }
    if (this.viewMode === 'chat') {
      this.postChatPatch({ llmSummary: this.llmSummary });
    }
  }

  private restartRoleSnapshotPoll(): void {
    this.pollIntervalMs = this.webviewVisible
      ? POLL_INTERVAL_VISIBLE_MS
      : POLL_INTERVAL_HIDDEN_MS;
    this.startRoleSnapshotPoll();
  }

  private startRoleSnapshotPoll(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
    }
    if (!this.webviewVisible && !this.view) {
      return;
    }
    this.pollTimer = setInterval(() => {
      void this.pollRoleSnapshot();
    }, this.pollIntervalMs);
  }

  private startEditorContextWatch(): void {
    this.editorSub?.dispose();
    this.editorSub = vscode.window.onDidChangeActiveTextEditor(() => {
      if (this.editorDebounceTimer) {
        clearTimeout(this.editorDebounceTimer);
      }
      this.editorDebounceTimer = setTimeout(() => {
        this.updateEditorChip();
        if (this.viewMode === 'chat') {
          this.postChatPatch({ editorChip: this.editorChip });
        }
      }, EDITOR_DEBOUNCE_MS);
    });
  }

  private updateEditorChip(): void {
    const config = getEffectiveConfig();
    if (!config.includeEditorContext) {
      this.editorChip = '';
      return;
    }
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      this.editorChip = '';
      return;
    }
    const rel = vscode.workspace.asRelativePath(editor.document.uri);
    const lang = editor.document.languageId;
    const sel = editor.selection;
    if (!sel.isEmpty) {
      this.editorChip = `${rel} · ${lang} · 选区`;
    } else {
      this.editorChip = `${rel} · ${lang}`;
    }
  }

  private async pollRoleSnapshot(): Promise<void> {
    if (this.pollBusy || this.sending || this.viewMode !== 'chat') {
      return;
    }
    const config = getEffectiveConfig();
    if (!config.rolesDir) {
      return;
    }
    this.pollBusy = true;
    try {
      const pack = rolePackPath(config);
      const roleId = path.basename(pack);
      const snap = await this.kernel.fetchRoleSnapshot(roleId, SCENE_ID, config);
      if (!snap) {
        return;
      }
      const emotion = snap.portrait_emotion || snap.current_emotion || 'neutral';
      if (emotion !== this.portraitEmotion) {
        this.refreshPortraitForCurrentRole(emotion);
        this.postChatPatch({
          portraitSrc: this.portraitWebviewSrc,
          portraitEmoji: this.portraitEmoji,
          emotion: this.portraitEmotion,
        });
      }
    } finally {
      this.pollBusy = false;
    }
  }

  async openAndFocus(): Promise<void> {
    await vscode.commands.executeCommand('oclive.chatView.focus');
  }

  async reloadRolePack(): Promise<void> {
    const sid = crypto.randomUUID();
    void this.context.globalState.update(SESSION_KEY, sid);
    this.lines.length = 0;
    this.welcomed = false;
    this.invalidateRoleOptionsCache();
    await this.bootstrap();
  }

  async switchRole(roleId: string): Promise<{ ok: boolean; message: string }> {
    const trimmed = roleId?.trim();
    if (!trimmed) {
      return { ok: false, message: '无效的角色 ID' };
    }

    if (this.switchRoleInFlight) {
      return { ok: false, message: '正在切换角色，请稍候' };
    }

    const cfg = vscode.workspace.getConfiguration('oclive');
    const eff = getEffectiveConfig();
    if (!eff.rolesDir) {
      return { ok: false, message: '请先配置 rolesDir（命令：OCLive: Setup）' };
    }

    const allowlist = cfg.get<string[]>('roleAllowlist');
    const validIds = this.roleOptionsFromConfig().map((o) => o.id);
    if (!validIds.includes(trimmed)) {
      return { ok: false, message: `角色 ${trimmed} 不在可用列表中` };
    }

    const prev = cfg.get<string>('roleId');
    if (prev === trimmed) {
      const name = readRoleDisplayName(path.join(eff.rolesDir, trimmed));
      return { ok: true, message: `当前已是 ${name}` };
    }

    this.switchRoleInFlight = true;
    const showChatLoading = this.viewMode === 'chat' && this.shellReady;
    if (showChatLoading) {
      this.roleSwitching = true;
      this.postChatPatch({ roleSwitching: true });
    }

    let loaded = false;
    let name = trimmed;
    try {
      try {
        await cfg.update('roleId', trimmed, vscode.ConfigurationTarget.Global);
        this.invalidateRoleOptionsCache();
        const effAfter = getEffectiveConfig();
        loaded = await this.kernel.loadRole(trimmed, effAfter);
        await this.reloadRolePack();
        name = readRoleDisplayName(rolePackPath(getEffectiveConfig()));
      } finally {
        this.roleSwitching = false;
        if (this.viewMode === 'chat' && this.shellReady) {
          this.postChatPatch({
            roleSwitching: false,
            roleOptions: this.roleOptionsFromConfig(),
            currentRoleId: this.currentRoleIdFromConfig(),
            roleName: this.roleName || '角色',
          });
        }
      }

      const message = loaded
        ? `已切换至 ${name}`
        : `已切换至 ${name}，但内核未确认加载`;

      if (this.viewMode === 'chat' && this.shellReady) {
        const systemLine: ChatLine = { role: 'system', text: message };
        this.lines.push(systemLine);
        this.postChatPatch({ appendLines: [systemLine] });
      }

      this.statusBar.setRoleContext(undefined);
      emitSettingsChanged();
      // Only rebuild the (expensive) settings snapshot when a settings surface
      // is actually open. From the chat dropdown this would otherwise run a full
      // kernel round-trip for no visible reason.
      if (this.viewMode === 'settings' || this.settingsPanel) {
        await this.settingsController.pushState();
      }

      void this.maybeWarmupModel();

      return { ok: loaded, message };
    } finally {
      // Keep the guard held across the whole operation (incl. pushState) so a
      // rapid second click is rejected instead of starting an overlapping switch.
      this.switchRoleInFlight = false;
    }
  }

  private invalidateRoleOptionsCache(): void {
    this.roleOptionsCache = null;
    this.roleOptionsCacheKey = '';
  }

  private roleOptionsFromConfig(): RoleOption[] {
    const config = getEffectiveConfig();
    if (!config.rolesDir) {
      return [];
    }
    const cfg = vscode.workspace.getConfiguration('oclive');
    const allowlist = cfg.get<string[]>('roleAllowlist');
    const key = `${config.rolesDir}|${(allowlist ?? []).join(',')}`;
    if (this.roleOptionsCache && this.roleOptionsCacheKey === key) {
      return this.roleOptionsCache;
    }
    const options = listRoleOptions(config.rolesDir, allowlist);
    this.roleOptionsCache = options;
    this.roleOptionsCacheKey = key;
    return options;
  }

  private currentRoleIdFromConfig(): string {
    return getEffectiveConfig().roleId;
  }

  private async startNewChat(): Promise<void> {
    const sid = crypto.randomUUID();
    void this.context.globalState.update(SESSION_KEY, sid);
    this.lines.length = 0;
    this.welcomed = false;
    const config = getEffectiveConfig();
    if (config.rolesDir) {
      const pack = rolePackPath(config);
      const welcome = readSceneWelcome(pack, SCENE_ID);
      if (welcome) {
        this.lines.push({ role: 'assistant', text: welcome });
        this.welcomed = true;
      }
    }
    this.postChatPatch({ lines: [...this.lines] });
  }

  private updateWebviewRoots(): void {
    if (!this.view) {
      return;
    }
    const roots = [this.extensionUri];
    const config = getEffectiveConfig();
    if (config.rolesDir) {
      roots.push(vscode.Uri.file(config.rolesDir));
      roots.push(vscode.Uri.file(rolePackPath(config)));
    }
    this.view.webview.options = {
      enableScripts: true,
      localResourceRoots: roots,
    };
  }

  private refreshPortraitForCurrentRole(emotion?: string): void {
    const config = getEffectiveConfig();
    if (!config.rolesDir) {
      return;
    }
    this.updateWebviewRoots();
    const pack = rolePackPath(config);
    this.setPortraitEmotion(emotion ?? this.portraitEmotion, pack);
  }

  private async bootstrap(): Promise<void> {
    const config = getEffectiveConfig();
    if (config.rolesDir) {
      const pack = rolePackPath(config);
      this.roleName = readRoleDisplayName(pack);
      this.refreshPortraitForCurrentRole('neutral');
    }
    await this.refreshKernelStatus();
    await this.loadChatHistory();
    void this.maybeWarmupModel();
    if (!this.welcomed && config.rolesDir) {
      const pack = rolePackPath(config);
      const welcome = readSceneWelcome(pack, SCENE_ID);
      if (welcome && !this.lines.some((l) => l.role === 'assistant' || l.role === 'user')) {
        this.lines.push({ role: 'assistant', text: welcome });
        this.welcomed = true;
      }
    }
    await this.refreshIdentityLabel();
    this.updateEditorChip();
    if (this.shellReady) {
      this.postChatPatch(this.buildFullPatch());
    }
  }

  private async loadChatHistory(): Promise<void> {
    const config = getEffectiveConfig();
    if (!config.rolesDir) {
      return;
    }
    try {
      await this.kernel.ensureReady(config);
      const pack = rolePackPath(config);
      const roleId = path.basename(pack);
      let sid = this.sessionId();
      let messages = await this.kernel.fetchChatMessages(sid, config);
      if (!messages.length) {
        const sessions = await this.kernel.listChatSessions(roleId, SCENE_ID, config);
        const matched = sessions.find((s) => s.session_id === sid);
        const picked =
          matched ??
          [...sessions].sort(
            (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
          )[0];
        if (picked && picked.session_id !== sid) {
          sid = picked.session_id;
          void this.context.globalState.update(SESSION_KEY, sid);
        }
        if (picked) {
          messages = await this.kernel.fetchChatMessages(sid, config);
        }
      }
      if (messages.length) {
        this.lines.length = 0;
        for (const msg of messages) {
          this.lines.push(storedMessageToLine(msg));
        }
        this.welcomed = true;
      }
    } catch {
      /* best-effort */
    }
  }

  private async refreshIdentityLabel(): Promise<void> {
    const config = getEffectiveConfig();
    if (!config.rolesDir) {
      this.identityLabel = '';
      this.statusBar.setRoleContext(undefined);
      return;
    }
    try {
      const pack = rolePackPath(config);
      const roleId = path.basename(pack);
      const state = await this.kernel.getUserIdentityState(roleId, SCENE_ID, config);
      const info = await this.kernel.fetchRoleInfo(roleId, config);
      const parts: string[] = [];
      if (!state?.identities?.length) {
        this.identityLabel = '';
      } else if (state.use_manifest_default) {
        const name =
          state.identities.find((i) => i.id === state.default_identity_id)?.display_name ??
          state.default_identity_id;
        this.identityLabel = name;
        parts.push(`身份 ${name}`);
      } else {
        const cur = state.identities.find((i) => i.id === state.current_identity_id);
        const label = cur?.display_name ?? state.current_identity_id;
        this.identityLabel = label;
        parts.push(`身份 ${label}`);
      }
      if (info?.reply_post_processor_enabled) {
        const backend = info.reply_post_processor_backend ?? 'builtin';
        const profile = info.reply_post_processor_profile ?? '—';
        parts.push(`后处理 ${backend}·${profile}`);
      } else if (info) {
        parts.push('后处理 off');
      }
      this.statusBar.setRoleContext(parts.length ? parts.join(' · ') : undefined);
    } catch {
      this.identityLabel = '';
      this.statusBar.setRoleContext(undefined);
    }
  }

  private sessionId(): string {
    let sid = this.context.globalState.get<string>(SESSION_KEY);
    if (!sid) {
      sid = crypto.randomUUID();
      void this.context.globalState.update(SESSION_KEY, sid);
    }
    return sid;
  }

  private setPortraitEmotion(emotion: string, rolePackDir: string): void {
    const key = normalizeEmotionKey(emotion);
    this.portraitEmotion = key;
    this.portraitEmoji = emotionEmoji(key);
    const imgPath = resolveEmotionImagePath(rolePackDir, key);
    if (imgPath && this.view) {
      const uri = vscode.Uri.file(imgPath);
      this.portraitWebviewSrc = this.view.webview.asWebviewUri(uri).toString();
    } else {
      this.portraitWebviewSrc = '';
    }
  }

  private updateConnectionSummary(mode: 'attached' | 'spawned' | 'offline'): void {
    if (mode === 'offline') {
      this.connectionSummary = '离线';
      return;
    }
    const config = getEffectiveConfig();
    const modeLabel = mode === 'attached' ? 'attach' : 'spawn';
    const mockTag = config.mockLlm ? ' · mock' : '';
    this.connectionSummary = `${modeLabel}${mockTag}`;
  }

  private maybeShowMockBypassHint(mode: 'attached' | 'spawned' | 'offline'): void {
    const config = getEffectiveConfig();
    if (!config.mockLlm || mode !== 'attached') {
      return;
    }
    const hintText =
      '已开启 oclive.mockLlm，但当前 attach 到桌面内核（非 Mock）。请在设置 → 高级关闭 mock，或退出桌面端后 Reload。';
    if (!this.lines.some((l) => l.dismissible && l.text === hintText)) {
      this.lines.unshift({ role: 'system', text: hintText, dismissible: true });
    }
  }

  private maybeShowAttachHint(mode: 'attached' | 'spawned' | 'offline'): void {
    if (mode !== 'attached') {
      this.attachHintVisible = false;
      return;
    }
    const shown = this.context.globalState.get<boolean>(ATTACH_HINT_KEY);
    if (shown) {
      this.attachHintVisible = false;
      return;
    }
    this.attachHintVisible = true;
    const hintText =
      '当前内核可能由桌面端启动，VS Code 专用能力（简洁 Prompt 等）可能未生效。';
    if (!this.lines.some((l) => l.dismissible && l.text === hintText)) {
      this.lines.unshift({ role: 'system', text: hintText, dismissible: true });
    }
  }

  private async refreshKernelStatus(): Promise<void> {
    const config = getEffectiveConfig();
    try {
      if (!(await ensureSetup(this.context))) {
        this.pushSystem('请先配置 oclive.rolesDir（命令：OCLive: Setup）');
        this.updateConnectionSummary('offline');
        return;
      }
      this.updateWebviewRoots();
      const pack = rolePackPath(config);
      this.roleName = readRoleDisplayName(pack);
      const mode = await this.kernel.ensureReady(config);
      this.statusBar.syncFromClient(config.apiPort, config.extensionPath);
      this.updateConnectionSummary(mode);
      this.maybeShowAttachHint(mode);
      this.maybeShowMockBypassHint(mode);
      await this.refreshLlmContext();
    } catch (e) {
      this.statusBar.syncFromClient(config.apiPort, config.extensionPath);
      this.updateConnectionSummary('offline');
      const msg = e instanceof Error ? e.message : String(e);
      this.pushSystem(`内核未就绪：${msg}`);
    }
  }

  private pushSystem(text: string): void {
    this.lines.push({ role: 'system', text });
  }

  private buildEditorContext(): string {
    const config = getEffectiveConfig();
    if (!config.includeEditorContext) {
      return '';
    }
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return '';
    }
    const doc = editor.document;
    const rel = vscode.workspace.asRelativePath(doc.uri);
    const lang = doc.languageId;
    const sel = editor.selection;
    let block = `[Editor context]\nfile: ${rel}\nlanguage: ${lang}\n`;
    if (!sel.isEmpty) {
      const snippet = doc.getText(sel).trim();
      if (snippet) {
        const clipped = snippet.length > 2000 ? snippet.slice(0, 2000) + '…' : snippet;
        block += `selection:\n${clipped}\n`;
      }
    }
    block += '---\n';
    return block;
  }

  private layoutFromConfig(): { portraitPaneHeight: number; inputMinHeight: number } {
    const cfg = vscode.workspace.getConfiguration('oclive');
    return {
      portraitPaneHeight: resolvePortraitPaneHeight(cfg),
      inputMinHeight: Number(cfg.get('chat.inputMinHeight') ?? 52),
    };
  }

  private async handleResizePortraitPane(height: number): Promise<void> {
    const clamped = clampPortraitPaneHeight(height);
    this.postChatPatch({ portraitPaneHeight: clamped });
    if (this.resizeDebounceTimer) {
      clearTimeout(this.resizeDebounceTimer);
    }
    this.resizeDebounceTimer = setTimeout(() => {
      const cfg = vscode.workspace.getConfiguration('oclive');
      void cfg.update('chat.portraitPaneHeight', clamped, vscode.ConfigurationTarget.Global);
    }, 300);
  }

  private chatConfig(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration('oclive');
  }

  private streamingEnabled(): boolean {
    return this.chatConfig().get<boolean>('chat.streaming') ?? true;
  }

  private metaTemplates(): MetaActionTemplates {
    const config = getEffectiveConfig();
    if (!config.rolesDir) {
      return readMetaActionTemplates('');
    }
    return readMetaActionTemplates(rolePackPath(config));
  }

  private startThinkingTimer(): void {
    this.stopThinkingTimer();
    this.thinkingSeconds = 0;
    this.thinkingTimer = setInterval(() => {
      this.thinkingSeconds += 1;
      this.postChatPatch({ thinkingSeconds: this.thinkingSeconds });
    }, 1000);
  }

  private stopThinkingTimer(): void {
    if (this.thinkingTimer) {
      clearInterval(this.thinkingTimer);
      this.thinkingTimer = undefined;
    }
    this.thinkingSeconds = 0;
  }

  private handleStop(): void {
    if (!this.sending) {
      return;
    }
    this.sendAbort?.abort();
  }

  private async maybeWarmupModel(): Promise<void> {
    const cfg = this.chatConfig();
    if (!(cfg.get<boolean>('chat.warmupModel') ?? true)) {
      return;
    }
    const config = getEffectiveConfig();
    if (!config.rolesDir) {
      return;
    }
    try {
      const roleId = this.currentRoleIdFromConfig();
      const sessionId = this.context.globalState.get<string>(SESSION_KEY);
      const llm = await this.kernel.getLlmUserSettings(roleId, sessionId, config);
      if (!llm || llm.provider !== 'local') {
        return;
      }
      const model = llm.effectiveModel?.trim();
      const base = llm.ollamaBaseUrl?.trim();
      if (!model || !base) {
        return;
      }
      const keepAlive = cfg.get<string>('chat.warmupKeepAlive') ?? '10m';
      void this.kernel.warmupModel(base, model, keepAlive, config);
    } catch {
      /* best-effort */
    }
  }

  private async fetchStoredMessages(): Promise<StoredMessage[]> {
    const config = getEffectiveConfig();
    return this.kernel.fetchChatMessages(this.sessionId(), config);
  }

  private attitudeText(
    key: keyof MetaActionTemplates,
  ): string | undefined {
    const tpl = this.metaTemplates()[key];
    if (!tpl.enabled) {
      return undefined;
    }
    const text = tpl.attitudeText.trim();
    return text.length ? text : undefined;
  }

  private async injectAttitudeAndSend(attitude: string | undefined): Promise<void> {
    if (!attitude) {
      return;
    }
    await this.handleSend(attitude, { skipUserLine: true });
  }

  private async handleUndoTurn(): Promise<void> {
    if (this.sending) {
      return;
    }
    const messages = await this.fetchStoredMessages();
    if (messages.length < 2) {
      return;
    }
    const last = messages[messages.length - 1];
    const prev = messages[messages.length - 2];
    const config = getEffectiveConfig();
    if (!(await this.kernel.deleteMessage(last.id, config))) {
      return;
    }
    if (prev.sender.toLowerCase() === 'user') {
      await this.kernel.deleteMessage(prev.id, config);
    }
    await this.loadChatHistory();
    this.postChatPatch({ lines: [...this.lines] });
    await this.injectAttitudeAndSend(this.attitudeText('undo'));
  }

  private async handleRegenerate(): Promise<void> {
    if (this.sending) {
      return;
    }
    const messages = await this.fetchStoredMessages();
    if (messages.length < 2) {
      return;
    }
    const last = messages[messages.length - 1];
    const prev = messages[messages.length - 2];
    if (prev.sender.toLowerCase() !== 'user') {
      return;
    }
    const userText = prev.content;
    const config = getEffectiveConfig();
    await this.kernel.deleteMessage(last.id, config);
    await this.kernel.deleteMessage(prev.id, config);
    await this.loadChatHistory();
    this.postChatPatch({ lines: [...this.lines] });
    const attitude = this.attitudeText('regenerate');
    const payload = attitude ? `${userText}\n\n${attitude}` : userText;
    await this.handleSend(payload, { skipUserLine: true, displayText: userText });
  }

  private async handleEditResend(messageId: string, newText: string): Promise<void> {
    if (this.sending || !messageId || !newText.trim()) {
      return;
    }
    const messages = await this.fetchStoredMessages();
    const idx = messages.findIndex((m) => m.id === messageId);
    if (idx < 0 || messages[idx].sender.toLowerCase() !== 'user') {
      return;
    }
    const config = getEffectiveConfig();
    for (let i = messages.length - 1; i >= idx; i--) {
      await this.kernel.deleteMessage(messages[i].id, config);
    }
    await this.loadChatHistory();
    this.postChatPatch({ lines: [...this.lines] });
    const attitude = this.attitudeText('edit');
    const payload = attitude ? `${newText.trim()}\n\n${attitude}` : newText.trim();
    await this.handleSend(payload, { skipUserLine: true, displayText: newText.trim() });
  }

  private async handleDeleteMessage(messageId: string): Promise<void> {
    if (this.sending || !messageId) {
      return;
    }
    const config = getEffectiveConfig();
    if (!(await this.kernel.deleteMessage(messageId, config))) {
      return;
    }
    await this.loadChatHistory();
    this.postChatPatch({ lines: [...this.lines] });
    await this.injectAttitudeAndSend(this.attitudeText('delete'));
  }

  private applyChatSuccess(
    result: {
      reply: string;
      sessionId?: string;
      botEmotion?: string;
      portraitEmotion?: string;
      replyIsFallback?: boolean;
      llmFallbackReason?: string;
      userMessageId?: string;
      assistantMessageId?: string;
    },
    config: ReturnType<typeof getEffectiveConfig>,
    userLineIndex: number,
    appended: ChatLine[],
  ): void {
    if (result.sessionId) {
      void this.context.globalState.update(SESSION_KEY, result.sessionId);
    }
    this.statusBar.syncFromClient(config.apiPort, config.extensionPath);
    const emotion = result.portraitEmotion || result.botEmotion || 'neutral';
    this.refreshPortraitForCurrentRole(emotion);
    const userLine = this.lines[userLineIndex];
    if (userLine && result.userMessageId) {
      userLine.id = result.userMessageId;
    }
    const assistantLine: ChatLine = {
      role: 'assistant',
      text: result.reply,
      id: result.assistantMessageId,
    };
    this.lines.push(assistantLine);
    appended.push(assistantLine);
    if (result.replyIsFallback) {
      const reason = result.llmFallbackReason?.trim();
      const hint = reason
        ? `模型未连通（${reason}）。请在设置 → 模型中检查 Ollama / 云端配置。`
        : '模型未连通，当前为应急回复。请在设置 → 模型中检查配置。';
      const hintLine: ChatLine = { role: 'system', text: hint, dismissible: true };
      this.lines.push(hintLine);
      appended.push(hintLine);
    }
  }

  private async handleSend(
    userText: string,
    opts?: { skipUserLine?: boolean; displayText?: string },
  ): Promise<void> {
    if (!userText || this.sending) {
      return;
    }

    const config = getEffectiveConfig();
    if (!(await ensureSetup(this.context))) {
      return;
    }

    const pack = rolePackPath(config);
    const prefix = opts?.skipUserLine ? '' : this.buildEditorContext();
    const payload = prefix ? prefix + userText : userText;
    const visibleText = opts?.displayText ?? userText;

    let userLineIndex = -1;
    if (!opts?.skipUserLine) {
      const userLine: ChatLine = { role: 'user', text: visibleText };
      this.lines.push(userLine);
      userLineIndex = this.lines.length - 1;
    } else {
      const userLine: ChatLine = { role: 'user', text: visibleText };
      this.lines.push(userLine);
      userLineIndex = this.lines.length - 1;
    }

    this.sendAbort = new AbortController();
    this.sending = true;
    this.startThinkingTimer();
    this.postChatPatch({
      appendLines: [this.lines[userLineIndex]],
      sending: true,
      streamingReply: null,
      thinkingSeconds: 0,
    });

    const appended: ChatLine[] = [];
    let streamBuf = '';
    const useStream = this.streamingEnabled();

    try {
      const baseReq = {
        rolePath: pack,
        message: payload,
        sessionId: this.sessionId(),
        sceneId: SCENE_ID,
        signal: this.sendAbort.signal,
      };

      const result = useStream
        ? await this.kernel.chatStream(baseReq, {
            signal: this.sendAbort.signal,
            onToken: (token) => {
              streamBuf += token;
              this.postChatPatch({
                streamingReply: streamBuf,
                thinkingSeconds: this.thinkingSeconds,
              });
            },
          })
        : await this.kernel.chat(baseReq);

      if (!result.ok) {
        if (result.code === 'ABORTED' || result.status === 499) {
          const stopLine: ChatLine = { role: 'system', text: '已停止生成。' };
          this.lines.push(stopLine);
          appended.push(stopLine);
        } else {
          if (result.status >= 500) {
            this.kernel.invalidateEnsureReady();
          }
          const errLine: ChatLine = {
            role: 'system',
            text: `错误${result.code ? ` [${result.code}]` : ''}：${result.message}`,
          };
          this.lines.push(errLine);
          appended.push(errLine);
        }
      } else {
        this.applyChatSuccess(result, config, userLineIndex, appended);
      }
    } catch (e) {
      if (this.sendAbort.signal.aborted) {
        const stopLine: ChatLine = { role: 'system', text: '已停止生成。' };
        this.lines.push(stopLine);
        appended.push(stopLine);
      } else {
        this.kernel.invalidateEnsureReady();
        const msg = e instanceof Error ? e.message : String(e);
        const errLine: ChatLine = { role: 'system', text: `错误：${msg}` };
        this.lines.push(errLine);
        appended.push(errLine);
      }
    } finally {
      this.sendAbort = undefined;
      this.sending = false;
      this.stopThinkingTimer();
      this.postChatPatch({
        appendLines: appended.length ? appended : undefined,
        sending: false,
        streamingReply: null,
        thinkingSeconds: undefined,
        portraitSrc: this.portraitWebviewSrc,
        portraitEmoji: this.portraitEmoji,
        emotion: this.portraitEmotion,
      });
    }
  }

  private buildFullPatch(): ChatPatchPayload {
    const layout = this.layoutFromConfig();
    return {
      roleName: this.roleName || '角色',
      roleOptions: this.roleOptionsFromConfig(),
      currentRoleId: this.currentRoleIdFromConfig(),
      roleSwitching: this.roleSwitching,
      portraitSrc: this.portraitWebviewSrc,
      portraitEmoji: this.portraitEmoji,
      portraitPaneHeight: layout.portraitPaneHeight,
      emotion: this.portraitEmotion,
      identityLabel: this.identityLabel,
      connectionSummary: this.connectionSummary,
      llmSummary: this.llmSummary,
      editorChip: this.editorChip,
      sending: this.sending,
      inputMinHeight: layout.inputMinHeight,
      lines: [...this.lines],
    };
  }

  private postChatPatch(patch: Partial<ChatPatchPayload>): void {
    if (!this.view || this.viewMode !== 'chat' || !this.shellReady) {
      return;
    }
    this.postToWebview({ type: 'chatPatch', payload: patch });
  }

  private postToWebview(msg: HostToWebviewMessage): void {
    void this.view?.webview.postMessage(msg);
    void this.settingsPanel?.webview.postMessage(msg);
  }

  private ensureWebviewHtml(): void {
    if (!this.view || this.htmlLoaded) {
      return;
    }
    this.view.webview.html = buildWebviewHtml(this.extensionUri, this.view.webview);
    this.htmlLoaded = true;
    this.postToWebview({ type: 'view', view: 'chat' });
  }
}
