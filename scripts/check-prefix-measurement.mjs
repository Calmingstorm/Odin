import assert from 'node:assert/strict';
import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';

globalThis.localStorage = { getItem() { return null; } };
globalThis.sessionStorage = { getItem() { return null; } };
globalThis.document = { addEventListener() {}, removeEventListener() {} };
globalThis.window = { setInterval, clearInterval, setTimeout, clearTimeout };
const { default: page } = await import('../ui/js/pages/internals.js');

async function render(compressionStats) {
  const originalWarn = console.warn;
  console.warn = () => {};
  let state;
  try { state = page.setup(); } finally { console.warn = originalWarn; }
  state.loading.value = false;
  state.compressionStats.value = compressionStats;
  const app = createSSRApp({ template: page.template, setup() { return state; } });
  app.component('odin-icon', { template: '<span></span>' });
  return renderToString(app);
}

for (const fixture of [
  { prefix_hit_rate: 0 }, // Older API response must not fabricate measurements.
  { prefix_hit_rate: null, prefix_measurement: 'unmeasured' },
]) {
  const html = await render(fixture);
  assert.ok(html.includes('Prefix stability: Not measured'));
  assert.ok(!html.includes('Local prefix equality: 0%'));
  assert.ok(html.includes('Upstream cache hits: Not measured here'));
}
const local = await render({ prefix_hit_rate: 0.5, prefix_measurement: 'local_prefix_equality' });
assert.ok(local.includes('Local prefix equality: 50% (not upstream cache hits)'));
assert.ok(local.includes('Upstream cache hits: Not measured here'));
console.log('prefix measurement: real page rendering checks passed');
