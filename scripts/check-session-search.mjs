// Real page + API client, with synthetic HTTP and controlled response ordering.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const storage = () => ({ getItem: () => null, setItem() {}, removeItem() {} });
globalThis.localStorage = storage();
globalThis.sessionStorage = storage();
globalThis.document = { createElement: () => ({}), querySelectorAll: () => [],
  addEventListener() {}, removeEventListener() {} };
globalThis.window = { matchMedia: () => ({ matches: false }), setInterval, clearInterval,
  setTimeout, clearTimeout, location: { hash: '#sessions' } };
globalThis.location = { protocol: 'http:', host: 'example.test', hash: '#sessions' };
const { default: page } = await import('../ui/js/pages/sessions.js');
const warn = console.warn;
console.warn = () => {};
const state = page.setup();
console.warn = warn;
const response = (results, status = 200) => new Response(JSON.stringify(
  status === 200 ? { results } : { error: `synthetic ${status}` },
), { status, headers: { 'Content-Type': 'application/json' } });

state.ftsQuery.value = 'query';
for (const failure of [400, 500, 'transport']) {
  state.ftsResults.value = [{ content: 'previous' }];
  globalThis.fetch = async () => {
    if (failure === 'transport') throw new Error('transport failed');
    return response([], failure);
  };
  await state.runFtsSearch();
  assert.ok(state.ftsError.value, `${failure} must not become empty success`);
  assert.equal(state.ftsResults.value[0].content, 'previous');
  assert.equal(state.ftsStale.value, true);
  assert.equal(state.ftsSearching.value, false);
}
globalThis.fetch = async () => response([]);
await state.runFtsSearch();
assert.deepEqual(state.ftsResults.value, []);
assert.equal(state.ftsError.value, '');
assert.equal(state.ftsStale.value, false);

const pending = [];
globalThis.fetch = () => new Promise((resolve, reject) => pending.push({ resolve, reject }));
const old = state.runFtsSearch();
state.ftsQuery.value = 'new';
const fresh = state.runFtsSearch();
pending[1].resolve(response([{ content: 'fresh' }]));
await fresh;
pending[0].reject(new Error('stale error'));
await old;
assert.equal(state.ftsResults.value[0].content, 'fresh');
assert.equal(state.ftsError.value, '');
const cleared = state.runFtsSearch();
state.clearFtsSearch();
pending[2].resolve(response([{ content: 'must not resurrect' }]));
await cleared;
assert.equal(state.ftsResults.value, null);
assert.equal(state.ftsSearching.value, false);

assert.match(page.template, /ftsResults.length === 0 && !ftsStale && !ftsError/);
const badges = readFileSync(new URL('../ui/js/pages/llm-config.js', import.meta.url), 'utf8');
for (const provider of ['codex', 'ollama', 'kimi']) {
  assert.ok(badges.includes(`llmStatus.serving_provider === '${provider}'`));
  assert.ok(!badges.includes(`llmStatus.active_provider === '${provider}'`));
}
console.log('Session search error/empty/stale/race and serving badge checks passed.');
