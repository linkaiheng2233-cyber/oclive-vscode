/**
 * Local smoke: health → spawn (if needed) → POST /chat (scene_id=vscode).
 * Mirrors oclive-vscode extension Phase 1 path.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const PORT = Number(process.env.OCLIVE_API_PORT || 8420);
const BASE = `http://127.0.0.1:${PORT}`;
const ROLES_DIR = resolve(process.env.OCLIVE_ROLES_DIR || join('..', 'oclivenewnew', 'roles'));
const ROLE_PATH = join(ROLES_DIR, 'mumu');
const KERNEL = resolve(
  process.env.OCLIVE_KERNEL_BINARY ||
    '../oclive-dev-artifacts/oclivenewnew-cargo-target/debug/oclive-kernel-server.exe',
);

async function health() {
  try {
    const res = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(3000) });
    const text = (await res.text()).trim();
    return res.ok && text === 'ok';
  } catch {
    return false;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  let child = null;
  let mode = 'attached';

  if (!(await health())) {
    if (!existsSync(KERNEL)) {
      console.error('FAIL: kernel binary not found:', KERNEL);
      process.exit(1);
    }
    console.log('spawn:', KERNEL);
    child = spawn(KERNEL, ['--api', '--port', String(PORT)], {
      env: {
        ...process.env,
        OCLIVE_ROLES_DIR: ROLES_DIR,
        OCLIVE_API_PORT: String(PORT),
        OCLIVE_HTTP_API_MOCK_LLM: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    child.stderr?.on('data', (d) => process.stderr.write(d));
    mode = 'spawned';

    for (let i = 0; i < 40; i++) {
      if (await health()) break;
      await sleep(500);
    }
    if (!(await health())) {
      console.error('FAIL: /health never ready');
      child.kill();
      process.exit(1);
    }
  }

  console.log('OK: health', mode);

  const sessionId = 'vscode-smoke-' + Date.now();
  const body = {
    role_path: ROLE_PATH,
    message: 'VS Code 联调 smoke：你好',
    session_id: sessionId,
    scene_id: 'vscode',
  };

  const res = await fetch(`${BASE}/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  const json = await res.json();

  if (!res.ok) {
    console.error('FAIL: chat', res.status, JSON.stringify(json));
    if (child) child.kill();
    process.exit(1);
  }

  if (typeof json.reply !== 'string' || !json.reply.length) {
    console.error('FAIL: missing reply', json);
    if (child) child.kill();
    process.exit(1);
  }

  console.log('OK: chat reply length', json.reply.length);
  console.log('OK: scene_id', json.scene_id);
  console.log('OK: session_id', json.session_id);
  console.log('reply preview:', json.reply.slice(0, 120));

  if (child) {
    child.kill();
    await sleep(300);
  }

  console.log('\n=== SMOKE PASSED (health → spawn → chat) ===');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
