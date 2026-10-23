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

async function loadPage(name, api, ws, globals = {}) {
  const context = vm.createContext({
    console, Date, Set, Map, Object, String, Number, Array, Promise,
    encodeURIComponent, navigator: {}, document: {}, window: {},
    setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {},
    ...globals,
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
// The fake server stores what the real one does: the question under the id
// the page sent, the reply under its own id, returned with the reply.
function fakeSocket() {
  const channels = { chat: [], chat_post: [] };
  return {
    connected: true,
    state: 'connected',
    handlers: channels.chat,
    sent: [],
    subscribe(channel, handler) { channels[channel]?.push(handler); },
    unsubscribe(channel, handler) {
      const list = channels[channel] || [];
      const index = list.indexOf(handler);
      if (index >= 0) list.splice(index, 1);
    },
    onState() { return () => {}; },
    sendChat(content, options = {}) { this.sent.push({ content, ...options }); return true; },
    lastId() { return this.sent.at(-1).messageId; },
    deliver(data) { [...channels.chat].forEach((handler) => handler(data)); },
    post(data) { [...channels.chat_post].forEach((handler) => handler(data)); },
  };
}

const question = (ws, text, timestamp) => (
  { role: 'user', content: `[web]: ${text}`, timestamp, message_id: ws.lastId() });
const rows = (page) => plain(page.state.messages.value.map((m) => [m.role, m.content]));
const fileNames = (message) => plain(message.files.map((f) => f.filename));
const sessionApi = (stored, extra = {}) => ({
  get: async (url) => (url === '/api/auth/session'
    ? { channel_id: 'web:fixture' }
    : { messages: stored.map((message) => ({ ...message })) }),
  post: async () => ({}),
  ...extra,
});

{
  const stored = [];
  const ws = fakeSocket();
  const loaded = await loadPage('chat', sessionApi(stored), ws);

  const first = instance(loaded);
  first.mount();
  await flush();
  first.state.input.value = 'long task';
  await first.state.send();
  stored.push(question(ws, 'long task', 1));
  assert.equal(first.state.sending.value, true);
  first.unmount();

  const second = instance(loaded);
  second.mount();
  await flush();
  assert.equal(second.state.sending.value, true, 'the returning page shows the turn as running');
  stored.push({ role: 'assistant', content: 'the long answer', timestamp: 2, message_id: 'r1' });
  ws.deliver({ type: 'chat_response', content: 'the long answer', is_error: false,
    question_id: ws.lastId(), reply_id: 'r1' });
  await flush();
  await flush();
  assert.equal(second.state.sending.value, false);
  assert.deepEqual(rows(second), [['user', 'long task'], ['bot', 'the long answer']],
    'the answer appears once, in order');
  second.unmount();
  console.log('chat turn across visits: ok');
}

{
  // The reply lands while no Chat page is open: success is in the history,
  // a failure (never stored) is shown when the page comes back.
  const ws = fakeSocket();
  const loaded = await loadPage('chat', sessionApi([]), ws);
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
  const stored = [];
  let sessionCalls = 0;
  let releaseHeld;
  const held = new Promise((resolve) => { releaseHeld = resolve; });
  const api = sessionApi(stored, {
    get: async (url) => {
      if (url === '/api/auth/session') return { channel_id: 'web:fixture' };
      sessionCalls++;
      if (sessionCalls === 2) return held;
      return { messages: stored.map((message) => ({ ...message })) };
    },
  });
  const ws = fakeSocket();
  const loaded = await loadPage('chat', api, ws);
  const first = instance(loaded);
  first.mount();
  await flush();
  first.state.input.value = 'long task';
  await first.state.send();
  stored.push(question(ws, 'long task', 1));
  first.unmount();
  const returning = instance(loaded);
  returning.mount();
  await flush(); // its mount-time history request is held
  stored.push({ role: 'assistant', content: 'the long answer', timestamp: 2, message_id: 'r1' });
  ws.deliver({
    type: 'chat_response', content: 'the long answer', is_error: false,
    tools_used: ['generate_image'], files: [{ filename: 'plot.png', data: 'AA==' }],
    question_id: ws.lastId(), reply_id: 'r1',
  });
  await flush(); await flush(); // the reply's reload settles first
  releaseHeld({ messages: stored.map((message) => ({ ...message })) }); // the older one last
  await flush(); await flush();
  assert.deepEqual(rows(returning), [['user', 'long task'], ['bot', 'the long answer']],
    'the history is shown once');
  const reply = returning.state.messages.value[1];
  assert.deepEqual(plain([reply.tools_used, reply.files.map((f) => f.filename)]),
    [['generate_image'], ['plot.png']], 'the reply keeps its files and tools');
  returning.unmount();
  console.log('chat resumed reply racing the mount load: ok');
}

{
  // A resumed reply whose history reload fails is still shown. (The stored
  // question here predates message ids: legacy records stay readable.)
  let sessionCalls = 0;
  const api = sessionApi([], {
    get: async (url) => {
      if (url === '/api/auth/session') return { channel_id: 'web:fixture' };
      sessionCalls++;
      if (sessionCalls === 3) throw Object.assign(new Error('unavailable'), { status: 503 });
      return { messages: [{ role: 'user', content: '[web]: long task', timestamp: 1 }] };
    },
  });
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
  ws.deliver({ type: 'chat_response', content: 'the long answer', is_error: false, reply_id: 'r1' });
  await flush(); await flush();
  assert.deepEqual(rows(returning), [['user', 'long task'], ['bot', 'the long answer']]);
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
  const stored = [];
  const ws = fakeSocket();
  const loaded = await loadPage('chat', sessionApi(stored), ws);
  const first = instance(loaded);
  first.mount();
  await flush();
  first.state.input.value = 'make a plot';
  await first.state.send();
  stored.push(question(ws, 'make a plot', 1));
  first.unmount();
  const returning = instance(loaded);
  returning.mount();
  await flush();
  stored.push({ role: 'assistant', content: '', timestamp: 2, message_id: 'r1' });
  ws.deliver({ type: 'chat_response', content: '', is_error: false, reply_id: 'r1',
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
  stored.push(question(ws, 'chart it', 3),
    { role: 'assistant', content: 'Here is the chart.', timestamp: 4, message_id: 'r2' });
  ws.deliver({ type: 'chat_response', content: 'Here is the chart.', is_error: false, reply_id: 'r2',
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

// --- #730: a turn sent while the history loads is shown once, whatever the
// snapshot holds and whenever the reply lands.
for (const snapshotHolds of ['question and reply', 'question', 'neither']) {
  for (const replyFirst of [true, false]) {
    const label = `${snapshotHolds}, reply ${replyFirst ? 'before' : 'after'} the load`;
    let release;
    const held = new Promise((resolve) => { release = resolve; });
    const api = sessionApi([], {
      get: async (url) => (url === '/api/auth/session' ? { channel_id: 'u1' } : held),
    });
    const ws = fakeSocket();
    const page = instance(await loadPage('chat', api, ws));
    page.mount();
    await flush(); // the history request is pending
    page.state.input.value = 'status?';
    await page.state.send();
    const asked = { role: 'user', content: '[u]: status?', timestamp: 5, message_id: ws.lastId() };
    const answered = { role: 'assistant', content: 'all good', timestamp: 6, message_id: 'r1' };
    const reply = { type: 'chat_response', content: 'all good', is_error: false,
      files: [{ filename: 'report.txt', data: 'AA==' }], question_id: ws.lastId(), reply_id: 'r1' };
    const snapshot = [{ role: 'user', content: '[u]: earlier', timestamp: 1, message_id: 'q0' }];
    if (snapshotHolds !== 'neither') snapshot.push(asked);
    if (snapshotHolds === 'question and reply') snapshot.push(answered);
    if (replyFirst) ws.deliver(reply);
    release({ messages: snapshot });
    await flush(); await flush();
    if (!replyFirst) ws.deliver(reply);
    await flush();
    assert.deepEqual(rows(page), [['user', 'earlier'], ['user', 'status?'], ['bot', 'all good']], label);
    assert.deepEqual(fileNames(page.state.messages.value[2]), ['report.txt'], label);
    assert.equal(page.state.sending.value, false, label);
    page.unmount();
  }
}
console.log('chat turn during a history load is shown once: ok');

{
  // #731: a reply's files outlive any number of visits and loads, and an
  // older stored reply with the same text never gets them.
  const stored = [
    { role: 'user', content: '[web]: chart', timestamp: 1, message_id: 'q0' },
    { role: 'assistant', content: 'Here is the chart.', timestamp: 2, message_id: 'r0' },
  ];
  const ws = fakeSocket();
  const loaded = await loadPage('chat', sessionApi(stored), ws);
  const page = instance(loaded);
  page.mount();
  await flush();
  page.state.input.value = 'chart again';
  await page.state.send();
  stored.push(question(ws, 'chart again', 3),
    { role: 'assistant', content: 'Here is the chart.', timestamp: 4, message_id: 'r2' });
  ws.deliver({ type: 'chat_response', content: 'Here is the chart.', is_error: false,
    tools_used: ['generate_image'], files: [{ filename: 'new.png', data: 'AA==' }], reply_id: 'r2' });
  await flush();
  page.unmount();
  for (let visit = 1; visit <= 3; visit++) {
    const back = instance(loaded);
    back.mount();
    await flush(); await flush();
    await back.state.loadHistory(); // a second load on the same visit too
    const [older, newer] = back.state.messages.value.filter((m) => m.content === 'Here is the chart.');
    assert.deepEqual([fileNames(older), fileNames(newer)], [[], ['new.png']], `visit ${visit}`);
    assert.deepEqual(plain(newer.tools_used), ['generate_image']);
    back.unmount();
  }
  console.log('chat reply files across visits and loads: ok');
}

{
  // #731: leaving again before the returning page's load completes.
  const stored = [];
  let holdNext = false;
  let release = () => {};
  const api = sessionApi(stored, {
    get: async (url) => {
      if (url === '/api/auth/session') return { channel_id: 'web:fixture' };
      const snapshot = { messages: stored.map((message) => ({ ...message })) };
      if (!holdNext) return snapshot;
      holdNext = false;
      return new Promise((resolve) => { release = () => resolve(snapshot); });
    },
  });
  const ws = fakeSocket();
  const loaded = await loadPage('chat', api, ws);
  const first = instance(loaded);
  first.mount();
  await flush();
  first.state.input.value = 'plot it';
  await first.state.send();
  first.unmount();
  stored.push(question(ws, 'plot it', 1),
    { role: 'assistant', content: 'Plotted.', timestamp: 2, message_id: 'r1' });
  ws.deliver({ type: 'chat_response', content: 'Plotted.', is_error: false, reply_id: 'r1',
    files: [{ filename: 'plot.png', data: 'AA==' }] }); // while away
  holdNext = true;
  const brief = instance(loaded);
  brief.mount();
  await flush();
  brief.unmount(); // gone before its load returns
  release();
  await flush();
  const back = instance(loaded);
  back.mount();
  await flush(); await flush();
  assert.deepEqual(fileNames(back.state.messages.value.find((m) => m.content === 'Plotted.')),
    ['plot.png'], 'leaving mid-load keeps the files');
  back.unmount();
  console.log('chat leaving again mid-load: ok');
}

{
  // A REST turn that ended in an error answers 502 with its result: it is a
  // stored turn (question + error marker), shown once with what it carried,
  // on this visit and after. Validation and transport failures are not.
  const marker = '[Previous request used tools (run_command) but encountered an error. '
    + 'The user may ask to retry.]';
  const stored = [];
  let body = null;
  const api = sessionApi(stored, {
    post: async (_url, data) => {
      body = data;
      stored.push({ role: 'user', content: '[web]: run it', timestamp: 1, message_id: data.message_id },
        { role: 'assistant', content: marker, timestamp: 2, message_id: 'r9' });
      throw Object.assign(new Error('HTTP 502'), { status: 502, data: {
        response: 'the tool loop failed', is_error: true, tools_used: ['run_command'],
        files: [{ filename: 'log.txt', data: 'AA==' }], question_id: data.message_id, reply_id: 'r9',
      } });
    },
  });
  const ws = fakeSocket();
  ws.connected = false; // the REST fallback
  const loaded = await loadPage('chat', api, ws);
  const page = instance(loaded);
  page.mount();
  await flush();
  page.state.input.value = 'run it';
  await page.state.send();
  assert.equal(body.message_id, page.state.messages.value[0].serverId, 'the REST body names the question');
  const expected = [['user', 'run it', false], ['bot', 'the tool loop failed', true]];
  const shownRows = (p) => plain(p.state.messages.value.map((m) => [m.role, m.content, m.is_error]));
  assert.deepEqual(shownRows(page), expected);
  page.unmount();
  const back = instance(loaded);
  back.mount();
  await flush(); await flush();
  assert.deepEqual(shownRows(back), expected, 'the stored marker shows the error that was shown');
  assert.deepEqual(fileNames(back.state.messages.value[1]), ['log.txt']);
  for (const failure of [new Error('Failed to fetch'),
    Object.assign(new Error('invalid message_id'), { status: 400, data: { error: 'invalid message_id' } })]) {
    api.post = async () => { throw failure; };
    back.state.input.value = 'again';
    await back.state.send();
    assert.deepEqual(shownRows(back).at(-1), ['bot', failure.message, true]);
  }
  back.unmount();
  console.log('chat REST error turns: ok');
}

{
  // What the page keeps across visits belongs to the sign-in that made it.
  const stored = { A: [], B: [] };
  const api = {
    token: 'A',
    get: async (url) => (url === '/api/auth/session'
      ? { channel_id: `web:${api.token}` }
      : { messages: stored[api.token].map((message) => ({ ...message })) }),
    post: async () => ({}),
  };
  const ws = fakeSocket();
  const loaded = await loadPage('chat', api, ws);
  // A gets a reply with a file, then leaves with another turn still running.
  const a = instance(loaded);
  a.mount();
  await flush();
  a.state.input.value = 'secret plot';
  await a.state.send();
  stored.A.push(question(ws, 'secret plot', 1),
    { role: 'assistant', content: 'Plotted.', timestamp: 2, message_id: 'r1' });
  ws.deliver({ type: 'chat_response', content: 'Plotted.', is_error: false, reply_id: 'r1',
    files: [{ filename: 'secret.png', data: 'AA==' }] });
  a.state.input.value = 'still running';
  await a.state.send();
  a.unmount();
  // A signs out; B signs in. B's chat happens to hold a stored id A used.
  api.token = '';
  api.token = 'B';
  stored.B.push({ role: 'assistant', content: 'Plotted.', timestamp: 3, message_id: 'r1' });
  const b = instance(loaded);
  b.mount();
  await flush(); await flush();
  assert.equal(b.state.sending.value, false, 'another sign-in never inherits a running turn');
  assert.deepEqual(fileNames(b.state.messages.value[0]), [], 'nor a held file, even by the same id');
  ws.deliver({ type: 'chat_response', content: 'A answer', is_error: false, reply_id: 'r3' });
  assert.deepEqual(rows(b), [['bot', 'Plotted.']], 'A\'s late reply is not B\'s');
  b.unmount();
  // A's REST turn and history load that settle after B signed in are dropped.
  api.token = 'A';
  ws.connected = false;
  let answer;
  api.post = () => new Promise((resolve) => { answer = resolve; });
  const late = instance(loaded);
  late.mount();
  await flush();
  late.state.input.value = 'slow';
  const sending = late.state.send();
  await flush();
  late.unmount();
  api.token = 'B';
  answer({ response: 'Done.', is_error: false, tools_used: [],
    files: [{ filename: 'a.png', data: 'AA==' }], reply_id: 'r1' });
  await sending;
  const again = instance(loaded);
  again.mount();
  await flush(); await flush();
  assert.deepEqual(fileNames(again.state.messages.value[0]), [], 'a late REST reply holds nothing');
  again.unmount();
  // A's history request still out when B signs in fills nothing.
  api.token = 'A';
  let releaseA;
  const realGet = api.get;
  api.get = async (url) => (url === '/api/auth/session'
    ? { channel_id: 'web:A' }
    : new Promise((resolve) => { releaseA = () => resolve({ messages: stored.A.map((m) => ({ ...m })) }); }));
  const slowA = instance(loaded);
  slowA.mount();
  await flush();
  api.token = 'B';
  releaseA();
  await flush(); await flush();
  assert.deepEqual(rows(slowA), [], 'a load from before another sign-in is dropped');
  slowA.unmount();
  api.get = realGet;
  console.log('chat state belongs to its sign-in: ok');
}

{
  // A REST turn that ended in an error, either way round with a history load
  // that shows its stored question and marker: shown once, as the error shown.
  const marker = '[Previous request used tools (run_command) but encountered an error. '
    + 'The user may ask to retry.]';
  for (const replyFirst of [true, false]) {
    const label = `502 ${replyFirst ? 'before' : 'after'} the history`;
    const stored = [];
    let releaseLoad;
    let rejectPost;
    let posted;
    const api = sessionApi(stored, {
      get: async (url) => (url === '/api/auth/session'
        ? { channel_id: 'web:fixture' }
        : new Promise((resolve) => { releaseLoad = () => resolve({ messages: stored.map((m) => ({ ...m })) }); })),
      post: (_url, data) => new Promise((_, reject) => {
        posted = data;
        stored.push({ role: 'user', content: '[web]: run it', timestamp: 1, message_id: data.message_id },
          { role: 'assistant', content: marker, timestamp: 2, message_id: 'r9' });
        rejectPost = () => reject(Object.assign(new Error('HTTP 502'), { status: 502, data: {
          response: 'the tool loop failed', is_error: true, tools_used: ['run_command'],
          files: [{ filename: 'log.txt', data: 'AA==' }], question_id: data.message_id, reply_id: 'r9',
        } }));
      }),
    });
    const ws = fakeSocket();
    ws.connected = false;
    const page = instance(await loadPage('chat', api, ws));
    page.mount();
    await flush(); // the mount's history request is pending
    page.state.input.value = 'run it';
    const sending = page.state.send();
    await flush();
    assert.ok(posted && posted.message_id, label);
    if (replyFirst) { rejectPost(); await sending; releaseLoad(); } else { releaseLoad(); await flush(); await flush(); rejectPost(); await sending; }
    await flush(); await flush();
    assert.deepEqual(plain(page.state.messages.value.map((m) => [m.role, m.content, m.is_error])),
      [['user', 'run it', false], ['bot', 'the tool loop failed', true]], label);
    assert.deepEqual(fileNames(page.state.messages.value[1]), ['log.txt'], label);
    page.unmount();
  }
  console.log('chat REST error turn with a history load: ok');
}

{
  // The page's id for a question: random (a secure context's randomUUID, or
  // getRandomValues on plain HTTP, or Math.random without either), safe for
  // the server's 1-64 [A-Za-z0-9_-] rule, sent with the question and kept.
  const safe = /^[A-Za-z0-9_-]{1,64}$/;
  const sources = [
    { crypto: { randomUUID: () => '0b9a1c2d-3e4f-4a5b-8c6d-7e8f9a0b1c2d', getRandomValues() {} } },
    { crypto: { getRandomValues: (bytes) => bytes.fill(171) } },
    {},
  ];
  for (const globals of sources) {
    const ws = fakeSocket();
    const page = instance(await loadPage('chat', sessionApi([]), ws, globals));
    page.mount();
    await flush();
    const ids = [];
    for (const text of ['one', 'two']) {
      page.state.input.value = text;
      await page.state.send();
      ws.deliver({ type: 'chat_response', content: 'ok', is_error: false, reply_id: `r-${text}` });
      ids.push(ws.lastId());
    }
    assert.ok(ids.every((id) => safe.test(id)), String(ids));
    assert.deepEqual(plain(page.state.messages.value.filter((m) => m.role === 'user')
      .map((m) => m.serverId)), ids, 'the live question carries the id it was sent with');
    if (!globals.crypto?.randomUUID && !globals.crypto) assert.notEqual(ids[0], ids[1]);
    page.unmount();
  }
  console.log('chat question ids: ok');
}

{
  // Held replies are bounded: the newest 50, and 64 MiB of base64 file text;
  // the oldest go first, the newest stays even alone over the limit, and a
  // reply held again replaces its own entry.
  const stored = [];
  const ws = fakeSocket();
  const loaded = await loadPage('chat', sessionApi(stored), ws);
  const page = instance(loaded);
  page.mount();
  await flush();
  const hold = async (id, data) => {
    page.state.input.value = id;
    await page.state.send();
    stored.push(question(ws, id, stored.length + 1),
      { role: 'assistant', content: `reply ${id}`, timestamp: stored.length + 2, message_id: id });
    ws.deliver({ type: 'chat_response', content: `reply ${id}`, is_error: false, reply_id: id,
      files: [{ filename: `${id}.bin`, data }] });
    await flush();
  };
  const filesOn = async () => {
    const view = instance(loaded);
    view.mount();
    await flush(); await flush();
    const found = Object.fromEntries(view.state.messages.value.filter((m) => m.role === 'bot')
      .map((m) => [m.serverId, m.files.length]));
    view.unmount();
    return found;
  };
  for (let n = 0; n <= 50; n++) await hold(`r${n}`, 'AA==');
  let held = await filesOn();
  assert.deepEqual([held.r0, held.r1, held.r50], [0, 1, 1], 'the 51st reply evicts the oldest');
  const mib = 1024 * 1024;
  await hold('big', 'A'.repeat(64 * mib + 1));
  held = await filesOn();
  assert.deepEqual([held.big, held.r50], [1, 0], 'the newest stays alone over the limit');
  await hold('small', 'AA==');
  held = await filesOn();
  assert.deepEqual([held.big, held.small], [0, 1], 'then it goes first');
  stored.length = 0;
  const forty = 'A'.repeat(40 * mib);
  await hold('same', forty);
  page.state.input.value = 'again';
  await page.state.send(); // a turn is running, so its reply is taken
  assert.equal(page.state.sending.value, true);
  ws.deliver({ type: 'chat_response', content: 'reply same', is_error: false, reply_id: 'same',
    files: [{ filename: 'same.bin', data: forty }] }); // the same reply held again
  assert.equal(page.state.sending.value, false, 'the repeated reply reached the page');
  await hold('other', 'A'.repeat(20 * mib));
  held = await filesOn();
  assert.deepEqual([held.same, held.other], [1, 1], 'a replaced entry is counted once');
  // A newest reply of several files over the limit together stays alone.
  await hold('pair', forty);
  page.state.input.value = 'two files';
  await page.state.send();
  stored.push(question(ws, 'two files', stored.length + 1),
    { role: 'assistant', content: 'reply two', timestamp: stored.length + 2, message_id: 'two' });
  ws.deliver({ type: 'chat_response', content: 'reply two', is_error: false, reply_id: 'two',
    files: [{ filename: 'a.bin', data: forty }, { filename: 'b.bin', data: forty }] });
  await flush();
  held = await filesOn();
  assert.deepEqual([held.two, held.pair, held.other], [2, 0, 0], 'the newest stays, with both files');
  page.unmount();
  console.log('chat held reply bounds: ok');
}

// --- PR #735 review R3: a reply that arrived while Chat was away is shown
// even when the returning history cannot show it (the load fails, or the
// snapshot lacks it), once when the snapshot has it, file-only replies too.
for (const returning of ['empty snapshot', '404', '500', 'snapshot with the reply']) {
  for (const content of ['Here.', '']) {
    const label = `${returning}, ${content ? 'text' : 'file-only'} reply`;
    const stored = [];
    let failWith = null;
    const api = sessionApi(stored, {
      get: async (url) => {
        if (url === '/api/auth/session') return { channel_id: 'web:fixture' };
        if (failWith) throw Object.assign(new Error('history'), { status: failWith });
        return { messages: stored.map((message) => ({ ...message })) };
      },
    });
    const ws = fakeSocket();
    const loaded = await loadPage('chat', api, ws);
    const first = instance(loaded);
    first.mount();
    await flush();
    first.state.input.value = 'plot it';
    await first.state.send();
    first.unmount();
    ws.deliver({ type: 'chat_response', content, is_error: false, reply_id: 'r1',
      files: [{ filename: 'plot.png', data: 'AA==' }] }); // while away
    if (returning === 'snapshot with the reply') {
      stored.push(question(ws, 'plot it', 1),
        { role: 'assistant', content, timestamp: 2, message_id: 'r1' });
    }
    if (returning === '404') failWith = 404;
    if (returning === '500') failWith = 500;
    const back = instance(loaded);
    back.mount();
    await flush(); await flush();
    const replies = back.state.messages.value.filter((m) => m.role === 'bot');
    assert.deepEqual(plain(replies.map((m) => [m.content, fileNames(m)])), [[content, ['plot.png']]], label);
    back.unmount();
  }
}
console.log('chat reply received while away, history unavailable: ok');
