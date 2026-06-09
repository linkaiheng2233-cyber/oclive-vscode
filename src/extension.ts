import * as path from 'path';
import * as vscode from 'vscode';
import { ChatViewProvider } from './chatViewProvider';
import { applyAutoDiscovery, getEffectiveConfig, setExtensionPath } from './runtimeConfig';
import { KernelClient } from './kernelClient';
import { listRoleIds, readRoleDisplayName } from './rolePack';
import { ensureSetup } from './setup';
import { onSettingsChanged, setPendingSettingsSection } from './settingsEvents';
import { SettingsController } from './settingsViewProvider';
import type { SettingsSection } from './webviewProtocol';
import { KernelStatusBar } from './statusBar';

let kernel: KernelClient | undefined;
let chatProvider: ChatViewProvider | undefined;
let settingsController: SettingsController | undefined;
let statusBar: KernelStatusBar | undefined;

async function refreshKernelUi(): Promise<void> {
  const config = getEffectiveConfig();
  try {
    await kernel?.ensureReady(config);
  } catch {
    /* status bar reflects offline */
  }
  statusBar?.syncFromClient(config.apiPort, config.extensionPath);
}

export function activate(context: vscode.ExtensionContext): void {
  setExtensionPath(context.extensionPath);
  kernel = new KernelClient();
  statusBar = new KernelStatusBar(kernel);
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
  );

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
      const eff = getEffectiveConfig();
      try {
        kernel?.invalidateEnsureReady();
        await kernel?.ensureReady(eff, { force: true });
        statusBar?.syncFromClient(eff.apiPort, eff.extensionPath);
        void vscode.window.showInformationMessage(
          `OCLive 内核：${kernel?.connectionMode ?? 'offline'} (:${eff.apiPort})`,
        );
      } catch (e) {
        statusBar?.syncFromClient(eff.apiPort);
        const msg = e instanceof Error ? e.message : String(e);
        void vscode.window.showErrorMessage(msg);
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('oclive.selectUserIdentity', async () => {
      await vscode.commands.executeCommand('oclive.openSettings', 'identity');
    }),
  );

  context.subscriptions.push(statusBar);
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
}

export function deactivate(): void {
  chatProvider?.disposeAll();
  kernel?.dispose();
  kernel = undefined;
  chatProvider = undefined;
  settingsController = undefined;
  statusBar = undefined;
}
