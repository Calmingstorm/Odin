// M9/M10/L4 focused checks (2026-09-22 worklist): the Logs "Tool Activity"
// preset must actually filter, log-search submissions must be single-flight
// with latest-request ownership, and the Sessions row keyboard expansion must
// not fire from bubbling checkbox/buttons keys. These drive the REAL page
// setups with deferred fetches so regressions fail here, not in production.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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
  location: { hash: '#logs' },
};
globalThis.location = { protocol: 'http:', host: 'localhost', hash: '#logs' };

function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const quietWarn = console.warn;
console.warn = () => {};
const { default: logsPage } = await import('../ui/js/pages/logs.js');

// ---------------------------------------------------------------------------
// M9: the Tool Activity preset filters to entries that carry a tool name.
// ---------------------------------------------------------------------------
{
  const state = logsPage.setup();
  console.warn = quietWarn;
  const at = new Date('2026-09-22T16:00:00Z');
  const entry = (id, tool_name, extra = {}) => ({
    id, _time: at, level: 'INFO', text: 'body', searchText: 'body',
    tool: tool_name, record: tool_name ? { tool_name } : null, ...extra,
  });
  state.logs.value = [
    entry(1, 'run_command'),
    entry(2, null),
    entry(3, 'read_file'),
  ];

  const toolsPreset = state.logPresets.find(p => p.id === 'tools');
  assert.ok(toolsPreset, 'tools preset exists');
  state.applyLogPreset(toolsPreset);
  assert.equal(state.activeLogPreset.value, 'tools');
  assert.equal(state.toolOnly.value, true, 'tool-only state must engage');
  assert.deepEqual(state.filteredLogs.value.map(e => e.tool), ['run_command', 'read_file'],
    'Tool Activity preset presented an unfiltered list');
  assert.equal(state.hasActiveLogFilters.value, true, 'tool-only must count as an active filter');

  // Any other preset or explicit level interaction must release tool-only.
  state.applyLogPreset(state.logPresets.find(p => p.id === 'all'));
  assert.equal(state.toolOnly.value, false);
  assert.equal(state.filteredLogs.value.length, 3);
  state.applyLogPreset(toolsPreset);
  state.toggleLevel('ERROR');
  assert.equal(state.toolOnly.value, false, 'level chip left tool-only latched');

  // Custom presets round-trip the tool-only state instead of dropping it.
  state.applyLogPreset(toolsPreset);
  state.showSaveLogPreset.value = true;
  state.newLogPresetName.value = 'tools-only';
  state.saveLogCustomPreset();
  assert.equal(state.customLogPresets.value.at(-1).filters.hasToolName, true);
  state.applyLogPreset(state.logPresets.find(p => p.id === 'all'));
  state.applyCustomLogPreset(state.customLogPresets.value.at(-1));
  assert.equal(state.toolOnly.value, true, 'custom preset lost its tool-only filter');
  assert.deepEqual(state.filteredLogs.value.map(e => e.tool), ['run_command', 'read_file']);
}

// ---------------------------------------------------------------------------
// M10: log search is single-flight and latest-request-owned.
// ---------------------------------------------------------------------------
{
  const gates = [];
  globalThis.fetch = () => {
    const gate = deferred();
    gates.push(gate);
    return gate.promise;
  };
  const state = logsPage.setup();
  console.warn = quietWarn;

  state.searchKeyword.value = 'first';
  const first = state.runSearch();
  assert.equal(state.searching.value, true);

  // Enter bypasses the disabled button: runSearch must refuse the duplicate
  // submission itself instead of racing a second airborne request.
  const suppressed = state.runSearch();
  await suppressed;
  assert.equal(gates.length, 1, 'duplicate submission fired a second request');
  assert.equal(state.searching.value, true, 'duplicate submission disturbed the spinner');

  gates[0].resolve(response({ entries: [{ result_summary: 'first hit' }] }));
  await first;
  assert.equal(state.searchResults.value[0].result_summary, 'first hit');
  assert.equal(state.searching.value, false);

  // Clearing mid-flight retires the airborne response: no resurrected rows,
  // no stale error, and the spinner is owned by the clear.
  state.searchKeyword.value = 'second';
  const inFlight = state.runSearch();
  state.clearSearchFilters();
  assert.equal(state.searching.value, false);
  gates[1].resolve(response({ entries: [{ result_summary: 'must not resurrect' }] }));
  await inFlight;
  assert.deepEqual(state.searchResults.value, [],
    'cleared search was resurrected by an in-flight response');
  assert.equal(state.searchError.value, '');
  assert.equal(state.searchRan.value, false);
}

// ---------------------------------------------------------------------------
// L4: the session row expansion keys must be scoped to the row itself.
// ---------------------------------------------------------------------------
{
  const source = readFileSync(new URL('../ui/js/pages/sessions.js', import.meta.url), 'utf8');
  assert.match(source, /@keydown\.enter\.self="toggleSession\(s\.channel_id\)"/,
    'session row Enter handler still fires for bubbled child events');
  assert.match(source, /@keydown\.space\.self\.prevent="toggleSession\(s\.channel_id\)"/,
    'session row Space handler still fires for bubbled child events');
  assert.ok(!/@keydown\.enter="toggleSession\(s\.channel_id\)"/.test(source),
    'unscoped row Enter handler remains');
}

console.log('logs-preset-search-races: M9 tool preset, M10 search single-flight ownership and L4 row key scoping pinned');
process.exit(0);
