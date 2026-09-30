// Exercise the real API client against browser storage and an in-memory server.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, '../ui/js/api.js'), 'utf8');
const storage = (seed = {}) => {
  const values = new Map(Object.entries(seed));
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
    entries: () => Object.fromEntries(values),
  };
};
globalThis.window = globalThis;
globalThis.location = { protocol: 'http:', host: 'localhost:3002' };
globalThis.document = { addEventListener() {}, removeEventListener() {} };
globalThis.setInterval = () => 0;
globalThis.clearInterval = () => {};
globalThis.localStorage = storage();
globalThis.sessionStorage = storage();
const { OdinAPI } = await import('data:text/javascript;base64,' + Buffer.from(`${source}\nexport { OdinAPI };`).toString('base64'));
const reload = () => new OdinAPI();
const reset = (local = {}, session = {}) => {
  globalThis.localStorage = storage(local);
  globalThis.sessionStorage = storage(session);
};
const old = { odin_persist: '1', odin_token: 'synthetic-old', odin_session_timeout: '42' };

reset(old);
let api = reload();
api.setPersist(false);
api.setToken('synthetic-new', 60);
assert.deepEqual(localStorage.entries(), {});
assert.deepEqual(sessionStorage.entries(), { odin_token: 'synthetic-new', odin_session_timeout: '60' });
assert.equal(reload().token, 'synthetic-new');
assert.equal(reload().sessionTimeout, 60);

reset({}, { odin_token: 'synthetic-old', odin_session_timeout: '42' });
api = reload();
api.setPersist(true);
api.setToken('synthetic-new');
assert.deepEqual(sessionStorage.entries(), {});
assert.deepEqual(localStorage.entries(), { odin_token: 'synthetic-new', odin_persist: '1' });
assert.equal(reload().token, 'synthetic-new');

const valid = new Set();
const loginRequests = [];
globalThis.fetch = async (path, opts = {}) => {
  if (path === '/api/auth/login') {
    loginRequests.push(JSON.parse(opts.body));
    valid.add('synthetic-new-session');
    return { status: 200, ok: true, json: async () => ({ session_id: 'synthetic-new-session', timeout_seconds: 42 }) };
  }
  const bearer = (opts.headers?.Authorization || '').replace('Bearer ', '');
  if (!valid.has(bearer)) return { status: 401, ok: false, json: async () => ({}) };
  return { status: 200, ok: true, json: async () => ({ status: 'online' }) };
};
reset(old);
api = reload();
assert.equal((await api.check()).needsAuth, true);
api.setPersist(false);
await api.login('synthetic-login');
assert.deepEqual(loginRequests.at(-1), { token: 'synthetic-login', persist: false });
assert.equal(reload().token, 'synthetic-new-session');
assert.equal((await reload().check()).ok, true);
await reload().logout();
assert.deepEqual(localStorage.entries(), {});
assert.deepEqual(sessionStorage.entries(), {});

reset(old);
api = reload();
api.setPersist(true);
await api.login('synthetic-login');
assert.deepEqual(loginRequests.at(-1), { token: 'synthetic-login', persist: true });
assert.equal(reload().token, 'synthetic-new-session');
console.log('login-persistence: server opt-in request and browser storage assertions passed');
