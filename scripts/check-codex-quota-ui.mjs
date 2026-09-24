import assert from 'node:assert/strict';
import { quotaBlocks, quotaFailureVisible } from '../ui/js/codex-quota.js';

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

assert.equal(quotaFailureVisible({ quota_check_failed: 'timeout', quota: make(20).quota }), true,
  'check failure remains visible alongside an older quota snapshot');
assert.equal(quotaFailureVisible({ quota_check_failed: null, quota: make(20).quota }), false);
console.log('Codex quota UI math and labels passed');
