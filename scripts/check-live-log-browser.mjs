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
  let apiCalls = 0;
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
  await page.locator('[data-log-id="2"] summary').filter({ hasText: 'Complete retained record' }).click();
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
  assert.deepEqual(errors, []);
  console.log('live-log-browser: real Logs page retains args/newlines, escapes labels, groups siblings and parent, filters attribution, pauses/resumes/clears locally');
} finally {
  if (browser) await browser.close();
  await server.close();
}
