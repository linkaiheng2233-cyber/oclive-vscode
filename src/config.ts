import * as vscode from 'vscode';
import * as path from 'path';

export interface OcliveConfig {
  apiPort: number;
  rolesDir: string;
  roleId: string;
  kernelBinary: string;
  /** VS Code extension root (`context.extensionPath`) for `distro.oclive.toml`. */
  extensionPath?: string;
  /** Spawn retry when primary kernel fails (extension `bin/`). */
  kernelFallbackBinary?: string;
  includeEditorContext: boolean;
  mockLlm: boolean;
}

export function getConfig(): OcliveConfig {
  const cfg = vscode.workspace.getConfiguration('oclive');
  return {
    apiPort: cfg.get<number>('apiPort', 8420),
    rolesDir: (cfg.get<string>('rolesDir', '') ?? '').trim(),
    roleId: (cfg.get<string>('roleId', 'mumu') ?? 'mumu').trim(),
    kernelBinary: (cfg.get<string>('kernelBinary', '') ?? '').trim(),
    includeEditorContext: cfg.get<boolean>('includeEditorContext', true),
    mockLlm: cfg.get<boolean>('mockLlm', false),
  };
}

export function rolePackPath(config: OcliveConfig): string {
  return path.join(config.rolesDir, config.roleId);
}

export function apiBase(config: OcliveConfig): string {
  return `http://127.0.0.1:${config.apiPort}`;
}
