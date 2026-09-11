#!/usr/bin/env node
/** Browser regression checks for the pending-install browser surface. */
import assert from 'node:assert/strict';
import fs, { readFileSync } from 'node:fs';
import { baseParse } from '@vue/compiler-dom';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const app = readFileSync(new URL('../ui/js/app.js', import.meta.url), 'utf8');
const setup = readFileSync(new URL('../ui/js/pages/setup.js', import.meta.url), 'utf8');

assert.doesNotMatch(setup, /\/api\/(?:status|config|admin|llm)/,
  'setup page must not request unrestricted management endpoints');
for (const endpoint of ['/api/setup/complete', '/api/codex/device-code', '/api/codex/device-poll']) {
  assert.ok(setup.includes(endpoint), `missing setup allowlist endpoint ${endpoint}`);
}
assert.doesNotMatch(setup, /localStorage|sessionStorage|console\.(?:log|debug|info)/,
  'setup credentials must not be persisted or logged by the browser');
assert.doesNotMatch(setup, /restart_scheduled|restarting/i,
  'setup UI must not promise a restart');
baseParse(setup.match(/template: `([\s\S]*?)`,\n  setup/)?.[1] || '');

const server = await createServer({
  configFile: false, root: process.cwd(), appType: 'custom',
  resolve: { alias: { vue: 'vue/dist/vue.esm-bundler.js' } },
  define: { __VUE_OPTIONS_API__: 'true', __VUE_PROD_DEVTOOLS__: 'false', __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false' },
  server: { host: '127.0.0.1', port: 0, watch: null },
});
const html = `<!doctype html><html><body><div id="app"></div><script type="module">
  import { createApp, h, nextTick, ref } from 'vue';
  import Setup from '/ui/js/pages/setup.js';
  const view = ref(null);
  createApp({ render: () => h(Setup, { ref: view, onComplete: () => window.completed = true }) })
    .component('odin-icon', { template: '<span></span>' }).mount('#app');
  await nextTick(); window.setupView = view.value; window.ready = true;
</script></body></html>`;
server.middlewares.use(async (request, response, next) => {
  if (request.url !== '/__setup_test__.html') return next();
  response.setHeader('Content-Type', 'text/html');
  response.end(await server.transformIndexHtml(request.url, html));
});

let browser;
try {
  await server.listen();
  const executablePath = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium']
    .filter(Boolean).find(path => fs.existsSync(path));
  assert.ok(executablePath, 'setup UI regression requires Chrome/Chromium');
  browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const calls = [];
  let completeRequest;
  let oldPoll;
  let pollCount = 0;
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    calls.push({ path, body: route.request().postDataJSON?.() });
    if (path === '/api/setup/complete') {
      await new Promise(resolve => { completeRequest = resolve; });
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'ok', persisted: true }) });
    }
    if (path === '/api/codex/device-code') {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ device_auth_id: 'attempt', user_code: 'ABCD', verify_url: 'https://example.test/device', interval: 1 }) });
    }
    if (path === '/api/codex/device-poll') {
      pollCount += 1;
      if (pollCount === 1) {
        // Deliberately retain the old poll. A cancelled generation must not be
        // permitted to overwrite the next attempt when it later resolves.
        await new Promise(resolve => { oldPoll = () => resolve(route.fulfill({ contentType: 'application/json', body: JSON.stringify({ email: 'old@example.test' }) })); });
        return;
      }
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ email: 'new@example.test' }) });
    }
    return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'unexpected endpoint' }) });
  });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__setup_test__.html`);
  await page.waitForFunction(() => window.ready);
  await page.getByLabel('Web API token').fill('not-retained');
  await page.getByLabel(/Discord token/).fill('also-not-retained');
  await page.getByRole('button', { name: 'Save setup' }).click();
  await page.waitForFunction(() => window.setupView.saving);
  assert.deepEqual(await page.evaluate(() => ({ web: setupView.webApiToken, discord: setupView.discordToken })), { web: '', discord: '' },
    'credentials are cleared immediately after request serialization, not after the response');
  completeRequest();
  await page.getByRole('button', { name: 'Continue' }).waitFor();
  assert.deepEqual(calls[0], { path: '/api/setup/complete', body: { web_api_token: 'not-retained', discord_token: 'also-not-retained' } });

  await page.getByRole('button', { name: 'Start device sign-in' }).click();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: 'Start device sign-in' }).click();
  await page.getByText('Device account ready: new@example.test.').waitFor();
  oldPoll();
  await page.waitForTimeout(50);
  assert.equal(await page.getByText('Device account ready: new@example.test.').count(), 1,
    'a cancelled old poll must not overwrite the newer attempt result');
  console.log('setup UI browser checks passed');
} finally {
  await browser?.close();
  await server.close();
}
