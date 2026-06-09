import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  MANIFEST_NAME,
  normalizeManifest,
  type KernelBinaryManifest,
} from './kernelManifest';
import { listRoleIds } from './rolePack';

/**
 * Kernel discovery — align with Rust SSOT
 * `oclivenewnew/crates/oclive_kernel_runtime/src/kernel_discovery.rs`
 */
export const PROMOTE_SCORE_THRESHOLD = 88;
export const SCORE_ENV = 100;
export const SCORE_DEV_FULL_DEBUG = 95;
export const SCORE_DEV_FULL_RELEASE = 94;
export const SCORE_DEV_HEADLESS_DEBUG = 90;
export const SCORE_DEV_HEADLESS_RELEASE = 89;
export const SCORE_SHARED = 88;
export const SCORE_SETTINGS = 85;
export const SCORE_BUNDLED = 50;

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

export function sharedAppDataDir(): string {
  const base =
    process.env.LOCALAPPDATA || process.env.APPDATA || os.homedir();
  return path.join(base, 'OCLive', 'data');
}

export function sharedKernelPath(): string {
  const name = process.platform === 'win32' ? 'oclive-kernel-server.exe' : 'oclive-kernel-server';
  return path.join(SHARED_RUNTIME_DIR, name);
}

const MAX_RUNTIME_BACKUPS = 3;

export function readManifestSidecar(binary: string): KernelBinaryManifest | undefined {
  const sidecar = path.join(path.dirname(binary), MANIFEST_NAME);
  try {
    return normalizeManifest(JSON.parse(fs.readFileSync(sidecar, 'utf8')));
  } catch {
    return undefined;
  }
}

function semverCmp(a: string, b: string): number {
  const pa = a.split('.').map((x) => parseInt(x, 10) || 0);
  const pb = b.split('.').map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) {
      return da > db ? 1 : -1;
    }
  }
  return 0;
}

function shouldPromoteBinary(candidate: string): boolean {
  const shared = sharedKernelPath();
  if (!fs.existsSync(shared)) {
    return true;
  }
  const candM = readManifestSidecar(candidate);
  if (!candM) {
    return true;
  }
  const sharedM = readManifestSidecar(shared);
  if (!sharedM) {
    return true;
  }
  const cmp = semverCmp(candM.version, sharedM.version);
  if (cmp > 0) {
    return true;
  }
  if (cmp < 0) {
    return false;
  }
  return candM.builtAt > sharedM.builtAt;
}

function backupCurrentShared(): void {
  const shared = sharedKernelPath();
  if (!fs.existsSync(shared)) {
    return;
  }
  const backupsRoot = path.join(SHARED_RUNTIME_DIR, 'backups');
  fs.mkdirSync(backupsRoot, { recursive: true });
  const dir = path.join(backupsRoot, String(Math.floor(Date.now() / 1000)));
  fs.mkdirSync(dir, { recursive: true });
  const name = path.basename(shared);
  fs.copyFileSync(shared, path.join(dir, name));
  const sidecar = path.join(SHARED_RUNTIME_DIR, MANIFEST_NAME);
  if (fs.existsSync(sidecar)) {
    fs.copyFileSync(sidecar, path.join(dir, MANIFEST_NAME));
  }
  const dirs = fs
    .readdirSync(backupsRoot)
    .map((d) => path.join(backupsRoot, d))
    .filter((p) => fs.statSync(p).isDirectory())
    .sort((a, b) => path.basename(b).localeCompare(path.basename(a)));
  while (dirs.length > MAX_RUNTIME_BACKUPS) {
    const old = dirs.pop();
    if (old) {
      fs.rmSync(old, { recursive: true, force: true });
    }
  }
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
      const sibling = path.join(dir, 'oclivenewnew');
      const siblingMarker = path.join(sibling, 'src-tauri', 'Cargo.toml');
      const siblingRoles = path.join(sibling, 'roles');
      if (fs.existsSync(siblingMarker) && fs.existsSync(siblingRoles)) {
        return sibling;
      }
    }
  }
  return undefined;
}

/** Monorepo root (`oclivenewnew`) from extension path, workspace, or sibling clone. */
export { findOclivenewnewRoot };

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
      const tauriScore = profile === 'debug' ? SCORE_DEV_FULL_DEBUG : SCORE_DEV_FULL_RELEASE;
      const headlessScore = profile === 'debug' ? SCORE_DEV_HEADLESS_DEBUG : SCORE_DEV_HEADLESS_RELEASE;
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
    candidates.push({ binary: fromEnv, tier: 'env', score: SCORE_ENV });
  }

  if (settingsBinary && isExecutable(settingsBinary)) {
    candidates.push({ binary: settingsBinary, tier: 'settings', score: SCORE_SETTINGS });
  }

  const shared = sharedKernelPath();
  if (isExecutable(shared)) {
    candidates.push({ binary: shared, tier: 'shared', score: SCORE_SHARED });
  }

  const bundled = path.join(
    extensionPath,
    'bin',
    process.platform === 'win32' ? 'oclive-kernel-server.exe' : 'oclive-kernel-server',
  );
  if (isExecutable(bundled)) {
    candidates.push({ binary: bundled, tier: 'bundled', score: SCORE_BUNDLED });
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

function isHeadlessKernelBinary(binary: string, tier: KernelTier): boolean {
  if (tier === 'env') {
    return true;
  }
  const base = path.basename(binary).toLowerCase();
  return base.includes('oclive-kernel-server') || base.includes('kernel-server');
}

/** Spawn-safe list (never the desktop Tauri host). */
export function discoverSpawnKernelCandidates(
  extensionPath: string,
  settingsBinary?: string,
): KernelCandidate[] {
  return discoverKernelCandidates(extensionPath, settingsBinary).filter((c) =>
    isHeadlessKernelBinary(c.binary, c.tier),
  );
}

export function pickBestKernel(candidates: KernelCandidate[]): KernelCandidate | undefined {
  return candidates[0];
}

/** Copy best dev/shared-quality binary into shared runtime dir (backup + manifest sidecar, P3a). */
export function promoteToSharedRuntime(binary: string): string | undefined {
  try {
    const dest = sharedKernelPath();
    if (path.resolve(binary) === path.resolve(dest)) {
      return dest;
    }
    if (!shouldPromoteBinary(binary)) {
      return dest;
    }
    fs.mkdirSync(SHARED_RUNTIME_DIR, { recursive: true });
    backupCurrentShared();
    fs.copyFileSync(binary, dest);
    const candM = readManifestSidecar(binary);
    if (candM) {
      fs.writeFileSync(path.join(SHARED_RUNTIME_DIR, MANIFEST_NAME), JSON.stringify(candM, null, 2));
    }
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

  const candidates = discoverSpawnKernelCandidates(opts.extensionPath, opts.settingsKernelBinary);
  const best = pickBestKernel(candidates);

  let kernelBinary = '';
  let kernelTier: KernelTier = 'bundled';
  let kernelSource = 'none';

  if (best) {
    kernelBinary = best.binary;
    kernelTier = best.tier;

    if (
      opts.promoteShared !== false &&
      best.score >= PROMOTE_SCORE_THRESHOLD &&
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
