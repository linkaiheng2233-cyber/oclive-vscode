import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

export interface WorkspacePenetrationOverrides {
  allowedGlobs?: string[];
  autoDiaryEveryNTurns?: number;
}

/** Read `.oclive/config.json` → `penetration` (lowest priority in merge chain). */
export function readWorkspacePenetrationConfig(
  folder?: vscode.WorkspaceFolder,
): WorkspacePenetrationOverrides {
  const ws = folder ?? vscode.workspace.workspaceFolders?.[0];
  if (!ws) {
    return {};
  }
  const configPath = path.join(ws.uri.fsPath, '.oclive', 'config.json');
  if (!fs.existsSync(configPath)) {
    return {};
  }
  try {
    const root = JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
      penetration?: Record<string, unknown>;
    };
    const section = root.penetration;
    if (!section || typeof section !== 'object') {
      return {};
    }
    const out: WorkspacePenetrationOverrides = {};
    if (Array.isArray(section.allowed_globs)) {
      out.allowedGlobs = section.allowed_globs.filter((g): g is string => typeof g === 'string');
    }
    if (typeof section.auto_diary_every_n_turns === 'number') {
      out.autoDiaryEveryNTurns = section.auto_diary_every_n_turns;
    }
    return out;
  } catch {
    return {};
  }
}
