import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { listRoleIds } from './rolePack';

export type KernelTier = 'shared' | 'dev-full' | 'dev-headless' | 'bundled' | 'settings' | 'env';

export interface KernelCandidate {
  binary: string;
  tier: KernelTier;
  /** Higher = prefer when choosing spawn binary (not when attaching). */
  score: number;
  /** e.g. `--api` for tauri desktop binary */
  extraArgs?: string[];
}

export interface ResolvedEnvironment {
  rolesDir: string;
  kernelBinary: string;
  /** Distro-bundled binary when primary is shared/dev (degrade path). */
  kernelFallbackBinary?: string;
  kernelTier: KernelTier;
  kernelSource: string;
}

const SHARED_RUNTIME_DIR = path.join(
  process.env.LOCALAPPDATA || process.env.APPDATA || os.homedir(),
  'OCLive',
  'runtime',
);

export function sharedKernelPath(): string {
  const name = process.platform === 'win32' ? 'oclive-kernel-server.exe' : 'oclive-kernel-server';
  return path.join(SHARED_RUNTIME_DIR, name);
}

function isExecutable(p: string): boolean {
  try {
    return fs.existsSync(p) && fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function hasRolePacks(rolesRoot: string): boolean {
  return listRoleIds(rolesRoot).length > 0;
}

function walkParents(start: string, max = 8): string[] {
  const out: string[] = [];
  let cur = path.resolve(start);
  for (let i = 0; i < max; i++) {
    out.push(cur);
    const parent = path.dirname(cur);
    if (parent === cur) {
      break;
    }
    cur = parent;
  }
  return out;
}

function findOclivenewnewRoot(anchors: string[]): string | undefined {
  for (const anchor of anchors) {
    for (const dir of walkParents(anchor)) {
      const marker = path.join(dir, 'src-tauri', 'Cargo.toml');
      const roles = path.join(dir, 'roles');
      if (fs.existsSync(marker) && fs.existsSync(roles)) {
        return dir;
      }
    }
  }
  return undefined;
}

/** Mirror host `resolve_roles_dir` priority (subset for VS Code). */
export function discoverRolesDir(anchors: string[], envOverride?: string): string | undefined {
  const fromEnv = (envOverride ?? process.env.OCLIVE_ROLES_DIR ?? '').trim();
  if (fromEnv && fs.existsSync(fromEnv) && hasRolePacks(fromEnv)) {
    return path.resolve(fromEnv);
  }

  for (const anchor of anchors) {
    const cwdRoles = path.join(anchor, 'roles');
    if (hasRolePacks(cwdRoles)) {
      return cwdRoles;
    }
  }

  const repo = findOclivenewnewRoot(anchors);
  if (repo) {
    const roles = path.join(repo, 'roles');
    if (hasRolePacks(roles)) {
      return roles;
    }
  }

  for (const anchor of anchors) {
    for (const dir of walkParents(anchor)) {
      const sibling = path.join(dir, 'oclivenewnew', 'roles');
      if (hasRolePacks(sibling)) {
        return sibling;
      }
    }
  }

  return undefined;
}

function kernelExe(baseName: string): string {
  return process.platform === 'win32' ? `${baseName}.exe` : baseName;
}

function devKernelCandidates(repoRoot: string): KernelCandidate[] {
  const out: KernelCandidate[] = [];
  const targetRoots = [
    path.join(repoRoot, '..', 'oclive-dev-artifacts', 'oclivenewnew-cargo-target'),
    path.join(repoRoot, 'target'),
    path.join(repoRoot, '..', 'target'),
  ];

  for (const root of targetRoots) {
    for (const profile of ['debug', 'release'] as const) {
      const tauri = path.join(root, profile, kernelExe('oclivenewnew-tauri'));
      const headless = path.join(root, profile, kernelExe('oclive-kernel-server'));
      const tauriScore = profile === 'debug' ? 95 : 94;
      const headlessScore = profile === 'debug' ? 90 : 89;
      if (isExecutable(tauri)) {
        out.push({ binary: tauri, tier: 'dev-full', score: tauriScore, extraArgs: ['--api'] });
      }
      if (isExecutable(headless)) {
        out.push({ binary: headless, tier: 'dev-headless', score: headlessScore });
      }
    }
  }
  return out;
}

export function discoverKernelCandidates(
  extensionPath: string,
  settingsBinary?: string,
): KernelCandidate[] {
  const candidates: KernelCandidate[] = [];

  const fromEnv = (process.env.OCLIVE_KERNEL_BINARY ?? '').trim();
  if (fromEnv && isExecutable(fromEnv)) {
    candidates.push({ binary: fromEnv, tier: 'env', score: 100 });
  }

  if (settingsBinary && isExecutable(settingsBinary)) {
    candidates.push({ binary: settingsBinary, tier: 'settings', score: 85 });
  }

  const shared = sharedKernelPath();
  if (isExecutable(shared)) {
    candidates.push({ binary: shared, tier: 'shared', score: 88 });
  }

  const bundled = path.join(
    extensionPath,
    'bin',
    process.platform === 'win32' ? 'oclive-kernel-server.exe' : 'oclive-kernel-server',
  );
  if (isExecutable(bundled)) {
    candidates.push({ binary: bundled, tier: 'bundled', score: 50 });
  }

  const repo = findOclivenewnewRoot([extensionPath, process.cwd()]);
  if (repo) {
    candidates.push(...devKernelCandidates(repo));
  }

  const byPath = new Map<string, KernelCandidate>();
  for (const c of candidates) {
    const prev = byPath.get(c.binary);
    if (!prev || c.score > prev.score) {
      byPath.set(c.binary, c);
    }
  }
  return [...byPath.values()].sort((a, b) => b.score - a.score);
}

export function pickBestKernel(candidates: KernelCandidate[]): KernelCandidate | undefined {
  return candidates[0];
}

/** Copy best dev/shared-quality binary into shared runtime dir for other distributions. */
export function promoteToSharedRuntime(binary: string): string | undefined {
  try {
    fs.mkdirSync(SHARED_RUNTIME_DIR, { recursive: true });
    const dest = sharedKernelPath();
    if (path.resolve(binary) === path.resolve(dest)) {
      return dest;
    }
    fs.copyFileSync(binary, dest);
    return dest;
  } catch {
    return undefined;
  }
}

export function resolveEnvironment(opts: {
  extensionPath: string;
  workspaceFolders: string[];
  settingsRolesDir: string;
  settingsKernelBinary: string;
  promoteShared?: boolean;
}): ResolvedEnvironment | undefined {
  const anchors = [opts.extensionPath, ...opts.workspaceFolders, process.cwd()];
  const rolesDir =
    (opts.settingsRolesDir && hasRolePacks(opts.settingsRolesDir)
      ? path.resolve(opts.settingsRolesDir)
      : undefined) ?? discoverRolesDir(anchors);

  if (!rolesDir) {
    return undefined;
  }

  const candidates = discoverKernelCandidates(opts.extensionPath, opts.settingsKernelBinary);
  const best = pickBestKernel(candidates);

  let kernelBinary = '';
  let kernelTier: KernelTier = 'bundled';
  let kernelSource = 'none';

  if (best) {
    kernelBinary = best.binary;
    kernelTier = best.tier;

    if (
      opts.promoteShared !== false &&
      best.score >= 88 &&
      best.tier !== 'shared' &&
      best.tier !== 'bundled'
    ) {
      const promoted = promoteToSharedRuntime(best.binary);
      if (promoted) {
        kernelBinary = promoted;
        kernelTier = 'shared';
      }
    }
    kernelSource = `${kernelTier}:${kernelBinary}`;
  }

  const bundled = candidates.find((c) => c.tier === 'bundled');
  const kernelFallbackBinary =
    bundled?.binary &&
    kernelBinary &&
    path.resolve(bundled.binary) !== path.resolve(kernelBinary)
      ? bundled.binary
      : bundled?.binary && !kernelBinary
        ? bundled.binary
        : undefined;

  return { rolesDir, kernelBinary, kernelFallbackBinary, kernelTier, kernelSource };
}
