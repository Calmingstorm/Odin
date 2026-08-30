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

// Valid chain with a permanent unsigned prefix: green verdict, and the
// prefix explained as history — the words "expected, not tampering" carry it.
{
  const state = setupPage({ valid: true, availability: 'available', total: 500, verified: 420, unsigned_prefix: 80, first_bad: null });
  await state.verifyIntegrity();
  const html = await renderState(state);
  assert.match(html, /Chain valid — 420 signed entries verified/);
  assert.match(html, /80 older entries predate signing/);
  assert.match(html, /expected, not tampering/);
  assert.ok(!/Chain INVALID/.test(html));
}

// Broken chain arrives as a 409 with the verifier's structured verdict.
{
  const state = setupPage({ valid: false, availability: 'available', total: 500, verified: 12, unsigned_prefix: 0, first_bad: 13, error: 'Line 13: HMAC verification failed' }, 409);
  await state.verifyIntegrity();
  assert.equal(state.verifyResult.value.valid, false);
  const html = await renderState(state);
  assert.match(html, /Chain INVALID — first break at entry 13; 12 verified before it/);
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

console.log('audit-verify: all four verifier states and the honest-prefix copy pinned');
