import * as vscode from 'vscode';
import { getConfig } from './config';
import { applyAutoDiscovery } from './runtimeConfig';

/** Ensure roles (and optionally kernel) paths; auto-discover by default. */
export async function ensureSetup(context: vscode.ExtensionContext): Promise<boolean> {
  const cfg = vscode.workspace.getConfiguration('oclive');
  const auto = cfg.get<boolean>('autoDiscover', true);

  if (auto) {
    const ok = await applyAutoDiscovery(context, { silent: true });
    if (ok) {
      return true;
    }
  }

  if (getConfig().rolesDir) {
    return true;
  }

  return applyAutoDiscovery(context, { silent: false, forcePrompt: true });
}
