import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function storage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
  };
}
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}
globalThis.localStorage = storage();
globalThis.sessionStorage = storage();
globalThis.location = { protocol: 'http:', host: 'localhost' };
globalThis.window = globalThis;
globalThis.document = {
  createElement() { return { click() {} }; },
  addEventListener() {}, removeEventListener() {},
};
globalThis.URL.createObjectURL = () => 'blob:test';
globalThis.URL.revokeObjectURL = () => {};
const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (...args) => {
  const timer = realSetTimeout(...args); timer.unref?.(); return timer;
};

const quietWarn = console.warn;
console.warn = () => {};
const [{ default: dashboardPage }, { default: sessionsPage }, { ws }] = await Promise.all([
  import('../ui/js/pages/dashboard.js'),
  import('../ui/js/pages/sessions.js'),
  import('../ui/js/api.js'),
]);
console.warn = quietWarn;

// Dashboard: a pushed event arriving during a reconnect snapshot must survive
// the older REST response, exactly once, while snapshot rows are retained.
{
  const activityGate = deferred();
  const errorGate = deferred();
  globalThis.fetch = path => {
    if (path === '/api/audit?limit=10') return activityGate.promise;
    if (path === '/api/audit?error_only=1&limit=5') return errorGate.promise;
    return Promise.resolve(response([]));
  };
  console.warn = () => {};
  const state = dashboardPage.setup();
  console.warn = quietWarn;
  const activityRequest = state.fetchActivity();
  const errorRequest = state.fetchErrors();
  state.onEvent({ payload: {
    timestamp: '2026-08-29T20:00:00Z', tool_name: 'live_tool',
    user_id: 'u', result_summary: 'live', error: 'live failure',
  } });
  activityGate.resolve(response([
    { timestamp: '2026-08-29T19:59:00Z', tool_name: 'snapshot_tool' },
  ]));
  errorGate.resolve(response([
    { timestamp: '2026-08-29T19:58:00Z', tool_name: 'old_error', error: 'old' },
  ]));
  await Promise.all([activityRequest, errorRequest]);
  assert.deepEqual(state.activity.value.map(e => e.tool_name), ['live_tool', 'snapshot_tool']);
  assert.deepEqual(state.errors.value.map(e => e.tool_name), ['live_tool', 'old_error']);
  assert.equal(state.errorsError.value, false);
}

// Dashboard: when REST fails after live truth arrived, failure chrome must not
// hide the usable error pushed by the socket.
{
  const gate = deferred();
  globalThis.fetch = path => path.includes('error_only')
    ? gate.promise : Promise.resolve(response([]));
  console.warn = () => {};
  const state = dashboardPage.setup();
  console.warn = quietWarn;
  const request = state.fetchErrors();
  state.onEvent({ payload: { timestamp: 't', tool_name: 'live', error: 'boom' } });
  gate.resolve(response({ error: 'snapshot down' }, 500));
  await request;
  assert.equal(state.errorsError.value, false);
  assert.equal(state.errors.value[0].tool_name, 'live');
}

// Sessions: reversed completion order — the newest response alone owns rows,
// error, and loading. This is the audit/knowledge epoch primitive, not a new
// abort-controller side channel.
{
  const calls = [];
  globalThis.fetch = path => {
    if (path !== '/api/sessions') return Promise.resolve(response([]));
    const gate = deferred(); calls.push(gate); return gate.promise;
  };
  const originalSubscribe = ws.subscribe;
  const originalUnsubscribe = ws.unsubscribe;
  ws.subscribe = () => {};
  ws.unsubscribe = () => {};
  console.warn = () => {};
  const state = sessionsPage.setup();
  console.warn = quietWarn;
  const older = state.fetchSessions();
  const newer = state.fetchSessions();
  calls[1].resolve(response([{ channel_id: 'new' }]));
  await newer;
  assert.equal(state.sessions.value[0].channel_id, 'new');
  assert.equal(state.loading.value, false);
  calls[0].resolve(response([{ channel_id: 'old' }]));
  await older;
  assert.equal(state.sessions.value[0].channel_id, 'new');
  assert.equal(state.error.value, null);
  assert.equal(state.loading.value, false);
  ws.subscribe = originalSubscribe;
  ws.unsubscribe = originalUnsubscribe;
}

assert.match(
  readFileSync(new URL('../ui/js/pages/dashboard.js', import.meta.url), 'utf8'),
  /mergeByAuditIdentity/,
);
assert.match(
  readFileSync(new URL('../ui/js/pages/sessions.js', import.meta.url), 'utf8'),
  /epoch !== fetchSessionsEpoch/,
);
console.log('w2-freshness: dashboard event/snapshot merge and sessions ownership pinned');
process.exit(0);
