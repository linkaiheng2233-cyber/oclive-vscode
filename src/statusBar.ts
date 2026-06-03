import * as vscode from 'vscode';
import type { KernelClient, KernelMode } from './kernelClient';

const MODE_LABEL: Record<KernelMode, string> = {
  attached: '已连接（attach）',
  spawned: '已启动（spawn）',
  offline: '离线',
};

export class KernelStatusBar {
  private readonly item: vscode.StatusBarItem;

  constructor(private readonly kernel: KernelClient) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
    this.item.command = 'oclive.reconnectKernel';
    this.setMode('offline');
    this.item.show();
  }

  setMode(mode: KernelMode, port?: number): void {
    const icon =
      mode === 'attached' ? '$(debug-start)' : mode === 'spawned' ? '$(rocket)' : '$(debug-disconnect)';
    const portText = port != null ? ` :${port}` : '';
    this.item.text = `${icon} OCLive ${MODE_LABEL[mode]}${portText}`;
    this.item.tooltip =
      mode === 'offline'
        ? '点击重连内核（需 oclive.kernelBinary 或 8420 已有服务）'
        : `内核 ${MODE_LABEL[mode]}${portText} · 点击刷新`;
  }

  syncFromClient(port: number): void {
    this.setMode(this.kernel.connectionMode, port);
  }

  dispose(): void {
    this.item.dispose();
  }
}
