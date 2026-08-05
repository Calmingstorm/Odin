// DST contract for the one-time schedule field.
//
// Runs across THREE zones whose clocks move by different amounts, because a
// single-zone test is exactly what let a hardcoded one-hour assumption survive:
//   America/New_York    clocks move 1 hour
//   Australia/Lord_Howe clocks move 30 minutes
//   Antarctica/Troll    clocks move 2 hours
//
// The two failures being pinned are silent ones. `new Date()` does not error on
// a time the clocks skipped — it moves it — and does not error on a time that
// happened twice — it picks one. Either way the scheduler receives an instant
// the operator never chose.

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const ZONES = ['America/New_York', 'Australia/Lord_Howe', 'Antarctica/Troll'];

let passed = 0;
let failed = 0;
function check(name, condition, detail = '') {
  if (condition) passed += 1;
  else { failed += 1; console.error(`FAIL [${process.env.TZ}] ${name}: ${detail}`); }
}

// Find this zone's spring-forward gap and autumn repeat by scanning offsets.
// Add one minute to a "YYYY-MM-DDTHH:mm" string without touching timezones.
function addWallMinute(value) {
  const [, y, mo, d, hh, mm] = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value).map(Number);
  const bumped = new Date(Date.UTC(y, mo - 1, d, hh, mm) + 60000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${bumped.getUTCFullYear()}-${pad(bumped.getUTCMonth() + 1)}-${pad(bumped.getUTCDate())}`
    + `T${pad(bumped.getUTCHours())}:${pad(bumped.getUTCMinutes())}`;
}

// Binary-search the instant where the offset changes, to the second.
function refineBoundary(lo, hi) {
  const startOffset = new Date(lo).getTimezoneOffset();
  while (hi - lo > 1000) {
    const mid = lo + Math.floor((hi - lo) / 2);
    if (new Date(mid).getTimezoneOffset() === startOffset) lo = mid;
    else hi = mid;
  }
  return hi;
}

function findTransitions() {
  const pad = (n) => String(n).padStart(2, '0');
  const wall = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    + `T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  let gap = null;
  let repeat = null;
  let prev = null;
  const start = Date.UTC(2026, 0, 1);
  const end = Date.UTC(2027, 0, 1);
  for (let t = start; t < end; t += 1800000) {
    const off = new Date(t).getTimezoneOffset();
    if (prev !== null && off !== prev) {
      // Narrow to the exact boundary: a 30-minute scan step is coarser than the
      // shift itself in some zones, and probing from the coarse edge lands on a
      // time that really exists.
      const boundary = refineBoundary(t - 1800000, t);
      const lastBefore = wall(new Date(boundary - 1000));
      if (off < prev) {
        // Clocks jumped FORWARD: the skipped range starts one wall-clock minute
        // after the last pre-transition local time. Step in WALL CLOCK terms —
        // adding to the instant would simply cross the transition.
        gap = addWallMinute(lastBefore);
      } else {
        // Clocks fell BACK: the local time just before the change repeats.
        repeat = lastBefore;
      }
    }
    prev = off;
  }
  return { gap, repeat };
}

if (process.env.SCHEDULE_TIME_WORKER !== '1') {
  // Parent: run the same assertions once per zone.
  let allOk = true;
  for (const zone of ZONES) {
    const run = spawnSync(process.execPath, [SELF], {
      env: { ...process.env, TZ: zone, SCHEDULE_TIME_WORKER: '1' },
      encoding: 'utf8',
    });
    process.stdout.write(run.stdout || '');
    process.stderr.write(run.stderr || '');
    if (run.status !== 0) allOk = false;
  }
  console.log(`schedule-time: ${allOk ? 'all zones passed' : 'FAILURES above'}`);
  process.exit(allOk ? 0 : 1);
}

// Worker: one zone, taken from TZ.
const { analyzeLocalDateTime, enforceExclusiveTiming, localWallClock } = await import('../ui/js/schedule-time.js');
const { gap, repeat } = findTransitions();

// Guard the guard: without a real transition these assertions prove nothing.
check('zone actually observes DST', gap !== null && repeat !== null,
  `gap=${gap} repeat=${repeat}`);

if (gap) {
  const result = analyzeLocalDateTime(gap);
  check('skipped local time is rejected', result.state === 'nonexistent',
    `${gap} -> ${result.state}`);
  check('and Date really would have accepted it silently',
    localWallClock(new Date(gap)) !== gap.slice(0, 16),
    `Date gave ${localWallClock(new Date(gap))}`);
}

