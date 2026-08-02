// Regression boundary for the PRODUCTION agent-detail modal state machine.
// This script imports the exact controller and polling primitive used by
// ui/js/pages/agents.js. It covers stale-response coherence plus real
// timer-driven overlap, coalescing, timeout recovery, and interval lifecycle.

import {
  createAgentAutoRefresh,
  createAgentDetailController,
  createAgentDetailState,
} from '../ui/js/agent-detail-state.js';

const defer = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

let failed = 0;
let passed = 0;
function check(name, condition, detail = '') {
  if (condition) passed++;
  else {
    failed++;
    console.log(`  FAIL  ${name} ${detail}`);
  }
}
function snapshot(state) {
  return JSON.stringify(state);
}
function assertCoherent(name, state) {
  const blank = state.detailId !== null
    && state.detail === null
    && state.detailError === null
    && !state.detailLoading;
  check(`${name}: modal never blank while open`, !blank, snapshot(state));
  check(
    `${name}: error never hides live content`,
    !(state.detailError !== null && state.detail !== null),
    snapshot(state),
  );
}
function makeController(requestDetail, options = {}) {
  const state = createAgentDetailState();
  const controller = createAgentDetailController({
    state,
    requestDetail,
    timeoutMs: 1000,
    ...options,
  });
  return { state, controller };
}

// Stale agent response cannot land after a modal switch.
{
  const a = defer();
  const b = defer();
  const { state, controller } = makeController(
    (id) => (id === 'A' ? a.promise : b.promise),
  );
  controller.open('A');
  controller.open('B');
  b.resolve({ id: 'B' });
  await tick();
  a.resolve({ id: 'A' });
  await tick();
  check('switch: stale agent response discarded', state.detail?.id === 'B');
  assertCoherent('switch', state);
}

// A manual open is allowed to supersede an earlier open for the same agent.
{
  const oldRequest = defer();
  const freshRequest = defer();
  let calls = 0;
  const { state, controller } = makeController(
    () => (++calls === 1 ? oldRequest.promise : freshRequest.promise),
  );
  controller.open('A');
  controller.open('A');
  freshRequest.resolve({ version: 'fresh' });
  await tick();
  oldRequest.resolve({ version: 'stale' });
  await tick();
  check('open: latest issued request wins', state.detail?.version === 'fresh');
  assertCoherent('open-latest-wins', state);
}

// A later successful open clears a prior visible failure atomically.
{
  const first = defer();
  const second = defer();
  let calls = 0;
  const { state, controller } = makeController(
    () => (++calls === 1 ? first.promise : second.promise),
  );
  const firstOpen = controller.open('A');
  first.reject(new Error('down'));
  await firstOpen;
  check('recovery: initial failure surfaces', state.detailError === 'down');
  const retry = controller.open('A');
  second.resolve({ version: 'recovered' });
  await retry;
  check(
    'recovery: fresh data clears stale error',
    state.detail?.version === 'recovered' && state.detailError === null,
  );
  assertCoherent('recovery', state);
}

// Exhaustively enumerate two and three superseding manual opens through the
// production controller. Refresh overlap is intentionally handled separately
// below because refresh now coalesces rather than supersedes.
function permutations(values) {
  if (values.length <= 1) return [values];
  const result = [];
  values.forEach((value, index) => {
    const rest = [...values.slice(0, index), ...values.slice(index + 1)];
    permutations(rest).forEach((permutation) => {
      result.push([value, ...permutation]);
    });
  });
  return result;
}

let enumerated = 0;
for (const count of [2, 3]) {
  for (let mask = 0; mask < (1 << count); mask++) {
    const outcomes = Array.from(
      { length: count },
      (_, index) => Boolean(mask & (1 << index)),
    );
    for (const order of permutations(
      Array.from({ length: count }, (_, index) => index),
    )) {
      const requests = Array.from({ length: count }, () => defer());
      let issued = 0;
      const { state, controller } = makeController(() => requests[issued++].promise);
      for (let index = 0; index < count; index++) controller.open('A');
      const label = `enum n=${count} outcomes=${outcomes.map((v) => (v ? 'S' : 'F')).join('')} order=${order.join('')}`;
      for (const index of order) {
        if (outcomes[index]) requests[index].resolve({ version: index });
        else requests[index].reject(new Error(`failure-${index}`));
        await tick();
        assertCoherent(`${label} after request ${index}`, state);
      }
      assertCoherent(label, state);
      // Only the latest-issued request may commit, independent of completion
      // order. Its outcome therefore determines the final visible state.
      const latest = count - 1;
      check(
        `${label}: latest issued outcome owns state`,
        outcomes[latest]
          ? state.detail?.version === latest && state.detailError === null
          : state.detail === null && state.detailError === `failure-${latest}`,
        snapshot(state),
      );
      enumerated++;
    }
  }
}
check('enumeration: all supersession interleavings covered', enumerated === 56);

