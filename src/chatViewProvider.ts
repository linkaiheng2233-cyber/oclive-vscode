import * as vscode from 'vscode';
import * as path from 'path';
import { emotionEmoji, normalizeEmotionKey } from './emotionAssets';
import { rolePackPath } from './config';
import { getEffectiveConfig } from './runtimeConfig';
import { getSharedAppDataHint, KernelClient, type StoredMessage } from './kernelClient';
import {
  listRoleOptions,
  readRoleDisplayName,
  readSceneWelcome,
  resolveEmotionImagePath,
  type RoleOption,
} from './rolePack';
import { emitSettingsChanged } from './settingsEvents';
import { ensureSetup } from './setup';
import { KernelStatusBar } from './statusBar';
import type { SettingsController } from './settingsViewProvider';
import type { SettingsSection } from './webviewProtocol';
import { buildSettingsWebviewHtml } from './webviewHtml';
import {
  clampPortraitPaneHeight,
  PORTRAIT_PANE_HEIGHT_DEFAULT,
  resolvePortraitPaneHeight,
} from './chatLayoutConfig';

const SCENE_ID = 'vscode';
const SESSION_KEY = 'oclive.sessionId';
const ATTACH_HINT_KEY = 'oclive.attachHintShown';
const POLL_INTERVAL_MS = 15000;
const EDITOR_DEBOUNCE_MS = 280;

interface ChatLine {
  role: 'user' | 'assistant' | 'system';
  text: string;
  dismissible?: boolean;
}

interface ChatPatchPayload {
  type: 'patch';
  roleName?: string;
  roleOptions?: RoleOption[];
  currentRoleId?: string;
  roleSwitching?: boolean;
  portraitSrc?: string;
  portraitEmoji?: string;
  portraitPaneHeight?: number;
  emotion?: string;
  identityLabel?: string;
  connectionSummary?: string;
  llmSummary?: string;
  editorChip?: string;
  sending?: boolean;
  inputMinHeight?: number;
  lines?: ChatLine[];
}

