// Turn-State page contract (deep-dive W3, read-only v1).
//
// Drives the real page setup with deterministic client time. The check pins
// priority, retained named failures, activation-owned polling/reconnect
// lifecycle, cooldown copy, and the refresh-only interaction boundary.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { baseParse, NodeTypes } from '@vue/compiler-dom';

const here = dirname(fileURLToPath(import.meta.url));
let fakeNow = 2_000_000_000_000;
Date.now = () => fakeNow;

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

function turnsEnvelope(turns = []) {
  return {
    schema_version: 1, availability: 'available', observed_at: 'display-only',
    configured_enabled: true, limit: 100,
    data: {
      counts: { active: 3, suspended: 1, expired_active: 1, attention_required: 3,
                outcome_unknown_operations: 1, outcome_unknown_turns: 1,
                manual_resolution_operations: 1 },
      diagnostics: { outcome_unknown: { operations: 1, turns: 1,
        by_tool: [{ tool_name: 'run_command', operations: 1 }],
        tools_truncated: false, omitted_tools: 0 } },
      omitted_turns: 0, omitted_attention_turns: 0, truncated: false, turns,
    },
  };
}

function breakersEnvelope(breakers = []) {
  return {
    schema_version: 1, availability: 'available', observed_at: 'display-only',
    lifetime: 'process', data: { breakers },
  };
}

const quietWarn = console.warn;
console.warn = () => {};
const { default: page, elapsedMs } = await import('../ui/js/pages/turn-state.js');
const { ws } = await import('../ui/js/api.js');
console.warn = quietWarn;

function setupPage() {
  console.warn = () => {};
  const state = page.setup();
  console.warn = quietWarn;
  return state;
}

function turnFixture(id, extra = {}) {
  return {
    source: 'discord', channel_id: 'c1', message_id: id,
    turn_generation: 'g', revision: 1, status: 'ACTIVE',
    lease_expires_at: fakeNow / 1000 + 600, recovery_deadline_utc: null,
    last_progress_at: fakeNow / 1000, created_at: fakeNow / 1000,
    suspended_at: null, guild_id: null, user_id: 'u', code_version: 'x',
    schema_version: 4, has_checkpoint: false,
    operations: [], operations_truncated: false,
    ...extra,
  };
}

async function renderState(state) {
  return renderToString(createSSRApp({
    template: page.template,
    setup() { return state; },
  }));
}

// Priority: actionable state leads. OUTCOME_UNKNOWN on a healthy active row
// remains visible evidence but cannot outrank manual, expired, or suspended
// recovery posture and never labels the row as Attention by itself.
{
  const turns = [
    turnFixture('healthy'),
    turnFixture('terminal', { status: 'TERMINAL_FAILED' }),
    turnFixture('suspended', { status: 'SUSPENDED', requires_attention: true }),
    turnFixture('diagnostic-only', { operations: [{ state: 'OUTCOME_UNKNOWN', tool_name: 'run_command', tool_call_id: 'a', iteration: 1, created_at: 0, updated_at: 0 }] }),
    turnFixture('expired', { lease_expires_at: fakeNow / 1000 - 120, expired_lease: true, requires_attention: true }),
    turnFixture('manual', { status: 'TERMINAL_FAILED', requires_attention: true, operations: [{ state: 'MANUAL_RESOLUTION_REQUIRED', tool_name: 'write_file', tool_call_id: 'b', iteration: 2, created_at: 0, updated_at: 0 }] }),
  ];
  globalThis.fetch = async (path) => path.startsWith('/api/turn-state/turns')
    ? response(turnsEnvelope(turns)) : response(breakersEnvelope());
  const state = setupPage();
  await state.fetchTurns();
  assert.deepEqual(state.sortedTurns.value.map(t => t.message_id),
    ['manual', 'expired', 'suspended', 'healthy', 'diagnostic-only', 'terminal'],
    'actionable recovery priority order broken');
  assert.equal(state.priorityBadge(state.sortedTurns.value[0]).label, 'Manual resolution required');
  assert.equal(state.priorityBadge(turns[1]).label, 'Terminal',
    'terminal posture was mislabeled Active');
  assert.equal(state.priorityBadge(turns[3]).label, 'Active',
    'historical OUTCOME_UNKNOWN incorrectly became current Attention');
  const html = await renderState(state);
  assert.match(html, /Historical diagnostics/);
  assert.match(html, /Diagnostic only; not counted as Attention/);
}

// Failure retention: both independently loaded sections keep last-good data
// and render the escaped, named failure beside that retained posture.
{
  let fail = false;
  globalThis.fetch = async (path) => {
    if (fail) return response({ error: path.includes('capacity')
      ? '<breaker snapshot unavailable>' : '<turn snapshot unavailable>' }, 503);
    return path.startsWith('/api/turn-state/turns')
      ? response(turnsEnvelope([turnFixture('retained')]))
      : response(breakersEnvelope([{ name: 'codex:sol', provider: 'codex', model: 'sol', state: 'closed', failed_generations: 0, consecutive_opens: 0, cooldown_remaining_seconds: 0 }]));
  };
  const state = setupPage();
  await state.fetchTurns();
  await state.fetchBreakers();
  fail = true;
  await state.fetchTurns();
  await state.fetchBreakers();
  assert.equal(state.turnsData.value.turns.length, 1, 'turn failure erased last-good posture');
  assert.equal(state.breakersData.value.breakers.length, 1, 'breaker failure erased last-good posture');
  const html = await renderState(state);
  assert.match(html, /Refresh failed: &lt;turn snapshot unavailable&gt; — showing last known posture/,
    'rendered retained turn posture did not name and escape its failure');
  assert.match(html, /Refresh failed: &lt;breaker snapshot unavailable&gt; — showing last known posture/,
    'rendered retained breaker posture did not name and escape its failure');
}

