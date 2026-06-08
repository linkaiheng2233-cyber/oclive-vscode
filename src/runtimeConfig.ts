import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { getConfig, OcliveConfig } from './config';
import { resolveEnvironment, sharedAppDataDir, type ResolvedEnvironment } from './discovery';

let cached: ResolvedEnvironment | undefined;
let extensionPath: string | undefined;
let kernelBinaryPinned = false;

export function setExtensionPath(path: string): void {
  extensionPath = path;
}

export function setKernelBinaryPinned(pinned: boolean): void {
  kernelBinaryPinned = pinned;
}

export function isKernelBinaryPinned(): boolean {
  return kernelBinaryPinned;
}

export function getResolvedEnvironment(): ResolvedEnvironment | undefined {
  return cached;
}

export function clearResolvedCache(): void {
  cached = undefined;
}

/** Auto-discover roles + kernel; persist to global settings when found. */
export async function applyAutoDiscovery(
  context: vscode.ExtensionContext,
  opts?: { silent?: boolean; forcePrompt?: boolean },
): Promise<boolean> {
  const cfg = vscode.workspace.getConfiguration('oclive');
  const auto = cfg.get<boolean>('autoDiscover', true);
  if (!auto && !opts?.forcePrompt) {
    return Boolean(getConfig().rolesDir);
  }

  const extPath = context.extensionPath;
  const folders = vscode.workspace.workspaceFolders?.map((f) => f.uri.fsPath) ?? [];

  const resolved = resolveEnvironment({
    extensionPath: extPath,
    workspaceFolders: folders,
    settingsRolesDir: (cfg.get<string>('rolesDir', '') ?? '').trim(),
    settingsKernelBinary: (cfg.get<string>('kernelBinary', '') ?? '').trim(),
    promoteShared: cfg.get<boolean>('promoteSharedKernel', true),
  });

  if (resolved) {
    cached = resolved;
    await cfg.update('rolesDir', resolved.rolesDir, vscode.ConfigurationTarget.Global);
    if (resolved.kernelBinary) {
      await cfg.update('kernelBinary', resolved.kernelBinary, vscode.ConfigurationTarget.Global);
    }
    context.globalState.update('oclive.lastDiscovery', {
      rolesDir: resolved.rolesDir,
      kernelTier: resolved.kernelTier,
      kernelFallback: resolved.kernelFallbackBinary,
      at: new Date().toISOString(),
    });
    if (!opts?.silent) {
      void vscode.window.showInformationMessage(
        `OCLive 已自动配置：角色库 ${resolved.rolesDir} · 数据 ${sharedAppDataDir()} · 内核 [${resolved.kernelTier}]`,
      );
    }
    return true;
  }

  if (opts?.forcePrompt) {
    return manualPick(cfg);
  }

  return false;
}

async function manualPick(cfg: vscode.WorkspaceConfiguration): Promise<boolean> {
  const rolesPick = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: '选择 roles 根目录',
    title: 'OCLive：未找到角色库，请手动选择',
  });
  if (!rolesPick?.length) {
    return false;
  }
  await cfg.update('rolesDir', rolesPick[0].fsPath, vscode.ConfigurationTarget.Global);

  const kernelPick = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    filters: process.platform === 'win32' ? { Executable: ['exe'] } : undefined,
    openLabel: '选择内核（可选）',
    title: 'OCLive：未找到内核，可跳过（仅 attach 8420）',
  });
  if (kernelPick?.length) {
    await cfg.update('kernelBinary', kernelPick[0].fsPath, vscode.ConfigurationTarget.Global);
    setKernelBinaryPinned(true);
  }
  clearResolvedCache();
  return true;
}

export function getEffectiveConfig(): OcliveConfig {
  const base = getConfig();
  const cfg = vscode.workspace.getConfiguration('oclive');
  const withExt = extensionPath ? { ...base, extensionPath } : base;
  const envPinned = Boolean((process.env.OCLIVE_KERNEL_BINARY ?? '').trim());
  const promoteSharedKernel = cfg.get<boolean>('promoteSharedKernel', true);
  const pinned = envPinned || kernelBinaryPinned;
  const distroProfile =
    extensionPath && fs.existsSync(path.join(extensionPath, 'distro.oclive.toml'))
      ? path.join(extensionPath, 'distro.oclive.toml')
      : undefined;
  if (cached?.rolesDir) {
    return {
      ...withExt,
      rolesDir: cached.rolesDir,
      kernelBinary: cached.kernelBinary || base.kernelBinary,
      kernelFallbackBinary: cached.kernelFallbackBinary,
      kernelBinaryPinned: pinned,
      promoteSharedKernel,
      distroProfile,
    };
  }
  return {
    ...withExt,
    kernelBinaryPinned: pinned,
    promoteSharedKernel,
    distroProfile,
  };
}