// Periodic refresh is single-flight. Timer ticks during a slow initial request
// coalesce rather than superseding it, so a response slower than the cadence
// still commits and no unbounded stack of HTTP requests is created.
{
  const slow = defer();
  let calls = 0;
  const { state, controller } = makeController(() => {
    calls++;
    return slow.promise;
  });
  controller.open('A');
  const refreshA = controller.refresh();
  const refreshB = controller.refresh();
  check('single-flight: overlap issues one transport request', calls === 1);
  await tick();
  check('single-flight: request remains single after microtasks', calls === 1);
  check('single-flight: refresh callers coalesce', refreshA === refreshB);
  slow.resolve({ version: 'slow but valid' });
  await refreshA;
  check('single-flight: slow response commits', state.detail?.version === 'slow but valid');
  assertCoherent('single-flight', state);
}

// A refresh failure keeps a last-good record; without one it must render an
// error rather than leaving an empty modal.
{
  const good = defer();
  const failedRefresh = defer();
  let calls = 0;
  const { state, controller } = makeController(
    () => (++calls === 1 ? good.promise : failedRefresh.promise),
  );
  const initial = controller.open('A');
  good.resolve({ version: 'good' });
  await initial;
  const refresh = controller.refresh();
  failedRefresh.reject(new Error('blip'));
  await refresh;
  check(
    'refresh failure: keeps last good record',
    state.detail?.version === 'good' && state.detailError === null,
  );
  assertCoherent('refresh-with-fallback', state);
}
{
  const request = defer();
  const { state, controller } = makeController(() => request.promise);
  const refresh = controller.open('A');
  request.reject(new Error('no data'));
  await refresh;
  check('failure without fallback surfaces', state.detailError === 'no data');
  assertCoherent('failure-without-fallback', state);
}

// The shared API client returns null when a successful response has an empty
// or malformed JSON body. Null is not renderable detail: initial load must
// surface it, while refresh must preserve an existing last-good record.
{
  const { state, controller } = makeController(async () => null);
  await controller.open('A');
  check(
    'invalid payload: initial null surfaces',
    state.detail === null
      && state.detailError === 'Agent detail response was empty or invalid'
      && !state.detailLoading,
  );
  assertCoherent('invalid-initial-payload', state);
}
{
  let calls = 0;
  const { state, controller } = makeController(async () => (
    ++calls === 1 ? { version: 'good' } : null
  ));
  await controller.open('A');
  await controller.refresh();
  check(
    'invalid payload: refresh keeps last good record',
    state.detail?.version === 'good' && state.detailError === null,
  );
  assertCoherent('invalid-refresh-payload', state);
}

// A refresh can be the first request responsible for content (for example,
// after state restoration). Its failure must surface when no last-good record
// exists, preserving the same coherence contract as an initial open.
{
  const request = defer();
  const { state, controller } = makeController(() => request.promise);
  state.detailId = 'A';
  const refresh = controller.refresh();
  request.reject(new Error('refresh has no fallback'));
  await refresh;
  check(
    'refresh without fallback surfaces',
    state.detailError === 'refresh has no fallback' && !state.detailLoading,
  );
  assertCoherent('refresh-without-fallback', state);
}

// Close orphans the transport and late completion cannot dirty modal state.
{
  const request = defer();
  const { state, controller } = makeController(() => request.promise);
  controller.open('A');
  await tick();
  controller.close();
  request.resolve({ version: 'late' });
  await tick();
  check(
    'close: late response touches nothing',
    state.detailId === null
      && state.detail === null
      && state.detailError === null
      && !state.detailLoading,
  );
}

