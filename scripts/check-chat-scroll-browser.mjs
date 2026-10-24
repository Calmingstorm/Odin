// Chat follows its newest content while the reader is at the bottom (#738).
// Runs the production Chat page in headless Chrome against stubbed API and
// WebSocket bindings: no network beyond the loopback fixture server.
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
  import { api, ws } from '/ui/js/api.js';
  const subscriptions = new Map();
  const history = [];
  for (let i = 0; i < 24; i++) {
    history.push({ role: i % 2 ? 'assistant' : 'user', message_id: 'stored-' + i, timestamp: 1700000000 + i,
      content: 'Stored message ' + i + '\\n\\n' + 'A line of earlier conversation. '.repeat(6) });
  }
  api.get = async (url) => {
    if (url === '/api/auth/session') return { channel_id: 'chat-scroll-test', user_id: 'tester' };
    if (url.startsWith('/api/sessions/')) return { messages: history };
    return {};
  };
  api.post = async () => ({});
  ws.subscribe = (channel, handler) => subscriptions.set(channel, handler);
  ws.unsubscribe = (channel) => subscriptions.delete(channel);
  ws.onState = () => () => {};
  Object.defineProperty(ws, 'connected', { get: () => true, configurable: true });
  Object.defineProperty(ws, 'state', { get: () => 'connected', configurable: true });
  window.sent = [];
  ws.sendChat = (content, options) => { window.sent.push({ content, ...options }); return true; };
  // A turn's reply (it answers the newest sent question) and a later post.
  window.reply = (data) => subscriptions.get('chat')({ type: 'chat_response', content: '', tools_used: [], ...data });
  window.post = (content) => subscriptions.get('chat_post')({ channel_id: 'chat-scroll-test', content, timestamp: Date.now() / 1000 });
  window.photo = (width, height) => {
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d');
    context.fillStyle = '#4a6'; context.fillRect(0, 0, width, height);
    return canvas.toDataURL('image/png').split(',')[1];
  };
  window.list = () => document.querySelector('.chat-messages');
  // The newest message grows in one frame, and again before the scroll
  // event of the jump that followed the first growth is delivered.
  window.growTwice = () => new Promise((resolve) => {
    const pad = document.createElement('div');
    [...window.list().querySelectorAll('.chat-message')].pop().appendChild(pad);
    requestAnimationFrame(() => {
      pad.style.height = '300px';
      setTimeout(() => { pad.style.height = '600px'; resolve(); }, 0);
    });
  });
  createApp({ render: () => h(Chat) })
    .component('odin-icon', { template: '<span aria-hidden="true"></span>' }).mount('#app');
  await nextTick();
  window.ready = true;
  </script></body></html>`;
// An inline image URL whose bytes arrive late, like a slow remote image.
const pixel = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
server.middlewares.use(async (request, response, next) => {
  if (request.url === '/__chat_scroll_test__.html') {
    response.setHeader('Content-Type', 'text/html');
    response.end(await server.transformIndexHtml(request.url, html));
    return;
  }
  if (request.url.startsWith('/__slow_image__')) {
    await new Promise((resolve) => setTimeout(resolve, 400));
    response.setHeader('Content-Type', 'image/svg+xml');
    response.end('<svg xmlns="http://www.w3.org/2000/svg" width="700" height="500"><rect width="700" height="500" fill="#468"/></svg>');
    return;
  }
  if (request.url === '/__pixel__.png') {
    response.setHeader('Content-Type', 'image/png');
    response.end(pixel);
    return;
  }
  next();
});

let browser;
try {
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  const executablePath = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
    .filter(Boolean).find((p) => fs.existsSync(p));
  assert.ok(executablePath, 'chat scroll browser regression requires Chrome/Chromium');
  browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1000, height: 760 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.goto(`${origin}/__chat_scroll_test__.html`);
  await page.waitForFunction(() => window.ready && document.querySelectorAll('.chat-message').length >= 24);

  // Wait until the list's size and position stop changing for a few frames.
  const settle = () => page.evaluate(() => new Promise((resolve) => {
    let last = '', still = 0;
    const tick = () => {
      const el = window.list();
      const now = `${el.scrollTop}/${el.scrollHeight}/${el.clientHeight}`;
      still = now === last ? still + 1 : 0;
      last = now;
      if (still >= 5) resolve(); else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }));
  const fromBottom = () => page.evaluate(() => {
    const el = window.list();
    return el.scrollHeight - el.scrollTop - el.clientHeight;
  });
  const top = () => page.evaluate(() => window.list().scrollTop);
  const imagesLoaded = () => page.waitForFunction(
    () => [...window.list().querySelectorAll('img')].every((img) => img.complete && img.naturalHeight > 0));
  const send = async (text) => {
    await page.locator('#chat-message-input').fill(text);
    await page.locator('#chat-message-input').press('Enter');
  };
  const wheel = async (deltaY) => {
    const box = await page.locator('.chat-messages').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, deltaY);
    await settle();
  };

  await settle();
  assert.ok(await fromBottom() < 2, 'the stored history opens at its newest message');

  // 1. A reply's posted photo loads after the reply is shown (Aaron's report).
  await send('take a photo and post it here');
  await page.evaluate(() => window.reply({
    content: 'Posted the photo.',
    reply_id: 'reply-photo',
    files: [{ filename: 'retained-1a9f575f-1.png', content_type: 'image/png', data: window.photo(900, 700), size: 1 }],
  }));
  await imagesLoaded();
  await settle();
  const photoHeight = await page.evaluate(() => window.list().querySelector('.chat-files img').getBoundingClientRect().height);
  assert.ok(photoHeight > 300, `the posted photo is laid out at its size (${photoHeight}px)`);
  assert.ok(await fromBottom() < 2, `a reply whose photo loads late stays at the bottom (${await fromBottom()}px above it)`);

  // 2. An inline image URL whose bytes arrive 400 ms later, two in one reply.
  await send('show me the slow images');
  await page.evaluate((base) => window.reply({
    content: `First ${base}/__slow_image__/one.png and second ${base}/__slow_image__/two.png`,
    reply_id: 'reply-slow',
  }), origin);
  await imagesLoaded();
  await settle();
  assert.ok(await fromBottom() < 2, `late inline images keep the newest message in view (${await fromBottom()}px above it)`);

  // 3. A reader who scrolled up to read is not pulled down by new messages.
  await wheel(-900);
  const reading = await top();
  assert.ok(await fromBottom() > 200, 'the reader scrolled up into the history');
  await page.evaluate(() => window.post('A loop posted this while you were reading.'));
  await settle();
  assert.ok(Math.abs(await top() - reading) <= 1, `a new post leaves a reader where they are (${reading} -> ${await top()})`);
  await page.evaluate(() => window.post(`A later post with a picture ${location.origin}/__pixel__.png`));
  await settle();
  assert.ok(Math.abs(await top() - reading) <= 1, 'a second post leaves the reader where they are too');

  // 4. Back at the bottom, new messages are followed again.
  await wheel(100000);
  assert.ok(await fromBottom() < 2, 'the reader scrolled back to the bottom');
  await page.evaluate(() => window.post('A post after the reader came back.'));
  await settle();
  assert.ok(await fromBottom() < 2, 'new messages are followed again at the bottom');

  // 5. Sending from anywhere goes to the newest message.
  await wheel(-900);
  assert.ok(await fromBottom() > 200, 'the reader scrolled up again');
  await send('a question asked while scrolled up');
  await settle();
  assert.ok(await fromBottom() < 2, 'sending a message goes to the bottom');
  await page.evaluate(() => window.reply({ content: 'An answer.', reply_id: 'reply-answer' }));
  await settle();
  assert.ok(await fromBottom() < 2, 'the answer to it is followed');

  // 6. The list shrinks (a phone keyboard opening) and grows back.
  await page.setViewportSize({ width: 1000, height: 460 });
  await settle();
  assert.ok(await fromBottom() < 2, 'a shorter list keeps its newest message in view');
  await page.setViewportSize({ width: 1000, height: 760 });
  await settle();
  assert.ok(await fromBottom() < 2, 'a taller list stays at the bottom');

  // 7. Growth that lands between a jump and the jump's own scroll event is
  // not mistaken for the reader scrolling away.
  await page.evaluate(() => window.growTwice());
  await settle();
  assert.ok(await fromBottom() < 2, `growth in consecutive frames stays at the bottom (${await fromBottom()}px above it)`);
  await page.evaluate(() => window.post('A post after the growth.'));
  await settle();
  assert.ok(await fromBottom() < 2, 'and the next message is still followed');

  assert.deepEqual(sentContents(await page.evaluate(() => window.sent)),
    ['take a photo and post it here', 'show me the slow images', 'a question asked while scrolled up']);
  assert.deepEqual(errors, []);
  console.log('chat-scroll-browser: history opens at the bottom; a late-loading posted photo and late inline images stay in view; a reader scrolled up is not pulled down by posts; back at the bottom, new messages are followed; sending goes to the bottom; resizing keeps the bottom in view');
} finally {
  if (browser) await browser.close();
  await server.close();
}

function sentContents(sent) {
  return sent.map((entry) => entry.content);
}
