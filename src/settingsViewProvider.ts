import * as vscode from 'vscode';
import { applyUserIdentitySelection, SCENE_ID } from './identityHelper';
import { getSharedAppDataHint, KernelClient } from './kernelClient';
import type { KernelResult } from './kernelError';
import { getEffectiveConfig } from './runtimeConfig';
import { listRoleOptions } from './rolePack';
import { emitSettingsChanged, takePendingSettingsSection } from './settingsEvents';
import { resolvePortraitPaneHeight } from './chatLayoutConfig';
import type { ChatViewProvider } from './chatViewProvider';
import type { KernelStatusBar } from './statusBar';
import type { SaveLlmUserSettingsRequest } from './types/llmSettings';
import type { RoleInfo } from './types/roleInfo';
import type {
  HostToWebviewMessage,
  OcliveSettingsKey,
  SettingsSection,
  SettingsStateSnapshot,
  WebviewToHostMessage,
} from './webviewProtocol';

const DEFAULT_OLLAMA_URL = 'http://127.0.0.1:11434';

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
        const ollamaUrl = llmSettings?.ollamaBaseUrl?.trim() || DEFAULT_OLLAMA_URL;
        const modelsResult = await this.kernel.listOllamaModels(ollamaUrl, eff);
        if (modelsResult.ok) {
          ollamaModels = modelsResult.data;
        }
        health = await this.kernel.fetchHealthJson(eff);
      } catch {
        health = await this.kernel.fetchHealthJson(eff);
      }
    }

    const section = this.initialSection ?? takePendingSettingsSection();
    this.initialSection = undefined;

    const roleOptions = eff.rolesDir
      ? listRoleOptions(eff.rolesDir, cfg.get<string[]>('roleAllowlist'))
      : [];

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
        'chat.portraitPaneHeight': resolvePortraitPaneHeight(cfg),
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
      roleIds: roleOptions.map((o) => o.id),
      roleOptions,
      currentRoleId: roleId,
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
        await this.handleSetSessionModel(msg);
        break;
      case 'refreshOllamaModels':
        await this.handleRefreshOllamaModels(msg);
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
    const result = await this.getChatProvider()?.switchRole(roleId);
    if (!result) {
      return;
    }
    this.postMessage({
      type: 'toast',
      level: result.ok ? 'info' : 'error',
      message: result.message,
    });
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

  private async saveLlmWithGrantRetry(
    req: SaveLlmUserSettingsRequest,
    eff: ReturnType<typeof getEffectiveConfig>,
  ): Promise<KernelResult<RoleInfo>> {
    let result = await this.kernel.saveLlmUserSettings(req, eff);
    if (
      result.ok ||
      result.error.code !== 'HIGH_RISK_CAPABILITY_NOT_GRANTED' ||
      req.provider !== 'cloud'
    ) {
      return result;
    }

    const pick = await vscode.window.showWarningMessage(
      '保存云端模型需要授权出站网络 (remote:llm)',
      '授权并重试',
      '取消',
    );
    if (pick !== '授权并重试') {
      return result;
    }

    const grant = await this.kernel.grantHighRiskCapability('network', 'remote:llm', eff);
    if (!grant.ok) {
      return { ok: false, error: grant.error };
    }
    return this.kernel.saveLlmUserSettings(req, eff);
  }

  private async handleSaveLlmSettings(
    msg: Extract<WebviewToHostMessage, { type: 'saveLlmSettings' }>,
  ): Promise<void> {
    const eff = getEffectiveConfig();
    const roleId = eff.roleId;
    const sessionId = this.context.globalState.get<string>('oclive.sessionId');
    const req: SaveLlmUserSettingsRequest = {
      roleId,
      sessionId: sessionId ?? null,
      provider: msg.provider,
      cloudApiStyle: msg.cloudApiStyle ?? 'openai',
      ollamaBaseUrl: msg.ollamaBaseUrl,
      ollamaModel: msg.ollamaModel ?? null,
      remoteUrl: msg.remoteUrl,
      remoteToken: msg.remoteToken,
      remoteModel: msg.remoteModel,
    };

    const result =
      msg.provider === 'cloud'
        ? await this.saveLlmWithGrantRetry(req, eff)
        : await this.kernel.saveLlmUserSettings(req, eff);

    if (result.ok) {
      await this.kernel.reloadLlm(eff);
      const effective = result.data.effective_ollama_model?.trim();
      const toastMsg = effective
        ? `模型设置已保存（生效：${effective}）`
        : '模型设置已保存';
      this.postMessage({ type: 'toast', level: 'info', message: toastMsg });
      this.postMessage({ type: 'llmOperationDone', op: 'save', ok: true, message: toastMsg });
      emitSettingsChanged();
      await this.getChatProvider()?.refreshLlmContext();
    } else {
      const errMsg = result.error.message || '保存模型设置失败';
      this.postMessage({ type: 'toast', level: 'error', message: errMsg });
      this.postMessage({ type: 'llmOperationDone', op: 'save', ok: false, message: errMsg });
    }
    await this.pushState();
  }

  private async handleSetSessionModel(
    msg: Extract<WebviewToHostMessage, { type: 'setSessionModel' }>,
  ): Promise<void> {
    const eff = getEffectiveConfig();
    const roleId = eff.roleId;
    const sessionId = this.context.globalState.get<string>('oclive.sessionId');

    if (msg.provider === 'cloud') {
      const result = await this.saveLlmWithGrantRetry(
        {
          roleId,
          sessionId: sessionId ?? null,
          provider: 'cloud',
          cloudApiStyle: 'openai',
          remoteModel: msg.model ?? '',
        },
        eff,
      );
      if (result.ok) {
        await this.kernel.reloadLlm(eff);
        this.postMessage({ type: 'toast', level: 'info', message: '云端模型已更新' });
        this.postMessage({ type: 'llmOperationDone', op: 'sessionModel', ok: true });
        emitSettingsChanged();
        await this.getChatProvider()?.refreshLlmContext();
      } else {
        const errMsg = result.error.message || '云端模型更新失败';
        this.postMessage({ type: 'toast', level: 'error', message: errMsg });
        this.postMessage({
          type: 'llmOperationDone',
          op: 'sessionModel',
          ok: false,
          message: errMsg,
        });
      }
    } else {
      const result = await this.kernel.setSessionOllamaModel(roleId, msg.model, sessionId, eff);
      if (result.ok) {
        await this.kernel.reloadLlm(eff);
        this.postMessage({ type: 'toast', level: 'info', message: '会话模型已更新' });
        this.postMessage({ type: 'llmOperationDone', op: 'sessionModel', ok: true });
        emitSettingsChanged();
        await this.getChatProvider()?.refreshLlmContext();
      } else {
        const errMsg = result.error.message || '会话模型更新失败';
        this.postMessage({ type: 'toast', level: 'error', message: errMsg });
        this.postMessage({
          type: 'llmOperationDone',
          op: 'sessionModel',
          ok: false,
          message: errMsg,
        });
      }
    }
    await this.pushState();
  }

  private async handleRefreshOllamaModels(
    msg: Extract<WebviewToHostMessage, { type: 'refreshOllamaModels' }>,
  ): Promise<void> {
    const eff = getEffectiveConfig();
    const roleId = eff.roleId;
    const sessionId = this.context.globalState.get<string>('oclive.sessionId');
    const llm = await this.kernel.getLlmUserSettings(roleId, sessionId, eff);
    const url = msg.ollamaBaseUrl?.trim() || llm?.ollamaBaseUrl?.trim() || DEFAULT_OLLAMA_URL;
    const result = await this.kernel.listOllamaModels(url, eff);
    if (result.ok) {
      this.postMessage({ type: 'ollamaModelsResult', models: result.data });
      this.postMessage({ type: 'llmOperationDone', op: 'refresh', ok: true });
    } else {
      const errMsg = result.error.message || '刷新 Ollama 模型列表失败';
      this.postMessage({ type: 'ollamaModelsResult', models: [], error: errMsg });
      this.postMessage({ type: 'llmOperationDone', op: 'refresh', ok: false, message: errMsg });
    }
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
