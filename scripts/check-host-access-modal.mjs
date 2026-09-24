import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

// Native dialog, real component/styles, private loopback and mocked API only.
const server = await createServer({
  configFile: false, root: process.cwd(), appType: 'custom',
  resolve: { alias: { vue: 'vue/dist/vue.esm-bundler.js' } },
  define: { __VUE_OPTIONS_API__: 'true', __VUE_PROD_DEVTOOLS__: 'false', __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false' },
  server: { host: '127.0.0.1', port: 0, watch: null },
});
const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="app"></div><script type="module">
  import { createApp, h, ref, nextTick, KeepAlive } from 'vue';
  import HostAccess from '/ui/js/pages/host-access.js';
  import { ToastContainer } from '/ui/js/toast.js';
  import '/ui/css/style.css';
  const view = ref(null), active = ref(true);
  createApp({ render: () => h('div', [h(KeepAlive, null, { default: () => active.value ? h(HostAccess, { ref: view }) : null }), h(ToastContainer)]) }).mount('#app');
  await nextTick();
  window.hostView = view.value;
  window.setActive = value => active.value = value;
</script></body></html>`;
server.middlewares.use(async (req, res, next) => {
  if (req.url !== '/__host_modal__.html') return next();
  res.setHeader('Content-Type', 'text/html');
  res.end(await server.transformIndexHtml(req.url, html));
});
let browser;
try {
  await server.listen();
  const executablePath = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean).find(p => fs.existsSync(p));
  assert.ok(executablePath, 'Chrome/Chromium required');
  browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.coverage.startJSCoverage({ resetOnNavigation: false });
  const errors = [], writes = [], unexpected = [];
  page.on('pageerror', error => errors.push(error.message));
  const uid = '123456789012345', empty = '123456789012346', inherited = '123456789012347';
  const hosts = ['alpha', 'beta', 'gamma', ...Array.from({ length: 40 }, (_, i) => `host-${i}`)];
  const fixture = {
    available_hosts: hosts, host_descriptions: { beta: 'Backup machine' },
    default_policy: { allowed_hosts: null, default_host: 'alpha' },
    users: { [uid]: { allowed_hosts: ['alpha', 'beta', 'gamma'], default_host: 'alpha' }, [empty]: { allowed_hosts: [], default_host: '' } },
  };
  let failSave = false, holdSave = null;
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    let body = {}, status = 200;
    if (method === 'GET' && path === '/api/host-access') body = fixture;
    else if (method === 'GET' && path === '/api/permissions/tiers') body = { overrides: { [inherited]: 'guest' }, config_tiers: {}, invalid_overrides: {} };
    else if (method === 'GET' && path === '/api/discord/members') body = [{ id: uid, display_name: 'Fixture User' }];
    else if (method === 'GET' && [empty, inherited].some(id => path === `/api/discord/users/${id}`)) body = { id: path.split('/').pop() };
    else if (method === 'PUT' && (path === '/api/host-access/default-policy' || path.startsWith('/api/host-access/user/'))) {
      const value = route.request().postDataJSON();
      writes.push({ path, value });
      if (holdSave) await holdSave;
      if (failSave) { status = 500; body = { error: 'Fixture save failed' }; }
      else if (path.endsWith('/default-policy')) fixture.default_policy = value;
      else fixture.users[path.split('/').pop()] = value;
    } else { unexpected.push(`${method} ${path}`); status = 500; }
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__host_modal__.html`);
  await page.waitForFunction(() => window.hostView && !hostView.loading && hostView.members.length);
  const dialog = page.getByRole('dialog');
  const openDefault = () => page.getByRole('button', { name: 'Edit hosts for Default Policy', exact: true }).click();
  const openUser = () => page.getByRole('button', { name: 'Edit hosts for Fixture User', exact: true }).click();
  const checkbox = host => dialog.getByRole('checkbox', { name: host, exact: true });
  const allHosts = () => dialog.getByRole('switch');
  const picker = () => dialog.getByLabel('Default host', { exact: true });
  const save = () => dialog.getByRole('button', { name: 'Save', exact: true });
  const cancel = async () => {
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('dialog').open);
  };
  const inViewport = async () => {
    const rect = await dialog.boundingBox(), viewport = page.viewportSize();
    assert.ok(rect && rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= viewport.width + 1 && rect.y + rect.height <= viewport.height + 1, JSON.stringify(rect));
    return rect;
  };
  assert.equal(await page.getByRole('button', { name: /^Edit hosts for / }).count(), 4, 'button for default, populated, empty and tier-only rows');
  assert.equal(await page.locator('tbody tr').count(), 3);
  assert.match(await page.locator('tbody tr').first().innerText(), /\+1/);
  assert.equal(await page.locator('tbody tr').first().locator('select').count(), 1, 'only tier remains a row select');
  await openUser();
  await inViewport();
  assert.equal(await dialog.getByLabel('Search hosts').evaluate(el => el === document.activeElement), true);
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Shift+Tab');
  assert.equal(await save().evaluate(el => el === document.activeElement), true, 'native dialog traps backward focus');
  await page.keyboard.press('Tab');
  assert.equal(await allHosts().evaluate(el => el === document.activeElement), true, 'forward focus wraps inside modal');
  await dialog.getByLabel('Search hosts').fill('backup');
  assert.equal(await dialog.getByRole('checkbox').count(), 1, 'description search filters checklist');
  assert.equal(await dialog.getByRole('checkbox').inputValue(), 'beta');
  await dialog.getByLabel('Search hosts').fill('no-match');
  assert.match(await dialog.innerText(), /No matching hosts/);
  await dialog.getByLabel('Search hosts').fill('');
  await checkbox('alpha').uncheck();
  assert.equal(await save().isDisabled(), true, 'removing default requires explicit replacement');
  assert.match(await dialog.innerText(), /Choose a new default/);
  assert.deepEqual(await picker().locator('option:not([disabled])').evaluateAll(els => els.map(e => e.value)), ['beta', 'gamma']);
  await picker().selectOption('beta');
  assert.equal(await save().isEnabled(), true);
  assert.equal(writes.length, 0, 'draft edits never save');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('dialog').open);
  assert.equal(await page.getByRole('button', { name: 'Edit hosts for Fixture User', exact: true }).evaluate(el => el === document.activeElement), true, 'focus restored');
  await openUser();
  assert.equal(await checkbox('alpha').isChecked(), true, 'Escape discarded detached draft');
  await checkbox('gamma').uncheck();
  await cancel();
  assert.equal(writes.length, 0, 'Cancel does not save');
  await openUser();
  await allHosts().check();
  assert.equal(await checkbox('alpha').isDisabled(), true);
  assert.equal(await dialog.getByRole('checkbox', { checked: true }).count(), 3, 'All hosts does not expand selection');
  assert.equal(await picker().locator('option').count(), hosts.length + 1);
  await allHosts().uncheck();
  assert.equal(await checkbox('gamma').isChecked(), true, 'finite selection restored');
  await checkbox('alpha').uncheck();
  await picker().selectOption('beta');
  await save().click();
  await page.waitForFunction(() => !hostView.saving && !document.querySelector('dialog').open);
  assert.deepEqual(writes.at(-1), { path: `/api/host-access/user/${uid}`, value: { allowed_hosts: ['beta', 'gamma'], default_host: 'beta' } });
  assert.equal(await page.locator('tbody tr').first().locator('.host-default-summary').innerText(), 'beta');
  await openDefault();
  assert.equal(await allHosts().isChecked(), true);
  await picker().selectOption('gamma');
  await save().click();
  await page.waitForFunction(() => !hostView.saving && !document.querySelector('dialog').open);
  assert.deepEqual(writes.at(-1), { path: '/api/host-access/default-policy', value: { allowed_hosts: null, default_host: 'gamma' } }, 'null preserves future-host access');
  await page.getByRole('button', { name: `Edit hosts for ${empty}`, exact: true }).click();
  assert.equal(await dialog.getByRole('checkbox', { checked: true }).count(), 0);
  assert.equal(await picker().inputValue(), '');
  await checkbox('alpha').check();
  await picker().selectOption('alpha');
  await save().click();
  await page.waitForFunction(() => !hostView.saving && !document.querySelector('dialog').open);
  assert.deepEqual(writes.at(-1), { path: `/api/host-access/user/${empty}`, value: { allowed_hosts: ['alpha'], default_host: 'alpha' } });
  // Deny-all requires explicit clearing of the default, not silent reassignment.
  await page.getByRole('button', { name: `Edit hosts for ${empty}`, exact: true }).click();
  await checkbox('alpha').uncheck();
  assert.equal(await save().isDisabled(), true);
  await picker().selectOption('');
  assert.equal(await save().isEnabled(), true);
  await save().click();
  await page.waitForFunction(() => !hostView.saving && !document.querySelector('dialog').open);
  assert.deepEqual(writes.at(-1).value, { allowed_hosts: [], default_host: '' });
  await page.getByRole('button', { name: `Edit hosts for ${inherited}`, exact: true }).click();
  assert.equal(await allHosts().isChecked(), true, 'tier-only row starts from inherited policy');
  await picker().selectOption('beta');
  failSave = true;
  await save().click();
  await dialog.getByRole('alert').waitFor();
  assert.equal(await picker().inputValue(), 'beta', 'failed Save retains draft');
  assert.equal(await page.evaluate(id => hostView.users[id], inherited), undefined, 'failed create rolls back row');
  failSave = false;
  let release;
  holdSave = new Promise(resolve => { release = resolve; });
  await save().click();
  await page.waitForFunction(() => hostView.saving);
  assert.equal(await dialog.getByRole('button', { name: 'Saving…' }).isDisabled(), true);
  await page.keyboard.press('Tab');
  assert.equal(await dialog.evaluate(el => el === document.activeElement), true, 'focus stays in modal while controls are disabled');
  await page.keyboard.press('Escape');
  assert.equal(await dialog.isVisible(), true, 'submitted Save cannot be misleadingly cancelled');
  release(); holdSave = null;
  await page.waitForFunction(() => !hostView.saving && !document.querySelector('dialog').open);
  assert.deepEqual(writes.at(-1), { path: `/api/host-access/user/${inherited}`, value: { allowed_hosts: null, default_host: 'beta' } });
  assert.equal(writes.length, 6, 'exactly one PUT per explicit Save, including failed attempt');
  await openDefault();
  await picker().selectOption('beta');
  failSave = true;
  await save().click();
  await dialog.getByRole('alert').waitFor();
  assert.equal(await page.evaluate(() => hostView.defaultPolicy.default_host), 'gamma', 'default policy rolls back');
  await cancel();
  failSave = false;
  await page.setViewportSize({ width: 390, height: 680 });
  await openDefault();
  assert.deepEqual(await inViewport(), { x: 0, y: 0, width: 390, height: 680 }, 'phone modal fills viewport');
  assert.ok(await save().isVisible());
  await page.setViewportSize({ width: 680, height: 390 });
  await inViewport();
  await cancel();
  const count = writes.length;
  await openDefault();
  await picker().selectOption('beta');
  await page.evaluate(() => setActive(false));
  await page.waitForFunction(() => !document.querySelector('dialog')?.open);
  await page.evaluate(() => setActive(true));
  await openDefault();
  assert.equal(await picker().inputValue(), 'gamma', 'tab switch discards draft');
  await cancel();
  assert.equal(writes.length, count);
  assert.deepEqual(errors, []);
  assert.deepEqual(unexpected, []);
  const coverage = (await page.coverage.stopJSCoverage()).filter(entry => entry.url.includes('/ui/js/pages/host-access.js'));
  assert.equal(coverage.length, 1);
  const { source, functions } = coverage[0];
  const ranges = functions.flatMap(fn => fn.ranges).sort((a, b) => (b.endOffset - b.startOffset) - (a.endOffset - a.startOffset));
  const sourceLength = source.indexOf('//# sourceMappingURL=') >= 0 ? source.indexOf('//# sourceMappingURL=') : source.length;
  const bytes = new Uint8Array(sourceLength);
  for (const range of ranges) bytes.fill(range.count > 0 ? 1 : 0, Math.min(range.startOffset, sourceLength), Math.min(range.endOffset, sourceLength));
  const covered = bytes.reduce((sum, value) => sum + value, 0);
  console.log(`host-access modal browser coverage (excluding source map): ${covered}/${sourceLength} source characters (${(covered / sourceLength * 100).toFixed(1)}%)`);
  console.log('host-access-modal: desktop/phone, focus, search, validation, Cancel/Escape, Save/retry/rollback and tab cleanup passed');
} finally {
  await browser?.close();
  await server.close();
}
