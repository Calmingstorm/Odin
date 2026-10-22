// Memory page reloads (#692) and Chat turns across page visits (#695).
// Runs the production page modules with stubbed Vue/API/WebSocket bindings;
// no network, DOM or browser. Run with: node --experimental-vm-modules
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const flush = () => new Promise((resolve) => setImmediate(resolve));
// Values built inside the page's vm context have that context's prototypes.
const plain = (value) => JSON.parse(JSON.stringify(value));

async function loadPage(name, api, ws) {
  const context = vm.createContext({
    console, Date, Set, Map, Object, String, Number, Array, Promise,
    encodeURIComponent, navigator: {}, document: {}, window: {},
    setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {},
  });
  const hooks = { mounted: [], unmounted: [] };
  const synthetic = (exports) => new vm.SyntheticModule(Object.keys(exports), function init() {
    for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
  }, { context });
  const stubs = new Map([
    ['vue', synthetic({
      ref: (value) => ({ value }),
      computed: (getter) => ({ get value() { return getter(); } }),
      nextTick: (callback) => Promise.resolve().then(() => callback?.()),
      onMounted: (callback) => hooks.mounted.push(callback),
      onUnmounted: (callback) => hooks.unmounted.push(callback),
    })],
    ['../api.js', synthetic({ api, ws })],
    ['../toast.js', synthetic({ toast: { error() {}, success() {} } })],
    ['../utils.js', synthetic({ truncate: (value, n = 200) => String(value ?? '').slice(0, n) })],
    ['dompurify', synthetic({ default: { sanitize: (html) => html } })],
    ['marked', synthetic({ marked: { parse: (text) => text } })],
  ]);
  const source = await fs.readFile(path.join(root, 'ui/js/pages', `${name}.js`), 'utf8');
  const entry = new vm.SourceTextModule(source, { context });
  await entry.link(async (specifier) => {
    if (!stubs.has(specifier)) throw new Error(`unstubbed dependency ${specifier}`);
    return stubs.get(specifier);
  });
  await entry.evaluate();
  return { module: entry.namespace.default, hooks };
}

function instance(loaded) {
  const before = { mounted: loaded.hooks.mounted.length, unmounted: loaded.hooks.unmounted.length };
  const state = loaded.module.setup();
  const mount = () => loaded.hooks.mounted.slice(before.mounted).forEach((hook) => hook());
  const unmount = () => loaded.hooks.unmounted.slice(before.unmounted).forEach((hook) => hook());
  return { state, mount, unmount };
}

// --- #692 Memory: Refresh shows current values; Add keeps open scopes filled.
{
  let note = 'before';
  const notes = { global: ['note'] };
  const api = {
    get: async (url) => (url === '/api/memory'
      ? Object.fromEntries(Object.entries(notes).map(([scope, keys]) => [scope, { keys, count: keys.length }]))
      : { entries: Object.fromEntries((notes.global).map((key) => [key, key === 'note' ? note : 'added'])) }),
    put: async (url) => { notes.global = [...notes.global, decodeURIComponent(url.split('/').pop())]; },
    post: async () => ({}),
    del: async () => ({}),
  };
  const { state } = instance(await loadPage('memory', api, {}));
  await state.fetchMemory();
  await state.toggleScope('global');
  assert.equal(state.scopeEntries.value.global[0].value, 'before');
  note = 'after';
  await state.reloadMemory();
  assert.equal(state.scopeEntries.value.global[0].value, 'after', 'Refresh shows the current value');
  assert.equal(state.expanded.value.global, true);
  state.addForm.value = { scope: 'global', key: 'second', value: 'x' };
  await state.doAdd();
  assert.deepEqual(plain(state.filteredEntries('global').map((entry) => entry.key)), ['note', 'second'],
    'an open scope keeps showing its entries after Add');
  console.log('memory reloads: ok');
}

// --- #695 Chat: a turn sent before leaving the page is shown after returning.
function fakeSocket() {
  const handlers = [];
  return {
    connected: true,
    state: 'connected',
    handlers,
    subscribe(channel, handler) { if (channel === 'chat') handlers.push(handler); },
    unsubscribe(channel, handler) {
      const index = handlers.indexOf(handler);
      if (index >= 0) handlers.splice(index, 1);
    },
    onState() { return () => {}; },
    sendChat() { return true; },
    deliver(data) { [...handlers].forEach((handler) => handler(data)); },
  };
}

{
  const stored = [{ role: 'user', content: '[web]: long task', timestamp: 1 }];
  const api = {
    get: async (url) => (url === '/api/auth/session'
      ? { channel_id: 'web:fixture' }
      : { messages: stored.map((message) => ({ ...message })) }),
    post: async () => ({}),
  };
  const ws = fakeSocket();
  const loaded = await loadPage('chat', api, ws);

  const first = instance(loaded);
  first.mount();
  await flush();
  first.state.input.value = 'long task';
  await first.state.send();
  assert.equal(first.state.sending.value, true);
  first.unmount();

  const second = instance(loaded);
  second.mount();
  await flush();
  assert.equal(second.state.sending.value, true, 'the returning page shows the turn as running');
  stored.push({ role: 'assistant', content: 'the long answer', timestamp: 2 });
  ws.deliver({ type: 'chat_response', content: 'the long answer', is_error: false });
  await flush();
  await flush();
  assert.equal(second.state.sending.value, false);
  assert.deepEqual(plain(second.state.messages.value.map((m) => [m.role, m.content])),
    [['user', 'long task'], ['bot', 'the long answer']], 'the answer appears once, in order');
  second.unmount();
  console.log('chat turn across visits: ok');
}

{
  // The reply lands while no Chat page is open: success is in the history,
  // a failure (never stored) is shown when the page comes back.
  const stored = [];
  const api = {
    get: async (url) => (url === '/api/auth/session'
      ? { channel_id: 'web:fixture' }
      : { messages: stored.map((message) => ({ ...message })) }),
    post: async () => ({}),
  };
  const ws = fakeSocket();
  const loaded = await loadPage('chat', api, ws);
  const first = instance(loaded);
  first.mount();
  await flush();
  first.state.input.value = 'doomed task';
  await first.state.send();
  first.unmount();
  ws.deliver({ type: 'chat_error', error: 'provider unavailable' });
  const second = instance(loaded);
  second.mount();
  await flush();
  await flush();
  assert.equal(second.state.sending.value, false);
  assert.deepEqual(plain(second.state.messages.value.map((m) => [m.role, m.content, m.is_error])),
    [['bot', 'provider unavailable', true]]);
  assert.equal(ws.handlers.length, 1, 'only the mounted page listens');
  console.log('chat failure while away: ok');
}