function storedMessageToLine(msg: StoredMessage): ChatLine {
  const sender = msg.sender.toLowerCase();
  const role: ChatLine['role']
    = sender === 'user' ? 'user' : sender === 'assistant' ? 'assistant' : 'system';
  return { role, text: msg.content };
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
  private connectionSummary = '';
  private llmSummary = '';
  private attachHintVisible = false;
  private editorChip = '';
  private shellReady = false;
  private viewMode: 'chat' | 'settings' = 'chat';
  private editorDebounceTimer: ReturnType<typeof setTimeout> | undefined;
  private resizeDebounceTimer: ReturnType<typeof setTimeout> | undefined;
  private editorSub?: vscode.Disposable;

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
      void this.view?.webview.postMessage(msg);
    });
    this.updateWebviewRoots();

    webviewView.webview.onDidReceiveMessage(async (msg: {
      type: string;
      text?: string;
      height?: number;
      roleId?: string;
    }) => {
      if (this.viewMode === 'settings') {
        await this.settingsController.handleMessage(msg as Parameters<SettingsController['handleMessage']>[0]);
        return;
      }
      if (msg.type === 'shellReady') {
        this.shellReady = true;
        // 避免 settings→chat 切换时 shellReady 早于 switchRole 结束而带上 stale switching。
        this.roleSwitching = false;
        this.postPatch(this.buildFullPatch());
        return;
      }
      if (msg.type === 'send' && typeof msg.text === 'string') {
        await this.handleSend(msg.text.trim());
      }
      if (msg.type === 'selectIdentity') {
        await this.openSettings('identity');
      }
      if (msg.type === 'openSettings') {
        await this.openSettings();
      }
      if (msg.type === 'newChat') {
        await this.startNewChat();
      }
      if (msg.type === 'resizePortraitPane' && typeof msg.height === 'number') {
        await this.handleResizePortraitPane(msg.height);
      }
      if (msg.type === 'selectRole' && typeof msg.roleId === 'string') {
        await this.switchRole(msg.roleId);
      }
      if (msg.type === 'dismissAttachHint') {
        this.attachHintVisible = false;
        void this.context.globalState.update(ATTACH_HINT_KEY, true);
        this.postPatch({ lines: [...this.lines] });
      }
    });

    this.startEditorContextWatch();
    void this.bootstrap();
    this.startRoleSnapshotPoll();
  }

  disposePoll(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
  }

  disposeAll(): void {
    this.disposePoll();
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
    this.shellReady = false;
    await this.loadSettingsContent();
    await this.settingsController.pushState();
  }

  async closeSettings(): Promise<void> {
    if (this.settingsPanel) {
      this.settingsPanel.dispose();
      this.settingsPanel = undefined;
      return;
    }
    // Settings 内切换角色时 host 可能仍标记 switching；回到 Chat 必须解除禁用。
    this.roleSwitching = false;
    this.viewMode = 'chat';
    this.shellReady = false;
    await this.ensureShell();
    this.postPatch(this.buildFullPatch());
  }

  async onSettingsLayoutChanged(): Promise<void> {
    if (this.viewMode === 'chat') {
      this.postPatch(this.buildFullPatch());
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
      { enableScripts: true, retainContextWhenHidden: true },
    );
    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };
    panel.webview.html = buildSettingsWebviewHtml(this.extensionUri, panel.webview, {
      maxWidthPx: 420,
    });
    panel.webview.onDidReceiveMessage(async (msg) => {
      await this.settingsController.handleMessage(msg);
    });
    panel.onDidDispose(() => {
      this.settingsPanel = undefined;
      this.settingsController.bindPostMessage((m) => {
        void this.view?.webview.postMessage(m);
      });
    });
    this.settingsPanel = panel;
    this.settingsController.bindPostMessage((m) => {
      void panel.webview.postMessage(m);
    });
    await this.settingsController.pushState();
  }

  private async loadSettingsContent(): Promise<void> {
    if (!this.view) {
      return;
    }
    this.view.webview.html = buildSettingsWebviewHtml(this.extensionUri, this.view.webview);
  }

  async refreshStatusContext(): Promise<void> {
    await this.refreshIdentityLabel();
    this.postPatch(this.buildFullPatch());
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
        this.llmSummary = '模型：未读取';
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
      this.postPatch({ llmSummary: this.llmSummary });
    }
  }

  private startRoleSnapshotPoll(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
    }
    this.pollTimer = setInterval(() => {
      void this.pollRoleSnapshot();
    }, POLL_INTERVAL_MS);
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
          this.postPatch({ editorChip: this.editorChip });
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
        this.postPatch({
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
    await this.bootstrap();
  }

  /** SSOT: cfg roleId + kernel loadRole + new session + reload role pack UI. */
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
    const validIds = listRoleOptions(eff.rolesDir, allowlist).map((o) => o.id);
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
      this.postPatch({ roleSwitching: true });
    }

    let loaded = false;
    let name = trimmed;
    try {
      await cfg.update('roleId', trimmed, vscode.ConfigurationTarget.Global);
      const effAfter = getEffectiveConfig();
      loaded = await this.kernel.loadRole(trimmed, effAfter);
      await this.reloadRolePack();
      name = readRoleDisplayName(rolePackPath(getEffectiveConfig()));
    } finally {
      this.switchRoleInFlight = false;
      this.roleSwitching = false;
      if (this.viewMode === 'chat' && this.shellReady) {
        this.postPatch({
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
      this.lines.push({ role: 'system', text: message });
      this.postPatch(this.buildFullPatch());
    }

    this.statusBar.setRoleContext(undefined);
    emitSettingsChanged();
    await this.settingsController.pushState();

    return { ok: loaded, message };
  }

  private roleOptionsFromConfig(): RoleOption[] {
    const config = getEffectiveConfig();
    if (!config.rolesDir) {
      return [];
    }
    const cfg = vscode.workspace.getConfiguration('oclive');
    return listRoleOptions(config.rolesDir, cfg.get<string[]>('roleAllowlist'));
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
    this.postPatch({ lines: [...this.lines] });
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
    await this.ensureShell();
    this.postPatch(this.buildFullPatch());
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
      this.connectionSummary = '';
      return;
    }
    const config = getEffectiveConfig();
    const modeLabel = mode === 'attached' ? 'attach' : 'spawn';
    const mockTag = config.mockLlm ? ' · mock' : '';
    this.connectionSummary = `${modeLabel}${mockTag} · ${getSharedAppDataHint()}`;
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
    this.postPatch({ portraitPaneHeight: clamped });
    if (this.resizeDebounceTimer) {
      clearTimeout(this.resizeDebounceTimer);
    }
    this.resizeDebounceTimer = setTimeout(() => {
      const cfg = vscode.workspace.getConfiguration('oclive');
      void cfg.update('chat.portraitPaneHeight', clamped, vscode.ConfigurationTarget.Global);
    }, 300);
  }

  private async handleSend(userText: string): Promise<void> {
    if (!userText || this.sending) {
      return;
    }

    const config = getEffectiveConfig();
    if (!(await ensureSetup(this.context))) {
      return;
    }

    const pack = rolePackPath(config);
    const prefix = this.buildEditorContext();
    const payload = prefix ? prefix + userText : userText;

    this.lines.push({ role: 'user', text: userText });
    this.sending = true;
    this.postPatch({ lines: [...this.lines], sending: true });

    try {
      const result = await this.kernel.chat({
        rolePath: pack,
        message: payload,
        sessionId: this.sessionId(),
        sceneId: SCENE_ID,
      });

      if (!result.ok) {
        this.lines.push({
          role: 'system',
          text: `错误${result.code ? ` [${result.code}]` : ''}：${result.message}`,
        });
      } else {
        if (result.sessionId) {
          void this.context.globalState.update(SESSION_KEY, result.sessionId);
        }
        this.statusBar.syncFromClient(config.apiPort, config.extensionPath);
        const emotion = result.portraitEmotion || result.botEmotion || 'neutral';
        this.refreshPortraitForCurrentRole(emotion);
        this.lines.push({ role: 'assistant', text: result.reply });
        if (result.replyIsFallback) {
          const reason = result.llmFallbackReason?.trim();
          const hint = reason
            ? `模型未连通（${reason}）。请在设置 → 模型中检查 Ollama / 云端配置。`
            : '模型未连通，当前为应急回复。请在设置 → 模型中检查配置。';
          this.lines.push({ role: 'system', text: hint, dismissible: true });
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.lines.push({ role: 'system', text: `错误：${msg}` });
    } finally {
      this.sending = false;
      this.postPatch({
        lines: [...this.lines],
        sending: false,
        portraitSrc: this.portraitWebviewSrc,
        portraitEmoji: this.portraitEmoji,
        emotion: this.portraitEmotion,
      });
    }
  }

  private buildFullPatch(): ChatPatchPayload {
    const layout = this.layoutFromConfig();
    return {
      type: 'patch',
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

  private postPatch(patch: Partial<ChatPatchPayload>): void {
    if (!this.view || this.viewMode !== 'chat' || !this.shellReady) {
      return;
    }
    void this.view.webview.postMessage({ type: 'patch', ...patch });
  }

  private async ensureShell(): Promise<void> {
    if (!this.view || this.viewMode !== 'chat') {
      return;
    }
    if (this.shellReady) {
      return;
    }
    this.view.webview.html = this.getShellHtml();
  }

  private getShellHtml(): string {
    const csp = `default-src 'none'; img-src ${this.view?.webview.cspSource} https:; style-src 'unsafe-inline'; script-src 'unsafe-inline';`;
    const defaultPaneHeight = PORTRAIT_PANE_HEIGHT_DEFAULT;
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      margin: 0; padding: 0;
      display: flex; flex-direction: column;
      height: 100vh;
    }
    #action-bar {
      flex-shrink: 0;
      display: flex; align-items: center; gap: 6px;
      padding: 4px 8px;
      min-height: 40px;
      border-bottom: 1px solid var(--vscode-widget-border, #444);
    }
    #action-bar .role-select {
      flex: 1;
      min-width: 0;
      min-height: 28px;
      padding: 2px 10px;
      border-radius: 12px;
      border: 1px solid var(--vscode-widget-border, #555);
      background: var(--vscode-sideBar-background);
      color: var(--vscode-foreground);
      font-size: 0.85em;
      font-weight: 600;
      font-family: inherit;
      cursor: pointer;
    }
    #action-bar .role-select:hover:not(:disabled) {
      background: var(--vscode-toolbar-hoverBackground, rgba(255,255,255,0.06));
    }
    #action-bar .role-select:focus-visible {
      outline: 1px solid var(--vscode-focusBorder);
      outline-offset: 1px;
    }
    #action-bar .role-select:disabled {
      opacity: 0.6;
      cursor: wait;
    }
    .btn {
      flex-shrink: 0;
      display: inline-flex; align-items: center; gap: 4px;
      min-height: 28px;
      padding: 4px 10px;
      border-radius: 3px;
      font-size: 0.85em;
      font-family: inherit;
      cursor: pointer;
      white-space: nowrap;
    }
    .btn:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 1px; }
    .btn-primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
    }
    .btn-primary:hover { background: var(--vscode-button-hoverBackground); }
    .btn-secondary {
      background: transparent;
      color: var(--vscode-foreground);
      border: 1px solid var(--vscode-button-border, var(--vscode-widget-border, #555));
    }
    .btn-secondary:hover {
      background: var(--vscode-toolbar-hoverBackground, rgba(255,255,255,0.06));
    }
    #portrait-pane {
      flex-shrink: 0;
      height: ${defaultPaneHeight}px;
      display: flex; flex-direction: column; align-items: center;
      padding: 8px 10px 6px;
      background: var(--vscode-editor-background, var(--vscode-sideBar-background));
      border-bottom: 1px solid var(--vscode-widget-border, #444);
      overflow: hidden;
    }
    #portrait-frame {
      flex: 1; min-height: 0; width: 100%;
      display: flex; align-items: center; justify-content: center;
    }
    #portrait-frame img {
      display: block;
      max-width: 100%;
      max-height: 100%;
      width: auto; height: auto;
      object-fit: contain;
      object-position: center bottom;
      animation: avatarFadeIn 180ms ease-out;
    }
    #portrait-fallback {
      display: flex; align-items: center; justify-content: center;
      min-height: 64px;
      font-size: 56px; line-height: 1;
    }
    #portrait-meta {
      flex-shrink: 0;
      display: flex; flex-direction: column; align-items: center;
      gap: 2px;
      padding-top: 4px;
      max-width: 100%;
    }
    #portrait-meta .meta-name {
      font-weight: 600;
      font-size: 0.9em;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 100%;
    }
    #portrait-meta .emotion-line {
      display: flex; align-items: center; gap: 6px;
      font-size: 0.8em;
      opacity: 0.85;
    }
    #portrait-meta .emotion-emoji { font-size: 1.1em; line-height: 1; }
    #splitter {
      flex-shrink: 0;
      height: 5px;
      cursor: row-resize;
      background: var(--vscode-widget-border, #444);
      touch-action: none;
      user-select: none;
    }
    #splitter:hover, #splitter.dragging {
      background: var(--vscode-focusBorder, #007fd4);
    }
    #meta-row {
      flex-shrink: 0;
      padding: 2px 8px 4px;
      font-size: 0.7em;
      opacity: 0.65;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    #meta-row a { color: inherit; cursor: pointer; text-decoration: underline; }
    #log {
      flex: 1;
      min-height: 120px;
      overflow-y: auto;
      padding: 8px;
    }
    .msg {
      padding: 6px 8px; margin-bottom: 6px;
      border-radius: 4px;
      white-space: pre-wrap; word-break: break-word;
      font-size: 0.92em;
    }
    .user { background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border); }
    .assistant {
      background: transparent;
      border-left: 2px solid var(--vscode-textLink-foreground, #3794ff);
      padding-left: 10px;
    }
    .system { opacity: 0.75; font-size: 0.85em; font-style: italic; }
    .dismiss-hint { margin-left: 8px; font-size: inherit; cursor: pointer; background: none; border: none; color: inherit; padding: 0; }
    .sending { padding: 4px 8px; font-size: 0.85em; opacity: 0.7; }
    #footer {
      flex-shrink: 0;
      padding: 8px;
      border-top: 1px solid var(--vscode-widget-border, #444);
    }
    #row { display: flex; gap: 6px; }
    textarea {
      flex: 1;
      min-height: 52px; max-height: 160px;
      resize: vertical;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      border-radius: 4px;
      padding: 6px;
      font-family: inherit; font-size: 0.92em;
    }
    #send {
      align-self: flex-end;
      padding: 6px 12px;
      cursor: pointer;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none; border-radius: 3px;
    }
    #send:disabled { opacity: 0.5; cursor: default; }
    @keyframes avatarFadeIn {
      from { opacity: 0; transform: scale(0.985); }
      to { opacity: 1; transform: scale(1); }
    }
  </style>
