// Local wall-clock -> instant, with the two DST cases made explicit.
//
// `new Date('2026-03-08T02:30')` does not fail on a time that never happens —
// it silently returns 03:30. And `new Date('2026-11-01T01:30')` silently picks
// the FIRST of two real instants an hour apart, both of which display as
// 01:30. Either way the operator ends up scheduling a moment they did not
// choose, which is the whole defect this module exists to prevent.
//
// Everything here works from the host's local zone through the standard Date
// getters, so it follows whatever TZ the browser (or a test) is running in.

const PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/;

/** Render an instant as the local wall-clock string a datetime-local shows. */
export function localWallClock(instant) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${instant.getFullYear()}-${pad(instant.getMonth() + 1)}-${pad(instant.getDate())}`
    + `T${pad(instant.getHours())}:${pad(instant.getMinutes())}`;
}

/** Offset label for an instant, e.g. "UTC-4". */
export function offsetLabel(instant) {
  const minutes = -instant.getTimezoneOffset();
  const sign = minutes >= 0 ? '+' : '-';
  const abs = Math.abs(minutes);
  const hours = Math.floor(abs / 60);
  const rest = abs % 60;
  return `UTC${sign}${hours}${rest ? `:${String(rest).padStart(2, '0')}` : ''}`;
}

/**
 * Classify a `datetime-local` value.
 *
 * Returns one of:
 *   { state: 'empty' }
 *   { state: 'invalid' }
 *   { state: 'nonexistent', typed }            — clocks skipped this time
 *   { state: 'ambiguous', typed, options[] }   — this time happened twice
 *   { state: 'ok', typed, instant }
 *
 * `options` carry both real instants with their offsets, so the caller can make
 * the operator choose instead of choosing for them.
 */
export function analyzeLocalDateTime(raw) {
  const typed = String(raw || '').trim();
  if (!typed) return { state: 'empty' };
  if (!PATTERN.test(typed)) return { state: 'invalid', typed };

  const first = new Date(typed);
  if (Number.isNaN(first.getTime())) return { state: 'invalid', typed };

  // A time the clocks skipped round-trips to a DIFFERENT wall clock, because
  // Date normalized it forward into the gap's far side.
  const normalized = typed.length > 16 ? typed.slice(0, 16) : typed;
  if (localWallClock(first) !== normalized) {
    return { state: 'nonexistent', typed };
  }

  // A repeated hour has a second instant, one hour later in UTC, that displays
  // as the same wall clock.
  const second = new Date(first.getTime() + 3600000);
  if (localWallClock(second) === normalized) {
    return {
      state: 'ambiguous',
      typed,
      options: [
        { instant: first, offset: offsetLabel(first), iso: first.toISOString() },
        { instant: second, offset: offsetLabel(second), iso: second.toISOString() },
      ],
    };
  }

  return { state: 'ok', typed, instant: first, iso: first.toISOString() };
}
