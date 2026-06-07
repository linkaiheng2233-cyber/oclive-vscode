import { ChildProcess, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { apiBase, OcliveConfig } from './config';
import { sharedAppDataDir } from './discovery';
import { getEffectiveConfig } from './runtimeConfig';
import type { LlmUserSettings, SaveLlmUserSettingsRequest } from './types/llmSettings';
import type { RoleInfo } from './types/roleInfo';

export interface KernelHealthJson {
  ok: boolean;
  runtime_api_version?: string;
  schema_migration_version?: number | null;
  kernel_manifest?: {
    version?: string;
    build_profile?: string;
    git_commit?: string;
  };
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

export type KernelMode = 'attached' | 'spawned' | 'offline';

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

export interface RoleInfoSummary {
  identity_binding?: 'global' | 'per_scene';
  reply_post_processor_enabled?: boolean;
  reply_post_processor_backend?: string;
  reply_post_processor_profile?: string | null;
}

/** @deprecated Use {@link RoleInfo} from `./types/roleInfo`. */
export type { RoleInfo };

export class KernelClient {
  private spawned: ChildProcess | null = null;
  private mode: KernelMode = 'offline';

  get connectionMode(): KernelMode {
    return this.mode;
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

  /** Attach if healthy; otherwise spawn when binary is configured. */
  async ensureReady(config: OcliveConfig = cfg()): Promise<KernelMode> {
    if (await this.checkHealth(config)) {
      if (this.spawned) {
        // Port occupied by external daemon — do not double-spawn; drop our dead child ref.
        this.spawned = null;
      }
      this.mode = 'attached';
      return this.mode;
    }

    if (this.spawned) {
      // Was spawned but health lost — reset so we can retry.
      this.spawned.kill();
      this.spawned = null;
    }

    const binaries = spawnCandidates(config);
    if (!binaries.length) {
      this.mode = 'offline';
      throw new Error(
        `内核未在 :${config.apiPort} 响应，且未找到可启动的二进制。请打开含 oclivenewnew 的工作区，或运行 scripts/bundle-kernel.ps1 将内核放入扩展 bin/。`,
      );
    }

    let lastErr = 'Kernel did not become ready';
    for (const binary of binaries) {
      if (!fs.existsSync(binary)) {
        lastErr = `Kernel binary not found: ${binary}`;
        continue;
      }
      const child = this.spawnKernel({ ...config, kernelBinary: binary });
      for (let i = 0; i < 30; i++) {
        await sleep(500);
        if (await this.checkHealth(config)) {
          this.mode = 'spawned';
          return this.mode;
        }
      }
      child.kill();
      this.spawned = null;
      lastErr = `Spawned ${binary} but /health did not become ready`;
    }

    this.mode = 'offline';
    throw new Error(lastErr);
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
        this.mode = 'offline';
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
  ): Promise<RoleInfo | null> {
    await this.ensureReady(config);
    try {
      const res = await fetch(`${apiBase(config)}/llm/user_settings`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          roleId: req.roleId,
          sessionId: req.sessionId ?? null,
          provider: req.provider,
          ollamaBaseUrl: req.ollamaBaseUrl,
          ollamaModel: req.ollamaModel ?? null,
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        return null;
      }
      return (await res.json()) as RoleInfo;
    } catch {
      return null;
    }
  }

  async listOllamaModels(
    ollamaBaseUrl?: string,
    config: OcliveConfig = cfg(),
  ): Promise<string[]> {
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
        return [];
      }
      return (await res.json()) as string[];
    } catch {
      return [];
    }
  }

  async setSessionOllamaModel(
    roleId: string,
    model: string | null,
    sessionId?: string,
    config: OcliveConfig = cfg(),
  ): Promise<RoleInfo | null> {
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
        return null;
      }
      return (await res.json()) as RoleInfo;
    } catch {
      return null;
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
    this.mode = 'offline';
  }
}

function spawnCandidates(config: OcliveConfig): string[] {
  const out: string[] = [];
  if (config.kernelBinary) {
    out.push(config.kernelBinary);
  }
  const fb = config.kernelFallbackBinary?.trim();
  if (fb && fb !== config.kernelBinary) {
    out.push(fb);
  }
  return out;
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
