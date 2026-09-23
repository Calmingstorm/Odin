// M9/M10/L4 focused checks (2026-09-22 worklist): the Logs "Tool Activity"
// preset must actually filter, log-search submissions must be single-flight
// with latest-request ownership, and the Sessions row keyboard expansion must
// not fire from bubbling checkbox/buttons keys. These drive the REAL page
// setups with deferred fetches so regressions fail here, not in production.

import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { parseLogEntry } from '../ui/js/log-records.js';

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
// Addendum item 2: Warnings+ is an inclusive severity threshold, and preset
// identity/custom preset behaviour remains tied to the actual selected state.
// ---------------------------------------------------------------------------
{
  const state = logsPage.setup();
  console.warn = quietWarn;
  const at = new Date('2026-09-22T16:00:00Z');
  state.logs.value = ['INFO', 'WARNING', 'ERROR', 'CRITICAL'].map((level, i) =>
    parseLogEntry({ timestamp: at.toISOString(), level, message: level }, i + 1, at));

  const warnings = state.logPresets.find(p => p.id === 'warnings');
  state.applyLogPreset(warnings);
  assert.equal(state.levelFilter.value, 'WARNING+');
  assert.equal(state.activeLogPreset.value, 'warnings');
  assert.deepEqual(state.filteredLogs.value.map(e => e.level), ['WARNING', 'ERROR', 'CRITICAL'],
    'Warnings+ must include WARNING, ERROR, and CRITICAL while excluding INFO');

  state.showSaveLogPreset.value = true;
  state.newLogPresetName.value = 'warning-threshold';
  state.saveLogCustomPreset();
  const warningCustom = state.customLogPresets.value.at(-1);
  state.applyLogPreset(state.logPresets.find(p => p.id === 'all'));
  state.applyCustomLogPreset(warningCustom);
  assert.equal(state.activeLogPreset.value, warningCustom.id);
  assert.deepEqual(state.filteredLogs.value.map(e => e.level), ['WARNING', 'ERROR', 'CRITICAL'],
    'custom preset did not retain the Warnings+ threshold');

  // A custom preset saved from an actual single-level filter must remain an
  // exact filter and highlight itself when restored.
  state.toggleLevel('ERROR');
  state.showSaveLogPreset.value = true;
  state.newLogPresetName.value = 'exact-errors';
  state.saveLogCustomPreset();
  const custom = state.customLogPresets.value.at(-1);
  assert.equal(custom.filters.level, 'ERROR');
  state.applyLogPreset(warnings);
  state.applyCustomLogPreset(custom);
  assert.equal(state.activeLogPreset.value, custom.id);
  assert.equal(state.levelFilter.value, 'ERROR');
  assert.deepEqual(state.filteredLogs.value.map(e => e.level), ['ERROR']);
}

// ---------------------------------------------------------------------------
// M9: the Tool Activity preset filters to entries that carry a tool name.
// ---------------------------------------------------------------------------
{
  const state = logsPage.setup();
  console.warn = quietWarn;
  const at = new Date('2026-09-22T16:00:00Z');
  state.logs.value = [
    parseLogEntry({ timestamp: at.toISOString(), tool_name: 'run_command', message: 'one' }, 1, at),
    parseLogEntry({ timestamp: at.toISOString(), message: 'ordinary log' }, 2, at),
    parseLogEntry({ timestamp: at.toISOString(), tool_name: 'read_file', message: 'two' }, 3, at),
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

  state.removeLogCustomPreset(state.customLogPresets.value.at(-1).id);
  assert.equal(state.activeLogPreset.value, 'all');
  assert.equal(state.toolOnly.value, false, 'All Logs retained tool-only state');
  assert.equal(state.levelFilter.value, '');
  assert.equal(state.textFilter.value, '');
  assert.equal(state.timeRange.value, '');
  assert.equal(state.filteredLogs.value.length, 3);
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
// L4: mount the real Sessions page and dispatch actual browser key events.
// Handler-only setup checks cannot detect missing DOM dispatch or `.self`
// modifier regressions on the row's bubbling keydown listeners.
const server = await createServer({
  configFile: false, root: process.cwd(), appType: 'custom',
  resolve: { alias: { vue: 'vue/dist/vue.esm-bundler.js' } },
  define: { __VUE_OPTIONS_API__: 'true', __VUE_PROD_DEVTOOLS__: 'false', __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false' },
  server: { host: '127.0.0.1', port: 0, watch: null },
});
const originalWarn = console.warn;
console.warn = quietWarn;
const sessionFixture = [{
  channel_id: 'keyboard-session', source: 'discord',
  last_active: Math.floor(Date.now() / 1000), created_at: Math.floor(Date.now() / 1000),
  message_count: 1, channel_name: 'keyboard-session',
}];
const sessionHtml = `<!doctype html><html><body><div id="app"></div><script type="module">
  import { createApp, h, KeepAlive, nextTick, ref } from 'vue';
  import Sessions from '/ui/js/pages/sessions.js';
  const view = ref(null);
  createApp({ render: () => h(KeepAlive, null, { default: () => h(Sessions, { ref: view }) }) })
    .component('odin-icon', { template: '<span aria-hidden="true"></span>' }).mount('#app');
  await nextTick();
  window.sessionView = view.value;
  window.ready = true;
  </script></body></html>`;
server.middlewares.use(async (request, response, next) => {
  if (request.url !== '/__sessions_keyboard_test__.html') return next();
  response.setHeader('Content-Type', 'text/html');
  response.end(await server.transformIndexHtml(request.url, sessionHtml));
});
let browser;
try {
  const address = await server.listen();
  const origin = `http://127.0.0.1:${address.httpServer.address().port}`;
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.route('**/api/sessions**', async route => {
    const path = new URL(route.request().url()).pathname;
    const payload = path === '/api/sessions'
      ? sessionFixture
      : { messages: [] };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
  });
  await page.goto(`${origin}/__sessions_keyboard_test__.html`);
  await page.waitForFunction(() => window.ready && window.sessionView?.sessions.length === 1);
  const header = page.locator('.session-card [role="button"]');
  const checkbox = page.locator('.session-card input[type="checkbox"]');
  await header.waitFor();
  const waitExpanded = async value => page.waitForFunction(expected =>
    document.querySelector('.session-card [role="button"]')?.getAttribute('aria-expanded') === String(expected), value);

  await header.focus();
  await page.keyboard.press('Space');
  await waitExpanded(true);
  await page.keyboard.press('Enter');
  await waitExpanded(false);
  await page.keyboard.press('Enter');
  await waitExpanded(true);
  await page.keyboard.press('Space');
  await waitExpanded(false);

  await checkbox.focus();
  await page.keyboard.press('Space');
  await page.waitForTimeout(50);
  assert.equal(await header.getAttribute('aria-expanded'), 'false',
    'Space bubbling from the nested checkbox must not expand the session row');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(50);
  assert.equal(await header.getAttribute('aria-expanded'), 'false',
    'Enter bubbling from the nested checkbox must not expand the session row');
} finally {
  console.warn = originalWarn;
  if (browser) await browser.close();
  await server.close();
}

console.log('logs-preset-search-races: M9 parse/filter/reset, M10 search ownership, Warnings+ CRITICAL, and mounted Sessions Space/Enter dispatch passed');
