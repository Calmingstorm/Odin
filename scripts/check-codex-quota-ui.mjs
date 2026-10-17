import assert from 'node:assert/strict';
import { quotaBlocks, quotaFailureVisible, quotaLimitWithoutWindows } from '../ui/js/codex-quota.js';

const make = (used, resets_at = 1) => ({ quota: { primary: { used_percent: used, window_minutes: 300, resets_at } } });
const formatDate = (value) => `date-${value}`;
const almost = quotaBlocks(make(99.5, 1234), formatDate)[0];
assert.equal(almost.remaining, 1, 'remaining percentage is rounded from 100 - used');
assert.equal(almost.statusLabel, '', '99.5% usage is not a reached limit');
assert.equal(almost.limitReached, false);

const full = quotaBlocks(make(100, 1234), formatDate)[0];
assert.equal(full.remaining, 0);
assert.equal(full.resetLabel, 'date-1234');
assert.equal(full.statusLabel, 'Limit reached');
assert.equal(full.limitReached, true);
assert.equal(quotaBlocks(make(135))[0].statusLabel, 'Limit reached');
assert.equal(quotaBlocks(make(135))[0].remaining, 0);
assert.equal(quotaBlocks(make(0))[0].remaining, 100);
assert.equal(quotaBlocks(make(50))[0].label, '5-hour usage limit');
assert.equal(quotaBlocks({ quota: { secondary: { window_minutes: 0, used_percent: 0, resets_at: 0 } } }).length, 0,
  'zero-minute secondary placeholder is not displayed');
assert.equal(quotaBlocks({ quota: { secondary: { used_percent: 0, resets_at: 0 } } }).length, 0,
  'window without a duration is not displayed');

assert.equal(quotaFailureVisible({ quota_check_failed: 'timeout', quota: make(20).quota }), true,
  'check failure remains visible alongside an older quota snapshot');
assert.equal(quotaFailureVisible({ quota_check_failed: null, quota: make(20).quota }), false);
const named = {
  limited_windows: ['secondary'],
  quota: {
    primary: { used_percent: 20, window_minutes: 300, resets_at: 10 },
    secondary: { used_percent: 40, window_minutes: 10080, resets_at: 20 },
  },
};
const [primaryBlock, secondaryBlock] = quotaBlocks(named, formatDate);
assert.equal(secondaryBlock.limitReached, true, 'a window named as reached shows its limit below 100%');
assert.equal(secondaryBlock.statusLabel, 'Limit reached');
assert.equal(secondaryBlock.remaining, 60, 'the reported percentage is still shown');
assert.equal(primaryBlock.limitReached, false, 'the other window is not inferred exhausted');
assert.equal(quotaLimitWithoutWindows({ limit_reached: true, quota: { limit_reached_type: 'primary' } }), true,
  'a limit signal with no window still shows the limit');
assert.equal(quotaLimitWithoutWindows({ limit_reached: true, quota: make(100).quota }), false,
  'a window already shows the limit');
assert.equal(quotaLimitWithoutWindows({ limit_reached: false, quota: null }), false);
console.log('Codex quota UI math and labels passed');
