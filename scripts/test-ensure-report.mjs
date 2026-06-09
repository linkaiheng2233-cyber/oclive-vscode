#!/usr/bin/env node
/**
 * Cross-repo contract: EnsureReport JSON from `oclive kernel ensure --plan-only --json`
 * must match golden fields (see oclivenewnew crates/oclive-cli/tests/fixtures/kernel_ensure_plan_v1.json).
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extRoot = path.resolve(__dirname, '..');
const monorepo = path.resolve(extRoot, '..', 'oclivenewnew');
const goldenPath = path.join(
  monorepo,
  'crates',
  'oclive-cli',
  'tests',
  'fixtures',
  'kernel_ensure_plan_v1.json',
);

function findCli() {
  const env = process.env.OCLIVE_CLI_BINARY;
  if (env && fs.existsSync(env)) {
    return env;
  }
  const target = process.env.CARGO_TARGET_DIR;
  const suffix = process.platform === 'win32' ? '.exe' : '';
  const candidates = [];
  if (target) {
    candidates.push(path.join(target, 'debug', `oclive-cli${suffix}`));
  }
  candidates.push(
    path.join(monorepo, '..', 'oclive-dev-artifacts', 'oclivenewnew-cargo-target', 'debug', `oclive-cli${suffix}`),
  );
  return candidates.find((p) => fs.existsSync(p));
}

function main() {
  if (!fs.existsSync(goldenPath)) {
    console.warn('[ensure-contract] skip: golden not found at', goldenPath);
    process.exit(0);
  }
  const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));
  const cli = findCli();
  if (!cli) {
    console.warn('[ensure-contract] skip: oclive-cli not built');
    process.exit(0);
  }

  const profile = path.join(monorepo, 'examples', 'distro-profiles', 'vscode.oclive.toml');
  const out = execFileSync(
    cli,
    [
      'kernel',
      'ensure',
      '--plan-only',
      '--json',
      '--path',
      monorepo,
      '--roles-dir',
      path.join(monorepo, 'roles'),
      '--distro',
      'vscode',
      '--distro-profile',
      profile,
    ],
    { encoding: 'utf8', windowsHide: true },
  );
  const report = JSON.parse(out);

  if (report.schema_version !== golden.schema_version) {
    throw new Error(`schema_version ${report.schema_version} != ${golden.schema_version}`);
  }
  for (const key of golden.required_top_level) {
    if (!(key in report)) {
      throw new Error(`missing top-level field: ${key}`);
    }
  }
  for (const key of golden.required_plan) {
    if (!(key in report.plan)) {
      throw new Error(`missing plan.${key}`);
    }
  }

  console.log('[ensure-contract] EnsureReport golden fields ok');
}

main();
