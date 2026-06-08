import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import type { OcliveConfig } from './config';
import { discoverSpawnKernelCandidates, type KernelTier } from './discovery';
import { isKnownDistributionKernel } from './kernelPort';

const execFileAsync = promisify(execFile);

export type KernelActionKind =
  | 'attach'
  | 'replace_and_attach'
  | 'spawn_best'
  | 'fallback_bundled';

export interface KernelActionCandidate {
  binary: string;
  tier: KernelTier;
  score: number;
  promote_to_shared: boolean;
  degraded: boolean;
  degrade_reason?: string | null;
}

export type AttachReason =
  | 'profile_compatible'
  | 'running_kernel_ok'
  | 'kernel_pinned'
  | 'kernel_pinned_profile_mismatch'
  | 'profile_mismatch_no_replace'
  | 'legacy_fallback';

export type ReplaceReason = 'binary_upgrade' | 'profile_mismatch';

export interface KernelActionPlan {
  action: KernelActionKind;
  candidate?: KernelActionCandidate | null;
  attach_reason?: AttachReason | null;
  replace_reason?: ReplaceReason | null;
  degraded: boolean;
  degrade_reason?: string | null;
}

export interface EnsureReport {
  schema_version: number;
  plan: KernelActionPlan;
  profile_compat?: 'compatible' | 'incompatible' | 'unknown';
  caller_requirements?: {
    distro_id: string;
    forbidden_modules?: string[];
  };
  running_profile_summary?: {
    distro_id?: string | null;
    enabled_modules?: string[];
  } | null;
  executed: boolean;
  health_ok: boolean;
  running_distro_id?: string | null;
}

function findMonorepoRoot(anchors: string[]): string | undefined {
  for (const anchor of anchors) {
    let cur = path.resolve(anchor);
    for (let i = 0; i < 8; i++) {
      const marker = path.join(cur, 'src-tauri', 'Cargo.toml');
      const roles = path.join(cur, 'roles');
      if (fs.existsSync(marker) && fs.existsSync(roles)) {
        return cur;
      }
      const parent = path.dirname(cur);
      if (parent === cur) {
        break;
      }
      cur = parent;
    }
  }
  return undefined;
}

function cliExe(base: string): string {
  return process.platform === 'win32' ? `${base}.exe` : base;
}

/** Locate built `oclive-cli` (monorepo dev) or PATH. */
export function findOcliveCli(extensionPath: string, cwd = process.cwd()): string | undefined {
  const repo = findMonorepoRoot([extensionPath, cwd]);
  if (repo) {
    const roots = [
      path.join(repo, '..', 'oclive-dev-artifacts', 'oclivenewnew-cargo-target'),
      path.join(repo, 'target'),
    ];
    for (const root of roots) {
      for (const profile of ['debug', 'release']) {
        const candidate = path.join(root, profile, cliExe('oclive-cli'));
        if (fs.existsSync(candidate)) {
          return candidate;
        }
      }
    }
  }
  return undefined;
}

export async function resolveKernelPlan(
  config: OcliveConfig,
  opts: { allowReplace: boolean },
): Promise<EnsureReport | undefined> {
  const cli = findOcliveCli(config.extensionPath ?? '', process.cwd());
  if (!cli) {
    return undefined;
  }

  const repoRoot = findMonorepoRoot([config.extensionPath ?? '', process.cwd()]) ?? process.cwd();
  const bundled = config.kernelFallbackBinary?.trim();
  const args = [
    'kernel',
    'ensure',
    '--json',
    '--plan-only',
    '--port',
    String(config.apiPort),
    '--path',
    repoRoot,
  ];

  if (!opts.allowReplace) {
    args.push('--lock-running');
  }

  if (config.rolesDir) {
    args.push('--roles-dir', config.rolesDir);
  }
  if (config.distroProfile) {
    args.push('--distro-profile', config.distroProfile);
  }
  if (bundled) {
    args.push('--bundled-binary', bundled);
  }
  if (config.kernelBinaryPinned && config.kernelBinary) {
    args.push('--kernel-pinned');
    args.push('--settings-binary', config.kernelBinary);
  }
  if (config.mockLlm) {
    args.push('--mock-llm');
  }
  args.push('--distro', 'vscode');

  try {
    const { stdout } = await execFileAsync(cli, args, {
      windowsHide: true,
      timeout: 30_000,
      maxBuffer: 2 * 1024 * 1024,
    });
    return JSON.parse(stdout) as EnsureReport;
  } catch (e) {
    console.warn('[oclive-kernel] oclive-cli plan failed', e);
    return undefined;
  }
}

export async function computeAllowReplace(
  config: OcliveConfig,
  candidates: ReturnType<typeof discoverSpawnKernelCandidates>,
): Promise<boolean> {
  return isKnownDistributionKernel(
    config.apiPort,
    candidates.map((c) => c.binary),
  );
}
