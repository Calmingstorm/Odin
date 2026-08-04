// Host-access mutation ordering and last-confirmed-server state.
//
// Security policy edits are rare, but correctness matters more than throughput:
// serialize the single resource's writes so HTTP completion order cannot make
// the browser disagree with the server. Every successful operation advances
// the confirmed baseline, even when a newer UI edit already exists; only the
// latest generation is allowed to publish or roll back visible state.

const clone = (value) => value == null
  ? value
  : JSON.parse(JSON.stringify(value));

export function createHostAccessMutationCoordinator({
  applyDefault,
  applyUser,
  applyDelete,
  onDefaultConfirmed = () => {},
  onDefaultRollback = () => {},
  onUserConfirmed = () => {},
  onUserRollback = () => {},
  onUserDeleted = () => {},
  onError = () => {},
}) {
  let queue = Promise.resolve();
  let revision = 0;
  let defaultGeneration = 0;
  const userGenerations = new Map();
  let serverDefault = null;
  const serverUsers = new Map();

  function enqueue(operation) {
    revision += 1;
    const run = queue.then(operation, operation);
    // Keep the queue usable even if a future operation accidentally throws
    // outside its own guarded request path.
    queue = run.catch(() => {});
    return run;
  }

  function seed(defaultPolicy, users) {
    serverDefault = clone(defaultPolicy);
    serverUsers.clear();
    for (const [uid, entry] of Object.entries(users || {})) {
      serverUsers.set(uid, clone(entry));
    }
  }

  function saveDefault(attempted) {
    const desired = clone(attempted);
    const generation = ++defaultGeneration;
    return enqueue(async () => {
      try {
        await applyDefault(clone(desired));
        // This request really committed at the server. Record that fact even
        // if the UI has since issued another generation.
        serverDefault = clone(desired);
        if (generation === defaultGeneration) {
          onDefaultConfirmed(clone(desired));
        }
      } catch (error) {
        if (generation === defaultGeneration) {
          onDefaultRollback(clone(serverDefault));
          onError(error, { kind: 'default' });
        }
      }
    });
  }

  function saveUser(uid, attempted) {
    const desired = clone(attempted);
    const generation = (userGenerations.get(uid) || 0) + 1;
    userGenerations.set(uid, generation);
    return enqueue(async () => {
      try {
        await applyUser(uid, clone(desired));
        serverUsers.set(uid, clone(desired));
        if (generation === userGenerations.get(uid)) {
          onUserConfirmed(uid, clone(desired));
        }
      } catch (error) {
        if (generation === userGenerations.get(uid)) {
          onUserRollback(uid, clone(serverUsers.get(uid) ?? null));
          onError(error, { kind: 'user', uid });
        }
      }
    });
  }

  function deleteUser(uid) {
    const generation = (userGenerations.get(uid) || 0) + 1;
    userGenerations.set(uid, generation);
    return enqueue(async () => {
      try {
        await applyDelete(uid);
        serverUsers.delete(uid);
        if (generation === userGenerations.get(uid)) {
          onUserDeleted(uid);
        }
      } catch (error) {
        if (generation === userGenerations.get(uid)) {
          onUserRollback(uid, clone(serverUsers.get(uid) ?? null));
          onError(error, { kind: 'delete', uid });
        }
      }
    });
  }

  async function whenIdle() {
    // A write may be appended while an earlier queue snapshot is settling.
    // Wait until the queue reference itself stays stable across an await.
    while (true) {
      const pending = queue;
      await pending;
      if (pending === queue) return revision;
    }
  }

  async function readSnapshot(fetchSnapshot) {
    // Do not start a GET behind an already queued mutation. If a mutation is
    // issued while the GET is in flight, discard that response and refetch
    // after the queue settles. This makes a refresh a linearizable read of the
    // same resource rather than another out-of-order writer.
    while (true) {
      const before = await whenIdle();
      const snapshot = await fetchSnapshot();
      if (before === revision) return snapshot;
    }
  }

  return {
    seed,
    saveDefault,
    saveUser,
    deleteUser,
    whenIdle,
    readSnapshot,
    get revision() { return revision; },
  };
}
