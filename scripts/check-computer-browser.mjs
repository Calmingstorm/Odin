import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

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
  const summary = () => ({ available: true, state, owner_id: 'alice', session_id: 'computer-session', app: 'drawing', last_action: 'executed', last_verification: 'unknown' });
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
    else if (path === '/api/computer/observe') {
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
  const stop = page.getByRole('button', { name: 'Stop isolated session', exact: true });
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
  assert.deepEqual(errors, []);
  console.log('PASS computer operator: explicit capture, keyboard/touch, bounded freshness, stop during blocked Observe, no late frame, pause, explicit authenticated export/download, revocation and unavailable/reconnect.');
} finally {
  await browser?.close(); await server.close();
}
