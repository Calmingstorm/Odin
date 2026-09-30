import assert from 'node:assert/strict';
import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';

const storage = { getItem() { return null; }, setItem() {}, removeItem() {} };
globalThis.localStorage = storage;
globalThis.sessionStorage = storage;
globalThis.window = globalThis;
globalThis.location = { protocol: 'http:', host: 'localhost' };
const { default: healthPage } = await import('../ui/js/pages/health.js');

for (const [count, status, overall] of [[70, 'ok', 'healthy'], [71, 'degraded', 'degraded']]) {
  // Exercise the existing generic Health card renderer: new resource probes
  // must not need a separately maintained UI template to surface warnings.
  const detail = `${count} open descriptors / 100 soft limit (${count}.0%)`;
  globalThis.fetch = async path => {
    assert.equal(path, '/api/health/components');
    return new Response(JSON.stringify({
      overall, healthy_count: status === 'ok' ? 1 : 0,
      degraded_count: status === 'degraded' ? 1 : 0, down_count: 0, unconfigured_count: 0,
      checked_at: '2026-09-30T12:00:00Z',
      components: [{ name: 'open_files', status, healthy: status === 'ok', detail,
        metadata: { open_descriptors: count, soft_limit: 100, usage_percent: count } }],
    }), { headers: { 'Content-Type': 'application/json' } });
  };
  const app = createSSRApp({
    template: healthPage.template,
    async setup() {
      const state = healthPage.setup();
      await state.fetchHealth();
      return state;
    },
  });
  app.component('odin-icon', { props: ['name', 'size'], template: '<span></span>' });
  const html = await renderToString(app);
  assert.ok(html.includes('Open Files'));
  assert.ok(html.includes(detail));
  assert.ok(html.includes(`health-card-${status}`));
  assert.ok(html.includes(status === 'ok' ? 'badge-success' : 'badge-warning'));
  assert.ok(html.includes(overall === 'healthy' ? 'All Systems Healthy' : 'Degraded'));
}
console.log('open-file-health: Health page renders descriptor counts, limits and warning cards');
