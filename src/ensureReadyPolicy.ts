/**
 * Pure decision logic for {@link KernelClient.ensureReady} caching.
 *
 * Kept free of `vscode` / `fetch` / `child_process` imports so it can be unit
 * tested with plain Node (see `scripts/test-unit.mjs`).
 */

export type EnsureReadyMode = 'attached' | 'spawned' | 'offline';

/**
 * - `trust`: connection was validated within the TTL window; reuse it without
 *   any network call (fast path during bursts like a role switch).
 * - `revalidate`: connection is stale; do a single cheap `/health` check and
 *   keep the existing mode if it still answers. Only fall back to `replan`
 *   when health fails.
 * - `replan`: run the full discovery / `oclive-cli` plan (attach/spawn/replace).
 */
export type EnsureReadyDecision = 'trust' | 'revalidate' | 'replan';

export interface EnsureReadyDecisionParams {
  force?: boolean;
  mode: EnsureReadyMode;
  cachedAt: number;
  now: number;
  ttlMs: number;
}

/**
 * Decide how aggressively `ensureReady` should re-establish the kernel link.
 *
 * The key property (and the fix for the settings-side role-switch freeze):
 * a healthy, recently validated connection is *trusted* and never triggers a
 * full `oclive-cli` re-plan or a kernel respawn. Re-planning only happens when
 * we are offline, the cheap health check fails, or the caller forces it.
 */
export function ensureReadyDecision(params: EnsureReadyDecisionParams): EnsureReadyDecision {
  const { force, mode, cachedAt, now, ttlMs } = params;
  if (force) {
    return 'replan';
  }
  if (mode === 'offline' || cachedAt <= 0) {
    return 'replan';
  }
  if (now - cachedAt < ttlMs) {
    return 'trust';
  }
  return 'revalidate';
}