// Deterministic cooldown copy: received-at and now are identical, so a zero
// server cooldown is eligible immediately. Moving client time backwards must
// clamp elapsed to zero rather than inventing one remaining second.
{
  assert.equal(elapsedMs(10, 20), 0, 'client elapsed must clamp at zero');
  const rows = [
    { name: 'codex:sol', provider: 'codex', model: 'sol', state: 'open', failed_generations: 3, consecutive_opens: 1, cooldown_remaining_seconds: 0, probe_eligible: true },
    { name: 'codex:terra', provider: 'codex', model: 'terra', state: 'probing', failed_generations: 3, consecutive_opens: 1, cooldown_remaining_seconds: 0, probe_eligible: false },
    { name: 'ollama:q', provider: 'ollama', model: 'q', state: 'closed', failed_generations: 0, consecutive_opens: 0, cooldown_remaining_seconds: 0, probe_eligible: false },
  ];
  globalThis.fetch = async (path) => path.startsWith('/api/turn-state/turns')
    ? response({ schema_version: 1, availability: 'not_enabled', observed_at: 'x', configured_enabled: false, data: {} })
    : response(breakersEnvelope(rows));
  const state = setupPage();
  await state.fetchBreakers();
  assert.equal(state.cooldownLabel(rows[0]), 'probe eligible');
  fakeNow -= 5_000;
  assert.equal(state.cooldownLabel(rows[0]), 'probe eligible',
    'negative client elapsed invented cooldown time');
  fakeNow += 5_000;
  assert.equal(state.cooldownLabel(rows[1]), 'probe in flight');
  assert.equal(state.cooldownLabel(rows[2]), '—');
}

// Lifecycle behavior, not merely source spelling: activation makes one initial
// request per endpoint, owns a 10s poll and reconnect listener, and disarm
// tears all of them down. A dead view must never continue refreshing.
{
  const realSetInterval = globalThis.setInterval;
  const realClearInterval = globalThis.clearInterval;
  let nextTimer = 1;
  const timers = new Map();
  const cleared = new Set();
  const fakeSetInterval = (fn, delay) => {
    const id = nextTimer++;
    timers.set(id, { fn, delay });
    return id;
  };
  const fakeClearInterval = id => { cleared.add(id); timers.delete(id); };
  globalThis.setInterval = fakeSetInterval;
  globalThis.clearInterval = fakeClearInterval;
  window.setInterval = fakeSetInterval;
  window.clearInterval = fakeClearInterval;

  const calls = { turns: 0, breakers: 0 };
  globalThis.fetch = async (path) => {
    if (path.startsWith('/api/turn-state/turns')) {
      calls.turns += 1;
      return response(turnsEnvelope());
    }
    calls.breakers += 1;
    return response(breakersEnvelope());
  };
  const state = setupPage();
  state.arm();
  state.arm();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls, { turns: 1, breakers: 1 }, 'arm was not idempotent');
  assert.deepEqual([...timers.values()].map(t => t.delay).sort((a, b) => a - b),
    [1000, 10000], 'active view did not own exact tick and 10s poll timers');

  const poll = [...timers.values()].find(t => t.delay === 10000);
  poll.fn();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls, { turns: 2, breakers: 2 }, '10s poll did not refresh both sections');

  ws._emitLifecycle('reconnected', 1);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls, { turns: 3, breakers: 3 }, 'reconnect did not refresh both sections');

  state.disarm();
  state.disarm();
  assert.equal(timers.size, 0, 'deactivation left a timer armed');
  assert.equal(cleared.size, 2, 'deactivation did not release both timers exactly once');
  ws._emitLifecycle('reconnected', 2);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls, { turns: 3, breakers: 3 },
    'deactivated view retained its reconnect listener');

  globalThis.setInterval = realSetInterval;
  globalThis.clearInterval = realClearInterval;
  window.setInterval = realSetInterval;
  window.clearInterval = realClearInterval;
}

// Pin lifecycle hook ownership and the v1 interactive surface structurally.
{
  const source = readFileSync(join(here, '../ui/js/pages/turn-state.js'), 'utf8');
  for (const registration of [
    'onMounted(arm)', 'onActivated(arm)', 'onDeactivated(disarm)', 'onUnmounted(disarm)',
  ]) {
    assert.ok(source.includes(registration), `missing lifecycle registration: ${registration}`);
  }

  const ast = baseParse(page.template);
  const handlers = [];
  (function walk(node) {
    if (node.type === NodeTypes.ELEMENT) {
      for (const prop of node.props || []) {
        if (prop.type === NodeTypes.DIRECTIVE && prop.name === 'on') {
          handlers.push(prop.exp?.content || '');
        }
      }
    }
    for (const child of node.children || []) walk(child);
  })(ast);
  const allowed = /^(refreshAll|fetchTurns|fetchBreakers)$/;
  assert.deepEqual(handlers.filter(h => !allowed.test(h.trim())), [],
    `mutating or unknown handlers in read-only view: ${handlers}`);
  for (const word of ['Resume', 'Resolve', 'Retry the turn', 'Sweep', 'Delete']) {
    assert.ok(!page.template.includes(`>${word}<`), `forbidden control rendered: ${word}`);
  }
}

console.log('turn-state-webui: actionable priority, diagnostic split, retention, cooldown, lifecycle, and read-only contracts pinned');
process.exit(0);
