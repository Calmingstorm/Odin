// Stale-response ownership for Audit and Knowledge search (deep-dive 6.2).
//
// Both views fired fetch-then-commit requests with no ownership: rapid
// filter changes or Enter presses raced, and the OLDER response landing
// last rendered rows that did not match the current query. These assertions
// drive the REAL page setups with deferred fetches and interleave the
// completions, so they fail if request ownership regresses.

import assert from 'node:assert/strict';

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

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const quietWarn = console.warn;
console.warn = () => {};
const [
  { default: auditPage },
  { default: knowledgePage },
] = await Promise.all([
  import('../ui/js/pages/audit.js'),
  import('../ui/js/pages/knowledge.js'),
]);
console.warn = quietWarn;

// ---------------------------------------------------------------------------
// Audit: the older response landing last must not replace the newer rows,
// resurrect a spinner, or plant a stale error.
// ---------------------------------------------------------------------------
{
  const gates = [];
  globalThis.fetch = () => {
    const gate = deferred();
    gates.push(gate);
    return gate.promise;
  };
  console.warn = () => {};
  const state = auditPage.setup();
  console.warn = quietWarn;

  state.filters.value.tool = 'old_tool';
  const first = state.fetchAudit();
  state.filters.value.tool = 'new_tool';
  const second = state.fetchAudit();

  gates[1].resolve(response([{ tool_name: 'new_tool' }]));
  await second;
  assert.equal(state.entries.value[0].tool_name, 'new_tool');
  assert.equal(state.loading.value, false);

  gates[0].resolve(response([{ tool_name: 'old_tool' }]));
  await first;
  assert.equal(state.entries.value[0].tool_name, 'new_tool',
    'stale audit response replaced the newer rows');
  assert.equal(state.loading.value, false, 'stale completion disturbed loading');

  // A stale FAILURE must not plant an error under fresh rows.
  const third = state.fetchAudit();
  const fourth = state.fetchAudit();
  gates[3].resolve(response([{ tool_name: 'fresh' }]));
  await fourth;
  gates[2].reject(new Error('stale network failure'));
  await third;
  assert.equal(state.error.value, null, 'stale failure planted an error');
  assert.equal(state.entries.value[0].tool_name, 'fresh');
}

// ---------------------------------------------------------------------------
// Knowledge search: newest search owns the view; clearing mid-flight retires
// whatever is still airborne.
// ---------------------------------------------------------------------------
{
  const gates = [];
  globalThis.fetch = () => {
    const gate = deferred();
    gates.push(gate);
    return gate.promise;
  };
  console.warn = () => {};
  const state = knowledgePage.setup();
  console.warn = quietWarn;

  state.searchQuery.value = 'first';
  const first = state.doSearch();
  state.searchQuery.value = 'second';
  const second = state.doSearch();

  gates[1].resolve(response([{ content: 'second result' }]));
  await second;
  assert.equal(state.searchResults.value[0].content, 'second result');
  assert.equal(state.searching.value, false);

  gates[0].resolve(response([{ content: 'first result' }]));
  await first;
  assert.equal(state.searchResults.value[0].content, 'second result',
    'stale search response replaced the newer results');
  assert.equal(state.searching.value, false, 'stale completion disturbed searching');

  // Clear while in flight: the airborne response must not resurrect results.
  state.searchQuery.value = 'third';
  const third = state.doSearch();
  state.clearSearch();
  assert.equal(state.searching.value, false);
  gates[2].resolve(response([{ content: 'third result' }]));
  await third;
  assert.equal(state.searchResults.value, null,
    'cleared search was resurrected by an in-flight response');
}

console.log('search-races: stale-response ownership pinned on audit and knowledge search');
process.exit(0);