</head>
<body>
  <div id="action-bar">
    <button type="button" class="btn btn-primary" id="new-chat" title="新对话"><span aria-hidden="true">＋</span> 新对话</button>
    <select id="role-select" class="role-select" title="切换角色"></select>
    <button type="button" class="btn btn-secondary" id="settings-btn" title="设置"><span aria-hidden="true">⚙</span> 设置</button>
  </div>
  <div id="portrait-pane">
    <div id="portrait-frame"><span id="portrait-fallback">😐</span></div>
    <div id="portrait-meta">
      <span class="meta-name" id="portrait-role-name">角色</span>
      <span class="emotion-line"><span class="emotion-emoji" id="emotion-emoji">😐</span><span id="emotion-key">neutral</span></span>
    </div>
  </div>
  <div id="splitter" role="separator" aria-orientation="horizontal" aria-label="调整立绘区高度"></div>
  <div id="meta-row"></div>
  <div id="log"></div>
  <div id="footer">
    <div id="row">
      <textarea id="input" placeholder="Message…"></textarea>
      <button id="send">发送</button>
    </div>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    const PORTRAIT_MIN = 96;
    const portraitMax = () => Math.min(420, window.innerHeight * 0.55);
    const els = {
      roleSelect: document.getElementById('role-select'),
      portraitPane: document.getElementById('portrait-pane'),
      portraitFrame: document.getElementById('portrait-frame'),
      portraitRoleName: document.getElementById('portrait-role-name'),
      emotionEmoji: document.getElementById('emotion-emoji'),
      emotionKey: document.getElementById('emotion-key'),
      splitter: document.getElementById('splitter'),
      metaRow: document.getElementById('meta-row'),
      log: document.getElementById('log'),
      input: document.getElementById('input'),
      send: document.getElementById('send'),
    };
    let sending = false;
    let splitterDragging = false;
    let dragStartY = 0;
    let dragStartHeight = 0;
    let identityLabel = '';
    let connectionSummary = '';
    let llmSummary = '';
    let editorChip = '';
    let cachedRoleOptions = [];
    let cachedCurrentRoleId = '';
    let roleSwitching = false;

    function esc(s) {
      return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    function renderPortrait(src, emoji) {
      if (src) {
        els.portraitFrame.innerHTML = '<img src="' + src + '" alt="" />';
        const img = els.portraitFrame.querySelector('img');
        img?.addEventListener('error', () => {
          els.portraitFrame.innerHTML = '<span id="portrait-fallback">' + esc(emoji || '😐') + '</span>';
        });
      } else {
        els.portraitFrame.innerHTML = '<span id="portrait-fallback">' + esc(emoji || '😐') + '</span>';
      }
    }

    function renderLines(lines) {
      if (!Array.isArray(lines)) return;
      const html = lines.map((l) => {
        const dismiss = l.dismissible ? ' <button type="button" class="dismiss-hint">知道了</button>' : '';
        return '<div class="msg ' + l.role + '">' + esc(l.text) + dismiss + '</div>';
      }).join('');
      const sendingHtml = sending ? '<div class="sending">思考中…</div>' : '';
      els.log.innerHTML = html + sendingHtml;
      els.log.querySelectorAll('.dismiss-hint').forEach((btn) => {
        btn.addEventListener('click', () => vscode.postMessage({ type: 'dismissAttachHint' }));
      });
      els.log.scrollTop = els.log.scrollHeight;
    }

    function fillRoleSelect(options, currentId, switching) {
      const sel = els.roleSelect;
      if (!sel) return;
      sel.innerHTML = '';
      const list = Array.isArray(options) ? options : [];
      if (!list.length) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = '无角色';
        sel.appendChild(opt);
        sel.disabled = true;
        return;
      }
      for (const o of list) {
        const opt = document.createElement('option');
        opt.value = o.id;
        opt.textContent = o.name || o.id;
        sel.appendChild(opt);
      }
      const nextId = currentId || list[0]?.id || '';
      if (nextId && list.some((o) => o.id === nextId)) {
        sel.value = nextId;
      }
      sel.disabled = !!switching;
    }

    function renderMetaRow() {
      let meta = '';
      if (identityLabel) meta += '<a id="identity-link">' + esc(identityLabel) + '</a>';
      if (llmSummary) meta += (meta ? ' · ' : '') + esc(llmSummary);
      if (connectionSummary) meta += (meta ? ' · ' : '') + esc(connectionSummary);
      if (editorChip) meta += (meta ? ' · ' : '') + '📄 ' + esc(editorChip);
      els.metaRow.innerHTML = meta;
      document.getElementById('identity-link')?.addEventListener('click', () => vscode.postMessage({ type: 'selectIdentity' }));
    }

    function applyPatch(p) {
      if (p.roleName != null) {
        els.portraitRoleName.textContent = p.roleName;
      }
      if (p.roleOptions != null) cachedRoleOptions = p.roleOptions;
      if (p.currentRoleId != null) cachedCurrentRoleId = p.currentRoleId;
      if (p.roleSwitching != null) roleSwitching = !!p.roleSwitching;
      if (p.roleOptions != null || p.currentRoleId != null || p.roleSwitching != null) {
        fillRoleSelect(cachedRoleOptions, cachedCurrentRoleId, roleSwitching);
      }
      if (p.portraitPaneHeight != null) {
        const h = Math.max(PORTRAIT_MIN, Math.min(portraitMax(), Number(p.portraitPaneHeight)));
        els.portraitPane.style.height = h + 'px';
      }
      if (p.portraitSrc != null || p.portraitEmoji != null) {
        renderPortrait(p.portraitSrc, p.portraitEmoji);
      }
      if (p.emotion != null) {
        els.emotionKey.textContent = p.emotion;
      }
      if (p.portraitEmoji != null) {
        els.emotionEmoji.textContent = p.portraitEmoji;
      }
      if (p.identityLabel != null) identityLabel = p.identityLabel;
      if (p.connectionSummary != null) connectionSummary = p.connectionSummary;
      if (p.llmSummary != null) llmSummary = p.llmSummary;
      if (p.editorChip != null) editorChip = p.editorChip;
      if (p.identityLabel != null || p.connectionSummary != null || p.llmSummary != null || p.editorChip != null) {
        renderMetaRow();
      }
      if (p.inputMinHeight != null) {
        els.input.style.minHeight = Number(p.inputMinHeight) + 'px';
      }
      if (p.sending != null) {
        sending = !!p.sending;
        els.send.disabled = sending;
        els.input.disabled = sending;
      }
      if (p.lines) renderLines(p.lines);
    }

    els.splitter.addEventListener('pointerdown', (e) => {
      splitterDragging = true;
      dragStartY = e.clientY;
      dragStartHeight = els.portraitPane.offsetHeight;
      els.splitter.classList.add('dragging');
      els.splitter.setPointerCapture(e.pointerId);
      document.body.style.cursor = 'row-resize';
      e.preventDefault();
    });
    els.splitter.addEventListener('pointermove', (e) => {
      if (!splitterDragging) return;
      const delta = e.clientY - dragStartY;
      const h = Math.max(PORTRAIT_MIN, Math.min(portraitMax(), dragStartHeight + delta));
      els.portraitPane.style.height = h + 'px';
    });
    function endSplitterDrag(e) {
      if (!splitterDragging) return;
      splitterDragging = false;
      els.splitter.classList.remove('dragging');
      document.body.style.cursor = '';
      try { els.splitter.releasePointerCapture(e.pointerId); } catch (_) {}
      vscode.postMessage({ type: 'resizePortraitPane', height: els.portraitPane.offsetHeight });
    }
    els.splitter.addEventListener('pointerup', endSplitterDrag);
    els.splitter.addEventListener('pointercancel', endSplitterDrag);

    window.addEventListener('message', (e) => {
      const msg = e.data;
      if (msg && msg.type === 'patch') applyPatch(msg);
    });

    const send = () => {
      const text = els.input.value.trim();
      if (!text || els.send.disabled) return;
      vscode.postMessage({ type: 'send', text });
      els.input.value = '';
    };
    els.send.addEventListener('click', send);
    els.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });
    els.roleSelect?.addEventListener('change', () => {
      const roleId = els.roleSelect.value;
      if (roleId && !els.roleSelect.disabled) {
        vscode.postMessage({ type: 'selectRole', roleId });
      }
    });
    document.getElementById('settings-btn')?.addEventListener('click', () => vscode.postMessage({ type: 'openSettings' }));
    document.getElementById('new-chat')?.addEventListener('click', () => vscode.postMessage({ type: 'newChat' }));
    vscode.postMessage({ type: 'shellReady' });
  </script>
</body>
</html>`;
  }
}
