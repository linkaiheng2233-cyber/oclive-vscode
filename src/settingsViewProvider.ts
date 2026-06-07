import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { rolePackPath } from './config';
import { sharedAppDataDir } from './discovery';
import { applyUserIdentitySelection, SCENE_ID } from './identityHelper';
import { getSharedAppDataHint, KernelClient } from './kernelClient';
import { getEffectiveConfig } from './runtimeConfig';
import { listRoleIds, readRoleDisplayName } from './rolePack';
import { emitSettingsChanged, takePendingSettingsSection } from './settingsEvents';
import type { ChatViewProvider } from './chatViewProvider';
import type { KernelStatusBar } from './statusBar';
import type {
  HostToWebviewMessage,
  OcliveSettingsKey,
  SettingsSection,
  SettingsStateSnapshot,
  WebviewToHostMessage,
} from './webviewProtocol';

export class SettingsViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'oclive.settingsView';

  private view?: vscode.WebviewView;
  private initialSection?: SettingsSection;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly kernel: KernelClient,
    private readonly context: vscode.ExtensionContext,
    private readonly getChatProvider: () => ChatViewProvider | undefined,
    private readonly getStatusBar: () => KernelStatusBar | undefined,
  ) {}

  setInitialSection(section: SettingsSection | undefined): void {
    this.initialSection = section;
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    webviewView.webview.onDidReceiveMessage(async (msg: WebviewToHostMessage) => {
      await this.handleMessage(msg);
    });

    webviewView.webview.html = this.getHtml(webviewView.webview);
  }

  async focus(section?: SettingsSection): Promise<void> {
    if (section) {
      this.initialSection = section;
    }
    await vscode.commands.executeCommand('oclive.settingsView.focus');
    await this.pushState();
  }

  async pushState(): Promise<void> {
    if (!this.view) {
      return;
    }
    const payload = await this.buildStateSnapshot();
    this.postMessage({ type: 'state', payload });
  }

  private postMessage(msg: HostToWebviewMessage): void {
    void this.view?.webview.postMessage(msg);
  }

  private async buildStateSnapshot(): Promise<SettingsStateSnapshot> {
    const eff = getEffectiveConfig();
    const cfg = vscode.workspace.getConfiguration('oclive');
    const roleId = eff.roleId;
    const sessionId = this.context.globalState.get<string>('oclive.sessionId');
    let roleInfo = null;
    let identityState = null;
    let llmSettings = null;
    let ollamaModels: string[] = [];
    let health = null;

    if (eff.rolesDir) {
      try {
        await this.kernel.ensureReady(eff);
        roleInfo = await this.kernel.fetchRoleInfo(roleId, eff, sessionId);
        identityState = await this.kernel.getUserIdentityState(roleId, SCENE_ID, eff);
        llmSettings = await this.kernel.getLlmUserSettings(roleId, sessionId, eff);
        if (llmSettings?.ollamaBaseUrl) {
          ollamaModels = await this.kernel.listOllamaModels(llmSettings.ollamaBaseUrl, eff);
        }
        health = await this.kernel.fetchHealthJson(eff);
      } catch {
        health = await this.kernel.fetchHealthJson(eff);
      }
    }

    const section = this.initialSection ?? takePendingSettingsSection();
    this.initialSection = undefined;

    return {
      config: {
        apiPort: cfg.get('apiPort'),
        autoDiscover: cfg.get('autoDiscover'),
        promoteSharedKernel: cfg.get('promoteSharedKernel'),
        rolesDir: eff.rolesDir,
        roleId: eff.roleId,
        kernelBinary: eff.kernelBinary,
        includeEditorContext: cfg.get('includeEditorContext'),
        mockLlm: cfg.get('mockLlm'),
        'penetration.letterEnabled': cfg.get('penetration.letterEnabled'),
        'penetration.heartVoiceEnabled': cfg.get('penetration.heartVoiceEnabled'),
      },
      kernelMode: this.kernel.connectionMode,
      roleInfo,
      identityState,
      health,
      llmSettings,
      ollamaModels,
      roleIds: eff.rolesDir ? listRoleIds(eff.rolesDir) : [],
      sharedAppData: getSharedAppDataHint(),
      discovery: {
        rolesDir: eff.rolesDir,
        kernelBinary: eff.kernelBinary,
        kernelFallbackBinary: eff.kernelFallbackBinary,
      },
      initialSection: section,
    };
  }

  private async handleMessage(msg: WebviewToHostMessage): Promise<void> {
    switch (msg.type) {
      case 'ready':
        await this.pushState();
        break;
      case 'updateConfig':
        await this.handleUpdateConfig(msg.key, msg.value);
        break;
      case 'selectRole':
        await this.handleSelectRole(msg.roleId);
        break;
      case 'setIdentity':
        await this.handleSetIdentity(msg.identityId);
        break;
      case 'reconnectKernel':
        await this.handleReconnect();
        break;
      case 'saveLlmSettings':
        await this.handleSaveLlmSettings(msg.ollamaBaseUrl, msg.ollamaModel);
        break;
      case 'setSessionModel':
        await this.handleSetSessionModel(msg.model);
        break;
      case 'reloadLlm':
        await this.handleReloadLlm();
        break;
      case 'navigateSection':
        this.initialSection = msg.section;
        await this.pushState();
        break;
    }
  }

  private async handleUpdateConfig(key: OcliveSettingsKey, value: unknown): Promise<void> {
    const cfg = vscode.workspace.getConfiguration('oclive');
    await cfg.update(key, value, vscode.ConfigurationTarget.Global);
    this.postMessage({ type: 'toast', level: 'info', message: `已更新 ${key}` });
    emitSettingsChanged();
    await this.pushState();
  }

  private async handleSelectRole(roleId: string): Promise<void> {
    const cfg = vscode.workspace.getConfiguration('oclive');
    await cfg.update('roleId', roleId, vscode.ConfigurationTarget.Global);
    const eff = getEffectiveConfig();
    await this.kernel.loadRole(roleId, eff);
    await this.getChatProvider()?.reloadRolePack();
    const name = readRoleDisplayName(rolePackPath(getEffectiveConfig()));
    this.postMessage({ type: 'toast', level: 'info', message: `当前角色：${name} (${roleId})` });
    this.getStatusBar()?.setRoleContext(undefined);
    emitSettingsChanged();
    await this.pushState();
  }

  private async handleSetIdentity(identityId: string): Promise<void> {
    const ok = await applyUserIdentitySelection(this.kernel, identityId);
    if (ok) {
      await this.getChatProvider()?.refreshStatusContext();
      this.postMessage({ type: 'toast', level: 'info', message: '用户身份已更新' });
      emitSettingsChanged();
    } else {
      this.postMessage({ type: 'toast', level: 'error', message: '身份切换失败' });
    }
    await this.pushState();
  }

  private async handleReconnect(): Promise<void> {
    const eff = getEffectiveConfig();
    try {
      await this.kernel.ensureReady(eff);
      this.getStatusBar()?.syncFromClient(eff.apiPort, eff.extensionPath);
      this.postMessage({
        type: 'toast',
        level: 'info',
        message: `内核：${this.kernel.connectionMode} (:${eff.apiPort})`,
      });
    } catch (e) {
      this.getStatusBar()?.syncFromClient(eff.apiPort, eff.extensionPath);
      const message = e instanceof Error ? e.message : String(e);
      this.postMessage({ type: 'toast', level: 'error', message });
    }
    emitSettingsChanged();
    await this.pushState();
  }

  private async handleSaveLlmSettings(
    ollamaBaseUrl: string,
    ollamaModel?: string | null,
  ): Promise<void> {
    const eff = getEffectiveConfig();
    const roleId = eff.roleId;
    const sessionId = this.context.globalState.get<string>('oclive.sessionId');
    const info = await this.kernel.saveLlmUserSettings(
      {
        roleId,
        sessionId: sessionId ?? null,
        provider: 'local',
        ollamaBaseUrl,
        ollamaModel: ollamaModel ?? null,
      },
      eff,
    );
    if (info) {
      await this.kernel.reloadLlm(eff);
      this.postMessage({ type: 'toast', level: 'info', message: '模型设置已保存' });
      emitSettingsChanged();
    } else {
      this.postMessage({ type: 'toast', level: 'error', message: '保存模型设置失败' });
    }
    await this.pushState();
  }

  private async handleSetSessionModel(model: string | null): Promise<void> {
    const eff = getEffectiveConfig();
    const sessionId = this.context.globalState.get<string>('oclive.sessionId');
    const info = await this.kernel.setSessionOllamaModel(
      eff.roleId,
      model,
      sessionId,
      eff,
    );
    if (info) {
      await this.kernel.reloadLlm(eff);
      this.postMessage({ type: 'toast', level: 'info', message: '会话模型已更新' });
      emitSettingsChanged();
    } else {
      this.postMessage({ type: 'toast', level: 'error', message: '会话模型更新失败' });
    }
    await this.pushState();
  }

  private async handleReloadLlm(): Promise<void> {
    const eff = getEffectiveConfig();
    const ok = await this.kernel.reloadLlm(eff);
    this.postMessage({
      type: 'toast',
      level: ok ? 'info' : 'error',
      message: ok ? 'LLM 环境已重载' : 'LLM 重载失败',
    });
    await this.pushState();
  }

  private getHtml(webview: vscode.Webview): string {
    const distDir = path.join(this.extensionUri.fsPath, 'webview-ui', 'dist');
    const indexPath = path.join(distDir, 'index.html');
    if (!fs.existsSync(indexPath)) {
      return `<!DOCTYPE html><html><body style="font-family:var(--vscode-font-family);padding:12px;color:var(--vscode-foreground)">
        <p>设置 UI 未构建。请运行 <code>npm run build:webview</code> 后重载扩展。</p>
      </body></html>`;
    }
    let html = fs.readFileSync(indexPath, 'utf8');
    const nonce = getNonce();
    const csp = [
      "default-src 'none'",
      `img-src ${webview.cspSource} https: data:`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src 'nonce-${nonce}'`,
      `font-src ${webview.cspSource}`,
    ].join('; ');

    html = html.replace(/<script/g, `<script nonce="${nonce}"`);
    html = html.replace(
      /<head>/,
      `<head><meta http-equiv="Content-Security-Policy" content="${csp}">`,
    );

    // Rewrite asset paths to webview URIs
    html = html.replace(/(href|src)="([^"]+)"/g, (_m, attr: string, url: string) => {
      if (url.startsWith('http') || url.startsWith('data:')) {
        return `${attr}="${url}"`;
      }
      const resource = vscode.Uri.joinPath(this.extensionUri, 'webview-ui', 'dist', url.replace(/^\.\//, ''));
      return `${attr}="${webview.asWebviewUri(resource)}"`;
    });

    return html;
  }
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
