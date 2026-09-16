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
let settle;
api.post = (path, body) => {
  calls.push({ path, body });
  return new Promise(resolve => { settle = resolve; });
};
await state.saveListenerConsent();
assert.equal(calls.length, 0, 'unchecked consent submitted');
state.listenerConsent.value = true;
const saving = state.saveListenerConsent();
assert.equal(state.listenerSaving.value, true);
await state.saveListenerConsent();
assert.deepEqual(calls, [{ path: '/api/setup/listener', body: { expose_beyond_loopback: true } }]);
settle({ message: 'Saved. Operator restart required; running listener unchanged.' });
await saving;
assert.equal(state.listenerConsent.value, false);
assert.equal(state.listenerSaving.value, false);
assert.match(state.listenerMessage.value, /restart required/);
assert.equal(calls.length, 1, 'consent must never schedule a restart');
state.listenerConsent.value = true;
api.post = async () => { throw new Error('authenticated admin access required'); };
await state.saveListenerConsent();
assert.equal(state.listenerError.value, 'authenticated admin access required');
assert.equal(state.listenerMessage.value, '');
assert.equal(state.listenerSaving.value, false);
console.log('listener consent component checks passed');
