import * as vscode from 'vscode';

import { applyUserIdentitySelection, SCENE_ID } from './identityHelper';
import * as fs from 'fs';
import * as path from 'path';
import { getSharedAppDataHint, KernelClient } from './kernelClient';
import type { KernelResult } from './kernelError';
import { applyAutoDiscovery, getEffectiveConfig } from './runtimeConfig';
import { listRoleOptions } from './rolePack';
import { emitSettingsChanged, takePendingSettingsSection } from './settingsEvents';
import { resolvePortraitPaneHeight } from './chatLayoutConfig';
import { createSerialQueue } from './serialQueue';
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
  /** Serializes webview-driven operations so rapid clicks queue instead of racing. */
  private readonly ops = createSerialQueue();

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
        const ollamaUrlPromise = this.kernel
          .getLlmUserSettings(roleId, sessionId, eff)
          .then(async (llm) => {
            llmSettings = llm;
            const ollamaUrl = llm?.ollamaBaseUrl?.trim() || DEFAULT_OLLAMA_URL;
            const modelsResult = await this.kernel.listOllamaModels(ollamaUrl, eff);
            return modelsResult.ok ? modelsResult.data : [];
          });

        const [ri, idState, models, h] = await Promise.all([
          this.kernel.fetchRoleInfo(roleId, eff, sessionId),
          this.kernel.getUserIdentityState(roleId, SCENE_ID, eff),
          ollamaUrlPromise,
          this.kernel.fetchHealthJson(eff),
        ]);
        roleInfo = ri;
        identityState = idState;
        ollamaModels = models;
        health = h;
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
        'chat.portraitPaneHeight': resolvePortraitPaneHeight(cfg),
        'chat.inputMinHeight': cfg.get('chat.inputMinHeight'),
        'settings.placement': cfg.get('settings.placement'),
      },
      kernelMode: this.kernel.connectionMode,
      roleInfo,
      identityState,
      health,
      llmSettings,
      ollamaModels,
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

  handleMessage(msg: WebviewToHostMessage): Promise<void> {
    // Serialize end-to-end so a second click (e.g. switch role) queues behind
    // the first instead of racing it into an overlapping kernel-call storm.
    return this.ops.run(() => this.dispatchMessage(msg));
  }

  private async dispatchMessage(msg: WebviewToHostMessage): Promise<void> {
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
      case 'setIdentity':
        await this.handleSetIdentity(msg.identityId);
        break;
      case 'reconnectKernel':
        await this.handleReconnect();
        break;
      case 'rediscover':
        await this.handleRediscover();
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
        break;
      case 'loadStorageState':
        await this.handleLoadStorageState();
        break;
      case 'searchStorage':
        await this.handleSearchStorage(msg.query);
        break;
      case 'exportStorage':
        await this.handleExportStorage(msg);
        break;
    }
  }

  private async handleLoadStorageState(): Promise<void> {
    const eff = getEffectiveConfig();
    if (!eff.rolesDir) {
      this.postMessage({
        type: 'storageState',
        capabilities: null,
        sessions: [],
        error: '请先配置角色库',
      });
      return;
    }
    const roleId = eff.roleId;
    const [capsRes, sessions] = await Promise.all([
      this.kernel.chatStorageProxy<{
        backend_kind: string;
        supports_search: boolean;
        supports_replay: boolean;
        supports_cleanup: boolean;
      }>({ op: 'capabilities' }, eff),
      this.kernel.listChatSessions(roleId, SCENE_ID, eff),
    ]);
    this.postMessage({
      type: 'storageState',
      capabilities: capsRes.ok
        ? {
            backend_kind: capsRes.data.backend_kind,
            supports_search: capsRes.data.supports_search,
            supports_replay: capsRes.data.supports_replay,
            supports_cleanup: capsRes.data.supports_cleanup,
          }
        : null,
      sessions: sessions.map((s) => ({
        session_id: s.session_id,
        role_id: s.role_id,
        scene_id: s.scene_id,
        updated_at: s.updated_at,
        message_count: s.message_count,
        last_message_snippet: s.last_message_snippet,
      })),
      error: capsRes.ok ? undefined : capsRes.error,
    });
  }

  private async handleSearchStorage(query: string): Promise<void> {
    const eff = getEffectiveConfig();
    const res = await this.kernel.chatStorageProxy<
      Array<{
        message_id: string;
        session_id: string;
        content: string;
        created_at: string;
      }>
    >(
      {
        op: 'search_messages',
        query,
        role_id: eff.roleId,
        limit: 20,
        offset: 0,
      },
      eff,
    );
    if (!res.ok) {
      this.postMessage({ type: 'storageSearchResult', hits: [], error: res.error });
      return;
    }
    this.postMessage({
      type: 'storageSearchResult',
      hits: res.data.map((h) => ({
        message_id: h.message_id,
        session_id: h.session_id,
        content: h.content,
        created_at: h.created_at,
      })),
    });
  }

  private async handleExportStorage(
    msg: Extract<WebviewToHostMessage, { type: 'exportStorage' }>,
  ): Promise<void> {
    const eff = getEffectiveConfig();
    const op =
      msg.kind === 'session'
        ? {
            op: 'export_session' as const,
            session_id: msg.sessionId ?? '',
            format: msg.format,
          }
        : {
            op: 'export_role' as const,
            role_id: eff.roleId,
            format: msg.format,
          };
    const res = await this.kernel.chatStorageProxy<{
      content: string;
      suggested_filename: string;
    }>(op, eff);
    if (!res.ok) {
      this.postMessage({ type: 'toast', level: 'error', message: res.error });
      return;
    }
    const folder = vscode.workspace.workspaceFolders?.[0];
    let targetPath: string | undefined;
    if (folder) {
      const dir = path.join(folder.uri.fsPath, '.oclive', 'exports');
      await fs.promises.mkdir(dir, { recursive: true });
      targetPath = path.join(dir, res.data.suggested_filename);
      await fs.promises.writeFile(targetPath, res.data.content, 'utf8');
    } else {
      const picked = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(res.data.suggested_filename),
        filters: { Markdown: ['md'], JSON: ['json'] },
      });
      if (!picked) {
        return;
      }
      targetPath = picked.fsPath;
      await fs.promises.writeFile(targetPath, res.data.content, 'utf8');
    }
    this.postMessage({
      type: 'toast',
      level: 'info',
      message: `已导出：${targetPath}`,
    });
  }

  private static readonly CONNECTION_KEYS: ReadonlySet<OcliveSettingsKey> = new Set([
    'apiPort',
    'kernelBinary',
    'mockLlm',
    'promoteSharedKernel',
    'rolesDir',
  ]);

  private async handleUpdateConfig(key: OcliveSettingsKey, value: unknown): Promise<void> {
    const cfg = vscode.workspace.getConfiguration('oclive');
    await cfg.update(key, value, vscode.ConfigurationTarget.Global);
    // Changing how/where we reach the kernel must force a fresh plan next call,
    // otherwise a trusted-but-stale connection (e.g. wrong mockLlm) would persist.
    if (SettingsController.CONNECTION_KEYS.has(key)) {
      this.kernel.invalidateEnsureReady();
    }
    this.postMessage({ type: 'toast', level: 'info', message: `已更新 ${key}` });
    emitSettingsChanged();
    await this.getChatProvider()?.onSettingsLayoutChanged();
    await this.pushState();
  }

  private async handleSetIdentity(identityId: string): Promise<void> {
    const ok = await applyUserIdentitySelection(this.kernel, identityId);
    if (ok) {
      await this.getChatProvider()?.refreshStatusContext();
      this.postMessage({ type: 'toast', level: 'info', message: '用户身份已更新' });
      emitSettingsChanged();
      await this.pushState();
    } else {
      this.postMessage({ type: 'toast', level: 'error', message: '身份切换失败' });
    }
  }

  private async handleReconnect(): Promise<void> {
    const eff = getEffectiveConfig();
    try {
      this.kernel.invalidateEnsureReady();
      await this.kernel.ensureReady(eff, { force: true });
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

  private async handleRediscover(): Promise<void> {
    const discovered = await applyAutoDiscovery(this.context, { forcePrompt: true });
    const eff = getEffectiveConfig();
    try {
      this.kernel.invalidateEnsureReady();
      await this.kernel.ensureReady(eff, { force: true });
      this.getStatusBar()?.syncFromClient(eff.apiPort, eff.extensionPath);
      const msg = discovered
        ? `已重新发现：角色库 ${eff.rolesDir || '（未配置）'} · 内核：${this.kernel.connectionMode}`
        : '未发现新路径；已按当前配置重连内核';
      this.postMessage({ type: 'toast', level: 'info', message: msg });
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
      await this.pushState();
    } else {
      const errMsg = result.error.message || '保存模型设置失败';
      this.postMessage({ type: 'toast', level: 'error', message: errMsg });
      this.postMessage({ type: 'llmOperationDone', op: 'save', ok: false, message: errMsg });
    }
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
        await this.pushState();
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
        await this.pushState();
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
    if (ok) {
      await this.pushState();
    }
  }
}
