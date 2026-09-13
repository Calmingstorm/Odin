import assert from 'node:assert/strict';

const storage = { getItem: () => null, removeItem: () => {} };
globalThis.localStorage = storage;
globalThis.sessionStorage = storage;

const {
  availabilityFromApiError,
  normalizeScheduleAvailability,
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

console.log(`schedule-availability: ${cases.length + 3} behavioral assertions passed`);
