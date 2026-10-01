// Drive the production API/WS state machines. No installed server is contacted.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const storage = () => {
  const values = new Map();
  return { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, String(v)), removeItem: k => values.delete(k) };
};
globalThis.localStorage = storage();
globalThis.sessionStorage = storage();
globalThis.location = { protocol: 'http:', host: 'fixture.invalid' };
const intervals = new Map(), timeouts = new Map(); let next = 0;
globalThis.setInterval = (fn, ms) => { const id = ++next; intervals.set(id, { fn, ms }); return id; };
globalThis.clearInterval = id => intervals.delete(id);
globalThis.setTimeout = (fn, ms) => { const id = ++next; timeouts.set(id, { fn, ms }); return id; };
globalThis.clearTimeout = id => timeouts.delete(id);
const sockets = [];
class Socket {
  static OPEN = 1;
  constructor() { this.readyState = 0; sockets.push(this); }
  close() { this.closed = true; this.readyState = 3; }
  send() {}
  open() { this.readyState = 1; this.onopen(); }
}
globalThis.WebSocket = Socket;
const source = readFileSync(new URL('../ui/js/api.js', import.meta.url), 'utf8');
const { OdinAPI, OdinWebSocket, AuthError, ApiError } = await import('data:text/javascript;base64,' + Buffer.from(`${source}\nexport { OdinAPI, OdinWebSocket };`).toString('base64'));
const response = status => new Response(JSON.stringify({ error: 'fixture', status: 'online' }), { status });
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function fixture() {
  const api = new OdinAPI(), ws = new OdinWebSocket(api);
  api.setPersist(true); api.setToken('fixture-session', 30);
  let expired = 0;
  api.onSessionExpired = () => { expired++; ws.disconnect(); };
  return { api, ws, expired: () => expired };
}

for (const path of ['/api/status', '/api/agents']) {
  const f = fixture(); f.ws.connect(); sockets.at(-1).open();
  const pending = [deferred(), deferred()]; let i = 0;
  globalThis.fetch = () => pending[i++].promise;
  const first = f.api.get(path), second = f.api.get(path);
  pending[0].resolve(response(401)); await assert.rejects(first, AuthError);
  pending[1].resolve(response(401)); await assert.rejects(second, AuthError);
  assert.equal(f.expired(), 1); assert.equal(f.api.token, '');
  assert.equal(localStorage.getItem('odin_token'), null); assert.equal(sessionStorage.getItem('odin_token'), null);
  assert.equal(f.api._activityTimer, null); assert.equal(f.ws._pingInterval, null);
  assert.equal(f.ws.state, 'disconnected'); assert.equal(f.ws._shouldConnect, false);
  assert.equal(f.ws._reconnectTimer, null);
}

// Forbidden is authorization, not failed authentication. Downloads obey the
// same expiry contract as JSON; failed login/one-shot reauth do not end it.
{
  const f = fixture();
  globalThis.fetch = async () => response(403);
  await assert.rejects(f.api.get('/api/tokens'), ApiError);
  await assert.rejects(f.api.getBlob('/api/output'), ApiError);
  assert.equal(f.expired(), 0); assert.equal(f.api.token, 'fixture-session');
  globalThis.fetch = async () => response(401);
  await assert.rejects(f.api.login('wrong'), AuthError);
  await assert.rejects(f.api.setListenerExposure('wrong', true), ApiError);
  assert.equal(f.expired(), 0);
  await assert.rejects(f.api.getBlob('/api/output'), AuthError);
  assert.equal(f.expired(), 1);
}

// A delayed rejection of the previous session cannot destroy a new sign-in.
{
  const f = fixture(), pending = deferred(); globalThis.fetch = () => pending.promise;
  const old = f.api.get('/api/status'); f.api.setToken('new-session');
  pending.resolve(response(401)); await assert.rejects(old, AuthError);
  assert.equal(f.api.token, 'new-session'); assert.equal(f.expired(), 0);
  f.api.setToken('');
}

// Explicit protocol authentication rejection, including a stale close.
{
  const f = fixture(); f.ws.connect(); const old = sockets.at(-1);
  old.onclose({ code: 4001 });
  assert.equal(f.expired(), 1); assert.equal(f.ws._reconnectTimer, null);
  f.api.setToken('new-session'); f.ws.connect(); const current = sockets.at(-1); current.open();
  old.onclose({ code: 4001 });
  assert.equal(f.expired(), 1); assert.equal(f.ws.connected, true);
  f.ws.disconnect(); f.api.setToken('');
}

// HTTP-upgrade 401 is hidden by browsers as 1006. A policy close (4002)
// could be permissions-only, so both must confirm via an authenticated probe.
for (const code of [1006, 4002]) {
  for (const status of [401, 403, 200, 'offline']) {
    const f = fixture(); f.ws.connect(); const socket = sockets.at(-1); socket.open();
    let probe;
    globalThis.fetch = async (path, opts) => {
      probe = [path, opts.headers.Authorization];
      if (status === 'offline') throw new TypeError('offline');
      return response(status);
    };
    socket.onclose({ code }); await flush();
    assert.deepEqual(probe, ['/api/status', 'Bearer fixture-session']);
    assert.equal(f.expired(), status === 401 ? 1 : 0);
    assert.equal(f.ws.state, status === 401 ? 'disconnected' : 'reconnecting');
    f.ws.disconnect(); f.api.setToken('');
  }
}

// Probe deadline keeps an offline upgrade from wedging reconnect; a delayed
// probe also cannot clear or retire a newer sign-in's connection.
{
  const f = fixture(); f.ws.connect(); const socket = sockets.at(-1);
  globalThis.fetch = (path, opts) => new Promise((resolve, reject) => opts.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
  socket.onclose({ code: 1006 });
  [...timeouts.values()].find(t => t.ms === 5000).fn(); await flush();
  assert.equal(f.ws.state, 'reconnecting'); assert.equal(f.expired(), 0);
  f.ws.disconnect();
  const pending = deferred(); globalThis.fetch = () => pending.promise;
  f.ws.connect(); const old = sockets.at(-1); old.onclose({ code: 4002 });
  f.ws.disconnect(); f.api.setToken('new-session'); f.ws.connect(); const current = sockets.at(-1); current.open();
  pending.resolve(response(401)); await flush();
  assert.equal(f.api.token, 'new-session'); assert.equal(f.ws.connected, true); assert.equal(f.expired(), 0);
  f.ws.disconnect(); f.api.setToken('');
}

// Local inactivity follows the same once-only transition, even without a hook.
{
  const f = fixture(); f.api._lastActivity = Date.now() - 31000;
  intervals.get(f.api._activityTimer).fn();
  assert.equal(f.expired(), 1); assert.equal(f.api.expireSession(), false);
  const api = new OdinAPI(); api.setToken('without-hook');
  assert.equal(api.expireSession(), true); assert.equal(api.token, '');
}
assert.equal(intervals.size, 0); assert.equal(timeouts.size, 0);
console.log('session-expiration: HTTP 401/403, storage, once-only, stale requests, WS auth, bounded probes and inactivity passed');
