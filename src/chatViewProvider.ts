import * as vscode from 'vscode';
import * as path from 'path';
import { emotionEmoji, normalizeEmotionKey } from './emotionAssets';
import { getConfig, rolePackPath } from './config';
import { getEffectiveConfig } from './runtimeConfig';
import { KernelClient } from './kernelClient';
import { readRoleDisplayName, readSceneWelcome, resolveEmotionImagePath } from './rolePack';
import { ensureSetup } from './setup';
import { KernelStatusBar } from './statusBar';

const SCENE_ID = 'vscode';
const SESSION_KEY = 'oclive.sessionId';

interface ChatLine {
  role: 'user' | 'assistant' | 'system';
  text: string;
}

export class ChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'oclive.chatView';

  private view?: vscode.WebviewView;
  private readonly lines: ChatLine[] = [];
  private roleName = '';
  private portraitEmotion = 'neutral';
  private portraitWebviewSrc = '';
  private portraitEmoji = '😐';
  private sending = false;
  private welcomed = false;
  private pollTimer: ReturnType<typeof setInterval> | undefined;
  private pollBusy = false;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly kernel: KernelClient,
    private readonly context: vscode.ExtensionContext,
    private readonly statusBar: KernelStatusBar,
  ) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this.view = webviewView;
    this.updateWebviewRoots();

    webviewView.webview.onDidReceiveMessage(async (msg: { type: string; text?: string }) => {
      if (msg.type === 'send' && typeof msg.text === 'string') {
        await this.handleSend(msg.text.trim());
      }
    });

    void this.bootstrap();
    this.startRoleSnapshotPoll();
  }

  disposePoll(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
  }

  private startRoleSnapshotPoll(): void {
    this.disposePoll();
    this.pollTimer = setInterval(() => {
      void this.pollRoleSnapshot();
    }, 8000);
  }

  private async pollRoleSnapshot(): Promise<void> {
    if (this.pollBusy || this.sending) {
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
        this.render();
      }
    } finally {
      this.pollBusy = false;
    }
  }

  async openAndFocus(): Promise<void> {
    await vscode.commands.executeCommand('oclive.chatView.focus');
  }

  /** After role or rolesDir change: refresh header and welcome. */
  async reloadRolePack(): Promise<void> {
    this.lines.length = 0;
    this.welcomed = false;
    await this.bootstrap();
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
      if (!this.welcomed) {
        const welcome = readSceneWelcome(pack, SCENE_ID);
        if (welcome) {
          this.lines.push({ role: 'assistant', text: welcome });
          this.welcomed = true;
        }
      }
    }
    await this.refreshKernelStatus();
    this.render();
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

  private async refreshKernelStatus(): Promise<void> {
    const config = getEffectiveConfig();
    try {
      if (!(await ensureSetup(this.context))) {
        this.pushSystem('请先配置 oclive.rolesDir（命令：OCLive: Setup）');
        return;
      }
      this.updateWebviewRoots();
      const pack = rolePackPath(config);
      this.roleName = readRoleDisplayName(pack);
      await this.kernel.ensureReady(config);
      this.statusBar.syncFromClient(config.apiPort);
      this.pushSystem(
        `已连接 · ${this.kernel.connectionMode} · :${config.apiPort} · ${this.roleName}`,
      );
    } catch (e) {
      this.statusBar.syncFromClient(config.apiPort);
      const msg = e instanceof Error ? e.message : String(e);
      this.pushSystem(`内核未就绪：${msg}`);
    } finally {
      this.render();
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
    this.render();

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
        this.statusBar.syncFromClient(config.apiPort);
        const emotion = result.portraitEmotion || result.botEmotion || 'neutral';
        this.setPortraitEmotion(emotion, pack);
        this.lines.push({ role: 'assistant', text: result.reply });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.lines.push({ role: 'system', text: `错误：${msg}` });
    } finally {
      this.sending = false;
      this.render();
    }
  }

  private render(): void {
    if (!this.view) {
      return;
    }
    this.view.webview.html = this.getHtml();
  }

  private escapeHtml(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private getHtml(): string {
    const linesHtml = this.lines
      .map((l) => {
        const cls = l.role;
        return `<div class="msg ${cls}">${this.escapeHtml(l.text)}</div>`;
      })
      .join('');

    const portraitInner = this.portraitWebviewSrc
      ? `<img class="portrait-img" src="${this.portraitWebviewSrc}" alt="" />`
      : `<span class="portrait-emoji">${this.portraitEmoji}</span>`;

    const sendingHint = this.sending
      ? '<div class="sending">思考中…</div>'
      : '';

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${this.view?.webview.cspSource} https:; style-src 'unsafe-inline'; script-src 'unsafe-inline';" />
  <style>
    * { box-sizing: border-box; }
    body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); background: var(--vscode-sideBar-background); margin: 0; padding: 0; display: flex; flex-direction: column; height: 100vh; }
    #header { flex-shrink: 0; padding: 10px 8px 6px; text-align: center; border-bottom: 1px solid var(--vscode-widget-border, #444); }
    .portrait-img { max-width: 100%; max-height: 140px; object-fit: contain; border-radius: 6px; }
    .portrait-emoji { font-size: 56px; line-height: 1.2; display: block; }
    .role-meta { margin-top: 6px; font-size: 0.85em; opacity: 0.85; }
    .emotion-tag { font-size: 0.75em; opacity: 0.65; }
    #log { flex: 1; overflow-y: auto; padding: 8px; min-height: 0; }
    .msg { padding: 6px 8px; margin-bottom: 6px; border-radius: 4px; white-space: pre-wrap; word-break: break-word; }
    .user { background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border); }
    .assistant { background: var(--vscode-editor-inactiveSelectionBackground); }
    .system { opacity: 0.75; font-size: 0.9em; font-style: italic; }
    .sending { padding: 4px 8px; font-size: 0.85em; opacity: 0.7; }
    #footer { flex-shrink: 0; padding: 8px; border-top: 1px solid var(--vscode-widget-border, #444); }
    #row { display: flex; gap: 6px; }
    textarea { flex: 1; min-height: 52px; max-height: 120px; resize: vertical; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); border-radius: 4px; padding: 6px; font-family: inherit; }
    button { align-self: flex-end; padding: 6px 12px; cursor: pointer; }
    button:disabled { opacity: 0.5; cursor: default; }
  </style>
</head>
<body>
  <div id="header">
    ${portraitInner}
    <div class="role-meta">${this.escapeHtml(this.roleName || '角色')}</div>
    <div class="emotion-tag">${this.escapeHtml(this.portraitEmotion)}</div>
  </div>
  <div id="log">${linesHtml}${sendingHint}</div>
  <div id="footer">
    <div id="row">
      <textarea id="input" placeholder="说点什么…" ${this.sending ? 'disabled' : ''}></textarea>
      <button id="send" ${this.sending ? 'disabled' : ''}>发送</button>
    </div>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    const input = document.getElementById('input');
    const sendBtn = document.getElementById('send');
    const send = () => {
      const text = input.value.trim();
      if (!text || sendBtn.disabled) return;
      vscode.postMessage({ type: 'send', text });
      input.value = '';
    };
    sendBtn.addEventListener('click', send);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });
    const log = document.getElementById('log');
    log.scrollTop = log.scrollHeight;
  </script>
</body>
</html>`;
  }
}
