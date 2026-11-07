import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

// Fresh install to first sign-in through the whole app: a production pending
// installation (scripts/webui-setup-journey-fixture.py), the real app.js
// lifecycle, and a browser that kept a session from an earlier install.
const python = process.env.PYTHON || 'python3';
const child = spawn(python, ['scripts/webui-setup-journey-fixture.py'], {
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
  server = await createServer({
    configFile: false, root: `${process.cwd()}/ui`, base: '/ui/',
    resolve: { alias: { vue: 'vue/dist/vue.esm-bundler.js' } },
    define: { __VUE_OPTIONS_API__: 'true', __VUE_PROD_DEVTOOLS__: 'false', __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false' },
    server: { host: '127.0.0.1', port: 0, watch: null, proxy: { '/api': { target: `http://127.0.0.1:${port}`, ws: true } } },
  });
  await server.listen();
  const executablePath = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium']
    .filter(Boolean).find(path => fs.existsSync(path));
  assert.ok(executablePath, 'setup journey check requires Chrome/Chromium');
  browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
  await context.addInitScript(() => {
    if (sessionStorage.getItem('journey-seeded')) return;
    sessionStorage.setItem('journey-seeded', '1');
    localStorage.setItem('odin_persist', '1');
    localStorage.setItem('odin_token', 'stale-session-from-an-earlier-install');
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/ui/`);

  await page.getByRole('button', { name: 'Generate admin token' }).click();
  const token = await page.getByLabel('Your new admin token', { exact: true }).inputValue();
  assert.match(token, /^[A-Za-z0-9_-]{64}$/);
  await page.getByRole('button', { name: 'Copy' }).click();
  await page.getByText('Copied.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Save setup' }).click();
  await page.getByRole('button', { name: 'Continue to sign in' }).click();

  await page.locator('#login-token').waitFor();
  assert.equal(await page.getByText('Your session ended', { exact: false }).count(), 0,
    'a session kept from an earlier install is not reported as ending on the first sign-in');
  await page.locator('#login-token').fill(await page.evaluate(() => navigator.clipboard.readText()));
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await page.locator('.app-shell').waitFor();

  const signedIn = await page.evaluate(async () => {
    const { api } = await import('/ui/js/api.js');
    const headers = { Authorization: `Bearer ${api.token}` };
    const session = await (await fetch('/api/auth/session', { headers })).json();
    const setup = await fetch('/api/setup/status', { headers });
    return { session, setupStatus: setup.status, listener: (await setup.json()).listener };
  });
  assert.equal(signedIn.session.authenticated, true);
  assert.equal(signedIn.session.user_id, 'api-admin', 'the generated token signs in as the admin identity');
  assert.equal(signedIn.setupStatus, 200, 'the session reaches an admin-only route');
  assert.equal(signedIn.listener.loopback_restricted, true, 'setup did not widen the listener');
  assert.deepEqual(signedIn.listener.listening_hosts, ['127.0.0.1']);
  assert.deepEqual(errors, []);
  console.log('setup-journey-browser: generate, copy, save, sign in with the copied token as admin, listener still loopback');
} finally {
  await browser?.close(); await server?.close();
  if (child.exitCode === null && child.signalCode === null) {
    const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited;
  }
}
