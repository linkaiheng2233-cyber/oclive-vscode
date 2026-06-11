import * as path from 'path';
import * as vscode from 'vscode';
import { ChatViewProvider } from './chatViewProvider';
import { applyAutoDiscovery, getEffectiveConfig, setExtensionPath } from './runtimeConfig';
import { getSharedAppDataHint, KernelClient } from './kernelClient';
import { listRoleIds, readRoleDisplayName } from './rolePack';
import { ensureSetup } from './setup';
import { onSettingsChanged, setPendingSettingsSection } from './settingsEvents';
import { SettingsController } from './settingsViewProvider';
import type { SettingsSection } from './webviewProtocol';
import { KernelStatusBar } from './statusBar';
import { PenetrationIdleMonitor } from './penetration/idleMonitor';
import { readPenetrationTemplates, rolePackPenetrationOverrides } from './penetration/rolePackPenetration';
import { mergePenetrationConfig } from './penetration/config';
import { rolePackPath } from './config';
import { isAgentProfileEnabled } from './agentProfile';
import {
  runMcpServerGrantQuickPick,
  runMcpToolQuickPick,
} from './mcpBridge';

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

function penetrationConfigForIdle(): ReturnType<typeof mergePenetrationConfig> {
  const eff = getEffectiveConfig();
  const packDir = eff.rolesDir ? rolePackPath(eff) : '';
  const templates = packDir ? readPenetrationTemplates(packDir) : {};
  return mergePenetrationConfig(rolePackPenetrationOverrides(templates));
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
      await chatProvider?.handleReconnectKernel?.();
      // fallback if chat provider not ready
      if (!chatProvider) {
        const eff = getEffectiveConfig();
        try {
          kernel?.invalidateEnsureReady();
          await kernel?.ensureReady(eff, { force: true });
          statusBar?.syncFromClient(eff.apiPort, eff.extensionPath);
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
    vscode.commands.registerCommand('oclive.appendDiary', async () => {
      if (!(await ensureSetup(context))) {
        return;
      }
      await chatProvider?.handleAppendDiary();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('oclive.writeLetter', async () => {
      if (!(await ensureSetup(context))) {
        return;
      }
      await chatProvider?.handleWriteLetter();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('oclive.revealOcliveFolder', async () => {
      if (!(await ensureSetup(context))) {
        return;
      }
      const result = await chatProvider?.getPenetrationService().revealOcliveFolder();
      if (result?.ok) {
        void vscode.window.showInformationMessage(result.message);
      } else if (result) {
        void vscode.window.showWarningMessage(result.message);
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('oclive.syncDiaryMemory', async () => {
      if (!(await ensureSetup(context))) {
        return;
      }
      const result = await chatProvider?.getPenetrationService().syncTodayDiaryToMemory();
      if (result?.ok) {
        void vscode.window.showInformationMessage(result.message);
      } else if (result) {
        void vscode.window.showWarningMessage(result.message);
      }
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

  const idleMonitor = new PenetrationIdleMonitor(
    context,
    () => penetrationConfigForIdle().idle,
    () => {
      void vscode.commands.executeCommand('oclive.openChat');
      const msg =
        penetrationConfigForIdle().idle.message?.trim() ||
        '角色在等你回来聊聊…';
      void vscode.window.showInformationMessage(msg);
    },
  );
  context.subscriptions.push(idleMonitor);
  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection(() => {
      idleMonitor.touch();
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
