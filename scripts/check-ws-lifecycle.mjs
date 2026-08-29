// Lifecycle-listener contract for OdinWebSocket.
//
// The old assignable callbacks (onStatusChange/onStateChange/onLatency) were
// single-slot: every page was a rival for one hook, chat and logs chained
// prev-handler saves around the app shell's, and an interleaved order
// (chat mounts, logs activates, chat unmounts, logs deactivates) restored a
// DEAD component's handler while the shell's was lost for good. These
// assertions drive the real OdinWebSocket against a fake WebSocket, so they
// fail if multi-listener dispatch or the reconnected-epoch semantics regress
// rather than merely describing them.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const uiJsDir = join(here, '../ui/js');
const source = readFileSync(join(uiJsDir, 'api.js'), 'utf8');

let passed = 0;
let failed = 0;
function check(name, condition, detail = '') {
  if (condition) passed += 1;
  else { failed += 1; console.error(`FAIL ${name}: ${detail}`); }
}

// Minimal fake WebSocket: records instances, never auto-fires anything.
const sockets = [];
class FakeWebSocket {
  static OPEN = 1;
  constructor(url) {
    this.url = url;
    this.readyState = FakeWebSocket.OPEN;
    this.sent = [];
    sockets.push(this);
  }
  send(payload) { this.sent.push(payload); }
  close() { this.closed = true; }
}

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

globalThis.WebSocket = FakeWebSocket;
globalThis.location = { protocol: 'http:', host: 'localhost:3002' };
globalThis.localStorage = memoryStorage();
globalThis.sessionStorage = memoryStorage();
globalThis.window = globalThis;
globalThis.document = { addEventListener() {}, removeEventListener() {} };

const instrumented = `${source}\nexport { OdinAPI, OdinWebSocket };\n`;
const moduleUrl = 'data:text/javascript;base64,'
  + Buffer.from(instrumented).toString('base64');
const { OdinWebSocket, OdinAPI } = await import(moduleUrl);

function newClient() {
  sockets.length = 0;
  return new OdinWebSocket(new OdinAPI());
}

/** Run fn with setTimeout captured instead of scheduled, then fire what was
 * captured — the reconnect path becomes synchronous without touching
 * privates. */
function firingCapturedTimers(fn) {
  const realSetTimeout = globalThis.setTimeout;
  const captured = [];
  globalThis.setTimeout = (cb) => { captured.push(cb); return 0; };
  try { fn(); } finally { globalThis.setTimeout = realSetTimeout; }
  for (const cb of captured) cb();
}

// Two state listeners both receive; removing one never detaches the other.
{
  const client = newClient();
  const a = [];
  const b = [];
  const offA = client.onState((s) => a.push(s));
  client.onState((s) => b.push(s));
  client.connect();
  sockets[0].onopen();
  check('both state listeners receive', a.includes('connected') && b.includes('connected'),
    JSON.stringify({ a, b }));
  offA();
  offA(); // double-unsubscribe must be a no-op, never a sibling detach
  client.disconnect();
  check('unsubscribed listener goes quiet', !a.includes('disconnected'), JSON.stringify(a));
  check('surviving listener still receives', b.includes('disconnected'), JSON.stringify(b));
}

// The historical orphan interleave: shell, chat, logs register; chat leaves,
// then logs leaves — the shell must still be wired. Under the chained
// singleton this exact order restored chat's dead handler and lost the
// shell's forever.
{
  const client = newClient();
  const shell = [];
  const chat = [];
  const logs = [];
  client.onState((s) => shell.push(s));
  const offChat = client.onState((s) => chat.push(s));
  const offLogs = client.onState((s) => logs.push(s));
  offChat();               // chat unmounts while logs is still active
  client.connect();
  sockets[0].onopen();
  check('interleave: logs still receives after chat left', logs.includes('connected'),
    JSON.stringify(logs));
  check('interleave: chat is silent after leaving', chat.length === 0, JSON.stringify(chat));
  offLogs();               // logs deactivates last
  client.disconnect();
  check('interleave: the shell survives both departures',
    shell.includes('connected') && shell.includes('disconnected'), JSON.stringify(shell));
}

// A throwing listener must not silence its siblings.
{
  const client = newClient();
  const after = [];
  client.onState(() => { throw new Error('listener bug'); });
  client.onState((s) => after.push(s));
  client.connect();
  sockets[0].onopen();
  check('listener exception does not break dispatch', after.includes('connected'),
    JSON.stringify(after));
}

