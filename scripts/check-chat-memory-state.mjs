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
  const channels = { chat: [], chat_post: [] };
  return {
    connected: true,
    state: 'connected',
    handlers: channels.chat,
    subscribe(channel, handler) { channels[channel]?.push(handler); },
    unsubscribe(channel, handler) {
      const list = channels[channel] || [];
      const index = list.indexOf(handler);
      if (index >= 0) list.splice(index, 1);
    },
    onState() { return () => {}; },
    sendChat() { return true; },
    deliver(data) { [...channels.chat].forEach((handler) => handler(data)); },
    post(data) { [...channels.chat_post].forEach((handler) => handler(data)); },
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

{
  // #706: a loop's later posts show in the chat, from history and live.
  const api = {
    get: async (url) => (url === '/api/auth/session'
      ? { channel_id: 'u1' }
      : {
        messages: [
          { role: 'user', content: '[u]: watch X', timestamp: 10 },
          { role: 'assistant', content: 'Started the loop.', timestamp: 11 },
        ],
        posts: [{ content: 'iteration 1: fine', timestamp: 12 }],
      }),
    post: async () => ({}),
  };
  const ws = fakeSocket();
  const page = instance(await loadPage('chat', api, ws));
  page.mount();
  await flush();
  assert.deepEqual(plain(page.state.messages.value.map((m) => [m.role, m.content, m.post])), [
    ['user', 'watch X', false], ['bot', 'Started the loop.', false], ['bot', 'iteration 1: fine', true],
  ]);
  ws.post({ type: 'chat_post', channel_id: 'someone-else', content: 'not ours', timestamp: 13 });
  ws.post({ type: 'chat_post', channel_id: 'u1', content: 'iteration 2: fine', timestamp: 14 });
  assert.deepEqual(plain(page.state.messages.value.slice(-1).map((m) => [m.content, m.post])),
    [['iteration 2: fine', true]]);
  assert.equal(page.state.sending.value, false, 'a post is never taken for the turn\'s answer');
  page.unmount();
  console.log('chat later posts: ok');
}

{
  // A returning page's mount-time history request can settle after the
  // resumed reply's own reload: only the newest load fills the page, and the
  // reply keeps the files and tools the stored history does not hold.
  const stored = [{ role: 'user', content: '[web]: long task', timestamp: 1 }];
  let sessionCalls = 0;
  let releaseHeld;
  const held = new Promise((resolve) => { releaseHeld = resolve; });
  const api = {
    get: async (url) => {
      if (url === '/api/auth/session') return { channel_id: 'web:fixture' };
      sessionCalls++;
      if (sessionCalls === 2) return held;
      return { messages: stored.map((message) => ({ ...message })) };
    },
    post: async () => ({}),
  };
  const ws = fakeSocket();
  const loaded = await loadPage('chat', api, ws);
  const first = instance(loaded);
  first.mount();
  await flush();
  first.state.input.value = 'long task';
  await first.state.send();
  first.unmount();
  const returning = instance(loaded);
  returning.mount();
  await flush(); // its mount-time history request is held
  stored.push({ role: 'assistant', content: 'the long answer', timestamp: 2 });
  ws.deliver({
    type: 'chat_response', content: 'the long answer', is_error: false,
    tools_used: ['generate_image'], files: [{ filename: 'plot.png', data: 'AA==' }],
  });
  await flush(); await flush(); // the reply's reload settles first
  releaseHeld({ messages: stored.map((message) => ({ ...message })) }); // the older one last
  await flush(); await flush();
  assert.deepEqual(plain(returning.state.messages.value.map((m) => [m.role, m.content])),
    [['user', 'long task'], ['bot', 'the long answer']], 'the history is shown once');
  const reply = returning.state.messages.value[1];
  assert.deepEqual(plain([reply.tools_used, reply.files.map((f) => f.filename)]),
    [['generate_image'], ['plot.png']], 'the reply keeps its files and tools');
  returning.unmount();
  console.log('chat resumed reply racing the mount load: ok');
}

{
  // A resumed reply whose history reload fails is still shown.
  let sessionCalls = 0;
  const api = {
    get: async (url) => {
      if (url === '/api/auth/session') return { channel_id: 'web:fixture' };
      sessionCalls++;
      if (sessionCalls === 3) throw Object.assign(new Error('unavailable'), { status: 503 });
      return { messages: [{ role: 'user', content: '[web]: long task', timestamp: 1 }] };
    },
    post: async () => ({}),
  };
  const ws = fakeSocket();
  const loaded = await loadPage('chat', api, ws);
  const first = instance(loaded);
  first.mount();
  await flush();
  first.state.input.value = 'long task';
  await first.state.send();
  first.unmount();
  const returning = instance(loaded);
  returning.mount();
  await flush();
  ws.deliver({ type: 'chat_response', content: 'the long answer', is_error: false });
  await flush(); await flush();
  assert.deepEqual(plain(returning.state.messages.value.map((m) => [m.role, m.content])),
    [['user', 'long task'], ['bot', 'the long answer']]);
  returning.unmount();
  console.log('chat resumed reply when its reload fails: ok');
}

{
  // A post pushed while the history loads, or again after a load that
  // already shows it, appears once.
  let releaseSession;
  const session = new Promise((resolve) => { releaseSession = resolve; });
  const api = {
    get: async (url) => (url === '/api/auth/session' ? { channel_id: 'u1' } : session),
    post: async () => ({}),
  };
  const ws = fakeSocket();
  const page = instance(await loadPage('chat', api, ws));
  page.mount();
  await flush(); // the history request is pending
  ws.post({ type: 'chat_post', channel_id: 'u1', content: 'iteration 1: fine', timestamp: 12.5 });
  ws.post({ type: 'chat_post', channel_id: 'u1', content: 'iteration 2: fine', timestamp: 13.5 });
  releaseSession({
    messages: [{ role: 'assistant', content: 'Started the loop.', timestamp: 11 }],
    posts: [{ content: 'iteration 1: fine', timestamp: 12.5 }], // stored before the load
  });
  await flush(); await flush();
  ws.post({ type: 'chat_post', channel_id: 'u1', content: 'iteration 1: fine', timestamp: 12.5 });
  assert.deepEqual(plain(page.state.messages.value.map((m) => [m.content, m.post])), [
    ['Started the loop.', false], ['iteration 1: fine', true], ['iteration 2: fine', true],
  ]);
  page.unmount();
  console.log('chat posts during a history load: ok');
}

{
  // A resumed reply of files only (no text to store) still shows its files,
  // as a live one does; a successful reply that arrived while no Chat page
  // was open keeps its files too.
  const stored = [{ role: 'user', content: '[web]: make a plot', timestamp: 1 }];
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
  first.state.input.value = 'make a plot';
  await first.state.send();
  first.unmount();
  const returning = instance(loaded);
  returning.mount();
  await flush();
  stored.push({ role: 'assistant', content: '', timestamp: 2 });
  ws.deliver({ type: 'chat_response', content: '', is_error: false,
    tools_used: ['generate_image'], files: [{ filename: 'plot.png', data: 'AA==' }] });
  await flush(); await flush();
  assert.deepEqual(plain(returning.state.messages.value.map((m) => [m.role, m.content, m.files.length])),
    [['user', 'make a plot', 0], ['bot', '', 1]], 'a file-only reply keeps its file');
  returning.unmount();

  const away = instance(loaded);
  away.mount();
  await flush();
  away.state.input.value = 'chart it';
  await away.state.send();
  away.unmount();
  stored.push({ role: 'user', content: '[web]: chart it', timestamp: 3 },
    { role: 'assistant', content: 'Here is the chart.', timestamp: 4 });
  ws.deliver({ type: 'chat_response', content: 'Here is the chart.', is_error: false,
    tools_used: ['generate_image'], files: [{ filename: 'chart.png', data: 'AA==' }] });
  const back = instance(loaded);
  back.mount();
  await flush(); await flush();
  const reply = back.state.messages.value.find((m) => m.content === 'Here is the chart.');
  assert.deepEqual(plain([reply.files.map((f) => f.filename), reply.tools_used]),
    [['chart.png'], ['generate_image']], 'a reply received while away keeps its files');
  assert.equal(back.state.messages.value.filter((m) => m.content === 'Here is the chart.').length, 1);
  back.unmount();
  console.log('chat replies keep their files across visits: ok');
}
