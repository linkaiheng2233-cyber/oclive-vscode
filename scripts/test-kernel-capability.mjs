/**
 * Legacy smoke — capability compare SSOT is Rust `kernel_strategy` tests.
 * Run: cargo test -p oclive_kernel_runtime kernel_strategy
 */

import assert from 'node:assert/strict';

const FULL = [
  'chat',
  'role_load',
  'memory',
  'emotion',
  'event',
  'prompt',
  'llm',
  'agent',
  'complex_emotion',
  'http_api',
];
const BUNDLED = ['chat', 'role_load', 'memory', 'ollama_llm'];

function compareManifestCapability(a, b) {
  const aSet = new Set(a.featureSet);
  const bSet = new Set(b.featureSet);
  const aSuperset = [...bSet].every((f) => aSet.has(f));
  const bSuperset = [...aSet].every((f) => bSet.has(f));
  if (aSet.size > bSet.size && aSuperset) return 1;
  if (bSet.size > aSet.size && bSuperset) return -1;
  if (aSet.size !== bSet.size) return aSet.size - bSet.size;
  return 0;
}

const full = { featureSet: FULL, version: '0.3.0', builtAt: '2026-06-01' };
const bundled = { featureSet: BUNDLED, version: '0.3.0', builtAt: '2026-06-01' };

assert.ok(compareManifestCapability(full, bundled) > 0);
assert.ok(compareManifestCapability(bundled, full) < 0);
assert.equal(compareManifestCapability(full, full), 0);

console.log('kernel capability compare: ok');
