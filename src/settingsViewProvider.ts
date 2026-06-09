import * as vscode from 'vscode';
import { rolePackPath } from './config';
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

/** Pure TS settings controller — no standalone WebviewView. */
export class SettingsController {
  private postMessageFn?: (msg: HostToWebviewMessage) => void;
  private initialSection?: SettingsSection;

  constructor(
    private readonly kernel: KernelClient,
    private readonly context: vscode.ExtensionContext,
    private readonly getChatProvider: () => ChatViewProvider | undefined,
    private readonly getStatusBar: () => KernelStatusBar | undefined,
  ) {}

  bindPostMessage(fn: (msg: HostToWebviewMessage) => void): void {
    this.postMessageFn = fn;
  }

  setInitialSection(section: SettingsSection | undefined): void {
    this.initialSection = section;
  }

  async pushState(): Promise<void> {
    if (!this.postMessageFn) {
      return;
    }
    const payload = await this.buildStateSnapshot();
    this.postMessageFn({ type: 'state', payload });
  }

  private postMessage(msg: HostToWebviewMessage): void {
    this.postMessageFn?.(msg);
  }

  async buildStateSnapshot(): Promise<SettingsStateSnapshot> {
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
        roleAllowlist: cfg.get('roleAllowlist'),
        kernelBinary: eff.kernelBinary,
        includeEditorContext: cfg.get('includeEditorContext'),
        mockLlm: cfg.get('mockLlm'),
        'penetration.letterEnabled': cfg.get('penetration.letterEnabled'),
        'penetration.heartVoiceEnabled': cfg.get('penetration.heartVoiceEnabled'),
        'chat.portraitMaxHeight': cfg.get('chat.portraitMaxHeight'),
        'chat.inputMinHeight': cfg.get('chat.inputMinHeight'),
        'settings.placement': cfg.get('settings.placement'),
      },
      kernelMode: this.kernel.connectionMode,
      roleInfo,
      identityState,
      health,
      llmSettings,
      ollamaModels,
      roleIds: eff.rolesDir ? listRoleIds(eff.rolesDir, cfg.get<string[]>('roleAllowlist')) : [],
      sharedAppData: getSharedAppDataHint(),
      discovery: {
        rolesDir: eff.rolesDir,
        kernelBinary: eff.kernelBinary,
        kernelFallbackBinary: eff.kernelFallbackBinary,
      },
      initialSection: section,
    };
  }

  async handleMessage(msg: WebviewToHostMessage): Promise<void> {
    switch (msg.type) {
      case 'ready':
        await this.pushState();
        break;
      case 'closeSettings':
        await this.getChatProvider()?.closeSettings();
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
        await this.handleSaveLlmSettings(msg);
        break;
      case 'setSessionModel':
        await this.handleSetSessionModel(msg.model);
        break;
      case 'refreshOllamaModels':
        await this.handleRefreshOllamaModels();
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
    await this.getChatProvider()?.onSettingsLayoutChanged();
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
    msg: Extract<WebviewToHostMessage, { type: 'saveLlmSettings' }>,
  ): Promise<void> {
    const eff = getEffectiveConfig();
    const roleId = eff.roleId;
    const sessionId = this.context.globalState.get<string>('oclive.sessionId');
    const info = await this.kernel.saveLlmUserSettings(
      {
        roleId,
        sessionId: sessionId ?? null,
        provider: msg.provider,
        cloudApiStyle: msg.cloudApiStyle ?? 'openai',
        ollamaBaseUrl: msg.ollamaBaseUrl,
        ollamaModel: msg.ollamaModel ?? null,
        remoteUrl: msg.remoteUrl,
        remoteToken: msg.remoteToken,
        remoteModel: msg.remoteModel,
      },
      eff,
    );
    if (info) {
      await this.kernel.reloadLlm(eff);
      this.postMessage({ type: 'toast', level: 'info', message: '模型设置已保存' });
      emitSettingsChanged();
      await this.getChatProvider()?.refreshLlmContext();
    } else {
      this.postMessage({ type: 'toast', level: 'error', message: '保存模型设置失败' });
    }
    await this.pushState();
  }

  private async handleSetSessionModel(model: string | null): Promise<void> {
    const eff = getEffectiveConfig();
    const roleId = eff.roleId;
    const sessionId = this.context.globalState.get<string>('oclive.sessionId');
    const llm = await this.kernel.getLlmUserSettings(roleId, sessionId, eff);

    if (llm?.provider === 'cloud') {
      const info = await this.kernel.saveLlmUserSettings(
        {
          roleId,
          sessionId: sessionId ?? null,
          provider: 'cloud',
          cloudApiStyle: 'openai',
          remoteModel: model ?? '',
        },
        eff,
      );
      if (info) {
        await this.kernel.reloadLlm(eff);
        this.postMessage({ type: 'toast', level: 'info', message: '云端模型已更新' });
        emitSettingsChanged();
        await this.getChatProvider()?.refreshLlmContext();
      } else {
        this.postMessage({ type: 'toast', level: 'error', message: '云端模型更新失败' });
      }
    } else {
      const info = await this.kernel.setSessionOllamaModel(roleId, model, sessionId, eff);
      if (info) {
        await this.kernel.reloadLlm(eff);
        this.postMessage({ type: 'toast', level: 'info', message: '会话模型已更新' });
        emitSettingsChanged();
        await this.getChatProvider()?.refreshLlmContext();
      } else {
        this.postMessage({ type: 'toast', level: 'error', message: '会话模型更新失败' });
      }
    }
    await this.pushState();
  }

  private async handleRefreshOllamaModels(): Promise<void> {
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
}

/** @deprecated Use SettingsController */
export const SettingsViewProvider = SettingsController;
