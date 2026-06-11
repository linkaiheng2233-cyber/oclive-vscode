import * as path from 'path';

import * as vscode from 'vscode';

import type { OcliveHostApi } from '@oclive/vscode-host';

import { ChatViewProvider } from './chatViewProvider';

import { applyAutoDiscovery, getEffectiveConfig, setExtensionPath } from './runtimeConfig';

import { KernelClient } from './kernelClient';

import { listRoleIds, readRoleDisplayName } from './rolePack';

import { ensureSetup } from './setup';

import { onSettingsChanged, setPendingSettingsSection } from './settingsEvents';

import { SettingsController } from './settingsViewProvider';

import type { SettingsSection } from './webviewProtocol';

import { KernelStatusBar } from './statusBar';

import { isAgentProfileEnabled } from './agentProfile';

import {
  runMcpServerGrantQuickPick,
  runMcpToolQuickPick,
} from './mcpBridge';

import { OcliveHostApiImpl } from './hostApi/OcliveHostApiImpl';

let kernel: KernelClient | undefined;
let chatProvider: ChatViewProvider | undefined;
let settingsController: SettingsController | undefined;
let statusBar: KernelStatusBar | undefined;
let hostApi: OcliveHostApiImpl | undefined;

async function refreshKernelUi(): Promise<void> {
  const config = getEffectiveConfig();
  try {
    const mode = await kernel?.ensureReady(config);
    if (mode && hostApi) {
      hostApi.fireKernelReady({ mode, apiPort: config.apiPort });
    }
  } catch {
    /* status bar reflects offline */
  }
  statusBar?.syncFromClient(config.apiPort, config.extensionPath);
}

export function activate(context: vscode.ExtensionContext): OcliveHostApi {
  setExtensionPath(context.extensionPath);
  kernel = new KernelClient();
  statusBar = new KernelStatusBar(kernel);

  const stubDeps = {
    getEditorContext: () => ({ hasSelection: false, chipLabel: '' }),
    getRecentTurn: () => undefined,
    getSessionId: () => '',
    getRoleName: () => '',
  };
  hostApi = new OcliveHostApiImpl(context, kernel, stubDeps);

  settingsController = new SettingsController(
    kernel,
    context,
    () => chatProvider,
    () => statusBar,
  );

  chatProvider = new ChatViewProvider(
    context.extensionUri,
    kernel,
    context,
    statusBar,
    settingsController,
    hostApi,
  );
  chatProvider.bindHostApiDeps();

  statusBar.setOnDisconnected((apiPort) => {
    hostApi?.fireKernelDisconnected({ mode: 'offline', apiPort });
  });

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ChatViewProvider.viewType, chatProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );

  context.subscriptions.push(
    onSettingsChanged(() => {
      void chatProvider?.refreshStatusContext();
      statusBar?.syncFromClient(getEffectiveConfig().apiPort, getEffectiveConfig().extensionPath);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'oclive.openSettings',
      async (section?: SettingsSection) => {
        if (!(await ensureSetup(context))) {
          return;
        }
        if (section) {
          setPendingSettingsSection(section);
          settingsController?.setInitialSection(section);
        }
        await chatProvider?.openSettings(section);
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('oclive.openChat', async () => {
      if (!(await ensureSetup(context))) {
        return;
      }
      await chatProvider?.openAndFocus();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('oclive.setup', async () => {
      if (await ensureSetup(context)) {
        await refreshKernelUi();
        void vscode.window.showInformationMessage('OCLive 配置已更新');
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('oclive.selectRole', async () => {
      if (!(await ensureSetup(context))) {
        return;
      }
      const cfg = vscode.workspace.getConfiguration('oclive');
      const rolesDir = getEffectiveConfig().rolesDir;
      const allowlist = cfg.get<string[]>('roleAllowlist');
      const ids = listRoleIds(rolesDir, allowlist);
      if (!ids.length) {
        void vscode.window.showWarningMessage(`未在 ${rolesDir} 下找到角色包`);
        return;
      }
      const picked = await vscode.window.showQuickPick(
        ids.map((id) => ({
          label: id,
          description: readRoleDisplayName(path.join(rolesDir, id)),
        })),
        { placeHolder: '选择角色' },
      );
      if (!picked) {
        return;
      }
      const result = await chatProvider?.switchRole(picked.label);
      if (result) {
        void vscode.window.showInformationMessage(result.message);
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('oclive.reconnectKernel', async () => {
      if (!(await ensureSetup(context))) {
        return;
      }
      await chatProvider?.handleReconnectKernel?.();
      if (!chatProvider) {
        const eff = getEffectiveConfig();
        try {
          kernel?.invalidateEnsureReady();
          const mode = await kernel?.ensureReady(eff, { force: true });
          statusBar?.syncFromClient(eff.apiPort, eff.extensionPath);
          if (mode && hostApi) {
            hostApi.fireKernelReady({ mode, apiPort: eff.apiPort });
          }
          void vscode.window.showInformationMessage(
            `OCLive 内核：${kernel?.connectionMode ?? 'offline'} (:${eff.apiPort})`,
          );
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          void vscode.window.showErrorMessage(msg);
        }
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('oclive.selectUserIdentity', async () => {
      await vscode.commands.executeCommand('oclive.openSettings', 'identity');
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('oclive.listMcpServers', async () => {
      if (!kernel) {
        return;
      }
      const eff = getEffectiveConfig();
      if (!(await isAgentProfileEnabled(kernel, eff))) {
        void vscode.window.showInformationMessage(
          '默认 VS Code profile 未启用 Agent。请切换 vscode-agent.oclive.toml 后重连，见 docs/VS4_AGENT.md',
        );
        return;
      }
      await runMcpServerGrantQuickPick(kernel, eff);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('oclive.callMcpTool', async () => {
      if (!kernel) {
        return;
      }
      const eff = getEffectiveConfig();
      if (!(await isAgentProfileEnabled(kernel, eff))) {
        void vscode.window.showInformationMessage(
          'MCP 工具调用需 Agent profile（vscode-agent）。见 docs/VS4_AGENT.md',
        );
        return;
      }
      await runMcpToolQuickPick(kernel, eff);
    }),
  );

  context.subscriptions.push(statusBar);
  context.subscriptions.push(hostApi);
  context.subscriptions.push({ dispose: () => kernel?.dispose() });

  void (async () => {
    await applyAutoDiscovery(context, { silent: true });
    const eff = getEffectiveConfig();
    if (eff.rolesDir) {
      await refreshKernelUi();
    } else {
      statusBar?.setMode('offline', eff.apiPort);
    }
  })();

  return hostApi;
}

export function deactivate(): void {
  chatProvider?.disposeAll();
  kernel?.dispose();
  kernel = undefined;
  chatProvider = undefined;
  settingsController = undefined;
  statusBar = undefined;
  hostApi = undefined;
}
