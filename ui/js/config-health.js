/** Shared health vocabulary for the Config Center payload and controls. */
export const HEALTH_STATES = Object.freeze([
  'applied',
  'pending_restart',
  'dormant',
  'invalid',
  'drift',
  'unknown',
]);

export const HEALTH_FILTERS = Object.freeze([
  { key: 'all', label: 'All fields', short: 'All', icon: 'grid' },
  { key: 'applied', label: 'Applied', short: 'Applied', icon: 'success' },
  { key: 'pending_restart', label: 'Pending restart', short: 'Restart', icon: 'refresh' },
  { key: 'dormant', label: 'Saved, not active', short: 'Saved only', icon: 'pause' },
  { key: 'invalid', label: 'Invalid', short: 'Invalid', icon: 'error' },
  { key: 'drift', label: 'Drift', short: 'Drift', icon: 'warning' },
  { key: 'unknown', label: 'Effective state unknown', short: 'Unknown', icon: 'info' },
]);

export function countHealthStates(fields) {
  const counts = Object.fromEntries(HEALTH_STATES.map(state => [state, 0]));
  for (const field of fields) {
    if (Object.hasOwn(counts, field.apply_state)) counts[field.apply_state] += 1;
  }
  return counts;
}
