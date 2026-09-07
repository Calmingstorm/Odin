import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

// The component must be reachable in the shipped application, not only this harness.
const systemSource = fs.readFileSync('ui/js/pages/system.js', 'utf8');
assert.match(systemSource, /import ComputerPage from ['"]\.\/computer\.js['"]/);
assert.match(systemSource, /id: ['"]computer['"], label: ['"]Computer['"], component: ComputerPage/);
const configSource = fs.readFileSync('ui/js/pages/config.js', 'utf8');
assert.match(configSource, /query: \{ tab: 'computer' \}/);
assert.doesNotMatch(configSource, /Computer use is under development/);

// Isolated component harness: loopback test server + mocked API, no desktop.
const server = await createServer({
  configFile: false, root: process.cwd(), appType: 'custom',
  resolve: { alias: { vue: 'vue/dist/vue.esm-bundler.js' } },
  define: { __VUE_OPTIONS_API__: 'true', __VUE_PROD_DEVTOOLS__: 'false', __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false' },
  server: { host: '127.0.0.1', port: 0, watch: null },
});
const html = `<!doctype html><html><body><div id="app"></div><script type="module">
  import { createApp, h, ref, nextTick } from 'vue';
  import Computer from '/ui/js/pages/computer.js';
  import { api } from '/ui/js/api.js';
  api.setToken('fixture-only');
  const view = ref(null);
  createApp({ render: () => h(Computer, { ref: view }) }).mount('#app');
  await nextTick(); window.view = view.value; window.api = api; window.ready = true;
</script></body></html>`;
server.middlewares.use(async (req, res, next) => {
  if (req.url !== '/__computer_test__.html') return next();
  res.setHeader('Content-Type', 'text/html');
  res.end(await server.transformIndexHtml(req.url, html));
});
let browser;
try {
  await server.listen();
  const executablePath = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean).find(p => fs.existsSync(p));
  assert.ok(executablePath, 'Chrome/Chromium required');
  browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const errors = [], requests = [];
  page.on('pageerror', e => errors.push(e.message));
  let state = 'active', code = 200, blocked = null, holdObserve = false;
  let enabled = false, runtimeEnabled = false, runtimeGeneration = 0, holdToggle = false, blockedToggle = null;
  let backend = { platform: 'x11', environment: 'isolated', input_supported: false }, restartRequired = ['backend.environment'];
  const summary = () => ({ available: true, state, enabled, configured_enabled: enabled, runtime_enabled: runtimeEnabled, generation: runtimeGeneration, backend, restart_required: restartRequired, owner_id: 'alice', session_id: 'computer-session', app: 'drawing', last_action: 'executed', last_verification: 'unknown' });
  const frame = () => ({ frame: { evidence_id: 'opaque-frame', captured_at: new Date().toISOString(), expires_at: new Date(Date.now() + 3600000).toISOString(), fresh_for_ms: 1000 } });
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aHj8AAAAASUVORK5CYII=', 'base64');
  await page.route('**/api/**', async route => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname;
    requests.push(path);
    assert.equal(url.search, '', 'credentials must not enter URLs');
    assert.equal(req.headers().authorization, 'Bearer fixture-only');
    if (code !== 200) return route.fulfill({ status: code, contentType: 'application/json', body: JSON.stringify({ error: 'fixture denial' }) });
    let body;
    if (path === '/api/computer') body = summary();
    else if (path === '/api/computer/enabled') {
      assert.equal(req.method(), 'POST');
      assert.deepEqual(Object.keys(req.postDataJSON()), ['enabled']);
      assert.equal(typeof req.postDataJSON().enabled, 'boolean');
      enabled = req.postDataJSON().enabled; runtimeEnabled = enabled; runtimeGeneration++;
      if (holdToggle) { blockedToggle = route; return; }
      body = { enabled };
    } else if (path === '/api/computer/observe') {
      if (holdObserve) { blocked = route; return; }
      body = frame();
    } else if (path === '/api/computer/evidence/opaque-frame') return route.fulfill({ contentType: 'image/png', body: png });
    else if (path === '/api/computer/stop') { state = 'cancelled'; body = summary(); }
    else if (path === '/api/computer/pause') { state = 'paused'; body = summary(); }
    else if (path === '/api/computer/export') {
      assert.deepEqual(req.postDataJSON(), { name: 'drawing.png' });
      body = { artifact_id: 'opaque-artifact', name: 'drawing.png', expires_at: new Date(Date.now() + 3600000).toISOString() };
    } else if (path === '/api/computer/download/opaque-artifact') return route.fulfill({ contentType: 'application/octet-stream', body: 'fixture saved artifact' });
    else throw new Error('Unexpected route ' + path);
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__computer_test__.html`);
  await page.waitForFunction(() => window.ready && !view.loading);
  assert.deepEqual(requests, ['/api/computer']);
  await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
  await page.waitForFunction(() => !view.loading);
  assert.equal(requests.filter(p => /observe|evidence/.test(p)).length, 0);
  const enable = page.getByRole('button', { name: 'Enable computer use', exact: true });
  const disable = page.getByRole('button', { name: 'Disable computer use', exact: true });
  const lifecycle = page.getByRole('region', { name: 'Administrator lifecycle controls' });
  assert.match(await lifecycle.innerText(), /Runtime generation\s+0/);
  assert.match(await lifecycle.innerText(), /backend.environment/);
  assert.match(await lifecycle.innerText(), /Input unavailable: this backend cannot act/);
  assert.match(await lifecycle.innerText(), /Session startup checks capabilities. Unavailable input remains unavailable/);
  await enable.click();
  await page.waitForFunction(() => !view.toggling && view.status.runtime_enabled === true);
  assert.equal(await enable.isEnabled(), false);
  assert.match(await lifecycle.innerText(), /Runtime generation\s+1/);
  assert.match(await lifecycle.innerText(), /Input unavailable/);
  assert.deepEqual(requests.slice(-2), ['/api/computer/enabled', '/api/computer']);
  await disable.click();
  await page.waitForFunction(() => !view.toggling && view.status.runtime_enabled === false);
  assert.equal(await enable.isEnabled(), true);
  assert.equal(requests.filter(p => /observe|evidence/.test(p)).length, 0, 'toggle never captures');
  // Real keyboard activation, not direct Vue method invocation.
  const observe = page.getByRole('button', { name: 'Observe / view frame', exact: true });
  await observe.focus(); await page.keyboard.press('Enter');
  await page.waitForFunction(() => !!view.frameUrl);
  assert.equal(await page.locator('img').count(), 1);
  assert.match(await page.locator('figcaption').innerText(), /Fresh frame/);
  await page.waitForFunction(() => view.freshness.startsWith('Stale'));
  // Explicit hide releases private object URL.
  await page.getByRole('button', { name: 'Hide frame', exact: true }).click();
  assert.equal(await page.locator('img').count(), 0);
  // Hanging Observe cannot disable Stop; late frame response stays discarded.
  holdObserve = true;
  await observe.click();
  await page.waitForFunction(() => view.observing);
  for (let n = 0; n < 50 && !blocked; n++) await new Promise(r => setTimeout(r, 10));
  assert.ok(blocked);
  const stop = page.getByRole('button', { name: 'Stop computer session', exact: true });
  assert.equal(await stop.isEnabled(), true);
  assert.ok((await stop.boundingBox()).height >= 44);
  await stop.tap();
  await page.waitForFunction(() => view.status.state === 'cancelled');
  await blocked.fulfill({ contentType: 'application/json', body: JSON.stringify(frame()) });
  blocked = null; holdObserve = false;
  await page.waitForTimeout(100);
  assert.equal(await page.locator('img').count(), 0);
  await page.getByRole('button', { name: 'Pause and revoke agent input' }).click();
  await page.waitForFunction(() => view.status.state === 'paused');
  assert.match(await page.locator('#app').innerText(), /does not provide remote mouse or keyboard control/);
  await page.getByLabel('Filename', { exact: true }).fill('drawing.png');
  await page.getByRole('button', { name: 'Prepare export', exact: true }).click();
  await page.waitForFunction(() => !!view.artifact);
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download drawing.png', exact: true }).click();
  assert.equal((await downloaded).suggestedFilename(), 'drawing.png');
  // Revocation clears both frame and prepared artifact, and reconnect never captures.
  await observe.click(); await page.waitForFunction(() => !!view.frameUrl);
  code = 403;
  await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
  await page.waitForFunction(() => !view.loading && !!view.error);
  assert.equal(await page.locator('img').count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Download drawing.png' }).count(), 0);
  assert.match(await page.getByRole('alert').innerText(), /Access unavailable or revoked/);
  code = 503;
  await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
  await page.waitForFunction(() => view.status.state === 'unavailable');
  assert.equal(await stop.isEnabled(), true);
  const captureCount = requests.filter(p => p.endsWith('/observe')).length;
  code = 200;
  await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
  await page.waitForFunction(() => !view.loading);
  assert.equal(requests.filter(p => p.endsWith('/observe')).length, captureCount);
  // Lifecycle mutations must not serialize emergency stop/pause behind them.
  holdToggle = true;
  await enable.click();
  await page.waitForFunction(() => view.toggling);
  for (let n = 0; n < 50 && !blockedToggle; n++) await new Promise(r => setTimeout(r, 10));
  assert.ok(blockedToggle);
  assert.equal(await stop.isEnabled(), true);
  assert.equal(await page.getByRole('button', { name: 'Pause and revoke agent input' }).isEnabled(), true);
  await page.getByRole('button', { name: 'Pause and revoke agent input' }).click();
  await page.waitForFunction(() => !view.pausing && view.status.state === 'paused');
  assert.ok(blockedToggle, 'Pause completed before the blocked lifecycle response');
  await stop.click();
  await page.waitForFunction(() => view.status.state === 'cancelled');
  await blockedToggle.fulfill({ contentType: 'application/json', body: JSON.stringify({ enabled: true }) });
  blockedToggle = null; holdToggle = false;
  await page.waitForFunction(() => !view.toggling);
  assert.equal(await page.locator('img').count(), 0);
  // A generation change invalidates evidence even with the same session ID.
  await observe.click(); await page.waitForFunction(() => !!view.frameUrl);
  runtimeGeneration++; backend = undefined; restartRequired = false;
  await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
  await page.waitForFunction(() => !view.loading && !view.frameUrl);
  assert.match(await lifecycle.innerText(), /Input capability is unknown/);
  assert.match(await lifecycle.innerText(), /None reported/);
  // Rejected mutations hide admin controls and are not retried automatically.
  const togglesBefore = requests.filter(p => p.endsWith('/enabled')).length;
  code = 403;
  await disable.click();
  await page.waitForFunction(() => !view.toggling && !!view.error);
  assert.equal(await enable.count(), 0);
  assert.equal(await disable.count(), 0);
  assert.equal(requests.filter(p => p.endsWith('/enabled')).length, togglesBefore + 1);
  assert.match(await page.getByRole('alert').innerText(), /Access unavailable or revoked/);
  assert.deepEqual(errors, []);
  console.log('PASS computer operator: authenticated admin enable/disable and readback, lifecycle/generation/restart/input limits, no auto capture, independent stop/pause during blocked toggle and Observe, no late frame, generation invalidation, keyboard/touch, explicit export/download, mutation rejection and unavailable/reconnect.');
} finally {
  await browser?.close(); await server.close();
}
