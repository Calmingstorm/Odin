// Mount the actual Skills page with inert API fixtures, not the built/live UI.
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
const html = `<!doctype html><html><body><div id="app"></div><script type="module">
import { createApp, h, ref, nextTick } from 'vue';
import Skills from '/ui/js/pages/skills.js';
import { api } from '/ui/js/api.js';
import { ToastContainer } from '/ui/js/toast.js';
import { ModalFocusDirective } from '/ui/js/focus-trap.js';
api.setToken('fixture-only');
const view = ref(null);
window.app = createApp({render: () => h('div', [h(Skills, {ref: view}), h(ToastContainer)])});
app.component('odin-icon', {template: '<span></span>'});
app.directive('modal-focus', ModalFocusDirective);
app.mount('#app');
await nextTick(); window.view = view.value; window.ready = true;
</script></body></html>`;
server.middlewares.use(async (req, res, next) => {
  if (req.url !== '/__skills_fixture__.html') return next();
  res.setHeader('Content-Type', 'text/html');
  res.end(await server.transformIndexHtml(req.url, html));
});

const diagnostic = 'SyntaxError: <img src=x onerror="window.injected=true"> & details';
const moduleCode = 'SKILL_DEFINITION = {}\nasync def execute(inp, context):\n    return "ok"';
const fixtures = [
  { name: 'active', status: 'loaded', description: 'active fixture', code: moduleCode, loaded_at: '2026-01-01', execution_count: 1 },
  { name: 'disabled', status: 'disabled', description: 'disabled fixture', code: moduleCode, loaded_at: '2026-01-01' },
  { name: 'broken', status: 'error', description: diagnostic, code: null, loaded_at: '', diagnostics: [{level: 'error', message: diagnostic}] },
  { name: 'failed_with_code', status: 'error', description: 'Other error', code: moduleCode, diagnostics: [{level: 'error', message: 'Other error'}] },
];
let browser;
try {
  await server.listen();
  const executablePath = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean).find(fs.existsSync);
  assert.ok(executablePath, 'Chromium required');
  browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.coverage.startJSCoverage({ resetOnNavigation: false });
  const errors = [], calls = [], heldReads = [], heldWrites = [];
  let skills = structuredClone(fixtures), holdRead = false, holdWrite = false, denyWrite = false;
  const respond = (route, body, status = 200) => route.fulfill({status, contentType: 'application/json', body: JSON.stringify(body)});
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/api/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname, method = request.method();
    calls.push({path, method, body: request.postData()});
    if (path === '/api/skills' && method === 'GET') {
      if (holdRead) { heldReads.push({route, body: structuredClone(skills)}); return; }
      return respond(route, skills);
    }
    const [, , , name, action] = path.split('/');
    const write = async () => {
      if (denyWrite) return respond(route, {error: 'fixture refused'}, 500);
      if (method === 'DELETE') skills = skills.filter(s => s.name !== name);
      else if (method === 'PUT') skills.find(s => s.name === name).code = request.postDataJSON().code;
      else if (action === 'disable' || action === 'enable') skills.find(s => s.name === name).status = action === 'disable' ? 'disabled' : 'loaded';
      return respond(route, action === 'test' ? {result: 'ok', is_error: false} : {result: 'ok'});
    };
    if (holdWrite) { heldWrites.push(write); return; }
    return write();
  });
  const wait = condition => page.waitForFunction(condition);
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__skills_fixture__.html`);
  await wait(() => window.ready && !view.loading);
  const card = name => page.locator('.sk-card').filter({has: page.locator('.sk-card-name', {hasText: new RegExp(`^${name}$`)})});
  assert.equal(await page.locator('.sk-stat-card').filter({hasText: 'Active Skills'}).locator('.sk-stat-value').innerText(), '1');
  assert.match(await card('active').innerText(), /Enabled/);
  assert.match(await card('disabled').innerText(), /Disabled/);
  assert.equal(await card('disabled').getByRole('button', {name: 'Test disabled', exact: true}).isDisabled(), true);
  assert.equal(await card('disabled').getByRole('button', {name: 'Test disabled', exact: true}).getAttribute('aria-describedby'), 'skill-disabled-disabled');
  assert.match(await page.locator('#skill-disabled-disabled').innerText(), /Enable the skill before testing/);
  await card('disabled').getByRole('button', {name: 'View code for disabled', exact: true}).click();
  assert.equal(await card('disabled').locator('.sk-code-block').innerText(), moduleCode);
  const failed = card('broken');
  assert.match(await failed.innerText(), /Failed to load/);
  assert.match(await failed.innerText(), /Unavailable until the module loads successfully\./);
  assert.equal(await failed.getByRole('alert').count(), 1);
  assert.equal(await failed.getByRole('alert').innerText(), diagnostic);
  assert.equal((await failed.innerText()).split(diagnostic).length - 1, 1, 'diagnostic must not be duplicated as description');
  assert.equal(await failed.locator('img').count(), 0);
  assert.equal(await page.evaluate(() => window.injected), undefined);
  assert.equal(await failed.getByRole('button').count(), 1, 'only deletion is available without code');
  await page.evaluate(async () => {
    const failed = view.skills.find(s => s.name === 'broken');
    await view.toggleSkill(failed); await view.testSkill('broken'); view.editSkill(failed);
  });
  assert.equal(await page.evaluate(() => view.editing), false);
  assert.equal(calls.filter(c => c.path.startsWith('/api/skills/broken')).length, 0);
  assert.doesNotMatch(await failed.innerText(), /Loaded:/);
  assert.equal(await card('failed_with_code').getByRole('button', {name: 'View code for failed_with_code'}).count(), 1);

  // Disabled programmatic test is fenced as well as the DOM control.
  const testsBefore = calls.filter(c => c.path.endsWith('/test')).length;
  await page.evaluate(() => view.testSkill('disabled'));
  assert.equal(calls.filter(c => c.path.endsWith('/test')).length, testsBefore);

  // Keyboard activation and per-skill pending guard include duplicate direct calls.
  holdWrite = true;
  const enable = card('disabled').getByRole('button', {name: 'Enable disabled', exact: true});
  await enable.focus(); await page.keyboard.press('Enter');
  await wait(() => view.skillPending.has('disabled'));
  assert.equal(await enable.isDisabled(), true);
  assert.equal(await enable.getAttribute('aria-busy'), 'true');
  await page.evaluate(() => { view.toggleSkill(view.skills.find(s => s.name === 'disabled')); });
  assert.equal(calls.filter(c => c.path === '/api/skills/disabled/enable').length, 1);
  holdWrite = false; await heldWrites.shift()();
  await wait(() => !view.skillPending.size);
  assert.match(await card('disabled').innerText(), /Enabled/);
  assert.equal(await card('disabled').getByRole('button', {name: 'Test disabled', exact: true}).isDisabled(), false);
  await card('disabled').getByRole('button', {name: 'Disable disabled', exact: true}).focus();
  await page.keyboard.press('Space');
  await wait(() => view.skills.find(s => s.name === 'disabled').status === 'disabled' && !view.skillPending.size);

  // Failed write restores confirmed state, with visible feedback.
  denyWrite = true;
  await card('disabled').getByRole('button', {name: 'Enable disabled', exact: true}).click();
  await wait(() => !view.skillPending.size);
  assert.match(await card('disabled').innerText(), /Disabled/);
  assert.match(await page.locator('.toast-stack').innerText(), /fixture refused/);
  await card('active').getByRole('button', {name: 'Disable active', exact: true}).click();
  await wait(() => !view.skillPending.size);
  assert.match(await card('active').innerText(), /Enabled/);
  denyWrite = false;

  // Separate keys show pending together; the existing coordinator serializes
  // their server writes, rather than introducing a second competing queue.
  holdWrite = true;
  await card('disabled').getByRole('button', {name: 'Enable disabled', exact: true}).click();
  await card('active').getByRole('button', {name: 'Disable active', exact: true}).click();
  await wait(() => view.skillPending.size === 2);
  assert.equal(heldWrites.length, 1);
  await heldWrites.shift()();
  await wait(() => view.skillPending.size === 1);
  assert.equal(heldWrites.length, 1);
  holdWrite = false; await heldWrites.shift()(); await wait(() => !view.skillPending.size);
  await card('disabled').getByRole('button', {name: 'Disable disabled', exact: true}).click();
  await wait(() => !view.skillPending.size);
  await card('active').getByRole('button', {name: 'Enable active', exact: true}).click();
  await wait(() => !view.skillPending.size);

  // Actual read/write race: an old GET completes after disable. Coordinator
  // must discard it and re-read, even if it is the latest refresh request.
  holdRead = true;
  await page.evaluate(() => { view.fetchSkills(); });
  await page.waitForTimeout(30);
  assert.equal(heldReads.length, 1);
  await card('active').getByRole('button', {name: 'Disable active', exact: true}).click();
  await wait(() => !view.skillPending.size && view.skills.find(s => s.name === 'active').status === 'disabled');
  holdRead = false;
  const old = heldReads.shift(); await respond(old.route, old.body);
  await wait(() => !view.loading);
  assert.equal(await card('active').getByRole('button', {name: 'Enable active', exact: true}).count(), 1);

  // A read predating a mutation must not publish its failure either.
  holdRead = true;
  await page.evaluate(() => { view.fetchSkills(); });
  await page.waitForTimeout(30);
  await card('active').getByRole('button', {name: 'Enable active', exact: true}).click();
  await wait(() => !view.skillPending.size && view.skills.find(s => s.name === 'active').status === 'loaded');
  holdRead = false;
  await respond(heldReads.shift().route, {error: 'pre-mutation failure'}, 500);
  await wait(() => !view.loading);
  assert.equal(await page.evaluate(() => view.error), null);
  await card('active').getByRole('button', {name: 'Disable active', exact: true}).click();
  await wait(() => !view.skillPending.size && view.skills.find(s => s.name === 'active').status === 'disabled');

  // Out-of-order refreshes, including stale errors, cannot overwrite the latest.
  holdRead = true;
  await page.evaluate(() => { view.fetchSkills(); });
  await page.waitForTimeout(30);
  await page.evaluate(() => { view.fetchSkills(); });
  await page.waitForTimeout(30);
  assert.equal(heldReads.length, 2);
  holdRead = false;
  const first = heldReads.shift(), latest = heldReads.shift();
  await respond(latest.route, latest.body); await wait(() => !view.loading);
  await respond(first.route, {error: 'obsolete refresh failure'}, 500);
  await page.waitForTimeout(30);
  assert.equal(await page.evaluate(() => view.error), null);
  assert.equal(await page.locator('.sk-card').count(), 4);

  holdRead = true;
  await page.evaluate(() => { view.fetchSkills(); });
  await page.waitForTimeout(30);
  await page.evaluate(() => { view.fetchSkills(); });
  await page.waitForTimeout(30);
  holdRead = false;
  const staleSuccess = heldReads.shift(), freshSuccess = heldReads.shift();
  await respond(freshSuccess.route, freshSuccess.body); await wait(() => !view.loading);
  await respond(staleSuccess.route, [{...fixtures[0], description: 'obsolete success'}]);
  await page.waitForTimeout(30);
  assert.equal(await page.locator('.sk-card').count(), 4, 'obsolete successful refresh cannot replace inventory');

  // A refresh issued behind a pending write cannot start a stale GET.
  holdWrite = true;
  await card('active').getByRole('button', {name: 'Enable active', exact: true}).click();
  await wait(() => view.skillPending.has('active'));
  const readsBefore = calls.filter(c => c.method === 'GET').length;
  await page.evaluate(() => { view.fetchSkills(); });
  await page.waitForTimeout(30);
  assert.equal(calls.filter(c => c.method === 'GET').length, readsBefore);
  holdWrite = false; await heldWrites.shift()(); await wait(() => !view.loading && !view.skillPending.size);
  assert.equal(await card('active').getByRole('button', {name: 'Disable active', exact: true}).count(), 1);

  // Disabled editing is preserved in both the real request and readback state.
  await card('disabled').getByRole('button', {name: 'Edit skill'}).click();
  const edited = moduleCode + '\n# saved while disabled';
  await page.locator('textarea').fill(edited);
  await page.getByRole('button', {name: 'Save', exact: true}).click();
  await wait(() => !view.saving && !view.editing);
  assert.equal(skills.find(s => s.name === 'disabled').status, 'disabled');
  assert.equal(skills.find(s => s.name === 'disabled').code, edited);
  assert.equal(await card('disabled').getByRole('button', {name: 'Enable disabled', exact: true}).count(), 1);
  await card('disabled').getByRole('button', {name: 'Edit skill'}).click();
  denyWrite = true;
  await page.getByRole('button', {name: 'Save', exact: true}).click();
  await wait(() => !view.saving && !!view.editError);
  assert.match(await page.evaluate(() => view.editError), /fixture refused/);
  assert.equal(await page.evaluate(() => view.skills.find(s => s.name === 'disabled').code), edited, 'rollback retains last confirmed save, not original code');
  denyWrite = false;
  await page.locator('.sk-editor-header').getByRole('button', {name: 'Cancel'}).click();

  // Failed deletion uses the existing keyboard-accessible confirmation only.
  const deletesBefore = calls.filter(c => c.method === 'DELETE').length;
  await failed.getByRole('button', {name: 'Delete skill'}).click();
  const dialog = page.getByRole('dialog', {name: 'Delete Skill'});
  assert.equal(await dialog.count(), 1);
  assert.equal(calls.filter(c => c.method === 'DELETE').length, deletesBefore);
  await dialog.getByRole('button', {name: 'Cancel'}).click();
  assert.equal(calls.filter(c => c.method === 'DELETE').length, deletesBefore);
  await failed.getByRole('button', {name: 'Delete skill'}).click();
  denyWrite = true;
  await dialog.getByRole('button', {name: 'Delete', exact: true}).click();
  await wait(() => !view.deleting);
  assert.equal(await dialog.count(), 1, 'failed delete retains confirmation for retry');
  assert.equal(await failed.count(), 1);
  denyWrite = false; holdWrite = true;
  await dialog.getByRole('button', {name: 'Delete', exact: true}).click();
  await wait(() => view.deleting);
  await page.evaluate(() => { view.doDelete(); });
  assert.equal(calls.filter(c => c.method === 'DELETE').length, deletesBefore + 2);
  holdWrite = false; await heldWrites.shift()(); await wait(() => !view.deleting && !view.loading);
  assert.equal(await failed.count(), 0); assert.equal(await dialog.count(), 0);

  // Real test's pending guard stops a toggle while execution is in flight.
  holdWrite = true;
  await card('active').getByRole('button', {name: 'Test active', exact: true}).click();
  await wait(() => view.skillPending.has('active'));
  assert.equal(await card('active').getByRole('button', {name: 'Disable active', exact: true}).isDisabled(), true);
  holdWrite = false; await heldWrites.shift()(); await wait(() => !view.skillPending.size);
  assert.match(await card('active').innerText(), /Test passed/);
  assert.deepEqual(errors, []);
  const coverage = (await page.coverage.stopJSCoverage()).find(entry => new URL(entry.url).pathname === '/ui/js/pages/skills.js');
  assert.ok(coverage, 'page coverage captured');
  const boundaries = new Set([0, coverage.source.length]);
  const ranges = coverage.functions.flatMap(fn => fn.ranges);
  for (const range of ranges) { boundaries.add(range.startOffset); boundaries.add(range.endOffset); }
  const offsets = [...boundaries].sort((a, b) => a - b);
  let covered = 0;
  for (let i = 1; i < offsets.length; i++) {
    const start = offsets[i - 1], end = offsets[i];
    const applicable = ranges.filter(range => range.startOffset <= start && range.endOffset >= end)
      .sort((a, b) => (a.endOffset - a.startOffset) - (b.endOffset - b.startOffset));
    if (applicable[0]?.count > 0) covered += end - start;
  }
  console.log(`skills-browser: states, keyboard/ARIA, duplicate pending guards, rollback, read/write + stale refresh races, disabled save/test and confirmed failed deletion passed; Skills page executed source-range coverage ${(100 * covered / coverage.source.length).toFixed(1)}%`);
} finally {
  if (browser) await browser.close();
  await server.close();
}
