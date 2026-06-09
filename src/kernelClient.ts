import { ChildProcess, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { apiBase, OcliveConfig } from './config';
import {
  discoverSpawnKernelCandidates,
  findOclivenewnewRoot,
  promoteToSharedRuntime,
  type KernelCandidate,
  type KernelTier,
  sharedAppDataDir,
} from './discovery';
import { getEffectiveConfig } from './runtimeConfig';
import { normalizeManifest, type KernelManifestJson } from './kernelManifest';
import { terminateListenersOnPort } from './kernelPort';
import {
  computeAllowReplace,
  resolveKernelPlan,
  type KernelActionPlan,
} from './kernelStrategy';
import { profileHintFromPlan, profileHintKeyFromPlan } from './kernelProfileCopy';
import { ensureReadyDecision } from './ensureReadyPolicy';
import { parseKernelErrorResponse, type KernelResult } from './kernelError';
import type { LlmUserSettings, SaveLlmUserSettingsRequest } from './types/llmSettings';
import type { RoleInfo } from './types/roleInfo';

export type { KernelErrorPayload, KernelResult } from './kernelError';
export { KernelApiError, parseKernelErrorResponse } from './kernelError';

export interface KernelHealthJson {
  ok: boolean;
  runtime_api_version?: string;
  schema_migration_version?: number | null;
  kernel_manifest?: KernelManifestJson;
  distro_id?: string | null;
  distro_profile_hash?: string | null;
  active_profile_summary?: {
    distro_id?: string | null;
    enabled_modules?: string[];
    disabled_modules?: string[];
    post_process_profile?: string | null;
    prompt_profile?: string | null;
  } | null;
}

export type KernelMode = 'attached' | 'spawned' | 'offline';

export interface KernelConnectionInfo {
  mode: KernelMode;
  tier?: KernelTier;
  /** Human-readable source label for status bar. */
  sourceLabel?: string;
  binary?: string;
  degraded?: boolean;
  degradeReason?: string;
  replacedExisting?: boolean;
  /** Profile / policy hint for status bar tooltip. */
  policyHint?: string;
  profileHintKey?: string;
}

export interface SessionMeta {
  session_id: string;
  role_id: string;
  scene_id: string;
  created_at: string;
  updated_at: string;
  message_count: number;
  last_message_snippet: string;
}

export interface StoredMessage {
  id: string;
  session_id: string;
  turn_index: number;
  sender: string;
  content: string;
  metadata?: string | null;
  created_at: string;
}

/** Canonical shared app data path (align with desktop OCLIVE_APP_DATA). */
export function getSharedAppDataHint(): string {
  return sharedAppDataDir();
}

function cfg(): OcliveConfig {
  return getEffectiveConfig();
}

export interface ChatRequest {
  rolePath: string;
  message: string;
  sessionId: string;
  sceneId: string;
}

export interface ChatSuccess {
  ok: true;
  reply: string;
  sessionId?: string;
  sceneId?: string;
  personalitySource?: string;
  botEmotion?: string;
  portraitEmotion?: string;
  /** Main dialogue LLM failed; reply is an emergency fallback string. */
  replyIsFallback?: boolean;
  llmFallbackReason?: string;
}

export interface ChatFailure {
  ok: false;
  status: number;
  code?: string;
  message: string;
}

export type ChatResult = ChatSuccess | ChatFailure;

export interface RoleSnapshot {
  role_id: string;
  current_favorability: number;
  current_emotion: string;
  portrait_emotion: string;
  relation_state: string;
  personality_source: string;
  current_scene: string | null;
  user_presence_scene: string | null;
}

export const OCLIVE_DEFAULT_IDENTITY_SENTINEL = '__oclive_default__';

export interface UserIdentityDto {
  id: string;
  display_name: string;
  maps_to_relation_id?: string | null;
}

export interface UserIdentityStateResponse {
  role_id: string;
  identities: UserIdentityDto[];
  default_identity_id: string;
  current_identity_id: string;
  use_manifest_default: boolean;
  effective_relation_key: string;
}

const ENSURE_READY_TTL_MS = 5000;

export class KernelClient {
  private spawned: ChildProcess | null = null;
  private mode: KernelMode = 'offline';
  private connectionInfo: KernelConnectionInfo = { mode: 'offline' };
  private ensureReadyCachedAt = 0;
  private ensureReadyInFlight: Promise<KernelMode> | null = null;

  get connectionMode(): KernelMode {
    return this.mode;
  }

  /** Drop cached attach/spawn state; next ensureReady runs full discovery/plan. */
  invalidateEnsureReady(): void {
    this.ensureReadyCachedAt = 0;
    this.ensureReadyInFlight = null;
  }

  getConnectionInfo(): KernelConnectionInfo {
    return { ...this.connectionInfo, mode: this.mode };
  }

  private setConnection(info: KernelConnectionInfo): void {
    this.mode = info.mode;
    this.connectionInfo = info;
  }

  async checkHealth(config: OcliveConfig = cfg()): Promise<boolean> {
    try {
      const res = await fetch(`${apiBase(config)}/health`, {
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) {
        return false;
      }
      const ct = res.headers.get('content-type') ?? '';
      if (ct.includes('application/json')) {
        const json = (await res.json()) as { ok?: boolean };
        return json.ok === true;
      }
      const text = (await res.text()).trim();
      return text === 'ok';
    } catch {
      return false;
    }
  }

  async fetchHealthJson(config: OcliveConfig = cfg()): Promise<KernelHealthJson | null> {
    try {
      const res = await fetch(`${apiBase(config)}/health`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) {
        return null;
      }
      return (await res.json()) as KernelHealthJson;
    } catch {
      return null;
    }
  }

  /**
   * Capability-first bring-up via Rust SSOT (`oclive kernel ensure --plan-only`).
   * Host-side execution: attach / spawn / replace on this process.
   * Successful attach/spawn is cached briefly; callers otherwise use checkHealth.
   */
  async ensureReady(
    config: OcliveConfig = cfg(),
    opts?: { force?: boolean },
  ): Promise<KernelMode> {
    const decision = ensureReadyDecision({
      force: opts?.force,
      mode: this.mode,
      cachedAt: this.ensureReadyCachedAt,
      now: Date.now(),
      ttlMs: ENSURE_READY_TTL_MS,
    });

    // Recently validated: reuse without any network call. This keeps bursts of
    // calls (e.g. a role switch) from re-running the full oclive-cli plan or
    // respawning the kernel, which is what previously froze the extension.
    if (decision === 'trust') {
      return this.mode;
    }

    // Stale but online: a single cheap /health probe decides keep-vs-replan.
    if (decision === 'revalidate') {
      if (await this.checkHealth(config)) {
        this.ensureReadyCachedAt = Date.now();
        return this.mode;
      }
      this.invalidateEnsureReady();
      this.setConnection({ mode: 'offline' });
    }

    if (!opts?.force && this.ensureReadyInFlight) {
      return this.ensureReadyInFlight;
    }

    const run = this.ensureReadyUncached(config);
    this.ensureReadyInFlight = run;
    try {
      const mode = await run;
      if (mode !== 'offline') {
        this.ensureReadyCachedAt = Date.now();
      }
      return mode;
    } finally {
      if (this.ensureReadyInFlight === run) {
        this.ensureReadyInFlight = null;
      }
    }
  }

  private async ensureReadyUncached(config: OcliveConfig): Promise<KernelMode> {
    const candidates = discoverCandidates(config);
    const allowReplace = await computeAllowReplace(config, candidates);
    const report = await resolveKernelPlan(config, { allowReplace });

    if (!report) {
      return this.ensureReadyFallback(config);
    }

    const plan = report.plan;
    if (plan.action === 'attach' && !config.mockLlm) {
      if (this.spawned) {
        this.spawned = null;
      }
      const health = await this.fetchHealthJson(config);
      const running = health?.kernel_manifest
        ? normalizeManifest(health.kernel_manifest)
        : undefined;
      this.setConnection({
        mode: 'attached',
        sourceLabel: attachLabel(plan, running?.buildProfile, running?.version),
        policyHint: profileHintFromPlan(plan),
        profileHintKey: profileHintKeyFromPlan(plan),
      });
      return this.mode;
    }

    if (plan.action === 'attach' && config.mockLlm) {
      await terminateListenersOnPort(config.apiPort);
      await sleep(400);
    }

    if (this.spawned) {
      this.spawned.kill();
      this.spawned = null;
    }

    if (plan.action === 'replace_and_attach') {
      await terminateListenersOnPort(config.apiPort);
      await sleep(400);
    }

    const spawnTargets = buildSpawnTargetsFromPlan(plan, config);
    if (!spawnTargets.length) {
      this.setConnection({ mode: 'offline' });
      throw new Error('Rust 策略未返回可 spawn 的候选内核');
    }

    let lastErr = 'Kernel did not become ready';
    for (const entry of spawnTargets) {
      const { binary, tier, degraded, degradeReason, replaced } = entry;
      if (!fs.existsSync(binary)) {
        lastErr = `Kernel binary not found: ${binary}`;
        continue;
      }
      const child = this.spawnKernel({ ...config, kernelBinary: binary });
      for (let i = 0; i < 40; i++) {
        await sleep(500);
        if (await this.checkHealth(config)) {
          this.setConnection({
            mode: 'spawned',
            tier,
            binary,
            sourceLabel: degraded
              ? '降级内核'
              : replaced
                ? `已替换 · ${tierLabel(tier)}`
                : tierLabel(tier),
            degraded,
            degradeReason,
            replacedExisting: replaced,
            policyHint: profileHintFromPlan(plan),
            profileHintKey: replaced
              ? 'replaced_for_profile'
              : degraded
                ? 'degraded'
                : profileHintKeyFromPlan(plan),
          });
          return this.mode;
        }
      }
      child.kill();
      this.spawned = null;
      lastErr = `Spawned ${binary} but /health did not become ready`;
    }

    if (plan.action === 'replace_and_attach' && (await this.checkHealth(config))) {
      this.setConnection({
        mode: 'attached',
        sourceLabel: 'attach（替换失败，沿用现有）',
      });
      return this.mode;
    }

    this.setConnection({ mode: 'offline' });
    throw new Error(lastErr);
  }

  /** When `oclive-cli` is unavailable: attach if compatible, else spawn best candidate. */
  private async ensureReadyFallback(config: OcliveConfig): Promise<KernelMode> {
    const health = await this.fetchHealthJson(config);
    if (
      health?.ok &&
      profileLikelyCompatibleForVscode(health) &&
      !config.mockLlm
    ) {
      if (this.spawned) {
        this.spawned = null;
      }
      this.setConnection({
        mode: 'attached',
        sourceLabel: 'attach（无 CLI 策略）',
        policyHint: health.distro_id && health.distro_id !== 'vscode'
          ? '运行内核 distro 非 vscode，建议 build oclive-cli 以自动替换'
          : undefined,
      });
      return this.mode;
    }

    const candidates = discoverCandidates(config);
    if (candidates.length > 0) {
      let lastErr = 'Kernel did not become ready';
      for (const entry of candidates) {
        const { binary, tier } = entry;
        if (!fs.existsSync(binary)) {
          lastErr = `Kernel binary not found: ${binary}`;
          continue;
        }
        const child = this.spawnKernel({ ...config, kernelBinary: binary });
        for (let i = 0; i < 40; i++) {
          await sleep(500);
          if (await this.checkHealth(config)) {
            this.setConnection({
              mode: 'spawned',
              tier,
              binary,
              sourceLabel: `spawn（无 CLI 策略）· ${tierLabel(tier)}`,
            });
            return this.mode;
          }
        }
        child.kill();
        this.spawned = null;
        lastErr = `Spawned ${binary} but /health did not become ready`;
      }
      this.setConnection({ mode: 'offline' });
      throw new Error(lastErr);
    }

    this.setConnection({ mode: 'offline' });
    const repoHint = findOclivenewnewRoot([config.extensionPath ?? '', process.cwd()]);
    const buildHint = repoHint
      ? `请在 ${repoHint} 运行: cargo build -p oclive-cli -p oclive-kernel-server`
      : '请 clone oclivenewnew 并运行: cargo build -p oclive-cli -p oclive-kernel-server';
    throw new Error(`未找到 oclive-cli 且无法 attach/spawn 内核。${buildHint}`);
  }

  private spawnKernel(config: OcliveConfig): ChildProcess {
    if (this.spawned) {
      this.spawned.kill();
      this.spawned = null;
    }

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      OCLIVE_API_PORT: String(config.apiPort),
    };
    if (config.rolesDir) {
      env.OCLIVE_ROLES_DIR = config.rolesDir;
    }
    env.OCLIVE_APP_DATA = sharedAppDataDir();
    env.OCLIVE_USE_CANONICAL_APP_DATA = '1';
    if (config.mockLlm) {
      env.OCLIVE_HTTP_API_MOCK_LLM = '1';
    }
    const distro = distroSpawnEnv(config.extensionPath);
    Object.assign(env, distro);

    const args = ['--api', '--port', String(config.apiPort)];
    this.spawned = spawn(config.kernelBinary, args, {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    this.spawned.stdout?.on('data', (chunk: Buffer) => {
      console.log('[oclive-kernel]', chunk.toString());
    });
    this.spawned.stderr?.on('data', (chunk: Buffer) => {
      console.error('[oclive-kernel]', chunk.toString());
    });
    this.spawned.on('exit', (code) => {
      console.log('[oclive-kernel] exited', code);
      this.spawned = null;
      if (this.mode === 'spawned') {
        this.invalidateEnsureReady();
        this.setConnection({ mode: 'offline' });
      }
    });
    return this.spawned;
  }

  async chat(req: ChatRequest, config: OcliveConfig = cfg()): Promise<ChatResult> {
    await this.ensureReady(config);

    const res = await fetch(`${apiBase(config)}/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        role_path: req.rolePath,
        message: req.message,
        session_id: req.sessionId,
        scene_id: req.sceneId,
      }),
      signal: AbortSignal.timeout(120_000),
    });

    const body = (await res.json()) as Record<string, unknown>;

    if (!res.ok) {
      if (res.status >= 500 || res.status === 0) {
        this.invalidateEnsureReady();
        this.setConnection({ mode: 'offline' });
      }
      const err = body.error as { code?: string; message?: string } | undefined;
      return {
        ok: false,
        status: res.status,
        code: err?.code,
        message: err?.message ?? `HTTP ${res.status}`,
      };
    }

    const reply = body.reply;
    if (typeof reply !== 'string' || !reply.length) {
      return { ok: false, status: res.status, message: 'Missing reply in response' };
    }

    const replyIsFallback = body.reply_is_fallback === true;
    const llmFallbackReason =
      typeof body.llm_fallback_reason === 'string' ? body.llm_fallback_reason : undefined;

    return {
      ok: true,
      reply,
      sessionId: typeof body.session_id === 'string' ? body.session_id : undefined,
      sceneId: typeof body.scene_id === 'string' ? body.scene_id : undefined,
      personalitySource:
        typeof body.personality_source === 'string' ? body.personality_source : undefined,
      botEmotion: typeof body.bot_emotion === 'string' ? body.bot_emotion : undefined,
      portraitEmotion:
        typeof body.portrait_emotion === 'string' ? body.portrait_emotion : undefined,
      replyIsFallback,
      llmFallbackReason,
    };
  }

  async fetchRoleSnapshot(
    roleId: string,
    sceneId: string | undefined,
    config: OcliveConfig = cfg(),
  ): Promise<RoleSnapshot | null> {
    if (!(await this.checkHealth(config))) {
      return null;
    }
    const params = new URLSearchParams({ role_id: roleId });
    if (sceneId) {
      params.set('scene_id', sceneId);
    }
    try {
      const res = await fetch(`${apiBase(config)}/role_snapshot?${params.toString()}`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) {
        return null;
      }
      return (await res.json()) as RoleSnapshot;
    } catch {
      return null;
    }
  }

  async fetchRoleInfo(
    roleId: string,
    config: OcliveConfig = cfg(),
    sessionId?: string,
  ): Promise<RoleInfo | null> {
    if (!(await this.checkHealth(config))) {
      return null;
    }
    const params = new URLSearchParams({ role_id: roleId });
    if (sessionId) {
      params.set('session_id', sessionId);
    }
    try {
      const res = await fetch(`${apiBase(config)}/role_info?${params.toString()}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        return null;
      }
      return (await res.json()) as RoleInfo;
    } catch {
      return null;
    }
  }

  async loadRole(roleId: string, config: OcliveConfig = cfg()): Promise<boolean> {
    await this.ensureReady(config);
    try {
      const res = await fetch(`${apiBase(config)}/role/load`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ role_id: roleId }),
        signal: AbortSignal.timeout(8000),
      });
      return res.ok || res.status === 204;
    } catch {
      return false;
    }
  }

  async getLlmUserSettings(
    roleId: string,
    sessionId?: string,
    config: OcliveConfig = cfg(),
  ): Promise<LlmUserSettings | null> {
    await this.ensureReady(config);
    const params = new URLSearchParams({ role_id: roleId });
    if (sessionId) {
      params.set('session_id', sessionId);
    }
    try {
      const res = await fetch(`${apiBase(config)}/llm/user_settings?${params.toString()}`, {
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        return null;
      }
      return (await res.json()) as LlmUserSettings;
    } catch {
      return null;
    }
  }

  async saveLlmUserSettings(
    req: SaveLlmUserSettingsRequest,
    config: OcliveConfig = cfg(),
  ): Promise<KernelResult<RoleInfo>> {
    await this.ensureReady(config);
    try {
      const res = await fetch(`${apiBase(config)}/llm/user_settings`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          roleId: req.roleId,
          sessionId: req.sessionId ?? null,
          provider: req.provider,
          cloudApiStyle: req.cloudApiStyle,
          ollamaBaseUrl: req.ollamaBaseUrl,
          ollamaModel: req.ollamaModel ?? null,
          remoteUrl: req.remoteUrl,
          remoteToken: req.remoteToken,
          remoteModel: req.remoteModel,
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        return { ok: false, error: await parseKernelErrorResponse(res) };
      }
      return { ok: true, data: (await res.json()) as RoleInfo };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { ok: false, error: { code: 'NETWORK_ERROR', message } };
    }
  }

  async listOllamaModels(
    ollamaBaseUrl?: string,
    config: OcliveConfig = cfg(),
  ): Promise<KernelResult<string[]>> {
    await this.ensureReady(config);
    const params = new URLSearchParams();
    if (ollamaBaseUrl?.trim()) {
      params.set('ollama_base_url', ollamaBaseUrl.trim());
    }
    const qs = params.toString();
    const url = `${apiBase(config)}/llm/ollama_models${qs ? `?${qs}` : ''}`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) {
        return { ok: false, error: await parseKernelErrorResponse(res) };
      }
      return { ok: true, data: (await res.json()) as string[] };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { ok: false, error: { code: 'NETWORK_ERROR', message } };
    }
  }

  async setSessionOllamaModel(
    roleId: string,
    model: string | null,
    sessionId?: string,
    config: OcliveConfig = cfg(),
  ): Promise<KernelResult<RoleInfo>> {
    await this.ensureReady(config);
    try {
      const res = await fetch(`${apiBase(config)}/llm/session_model`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          roleId,
          sessionId: sessionId ?? null,
          model,
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        return { ok: false, error: await parseKernelErrorResponse(res) };
      }
      return { ok: true, data: (await res.json()) as RoleInfo };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { ok: false, error: { code: 'NETWORK_ERROR', message } };
    }
  }

  async listHighRiskGrants(
    config: OcliveConfig = cfg(),
  ): Promise<KernelResult<Record<string, unknown>>> {
    await this.ensureReady(config);
    try {
      const res = await fetch(`${apiBase(config)}/high_risk/grants`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        return { ok: false, error: await parseKernelErrorResponse(res) };
      }
      return { ok: true, data: (await res.json()) as Record<string, unknown> };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { ok: false, error: { code: 'NETWORK_ERROR', message } };
    }
  }

  async grantHighRiskCapability(
    kind: string,
    id: string,
    config: OcliveConfig = cfg(),
  ): Promise<KernelResult<void>> {
    await this.ensureReady(config);
    try {
      const res = await fetch(`${apiBase(config)}/high_risk/grant`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind, id }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        return { ok: false, error: await parseKernelErrorResponse(res) };
      }
      return { ok: true, data: undefined };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { ok: false, error: { code: 'NETWORK_ERROR', message } };
    }
  }

  async reloadLlm(config: OcliveConfig = cfg()): Promise<boolean> {
    await this.ensureReady(config);
    try {
      const res = await fetch(`${apiBase(config)}/llm/reload`, {
        method: 'POST',
        signal: AbortSignal.timeout(10000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async getUserIdentityState(
    roleId: string,
    sceneId?: string,
    config: OcliveConfig = cfg(),
  ): Promise<UserIdentityStateResponse | null> {
    await this.ensureReady(config);
    const params = new URLSearchParams({ role_id: roleId });
    if (sceneId) {
      params.set('scene_id', sceneId);
    }
    try {
      const res = await fetch(`${apiBase(config)}/user_identity/state?${params.toString()}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        return null;
      }
      return (await res.json()) as UserIdentityStateResponse;
    } catch {
      return null;
    }
  }

  /** @deprecated Prefer {@link setSceneUserIdentity} when the host uses per-scene identity binding. */
  async setUserIdentity(
    roleId: string,
    identityId: string,
    config: OcliveConfig = cfg(),
  ): Promise<UserIdentityStateResponse | null> {
    await this.ensureReady(config);
    try {
      const res = await fetch(`${apiBase(config)}/user_identity/set`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ role_id: roleId, identity_id: identityId }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        return null;
      }
      return (await res.json()) as UserIdentityStateResponse;
    } catch {
      return null;
    }
  }

  async setSceneUserIdentity(
    roleId: string,
    sceneId: string,
    identityId: string,
    config: OcliveConfig = cfg(),
  ): Promise<UserIdentityStateResponse | null> {
    await this.ensureReady(config);
    try {
      const res = await fetch(`${apiBase(config)}/user_identity/scene_set`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          role_id: roleId,
          scene_id: sceneId,
          identity_id: identityId,
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        return null;
      }
      return (await res.json()) as UserIdentityStateResponse;
    } catch {
      return null;
    }
  }

  async listChatSessions(
    roleId: string,
    sceneId: string,
    config: OcliveConfig = cfg(),
    limit = 50,
    offset = 0,
  ): Promise<SessionMeta[]> {
    await this.ensureReady(config);
    const params = new URLSearchParams({
      role_id: roleId,
      scene_id: sceneId,
      limit: String(limit),
      offset: String(offset),
    });
    try {
      const res = await fetch(`${apiBase(config)}/chat/sessions?${params.toString()}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        return [];
      }
      return (await res.json()) as SessionMeta[];
    } catch {
      return [];
    }
  }

  async fetchChatMessages(
    sessionId: string,
    config: OcliveConfig = cfg(),
    limit = 500,
    offset = 0,
  ): Promise<StoredMessage[]> {
    await this.ensureReady(config);
    const params = new URLSearchParams({
      session_id: sessionId,
      limit: String(limit),
      offset: String(offset),
    });
    try {
      const res = await fetch(`${apiBase(config)}/chat/messages?${params.toString()}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        return [];
      }
      return (await res.json()) as StoredMessage[];
    } catch {
      return [];
    }
  }

  dispose(): void {
    if (this.spawned) {
      this.spawned.kill();
      this.spawned = null;
    }
    this.invalidateEnsureReady();
    this.setConnection({ mode: 'offline' });
  }
}

interface SpawnTarget {
  binary: string;
  tier: KernelTier;
  degraded?: boolean;
  degradeReason?: string;
  replaced?: boolean;
}

function discoverCandidates(config: OcliveConfig): KernelCandidate[] {
  const settingsBinary = config.kernelBinaryPinned ? config.kernelBinary : undefined;
  return discoverSpawnKernelCandidates(config.extensionPath ?? '', settingsBinary);
}

function buildSpawnTargetsFromPlan(plan: KernelActionPlan, config: OcliveConfig): SpawnTarget[] {
  const c = plan.candidate;
  if (!c?.binary) {
    return [];
  }
  let binary = c.binary;
  if (c.promote_to_shared) {
    const promoted = promoteToSharedRuntime(binary);
    if (promoted) {
      binary = promoted;
    }
  }
  const tier = c.tier;
  const degraded = plan.degraded || c.degraded;
  const degradeReason =
    plan.degrade_reason ?? c.degrade_reason ?? undefined;
  return [
    {
      binary,
      tier,
      degraded,
      degradeReason: degradeReason ?? undefined,
      replaced: plan.action === 'replace_and_attach',
    },
  ];
}

function attachLabel(
  plan: KernelActionPlan,
  buildProfile?: string,
  version?: string,
): string {
  switch (plan.attach_reason) {
    case 'kernel_pinned':
      return 'attach（用户指定内核）';
    case 'kernel_pinned_profile_mismatch':
      return 'attach（内核已 pin，profile 不匹配）';
    case 'profile_mismatch_no_replace':
      return 'attach（profile 不匹配，未允许替换）';
    case 'profile_compatible':
      return buildProfile && version
        ? `attach · profile 兼容 · ${buildProfile} v${version}`
        : 'attach · profile 兼容';
    case 'legacy_fallback':
      return 'attach（降级回退）';
    case 'running_kernel_ok':
    default:
      return buildProfile && version
        ? `attach · ${buildProfile} v${version}`
        : 'attach';
  }
}

function profileLikelyCompatibleForVscode(health: KernelHealthJson): boolean {
  const summary = health.active_profile_summary;
  if (summary?.enabled_modules) {
    return !summary.enabled_modules.includes('agent');
  }
  if (summary?.disabled_modules) {
    return summary.disabled_modules.includes('agent');
  }
  return health.distro_id === 'vscode';
}

function tierLabel(tier: KernelTier): string {
  switch (tier) {
    case 'shared':
      return '共享 runtime';
    case 'dev-full':
      return 'dev 完整构建';
    case 'dev-headless':
      return 'dev headless';
    case 'bundled':
      return '扩展 bin/';
    case 'settings':
      return '用户指定';
    case 'env':
      return 'OCLIVE_KERNEL_BINARY';
    default:
      return tier;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** P4: pass distro capability profile to spawned kernel (see `distro.oclive.toml`). */
function distroSpawnEnv(extensionPath?: string): Record<string, string> {
  if (!extensionPath) {
    return {};
  }
  const profile = path.join(extensionPath, 'distro.oclive.toml');
  if (!fs.existsSync(profile)) {
    return {};
  }
  return {
    OCLIVE_DISTRO_ID: 'vscode',
    OCLIVE_DISTRO_PROFILE: profile,
  };
}
