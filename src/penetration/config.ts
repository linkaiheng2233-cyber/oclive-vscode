import * as vscode from 'vscode';
import { readWorkspacePenetrationConfig } from './workspaceConfig';

export interface PenetrationIdleConfig {
  enabled: boolean;
  seconds: number;
  dailyLimit: number;
  message?: string;
}

export interface PenetrationMemorySyncConfig {
  enabled: boolean;
  importance: number;
}

export interface PenetrationConfig {
  enabled: boolean;
  diaryPathTemplate: string;
  autoDiaryEveryNTurns: number;
  allowedGlobs: string[];
  previewAfterWrite: boolean;
  terminalEnabled: boolean;
  idle: PenetrationIdleConfig;
  memorySync: PenetrationMemorySyncConfig;
}

/** User settings only (no merge). */
function readUserPenetrationSettings(): PenetrationConfig {
  const cfg = vscode.workspace.getConfiguration('oclive');
  return {
    enabled: cfg.get<boolean>('penetration.enabled', true),
    diaryPathTemplate: cfg.get<string>('penetration.diaryPath', '.oclive/{roleId}/diary.md'),
    autoDiaryEveryNTurns: cfg.get<number>('penetration.autoDiaryEveryNTurns', 0),
    allowedGlobs: cfg.get<string[]>('penetration.allowedGlobs', ['.oclive/**']),
    previewAfterWrite: cfg.get<boolean>('penetration.previewAfterWrite', true),
    terminalEnabled: cfg.get<boolean>('penetration.terminal.enabled', false),
    idle: {
      enabled: cfg.get<boolean>('penetration.idle.enabled', false),
      seconds: cfg.get<number>('penetration.idle.seconds', 300),
      dailyLimit: cfg.get<number>('penetration.idle.dailyLimit', 3),
    },
    memorySync: {
      enabled: cfg.get<boolean>('penetration.memorySync.enabled', false),
      importance: cfg.get<number>('penetration.memorySync.importance', 0.6),
    },
  };
}

/**
 * Merge chain (low → high): workspace `.oclive/config.json` < role pack templates < user settings.
 * Callers pass role-pack overrides from `readPenetrationTemplates`.
 */
export function mergePenetrationConfig(
  rolePack?: {
    enabled?: boolean;
    diaryPath?: string;
    autoDiaryEveryNTurns?: number;
    allowedGlobs?: string[];
    idleMessage?: string;
  },
): PenetrationConfig {
  const workspace = readWorkspacePenetrationConfig();
  const user = readUserPenetrationSettings();
  const cfg = vscode.workspace.getConfiguration('oclive');

  const userDiaryPath = cfg.get<string>('penetration.diaryPath');
  const userAutoDiary = cfg.get<number>('penetration.autoDiaryEveryNTurns');
  const userGlobs = cfg.get<string[]>('penetration.allowedGlobs');

  return {
    enabled: rolePack?.enabled === false ? false : user.enabled,
    diaryPathTemplate:
      userDiaryPath && userDiaryPath !== '.oclive/{roleId}/diary.md'
        ? userDiaryPath
        : rolePack?.diaryPath ?? user.diaryPathTemplate,
    autoDiaryEveryNTurns:
      userAutoDiary !== undefined && userAutoDiary !== 0
        ? userAutoDiary
        : rolePack?.autoDiaryEveryNTurns ??
          workspace.autoDiaryEveryNTurns ??
          user.autoDiaryEveryNTurns,
    allowedGlobs:
      userGlobs && JSON.stringify(userGlobs) !== JSON.stringify(['.oclive/**'])
        ? userGlobs
        : rolePack?.allowedGlobs ?? workspace.allowedGlobs ?? user.allowedGlobs,
    previewAfterWrite: user.previewAfterWrite,
    terminalEnabled: user.terminalEnabled,
    idle: {
      ...user.idle,
      message: rolePack?.idleMessage,
    },
    memorySync: user.memorySync,
  };
}

/** Effective config for current workspace + optional role pack segment. */
export function readPenetrationConfig(
  rolePack?: Parameters<typeof mergePenetrationConfig>[0],
): PenetrationConfig {
  if (rolePack && Object.keys(rolePack).length > 0) {
    return mergePenetrationConfig(rolePack);
  }
  return mergePenetrationConfig();
}
