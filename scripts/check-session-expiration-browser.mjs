import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

// Own a fresh Python fixture and headless browser, never the running install,
// desktop browser, configuration or data. All auth/session code is production.
const python = process.env.PYTHON || 'python3';
const child = spawn(python, ['scripts/webui-session-expiration-fixture.py'], {
  cwd: process.cwd(), env: { ...process.env, PYTHONPATH: process.cwd() }, stdio: ['ignore', 'pipe', 'pipe'],
});
let stderr = ''; child.stderr.on('data', chunk => { stderr += chunk; });
let server, browser;
try {
  const port = await new Promise((resolve, reject) => {
    let buffer = '';
    const timer = setTimeout(() => reject(new Error(`fixture startup timeout: ${stderr}`)), 20000);
    child.stdout.on('data', chunk => {
      buffer += chunk;
      if (buffer.includes('\n')) { clearTimeout(timer); resolve(JSON.parse(buffer.split('\n')[0]).port); }
    });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`fixture exit ${code}: ${stderr}`)); });
  });
  const target = `http://127.0.0.1:${port}`;
  const control = async body => {
    const response = await fetch(`${target}/fixture/control`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal(response.status, 200); return response.json();
  };
  server = await createServer({
    configFile: false, root: `${process.cwd()}/ui`, base: '/ui/',
    resolve: { alias: { vue: 'vue/dist/vue.esm-bundler.js' } },
    define: { __VUE_OPTIONS_API__: 'true', __VUE_PROD_DEVTOOLS__: 'false', __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false' },
    server: { host: '127.0.0.1', port: 0, watch: null, proxy: { '/api': { target, ws: true } } },
  });
  await server.listen();
  const executablePath = process.env.CHROMIUM_PATH || ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'].find(p => fs.existsSync(p));
  browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage(); const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  // Fire the actual registered poll callbacks, not a replaced fetchStatus.
  // Avoid waiting 15 seconds; all HTTP/WS/browser lifecycle is still real.
  await page.addInitScript(() => {
    const original = window.setInterval, clear = window.clearInterval;
    window.fixturePolls = new Map(); let id = -1;
    window.setInterval = (fn, ms, ...args) => {
      // Vite's independent dev-server keepalive is harness infrastructure,
      // not an Odin polling owner and must keep its native lifecycle.
      if (ms < 10000 || new Error().stack.includes('/@vite/client')) return original(fn, ms, ...args);
      const key = id--; fixturePolls.set(key, fn); return key;
    };
    window.clearInterval = key => { fixturePolls.delete(key); clear(key); };
    const fetch = window.fetch;
    window.fixtureReads = new Set();
    window.fetch = async (...args) => {
      const response = await fetch(...args);
      const json = response.json.bind(response);
      response.json = async () => {
        const read = json(); fixtureReads.add(read);
        try { return await read; } finally { fixtureReads.delete(read); }
      };
      return response;
    };
  });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/ui/`);
  await page.locator('#login-token').waitFor();
  assert.equal(await page.getByText('Your session ended', { exact: false }).count(), 0);
  await page.locator('#login-token').fill('wrong'); await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await page.getByText('invalid token', { exact: true }).waitFor();
  assert.equal(await page.getByText('Your session ended', { exact: false }).count(), 0);

  async function login() {
    await control({ mode: 'normal' });
    await page.locator('#login-token').fill('browser-fixture-credential');
    await page.getByRole('button', { name: 'Connect', exact: true }).click();
    await page.locator('.app-shell').waitFor();
    await page.waitForFunction(async () => (await import('/ui/js/api.js')).ws.connected);
  }
  async function signedOut() {
    await page.locator('#login-token').waitFor();
    await page.getByText('Your session ended — sign in again.', { exact: true }).waitFor();
    const remainingPolls = await page.evaluate(() => [...fixturePolls.values()].map(fn => fn.toString()));
    assert.deepEqual(await page.evaluate(async () => {
      const { api, ws } = await import('/ui/js/api.js');
      return [api.token, ws.state, ws._shouldConnect, ws._reconnectTimer, fixturePolls.size,
        localStorage.getItem('odin_token'), sessionStorage.getItem('odin_token')];
    }), ['', 'disconnected', false, null, 0, null, null], JSON.stringify(remainingPolls));
    assert.equal(await page.locator('.app-shell').count(), 0);
  }

  // Sign in, revoke using the real server-side manager, then the next poll.
  await login();
  assert.equal(await page.evaluate(() => fixturePolls.size > 0), true);
  await control({ invalidate: true });
  await page.evaluate(() => { for (const poll of [...fixturePolls.values()]) poll(); });
  await signedOut();

  // A page mount's 401 (actual routed capabilities page) also tears down live.
  await login(); await control({ mode: 'page401' });
  await page.getByRole('link', { name: 'Capabilities', exact: true }).click();
  await signedOut();

  // Expiry DURING Dashboard's initial parallel loads cannot leave polling or
  // subscriptions installed by its async mount after the page unmounted.
  await page.evaluate(() => { location.hash = '#/dashboard'; });
  await control({ mode: 'mount401' });
  await page.locator('#login-token').fill('browser-fixture-credential');
  const mountRejection = page.waitForResponse(response => response.url().includes('/api/audit') && response.status() === 401);
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await mountRejection;
  await page.locator('.app-shell').waitFor({ state: 'detached' });
  await signedOut();
  const lastMountResponse = page.waitForResponse(response => response.url().includes('/api/knowledge') && response.status() === 401);
  await control({ release_mount: true });
  await (await lastMountResponse).finished();
  await page.evaluate(async () => {
    await Promise.allSettled([...fixtureReads]);
    for (let i = 0; i < 30; i++) await Promise.resolve();
  });
  await signedOut();
  assert.equal(await page.evaluate(async () => (await import('/ui/js/api.js')).ws._subscriptions.size), 0);

  // A page's 403 keeps the signed-in shell and socket, not the login screen.
  await login(); await control({ mode: 'forbidden' });
  await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
  const forbidden = page.waitForResponse(response => response.url().includes('/api/audit') && response.status() === 403);
  await page.evaluate(async () => { const { api } = await import('/ui/js/api.js'); try { await api.get('/api/audit'); } catch {} });
  await forbidden;
  assert.equal(await page.locator('.app-shell').count(), 1);
  assert.equal(await page.locator('#login-token').count(), 0);

  // No poll: a WS reconnect gets a real HTTP 401 at production middleware,
  // Chromium exposes only 1006, and the HTTP confirmation ends the session.
  await control({ mode: 'normal', invalidate: true });
  await page.evaluate(async () => { const { ws } = await import('/ui/js/api.js'); ws.disconnect(); ws.connect(); });
  await signedOut();
  assert.deepEqual(errors, []);
  console.log('session-expiration-browser: real sign-in, server invalidation/next poll, page 401, preserved 403, Chromium WS-upgrade 401 and live teardown passed');
} finally {
  await browser?.close(); await server?.close();
  if (child.exitCode === null && child.signalCode === null) {
    const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited;
  }
}
