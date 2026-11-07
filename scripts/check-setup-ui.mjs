#!/usr/bin/env node
/** Browser regression checks for the pending-install browser surface. */
import assert from 'node:assert/strict';
import fs, { readFileSync } from 'node:fs';
import { baseParse } from '@vue/compiler-dom';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

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
assert.doesNotMatch(setup, /Math\.random/, 'admin tokens come only from WebCrypto');
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
  window.setupApp = createApp({ render: () => h(Setup, { ref: view, onComplete: () => window.completed = true }) })
    .component('odin-icon', { template: '<span></span>' });
  window.setupApp.mount('#app');
  await nextTick(); window.setupView = view.value; window.ready = true;
</script></body></html>`;
server.middlewares.use(async (request, response, next) => {
  if (request.url !== '/__setup_test__.html') return next();
  response.setHeader('Content-Type', 'text/html');
  response.end(await server.transformIndexHtml(request.url, html));
});

const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

async function until(read, message, timeout = 5000) {
  const deadline = Date.now() + timeout;
  while (!read()) {
    assert.ok(Date.now() < deadline, message);
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

let browser;
let url;
// Every scenario gets a fresh page and its own API replies. An endpoint with
// no reply fails the request, so the page cannot quietly call anything else.
async function openSetup({ permissions = [], init } = {}) {
  const context = await browser.newContext({ permissions });
  if (init) await context.addInitScript(init);
  const page = await context.newPage();
  const calls = [];
  const replies = {};
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    calls.push({ path, body: route.request().postDataJSON?.() });
    if (replies[path]) return replies[path](route);
    return json(route, { error: 'unexpected endpoint' }, 500);
  });
  await page.goto(url);
  await page.waitForFunction(() => window.ready);
  return { context, page, calls, replies, setupCalls: () => calls.filter(call => call.path === '/api/setup/complete') };
}

try {
  await server.listen();
  url = `http://127.0.0.1:${server.httpServer.address().port}/__setup_test__.html`;
  const executablePath = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium']
    .filter(Boolean).find(path => fs.existsSync(path));
  assert.ok(executablePath, 'setup UI regression requires Chrome/Chromium');
  browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] });

  // Generated token: WebCrypto bytes, copy, and the same token kept through a
  // delayed failed save, a retry with a Discord failure, and completion.
  {
    const { context, page, replies, setupCalls } = await openSetup({
      permissions: ['clipboard-read', 'clipboard-write'],
      init: () => {
        const real = crypto.getRandomValues.bind(crypto);
        window.randomCalls = [];
        crypto.getRandomValues = array => { const bytes = real(array); window.randomCalls.push(Array.from(bytes)); return bytes; };
      },
    });
    await page.getByRole('button', { name: 'Generate admin token' }).click();
    const field = page.getByLabel('Your new admin token', { exact: true });
    const token = await field.inputValue();
    assert.match(token, /^[A-Za-z0-9_-]{64}$/, 'a generated token is 64 unpadded base64url characters');
    const randomCalls = await page.evaluate(() => window.randomCalls);
    assert.equal(randomCalls.at(-1).length, 48, 'the token draws 48 bytes from WebCrypto');
    assert.deepEqual([...Buffer.from(token, 'base64url')], randomCalls.at(-1), 'the token encodes exactly those bytes');
    assert.equal(await field.getAttribute('readonly'), '', 'the displayed token is read-only');
    await page.getByRole('button', { name: 'Copy' }).click();
    await page.getByText('Copied.', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), token, 'Copy places the displayed token on the clipboard');

    let failSave;
    replies['/api/setup/complete'] = route => new Promise(resolve => {
      failSave = () => resolve(json(route, { error: 'setup publication failed' }, 500));
    });
    await page.getByRole('button', { name: 'Save setup' }).click();
    await until(() => failSave, 'the setup request did not reach the API');
    assert.equal(await page.evaluate(() => window.setupView.saving), true);
    assert.equal(await page.getByRole('button', { name: 'Use my own token instead' }).isDisabled(), true,
      'the token source cannot change while a save is in flight');
    assert.equal(await page.getByRole('button', { name: 'Generate admin token' }).count(), 0);
    assert.equal(await field.inputValue(), token, 'the submitted token is still the displayed token');
    failSave();
    await page.getByRole('alert').filter({ hasText: 'setup publication failed' }).waitFor();
    await page.getByText('Setup was not confirmed. Keep your admin token', { exact: false }).waitFor();
    assert.equal(await page.getByText('Initialization pending.', { exact: true }).count(), 0,
      'a failed save does not claim that nothing was saved');
    assert.equal(await field.inputValue(), token, 'a failed save keeps the token on screen');

    replies['/api/setup/complete'] = route => json(route, {
      status: 'ok', persisted: true,
      discord: { state: 'failed', error: 'Discord credential saved; gateway activation failed: LoginFailure' },
    });
    await page.getByLabel(/Discord token/).fill('discord-retry');
    await page.getByRole('button', { name: 'Save setup' }).click();
    await page.getByRole('button', { name: 'Continue to sign in' }).waitFor();
    assert.deepEqual(setupCalls().map(call => call.body), [
      { web_api_token: token },
      { web_api_token: token, discord_token: 'discord-retry' },
    ]);
    await page.getByRole('alert').filter({ hasText: 'gateway activation failed' }).waitFor();
    assert.equal(await page.getByLabel('Your admin token', { exact: true }).inputValue(), token,
      'the saved token stays visible after a Discord activation failure');
    await page.getByText('Saved. Paste it into the API Token field on the next screen', { exact: false }).waitFor();
    assert.equal(await page.getByRole('button', { name: /Generate|Use my own/ }).count(), 0,
      'a saved token cannot be regenerated or replaced here');
    await page.getByText('After you sign in to Odin, connect Codex in System → LLM Config.', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Start device sign-in' }).count(), 0,
      'anonymous device sign-in is not offered once a token protects the API');
    await page.getByRole('button', { name: 'Continue to sign in' }).click();
    assert.equal(await page.evaluate(() => window.completed), true);
    assert.equal(await page.evaluate(() => window.setupView.generatedToken), '', 'Continue clears the token');
    await context.close();
  }

  // A rejected or missing clipboard selects the token for a manual copy.
  for (const [name, init] of [
    ['rejected', () => { navigator.clipboard.writeText = () => Promise.reject(new Error('denied')); }],
    ['absent', () => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined }); }],
  ]) {
    const { context, page } = await openSetup({ init });
    await page.getByRole('button', { name: 'Generate admin token' }).click();
    const field = page.getByLabel('Your new admin token', { exact: true });
    const token = await field.inputValue();
    await page.getByRole('button', { name: 'Copy' }).click();
    await page.getByText('Copy is unavailable here. The token is selected', { exact: false }).waitFor();
    assert.deepEqual(
      await field.evaluate(element => [document.activeElement === element, element.selectionStart, element.selectionEnd]),
      [true, 0, token.length], `clipboard ${name}: the whole token is selected`);
    await context.close();
  }

  // Without WebCrypto there is no token and no weaker fallback.
  {
    const { context, page } = await openSetup({
      init: () => { Object.defineProperty(crypto, 'getRandomValues', { configurable: true, value: undefined }); },
    });
    await page.getByRole('button', { name: 'Generate admin token' }).click();
    await page.getByRole('alert').filter({ hasText: 'This browser cannot generate a secure token.' }).waitFor();
    assert.equal(await page.getByLabel('Your new admin token', { exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Use my own token instead' }).click();
    await page.getByLabel('Your own admin token', { exact: true }).waitFor();
    await context.close();
  }

  // One submission source: switching discards the other mode's value, and the
  // mode and generate buttons never submit the form, even from the keyboard.
  {
    const { context, page, replies, setupCalls } = await openSetup();
    replies['/api/setup/complete'] = route => json(route, { status: 'ok', persisted: true });
    await page.getByRole('button', { name: 'Generate admin token' }).click();
    const abandoned = await page.getByLabel('Your new admin token', { exact: true }).inputValue();
    await page.getByRole('button', { name: 'Use my own token instead' }).click();
    assert.equal(await page.evaluate(() => window.setupView.generatedToken), '', 'switching discards the generated token');
    await page.getByLabel('Your own admin token', { exact: true }).fill('typed-then-abandoned');
    await page.getByRole('button', { name: 'Generate one instead' }).click();
    assert.equal(await page.evaluate(() => window.setupView.webApiToken), '', 'switching back discards the typed token');
    await page.getByRole('button', { name: 'Generate admin token' }).focus();
    await page.keyboard.press('Enter');
    const token = await page.getByLabel('Your new admin token', { exact: true }).inputValue();
    assert.notEqual(token, abandoned, 'a new generation is a new token');
    assert.equal(setupCalls().length, 0, 'generate and mode buttons never submit setup');
    await page.getByRole('button', { name: 'Save setup' }).click();
    await page.getByRole('button', { name: 'Continue to sign in' }).waitFor();
    assert.deepEqual(setupCalls().map(call => call.body), [{ web_api_token: token }]);
    await context.close();
  }

  // A typed token keeps the clear-after-serialization rule.
  {
    const { context, page, replies, setupCalls } = await openSetup();
    let completeRequest;
    replies['/api/setup/complete'] = route => new Promise(resolve => {
      completeRequest = () => resolve(json(route, { status: 'ok', persisted: true }));
    });
    await page.getByRole('button', { name: 'Use my own token instead' }).click();
    await page.getByLabel('Your own admin token', { exact: true }).fill('not-retained');
    await page.getByLabel(/Discord token/).fill('also-not-retained');
    await page.getByRole('button', { name: 'Save setup' }).click();
    await until(() => completeRequest, 'the setup request did not reach the API');
    assert.deepEqual(await page.evaluate(() => ({ web: setupView.webApiToken, discord: setupView.discordToken })), { web: '', discord: '' },
      'credentials are cleared immediately after request serialization, not after the response');
    completeRequest();
    await page.getByRole('button', { name: 'Continue to sign in' }).waitFor();
    assert.deepEqual(setupCalls().map(call => call.body), [{ web_api_token: 'not-retained', discord_token: 'also-not-retained' }]);
    assert.equal(await page.getByRole('button', { name: 'Start device sign-in' }).count(), 0);
    await context.close();
  }

  // Intentional tokenless setup, then the device sign-in generation race.
  {
    const { context, page, replies, setupCalls } = await openSetup();
    let oldPoll;
    let pollCount = 0;
    replies['/api/setup/complete'] = route => json(route, { status: 'ok', persisted: true });
    replies['/api/codex/device-code'] = route => json(route, { device_auth_id: 'attempt', user_code: 'ABCD', verify_url: 'https://example.test/device', interval: 1 });
    replies['/api/codex/device-poll'] = route => {
      pollCount += 1;
      // Deliberately retain the old poll. A cancelled generation must not be
      // permitted to overwrite the next attempt when it later resolves.
      if (pollCount === 1) return new Promise(resolve => { oldPoll = () => resolve(json(route, { email: 'old@example.test' })); });
      return json(route, { email: 'new@example.test' });
    };
    await page.getByText('Without an admin token there is no sign-in', { exact: false }).waitFor();
    await page.getByRole('button', { name: 'Finish setup without a token' }).click();
    await page.getByRole('button', { name: 'Continue', exact: true }).waitFor();
    assert.deepEqual(setupCalls().map(call => call.body), [{}]);
    await page.getByRole('button', { name: 'Start device sign-in' }).click();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await page.getByRole('button', { name: 'Start device sign-in' }).click();
    await page.getByText('Device account ready: new@example.test.').waitFor();
    await until(() => oldPoll, 'the first device poll never reached the API');
    oldPoll();
    await page.waitForTimeout(50);
    assert.equal(await page.getByText('Device account ready: new@example.test.').count(), 1,
      'a cancelled old poll must not overwrite the newer attempt result');
    await context.close();
  }

  // Unmounting clears a token that was never saved.
  {
    const { context, page } = await openSetup();
    await page.getByRole('button', { name: 'Generate admin token' }).click();
    assert.equal((await page.evaluate(() => window.setupView.generatedToken)).length, 64);
    await page.evaluate(() => window.setupApp.unmount());
    assert.equal(await page.evaluate(() => window.setupView.generatedToken), '', 'unmount clears the generated token');
    await context.close();
  }
  console.log('setup UI browser checks passed');
} finally {
  await browser?.close();
  await server.close();
}
