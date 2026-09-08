import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

// The component must be reachable in the shipped application, not only this harness.
const systemSource = fs.readFileSync('ui/js/pages/system.js', 'utf8');
assert.match(systemSource, /import ComputerPage from ['"]\.\/computer\.js['"]/);
assert.match(systemSource, /id: ['"]computer['"], label: ['"]Computer['"], component: ComputerPage/);
const configSource = fs.readFileSync('ui/js/pages/config.js', 'utf8');
assert.match(configSource, /CONFIG_EXCLUDED_SECTIONS = new Set\([\s\S]*?'computer'/);
assert.doesNotMatch(configSource, /Computer use is under development/);
const computerSource = fs.readFileSync('ui/js/pages/computer.js', 'utf8');
assert.match(computerSource, /class="page-header mb-4"/);
assert.match(computerSource, /class="page-header-actions" aria-label="Emergency session controls"/);
assert.ok((computerSource.match(/class="hm-card/g) || []).length >= 7, 'major computer sections use shared cards');
assert.doesNotMatch(computerSource, /style=/, 'computer page must not regress to ad-hoc inline layout');

// Isolated component harness: loopback test server + mocked API, no desktop.
const server = await createServer({
  configFile: false, root: process.cwd(), appType: 'custom',
  resolve: { alias: { vue: 'vue/dist/vue.esm-bundler.js' } },
  define: { __VUE_OPTIONS_API__: 'true', __VUE_PROD_DEVTOOLS__: 'false', __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false' },
  server: { host: '127.0.0.1', port: 0, watch: null },
});
const html = `<!doctype html><html><head>
  <link rel="stylesheet" href="/ui/css/fonts.css">
  <link rel="stylesheet" href="/ui/css/tailwind.css">
  <link rel="stylesheet" href="/ui/css/style.css">
  <link rel="stylesheet" href="/ui/css/foundation.css">
</head><body><div id="app"></div><script type="module">
  import { createApp, h, ref, nextTick, KeepAlive } from 'vue';
  import Computer from '/ui/js/pages/computer.js';
  import { api } from '/ui/js/api.js';
  api.setToken('fixture-only');
  const view = ref(null);
  const visible = ref(true);
  createApp({ render: () => h(KeepAlive, null, { default: () => visible.value ? h(Computer, { ref: view }) : null }) }).mount('#app');
  await nextTick(); window.view = view.value; window.api = api; window.ready = true;
  window.showComputer = async value => { visible.value = value; await nextTick(); };
</script></body></html>`;
server.middlewares.use(async (req, res, next) => {
  if (req.url !== '/__computer_test__.html') return next();
  res.setHeader('Content-Type', 'text/html');
  res.end(await server.transformIndexHtml(req.url, html));
});
let browser;
try {
  await server.listen();
  const executablePath = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean).find(p => fs.existsSync(p));
  assert.ok(executablePath, 'Chrome/Chromium required');
  browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const errors = [], requests = [];
  page.on('pageerror', e => errors.push(e.message));
  let state = 'active', code = 200, blocked = null, holdObserve = false;
  let holdStatus = false, blockedStatus = null;
  let enabled = false, runtimeEnabled = false, runtimeGeneration = 0, holdToggle = false, blockedToggle = null;
  let sessionGeneration = 1, recovery, inputAdmission, applicationProvenance;
  let backend = { platform: 'x11', environment: 'isolated', input_supported: false }, restartRequired = ['backend.environment'];
  let applicationProfiles = [{ id: 'drawing', label: 'Drawing', input: 'supported' }, { id: 'xed', label: 'Xed', input: 'supported' }];
  const summary = () => ({ available: true, state, enabled, configured_enabled: enabled, runtime_enabled: runtimeEnabled, generation: runtimeGeneration, session_generation: sessionGeneration, recovery, backend, input_admission: inputAdmission, application_provenance: applicationProvenance, application_profiles: applicationProfiles, restart_required: restartRequired, owner_id: 'alice', session_id: 'computer-session', app: backend?.environment === 'existing_session' ? null : 'drawing', last_action: 'executed', last_verification: 'unknown' });
  const frame = () => ({ frame: { evidence_id: 'opaque-frame', captured_at: new Date().toISOString(), expires_at: new Date(Date.now() + 3600000).toISOString(), fresh_for_ms: 1000 } });
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aHj8AAAAASUVORK5CYII=', 'base64');
  await page.route('**/api/**', async route => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname;
    // Provisioning has its own harness; this component suite exercises status
    // and recovery without saving configuration.
    if (path === '/api/config' || path === '/api/config/meta') {
      assert.equal(req.method(), 'GET');
      return route.fulfill({ contentType: 'application/json', body: '{}' });
    }
    requests.push(path);
    assert.equal(url.search, '', 'credentials must not enter URLs');
    assert.equal(req.headers().authorization, 'Bearer fixture-only');
    if (code !== 200) return route.fulfill({ status: code, contentType: 'application/json', body: JSON.stringify({ error: 'fixture denial' }) });
    let body;
    if (path === '/api/computer') {
      if (holdStatus) { blockedStatus = route; return; }
      body = summary();
    }
    else if (path === '/api/computer/enabled') {
      assert.equal(req.method(), 'POST');
      assert.deepEqual(Object.keys(req.postDataJSON()), ['enabled']);
      assert.equal(typeof req.postDataJSON().enabled, 'boolean');
      enabled = req.postDataJSON().enabled; runtimeEnabled = enabled; runtimeGeneration++;
      if (holdToggle) { blockedToggle = route; return; }
      body = { enabled };
    } else if (path === '/api/computer/observe') {
      if (holdObserve) { blocked = route; return; }
      body = frame();
    } else if (path === '/api/computer/evidence/opaque-frame') return route.fulfill({ contentType: 'image/png', body: png });
    else if (path === '/api/computer/stop') { state = 'cancelled'; body = { state }; }
    else if (path === '/api/computer/recover') {
      assert.deepEqual(req.postDataJSON(), { session_id: 'computer-session', generation: sessionGeneration });
      state = 'closed'; recovery = { status: 'absence_verified', reason: 'owned_runtime_gone', complete: true };
      body = summary();
    }
    else if (path === '/api/computer/reconcile' || path === '/api/computer/acknowledge_legacy') {
      const legacy = recovery?.reason === 'legacy_runtime_identity_missing';
      if (path !== (legacy ? '/api/computer/acknowledge_legacy' : '/api/computer/reconcile')) {
        return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({
          code: 'runtime_identity_required', error: 'Use legacy acknowledgment for missing runtime identity.',
        }) });
      }
      assert.deepEqual(req.postDataJSON(), { session_id: 'computer-session', generation: sessionGeneration,
        acknowledgment: 'ACKNOWLEDGE UNVERIFIED CLEANUP computer-session' });
      state = 'closed'; sessionGeneration++;
      recovery = { status: 'operator_acknowledged_unverified', reason: 'controller_lost', complete: false };
      body = summary();
    }
    else if (path === '/api/computer/pause') { state = 'paused'; body = summary(); }
    else if (path === '/api/computer/export') {
      assert.deepEqual(req.postDataJSON(), { name: 'drawing.png' });
      body = { artifact_id: 'opaque-artifact', name: 'drawing.png', expires_at: new Date(Date.now() + 3600000).toISOString() };
    } else if (path === '/api/computer/download/opaque-artifact') return route.fulfill({ contentType: 'application/octet-stream', body: 'fixture saved artifact' });
    else throw new Error('Unexpected route ' + path);
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__computer_test__.html`);
  await page.waitForFunction(() => window.ready && !view.loading);
  assert.deepEqual(requests, ['/api/computer']);
  const emergencyControls = page.getByLabel('Emergency session controls');
  assert.equal(await emergencyControls.locator('.btn').count(), 2);
  const pauseControl = page.getByRole('button', { name: 'Pause and revoke agent input' });
  assert.ok((await pauseControl.boundingBox()).height >= 44, 'pause/revoke remains a mobile-sized touch target');
  assert.equal(await page.locator('.computer-page > .page-header').evaluate(el => getComputedStyle(el).position), 'sticky', 'emergency controls stay reachable while scrolling');
  assert.ok((await page.locator('.computer-page > .space-y-4 > .hm-card').count()) >= 4, 'computer sections render as shared cards');
  assert.equal(await page.locator('.computer-page [style]').count(), 0, 'rendered computer page has no inline layout styles');
  await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
  await page.waitForFunction(() => !view.loading);
  assert.equal(requests.filter(p => /observe|evidence/.test(p)).length, 0);
  const enable = page.getByRole('button', { name: 'Enable computer use', exact: true });
  const disable = page.getByRole('button', { name: 'Disable computer use', exact: true });
  const lifecycle = page.getByRole('region', { name: 'Administrator lifecycle controls' });
  assert.match(await lifecycle.innerText(), /Runtime generation\s+0/);
  assert.match(await lifecycle.innerText(), /backend.environment/);
  assert.match(await lifecycle.innerText(), /Input unavailable: this backend cannot act/);
  assert.match(await lifecycle.innerText(), /Session startup checks capabilities. Unavailable input remains unavailable/);
  const applications = page.getByRole('region', { name: 'Application profiles', exact: true });
  assert.match(await applications.innerText(), /Drawing: Input eligible/);
  assert.match(await applications.innerText(), /not installation, focus, permission or task success/);
  assert.doesNotMatch(await applications.innerText(), /Inkscape|LibreOffice/);
  backend = { platform: 'x11', environment: 'existing_session', input_supported: false,
    pointer: 'independent', keyboard_focus: 'independent_per_window', widget_focus: 'shared_within_window' };
  applicationProvenance = { pid: 4242, exe_basename: 'custom-editor', wm_class: '<b>CustomEditor</b>', trusted_executable: false };
  applicationProfiles = [
    { id: 'drawing', label: 'Drawing', input: 'capture_only' },
    { id: 'inkscape', label: 'Inkscape', input: 'supported' },
    { id: 'writer', label: 'LibreOffice Writer only', input: 'supported',
      task_scope: 'Keyboard-only Writer note and save. Close/reopen is not offered; save evidence is not reopen evidence.' },
    { id: 'xed', label: 'Xed', input: 'supported' },
  ];
  await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
  await page.waitForFunction(() => !view.loading && view.status.backend.environment === 'existing_session');
  assert.equal(await applications.count(), 0);
  const attached = page.getByRole('region', { name: 'Attached application', exact: true });
  assert.match(await attached.innerText(), /no application allowlist/);
  assert.match(await attached.innerText(), /Normal dialogs, file pickers, menus/);
  assert.match(await attached.innerText(), /Denied classes remain blocked: terminals/);
  assert.match(await attached.innerText(), /custom-editor/);
  assert.match(await attached.innerText(), /<b>CustomEditor<\/b>/);
  assert.equal(await attached.locator('b').count(), 0, 'provenance is escaped text');
  assert.match(await attached.innerText(), /4242/);
  assert.match(await attached.innerText(), /independent_per_window/);
  assert.match(await attached.innerText(), /shared_within_window/);
  assert.doesNotMatch(await attached.innerText(), /Writer|Inkscape|not offered/);
  applicationProvenance.script_identity = { interpreter_basename: 'python3', argv_digest: 'a'.repeat(64), verified: false };
  await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
  await page.waitForFunction(() => !view.loading && view.status.application_provenance?.script_identity);
  assert.match(await attached.innerText(), /python3; argv digest a{64}; not verified/);
  assert.match(await lifecycle.innerText(), /Input unavailable/);
  assert.equal(requests.filter(p => /observe|evidence/.test(p)).length, 0, 'profile listing never captures');
  inputAdmission = {
    state: 'refused', code: 'owned_button_release_failed',
    compositor: { name: 'Mutter', version: '46.2', backend: 'nested-x11', build_id: 'fixture-build' },
    reason: 'Owned button release was not delivered after sender EOF.',
    remedy: 'Install a compositor build containing the upstream button-release fix.',
    probe_scope: 'same_stack_disposable', checks: ['sender_eof_button_release_failed'],
  };
  backend = { platform: 'wayland', environment: 'existing_session', input_supported: false };
  await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
  await page.waitForFunction(() => !view.loading && view.status.input_admission?.state === 'refused');
  assert.match(await attached.innerText(), /Pointer\s+unknown/);
  const admission = page.getByRole('region', { name: 'Input eligibility evidence', exact: true });
  assert.match(await admission.innerText(), /Mutter 46.2 \(nested-x11\)/);
  assert.match(await admission.innerText(), /sender EOF/);
  assert.match(await admission.innerText(), /Operator action: Install/);
  assert.match(await admission.innerText(), /separate disposable compositor/);
  assert.match(await admission.innerText(), /Opening this page runs no input probe/);
  assert.equal(requests.filter(p => /observe|evidence/.test(p)).length, 0, 'admission evidence never probes');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  inputAdmission = { ...inputAdmission, state: 'eligible', code: 'release_probe_passed',
    reason: 'Measured lifecycle checks passed.', remedy: 'Reprobe after session change.' };
  backend.input_supported = true;
  await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
  await page.waitForFunction(() => !view.loading && view.status.input_admission?.state === 'eligible');
  assert.match(await admission.innerText(), /eligible: release_probe_passed/);
  assert.doesNotMatch(await lifecycle.innerText(), /Input unavailable/);
  inputAdmission = undefined;
  backend = { platform: 'x11', environment: 'existing_session', input_supported: false };
  await enable.click();
  await page.waitForFunction(() => !view.toggling && view.status.runtime_enabled === true);
  assert.equal(await enable.isEnabled(), false);
  assert.match(await lifecycle.innerText(), /Runtime generation\s+1/);
  assert.match(await lifecycle.innerText(), /Input unavailable/);
  assert.deepEqual(requests.slice(-2), ['/api/computer/enabled', '/api/computer']);
  await disable.click();
  await page.waitForFunction(() => !view.toggling && view.status.runtime_enabled === false);
  assert.equal(await enable.isEnabled(), true);
  assert.equal(requests.filter(p => /observe|evidence/.test(p)).length, 0, 'toggle never captures');
  // Real keyboard activation, not direct Vue method invocation.
  const observe = page.getByRole('button', { name: 'Observe / view frame', exact: true });
  await observe.focus(); await page.keyboard.press('Enter');
  await page.waitForFunction(() => !!view.frameUrl);
  assert.equal(await page.locator('img').count(), 1);
  assert.match(await page.locator('figcaption').innerText(), /Fresh frame/);
  await page.waitForFunction(() => view.freshness.startsWith('Stale'));
  // Explicit hide releases private object URL.
  await page.getByRole('button', { name: 'Hide frame', exact: true }).click();
  assert.equal(await page.locator('img').count(), 0);
  // Hanging Observe cannot disable Stop; late frame response stays discarded.
  holdObserve = true;
  await observe.click();
  await page.waitForFunction(() => view.observing);
  for (let n = 0; n < 50 && !blocked; n++) await new Promise(r => setTimeout(r, 10));
  assert.ok(blocked);
  const stop = page.getByRole('button', { name: 'Stop computer session', exact: true });
  assert.equal(await stop.isEnabled(), true);
  assert.ok((await stop.boundingBox()).height >= 44);
  await stop.tap();
  await page.waitForFunction(() => view.status.state === 'cancelled');
  await blocked.fulfill({ contentType: 'application/json', body: JSON.stringify(frame()) });
  blocked = null; holdObserve = false;
  await page.waitForTimeout(100);
  assert.equal(await page.locator('img').count(), 0);
  await page.getByRole('button', { name: 'Pause and revoke agent input' }).click();
  await page.waitForFunction(() => view.status.state === 'paused');
  assert.match(await page.locator('#app').innerText(), /does not provide remote mouse or keyboard control/);
  await page.getByLabel('Filename', { exact: true }).fill('drawing.png');
  await page.getByRole('button', { name: 'Prepare export', exact: true }).click();
  await page.waitForFunction(() => !!view.artifact);
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download drawing.png', exact: true }).click();
  assert.equal((await downloaded).suggestedFilename(), 'drawing.png');
  // Revocation clears both frame and prepared artifact, and reconnect never captures.
  await observe.click(); await page.waitForFunction(() => !!view.frameUrl);
  code = 403;
  await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
  await page.waitForFunction(() => !view.loading && !!view.error);
  assert.equal(await page.locator('img').count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Download drawing.png' }).count(), 0);
  assert.match(await page.getByRole('alert').innerText(), /Access unavailable or revoked/);
  code = 503;
  await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
  await page.waitForFunction(() => view.status.state === 'unavailable');
  assert.equal(await stop.isEnabled(), true);
  const captureCount = requests.filter(p => p.endsWith('/observe')).length;
  code = 200;
  await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
  await page.waitForFunction(() => !view.loading);
  assert.equal(requests.filter(p => p.endsWith('/observe')).length, captureCount);
  // Lifecycle mutations must not serialize emergency stop/pause behind them.
  holdToggle = true;
  await enable.click();
  await page.waitForFunction(() => view.toggling);
  for (let n = 0; n < 50 && !blockedToggle; n++) await new Promise(r => setTimeout(r, 10));
  assert.ok(blockedToggle);
  assert.equal(await stop.isEnabled(), true);
  assert.equal(await page.getByRole('button', { name: 'Pause and revoke agent input' }).isEnabled(), true);
  await page.getByRole('button', { name: 'Pause and revoke agent input' }).click();
  await page.waitForFunction(() => !view.pausing && view.status.state === 'paused');
  assert.ok(blockedToggle, 'Pause completed before the blocked lifecycle response');
  await stop.click();
  await page.waitForFunction(() => view.status.state === 'cancelled');
  await blockedToggle.fulfill({ contentType: 'application/json', body: JSON.stringify({ enabled: true }) });
  blockedToggle = null; holdToggle = false;
  await page.waitForFunction(() => !view.toggling);
  assert.equal(await page.locator('img').count(), 0);
  // A generation change invalidates evidence even with the same session ID.
  await observe.click(); await page.waitForFunction(() => !!view.frameUrl);
  runtimeGeneration++; backend = undefined; restartRequired = false; applicationProfiles = [{ id: 'bogus', label: '<script>bad</script>', input: 'ready' }, null];
  await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
  await page.waitForFunction(() => !view.loading && !view.frameUrl);
  assert.match(await lifecycle.innerText(), /Input capability is unknown/);
  assert.match(await lifecycle.innerText(), /None reported/);
  assert.match(await applications.innerText(), /No application profiles reported/);
  assert.equal(await applications.locator('script').count(), 0);
  // Session revocation, independent of runtime generation, also retires pixels.
  await observe.click(); await page.waitForFunction(() => !!view.frameUrl);
  sessionGeneration++;
  await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
  await page.waitForFunction(() => !view.loading && !view.frameUrl);
  state = 'quarantined'; recovery = { status: 'operator_reconciliation_required', reason: 'controller_lost', complete: false };
  await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
  await page.waitForFunction(() => !view.loading && view.status.state === 'quarantined');
  const beforeRecoveryCapture = requests.filter(p => /observe|evidence/.test(p)).length;
  const verifyWorkload = page.getByRole('button', { name: 'Verify recorded workload absence', exact: true });
  await verifyWorkload.focus(); await page.keyboard.press('Enter');
  await page.waitForFunction(() => !view.recovering && view.status.state === 'closed');
  assert.match(await page.getByRole('region', { name: 'Recovery evidence' }).innerText(), /Cleanup verified/);
  assert.equal(requests.filter(p => /observe|evidence/.test(p)).length, beforeRecoveryCapture);
  // Manual recovery requires an exact, generation-bound human attestation.
  state = 'quarantined'; recovery = { status: 'operator_reconciliation_required', reason: 'controller_lost', complete: false };
  await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
  await page.waitForFunction(() => !view.loading && view.status.state === 'quarantined');
  const acknowledge = page.getByRole('button', { name: 'Acknowledge unverified cleanup', exact: true });
  const acknowledgment = page.locator('#computer-reconciliation-ack');
  assert.ok(await acknowledge.isDisabled());
  await acknowledgment.fill('yes');
  assert.ok(await acknowledge.isDisabled());
  await acknowledgment.fill('ACKNOWLEDGE UNVERIFIED CLEANUP computer-session');
  assert.ok(await acknowledge.isEnabled());
  sessionGeneration++;
  await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
  await page.waitForFunction(() => !view.loading && !view.reconciliationAck);
  assert.ok(await acknowledge.isDisabled(), 'stale attestation is invalidated with session generation');
  await acknowledgment.fill('ACKNOWLEDGE UNVERIFIED CLEANUP computer-session');
  await acknowledge.click();
  await page.waitForFunction(() => !view.recovering && view.status.state === 'closed');
  assert.match(await page.getByRole('region', { name: 'Recovery evidence' }).innerText(), /Cleanup not verified/);
  assert.equal(requests.filter(p => p === '/api/computer/reconcile').length, 1);
  assert.equal(requests.filter(p => /observe|evidence/.test(p)).length, beforeRecoveryCapture);
  // Older persisted sessions have no runtime descriptor. Their explicit
  // attestation must use the legacy route, not the descriptor-only reconcile API.
  state = 'quarantined'; sessionGeneration++;
  recovery = { status: 'operator_cleanup_required', reason: 'legacy_runtime_identity_missing', complete: false };
  await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
  await page.waitForFunction(() => !view.loading && view.status.state === 'quarantined');
  await acknowledgment.fill('ACKNOWLEDGE UNVERIFIED CLEANUP computer-session');
  await acknowledge.click();
  await page.waitForFunction(() => !view.recovering);
  assert.equal(await page.evaluate(() => view.status.state), 'closed');
  assert.equal(requests.filter(p => p === '/api/computer/acknowledge_legacy').length, 1);
  assert.equal(requests.filter(p => p === '/api/computer/reconcile').length, 1);
  assert.match(await page.getByRole('region', { name: 'Recovery evidence' }).innerText(), /Cleanup not verified/);
  assert.equal(requests.filter(p => /observe|evidence/.test(p)).length, beforeRecoveryCapture);
  // Rejected mutations hide admin controls and are not retried automatically.
  const togglesBefore = requests.filter(p => p.endsWith('/enabled')).length;
  code = 403;
  await disable.click();
  await page.waitForFunction(() => !view.toggling && !!view.error);
  assert.equal(await enable.count(), 0);
  assert.equal(await disable.count(), 0);
  assert.equal(requests.filter(p => p.endsWith('/enabled')).length, togglesBefore + 1);
  assert.match(await page.getByRole('alert').innerText(), /Access unavailable or revoked/);
  // Leaving a kept-alive inspector must retire a hung status read. Otherwise
  // its loading flag suppresses every refresh after reactivation indefinitely.
  code = 200;
  await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
  await page.waitForFunction(() => !view.loading && view.adminReady);
  holdStatus = true;
  await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
  for (let n = 0; n < 50 && !blockedStatus; n++) await new Promise(r => setTimeout(r, 10));
  assert.ok(blockedStatus);
  const oldStatus = summary();
  await page.evaluate(() => window.showComputer(false));
  holdStatus = false; state = 'paused'; sessionGeneration++;
  const statusCount = requests.filter(p => p === '/api/computer').length;
  await page.evaluate(() => window.showComputer(true));
  await page.waitForTimeout(100);
  assert.equal(requests.filter(p => p === '/api/computer').length, statusCount + 1,
    'reactivation starts a new status read without waiting for the retired request');
  await page.waitForFunction(() => !view.loading && view.status.state === 'paused');
  await blockedStatus.fulfill({ contentType: 'application/json', body: JSON.stringify(oldStatus) });
  await page.waitForTimeout(50);
  assert.equal(await page.evaluate(() => view.status.state), 'paused', 'retired response cannot overwrite current state');
  assert.deepEqual(errors, []);
  console.log('PASS computer operator: authenticated admin enable/disable and readback, lifecycle/generation/restart/input limits, no auto capture, independent stop/pause during blocked toggle and Observe, no late frame, generation invalidation, keyboard/touch, explicit export/download, mutation rejection and unavailable/reconnect.');
} finally {
  await browser?.close(); await server.close();
}
