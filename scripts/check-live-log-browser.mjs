import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

// Test only an isolated loopback fixture server. Never load live config/API data.
const server = await createServer({
  configFile: false, root: process.cwd(), appType: 'custom',
  resolve: { alias: { vue: 'vue/dist/vue.esm-bundler.js' } },
  define: { __VUE_OPTIONS_API__: 'true', __VUE_PROD_DEVTOOLS__: 'false', __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false' },
  server: { host: '127.0.0.1', port: 0, watch: null },
});
const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">
  <style>body { margin: 0; } #app { width: 100%; } *, *::before, *::after { box-sizing: border-box; }</style>
  </head><body><div id="app"></div><script type="module">
  import '/ui/css/fonts.css';
  import '/ui/css/tailwind.css';
  import '/ui/css/style.css';
  import '/ui/css/foundation.css';
  import { createApp, h, KeepAlive, nextTick, ref } from 'vue';
  import Logs from '/ui/js/pages/logs.js';
  import { ws } from '/ui/js/api.js';
  const subscriptions = new Map();
  ws.subscribe = (channel, handler) => subscriptions.set(channel, handler);
  ws.unsubscribe = channel => subscriptions.delete(channel);
  const view = ref(null);
  createApp({ render: () => h(KeepAlive, null, { default: () => h(Logs, { ref: view }) }) })
    .component('odin-icon', { template: '<span aria-hidden="true"></span>' }).mount('#app');
  await nextTick();
  window.logView = view.value;
  window.emitLog = record => subscriptions.get('logs')({ type: 'log', line: JSON.stringify(record) });
  window.ready = true;
  </script></body></html>`;
server.middlewares.use(async (request, response, next) => {
  if (request.url !== '/__logs_test__.html') return next();
  response.setHeader('Content-Type', 'text/html');
  response.end(await server.transformIndexHtml(request.url, html));
});
let browser;
try {
  await server.listen();
  const executablePath = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
    .filter(Boolean).find(p => fs.existsSync(p));
  assert.ok(executablePath, 'live log browser regression requires Chrome/Chromium');
  browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  let apiCalls = 0, allRequests = 0;
  page.on('request', () => allRequests++);
  await page.route('**/api/**', route => { apiCalls++; return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }); });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__logs_test__.html`);
  await page.waitForFunction(() => window.ready);
  const agent = {
    timestamp: '2026-09-06T16:00:00Z', tool_name: 'read_file', tool_input: { path: '/example/child.txt', token: '[REDACTED]' },
    metadata: { agent_id: 'child', agent_label: '<img src=x onerror=alert(1)>', parent_agent_id: 'parent', root_agent_id: 'root', originating_turn_id: 'turn-one', iteration: 2, call_id: 'call-one' },
    result_summary: 'first line\nsecond line with literal \\n', error: null,
  };
  await page.evaluate(record => {
    emitLog({ tool_name: 'read_file', turn: { turn_id: 'turn-one' }, tool_input: { path: '/example/main.txt' }, result_summary: 'main result' });
    emitLog(record);
    emitLog({ ...record, metadata: { ...record.metadata, agent_id: 'sibling', call_id: 'call-two' }, result_summary: 'sibling result' });
  }, agent);
  assert.equal(await page.locator('.log-line').count(), 3);
  assert.equal(await page.locator('[data-log-arguments]').count(), 3, 'agent and main arguments have identical visibility');
  assert.match(await page.locator('[data-log-id="2"]').innerText(), /\/example\/child\.txt/);
  assert.equal(await page.locator('[data-log-id="2"] img').count(), 0, 'agent labels are escaped');
  const body = await page.locator('[data-log-id="2"] pre').allTextContents();
  assert.ok(body.some(value => value.includes('first line\nsecond line with literal \\n')), 'real newline and literal escape must remain distinct');

  await page.getByLabel('Group by turn / agent').check();
  assert.equal(await page.locator('[data-log-group]').count(), 1);
  assert.equal(await page.locator('[data-log-agent]').count(), 3);
  assert.match(await page.locator('[data-log-group] h2').innerText(), /Turn turn-one/);
  assert.match(await page.locator('[data-log-agent]').nth(1).innerText(), /parent parent.*root root/);
  const before = apiCalls;
  await page.locator('[data-log-id="2"] .output-expand').click();
  assert.match(await page.locator('[data-log-id="2"] .output-compact-detail').innerText(), /turn turn-one.*parent parent.*root root.*iteration 2.*call call-one/s);
  assert.equal(apiCalls, before, 'local detail expansion must not retrieve');
  await page.setViewportSize({ width: 390, height: 844 });
  const widths = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  assert.ok(widths.scroll <= widths.client, `grouped Logs widened a 390px viewport to ${widths.scroll}`);

  await page.getByPlaceholder('Filter logs...').fill('/example/child.txt');
  assert.equal(await page.locator('.log-line').count(), 2, 'argument values are filterable');
  await page.getByPlaceholder('Filter logs...').fill('call-one');
  assert.equal(await page.locator('.log-line').count(), 1, 'call attribution is filterable');
  await page.getByPlaceholder('Filter logs...').fill('');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.evaluate(() => emitLog({ message: 'buffered', metadata: { originating_turn_id: 'turn-two' } }));
  assert.equal(await page.locator('.log-line').count(), 3);
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  assert.equal(await page.locator('.log-line').count(), 4);
  assert.equal(await page.locator('[data-log-group]').count(), 2);
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  assert.equal(await page.locator('[data-log-group]').count(), 0, 'clear removes grouped state');
  assert.equal(await page.locator('.log-line').count(), 0);

  await page.getByLabel('Group by turn / agent').uncheck();
  await page.setViewportSize({ width: 1400, height: 900 });
  // Full real page, compact vs inspector is not a mock render path.
  const login = { type: 'web_action', method: 'POST', path: '/api/auth/login', status: 200, success: true,
    ip: '192.0.2.1', execution_time_ms: 0, _hmac: 'a'.repeat(64), _prev_hmac: 'b'.repeat(64) };
  const empty = { kind: 'tool_output', status: 'unknown', retention: 'failed', error: 'unavailable', head: '', tail: { text: '' }, truncated: true, cursor: null };
  const oneEnvelope = { kind: 'tool_output', status: 'succeeded', retention: 'retained', result_id: 'fixture',
    total_chars: 1, total_bytes: 1, offset_unit: 'unicode_code_points', start: 0, end: 1, text: 'x', truncated: false, cursor: null };
  const failedProcess = { kind: 'process_output', pid: 42, generation: 'fixture', status: 'completed', exit_code: 17,
    emitted_bytes: 0, retained_bytes: 0, shown_bytes: 0, capture_limit_loss_bytes: 0, not_retained_bytes: 0,
    shown_intervals: [], text: '', truncated: false, cursor: null };
  const longWrapped = Array.from({ length: 60 }, () => 'wrapped words').join(' ');
  const cases = [
    ['login', login, false], ['empty', { result_summary: '' }, false],
    ['240', { message: 'x'.repeat(240) }, false], ['241', { message: 'x'.repeat(241) }, true],
    ['final-newline', { message: 'one\r\n' }, false], ['two-lines', { message: 'one\r\ntwo' }, true],
    ['short-json', { message: '{"ok":true,"n":1}' }, false],
    ['multiline-json', { message: '{\n"ok":true\n}' }, true],
    ['invalid-json', { message: '{not-json' }, false],
    ['invalid-envelope', { message: '{"kind":"tool_output","text":"fake"}' }, false],
    ['empty-envelope', { tool_name: 'read_file', tool_input: { path: '/example/input' }, execution_time_ms: 20, success: true, result_summary: JSON.stringify(empty) }, false],
    ['one-envelope', { result_summary: JSON.stringify(oneEnvelope) }, true],
    ['empty-failed-process', { tool_name: 'manage_process', success: true, result_summary: JSON.stringify(failedProcess) }, false],
    ['failed-process', { tool_name: 'manage_process', success: true, result_summary: JSON.stringify({ ...failedProcess, text: 'failed', emitted_bytes: 6, retained_bytes: 6, shown_bytes: 6, shown_intervals: [[0, 6]] }) }, true],
    ['metadata-error', { detail: '', metadata: { status: 'failed', error: 'specific error reason', operator_detail: 'useful metadata' } }, false],
    ['four-lines', { message: 'line1\nline2\nline3\nline4' }, true],
    ['five-lines', { message: 'line1\nline2\nline3\nline4\nline5' }, true],
    ['wrapped', { message: longWrapped }, true],
    ['hostile', { message: '<img src=x onerror=alert(1)>\nliteral \\n' }, true],
    ['nested-integrity', { message: JSON.stringify({ nested: { _hmac: 'c'.repeat(64), _prev_hmac: 'd'.repeat(64), useful: 'yes' } }) }, false],
  ];
  await page.evaluate(rows => rows.forEach(([id, record]) => emitLog({ ...record, fixture_id: id })), cases);
  const row = id => page.locator('.log-line').filter({ has: page.locator(`[data-fixture="${id}"]`) });
  // Tag the actual retained rows without changing their values or presentation.
  await page.evaluate(() => logView.logs.forEach(entry => {
    document.querySelector(`[data-log-id="${entry.id}"] .output-event-row`).dataset.fixture = entry.record.fixture_id;
  }));
  for (const [id, , promoted] of cases) {
    assert.equal(await row(id).locator('.output-compact-preview').count(), Number(promoted), `${id} promotion`);
    assert.equal(await row(id).locator('.output-renderer').count(), 1, `${id} has no second card`);
    assert.equal(await row(id).locator('.output-summary').count(), 0, `${id} has no duplicated metadata header`);
    assert.equal(await row(id).locator('details').count(), 0, `${id} has no routine retained-record footer`);
  }
  assert.match(await row('login').innerText(), /POST \/api\/auth\/login.*200.*0ms/s);
  assert.ok((await row('login').boundingBox()).height <= 28, 'trivial web action is one scannable line');
  assert.doesNotMatch(await page.locator('[aria-label="Log output"]').innerText(), /_hmac|_prev_hmac|Complete retained record/);
  assert.equal(await row('empty-envelope').locator('pre').count(), 0, 'warnings do not manufacture an empty block');
  assert.match(await row('empty-envelope').innerText(), /source truncated.*retention unavailable/s);
  for (const id of ['empty-failed-process', 'failed-process']) {
    assert.match(await row(id).locator('.output-compact-outcome').innerText(), /PID 42 completed exit 17/);
    assert.match(await row(id).locator('.output-compact-warning').getAttribute('aria-label'), /process exit 17/);
  }
  assert.match(await row('metadata-error').locator('.output-inline-summary').innerText(), /specific error reason/);
  await row('metadata-error').locator('.output-expand').click();
  assert.match(await row('metadata-error').locator('.log-compact-metadata').innerText(), /useful metadata/);
  await row('metadata-error').locator('.output-expand').click();
  assert.equal(await row('two-lines').locator('pre').textContent(), 'one\ntwo');
  assert.equal(await row('four-lines').locator('.output-expand').innerText(), 'Inspect', 'no fold marker when all content fits');
  assert.equal(await row('five-lines').locator('.output-expand').innerText(), 'Expand');
  assert.equal(await row('five-lines').locator('pre').textContent(), 'line1\nline2\nline3\nline4');
  assert.equal(await row('241').locator('.output-expand').innerText(), 'Inspect', '241 chars fit the wide preview without a false fold indicator');
  assert.equal(await row('hostile').locator('img, script').count(), 0);
  assert.match(await row('hostile').locator('pre').textContent(), /\nliteral \\n/);
  assert.equal(await row('one-envelope').evaluate(el => {
    const pre = el.querySelector('pre');
    return pre.previousElementSibling.classList.contains('output-event-row') && getComputedStyle(pre.parentElement).borderWidth === '0px';
  }), true, 'event row is the preview header, not a separate card');

  // Keyboard-only discovery, inspection, raw/copy and local expansion.
  await page.evaluate(() => {
    window.copiedText = '';
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.copiedText = text; } } });
  });
  await page.mouse.move(0, 0);
  await page.locator('h1').click();
  assert.equal(await row('short-json').locator('.output-controls').evaluate(el => getComputedStyle(el).opacity), '0');
  await row('short-json').locator('.output-expand').focus();
  assert.equal(await row('short-json').locator('.output-controls').evaluate(el => getComputedStyle(el).opacity), '1', 'keyboard focus exposes controls');
  const requestsBeforeControls = allRequests;
  await page.keyboard.press('Enter');
  assert.equal(await row('short-json').locator('.output-expand').getAttribute('aria-expanded'), 'true');
  assert.equal(await row('short-json').locator('pre').textContent(), '{\n  "ok": true,\n  "n": 1\n}');
  await page.keyboard.press('Space');
  assert.equal(await row('short-json').locator('pre').count(), 0);
  await row('login').locator('.output-expand').click();
  await row('login').getByRole('button', { name: 'Raw', exact: true }).click();
  assert.match(await row('login').locator('pre').textContent(), /_hmac.*a{64}/s);
  await row('login').getByRole('button', { name: 'Copy', exact: true }).click();
  const rawCopied = JSON.parse(await page.evaluate(() => window.copiedText));
  assert.equal(rawCopied._prev_hmac, login._prev_hmac);
  assert.equal(await page.evaluate(() => logView.logs.find(e => e.record.fixture_id === 'login').record._hmac), login._hmac);
  await row('login').locator('.output-expand').click();
  assert.equal(await row('login').locator('pre').count(), 0);
  assert.equal(allRequests, requestsBeforeControls, 'expand, raw, copy and keyboard inspection make zero network requests');

  // A single source line wraps into many visual lines at phone widths. The 4-line
  // CSS cap and overflow measurement both apply (not merely split on newline).
  await page.setViewportSize({ width: 390, height: 844 });
  for (const id of ['empty-envelope', 'empty-failed-process']) {
    await row(id).scrollIntoViewIfNeeded();
    const visible = await row(id).locator('.output-compact-warning').evaluate(el => {
      const r = el.getBoundingClientRect(), parent = el.closest('.output-event-row').getBoundingClientRect();
      return r.width > 0 && r.left >= parent.left && r.right <= parent.right && r.left >= 0 && r.right <= innerWidth;
    });
    assert.equal(visible, true, `${id} warning is actually inside narrow event row, not clipped beyond it`);
    await row(id).locator('.output-compact-warning').focus();
    await page.keyboard.press('Enter');
    assert.ok(await row(id).locator('.output-compact-warning-detail').isVisible(), 'keyboard reveals complete warning details');
    await row(id).locator('.output-expand').click();
  }
  await page.waitForFunction(() => document.querySelector('[data-fixture="241"]').querySelector('.output-expand').textContent.trim() === 'Expand');
  const wrappedOnly = await row('241').locator('pre').evaluate(el => ({ height: el.clientHeight, full: el.scrollHeight, chars: el.textContent.length }));
  assert.equal(wrappedOnly.chars, 241, 'all source chars are loaded; only visual wrapping hides content');
  assert.ok(wrappedOnly.height <= 72 && wrappedOnly.full > 72, 'fold indicator accounts for rendered lines, not just logical lines/char budget');
  await row('wrapped').scrollIntoViewIfNeeded();
  await page.waitForFunction(() => {
    const pre = document.querySelector('[data-fixture="wrapped"]').parentElement.querySelector('pre');
    return pre.scrollHeight > pre.clientHeight;
  });
  const preview = row('wrapped').locator('pre');
  const dimensions = await preview.evaluate(el => ({ height: el.clientHeight, full: el.scrollHeight, line: parseFloat(getComputedStyle(el).lineHeight), chars: [...el.textContent].length }));
  assert.ok(dimensions.height <= dimensions.line * 4 && dimensions.full > dimensions.height, `wrapped preview cap: ${JSON.stringify(dimensions)}`);
  assert.ok(dimensions.chars <= 600);
  assert.equal(await row('wrapped').locator('.output-expand').innerText(), 'Expand');
  const beforeExpansion = allRequests;
  await row('wrapped').locator('.output-expand').click();
  assert.equal(await preview.textContent(), longWrapped, 'expansion reveals all already-loaded text');
  assert.ok((await preview.boundingBox()).height > dimensions.height);
  await row('wrapped').getByRole('button', { name: 'Wrap', exact: true }).click();
  assert.equal(await preview.evaluate(el => getComputedStyle(el).whiteSpace), 'pre');
  await row('wrapped').getByRole('button', { name: 'Copy', exact: true }).click();
  assert.equal(await page.evaluate(() => window.copiedText), longWrapped);
  await row('wrapped').locator('.output-expand').click();
  assert.equal(allRequests, beforeExpansion, 'no retrieval on mobile expansion/wrap/copy/collapse');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));

  // Both modes of wrapping must update overflow detection when width changes.
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.waitForFunction(() => document.querySelector('[data-fixture="241"]').querySelector('.output-expand').textContent.trim() === 'Inspect');

  // Touch-only has a persistent affordance even without hover.
  const touch = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const touchPage = await touch.newPage();
  await touchPage.route('**/api/**', route => route.fulfill({ contentType: 'application/json', body: '{}' }));
  await touchPage.goto(page.url());
  await touchPage.waitForFunction(() => window.ready);
  await touchPage.evaluate(() => emitLog({ message: 'tap inspection' }));
  await touchPage.locator('.output-expand').tap();
  assert.equal(await touchPage.locator('.output-expand').getAttribute('aria-expanded'), 'true');
  assert.equal(await touchPage.locator('.output-controls').evaluate(el => getComputedStyle(el).opacity), '1');
  await touch.close();
  await row('nested-integrity').locator('.output-expand').click();
  assert.equal(await row('nested-integrity').locator('.output-controls').evaluate(el => getComputedStyle(el).opacity), '1');
  assert.doesNotMatch(await row('nested-integrity').locator('pre').textContent(), /_hmac|_prev_hmac/);

  // Live tail scrolling/export remain local and lossless. Scroll above the end,
  // expand a visible row, and append without stealing the operator's position.
  await page.setViewportSize({ width: 1000, height: 800 });
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await page.evaluate(() => { for (let i = 0; i < 80; i++) emitLog({ message: 'line1\nline2\nline3\nline4\nline5', _hmac: 'fake', seq: i }); });
  await page.waitForFunction(() => {
    const el = logView.logContainer;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 2;
  });
  assert.equal(await page.getByLabel('Auto-scroll').isChecked(), true);
  await page.getByLabel('Auto-scroll').uncheck();
  await page.evaluate(() => { logView.logContainer.scrollTop = 300; });
  const scrollBefore = await page.evaluate(() => logView.logContainer.scrollTop);
  await page.evaluate(() => {
    const region = logView.logContainer.getBoundingClientRect();
    const visible = [...document.querySelectorAll('.log-line')].find(el => el.getBoundingClientRect().top >= region.top + 20);
    visible.querySelector('.output-expand').click();
  });
  assert.equal(await page.evaluate(() => logView.logContainer.scrollTop), scrollBefore, 'local expansion preserves scroll position');
  await page.evaluate(() => emitLog({ message: 'new arrival' }));
  assert.equal(await page.evaluate(() => logView.logContainer.scrollTop), scrollBefore, 'incoming entries do not steal a disarmed scroll');
  await page.getByLabel('Auto-scroll').check();
  await page.waitForFunction(() => logView.logContainer.scrollHeight - logView.logContainer.scrollTop - logView.logContainer.clientHeight < 2);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const download = await downloadPromise;
  const exported = fs.readFileSync(await download.path(), 'utf8');
  assert.match(exported, /"_hmac": "fake"/, 'export retains integrity data, not compact projection');
  assert.deepEqual(errors, []);
  console.log('live-log-browser: compact thresholds, integrated previews, 4 wrapped lines/600 chars, local keyboard/touch/raw/copy, integrity projection, arguments/grouping/filter/pause/scroll/export pass');
} finally {
  if (browser) await browser.close();
  await server.close();
}
