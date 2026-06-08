import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import type { KernelClient, KernelMode } from './kernelClient';
import { getSharedAppDataHint } from './kernelClient';

const MODE_LABEL: Record<KernelMode, string> = {
  attached: '已连接',
  spawned: '已启动',
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
    const info = this.kernel.getConnectionInfo();
    const icon =
      mode === 'attached'
        ? '$(debug-start)'
        : mode === 'spawned'
          ? info.degraded
            ? '$(warning)'
            : '$(rocket)'
          : '$(debug-disconnect)';
    const portText = port != null ? ` :${port}` : '';
    const source = info.sourceLabel ?? MODE_LABEL[mode];
    const degradedTag = info.degraded ? ' · 降级内核' : '';
    this.kernelItem.text = `${icon} OCLive ${MODE_LABEL[mode]}${degradedTag}${portText}`;

    const dataDir = getSharedAppDataHint();
    const lines: string[] = [];
    if (mode === 'offline') {
      lines.push('点击打开 OCLive 设置（内核分区）');
    } else {
      lines.push(source);
      if (info.binary) {
        lines.push(`二进制：${info.binary}`);
      }
      if (info.tier) {
        lines.push(`来源 tier：${info.tier}`);
      }
      if (info.replacedExisting) {
        lines.push('已用更全内核替换 :8420 上的旧进程');
      }
      lines.push(`数据目录 ${dataDir} · 与桌面端共享 app.db`);
      if (mode === 'attached') {
        lines.push('发行版 profile 由已运行内核决定');
      } else if (extensionPath && fs.existsSync(path.join(extensionPath, 'distro.oclive.toml'))) {
        lines.push('已加载 distro.oclive.toml（仅 spawn 时注入）');
      }
      if (info.degraded && info.degradeReason) {
        lines.push(info.degradeReason);
      }
      if (info.policyHint) {
        lines.push(info.policyHint);
      }
      lines.push('点击打开设置');
    }
    this.kernelItem.tooltip = lines.join('\n');
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
