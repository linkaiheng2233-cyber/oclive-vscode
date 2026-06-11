import { apiBase, type OcliveConfig } from './config';
import type { KernelClient, KernelHealthJson } from './kernelClient';

/** True when kernel profile has Agent module enabled (vscode-agent profile). */
export async function isAgentProfileEnabled(
  kernel: KernelClient,
  config: OcliveConfig,
): Promise<boolean> {
  try {
    await kernel.ensureReady(config);
    const res = await fetch(`${apiBase(config)}/health`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      return false;
    }
    const health = (await res.json()) as KernelHealthJson;
    const disabled = health.active_profile_summary?.disabled_modules ?? [];
    return !disabled.includes('agent');
  } catch {
    return false;
  }
}
