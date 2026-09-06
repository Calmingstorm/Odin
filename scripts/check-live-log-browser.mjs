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
async function assertControlColours(row, label) {
  const state = await row.evaluate(el => {
    const probe = document.createElement('span');
    el.append(probe);
    const tokenColour = token => { probe.style.color = `var(${token})`; return getComputedStyle(probe).color; };
    const info = tokenColour('--hm-info'), muted = tokenColour('--hm-text-muted');
    probe.remove();
    const action = el.querySelector('.log-compact-action');
    return { info, muted, action: action ? getComputedStyle(action).color : null,
      buttons: [...el.querySelectorAll('.output-compact-actions button')].map(button => ({
        name: button.textContent.trim(), pressed: button.getAttribute('aria-pressed') === 'true', colour: getComputedStyle(button).color,
      })) };
  });
  for (const button of state.buttons) {
    assert.equal(button.colour, button.pressed ? state.info : state.muted, `${label}: ${button.name} uses info when pressed, muted when idle`);
    if (button.pressed && state.action) assert.notEqual(button.colour, state.action, `${label}: pressed ${button.name} is distinct from tool-name colour`);
  }
}
// Check painted controls, not just DOM presence: the previous hover overlay
// passed isVisible() while being transparent and stealing the summary's space.
async function assertInlineControls(page, row, label) {
  await row.locator('.output-event-row').scrollIntoViewIfNeeded();
  const state = await row.evaluate(el => {
    const event = el.querySelector('.output-event-row'), summary = el.querySelector('.output-inline-summary');
    const actions = el.querySelector('.output-compact-actions'), controls = el.querySelector('.output-controls');
    const action = el.querySelector('.log-compact-action'), separators = [...el.querySelectorAll('.output-control-separator:not(.output-summary-separator)')];
    const summarySeparators = [...el.querySelectorAll('.output-summary-separator')];
    const rect = node => { const r = node.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width }; };
    const buttons = [...actions.querySelectorAll('button')].map(button => {
      const r = button.getBoundingClientRect(), s = getComputedStyle(button);
      return { ...rect(button), visible: s.visibility === 'visible' && s.opacity === '1',
        hit: button.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)),
        border: s.borderWidth, background: s.backgroundColor, padding: s.padding, minHeight: s.minHeight,
        decoration: s.textDecorationLine, size: parseFloat(s.fontSize) };
    });
    return { event: rect(event), summary: rect(summary), actions: rect(actions), buttons,
      action: action ? rect(action) : null, hasSummary: Boolean(summary.textContent.trim()),
      separators: separators.map(node => ({ ...rect(node), text: node.textContent, hidden: node.getAttribute('aria-hidden'),
        colour: getComputedStyle(node).color, dim: getComputedStyle(node).getPropertyValue('--hm-text-dim').trim() })),
      summarySeparators: summarySeparators.map(node => ({ ...rect(node), text: node.textContent, hidden: node.getAttribute('aria-hidden'),
        colour: getComputedStyle(node).color, dim: getComputedStyle(node).getPropertyValue('--hm-text-dim').trim(),
        sharedStyle: node.classList.contains('output-control-separator'), inButton: Boolean(node.closest('button')) })),
      headingOrder: [...el.querySelector('.output-event-heading').children].map(node => node.classList.contains('output-summary-separator') ? 'output-summary-separator' : node.classList[0]),
      opacity: controls ? getComputedStyle(controls).opacity : '1',
      position: controls ? getComputedStyle(controls).position : 'static',
      overflow: getComputedStyle(summary).overflow, ellipsis: getComputedStyle(summary).textOverflow };
  });
  assert.equal(state.opacity, '1', `${label}: controls painted without hover/focus`);
  assert.equal(state.position, 'static', `${label}: controls occupy normal flow`);
  assert.deepEqual(state.headingOrder, ['log-ts', 'log-level', ...(state.action ? ['log-compact-action', 'output-control-separator'] : []), 'output-compact-actions', ...(state.hasSummary ? ['output-summary-separator'] : [])]);
  assert.equal(state.separators.length, Number(Boolean(state.action)), `${label}: one separator after a named action`);
  for (const separator of state.separators) {
    assert.equal(separator.text, ' | ', `${label}: pipe has a space on either side`);
    assert.ok(separator.width > 0 && separator.left >= state.action.right && separator.right <= state.actions.left, `${label}: separator occupies its own space between tool and controls`);
  }
  assert.equal(state.summarySeparators.length, Number(state.hasSummary), `${label}: em dash only when trailing summary content exists`);
  for (const separator of state.summarySeparators) {
    assert.equal(separator.text, ' — ', `${label}: em dash has a space on either side`);
    assert.equal(separator.sharedStyle, true, `${label}: em dash shares the pipe's styling`);
    assert.equal(separator.inButton, false, `${label}: em dash never forms part of a button label`);
    assert.ok(separator.width > 0 && separator.left >= state.actions.right && separator.right <= state.summary.left, `${label}: em dash occupies its own space after controls and before summary: ${JSON.stringify(state)}`);
  }
  for (const separator of [...state.separators, ...state.summarySeparators]) {
    assert.equal(separator.hidden, 'true', `${label}: separator is decorative for assistive technology`);
    assert.ok(separator.dim, `${label}: dim token exists`);
    assert.equal(separator.colour, await row.evaluate((el, dim) => {
      const probe = document.createElement('span'); probe.style.color = dim; el.append(probe);
      const colour = getComputedStyle(probe).color; probe.remove(); return colour;
    }, separator.dim), `${label}: separator uses the dim text token`);
  }
  assert.ok(state.summary.width > 0, `${label}: summary has a remaining-width lane: ${JSON.stringify(state)}`);
  assert.ok(state.actions.right <= state.summary.left, `${label}: controls never overlap/cover the summary: ${JSON.stringify(state)}`);
  assert.ok(state.summary.right <= state.event.right + 1, `${label}: summary truncates at the right edge`);
  assert.ok(state.event.right <= page.viewportSize().width, `${label}: compact row stays inside viewport`);
  assert.equal(state.overflow, 'hidden');
  assert.equal(state.ellipsis, 'ellipsis');
  for (const button of state.buttons) {
    assert.ok(button.visible && button.hit, `${label}: text control is visible and hit-testable without hover`);
    assert.ok(button.left >= state.event.left && button.right <= state.summary.left, `${label}: each control stays in the left block`);
    assert.ok(button.top >= state.event.top && button.bottom <= state.event.bottom + 1, `${label}: controls stay on the event line`);
    assert.equal(button.border, '0px', `${label}: no button border`);
    assert.equal(button.background, 'rgba(0, 0, 0, 0)', `${label}: no button background, including pressed Wrap`);
    assert.equal(button.padding, '0px');
    assert.equal(button.minHeight, '0px');
    assert.equal(button.decoration, 'none', `${label}: no underline until hover/focus`);
    assert.ok(button.size <= 11, `${label}: small text controls`);
  }
  await assertControlColours(row, label);
}
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
  await page.mouse.move(0, 0);
  await assertInlineControls(page, page.locator('[data-log-id="2"]'), 'agent arguments');
  assert.equal(await page.locator('[data-log-id="2"] .log-compact-action').evaluate(el => {
    const probe = document.createElement('span');
    probe.className = 'logs-tool-badge'; el.parentElement.append(probe);
    const expected = getComputedStyle(probe).color;
    probe.remove();
    const style = getComputedStyle(el);
    return style.color === expected && style.backgroundColor === 'rgba(0, 0, 0, 0)' && style.borderWidth === '0px';
  }), true, 'tool name keeps badge accent as plain text, with no chip');

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
  await page.locator('h1').click();
  await page.mouse.move(0, 0);
  await assertInlineControls(page, page.locator('[data-log-id="2"]'), 'expanded grouped agent at 390px');

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
    ['empty-tool', { tool_name: 'run_command', result_summary: '' }, false],
    ['whitespace-only', { tool_name: 'run_command', result_summary: '   ' }, false],
    ['context-only', { tool_name: 'run_command', status: 0, execution_time_ms: 0, result_summary: '' }, false],
    ['arguments-only', { tool_name: 'read_file', tool_input: { path: '/example/input' }, result_summary: '' }, false],
    ['agent-only', { tool_name: 'read_file', metadata: { agent_id: 'context-agent', agent_label: 'context only' }, result_summary: '' }, false],
    ['warnings-only', { result_summary: JSON.stringify(empty) }, false],
    ['outcome-only', { result_summary: JSON.stringify(failedProcess) }, false],
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
    ['long-tool', { tool_name: 'a_very_long_tool_name_'.repeat(8), tool_input: { path: '/example/long/'.repeat(20) }, success: true, execution_time_ms: 12345, result_summary: 'summary '.repeat(80) }, true],
  ];
  await page.evaluate(rows => rows.forEach(([, record]) => emitLog(record)), cases);
  const row = id => page.locator('.log-line').filter({ has: page.locator(`[data-fixture="${id}"]`) });
  // Tags stay outside the audit values, or a nominally empty record gains a body.
  await page.evaluate(ids => logView.logs.forEach((entry, index) => {
    document.querySelector(`[data-log-id="${entry.id}"] .output-event-row`).dataset.fixture = ids[index];
  }), cases.map(([id]) => id));
  await page.mouse.move(0, 0);
  const noBody = new Set(['empty', 'empty-tool', 'context-only', 'arguments-only', 'agent-only', 'warnings-only', 'outcome-only', 'empty-envelope', 'empty-failed-process']);
  for (const [id, , promoted] of cases) {
    assert.equal(await row(id).locator('.output-compact-preview').count(), Number(promoted), `${id} promotion`);
    assert.equal(await row(id).locator('.output-renderer').count(), 1, `${id} has no second card`);
    assert.equal(await row(id).locator('.output-summary').count(), 0, `${id} has no duplicated metadata header`);
    assert.equal(await row(id).locator('details').count(), 0, `${id} has no routine retained-record footer`);
    assert.equal(await row(id).locator('.output-expand').innerText(), promoted ? 'Expand' : 'Inspect', `${id}: promotion determines action`);
    assert.deepEqual(await row(id).locator('.output-compact-actions button').allTextContents(),
      [...(noBody.has(id) ? [] : ['Wrap', 'Raw', 'Copy']), promoted ? 'Expand' : 'Inspect'], `${id}: only applicable controls in requested order`);
    await assertInlineControls(page, row(id), `${id} desktop`);
  }
  for (const id of ['empty', 'empty-tool', 'whitespace-only', 'warnings-only']) {
    assert.equal(await row(id).locator('.output-summary-separator').count(), 0, `${id}: no dangling em dash`);
    await row(id).locator('.output-expand').click();
    assert.equal(await row(id).locator('.output-summary-separator').count(), 0, `${id}: inspection does not manufacture trailing content`);
    await row(id).locator('.output-expand').click();
  }
  for (const id of ['context-only', 'arguments-only', 'agent-only', 'outcome-only']) {
    assert.equal(await row(id).locator('.output-summary-separator').count(), 1, `${id}: context/outcome is trailing content even without an output body`);
  }
  assert.equal(await row('login').locator('.log-compact-action').evaluate(el => {
    const s = getComputedStyle(el);
    return s.color === 'rgb(167, 139, 250)' && s.backgroundColor === 'rgba(0, 0, 0, 0)' && s.borderWidth === '0px';
  }), true, 'web action retains violet text without chip chrome');
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
  assert.equal(await row('four-lines').locator('.output-expand').innerText(), 'Expand', 'all promoted rows offer expansion');
  assert.doesNotMatch(await row('four-lines').locator('.output-expand').getAttribute('title'), /hidden/, 'no false fold indicator when all content fits');
  assert.equal(await row('five-lines').locator('.output-expand').innerText(), 'Expand');
  assert.equal(await row('five-lines').locator('pre').textContent(), 'line1\nline2\nline3\nline4');
  assert.equal(await row('241').locator('.output-expand').innerText(), 'Expand');
  assert.doesNotMatch(await row('241').locator('.output-expand').getAttribute('title'), /hidden/, '241 chars fit the wide preview without a false fold indicator');
  assert.equal(await row('hostile').locator('img, script').count(), 0);
  assert.match(await row('hostile').locator('pre').textContent(), /\nliteral \\n/);
  assert.equal(await row('one-envelope').evaluate(el => {
    const pre = el.querySelector('pre');
    return pre.previousElementSibling.classList.contains('output-event-row') && getComputedStyle(pre.parentElement).borderWidth === '0px';
  }), true, 'event row is the preview header, not a separate card');

  // Revealing/focusing the old absolute-positioned controls covered the summary.
  // Hover must now change only text decoration, never paint/layout ownership.
  await row('long-tool').scrollIntoViewIfNeeded();
  const beforeHover = await row('long-tool').locator('.output-inline-summary').boundingBox();
  await row('long-tool').getByRole('button', { name: 'Copy', exact: true }).hover();
  assert.equal(await row('long-tool').getByRole('button', { name: 'Copy', exact: true }).evaluate(el => getComputedStyle(el).textDecorationLine), 'underline');
  assert.deepEqual(await row('long-tool').locator('.output-inline-summary').boundingBox(), beforeHover, 'hover cannot shift or clip the summary');
  await page.mouse.move(0, 0);

  // Keyboard-only discovery, inspection, raw/copy and local expansion.
  await page.evaluate(() => {
    window.copiedText = '';
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.copiedText = text; } } });
  });
  await page.mouse.move(0, 0);
  await page.locator('h1').click();
  assert.equal(await row('short-json').locator('.output-controls').evaluate(el => getComputedStyle(el).opacity), '1', 'controls are always painted before hover/focus');
  await row('short-json').locator('.output-expand').focus();
  assert.equal(await row('short-json').locator('.output-expand').evaluate(el => getComputedStyle(el).textDecorationLine), 'underline', 'keyboard focus underlines plain text control');
  await page.keyboard.press('Shift+Tab');
  assert.equal(await row('short-json').getByRole('button', { name: 'Copy', exact: true }).evaluate(el => el === document.activeElement), true, 'controls retain real sequential keyboard navigation');
  await page.keyboard.press('Tab');
  const requestsBeforeControls = allRequests;
  await page.keyboard.press('Enter');
  assert.equal(await row('short-json').locator('.output-expand').getAttribute('aria-expanded'), 'true');
  assert.equal(await row('short-json').locator('pre').textContent(), '{\n  "ok": true,\n  "n": 1\n}');
  await page.keyboard.press('Space');
  assert.equal(await row('short-json').locator('pre').count(), 0);
  await row('login').locator('.output-expand').click();
  await row('login').getByRole('button', { name: 'Raw', exact: true }).click();
  assert.equal(await row('login').getByRole('button', { name: 'Raw', exact: true }).getAttribute('aria-pressed'), 'true');
  await assertControlColours(row('login'), 'pressed Raw beside violet web action');
  assert.match(await row('login').locator('pre').textContent(), /_hmac.*a{64}/s);
  await row('login').getByRole('button', { name: 'Copy', exact: true }).click();
  const rawCopied = JSON.parse(await page.evaluate(() => window.copiedText));
  assert.equal(rawCopied._prev_hmac, login._prev_hmac);
  assert.equal(await page.evaluate(() => logView.logs.find(e => e.record.path === '/api/auth/login').record._hmac), login._hmac);
  await row('login').locator('.output-expand').click();
  assert.equal(await row('login').locator('pre').count(), 0);
  assert.equal(allRequests, requestsBeforeControls, 'expand, raw, copy and keyboard inspection make zero network requests');

  // A single source line wraps into many visual lines at phone widths. The 4-line
  // CSS cap and overflow measurement both apply (not merely split on newline).
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('h1').click();
  await page.mouse.move(0, 0);
  for (const [id] of cases) await assertInlineControls(page, row(id), `${id} mobile`);
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
  await page.waitForFunction(() => document.querySelector('[data-fixture="241"]').querySelector('.output-expand').title.includes('hidden'));
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
  assert.equal(await row('wrapped').getByRole('button', { name: 'Wrap', exact: true }).getAttribute('aria-pressed'), 'false');
  await assertControlColours(row('wrapped'), 'Wrap toggles back to muted');
  assert.equal(await preview.evaluate(el => getComputedStyle(el).whiteSpace), 'pre');
  await row('wrapped').getByRole('button', { name: 'Copy', exact: true }).click();
  assert.equal(await page.evaluate(() => window.copiedText), longWrapped);
  await row('wrapped').locator('.output-expand').click();
  assert.equal(allRequests, beforeExpansion, 'no retrieval on mobile expansion/wrap/copy/collapse');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));

  // Check the tightest mobile lane and the desktop-prefix breakpoint as well.
  await page.locator('h1').click();
  await page.mouse.move(0, 0);
  for (const width of [320, 600, 601, 768]) {
    await page.setViewportSize({ width, height: 900 });
    for (const id of ['login', 'long-tool', 'empty-envelope', 'failed-process']) {
      await assertInlineControls(page, row(id), `${id} at ${width}px`);
    }
    // Row-specific geometry also covers 320px; the page-wide overflow pin
    // stays at 390px and above, independently of the toolbar's layout.
    if (width >= 390) assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), `no document overflow at ${width}px`);
  }

  // Both modes of wrapping must update overflow detection when width changes.
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.waitForFunction(() => !document.querySelector('[data-fixture="241"]').querySelector('.output-expand').title.includes('hidden'));

  // Touch-only has a persistent affordance even without hover.
  const touch = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const touchPage = await touch.newPage();
  await touchPage.route('**/api/**', route => route.fulfill({ contentType: 'application/json', body: '{}' }));
  await touchPage.goto(page.url());
  await touchPage.waitForFunction(() => window.ready);
  await touchPage.evaluate(() => emitLog({ message: 'tap inspection' }));
  await assertInlineControls(touchPage, touchPage.locator('.log-line'), 'touch before interaction');
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
  console.log('live-log-browser: plain accent/violet actions, distinct info-coloured pressed controls, dim aria-hidden pipe and conditional em dash separators without dangling dashes, always-visible text controls in normal flow without summary overlap, applicable actions, compact thresholds, integrated previews, 4 wrapped lines/600 chars, local keyboard/touch/raw/copy, integrity projection, arguments/grouping/filter/pause/scroll/export pass');
} finally {
  if (browser) await browser.close();
  await server.close();
}