// Latency and status fan out to every listener.
{
  const client = newClient();
  const lat1 = [];
  const lat2 = [];
  const status = [];
  client.onLatencyChange((ms) => lat1.push(ms));
  client.onLatencyChange((ms) => lat2.push(ms));
  client.onStatus((c) => status.push(c));
  client.connect();
  const s = sockets[0];
  s.onopen();
  s.onmessage({ data: JSON.stringify({ type: 'pong', ts: Date.now() - 5 }) });
  check('latency fans out', lat1.length === 1 && lat2.length === 1,
    JSON.stringify({ lat1, lat2 }));
  check('status published on open', status[0] === true, JSON.stringify(status));
  s.onclose();
  check('status published on close', status.includes(false), JSON.stringify(status));
}

// Reconnected-epoch semantics: never on first open; once per resumed open;
// never after an explicit disconnect(); epochs monotonic across sessions;
// emitted after the state listeners have seen 'connected'.
{
  const client = newClient();
  const order = [];
  client.onState((s) => order.push(['state', s]));
  client.onReconnected((epoch) => order.push(['reconnected', epoch]));

  client.connect();
  sockets[0].onopen();
  check('first open fires no reconnected', !order.some(([k]) => k === 'reconnected'),
    JSON.stringify(order));
  check('epoch starts at zero', client.reconnectEpoch === 0, String(client.reconnectEpoch));

  // Scope the ordering assertions to the resumed segment alone — the first
  // session's own 'connected' entry must never be able to satisfy them.
  order.length = 0;
  firingCapturedTimers(() => sockets[0].onclose());   // drop -> immediate retry
  sockets[sockets.length - 1].onopen();
  const firstResume = order.filter(([k]) => k === 'reconnected');
  check('resumed open fires reconnected once', firstResume.length === 1
    && firstResume[0][1] === 1, JSON.stringify(order));
  check('epoch advanced', client.reconnectEpoch === 1, String(client.reconnectEpoch));
  const stateIdx = order.findIndex(([k, v]) => k === 'state' && v === 'connected');
  const reconIdx = order.findIndex(([k]) => k === 'reconnected');
  check('reconnected is emitted after connected state', stateIdx >= 0 && reconIdx > stateIdx,
    JSON.stringify(order));

  client.disconnect();                                 // logout
  order.length = 0;
  client.connect();                                    // fresh login
  sockets[sockets.length - 1].onopen();
  check('open after explicit disconnect is a fresh session',
    !order.some(([k]) => k === 'reconnected'), JSON.stringify(order));
  check('epoch untouched by a fresh session', client.reconnectEpoch === 1,
    String(client.reconnectEpoch));

  firingCapturedTimers(() => sockets[sockets.length - 1].onclose());
  sockets[sockets.length - 1].onopen();
  check('epoch is monotonic across sessions', client.reconnectEpoch === 2,
    String(client.reconnectEpoch));
}

// A drop BEFORE any successful open is not a resume: nothing was ever
// live-fed, so the eventual first open must not trigger refetch semantics.
{
  const client = newClient();
  const resumes = [];
  client.onReconnected((e) => resumes.push(e));
  client.connect();
  firingCapturedTimers(() => sockets[0].onclose());    // server down at load
  sockets[sockets.length - 1].onopen();                // first real connection
  check('failed-then-first open is not a resume', resumes.length === 0,
    JSON.stringify(resumes));
}

// Source scan: the retired single-slot property form now silently no-ops, so
// any regression to `ws.onStateChange = fn` (or its siblings) must be loud.
// The reconnect hook's two consumers are pinned as wiring.
{
  const files = [];
  (function walk(dir) {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (entry.endsWith('.js')) files.push(path);
    }
  })(uiJsDir);
  const assignment = /\.(onStatusChange|onStateChange|onLatency)\s*=[^=]/;
  const offenders = files.filter((f) => assignment.test(readFileSync(f, 'utf8')));
  check('no single-slot callback assignments remain', offenders.length === 0,
    offenders.join(', '));
  for (const page of ['dashboard.js', 'sessions.js']) {
    const text = readFileSync(join(uiJsDir, 'pages', page), 'utf8');
    check(`${page} refetches on reconnect`, text.includes('ws.onReconnected('), page);
  }
}

console.log(`ws-lifecycle: ${passed} assertions passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
