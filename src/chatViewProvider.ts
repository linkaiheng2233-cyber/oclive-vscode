import * as vscode from 'vscode';
import * as path from 'path';
import { emotionEmoji, normalizeEmotionKey } from './emotionAssets';
import { rolePackPath } from './config';
import { getEffectiveConfig } from './runtimeConfig';
import { getSharedAppDataHint, KernelClient, type StoredMessage } from './kernelClient';
import { readRoleDisplayName, readSceneWelcome, resolveEmotionImagePath } from './rolePack';
import { ensureSetup } from './setup';
import { KernelStatusBar } from './statusBar';
import type { SettingsController } from './settingsViewProvider';
import type { SettingsSection } from './webviewProtocol';
import { buildSettingsWebviewHtml } from './webviewHtml';

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
  effectiveModel?: string;
  llmProvider?: string;
  portraitSrc?: string;
  portraitEmoji?: string;
  portraitMaxHeight?: number;
  emotion?: string;
  identityLabel?: string;
  connectionSummary?: string;
  editorChip?: string;
  sending?: boolean;
  inputMinHeight?: number;
  lines?: ChatLine[];
  ollamaModels?: string[];
  sessionModel?: string;
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
  private effectiveModel = '';
  private llmProvider = 'local';
  private sessionModel = '';
  private ollamaModels: string[] = [];
  private portraitEmotion = 'neutral';
  private portraitWebviewSrc = '';
  private portraitEmoji = '😐';
  private sending = false;
  private identityLabel = '';
  private welcomed = false;
  private pollTimer: ReturnType<typeof setInterval> | undefined;
  private pollBusy = false;
  private connectionSummary = '';
  private attachHintVisible = false;
  private editorChip = '';
  private shellReady = false;
  private viewMode: 'chat' | 'settings' = 'chat';
  private editorDebounceTimer: ReturnType<typeof setTimeout> | undefined;
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

    webviewView.webview.onDidReceiveMessage(async (msg: { type: string; text?: string; model?: string | null }) => {
      if (this.viewMode === 'settings') {
        await this.settingsController.handleMessage(msg as Parameters<SettingsController['handleMessage']>[0]);
        return;
      }
      if (msg.type === 'shellReady') {
        this.shellReady = true;
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
      if (msg.type === 'dismissAttachHint') {
        this.attachHintVisible = false;
        void this.context.globalState.update(ATTACH_HINT_KEY, true);
        this.postPatch({ lines: [...this.lines] });
      }
      if (msg.type === 'setSessionModel') {
        await this.settingsController.handleMessage({
          type: 'setSessionModel',
          model: msg.model ?? null,
        });
        await this.refreshLlmContext();
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
    await this.loadLlmSnapshot();
    this.postPatch(this.buildFullPatch());
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
        this.setPortraitEmotion(emotion, pack);
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
    this.lines.length = 0;
    this.welcomed = false;
    await this.bootstrap();
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
      roots.push(vscode.Uri.file(rolePackPath(config)));
    }
    this.view.webview.options = {
      enableScripts: true,
      localResourceRoots: roots,
    };
  }

  private async bootstrap(): Promise<void> {
    const config = getEffectiveConfig();
    if (config.rolesDir) {
      const pack = rolePackPath(config);
      this.roleName = readRoleDisplayName(pack);
      this.setPortraitEmotion('neutral', pack);
    }
    await this.refreshKernelStatus();
    await this.loadLlmSnapshot();
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

  private async loadLlmSnapshot(): Promise<void> {
    const config = getEffectiveConfig();
    if (!config.rolesDir) {
      return;
    }
    try {
      const pack = rolePackPath(config);
      const roleId = path.basename(pack);
      const sessionId = this.sessionId();
      const llm = await this.kernel.getLlmUserSettings(roleId, sessionId, config);
      if (llm) {
        this.effectiveModel = llm.effectiveModel;
        this.llmProvider = llm.provider;
        this.sessionModel =
          llm.provider === 'cloud'
            ? llm.remoteModel || llm.effectiveModel
            : llm.sessionOllamaModel ?? llm.packOllamaModel ?? llm.effectiveModel;
        if (llm.ollamaBaseUrl) {
          this.ollamaModels = await this.kernel.listOllamaModels(llm.ollamaBaseUrl, config);
        }
      }
    } catch {
      /* best-effort */
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
      this.connectionSummary = '';
      return;
    }
    const modeLabel = mode === 'attached' ? 'attach' : 'spawn';
    this.connectionSummary = `${modeLabel} · ${getSharedAppDataHint()}`;
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

  private layoutFromConfig(): { portraitMaxHeight: number; inputMinHeight: number } {
    const cfg = vscode.workspace.getConfiguration('oclive');
    return {
      portraitMaxHeight: Number(cfg.get('chat.portraitMaxHeight') ?? 0),
      inputMinHeight: Number(cfg.get('chat.inputMinHeight') ?? 52),
    };
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
        this.setPortraitEmotion(emotion, pack);
        this.lines.push({ role: 'assistant', text: result.reply });
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
      effectiveModel: this.effectiveModel,
      llmProvider: this.llmProvider,
      sessionModel: this.sessionModel,
      ollamaModels: this.ollamaModels,
      portraitSrc: this.portraitWebviewSrc,
      portraitEmoji: this.portraitEmoji,
      portraitMaxHeight: layout.portraitMaxHeight,
      emotion: this.portraitEmotion,
      identityLabel: this.identityLabel,
      connectionSummary: this.connectionSummary,
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
    this.shellReady = true;
  }

  private getShellHtml(): string {
    const csp = `default-src 'none'; img-src ${this.view?.webview.cspSource} https:; style-src 'unsafe-inline'; script-src 'unsafe-inline';`;
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <style>
    * { box-sizing: border-box; }
    body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); background: var(--vscode-sideBar-background); margin: 0; padding: 0; display: flex; flex-direction: column; height: 100vh; }
    #topbar { flex-shrink: 0; display: flex; align-items: center; gap: 6px; padding: 6px 8px; border-bottom: 1px solid var(--vscode-widget-border, #444); min-height: 36px; }
    #avatar { width: 24px; height: 24px; border-radius: 50%; overflow: hidden; flex-shrink: 0; display: flex; align-items: center; justify-content: center; background: var(--vscode-input-background); font-size: 14px; }
    #avatar img { width: 100%; height: 100%; object-fit: cover; }
    #role-name { font-weight: 600; font-size: 0.9em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 90px; }
    #model-wrap { flex: 1; min-width: 0; }
    #model-select, #model-readonly { width: 100%; font-size: 0.75em; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); border-radius: 3px; padding: 2px 4px; }
    #model-readonly { display: none; border: none; background: transparent; opacity: 0.75; padding: 0; }
    .tb-btn { background: transparent; border: none; cursor: pointer; font-size: 13px; opacity: 0.75; padding: 2px 4px; flex-shrink: 0; }
    .tb-btn:hover { opacity: 1; }
    #meta { flex-shrink: 0; padding: 0 8px 4px; font-size: 0.7em; opacity: 0.65; }
    #meta a { color: inherit; cursor: pointer; text-decoration: underline; }
    #editor-chip { flex-shrink: 0; padding: 2px 8px 4px; font-size: 0.7em; opacity: 0.6; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    #log { flex: 1; overflow-y: auto; padding: 8px; min-height: 0; }
    .msg { padding: 6px 8px; margin-bottom: 6px; border-radius: 4px; white-space: pre-wrap; word-break: break-word; font-size: 0.92em; }
    .user { background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border); }
    .assistant { background: transparent; border-left: 2px solid var(--vscode-textLink-foreground, #3794ff); padding-left: 10px; }
    .system { opacity: 0.75; font-size: 0.85em; font-style: italic; }
    .dismiss-hint { margin-left: 8px; font-size: inherit; cursor: pointer; }
    .sending { padding: 4px 8px; font-size: 0.85em; opacity: 0.7; }
    #footer { flex-shrink: 0; padding: 8px; border-top: 1px solid var(--vscode-widget-border, #444); }
    #row { display: flex; gap: 6px; }
    textarea { flex: 1; min-height: 52px; max-height: 160px; resize: vertical; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); border-radius: 4px; padding: 6px; font-family: inherit; font-size: 0.92em; }
    #send { align-self: flex-end; padding: 6px 12px; cursor: pointer; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 3px; }
    #send:disabled { opacity: 0.5; cursor: default; }
  </style>
</head>
<body>
  <div id="topbar">
    <div id="avatar"><span id="avatar-emoji">😐</span></div>
    <span id="role-name">角色</span>
    <div id="model-wrap">
      <select id="model-select" title="会话模型"></select>
      <span id="model-readonly"></span>
    </div>
    <button type="button" class="tb-btn" id="new-chat" title="新对话">＋</button>
    <button type="button" class="tb-btn" id="settings-btn" title="设置">⚙</button>
  </div>
  <div id="meta"></div>
  <div id="editor-chip"></div>
  <div id="log"></div>
  <div id="footer">
    <div id="row">
      <textarea id="input" placeholder="Message…"></textarea>
      <button id="send">发送</button>
    </div>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    const els = {
      avatar: document.getElementById('avatar'),
      avatarEmoji: document.getElementById('avatar-emoji'),
      roleName: document.getElementById('role-name'),
      modelSelect: document.getElementById('model-select'),
      modelReadonly: document.getElementById('model-readonly'),
      meta: document.getElementById('meta'),
      editorChip: document.getElementById('editor-chip'),
      log: document.getElementById('log'),
      input: document.getElementById('input'),
      send: document.getElementById('send'),
    };
    let sending = false;

    function esc(s) {
      return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
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

    function fillModelSelect(models, current, provider) {
      if (provider === 'cloud') {
        els.modelSelect.style.display = 'none';
        els.modelReadonly.style.display = 'inline';
        els.modelReadonly.textContent = current || '—';
        return;
      }
      els.modelSelect.style.display = 'block';
      els.modelReadonly.style.display = 'none';
      const list = Array.isArray(models) ? models : [];
      const cur = current || '';
      const opts = list.includes(cur) ? list : (cur ? [cur, ...list] : list);
      els.modelSelect.innerHTML = opts.map((m) =>
        '<option value="' + esc(m) + '"' + (m === cur ? ' selected' : '') + '>' + esc(m) + '</option>'
      ).join('');
    }

    function applyPatch(p) {
      if (p.roleName != null) els.roleName.textContent = p.roleName;
      if (p.portraitMaxHeight != null) {
        const h = Number(p.portraitMaxHeight);
        const size = h <= 0 ? 0 : Math.max(24, h);
        if (size === 0) {
          els.avatar.style.display = 'none';
        } else {
          els.avatar.style.display = 'flex';
          els.avatar.style.width = size + 'px';
          els.avatar.style.height = size + 'px';
        }
      }
      if (p.portraitSrc) {
        els.avatar.innerHTML = '<img src="' + p.portraitSrc + '" alt="" />';
      } else if (p.portraitEmoji) {
        els.avatar.innerHTML = '<span id="avatar-emoji">' + p.portraitEmoji + '</span>';
      }
      if (p.llmProvider != null || p.ollamaModels != null || p.sessionModel != null) {
        fillModelSelect(p.ollamaModels, p.sessionModel || p.effectiveModel, p.llmProvider);
      }
      if (p.identityLabel != null || p.connectionSummary != null) {
        let meta = '';
        if (p.identityLabel) meta += '<a id="identity-link">' + esc(p.identityLabel) + '</a>';
        if (p.connectionSummary) meta += (meta ? ' · ' : '') + esc(p.connectionSummary);
        els.meta.innerHTML = meta;
        document.getElementById('identity-link')?.addEventListener('click', () => vscode.postMessage({ type: 'selectIdentity' }));
      }
      if (p.editorChip != null) {
        els.editorChip.textContent = p.editorChip ? '📄 ' + p.editorChip : '';
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
    document.getElementById('settings-btn')?.addEventListener('click', () => vscode.postMessage({ type: 'openSettings' }));
    document.getElementById('new-chat')?.addEventListener('click', () => vscode.postMessage({ type: 'newChat' }));
    els.modelSelect.addEventListener('change', () => {
      vscode.postMessage({ type: 'setSessionModel', model: els.modelSelect.value || null });
    });
    vscode.postMessage({ type: 'shellReady' });
  </script>
</body>
</html>`;
  }
}
