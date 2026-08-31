import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright-core';
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
  [usage.includes('usage-activity-scroll') && usage.includes('overflow-x-auto'), 'activity-owned horizontal scroll'],
  [usage.includes('min-w-0') && !usage.includes('min-w-2'), 'activity bars have a zero shrink floor'],
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


// Real 390px Chromium gate. Synthetic class checks missed the v3.72.0-style
// failure this guards: flex min-content widened the document only once a
// sufficiently long range was rendered. Exercise every range with realistic
// live row counts and measure the committed page as the browser lays it out.
const RANGE_FIXTURES = [
  { key: '24h', label: '24 hours', bars: 8, needsInnerScroll: false },
  { key: '7d', label: '7 days', bars: 24, needsInnerScroll: false },
  { key: '30d', label: '30 days', bars: 85, needsInnerScroll: true },
  { key: 'all', label: 'All time', bars: 231, needsInnerScroll: true },
];

function usageFixture(range) {
  const count = RANGE_FIXTURES.find((item) => item.key === range)?.bars ?? 24;
  return {
    available: true,
    coverage: { backfill_complete: true, sources_complete: 185, sources_indexed: 185, malformed_rows_skipped: 24 },
    work: {
      settled_turns: count,
      accepted_generations: count,
      recorded_processing_ms: 1250,
      input_tokens: { ...baseTokens, total: 1000 },
      output_tokens: { ...baseTokens, total: 250 },
    },
    activity: [{ surface: 'chat', outcome: 'completed', count, duration_ms: 1250 }],
    activity_over_time: Array.from({ length: count }, (_, index) => ({
      bucket: `2026-08-${String((index % 31) + 1).padStart(2, '0')}`,
      surface: ['chat', 'agent', 'loop'][index % 3],
      count: (index % 9) + 1,
    })),
    serving: [{ provider: 'local', model: 'test-model', effort: 'high', generations: count, input_tokens: 1000, output_tokens: 250, duration_ms: 900 }],
    tools: [{ tool_name: 'read_file', executions: count, errors: 0, error_rate_percent: 0, avg_duration_ms: 80 }],
    automation: [],
  };
}

const mime = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.woff2', 'font/woff2'],
]);
const distRoot = path.resolve('ui/dist');
const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
  let relative = pathname === '/ui/' || pathname === '/ui/index.html'
    ? 'index.html'
    : pathname.startsWith('/ui/assets/')
      ? pathname.slice('/ui/'.length)
      : null;
  if (!relative) { response.writeHead(404).end(); return; }
  const file = path.resolve(distRoot, relative);
  if (!file.startsWith(`${distRoot}${path.sep}`) || !fs.existsSync(file)) {
    response.writeHead(404).end(); return;
  }
  response.writeHead(200, { 'content-type': mime.get(path.extname(file)) || 'application/octet-stream' });
  fs.createReadStream(file).pipe(response);
});
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});

let browser;
try {
  const chromeCandidates = [
    process.env.CHROME_PATH,
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);
  const executablePath = chromeCandidates.find((candidate) => fs.existsSync(candidate));
  assert.ok(executablePath, 'usage render gate requires a system Chrome/Chromium executable');
  browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.route('**/api/status', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ status: 'online', uptime_seconds: 3600 }),
  }));
  await page.route('**/api/usage?*', (route) => {
    const requestedRange = new URL(route.request().url()).searchParams.get('range') || '7d';
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(usageFixture(requestedRange)) });
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/ui/index.html#/history?tab=usage`, { waitUntil: 'domcontentloaded' });

  for (const fixture of RANGE_FIXTURES) {
    await page.getByRole('button', { name: fixture.label, exact: true }).click();
    const track = page.getByRole('img', { name: 'Daily settled turns by surface' });
    await page.waitForFunction((expectedBars) => {
      const element = document.querySelector('[role="img"][aria-label="Daily settled turns by surface"]');
      return element?.childElementCount === expectedBars;
    }, fixture.bars);
    assert.equal(await track.locator(':scope > div').count(), fixture.bars, `${fixture.key} did not render its complete bar fixture`);

    const dimensions = await track.evaluate((element) => {
      const scroller = element.parentElement;
      const root = document.documentElement;
      return {
        pageClientWidth: root.clientWidth,
        pageScrollWidth: root.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth,
        scrollerClientWidth: scroller.clientWidth,
        scrollerScrollWidth: scroller.scrollWidth,
        scrollerOverflowX: getComputedStyle(scroller).overflowX,
      };
    });
    assert.ok(dimensions.pageScrollWidth <= dimensions.pageClientWidth,
      `${fixture.key} widened page to ${dimensions.pageScrollWidth}px at a ${dimensions.pageClientWidth}px viewport`);
    assert.ok(dimensions.bodyScrollWidth <= dimensions.pageClientWidth,
      `${fixture.key} widened body to ${dimensions.bodyScrollWidth}px at a ${dimensions.pageClientWidth}px viewport`);
    assert.equal(dimensions.scrollerOverflowX, 'auto', `${fixture.key} chart does not own horizontal overflow`);
    assert.equal(dimensions.scrollerScrollWidth > dimensions.scrollerClientWidth, fixture.needsInnerScroll,
      `${fixture.key} inner scroll state did not match the fixture width`);

    const firstTitle = await track.locator(':scope > div').first().getAttribute('title');
    assert.match(firstTitle, /^2026-08-\d{2} · (chat|agent|loop): \d+$/, `${fixture.key} lost bar hover detail`);
    console.log(`ok - 390px ${fixture.key}: page ${dimensions.pageScrollWidth}/${dimensions.pageClientWidth}px, chart ${dimensions.scrollerScrollWidth}/${dimensions.scrollerClientWidth}px`);
  }
  assert.equal(await page.getByRole('img', { name: 'Daily settled turns by surface' }).getAttribute('aria-label'),
    'Daily settled turns by surface', 'activity chart aria-label changed');
  console.log('ok - activity hover titles and aria-label survive rendered layout');
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
