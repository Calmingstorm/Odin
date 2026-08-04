import assert from 'node:assert/strict';
import {
  HEALTH_FILTERS,
  HEALTH_STATES,
  countHealthStates,
} from '../ui/js/config-health.js';

const filterStates = HEALTH_FILTERS.filter(filter => filter.key !== 'all').map(filter => filter.key);
assert.deepEqual(filterStates, HEALTH_STATES, 'every server health state must have a page filter');

const fields = HEALTH_STATES.map(apply_state => ({ apply_state }));
const counts = countHealthStates(fields);
assert.deepEqual(Object.keys(counts), HEALTH_STATES, 'payload and page count vocabularies drifted');
assert.equal(counts.unknown, 1, 'unknown effective state disappeared from the health total');
assert.equal(Object.values(counts).reduce((total, count) => total + count, 0), fields.length);

console.log(`config-health: ${HEALTH_STATES.length} states, ${HEALTH_FILTERS.length} filters`);
