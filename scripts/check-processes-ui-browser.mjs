import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

// The real Processes component, mounted in headless Chromium against an
// ephemeral fixture. This does not contact an installed Odin API or desktop.
const server = await createServer({
  configFile: false, root: process.cwd(), appType: 'custom',
  resolve: { alias: { vue: 'vue/dist/vue.esm-bundler.js' } },
  define: { __VUE_OPTIONS_API__: 'true', __VUE_PROD_DEVTOOLS__: 'false', __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false' },
  server: { host: '127.0.0.1', port: 0, watch: null },
});
const records = [
  { pid: 1, status: 'running', effective_shell: 'bash', termination_reason: null },
  { pid: 2, status: 'completed', exit_code: 0, effective_shell: 'sh', termination_reason: null },
  { pid: 3, status: 'failed', exit_code: 7, effective_shell: 'bash', termination_reason: null },
  { pid: 4, status: 'killed', exit_code: -15, effective_shell: 'bash', termination_reason: 'timeout' },
  { pid: 5, status: 'killed', exit_code: -15, effective_shell: 'sh', termination_reason: 'cancellation' },
  { pid: 6, status: 'unknown', effective_shell: null, termination_reason: null },
  { pid: -1, status: 'running', effective_shell: 'sh', termination_reason: null, host: 'remote-fixture' },
  { pid: 7, status: 'completed' }, // Older API response during a rolling upgrade.
  { pid: 8, status: 'failed', effective_shell: '<b>fixture</b>', termination_reason: '<img src=x onerror="window.injected=true">' },
].map(record => ({ command: 'fixture command', host: 'localhost', uptime_seconds: 1,
  exit_code: null, output_preview: [], ...record }));
const html = `<!doctype html><div id="app"></div><script type="module">
import { createApp, nextTick } from 'vue';
import { api, ws } from '/ui/js/api.js';
import Processes from '/ui/js/pages/processes.js';
const records = ${JSON.stringify(records)};
api.get = async path => { if(path !== '/api/processes') throw new Error(path); return records; };
ws.subscribe = ws.unsubscribe = () => {};
const app = createApp(Processes).component('odin-icon', { template: '<span></span>' });
app.mount('#app');
await nextTick();
window.ready = true;
window.cleanup = () => app.unmount();
</script>`;
server.middlewares.use(async (req, res, next) => {
  if (req.url !== '/fixture.html') return next();
  res.setHeader('Content-Type', 'text/html');
  res.end(await server.transformIndexHtml(req.url, html));
});
let browser;
try {
  await server.listen();
  const executablePath = [process.env.CHROMIUM_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser']
    .find(path => path && fs.existsSync(path));
  assert.ok(executablePath, 'Processes UI regression requires Chrome/Chromium');
  browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/fixture.html`);
  await page.waitForFunction(() => window.ready);
  const cards = page.locator('.hm-card').filter({ has: page.locator('.font-mono.font-semibold') });
  await cards.first().waitFor();
  assert.equal(await cards.count(), records.length);
  for (const [index, record] of records.entries()) {
    const text = await cards.nth(index).innerText();
    assert.ok(text.includes(`PID ${record.pid}`), text);
    assert.ok(text.includes(`Effective shell: ${record.effective_shell ?? 'unknown'}`), text);
    if (record.termination_reason != null) {
      assert.ok(text.includes(`Termination reason: ${record.termination_reason}`), text);
    } else {
      assert.ok(!text.includes('Termination reason:'), text);
    }
  }
  assert.equal(await cards.locator('img, b').count(), 0, 'Facts must render as escaped text');
  assert.equal(await page.evaluate(() => Boolean(window.injected)), false);
  await page.evaluate(() => window.cleanup());
  assert.deepEqual(errors, []);
  console.log(`Processes UI: ${records.length} real Vue cards passed; normal-exit omission, timeout reason, unknown shell and escaping verified.`);
} finally {
  await browser?.close();
  await server.close();
}
