// Socket-identity contract for OdinWebSocket.
//
// Closing a socket does not cancel its already-queued events. disconnect()
// clears the reference and connect() installs a NEW socket; the old socket's
// onclose then fires knowing nothing about that, and without an identity guard
// it tears down the LIVE connection — clearing its reference, stopping its ping
// timer, retiring its latency, flipping state to reconnecting and scheduling a
// redundant reconnect on top of a healthy socket.
//
// These assertions drive the real OdinWebSocket against a fake WebSocket, so
// they fail if the guards are removed rather than merely describing them.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, '../ui/js/api.js'), 'utf8');

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

// api.js exports only the singletons; expose the classes on an in-memory copy
// so each assertion can drive a FRESH client. The source itself is unmodified.
const instrumented = `${source}\nexport { OdinAPI, OdinWebSocket };\n`;
const moduleUrl = 'data:text/javascript;base64,'
  + Buffer.from(instrumented).toString('base64');
const { OdinWebSocket, OdinAPI } = await import(moduleUrl);

function newSocketClient() {
  sockets.length = 0;
  const client = new OdinWebSocket(new OdinAPI());
  const latencies = [];
  client.onLatencyChange((ms) => latencies.push(ms));
  return { client, latencies };
}

// A stale socket's close must not disturb a newer live connection.
{
  const { client, latencies } = newSocketClient();
  client.connect();
  const a = sockets[0];
  a.onopen();

  client.disconnect();      // clears _ws, socket A still has queued events
  client.connect();         // installs socket B
  const b = sockets[sockets.length - 1];
  b.onopen();
  b.onmessage({ data: JSON.stringify({ type: 'pong', ts: Date.now() - 7 }) });

  const stateBefore = client.state;
  const latencyBefore = client.latency;

  a.onclose();              // the stale close, arriving late

  check('stale close leaves state untouched', client.state === stateBefore,
    `${stateBefore} -> ${client.state}`);
  check('stale close leaves latency untouched', client.latency === latencyBefore,
    `${latencyBefore} -> ${client.latency}`);
  check('stale close does not drop the live socket', client.connected === true,
    `connected=${client.connected}`);
  check('stale close publishes no latency reset', latencies[latencies.length - 1] >= 0,
    JSON.stringify(latencies));
}

// A stale socket's open must not re-subscribe or claim connected.
{
  const { client } = newSocketClient();
  client.connect();
  const a = sockets[0];
  client.disconnect();
  client.connect();
  const b = sockets[sockets.length - 1];
  b.onopen();

  const sentBefore = b.sent.length;
  a.onopen();  // stale open

  check('stale open does not resubscribe on the live socket', b.sent.length === sentBefore,
    `${sentBefore} -> ${b.sent.length}`);
}

// A stale socket's message must not be delivered.
{
  const { client, latencies } = newSocketClient();
  client.connect();
  const a = sockets[0];
  client.disconnect();
  client.connect();
  const b = sockets[sockets.length - 1];
  b.onopen();
  const before = latencies.length;

  a.onmessage({ data: JSON.stringify({ type: 'pong', ts: Date.now() - 99 }) });

  check('stale message is ignored', latencies.length === before,
    `published ${JSON.stringify(latencies)}`);
}

// The live socket's own close still works normally.
{
  const { client, latencies } = newSocketClient();
  client.connect();
  const a = sockets[0];
  a.onopen();
  a.onmessage({ data: JSON.stringify({ type: 'pong', ts: Date.now() - 5 }) });
  a.onclose();

  check('live close retires the displayed latency', latencies[latencies.length - 1] === -1,
    JSON.stringify(latencies));
}

console.log(`socket-identity: ${passed} assertions passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
