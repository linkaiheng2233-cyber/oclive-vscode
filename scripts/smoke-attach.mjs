/**
 * Attach-mode smoke: kernel must already listen on apiPort (no spawn).
 */
const PORT = Number(process.env.OCLIVE_API_PORT || 8420);
const BASE = `http://127.0.0.1:${PORT}`;
const ROLE = 'D:/oclivenewnew/roles/mumu';

const health = await fetch(`${BASE}/health`).then((r) => r.text());
if (health.trim() !== 'ok') {
  console.error('FAIL: start kernel on', PORT, 'first');
  process.exit(1);
}
console.log('OK: attach health');

const res = await fetch(`${BASE}/chat`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    role_path: ROLE,
    message: 'attach mode smoke',
    session_id: 'attach-smoke',
    scene_id: 'vscode',
  }),
});
const json = await res.json();
if (!res.ok || !json.reply) {
  console.error('FAIL', res.status, json);
  process.exit(1);
}
console.log('OK: attach chat', json.reply.slice(0, 40));
console.log('=== ATTACH SMOKE PASSED ===');
