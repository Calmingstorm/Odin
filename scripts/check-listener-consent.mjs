/** The real Config component requires explicit consent and never calls restart. */
import assert from 'node:assert/strict';

globalThis.localStorage = { getItem: () => null };
globalThis.sessionStorage = { getItem: () => null };
globalThis.location = { protocol: 'http:', host: 'localhost' };
globalThis.document = { createElement: () => ({}) };
const { api } = await import('../ui/js/api.js');
const { default: Config } = await import('../ui/js/pages/config.js');
const warn = console.warn;
console.warn = () => {};
const state = Config.setup();
console.warn = warn;
const calls = [];
const consentRequest = api.setListenerExposure.bind(api);
let settle;
api.setListenerExposure = (token, exposeBeyondLoopback) => {
  calls.push({ token, exposeBeyondLoopback });
  return new Promise(resolve => { settle = resolve; });
};
await state.saveListenerConsent();
assert.equal(calls.length, 0, 'unchecked consent submitted');
state.listenerState.value = { authorized: false };
state.listenerConsent.value = true;
await state.saveListenerConsent();
assert.equal(calls.length, 0, 'session alone submitted consent without reauthentication');
state.listenerCredential.value = 'one-shot-admin';
const saving = state.saveListenerConsent();
assert.equal(state.listenerSaving.value, true);
await state.saveListenerConsent();
assert.deepEqual(calls, [{ token: 'one-shot-admin', exposeBeyondLoopback: true }]);
assert.equal(state.listenerCredential.value, '', 'credential must clear before network settles');
settle({ message: 'Saved. Operator restart required; running listener unchanged.', listener: { authorized: true } });
await saving;
assert.equal(state.listenerConsent.value, true);
assert.equal(state.listenerSaving.value, false);
assert.match(state.listenerMessage.value, /restart required/);
assert.equal(calls.length, 1, 'consent must never schedule a restart');
state.listenerConsent.value = false;
state.listenerCredential.value = 'invalid-admin';
api.setListenerExposure = async () => { throw new Error('authenticated admin access required'); };
await state.saveListenerConsent();
assert.equal(state.listenerError.value, 'authenticated admin access required');
assert.equal(state.listenerMessage.value, '');
assert.equal(state.listenerSaving.value, false);
assert.equal(state.listenerCredential.value, '');

// Exercise the real API helper, not just the component's stub. It must send
// the entered raw credential in a header, never a URL/body/storage/session.
api._token = 'existing-browser-session';
const requests = [];
globalThis.fetch = async (path, options) => {
  requests.push({ path, options });
  return { ok: true, json: async () => ({ persisted: true }) };
};
assert.deepEqual(await consentRequest('fresh-admin-credential', false), { persisted: true });
assert.equal(api.token, 'existing-browser-session');
assert.equal(requests[0].path, '/api/setup/listener');
assert.equal(requests[0].options.headers.Authorization, 'Bearer fresh-admin-credential');
assert.deepEqual(JSON.parse(requests[0].options.body), { expose_beyond_loopback: false });
globalThis.fetch = async () => ({ ok: false, status: 403, json: async () => ({ error: 'Re-enter a current admin API token' }) });
await assert.rejects(consentRequest('old-credential'), /Re-enter a current admin API token/);
assert.equal(api.token, 'existing-browser-session');
console.log('listener consent component checks passed');
