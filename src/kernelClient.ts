import { ChildProcess, spawn } from 'child_process';
import * as fs from 'fs';
import { apiBase, OcliveConfig } from './config';
import { sharedAppDataDir } from './discovery';
import { getEffectiveConfig } from './runtimeConfig';

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
      const text = (await res.text()).trim();
      return text === 'ok';
    } catch {
      return false;
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
