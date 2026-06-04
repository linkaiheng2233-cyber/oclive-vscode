import * as path from 'path';
import * as vscode from 'vscode';
import { ChatViewProvider } from './chatViewProvider';
import { getConfig, rolePackPath } from './config';
import { applyAutoDiscovery, getEffectiveConfig, setExtensionPath } from './runtimeConfig';
import { KernelClient } from './kernelClient';
import { listRoleIds, readRoleDisplayName } from './rolePack';
import { ensureSetup } from './setup';
import { KernelStatusBar } from './statusBar';

let kernel: KernelClient | undefined;
let chatProvider: ChatViewProvider | undefined;
let statusBar: KernelStatusBar | undefined;

async function refreshKernelUi(): Promise<void> {
  const config = getEffectiveConfig();
  try {
    await kernel?.ensureReady(config);
  } catch {
    /* status bar reflects offline */
  }
  statusBar?.syncFromClient(config.apiPort);
}

export function activate(context: vscode.ExtensionContext): void {
  setExtensionPath(context.extensionPath);
  kernel = new KernelClient();
  statusBar = new KernelStatusBar(kernel);
  chatProvider = new ChatViewProvider(context.extensionUri, kernel, context, statusBar);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ChatViewProvider.viewType, chatProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
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
      const ids = listRoleIds(rolesDir);
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
      const roleId = picked.label;
      await cfg.update('roleId', roleId, vscode.ConfigurationTarget.Global);
      await chatProvider?.reloadRolePack();
      void vscode.window.showInformationMessage(
        `当前角色：${readRoleDisplayName(rolePackPath(getEffectiveConfig()))} (${roleId})`,
      );
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('oclive.reconnectKernel', async () => {
      if (!(await ensureSetup(context))) {
        return;
      }
      const eff = getEffectiveConfig();
      try {
        await kernel?.ensureReady(eff);
        statusBar?.syncFromClient(eff.apiPort);
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
  kernel?.dispose();
  kernel = undefined;
  chatProvider = undefined;
  statusBar = undefined;
}
