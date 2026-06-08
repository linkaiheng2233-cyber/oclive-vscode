import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/** PIDs listening on `127.0.0.1:port` (best effort). */
export async function findListenerPids(port: number): Promise<number[]> {
  if (process.platform === 'win32') {
    try {
      const { stdout } = await execFileAsync('netstat', ['-ano'], { windowsHide: true });
      const pids = new Set<number>();
      for (const line of stdout.split(/\r?\n/)) {
        if (!line.includes(`:${port}`) || !line.includes('LISTENING')) {
          continue;
        }
        const parts = line.trim().split(/\s+/);
        const pid = parseInt(parts[parts.length - 1] ?? '', 10);
        if (Number.isFinite(pid) && pid > 0) {
          pids.add(pid);
        }
      }
      return [...pids];
    } catch {
      return [];
    }
  }

  try {
    const { stdout } = await execFileAsync('lsof', ['-ti', `:${port}`, '-sTCP:LISTEN']);
    return stdout
      .split(/\r?\n/)
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n) && n > 0);
  } catch {
    return [];
  }
}

export async function readProcessCommandLine(pid: number): Promise<string | undefined> {
  if (process.platform === 'win32') {
    try {
      const { stdout } = await execFileAsync(
        'powershell',
        [
          '-NoProfile',
          '-Command',
          `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}" -ErrorAction SilentlyContinue).CommandLine`,
        ],
        { windowsHide: true },
      );
      const line = stdout.trim();
      return line.length ? line : undefined;
    } catch {
      return undefined;
    }
  }

  try {
    const cmdlinePath = `/proc/${pid}/cmdline`;
    if (!fs.existsSync(cmdlinePath)) {
      return undefined;
    }
    return fs.readFileSync(cmdlinePath, 'utf8').replace(/\0/g, ' ').trim() || undefined;
  } catch {
    return undefined;
  }
}

/** True when the listener looks spawned by VS Code / desktop / shared runtime, not an ad-hoc shell. */
export async function isKnownDistributionKernel(
  port: number,
  knownBinaryPaths: string[],
): Promise<boolean> {
  const pids = await findListenerPids(port);
  if (!pids.length) {
    return true;
  }

  const normalizedKnown = knownBinaryPaths
    .filter(Boolean)
    .map((p) => path.resolve(p).toLowerCase());

  for (const pid of pids) {
    const cmd = (await readProcessCommandLine(pid))?.toLowerCase() ?? '';
    if (!cmd) {
      continue;
    }
    const matchesKnown = normalizedKnown.some((bin) => cmd.includes(bin));
    if (matchesKnown) {
      return true;
    }
    if (
      cmd.includes('oclive-kernel-server') ||
      cmd.includes('oclivenewnew-tauri') ||
      cmd.includes(`${path.sep}oclive${path.sep}runtime${path.sep}`)
    ) {
      return true;
    }
  }

  return false;
}

export async function terminateListenersOnPort(port: number, excludePid?: number): Promise<void> {
  const pids = await findListenerPids(port);
  for (const pid of pids) {
    if (excludePid != null && pid === excludePid) {
      continue;
    }
    try {
      if (process.platform === 'win32') {
        await execFileAsync('taskkill', ['/PID', String(pid), '/F'], { windowsHide: true });
      } else {
        process.kill(pid, 'SIGTERM');
      }
    } catch {
      /* best effort */
    }
  }
}