// Fake timeout clock: a hung request reaches a bounded failure, releases the
// single flight, and a later periodic tick can issue and commit a retry.
{
  const timers = [];
  const scheduleTimeout = (callback, delay) => {
    const timer = { callback, delay, cancelled: false };
    timers.push(timer);
    return timer;
  };
  const cancelTimeout = (timer) => { timer.cancelled = true; };
  const hung = defer();
  const recovered = defer();
  let calls = 0;
  let timeoutSignal = null;
  const { state, controller } = makeController(
    (_agentId, { signal }) => {
      timeoutSignal = signal;
      return ++calls === 1 ? hung.promise : recovered.promise;
    },
    { timeoutMs: 15000, scheduleTimeout, cancelTimeout },
  );
  const initial = controller.open('A');
  await tick();
  check('timeout: deadline is bounded', timers[0]?.delay === 15000);
  timers[0].callback();
  await initial;
  check('timeout: aborts underlying transport', timeoutSignal?.aborted === true);
  check(
    'timeout: hung initial surfaces',
    state.detailError === 'Agent detail request timed out after 15s'
      && !controller.hasInFlight(),
    snapshot(state),
  );
  const retry = controller.refresh();
  await tick();
  check('timeout: later tick starts a retry', calls === 2);
  recovered.resolve({ version: 'after timeout' });
  await retry;
  check(
    'timeout: retry commits and clears error',
    state.detail?.version === 'after timeout' && state.detailError === null,
  );
  assertCoherent('timeout-recovery', state);
}

// Drive the PRODUCTION interval callback through timer overlap. Multiple 5s
// ticks while detail is slow still issue one request, then the next tick after
// completion starts the next refresh.
{
  const intervals = [];
  const scheduleInterval = (callback, delay) => {
    const timer = { callback, delay, cancelled: false };
    intervals.push(timer);
    return timer;
  };
  const cancelInterval = (timer) => { timer.cancelled = true; };
  const first = defer();
  const second = defer();
  let detailCalls = 0;
  let listCalls = 0;
  const { state, controller } = makeController(
    () => (++detailCalls === 1 ? first.promise : second.promise),
  );
  state.detailId = 'A';
  const polling = createAgentAutoRefresh({
    isEnabled: () => true,
    refreshList: () => { listCalls++; },
    hasOpenDetail: () => state.detailId !== null,
    refreshDetail: controller.refresh,
    scheduleInterval,
    cancelInterval,
  });
  polling.start();
  check('polling: configured at 5 seconds', intervals[0]?.delay === 5000);
  intervals[0].callback();
  intervals[0].callback();
  intervals[0].callback();
  await tick();
  check('polling: every timer tick refreshes list', listCalls === 3);
  check('polling: overlapping detail ticks coalesce', detailCalls === 1);
  first.resolve({ version: 'one' });
  await tick();
  intervals[0].callback();
  await tick();
  check('polling: post-completion tick starts next flight', detailCalls === 2);
  second.resolve({ version: 'two' });
  await tick();
  check('polling: second timer result commits', state.detail?.version === 'two');
  polling.stop();
  check('polling: stop cancels interval', intervals[0].cancelled && !polling.isRunning());
  assertCoherent('timer-overlap', state);
}

// Checkbox/lifecycle contract: disabling stops the timer, re-enabling starts
// one again, including after a deactivated page had already stopped it.
{
  const intervals = [];
  let enabled = true;
  let active = true;
  const polling = createAgentAutoRefresh({
    isEnabled: () => enabled && active,
    refreshList: () => {},
    hasOpenDetail: () => false,
    refreshDetail: () => {},
    scheduleInterval: (callback, delay) => {
      const timer = { callback, delay, cancelled: false };
      intervals.push(timer);
      return timer;
    },
    cancelInterval: (timer) => { timer.cancelled = true; },
  });
  polling.sync();
  enabled = false;
  polling.sync();
  check('toggle: disabling stops interval', !polling.isRunning() && intervals[0].cancelled);
  // Deactivation is another idempotent stop. Re-enabling while inactive
  // cannot start background polling; activation starts it immediately.
  active = false;
  polling.stop();
  enabled = true;
  polling.sync();
  check('toggle: re-enable stays stopped while inactive', !polling.isRunning());
  active = true;
  polling.start();
  check(
    'toggle: activation with enabled checkbox restarts interval',
    polling.isRunning() && intervals.length === 2 && !intervals[1].cancelled,
  );
  polling.stop();
}

console.log(`modal-race: ${passed} assertions passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
