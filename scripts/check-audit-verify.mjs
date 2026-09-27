// Audit tamper-evidence surface (deep-dive 7.2).
//
// The HMAC chain verifier has existed since v3.49.0 with no operator surface.
// These assertions drive the REAL audit page setup through every verifier
// state — valid, broken chain, signing-not-enabled (409), network failure —
// and pin the honest copy: the permanent pre-enablement unsigned prefix must
// read as expected history, never as tampering.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';

function storage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
  };
}

globalThis.localStorage = storage();
globalThis.sessionStorage = storage();
globalThis.document = {
  createElement() { return {}; },
  querySelectorAll() { return []; },
  addEventListener() {},
  removeEventListener() {},
};
globalThis.window = {
  matchMedia() { return { matches: false }; },
  setInterval, clearInterval, setTimeout, clearTimeout,
  location: { hash: '#dashboard' },
};
globalThis.location = { protocol: 'http:', host: 'localhost', hash: '#dashboard' };

function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const quietWarn = console.warn;
console.warn = () => {};
const { default: page } = await import('../ui/js/pages/audit.js');
console.warn = quietWarn;

function setupPage(verifyBody, verifyStatus = 200) {
  globalThis.fetch = async (path) => {
    if (path.startsWith('/api/audit/verify')) {
      if (verifyBody instanceof Error) throw verifyBody;
      return response(verifyBody, verifyStatus);
    }
    return response([]);
  };
  console.warn = () => {};
  const state = page.setup();
  console.warn = quietWarn;
  return state;
}

async function renderState(state) {
  console.warn = () => {};
  const html = await renderToString(createSSRApp({
    template: page.template,
    setup() { return state; },
  }));
  console.warn = quietWarn;
  return html;
}

const seg = (file, position, status, extra = {}) => ({
  file, position, status, total: 0, verified: 0, unsigned_prefix: 0,
  first_bad: null, reason: null, error: null, ...extra,
});

// All retained files are shown, including one written before signing.
{
  const state = setupPage({
    valid: true, availability: 'available', scope: 'retained_files', total: 600, verified: 420,
    unsigned_prefix: 180, first_bad: null, first_bad_file: null,
    segments: [
      seg('audit.jsonl', 0, 'verified', { total: 320, verified: 320 }),
      seg('audit.jsonl.1', 1, 'verified', { total: 180, verified: 100, unsigned_prefix: 80 }),
      seg('audit.jsonl.2', 2, 'unsigned', { total: 100, unsigned_prefix: 100 }),
    ],
  });
  await state.verifyIntegrity();
  const html = await renderState(state);
  assert.match(html, /Chain valid — 420 signed entries verified across 3 retained files/);
  assert.match(html, /180 older entries predate signing/);
  assert.match(html, /expected, not tampering/);
  assert.match(html, /audit\.jsonl<\/span> \(current\): verified — 320 signed entries/);
  assert.match(html, /audit\.jsonl\.1<\/span>: verified — 100 signed entries; 80 older entries predate signing/);
  assert.match(html, /audit\.jsonl\.2<\/span>: no signatures — written before signing was enabled/);
  assert.match(html, /cannot be detected/);
  assert.ok(!/Chain INVALID/.test(html));
}

// Rotated break arrives as a 409 identifying the file and line.
{
  const state = setupPage({
    valid: false, availability: 'available', scope: 'retained_files', total: 500, verified: 412,
    unsigned_prefix: 0, first_bad: 13, first_bad_file: 'audit.jsonl.1',
    error: 'audit.jsonl.1: Line 13: HMAC verification failed (tampered or reordered)',
    segments: [
      seg('audit.jsonl', 0, 'verified', { total: 400, verified: 400 }),
      seg('audit.jsonl.1', 1, 'broken', { total: 13, verified: 12, first_bad: 13, reason: 'hmac_mismatch' }),
    ],
  }, 409);
  await state.verifyIntegrity();
  assert.equal(state.verifyResult.value.valid, false);
  const html = await renderState(state);
  assert.match(html, /Chain INVALID — problem in audit\.jsonl\.1 at line 13/);
  assert.match(html, /break at line 13 — entry altered, reordered, or signed with a different key; 12 entries verified before it; later lines not checked/);
  assert.match(html, /audit\.jsonl<\/span> \(current\): verified — 400 signed entries/);
}

// Unreadable, missing and file-level signing gap are findings, never skipped.
{
  const state = setupPage({
    valid: false, availability: 'available', scope: 'retained_files', total: 3, verified: 2,
    unsigned_prefix: 1, first_bad: null, first_bad_file: 'audit.jsonl.1',
    error: 'audit.jsonl.1: no signatures although older files are signed',
    segments: [
      seg('audit.jsonl', 0, 'verified', { total: 1, verified: 1 }),
      seg('audit.jsonl.1', 1, 'broken', { total: 1, unsigned_prefix: 1, reason: 'signing_gap' }),
      seg('audit.jsonl.2', 2, 'missing', { error: 'expected file not found' }),
      seg('audit.jsonl.3', 3, 'unreadable', { error: 'PermissionError' }),
      seg('audit.jsonl.4', 4, 'verified', { total: 1, verified: 1 }),
    ],
  }, 409);
  await state.verifyIntegrity();
  const html = await renderState(state);
  assert.match(html, /Chain INVALID — problem in audit\.jsonl\.1\./);
  assert.match(html, /no signatures although older files are signed/);
  assert.match(html, /audit\.jsonl\.2<\/span>: missing/);
  assert.match(html, /audit\.jsonl\.3<\/span>: could not be read \(PermissionError\)/);
}

// Signing not enabled is a configuration fact, not an alarm.
{
  const state = setupPage({ valid: false, total: 0, verified: 0, unsigned_prefix: 0,
    first_bad: null, availability: 'not_enabled', error: 'Signing not enabled (no hmac_key configured)' }, 409);
  await state.verifyIntegrity();
  const html = await renderState(state);
  assert.match(html, /Tamper-evidence is not enabled/);
  assert.ok(!/Chain INVALID/.test(html), 'not-enabled must never render as a broken chain');
  assert.ok(!/Verification failed/.test(html));
}

// A transport failure names itself and never fabricates a verdict.
{
  const state = setupPage(new Error('socket hang up'));
  await state.verifyIntegrity();
  assert.equal(state.verifyResult.value, null);
  const html = await renderState(state);
  assert.match(html, /Verification failed: socket hang up/);
  assert.ok(!/Chain valid/.test(html));
}

// Mutation guard: an error string on a configured verifier is NOT the
// not-enabled availability state. Keep the source decision keyed to the
// explicit availability discriminator, never truthiness of error.
const auditSource = readFileSync(new URL('../ui/js/pages/audit.js', import.meta.url), 'utf8');
assert.match(auditSource, /e\.data\.availability === 'not_enabled'/);
assert.doesNotMatch(auditSource, /e\.data\.error\s*\?\s*\{[^}]*not_enabled/s);

console.log('audit-verify: every verifier state, per-file findings and honest-prefix copy pinned');
