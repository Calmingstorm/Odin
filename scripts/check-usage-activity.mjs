import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';

globalThis.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
globalThis.sessionStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
globalThis.document = { addEventListener() {}, removeEventListener() {} };
globalThis.window = { setInterval, clearInterval, setTimeout, clearTimeout };

const usage = fs.readFileSync('ui/js/pages/usage.js', 'utf8');
const history = fs.readFileSync('ui/js/pages/history.js', 'utf8');
const distFiles = fs.readdirSync('ui/dist/assets').filter((name) => name.endsWith('.js'));
const dist = distFiles.map((name) => fs.readFileSync(`ui/dist/assets/${name}`, 'utf8')).join('\n');
const quietWarn = console.warn;
console.warn = () => {};
const { default: usagePage, fmtDuration } = await import('../ui/js/pages/usage.js');
console.warn = quietWarn;

const checks = [
  [usage.includes('Usage &amp; Activity'), 'page title'],
  [history.includes("label: 'Usage & Activity'"), 'history tab label'],
  [usage.includes('backfill_complete'), 'backfill truth'],
  [usage.includes('malformed_rows_skipped'), 'malformed-row visibility'],
  [usage.includes('provider_reported_percent'), 'token provenance coverage'],
  [usage.includes('Modeled cost is not actual spend'), 'modeled-cost honesty'],
  [usage.includes("return '—'"), 'unavailable duration formatter'],
  [usage.includes("'Not recorded'"), 'unavailable duration explanation'],
  [usage.includes('row.duration_ms') && usage.includes('row.avg_duration_ms'), 'duration display bindings'],
  [usage.includes('activity_over_time'), 'activity timeline'],
  [usage.includes('What served it'), 'provider/model/effort section'],
  [usage.includes('What tools Odin used'), 'tool section'],
  [!usage.includes('by_user') && !usage.includes('by_channel'), 'no user/channel leaderboards'],
  [!usage.includes('user_id') && !usage.includes('channel_id'), 'no user/channel identifiers'],
  [!usage.includes('actual_spend_usd'), 'no actual spend value rendered'],
  [usage.includes('receivedAt.value = Date.now()'), 'receipt-time freshness'],
  [usage.includes('epoch !== requestEpoch') && usage.includes('requestedRange !== range.value'), 'stale-response ownership'],
  [dist.includes('Usage & Activity'), 'committed dist contains page'],
  [dist.includes('Historical indexing is still running'), 'committed dist contains backfill truth'],
  [dist.includes('Not recorded'), 'committed dist contains unavailable duration truth'],
];
let failed = 0;
for (const [ok, label] of checks) {
  if (!ok) { console.error(`not ok - ${label}`); failed += 1; }
  else console.log(`ok - ${label}`);
}
if (failed) process.exit(1);
console.log(`usage-activity: ${checks.length} assertions passed`);


// Behavioral duration contract. Unknown/nonpositive evidence is never rendered
// as measured zero, while mixed known/unknown aggregates render the known sum
// or average supplied by the API.
assert.equal(fmtDuration(null), '—');
assert.equal(fmtDuration(undefined), '—');
assert.equal(fmtDuration(0), '—');
assert.equal(fmtDuration(-1), '—');
assert.equal(fmtDuration(80), '80 ms');

async function renderFixture(fixture) {
  console.warn = () => {};
  const state = usagePage.setup();
  console.warn = quietWarn;
  state.loading.value = false;
  state.hasData.value = true;
  state.data.value = fixture;
  const app = createSSRApp({ template: usagePage.template, setup() { return state; } });
  app.component('odin-icon', { template: '<span></span>' });
  return renderToString(app);
}

const baseTokens = { total: 0, provider_reported: 0, estimated: 0, legacy_estimated: 0, unknown_generations: 0, provider_reported_percent: 0, approximate: false };
const unavailable = await renderFixture({
  available: true,
  coverage: { backfill_complete: true },
  work: { settled_turns: 1, accepted_generations: 1, recorded_processing_ms: null, input_tokens: baseTokens, output_tokens: baseTokens },
  activity: [{ surface: 'chat', outcome: 'completed', count: 1, duration_ms: null }],
  activity_over_time: [],
  serving: [{ provider: 'codex', model: 'sol', effort: 'high', generations: 1, input_tokens: 1, output_tokens: 1, duration_ms: null }],
  tools: [{ tool_name: 'read_file', executions: 1, errors: 0, error_rate_percent: 0, avg_duration_ms: null }],
  automation: [],
});
assert.equal((unavailable.match(/title="Not recorded"/g) || []).length, 4,
  'all unavailable duration surfaces must render explicit Not recorded provenance');
assert.ok(!unavailable.includes('0 ms'), 'unavailable duration was rendered as a measured zero');

const mixed = await renderFixture({
  available: true,
  coverage: { backfill_complete: true },
  work: { settled_turns: 2, accepted_generations: 2, recorded_processing_ms: 900, input_tokens: baseTokens, output_tokens: baseTokens },
  activity: [{ surface: 'chat', outcome: 'completed', count: 2, duration_ms: 900 }],
  activity_over_time: [],
  serving: [{ provider: 'codex', model: 'sol', effort: 'high', generations: 2, input_tokens: 1, output_tokens: 1, duration_ms: 600 }],
  tools: [{ tool_name: 'read_file', executions: 2, errors: 0, error_rate_percent: 0, avg_duration_ms: 80 }],
  automation: [],
});
for (const expected of ['900 ms', '600 ms', '80 ms']) {
  assert.ok(mixed.includes(expected), `mixed known/unknown duration omitted ${expected}`);
}
console.log('ok - duration availability renders behaviorally');
