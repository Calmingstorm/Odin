import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

// Real component + API error handling, isolated loopback page and mocked HTTP.
// No live configuration, SSH connections, or host enrollment mutations.
const server = await createServer({
  configFile: false, root: process.cwd(), appType: 'custom',
  resolve: { alias: { vue: 'vue/dist/vue.esm-bundler.js' } },
  define: { __VUE_OPTIONS_API__: 'true', __VUE_PROD_DEVTOOLS__: 'false', __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false' },
  server: { host: '127.0.0.1', port: 0, watch: null },
});
const html = `<!doctype html><html><body><div id="app"></div><script type="module">
  import { createApp, h, nextTick, ref } from 'vue';
  import Hosts from '/ui/js/pages/hosts.js';
  import { ToastContainer } from '/ui/js/toast.js';
  import { api } from '/ui/js/api.js';
  const view = ref(null);
  createApp({ render: () => h('div', [h(Hosts, { ref: view }), h(ToastContainer)]) })
    .component('odin-icon', { template: '<span></span>' }).mount('#app');
  await nextTick();
  window.hostView = view.value;
  window.api = api;
  window.ready = true;
  </script></body></html>`;
server.middlewares.use(async (request, response, next) => {
  if (request.url !== '/__hosts_test__.html') return next();
  response.setHeader('Content-Type', 'text/html');
  response.end(await server.transformIndexHtml(request.url, html));
});
let browser;
try {
  await server.listen();
  const executablePath = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
    .filter(Boolean).find(p => fs.existsSync(p));
  assert.ok(executablePath, 'host enrollment regression requires Chrome/Chromium');
  browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors = [], unexpected = [];
  page.on('pageerror', error => errors.push(error.message));
  let reply = {}, status = 424;
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    let body;
    let responseStatus = 200;
    if (path === '/api/hosts' && route.request().method() === 'GET') body = { hosts: [] };
    else if (path === '/api/hosts/public-key') body = {
      public_key: 'ssh-ed25519 AAAA', fingerprint: 'SHA256:fixture',
      authorized_keys_command: 'fixture installation command', permissions: 'fixture permissions',
    };
    else if (path === '/api/hosts/candidates') body = { candidate_token: 'fixture', fingerprints: [], tested: false };
    else if (path === '/api/hosts/candidates/fixture/test') { body = reply; responseStatus = status; }
    else { unexpected.push(path); body = { error: 'Unexpected fixture request' }; responseStatus = 500; }
    return route.fulfill({ status: responseStatus, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__hosts_test__.html`);
  await page.waitForFunction(() => window.ready && !hostView.loading);
  await page.getByRole('button', { name: 'Add Host', exact: true }).click();
  await page.getByLabel('Alias', { exact: true }).fill('fixture');
  await page.getByLabel('Address', { exact: true }).fill('example.invalid');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Load public key', exact: true }).click();
  await page.waitForFunction(() => hostView.keyInfo !== null);
  assert.match(await page.locator('#app').innerText(), /ssh-ed25519 AAAA/);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Scan and compare', exact: true }).click();
  await page.waitForFunction(() => hostView.step === 4);

  const diagnostics = [
    'Permission denied (publickey).',
    'connection test timed out',
    'Host key verification failed.',
    'platform mismatch: observed macos; selected linux',
    'Permission denied token=[REDACTED]',
    '<img src=x onerror=alert(1)> literal text',
  ];
  for (const [index, detail] of diagnostics.entries()) {
    reply = { candidate_token: 'fixture', tested: false, last_test: { ok: false, detail } };
    // Exercise both the old 424 shape (without error) and the new one. The
    // detailed result wins even if a generic top-level error is also present.
    if (index > 0) reply.error = 'connection test failed';
    await page.getByRole('button', { name: 'Test connection', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.toast-text'));
    assert.equal(await page.locator('.toast-text').innerText(), detail);
    assert.match(await page.locator('pre[role="status"]').innerText(), new RegExp(detail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.deepEqual(await page.evaluate(() => ({ step: hostView.step, tested: hostView.tested })), { step: 4, tested: false });
    assert.equal(await page.getByRole('button', { name: 'Save and activate' }).count(), 0);
    assert.equal(await page.locator('#app img').count(), 0, 'diagnostics are escaped, never HTML');
    await page.locator('.toast-item').click();
    await page.waitForFunction(() => !document.querySelector('.toast-item'));
  }

  // The backend now supplies error too, so generic API clients get a useful
  // message without needing to understand the host-specific response shape.
  reply.error = reply.last_test.detail;
  const message = await page.evaluate(async () => {
    try { await api.post('/api/hosts/candidates/fixture/test', {}); }
    catch (error) { return error.message; }
  });
  assert.equal(message, reply.last_test.detail);

  // Ordinary non-test errors and missing/malformed response bodies fall back
  // safely, clear stale diagnoses, and never make a candidate activatable.
  for (const body of [{ error: 'candidate is unknown or expired' }, null, { last_test: 'invalid' }]) {
    reply = body;
    status = 400;
    await page.getByRole('button', { name: 'Test connection', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.toast-text'));
    assert.equal(await page.locator('.toast-text').innerText(), body?.error || 'HTTP 400');
    assert.equal(await page.locator('pre[role="status"]').count(), 0);
    assert.equal(await page.evaluate(() => hostView.tested), false);
    await page.locator('.toast-item').click();
    await page.waitForFunction(() => !document.querySelector('.toast-item'));
  }

  // A successful retry advances normally. A later failed retest must revoke
  // the previous client-side success and replace, not retain, that diagnosis.
  reply = { tested: true, last_test: { ok: true, detail: 'authentication and platform verified' } };
  status = 200;
  await page.getByRole('button', { name: 'Test connection', exact: true }).click();
  await page.waitForFunction(() => hostView.step === 5);
  assert.equal(await page.getByRole('button', { name: 'Save and activate' }).isEnabled(), true);
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  reply = { tested: false, last_test: { ok: false, detail: 'connection test timed out' } };
  status = 424;
  await page.getByRole('button', { name: 'Test connection', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.toast-text'));
  assert.equal(await page.evaluate(() => hostView.tested), false);
  assert.equal(await page.locator('.toast-text').innerText(), reply.last_test.detail);
  assert.equal(await page.getByRole('button', { name: 'Save and activate' }).count(), 0);
  assert.deepEqual(errors, []);
  assert.deepEqual(unexpected, [], 'never commit or contact other API endpoints');
  console.log('host-enrollment-browser: public key, 424 diagnostics, OS mismatch, sanitised/escaped text, fallbacks and retry gates passed');
} finally {
  await browser?.close();
  await server.close();
}