if (repeat) {
  const result = analyzeLocalDateTime(repeat);
  check('repeated local time is flagged ambiguous', result.state === 'ambiguous',
    `${repeat} -> ${result.state}`);
  if (result.state === 'ambiguous') {
    check('both occurrences are offered', result.options.length === 2,
      `${result.options.length} option(s)`);
    check('the occurrences are distinct instants',
      result.options[0].iso !== result.options[1].iso,
      `${result.options[0].iso} / ${result.options[1].iso}`);
    check('the occurrences carry different offsets',
      result.options[0].offset !== result.options[1].offset,
      `${result.options[0].offset} / ${result.options[1].offset}`);
    check('both display as the wall clock that was typed',
      result.options.every((o) => localWallClock(o.instant) === repeat.slice(0, 16)),
      result.options.map((o) => localWallClock(o.instant)).join(' / '));
    // The gap between them is the zone's own shift — NOT assumed to be an hour.
    const deltaMinutes =
      (result.options[1].instant.getTime() - result.options[0].instant.getTime()) / 60000;
    check('the gap matches this zone, whatever its size', deltaMinutes > 0,
      `${deltaMinutes} minutes`);
  }
}

// Ordinary values must not be flagged, or the guards would cry wolf.
{
  const ok = analyzeLocalDateTime('2026-06-15T09:00');
  check('an ordinary time resolves cleanly', ok.state === 'ok', `state=${ok.state}`);
  check('empty input is its own state', analyzeLocalDateTime('').state === 'empty');
  check('malformed input is rejected', analyzeLocalDateTime('not-a-date').state === 'invalid');
  // The pattern is anchored at both ends: unanchored, a valid prefix made
  // trailing junk acceptable. datetime-local cannot emit that, but this module
  // is exported and a caller should not have to know the difference.
  check('trailing junk after a valid value is rejected',
    analyzeLocalDateTime('2026-06-15T09:00garbage').state === 'invalid',
    analyzeLocalDateTime('2026-06-15T09:00garbage').state);
  // Accepting :30 proves nothing — the truncating implementation returned 'ok'
  // too. Pin the RESULTING INSTANT, which is what was silently wrong.
  {
    const withSeconds = analyzeLocalDateTime('2026-06-15T09:00:30');
    check('a seconds component is accepted', withSeconds.state === 'ok', withSeconds.state);
    check('and the seconds actually survive',
      withSeconds.state === 'ok' && withSeconds.instant.getSeconds() === 30,
      withSeconds.state === 'ok' ? String(withSeconds.instant.getSeconds()) : withSeconds.state);
    const withoutSeconds = analyzeLocalDateTime('2026-06-15T09:00');
    check('and differ from the same time without them',
      withSeconds.state === 'ok' && withoutSeconds.state === 'ok'
        && withSeconds.iso !== withoutSeconds.iso,
      `${withSeconds.iso} vs ${withoutSeconds.iso}`);
    check('a minute value with no seconds resolves at :00',
      withoutSeconds.state === 'ok' && withoutSeconds.instant.getSeconds() === 0,
      withoutSeconds.state === 'ok' ? String(withoutSeconds.instant.getSeconds()) : '');
  }
  check('out-of-range seconds are rejected',
    analyzeLocalDateTime('2026-06-15T09:00:60').state === 'invalid',
    analyzeLocalDateTime('2026-06-15T09:00:60').state);
  check('non-numeric seconds are rejected',
    analyzeLocalDateTime('2026-06-15T09:00:ab').state === 'invalid',
    analyzeLocalDateTime('2026-06-15T09:00:ab').state);
}


// The form must never submit both modes. Exercise the same helper its input
// handlers call, rather than merely searching source text for a disabled attr.
{
  const form = { cron: '0 9 * * *', run_at: '2026-06-15T09:00:30' };
  enforceExclusiveTiming(form, 'run_at');
  check('one-time input clears cron', form.cron === '', JSON.stringify(form));
  form.cron = '0 9 * * *';
  enforceExclusiveTiming(form, 'cron');
  check('cron input clears one-time', form.run_at === '', JSON.stringify(form));

  const schedulesSource = await import('node:fs').then(fs => fs.readFileSync(
    new URL('../ui/js/pages/schedules.js', import.meta.url), 'utf8'));
  check('datetime-local offers second precision',
    /type="datetime-local"\s+step="1"/.test(schedulesSource));
  check('one-time control passes its new value to the exclusive-mode handler',
    /datetime-local[^>]+@input="onRunAtInput\(\$event\.target\.value\)"/.test(schedulesSource));
  check('cron control passes its new value to the exclusive-mode handler',
    /placeholder="e\.g\. 0 \*\/6 \* \* \*"[^>]+@input="onCronInput\(\$event\.target\.value\)"/.test(schedulesSource));
  check('create path rejects dual timing payloads defensively',
    schedulesSource.includes("Choose either Cron or One-Time, not both"));
}

console.log(`schedule-time [${process.env.TZ}]: ${passed} assertions passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
