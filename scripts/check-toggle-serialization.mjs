// Toggle/select mutation coordination (WebUI deep-dive 6.3).
//
// Three control groups fired uncoordinated per-interaction PUTs: Discord
// guild/channel toggles raced unserialized mutation+refetch pairs and kept a
// flipped visual position when the server said no; host-access selects and
// the schedules report-format select fired one PUT (and one toast) per arrow
// keypress. These assertions drive the REAL page setups with stubbed fetch
// and captured timers, so they fail if serialization, failure-restore, or
// debounce-coalescing regress.

import assert from 'node:assert/strict';

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

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const tick = () => new Promise(resolve => setImmediate(resolve));

/** Capture setTimeout callbacks during fn so debounced work fires only when
 * the test says so — the pages resolve setTimeout at call time. */
function capturingTimers(fn) {
  const real = globalThis.setTimeout;
  const captured = [];
  globalThis.setTimeout = (cb, ms) => {
    const handle = { captured: true };
    captured.push({ cb, ms, handle });
    return handle;
  };
  const realClear = globalThis.clearTimeout;
  globalThis.clearTimeout = (handle) => {
    if (handle && handle.captured) {
      const idx = captured.findIndex(entry => entry.handle === handle);
      if (idx >= 0) captured.splice(idx, 1);
      return;
    }
    realClear(handle);
  };
  try {
    fn(captured);
  } finally {
    globalThis.setTimeout = real;
    globalThis.clearTimeout = realClear;
  }
  return captured;
}

const quietWarn = console.warn;
console.warn = () => {};
const [
  { default: discordPage },
  { default: hostAccessPage },
  { default: schedulesPage },
] = await Promise.all([
  import('../ui/js/pages/discord-config.js'),
  import('../ui/js/pages/host-access.js'),
  import('../ui/js/pages/schedules.js'),
]);
console.warn = quietWarn;

// ---------------------------------------------------------------------------
// Discord: a failed mutation restores the control's real position; mutations
// are serialized — the second PUT waits for the first PUT + refetch to settle.
// ---------------------------------------------------------------------------
{
  globalThis.fetch = async (path, opts = {}) => {
    if ((opts.method || 'GET') === 'PUT') return response({ error: 'nope' }, 500);
    return response([]);
  };
  console.warn = () => {};
  const state = discordPage.setup();
  console.warn = quietWarn;

  const control = { checked: true }; // the browser already flipped it
  await state.setGuildConfig('g1', 'enabled', true, { target: control });
  assert.equal(control.checked, false, 'failed guild mutation left the checkbox lying');
  assert.match(state.error.value, /nope/);

  const channelControl = { checked: false };
  await state.setChannelConfig('c1', 'g1', 'enabled', false, { target: channelControl });
  assert.equal(channelControl.checked, true, 'failed channel mutation left the checkbox lying');
}

{
  const calls = [];
  const puts = new Map();
  globalThis.fetch = (path, opts = {}) => {
    const method = opts.method || 'GET';
    calls.push(`${method} ${path}`);
    if (method === 'PUT') {
      const gate = deferred();
      puts.set(path, gate);
      return gate.promise;
    }
    return Promise.resolve(response([]));
  };
  console.warn = () => {};
  const state = discordPage.setup();
  console.warn = quietWarn;

  const first = state.setGuildConfig('g1', 'enabled', true, null);
  const second = state.setGuildConfig('g1', 'require_mention', false, null);
  await tick();
  assert.equal(calls.filter(c => c.startsWith('PUT')).length, 1,
    'second mutation started before the first settled');
  assert.ok(state.mutationPending.value.has('guild:g1:enabled'));
  assert.ok(state.mutationPending.value.has('guild:g1:require_mention'),
    'queued mutation must read as pending');

  puts.get('/api/discord/guild/g1/config').resolve(response({}));
  await first;
  await tick();
  assert.equal(calls.filter(c => c.startsWith('PUT')).length, 2,
    'second mutation never fired after the first settled');
  assert.ok(calls.indexOf('GET /api/discord/guilds') >= 0
    && calls.indexOf('GET /api/discord/guilds') < calls.lastIndexOf('PUT /api/discord/guild/g1/config'),
    `refetch did not precede the second PUT: ${JSON.stringify(calls)}`);

  for (const gate of puts.values()) gate.resolve(response({}));
  await second;
  assert.equal(state.mutationPending.value.size, 0, 'pending keys leaked after settlement');
}

