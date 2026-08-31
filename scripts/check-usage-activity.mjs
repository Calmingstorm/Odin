import fs from 'node:fs';

const usage = fs.readFileSync('ui/js/pages/usage.js', 'utf8');
const history = fs.readFileSync('ui/js/pages/history.js', 'utf8');
const distFiles = fs.readdirSync('ui/dist/assets').filter((name) => name.endsWith('.js'));
const dist = distFiles.map((name) => fs.readFileSync(`ui/dist/assets/${name}`, 'utf8')).join('\n');

const checks = [
  [usage.includes('Usage &amp; Activity'), 'page title'],
  [history.includes("label: 'Usage & Activity'"), 'history tab label'],
  [usage.includes('backfill_complete'), 'backfill truth'],
  [usage.includes('malformed_rows_skipped'), 'malformed-row visibility'],
  [usage.includes('provider_reported_percent'), 'token provenance coverage'],
  [usage.includes('Modeled cost is not actual spend'), 'modeled-cost honesty'],
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
];
let failed = 0;
for (const [ok, label] of checks) {
  if (!ok) { console.error(`not ok - ${label}`); failed += 1; }
  else console.log(`ok - ${label}`);
}
if (failed) process.exit(1);
console.log(`usage-activity: ${checks.length} assertions passed`);
