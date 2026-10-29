// Chat attachments (#747): attach by picker, paste or drop; each file uploads
// at once; Send waits for them and carries their ids. Runs the production Chat
// page in headless Chrome against stubbed API and WebSocket bindings.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

// The server's image policy (its CSP img-src, from src/health/server.py),
// enforced on the test page so a thumbnail it would block shows up here.
const IMG_SRC = fs.readFileSync('src/health/server.py', 'utf8').match(/"(img-src [^"]*)"/)?.[1];
assert.ok(IMG_SRC, 'the server CSP declares an img-src directive');
// A real 1x1 PNG, so a thumbnail that loads has a width.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

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
    if (url === '/api/auth/session') return { channel_id: 'attach-test', user_id: 'tester' };
    if (url.startsWith('/api/sessions/')) return { messages: [] };
    return {};
  };
  window.posts = [];
  api.post = async (path, body) => { window.posts.push({ path, body }); return { response: 'ok', tools_used: [] }; };
  // Each upload waits until the test settles it: window.finish(name) or window.fail(name, error).
  window.uploads = [];
  api.upload = (path, file, { signal } = {}) => new Promise((resolve, reject) => {
    const entry = { path, name: file.name, size: file.size, signal, resolve, reject };
    window.uploads.push(entry);
    if (signal) signal.addEventListener('abort', () => {
      entry.aborted = true;
      reject(new DOMException('aborted', 'AbortError'));
    });
  });
  window.finish = (name) => {
    const entry = window.uploads.find((u) => u.name === name && !u.settled);
    entry.settled = true;
    entry.resolve({ upload_id: 'id-' + name.replace(/[^a-z0-9]/gi, ''), name, size: entry.size, content_type: 'text/plain' });
  };
  window.fail = (name, message) => {
    const entry = window.uploads.find((u) => u.name === name && !u.settled);
    entry.settled = true;
    entry.reject(new ApiError(message, 507, null));
  };
  ws.subscribe = (channel, handler) => subscriptions.set(channel, handler);
  ws.unsubscribe = (channel) => subscriptions.delete(channel);
  ws.onState = () => () => {};
  window.online = true;
  Object.defineProperty(ws, 'connected', { get: () => window.online, configurable: true });
  Object.defineProperty(ws, 'state', { get: () => 'connected', configurable: true });
  window.sent = [];
  ws.sendChat = (content, options) => { window.sent.push({ content, ...options }); return true; };
  window.reply = (data) => subscriptions.get('chat')({ type: 'chat_response', content: '', tools_used: [], ...data });
  // A clipboard or drag of files (and maybe text), as the browser hands it over.
  window.transfer = (names, text) => {
    const data = new DataTransfer();
    for (const name of names) data.items.add(new File(['contents of ' + name], name, { type: name.endsWith('.png') ? 'image/png' : 'text/plain' }));
    if (text) data.setData('text/plain', text);
    return data;
  };
  window.paste = (names, text) => {
    const event = new ClipboardEvent('paste', { clipboardData: window.transfer(names, text), bubbles: true, cancelable: true });
    document.querySelector('#chat-message-input').dispatchEvent(event);
    return event.defaultPrevented;
  };
  window.drop = (names) => {
    const event = new DragEvent('drop', { dataTransfer: window.transfer(names), bubbles: true, cancelable: true });
    document.querySelector('.chat-input-area').dispatchEvent(event);
  };
  createApp({ render: () => h(Chat) })
    .component('odin-icon', { template: '<span aria-hidden="true"></span>' }).mount('#app');
  await nextTick();
  window.ready = true;
  </script></body></html>`;
server.middlewares.use(async (request, response, next) => {
  if (request.url.startsWith('/__chat_attachments_test__.html')) {
    response.setHeader('Content-Type', 'text/html');
    // Only the image directive: the harness itself runs an inline module script.
    response.setHeader('Content-Security-Policy', IMG_SRC);
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
  await page.goto(`${origin}/__chat_attachments_test__.html`);
  await page.waitForFunction(() => window.ready);
  const tick = () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0))));
  const chips = () => page.locator('.chat-attach-list .chat-attach-chip').allTextContents();
  const pick = (files) => page.setInputFiles('input[type=file]', files.map(([name, body]) => ({
    name, mimeType: name.endsWith('.png') ? 'image/png' : 'text/plain', buffer: Buffer.isBuffer(body) ? body : Buffer.from(body) })));
  const sendButton = page.locator('.chat-send-btn');
  return { page, tick, chips, pick, sendButton };
}

try {
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  const executablePath = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
    .filter(Boolean).find((p) => fs.existsSync(p));
  assert.ok(executablePath, 'chat attachments browser regression requires Chrome/Chromium');
  browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] });

  // 1. Picked files upload at once; Send waits for them, then carries their ids.
  {
    const { page, tick, chips, pick, sendButton } = await openChat(origin);
    await pick([['notes.txt', 'disk is 85% full'], ['screen.png', PNG]]);
    await tick();
    assert.equal(await page.evaluate(() => window.uploads.length), 2, 'each file uploads when attached');
    assert.equal((await chips()).filter((c) => c.includes('uploading...')).length, 2);
    assert.equal(await page.locator('.chat-attach-thumb').count(), 1, 'an image shows a thumbnail');
    await page.waitForFunction(() => document.querySelector('.chat-attach-thumb')?.complete);
    assert.ok(await page.evaluate(() => document.querySelector('.chat-attach-thumb').naturalWidth) > 0,
      `the thumbnail loads under the server's image policy (${IMG_SRC})`);
    assert.ok(await sendButton.isDisabled(), 'Send waits for the uploads');
    await page.evaluate(() => { window.finish('notes.txt'); window.finish('screen.png'); });
    await tick();
    assert.ok(!(await chips()).some((c) => c.includes('uploading')));
    assert.ok(await sendButton.isEnabled(), 'files alone are a question');
    await sendButton.click();
    await tick();
    const sent = await page.evaluate(() => window.sent[0]);
    assert.deepEqual(sent.attachments, ['id-notestxt', 'id-screenpng']);
    assert.equal(sent.content, '');
    assert.deepEqual(await chips(), [], 'sent files leave the staging list');
    const labels = await page.locator('.chat-bubble-files .chat-attach-name').allTextContents();
    assert.deepEqual(labels, ['notes.txt', 'screen.png'], 'the question shows its files');

    // 2. During the turn a correction is text only: no attaching.
    assert.ok(await page.locator('.chat-attach-btn').isDisabled());
    await page.evaluate(() => window.paste(['late.txt']));
    await tick();
    assert.deepEqual(await chips(), [], 'a file pasted during a turn is not attached');
    await page.evaluate(() => window.reply({ content: 'Read both.', reply_id: 'r1' }));
    await tick();
    assert.ok(await page.locator('.chat-attach-btn').isEnabled());
    await page.close();
  }

  // 3. Removing a file stops its upload; a failed upload blocks Send until removed.
  {
    const { page, tick, chips, pick, sendButton } = await openChat(origin);
    await pick([['big.txt', 'x'], ['other.txt', 'y']]);
    await tick();
    await page.locator('.chat-attach-remove').first().click();
    await tick();
    assert.equal(await page.evaluate(() => window.uploads.find((u) => u.name === 'big.txt').aborted), true);
    assert.equal((await chips()).length, 1);
    await page.evaluate(() => window.fail('other.txt', 'Upload storage is full for your unsent files'));
    await tick();
    assert.match((await chips())[0], /Upload storage is full/);
    await page.locator('#chat-message-input').fill('with the file');
    await tick();
    assert.ok(await sendButton.isDisabled(), 'a failed file blocks Send');
    await page.locator('.chat-attach-remove').first().click();
    await tick();
    assert.ok(await sendButton.isEnabled());
    await page.close();
  }

  // 4. A message carries at most ten files.
  {
    const { page, tick, chips, pick } = await openChat(origin);
    await pick(Array.from({ length: 11 }, (_, i) => [`f${i}.txt`, 'x']));
    await tick();
    assert.equal((await chips()).length, 10);
    await page.close();
  }

  // 5. Paste attaches files alone (a screenshot); a paste with text pastes text. Drop attaches.
  {
    const { page, tick, chips } = await openChat(origin);
    assert.equal(await page.evaluate(() => window.paste(['shot.png'])), true);
    await tick();
    assert.equal((await chips()).length, 1);
    assert.equal(await page.evaluate(() => window.paste(['doc.txt'], 'some copied text')), false,
      'a paste with text is left to the text box');
    await tick();
    assert.equal((await chips()).length, 1);
    await page.evaluate(() => window.drop(['dropped.txt']));
    await tick();
    assert.equal((await chips()).length, 2);
    await page.close();
  }

  // 6. Without the socket, the REST question carries the ids.
  {
    const { page, tick, pick, sendButton } = await openChat(origin);
    await page.evaluate(() => { window.online = false; });
    await pick([['rest.txt', 'z']]);
    await tick();
    await page.evaluate(() => window.finish('rest.txt'));
    await tick();
    await page.locator('#chat-message-input').fill('over REST');
    await sendButton.click();
    await tick();
    const post = await page.evaluate(() => window.posts.find((p) => p.path === '/api/chat'));
    assert.deepEqual(post.body.attachments, ['id-resttxt']);
    assert.equal(post.body.content, 'over REST');
    await page.close();
  }

  assert.deepEqual(errors, []);
  console.log('chat-attachments-browser: picked, pasted and dropped files upload at once, an image with a thumbnail that loads under the server image policy; Send waits for them and carries their ids, files alone included, over the socket or REST; removing a file stops its upload; a failed upload blocks Send until removed; ten files at most; a paste with text stays text; no attaching to a correction');
} finally {
  if (browser) await browser.close();
  await server.close();
}