// ---------------------------------------------------------------------------
// Host-access: per-keypress select changes coalesce to ONE save carrying the
// final draft; a user deleted inside the quiet window is never resurrected;
// flushing commits instead of dropping.
// ---------------------------------------------------------------------------
{
  const calls = [];
  globalThis.fetch = async (path, opts = {}) => {
    calls.push({ method: opts.method || 'GET', path, body: opts.body ? JSON.parse(opts.body) : null });
    return response({});
  };
  console.warn = () => {};
  const state = hostAccessPage.setup();
  console.warn = quietWarn;
  state.users.value = {
    u1: { allowed_hosts: ['alpha', 'beta', 'gamma'], default_host: 'alpha', allow_all: false },
  };

  const captured = capturingTimers(() => {
    state.setUserDefault('u1', 'beta');
    state.setUserDefault('u1', 'gamma'); // arrow keypresses in one quiet window
  });
  assert.equal(calls.filter(c => c.method === 'PUT').length, 0,
    'debounced save fired before the quiet window elapsed');
  for (const entry of captured) entry.cb();
  await tick();
  const puts = calls.filter(c => c.method === 'PUT');
  assert.equal(puts.length, 1, `coalescing failed: ${JSON.stringify(puts)}`);
  assert.equal(puts[0].body.default_host, 'gamma', 'save did not carry the FINAL draft');

  // Deleted inside the quiet window: the pending save resolves to nothing.
  calls.length = 0;
  const ghost = capturingTimers(() => state.setUserDefault('u1', 'beta'));
  delete state.users.value.u1;
  for (const entry of ghost) entry.cb();
  await tick();
  assert.equal(calls.filter(c => c.method === 'PUT').length, 0,
    'pending save resurrected a deleted user');

  // Flush commits the last edit rather than dropping it.
  calls.length = 0;
  state.users.value = { u2: { allowed_hosts: ['alpha'], default_host: '', allow_all: false } };
  capturingTimers(() => state.setUserDefault('u2', 'alpha'));
  state.flushPendingSaves();
  await tick();
  const flushed = calls.filter(c => c.method === 'PUT');
  assert.equal(flushed.length, 1, 'flush dropped the pending edit');
  assert.equal(flushed[0].body.default_host, 'alpha');

  // The default-policy select coalesces identically.
  calls.length = 0;
  state.defaultPolicy.value = { allowed_hosts: ['alpha', 'beta'], default_host: 'alpha', allow_all: false };
  const dp = capturingTimers(() => {
    state.saveDefaultPolicy();
    state.defaultPolicy.value.default_host = 'beta';
    state.saveDefaultPolicy();
  });
  for (const entry of dp) entry.cb();
  await tick();
  const dpPuts = calls.filter(c => c.method === 'PUT');
  assert.equal(dpPuts.length, 1, `default-policy coalescing failed: ${JSON.stringify(dpPuts)}`);
  assert.equal(dpPuts[0].body.default_host, 'beta');
}

// ---------------------------------------------------------------------------
// Schedules: report-format arrow-keying coalesces to one PUT with the final
// choice; flushing commits a choice still inside its quiet window.
// ---------------------------------------------------------------------------
{
  const calls = [];
  globalThis.fetch = async (path, opts = {}) => {
    calls.push({ method: opts.method || 'GET', path, body: opts.body ? JSON.parse(opts.body) : null });
    return response([]);
  };
  console.warn = () => {};
  const state = schedulesPage.setup();
  console.warn = quietWarn;

  const schedule = { id: 's1' };
  const captured = capturingTimers(() => {
    state.doUpdateReportFormat(schedule, 'paginated_embed_v1');
    state.doUpdateReportFormat(schedule, ''); // keyed back to plain text
  });
  assert.equal(calls.filter(c => c.method === 'PUT').length, 0,
    'report-format PUT fired before the quiet window elapsed');
  for (const entry of captured) entry.cb();
  await tick();
  await tick();
  const puts = calls.filter(c => c.method === 'PUT');
  assert.equal(puts.length, 1, `report-format coalescing failed: ${JSON.stringify(puts)}`);
  assert.equal(puts[0].body.report_format, '', 'PUT did not carry the FINAL choice');

  calls.length = 0;
  capturingTimers(() => state.doUpdateReportFormat({ id: 's2' }, 'paginated_embed_v1'));
  state.flushReportFormatTimers();
  await tick();
  await tick();
  const flushed = calls.filter(c => c.method === 'PUT');
  assert.equal(flushed.length, 1, 'flush dropped the pending report-format choice');
  assert.equal(flushed[0].body.report_format, 'paginated_embed_v1');
}

console.log('toggle-serialization: failure-restore, serialization, coalescing, and flush contracts pinned');
process.exit(0);
