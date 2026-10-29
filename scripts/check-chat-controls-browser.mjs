// Chat controls for a running turn (#744): Stop, corrections and the turn's
// tool status. Runs the production Chat page in headless Chrome against stubbed
// API and WebSocket bindings: no network beyond the loopback fixture server.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const server = await createServer({
  configFile: false, root: process.cwd(), appType: 'custom',
  resolve: { alias: { vue: 'vue/dist/vue.esm-bundler.js' } },
  define: { __VUE_OPTIONS_API__: 'true', __VUE_PROD_DEVTOOLS__: 'false', __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false' },
  server: { host: '127.0.0.1', port: 0, watch: null },
});
const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">
  <style>body { margin: 0; } :root { --hm-topbar-h: 0px; } *, *::before, *::after { box-sizing: border-box; }</style>
  </head><body><div id="app"></div><script type="module">
  import '/ui/css/fonts.css';
  import '/ui/css/tailwind.css';
  import '/ui/css/style.css';
  import '/ui/css/foundation.css';
  import { createApp, h, nextTick } from 'vue';
  import Chat from '/ui/js/pages/chat.js';
  import { api, ws, ApiError } from '/ui/js/api.js';
  const subscriptions = new Map();
  api.get = async (url) => {
    if (url === '/api/auth/session') return { channel_id: 'controls-test', user_id: 'tester' };
    if (url.startsWith('/api/sessions/')) return { messages: [] };
    return {};
  };
  // Each POST is recorded; a test sets how the next one to a path answers.
  window.posts = [];
  window.answers = {};
  api.post = async (path, body) => {
    window.posts.push({ path, body });
    const answer = window.answers[path];
    if (answer && answer.wait) await answer.wait;
    if (answer && answer.error) throw new ApiError(answer.error, answer.status, null);
    return answer ? answer.body : {};
  };
  ws.subscribe = (channel, handler) => subscriptions.set(channel, handler);
  ws.unsubscribe = (channel) => subscriptions.delete(channel);
  ws.onState = () => () => {};
  Object.defineProperty(ws, 'connected', { get: () => true, configurable: true });
  Object.defineProperty(ws, 'state', { get: () => 'connected', configurable: true });
  window.sent = [];
  ws.sendChat = (content, options) => { window.sent.push({ content, ...options }); return true; };
  window.question = () => window.sent[window.sent.length - 1].messageId;
  window.push = (type, data) => subscriptions.get(type)({ type, channel_id: 'controls-test', ...data });
  window.reply = (data) => subscriptions.get('chat')({ type: 'chat_response', content: '', tools_used: [], ...data });
  window.release = {};
  window.hold = (path) => { window.answers[path] = { ...window.answers[path], wait: new Promise((resolve) => { window.release[path] = resolve; }) }; };
  createApp({ render: () => h(Chat) })
    .component('odin-icon', { template: '<span aria-hidden="true"></span>' }).mount('#app');
  await nextTick();
  window.ready = true;
  </script></body></html>`;
server.middlewares.use(async (request, response, next) => {
  if (request.url.startsWith('/__chat_controls_test__.html')) {
    response.setHeader('Content-Type', 'text/html');
    response.end(await server.transformIndexHtml(request.url, html));
    return;
  }
  next();
});

let browser;
const errors = [];

async function openChat(origin) {
  const page = await browser.newPage({ viewport: { width: 1000, height: 760 } });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.goto(`${origin}/__chat_controls_test__.html`);
  await page.waitForFunction(() => window.ready);
  const input = page.locator('#chat-message-input');
  const type = async (text) => { await input.fill(text); await input.press('Enter'); };
  const status = () => page.locator('.chat-typing-text').textContent();
  const labels = () => page.locator('.chat-correction-label').allTextContents();
  const tick = () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0))));
  return { page, input, type, status, labels, tick };
}

try {
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  const executablePath = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
    .filter(Boolean).find((p) => fs.existsSync(p));
  assert.ok(executablePath, 'chat controls browser regression requires Chrome/Chromium');
  browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] });

  // 1. A running turn: the box stays usable, Stop shows, the status is the turn's own.
  {
    const { page, input, type, status, labels, tick } = await openChat(origin);
    assert.equal(await page.locator('.chat-stop-btn').count(), 0, 'no Stop before a turn runs');
    await type('check the backups');
    const question = await page.evaluate(() => window.question());
    assert.ok(await input.isEnabled(), 'the message box stays usable during a turn');
    assert.equal(await input.getAttribute('placeholder'), 'Correct the running turn...');
    assert.match(await page.locator('.chat-input-hint').textContent(), /Enter sends a correction/);
    assert.ok(await page.locator('.chat-stop-btn').isEnabled(), 'Stop is offered while the turn runs');

    await page.evaluate((q) => window.push('chat_status', { question_id: q, call_id: 'c1', tool: 'run_command', phase: 'start' }), question);
    await tick();
    assert.match(await status(), /^Running run_command · \d+s$/);
    await page.evaluate((q) => window.push('chat_status', { question_id: q, call_id: 'c2', tool: 'read_file', phase: 'start' }), question);
    await tick();
    assert.match(await status(), /^Running read_file \(\+1 more\) · \d+s$/);
    await page.evaluate((q) => window.push('chat_status', { question_id: q, call_id: 'c2', tool: 'read_file', phase: 'end' }), question);
    await tick();
    assert.match(await status(), /^Running run_command · \d+s$/, 'an ending call leaves the other running');
    await page.evaluate(() => window.push('chat_status', { question_id: 'an-older-question', call_id: 'c9', tool: 'apply_patch', phase: 'start' }));
    await page.evaluate((q) => window.push('chat_status', { question_id: q, call_id: 'c3', tool: 'web_search', phase: 'start', channel_id: 'another-chat' }), question);
    await tick();
    assert.match(await status(), /^Running run_command/, 'another question\'s or chat\'s status is ignored');
    await page.evaluate((q) => window.push('chat_status', { question_id: q, call_id: 'c1', tool: 'run_command', phase: 'end' }), question);
    await tick();
    assert.match(await status(), /^Thinking · \d+s$/);

    // 2. A correction: its own bubble and receipt; a push may beat the response.
    await page.evaluate(() => { window.answers['/api/chat/steer'] = { body: { status: 'queued', sequence: 1 } }; });
    await type('only the nightly ones');
    await tick();
    const steer = await page.evaluate(() => window.posts.find((p) => p.path === '/api/chat/steer'));
    assert.deepEqual(steer.body, { content: 'only the nightly ones', message_id: question, wait_seconds: 0 });
    assert.deepEqual(await labels(), ['Correction · waiting for the next step']);
    assert.equal(await page.evaluate(() => window.sent.length), 1, 'a correction is never a new question');
    await page.evaluate((q) => window.push('chat_control', { kind: 'steer', question_id: q, sequence: 1, status: 'consumed' }), question);
    await tick();
    assert.deepEqual(await labels(), ['Correction · used']);

    await page.evaluate(() => { window.answers['/api/chat/steer'] = { body: { status: 'queued', sequence: 2 } }; window.hold('/api/chat/steer'); });
    await type('and the weekly one');
    await page.evaluate((q) => window.push('chat_control', { kind: 'steer', question_id: q, sequence: 2, status: 'consumed' }), question);
    await page.evaluate(() => window.release['/api/chat/steer']());
    await tick();
    assert.deepEqual(await labels(), ['Correction · used', 'Correction · used'], 'an early receipt is never overwritten by queued');

    await page.evaluate(() => { window.answers['/api/chat/steer'] = { error: 'This turn\'s steering limit has been reached; message was not queued.', status: 409 }; });
    await type('one more');
    await tick();
    assert.match((await labels())[2], /^Correction · not sent: This turn's steering limit/);

    // 3. Stop: requested, then settled; one request.
    await page.evaluate(() => { window.answers['/api/chat/stop'] = { body: { status: 'stop_requested' } }; });
    await page.locator('.chat-stop-btn').click();
    await tick();
    const stops = await page.evaluate(() => window.posts.filter((p) => p.path === '/api/chat/stop'));
    assert.deepEqual(stops.map((p) => p.body), [{ message_id: question, wait_seconds: 0 }]);
    assert.ok(await page.locator('.chat-stop-btn').isDisabled(), 'one Stop per turn');
    assert.match(await status(), /^Stopping after the current step/);
    await page.evaluate((q) => window.push('chat_control', { kind: 'stop', question_id: q, status: 'stopped' }), question);
    await tick();
    assert.ok(await page.locator('.chat-stop-btn').isDisabled());

    // 4. The answer ends the turn; an unanswered correction is unconfirmed until a late receipt.
    await page.evaluate(() => { window.answers['/api/chat/steer'] = { body: { status: 'queued', sequence: 3 } }; });
    await type('last thing');
    await tick();
    await page.evaluate(() => window.reply({ content: 'Task stopped by user.', reply_id: 'r-1' }));
    await tick();
    assert.equal(await page.locator('.chat-stop-btn').count(), 0, 'Stop goes with the turn');
    assert.equal(await input.getAttribute('placeholder'), 'Message Odin...');
    assert.equal((await labels())[3], 'Correction · sent, with no receipt yet');
    await page.evaluate((q) => window.push('chat_control', { kind: 'steer', question_id: q, sequence: 3, status: 'not_consumed' }), question);
    await tick();
    assert.equal((await labels())[3], 'Correction · not used: the turn ended first');

    // 5. The next question starts clean; the old question's status is not its own.
    await type('now the logs');
    const next = await page.evaluate(() => window.question());
    assert.notEqual(next, question);
    await page.evaluate((q) => window.push('chat_status', { question_id: q, call_id: 'c7', tool: 'run_command', phase: 'start' }), question);
    await page.evaluate((q) => window.push('chat_control', { kind: 'stop', question_id: q, status: 'finished' }), question);
    await tick();
    assert.ok(!(await status()).startsWith('Running'), 'the old question\'s status is ignored');
    assert.ok(await page.locator('.chat-stop-btn').isEnabled(), 'the old question\'s stop receipt is ignored');
    await page.close();
  }

  // 6. A Stop the server refuses (the turn is still starting) can be tried again.
  {
    const { page, type, tick } = await openChat(origin);
    await type('a long task');
    await page.evaluate(() => { window.answers['/api/chat/stop'] = { error: 'That turn is still starting; try again in a moment.', status: 409 }; });
    await page.locator('.chat-stop-btn').click();
    await tick();
    assert.ok(await page.locator('.chat-stop-btn').isEnabled(), 'a refused Stop can be sent again');
    await page.close();
  }

  assert.deepEqual(errors, []);
  console.log('chat-controls-browser: during a turn the box sends corrections (never a new question), each with its own receipt, early or late; Stop is sent once and settles; the status line shows only this turn\'s own running tools; the next question starts clean');
} finally {
  if (browser) await browser.close();
  await server.close();
}
