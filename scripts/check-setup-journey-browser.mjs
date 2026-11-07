import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

// Fresh install to first sign-in through the whole app: a production pending
// installation (scripts/webui-setup-journey-fixture.py), the real app.js
// lifecycle, and a browser that kept a session from an earlier install.
//
// The fixture runs from a caller directory holding a valid persisted session
// store. Production wiring opens ./data paths, so the store must come out of
// the journey byte-identical: the fixture uses only its own installation.
const repo = process.cwd();
const caller = fs.mkdtempSync(path.join(os.tmpdir(), 'odin-setup-journey-caller-'));
const callerData = path.join(caller, 'data');
fs.mkdirSync(callerData);
const secret = randomBytes(32);
const now = Date.now() / 1000;
fs.writeFileSync(path.join(callerData, 'web_sessions.key'), secret.toString('hex'), { mode: 0o600 });
fs.writeFileSync(path.join(callerData, 'web_sessions.json'), JSON.stringify({
  version: 1,
  sessions: {
    [createHash('sha256').update('caller-session').digest('hex')]: {
      user_id: 'api-admin', auth_source: 'legacy', created_at: now, last_activity: now,
      credential_digest: createHmac('sha256', secret).update('caller-credential').digest('hex'),
    },
  },
}), { mode: 0o600 });
const callerSnapshot = () => Object.fromEntries(fs.readdirSync(callerData).sort()
  .map(name => [name, fs.readFileSync(path.join(callerData, name), 'utf8')]));
const callerBefore = callerSnapshot();

const python = process.env.PYTHON || 'python3';
const child = spawn(python, [path.join(repo, 'scripts/webui-setup-journey-fixture.py')], {
  cwd: caller, env: { ...process.env, PYTHONPATH: repo }, stdio: ['ignore', 'pipe', 'pipe'],
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
    configFile: false, root: `${repo}/ui`, base: '/ui/',
    resolve: { alias: { vue: 'vue/dist/vue.esm-bundler.js' } },
    define: { __VUE_OPTIONS_API__: 'true', __VUE_PROD_DEVTOOLS__: 'false', __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false' },
    server: { host: '127.0.0.1', port: 0, watch: null, proxy: { '/api': { target: `http://127.0.0.1:${port}`, ws: true } } },
  });
  await server.listen();
  const executablePath = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium']
    .filter(Boolean).find(candidate => fs.existsSync(candidate));
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

  // Codex never leaves the browser here: the device code is held and then
  // answered locally, and any poll is recorded and refused as the server would.
  let releaseCode;
  const polls = [];
  await page.route('**/api/codex/device-code', route => new Promise(resolve => {
    releaseCode = () => resolve(route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      device_auth_id: 'journey', user_code: 'JRNY', verify_url: 'https://example.test/device', interval: 1,
    }) }));
  }));
  await page.route('**/api/codex/device-poll', route => {
    polls.push(route.request().headers().authorization || '');
    return route.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"unauthorized"}' });
  });
  // The first save answers 401, as a retry does once a partial publication
  // made the credential live. Later saves reach the production fixture.
  let refusedSaves = 0;
  await page.route('**/api/setup/complete', route => {
    if (refusedSaves++ === 0) {
      return route.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"unauthorized"}' });
    }
    return route.continue();
  });

  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/ui/`);
  await page.getByRole('button', { name: 'Start device sign-in' }).click();
  for (let i = 0; i < 500 && !releaseCode; i++) await page.waitForTimeout(10);
  assert.ok(releaseCode, 'the device-code request never left the page');
  await page.getByRole('button', { name: 'Generate admin token' }).click();
  const token = await page.getByLabel('Your new admin token', { exact: true }).inputValue();
  assert.match(token, /^[A-Za-z0-9_-]{64}$/);
  await page.getByRole('button', { name: 'Copy' }).click();
  await page.getByText('Copied.', { exact: true }).waitFor();

  await page.getByRole('button', { name: 'Save setup' }).click();
  await page.getByRole('alert').filter({ hasText: 'Unauthorized' }).waitFor();
  assert.equal(await page.locator('#login-token').count(), 0, 'a 401 during setup does not leave the setup page');
  assert.equal(await page.getByLabel('Your new admin token', { exact: true }).inputValue(), token,
    'a 401 during setup keeps the uncopied token on screen');
  assert.equal(await page.evaluate(() => localStorage.getItem('odin_token')), null,
    'the expired stored session is still dropped');

  await page.getByRole('button', { name: 'Save setup' }).click();
  await page.getByRole('button', { name: 'Continue to sign in' }).waitFor();
  releaseCode();
  await page.waitForTimeout(200);
  assert.deepEqual(polls, [], 'a device code that arrives after the token save never polls');
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
} finally {
  await browser?.close(); await server?.close();
  if (child.exitCode === null && child.signalCode === null) {
    const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited;
  }
}
assert.deepEqual(callerSnapshot(), callerBefore, "the fixture left the caller's session store untouched");
fs.rmSync(caller, { recursive: true, force: true });
console.log('setup-journey-browser: generate, copy, a 401 kept on the setup page, a late device code never polled, sign in with the copied token as admin, listener still loopback, caller data untouched');
