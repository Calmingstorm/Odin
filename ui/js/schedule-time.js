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

// Anchored at BOTH ends: unanchored, "2026-04-01T09:00garbage" parsed as a
// valid value. A native datetime-local cannot produce that, but this module is
// exported and a future caller has no reason to expect the looseness.
const PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

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
  const match = PATTERN.exec(typed);
  if (!match) return { state: 'invalid', typed };

  const [, y, mo, d, hh, mm] = match.slice(0, 6).map(Number);
  const normalized = typed.slice(0, 16);

  // Treat the typed components as if they were UTC, then subtract the zone's
  // offset to get a candidate instant. The offset differs on either side of a
  // transition, so probe BOTH sides rather than assuming how far the clocks
  // move: real zones shift by 30 minutes (Australia/Lord_Howe) and two hours
  // (Antarctica/Troll), not only one.
  const asIfUTC = Date.UTC(y, mo - 1, d, hh, mm);
  const dayBefore = new Date(asIfUTC - 86400000).getTimezoneOffset();
  const dayAfter = new Date(asIfUTC + 86400000).getTimezoneOffset();

  const candidates = [];
  for (const offsetMinutes of new Set([dayBefore, dayAfter])) {
    const instant = new Date(asIfUTC + offsetMinutes * 60000);
    // Keep only instants that really display as the wall clock that was typed.
    if (localWallClock(instant) !== normalized) continue;
    if (candidates.some((c) => c.getTime() === instant.getTime())) continue;
    candidates.push(instant);
  }
  candidates.sort((a, b) => a.getTime() - b.getTime());

  // No instant displays this wall clock: the clocks skipped it.
  if (candidates.length === 0) return { state: 'nonexistent', typed };

  // More than one: the wall clock happened more than once.
  if (candidates.length > 1) {
    return {
      state: 'ambiguous',
      typed,
      options: candidates.map((instant) => ({
        instant,
        offset: offsetLabel(instant),
        iso: instant.toISOString(),
      })),
    };
  }

  const instant = candidates[0];
  return { state: 'ok', typed, instant, iso: instant.toISOString() };
}
