import { createHostAccessMutationCoordinator } from '../ui/js/host-access-state.js';

const defer = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
let passed = 0;
let failed = 0;
function check(name, condition, detail = '') {
  if (condition) passed += 1;
  else { failed += 1; console.error(`FAIL ${name}: ${detail}`); }
}
function policy(name) {
  return { allowed_hosts: [name], default_host: name, allow_all: false };
}

// A successful first PUT followed by a failed second PUT must roll back to
// what the server actually accepted, not the baseline from before both calls.
{
  const first = defer();
  const second = defer();
  let calls = 0;
  let visible = policy('D2');
  const coordinator = createHostAccessMutationCoordinator({
    applyDefault: () => (++calls === 1 ? first.promise : second.promise),
    applyUser: async () => {},
    applyDelete: async () => {},
    onDefaultRollback: (confirmed) => { visible = confirmed; },
  });
  coordinator.seed(policy('D0'), {});
  coordinator.saveDefault(policy('D1'));
  coordinator.saveDefault(policy('D2'));
  first.resolve();
  await tick();
  second.reject(new Error('denied'));
  await coordinator.whenIdle();
  check('overlap rollback uses confirmed predecessor', same(visible, policy('D1')), JSON.stringify(visible));
}

// A delete participates in the same per-user ordering protocol: an earlier
// failed PUT cannot resurrect a row after DELETE succeeds.
{
  const put = defer();
  let visible = { u1: policy('U1') };
  const coordinator = createHostAccessMutationCoordinator({
    applyDefault: async () => {},
    applyUser: () => put.promise,
    applyDelete: async () => {},
    onUserRollback: (uid, confirmed) => {
      if (confirmed) visible[uid] = confirmed;
      else delete visible[uid];
    },
    onUserDeleted: (uid) => { delete visible[uid]; },
  });
  coordinator.seed(policy('D0'), { u1: policy('U0') });
  coordinator.saveUser('u1', policy('U1'));
  coordinator.deleteUser('u1');
  put.reject(new Error('denied'));
  await coordinator.whenIdle();
  check('failed PUT cannot resurrect deleted user', !visible.u1, JSON.stringify(visible));
}

// Refresh is a linearizable read: it waits behind queued writes and discards a
// response if a write was issued while that GET was in flight.
{
  const firstGet = defer();
  const put = defer();
  let gets = 0;
  const snapshots = [firstGet.promise, Promise.resolve({ version: 'new' })];
  const coordinator = createHostAccessMutationCoordinator({
    applyDefault: () => put.promise,
    applyUser: async () => {},
    applyDelete: async () => {},
  });
  coordinator.seed(policy('D0'), {});
  const read = coordinator.readSnapshot(() => snapshots[gets++]);
  await tick();  // let the first GET start before the mutation is issued
  coordinator.saveDefault(policy('D1'));
  firstGet.resolve({ version: 'old' });
  await tick();
  put.resolve();
  const snapshot = await read;
  check('refresh discards response crossed by write', snapshot.version === 'new' && gets === 2, JSON.stringify({ snapshot, gets }));
}

// A read begun while a write is already queued starts only after that write.
{
  const put = defer();
  let getStarted = false;
  const coordinator = createHostAccessMutationCoordinator({
    applyDefault: () => put.promise,
    applyUser: async () => {},
    applyDelete: async () => {},
  });
  coordinator.seed(policy('D0'), {});
  coordinator.saveDefault(policy('D1'));
  const read = coordinator.readSnapshot(async () => {
    getStarted = true;
    return { version: 'new' };
  });
  await tick();
  check('refresh waits behind queued write', !getStarted);
  put.resolve();
  await read;
  check('refresh starts after queued write settles', getStarted);
}

console.log(`host-access-races: ${passed} assertions passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
