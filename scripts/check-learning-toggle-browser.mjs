import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const source = fs.readFileSync('ui/js/pages/learned.js', 'utf8');
assert.match(source, /When off, Odin neither creates automatic lessons nor adds stored learned entries to model context\. Existing entries are retained\./);
assert.match(source, /api\.put\('\/api\/config', \{ learning: \{ enabled \} \}\)/);

const server = await createServer({
  configFile: false, root: process.cwd(), appType: 'custom',
  resolve: { alias: { vue: 'vue/dist/vue.esm-bundler.js' } },
  define: { __VUE_OPTIONS_API__: 'true', __VUE_PROD_DEVTOOLS__: 'false', __VUE_PROD_HYDRATION_MISMATCH_DETAILS__:'false' },
  server: { host: '127.0.0.1', port: 0, watch: null },
});
const html = `<!doctype html><html><body><div id="app"></div><script type="module">
import {createApp,h,ref,nextTick} from 'vue';
import Learned from '/ui/js/pages/learned.js';
import {api} from '/ui/js/api.js';
api.setToken('admin-fixture');
const view=ref(null);createApp({render:()=>h(Learned,{ref:view})}).component('odin-icon',{template:'<span></span>'}).mount('#app');
await nextTick();window.view=view.value;window.ready=true;</script></body></html>`;
server.middlewares.use(async (req, res, next) => {
  if (req.url !== '/__learning_toggle_test__.html') return next();
  res.setHeader('Content-Type', 'text/html');
  res.end(await server.transformIndexHtml(req.url, html));
});

let browser;
try {
  await server.listen();
  const executablePath = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean).find(fs.existsSync);
  assert.ok(executablePath, 'Chromium required');
  browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const writes = [], errors = [];
  let enabled = true, denyConfig = false, forceReadback = null;
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    assert.equal(request.headers().authorization, 'Bearer admin-fixture');
    if (path === '/api/learned') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ entries: [], count: 0 }) });
    if (path !== '/api/config') throw new Error(`Unexpected request ${path}`);
    if (denyConfig) return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'admin access required' }) });
    if (request.method() === 'PUT') {
      writes.push(request.postDataJSON());
      enabled = request.postDataJSON().learning.enabled;
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ learning: { enabled } }) });
    }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ learning: { enabled: forceReadback ?? enabled } }) });
  });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__learning_toggle_test__.html`);
  await page.waitForFunction(() => window.ready && view.configReady && !view.loading);
  const toggle = page.getByRole('checkbox', { name: 'Automatic learning' });
  assert.equal(await toggle.isChecked(), true);
  await toggle.click();
  await page.waitForFunction(() => !view.savingConfig && view.configReady && !view.learningEnabled);
  assert.deepEqual(writes, [{ learning: { enabled: false } }]);

  forceReadback = false;
  await toggle.click();
  await page.waitForFunction(() => !view.savingConfig && view.configReady);
  assert.deepEqual(writes.at(-1), { learning: { enabled: true } });
  assert.equal(await toggle.isChecked(), false, 'state comes from GET readback, not optimistic PUT intent');

  denyConfig = true;
  await page.evaluate(() => view.fetchLearningConfig());
  await page.waitForFunction(() => !view.configReady && view.configError);
  assert.equal(await page.getByRole('checkbox', { name: 'Automatic learning' }).count(), 0, 'non-admin has no write control');
  assert.match(await page.getByRole('alert').innerText(), /Administrator access is required/);
  assert.deepEqual(errors, []);
  console.log('learning-toggle-browser: state readback, persistence payload, and admin gating verified');
} finally {
  if (browser) await browser.close();
  await server.close();
}
