// DST contract for the one-time schedule field.
//
// Runs under a DST-observing zone (America/New_York) because the two failure
// modes only exist there: a spring-forward time that never happens, and a
// fall-back time that happens twice. `new Date()` reports neither — it
// normalizes the first and silently picks one of the second — so without these
// assertions the UI hands the scheduler an instant the operator never chose.

process.env.TZ = 'America/New_York';

const { analyzeLocalDateTime, localWallClock } = await import('../ui/js/schedule-time.js');

let passed = 0;
let failed = 0;
function check(name, condition, detail = '') {
  if (condition) passed += 1;
  else { failed += 1; console.error(`FAIL ${name}: ${detail}`); }
}

// Guard the guard: if the host ignored TZ, these contracts prove nothing.
{
  const january = new Date('2026-01-15T12:00');
  const july = new Date('2026-07-15T12:00');
  check('harness runs in a DST-observing zone',
    january.getTimezoneOffset() !== july.getTimezoneOffset(),
    `offsets ${january.getTimezoneOffset()} / ${july.getTimezoneOffset()}`);
}

// Spring forward: 02:00 -> 03:00, so 02:30 never happens.
{
  const result = analyzeLocalDateTime('2026-03-08T02:30');
  check('skipped local time is rejected', result.state === 'nonexistent',
    `state=${result.state}`);
  // The bug being prevented: Date quietly moves it to 03:30.
  check('and Date really would have moved it',
    localWallClock(new Date('2026-03-08T02:30')) === '2026-03-08T03:30',
    localWallClock(new Date('2026-03-08T02:30')));
}

// Fall back: 01:00-02:00 runs twice, so 01:30 is two distinct instants.
{
  const result = analyzeLocalDateTime('2026-11-01T01:30');
  check('repeated local time is flagged ambiguous', result.state === 'ambiguous',
    `state=${result.state}`);
  if (result.state === 'ambiguous') {
    check('both occurrences are offered', result.options.length === 2,
      `${result.options.length} option(s)`);
    check('the occurrences are an hour apart',
      result.options[1].instant.getTime() - result.options[0].instant.getTime() === 3600000,
      `${result.options[0].iso} / ${result.options[1].iso}`);
    check('the occurrences carry different offsets',
      result.options[0].offset !== result.options[1].offset,
      `${result.options[0].offset} / ${result.options[1].offset}`);
    check('both display as the time that was typed',
      result.options.every(o => localWallClock(o.instant) === '2026-11-01T01:30'),
      result.options.map(o => localWallClock(o.instant)).join(' / '));
  }
}

// Ordinary times stay ordinary — the guards must not cry wolf.
{
  const result = analyzeLocalDateTime('2026-04-01T09:00');
  check('an unambiguous time resolves cleanly', result.state === 'ok', `state=${result.state}`);
  check('and round-trips to what was typed',
    result.state === 'ok' && localWallClock(result.instant) === '2026-04-01T09:00',
    result.state === 'ok' ? localWallClock(result.instant) : '');
}

// The hour AFTER a fall-back repeat is not itself ambiguous.
{
  const result = analyzeLocalDateTime('2026-11-01T03:30');
  check('a normal hour near the transition is not flagged', result.state === 'ok',
    `state=${result.state}`);
}

// Empty and malformed input are distinguishable, not silently "ok".
{
  check('empty input is its own state', analyzeLocalDateTime('').state === 'empty');
  check('malformed input is rejected', analyzeLocalDateTime('not-a-date').state === 'invalid');
}

console.log(`schedule-time: ${passed} assertions passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
