#!/usr/bin/env node
/**
 * Plain-node unit tests for pure logic modules (no vscode / fetch deps).
 * Run after `npm run compile` (imports compiled output from `out/`).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, '..', 'out');

if (!fs.existsSync(outDir)) {
  console.error('[test-unit] out/ not found — run `npm run compile` first.');
  process.exit(1);
}

let failures = 0;
async function test(name, fn) {
  try {
    await fn();
    console.log(`  ok  ${name}`);
  } catch (e) {
    failures += 1;
    console.error(`  FAIL ${name}\n       ${e instanceof Error ? e.message : e}`);
  }
}

const { ensureReadyDecision } = await import(
  pathToFileURL(path.join(outDir, 'ensureReadyPolicy.js')).href
);
const { createSerialQueue } = await import(
  pathToFileURL(path.join(outDir, 'serialQueue.js')).href
);

console.log('ensureReadyDecision');
const TTL = 5000;

await test('forces a full re-plan when force=true even if fresh', () => {
  assert.equal(
    ensureReadyDecision({ force: true, mode: 'attached', cachedAt: 1000, now: 1100, ttlMs: TTL }),
    'replan',
  );
});

await test('re-plans when offline', () => {
  assert.equal(
    ensureReadyDecision({ mode: 'offline', cachedAt: 0, now: 1000, ttlMs: TTL }),
    'replan',
  );
});

await test('re-plans when never cached (cachedAt<=0)', () => {
  assert.equal(
    ensureReadyDecision({ mode: 'attached', cachedAt: 0, now: 1000, ttlMs: TTL }),
    'replan',
  );
});

await test('trusts a recently validated connection (within TTL) — the freeze fix', () => {
  assert.equal(
    ensureReadyDecision({ mode: 'spawned', cachedAt: 1000, now: 1000 + TTL - 1, ttlMs: TTL }),
    'trust',
  );
});

await test('revalidates (single health probe) just past the TTL', () => {
  assert.equal(
    ensureReadyDecision({ mode: 'attached', cachedAt: 1000, now: 1000 + TTL, ttlMs: TTL }),
    'revalidate',
  );
});

await test('a burst of trusted calls never escalates to replan', () => {
  const base = 10_000;
  for (let i = 0; i < 20; i++) {
    assert.equal(
      ensureReadyDecision({ mode: 'attached', cachedAt: base, now: base + i * 100, ttlMs: TTL }),
      'trust',
    );
  }
});

console.log('createSerialQueue');

await test('runs operations strictly in order (no overlap)', async () => {
  const q = createSerialQueue();
  const events = [];
  const slow = (label, ms) =>
    q.run(async () => {
      events.push(`start:${label}`);
      await new Promise((r) => setTimeout(r, ms));
      events.push(`end:${label}`);
    });
  await Promise.all([slow('a', 30), slow('b', 5), slow('c', 1)]);
  assert.deepEqual(events, [
    'start:a',
    'end:a',
    'start:b',
    'end:b',
    'start:c',
    'end:c',
  ]);
});

await test('a rejected op does not break the queue for later ops', async () => {
  const q = createSerialQueue();
  const results = [];
  const ok1 = q.run(async () => 'first');
  const bad = q.run(async () => {
    throw new Error('boom');
  });
  const ok2 = q.run(async () => 'third');
  results.push(await ok1);
  await assert.rejects(bad, /boom/);
  results.push(await ok2);
  assert.deepEqual(results, ['first', 'third']);
});

await test('returns the operation result to the caller', async () => {
  const q = createSerialQueue();
  assert.equal(await q.run(() => 42), 42);
});

if (failures > 0) {
  console.error(`\n[test-unit] ${failures} test(s) failed.`);
  process.exit(1);
}
console.log('\n[test-unit] all unit tests passed.');
