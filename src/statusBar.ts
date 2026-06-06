import * as vscode from 'vscode';
import type { KernelClient, KernelMode } from './kernelClient';

const MODE_LABEL: Record<KernelMode, string> = {
  attached: '已连接（attach）',
  spawned: '已启动（spawn）',
  offline: '离线',
};

export class KernelStatusBar {
  private readonly kernelItem: vscode.StatusBarItem;
  private readonly roleItem: vscode.StatusBarItem;

  constructor(private readonly kernel: KernelClient) {
    this.kernelItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
    this.kernelItem.command = 'oclive.reconnectKernel';
    this.setMode('offline');
    this.kernelItem.show();

    this.roleItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 49);
    this.roleItem.command = 'oclive.selectUserIdentity';
    this.roleItem.tooltip = '用户身份与后处理状态 · 点击切换身份';
  }

  setMode(mode: KernelMode, port?: number): void {
    const icon =
      mode === 'attached' ? '$(debug-start)' : mode === 'spawned' ? '$(rocket)' : '$(debug-disconnect)';
    const portText = port != null ? ` :${port}` : '';
    this.kernelItem.text = `${icon} OCLive ${MODE_LABEL[mode]}${portText}`;
    this.kernelItem.tooltip =
      mode === 'offline'
        ? '点击重连内核（需 oclive.kernelBinary 或 8420 已有服务）'
        : `内核 ${MODE_LABEL[mode]}${portText} · 点击刷新`;
  }

  setRoleContext(text: string | undefined): void {
    if (!text?.trim()) {
      this.roleItem.hide();
      return;
    }
    this.roleItem.text = `$(person) ${text.trim()}`;
    this.roleItem.show();
  }

  syncFromClient(port: number): void {
    this.setMode(this.kernel.connectionMode, port);
  }

  dispose(): void {
    this.kernelItem.dispose();
    this.roleItem.dispose();
  }
}
