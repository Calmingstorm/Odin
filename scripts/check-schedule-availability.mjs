import assert from 'node:assert/strict';
import fs from 'node:fs';

const storage = { getItem: () => null, removeItem: () => {} };
globalThis.localStorage = storage;
globalThis.sessionStorage = storage;

const {
  availabilityFromApiError,
  normalizeScheduleAvailability,
  scheduleActionRequiresConnection,
  scheduleActionAvailable,
  scheduleAvailabilityMessage,
} = await import('../ui/js/pages/schedules.js');

const cases = [
  [{ available: true, reason: 'available', epoch: 4 }, true, ''],
  [{ available: false, reason: 'unavailable', epoch: 1 }, false, 'Scheduling is not configured.'],
  [{ available: false, reason: 'connecting', epoch: 2 }, false, 'Scheduling is connecting.'],
  [{ available: false, reason: 'disconnected', epoch: 3 }, false, 'Scheduling is disconnected.'],
  [{ available: false, reason: 'provider_error', epoch: -1 }, false, 'Scheduling status provider failed.'],
];

for (const [input, available, message] of cases) {
  const status = normalizeScheduleAvailability(input);
  assert.equal(status.available, available);
  assert.equal(scheduleAvailabilityMessage(status), message);
}

assert.deepEqual(
  availabilityFromApiError({ status: 503, data: { connection: { available: false, reason: 'disconnected', epoch: 9 } } }),
  { available: false, reason: 'disconnected', epoch: 9 },
);
assert.equal(availabilityFromApiError({ status: 500, data: {} }), null);
assert.deepEqual(normalizeScheduleAvailability(undefined), {
  available: false, reason: 'provider_error', epoch: null,
});
assert.equal(scheduleActionRequiresConnection('reminder'), true);
assert.equal(scheduleActionRequiresConnection('webhook'), false);
assert.equal(scheduleActionAvailable({ available: false }, 'reminder'), false);
assert.equal(scheduleActionAvailable({ available: false }, 'webhook'), true);
assert.equal(scheduleActionAvailable({ available: true }, 'reminder'), true);

const source = fs.readFileSync(new URL('../ui/js/pages/schedules.js', import.meta.url), 'utf8');
const uiAssertions = [
  ['webhook action is selectable', source.includes('value="webhook"')],
  ['webhook URL is editable', source.includes('v-model="form.webhook_url"')],
  ['webhook method is editable', source.includes('v-model="form.webhook_method"')],
  ['webhook headers are editable', source.includes('v-model="form.webhook_headers_str"')],
  ['webhook body is editable', source.includes('v-model="form.webhook_body"')],
  ['webhook config reaches API payload', source.includes('payload.webhook_config = webhookConfig')],
  ['run-now receives action context', source.includes('@click="doRunNow(s)"')],
  ['resume gates by action', source.includes('(s.paused && !actionAvailable(s.action))')],
];
for (const [name, passed] of uiAssertions) {
  assert.equal(passed, true, name);
}

console.log(`schedule-availability: ${cases.length + 8 + uiAssertions.length} assertions passed`);
