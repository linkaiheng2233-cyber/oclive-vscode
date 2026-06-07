import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import type { KernelClient, KernelMode } from './kernelClient';
import { getSharedAppDataHint } from './kernelClient';

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
    this.kernelItem.command = {
      command: 'oclive.openSettings',
      arguments: ['kernel'],
      title: 'OCLive 内核设置',
    };
    this.setMode('offline');
    this.kernelItem.show();

    this.roleItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 49);
    this.roleItem.command = {
      command: 'oclive.openSettings',
      arguments: ['identity'],
      title: 'OCLive 用户身份',
    };
    this.roleItem.tooltip = '用户身份与后处理状态 · 点击打开设置';
  }

  setMode(mode: KernelMode, port?: number, extensionPath?: string): void {
    const icon =
      mode === 'attached' ? '$(debug-start)' : mode === 'spawned' ? '$(rocket)' : '$(debug-disconnect)';
    const portText = port != null ? ` :${port}` : '';
    this.kernelItem.text = `${icon} OCLive ${MODE_LABEL[mode]}${portText}`;
    const dataDir = getSharedAppDataHint();
    if (mode === 'offline') {
      this.kernelItem.tooltip = '点击打开 OCLive 设置（内核分区）';
    } else if (mode === 'attached') {
      this.kernelItem.tooltip =
        `已附着${portText} · 数据目录 ${dataDir} · 与桌面端共享 app.db · 发行版 profile 由已运行内核决定 · 点击打开设置`;
    } else {
      const distroNote =
        extensionPath && fs.existsSync(path.join(extensionPath, 'distro.oclive.toml'))
          ? ' · 已加载 distro.oclive.toml'
          : '';
      this.kernelItem.tooltip =
        `本扩展已启动内核 · 数据目录 ${dataDir}${distroNote} · 点击打开设置`;
    }
  }

  setRoleContext(text: string | undefined): void {
    if (!text?.trim()) {
      this.roleItem.hide();
      return;
    }
    this.roleItem.text = `$(person) ${text.trim()}`;
    this.roleItem.show();
  }

  syncFromClient(port: number, extensionPath?: string): void {
    this.setMode(this.kernel.connectionMode, port, extensionPath);
  }

  dispose(): void {
    this.kernelItem.dispose();
    this.roleItem.dispose();
  }
}
