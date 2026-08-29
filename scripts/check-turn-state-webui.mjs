// Turn-State page contract (deep-dive W3, read-only v1).
//
// Drives the REAL page setup with stubbed fetch: rendering priority puts
// external-effect uncertainty first, refresh failures retain last-good
// posture, staleness ticks from client receipt time, cooldown reaching zero
// changes copy only, and the template carries NO mutating controls — the
// v1 boundary is observational by construction.

import assert from 'node:assert/strict';
import { baseParse, NodeTypes } from '@vue/compiler-dom';

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

const quietWarn = console.warn;
console.warn = () => {};
const { default: page } = await import('../ui/js/pages/turn-state.js');
console.warn = quietWarn;

function turnFixture(id, extra = {}) {
  return {
    source: 'discord', channel_id: 'c1', message_id: id,
    turn_generation: 'g', revision: 1, status: 'ACTIVE',
    lease_expires_at: Date.now() / 1000 + 600, recovery_deadline_utc: null,
    last_progress_at: Date.now() / 1000, created_at: Date.now() / 1000,
    suspended_at: null, guild_id: null, user_id: 'u', code_version: 'x',
    schema_version: 4, has_checkpoint: false,
    operations: [], operations_truncated: false,
    ...extra,
  };
}

// Priority: wire order deliberately scrambled; OUTCOME_UNKNOWN must lead,
// then manual resolution, expired lease, suspended, healthy active.
{
  const turnsBody = {
    schema_version: 1, availability: 'available', observed_at: 'x',
    configured_enabled: true, limit: 100,
    data: {
      counts: { active: 3, suspended: 1, attention_required: 2,
                outcome_unknown_operations: 1, manual_resolution_operations: 1 },
      truncated: false,
      turns: [
        turnFixture('healthy'),
        turnFixture('suspended', { status: 'SUSPENDED' }),
        turnFixture('unknown', { operations: [{ state: 'OUTCOME_UNKNOWN', tool_name: 'run_command', tool_call_id: 'a', iteration: 1, created_at: 0, updated_at: 0 }] }),
        turnFixture('expired', { lease_expires_at: Date.now() / 1000 - 120 }),
        turnFixture('manual', { status: 'TERMINAL_FAILED', operations: [{ state: 'MANUAL_RESOLUTION_REQUIRED', tool_name: 'write_file', tool_call_id: 'b', iteration: 2, created_at: 0, updated_at: 0 }] }),
      ],
    },
  };
  globalThis.fetch = async (path) => {
    if (path.startsWith('/api/turn-state/turns')) return response(turnsBody);
    return response({ schema_version: 1, availability: 'available', observed_at: 'x', lifetime: 'process', data: { breakers: [] } });
  };
  console.warn = () => {};
  const state = page.setup();
  console.warn = quietWarn;
  await state.fetchTurns();
  assert.equal(state.turnsAvailability.value, 'available');
  assert.deepEqual(state.sortedTurns.value.map(t => t.message_id),
    ['unknown', 'manual', 'expired', 'suspended', 'healthy'],
    'rendering priority order broken');
  assert.equal(state.priorityBadge(state.sortedTurns.value[0]).label, 'Outcome unknown');
  // Expired lease is a DISPLAY fact — status itself is untouched.
  assert.equal(state.sortedTurns.value[2].status, 'ACTIVE');
}

// Failure retention + staleness: a failed refresh keeps last-good posture
// and names the failure; staleness ticks from client receipt time.
{
  let fail = false;
  globalThis.fetch = async (path) => {
    if (fail) return response({ error: 'down' }, 500);
    if (path.startsWith('/api/turn-state/turns')) {
      return response({ schema_version: 1, availability: 'available', observed_at: 'x', configured_enabled: true, limit: 100,
        data: { counts: { active: 1, suspended: 0, attention_required: 0, outcome_unknown_operations: 0, manual_resolution_operations: 0 }, truncated: false, turns: [turnFixture('t1')] } });
    }
    return response({ schema_version: 1, availability: 'available', observed_at: 'x', lifetime: 'process', data: { breakers: [] } });
  };
  console.warn = () => {};
  const state = page.setup();
  console.warn = quietWarn;
  await state.fetchTurns();
  assert.equal(state.turnsData.value.turns.length, 1);
  fail = true;
  await state.fetchTurns();
  assert.equal(state.turnsData.value.turns.length, 1, 'failed refresh erased last-good posture');
  assert.match(state.turnsError.value, /down|HTTP 500/);
  assert.equal(state.turnsStale.value, false);
}

// Cooldown copy: countdown decrements client-side; zero flips COPY only —
// "probing" never appears unless the server reported it.
{
  globalThis.fetch = async (path) => {
    if (path.startsWith('/api/turn-state/turns')) {
      return response({ schema_version: 1, availability: 'not_enabled', observed_at: 'x', configured_enabled: false, data: {} });
    }
    return response({ schema_version: 1, availability: 'available', observed_at: 'x', lifetime: 'process',
      data: { breakers: [
        { name: 'codex:sol', provider: 'codex', model: 'sol', state: 'open', failed_generations: 3, consecutive_opens: 1, cooldown_seconds: 60, cooldown_remaining_seconds: 0, probe_eligible: true },
        { name: 'codex:terra', provider: 'codex', model: 'terra', state: 'probing', failed_generations: 3, consecutive_opens: 1, cooldown_seconds: 60, cooldown_remaining_seconds: 0, probe_eligible: false },
        { name: 'ollama:q', provider: 'ollama', model: 'q', state: 'closed', failed_generations: 0, consecutive_opens: 0, cooldown_seconds: 0, cooldown_remaining_seconds: 0, probe_eligible: false },
      ] } });
  };
  console.warn = () => {};
  const state = page.setup();
  console.warn = quietWarn;
  await state.fetchTurns();
  await state.fetchBreakers();
  assert.equal(state.turnsAvailability.value, 'not_enabled');
  assert.equal(state.turnsData.value, null);
  const rows = state.breakersData.value.breakers;
  assert.equal(state.cooldownLabel(rows[0]), 'probe eligible', 'elapsed cooldown must not claim probing');
  assert.equal(state.cooldownLabel(rows[1]), 'probe in flight');
  assert.equal(state.cooldownLabel(rows[2]), '—');
  assert.equal(state.breakerBadge(rows[0]), 'badge-danger');
  assert.equal(state.breakerBadge(rows[2]), 'badge-success');
}

// Read-only boundary: the template's interactive surface is refresh-only.
{
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
  const offenders = handlers.filter(h => !allowed.test(h.trim()));
  assert.deepEqual(offenders, [], `mutating or unknown handlers in a read-only view: ${offenders}`);
  for (const word of ['Resume', 'Resolve', 'Retry the turn', 'Sweep', 'Delete']) {
    assert.ok(!page.template.includes(`>${word}<`), `forbidden control rendered: ${word}`);
  }
}

console.log('turn-state-webui: priority, retention, cooldown-copy, and read-only contracts pinned');
process.exit(0);
