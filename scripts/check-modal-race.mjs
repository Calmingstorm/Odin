// Guard for the agent-detail modal's async-response class (PR #247, review
// rounds 1-4). Two layers:
//
//   1. Named regressions — one per defect an actual review round found, so
//      each stays pinned with its story.
//   2. EXHAUSTIVE enumeration — every interleaving of up to three concurrent
//      requests (outcomes x resolution orders) checked against the modal's
//      coherence invariant. Rounds 1-3 each added one hand-picked case and
//      round 4 still found an ordering nobody had written down; enumerating
//      the space is what actually closes that class.
//
// THE INVARIANT: while the modal is open it must never present nothing at
// all — no content, no error, and not loading — because the operator then
// sees an empty box with no indication that anything is wrong or pending.
//
// The primitive below mirrors loadDetail() in ui/js/pages/agents.js; if that
// changes shape, update this transcription and keep every case passing.
// Runs in `npm run check`.

function makeModal(apiGet) {
  const S = { detail: null, error: null, loading: false, id: null, copied: '' };
  let activeRequest = null;

  async function loadDetail(agentId, { initial }) {
    const token = {};
    activeRequest = token;
    if (initial) { S.detail = null; S.error = null; S.loading = true; }
    let data = null, failure = null;
    try { data = await apiGet(agentId); } catch (e) { failure = e; }
    if (activeRequest !== token) return;       // superseded — touch nothing
    activeRequest = null;
    if (failure) {
      // Fall back to the last good record only when there IS one.
      if (S.detail === null) S.error = failure.message;
    } else {
      S.detail = data;
      S.error = null;
    }
    S.loading = false;
  }
  return {
    S,
    open: (id) => { S.id = id; S.copied = ''; return loadDetail(id, { initial: true }); },
    refresh: () => (S.id ? loadDetail(S.id, { initial: false }) : Promise.resolve()),
    close: () => { activeRequest = null; S.id = null; S.detail = null; S.error = null; S.loading = false; },
  };
}

const defer = () => { let r, j; const p = new Promise((res, rej) => { r = res; j = rej; }); return { p, r, j }; };
const tick = () => new Promise((r) => setTimeout(r, 0));

let fail = 0, pass = 0;
const check = (name, cond, detail = '') => {
  if (cond) { pass++; } else { fail++; console.log(`  FAIL  ${name} ${detail}`); }
};

// The coherence invariant, asserted after every scenario.
function assertCoherent(name, S) {
  const blank = S.id !== null && S.detail === null && S.error === null && !S.loading;
  check(`${name}: modal never blank while open`, !blank, JSON.stringify(S));
}

// --- Layer 1: named regressions -------------------------------------------
{ // Round 1 — stale AGENT response must not land under a different agent
  const dA = defer(), dB = defer();
  const m = makeModal((id) => (id === 'A' ? dA.p : dB.p));
  m.open('A'); m.close(); m.open('B');
  dB.r({ id: 'B' }); await tick();
  dA.r({ id: 'A' }); await tick();
  check('R1 stale agent response discarded', m.S.detail?.id === 'B');
  assertCoherent('R1', m.S);
}
{ // Round 2 — same agent: a slow initial must not overwrite a newer refresh
  const dInit = defer(), dRef = defer(); let n = 0;
  const m = makeModal(() => (++n === 1 ? dInit.p : dRef.p));
  m.open('A'); m.refresh();
  dRef.r({ v: 'fresh' }); await tick();
  dInit.r({ v: 'stale' }); await tick();
  check('R2 slow initial cannot overwrite newer refresh', m.S.detail?.v === 'fresh');
  assertCoherent('R2', m.S);
}
{ // Round 3 — an initial failure must not persist over a newer success
  const dInit = defer(), dRef = defer(); let n = 0;
  const m = makeModal(() => (++n === 1 ? dInit.p : dRef.p));
  const openP = m.open('A');
  dInit.j(new Error('down')); await openP;
  check('R3 initial failure surfaces', m.S.error === 'down');
  const refP = m.refresh();
  dRef.r({ v: 'recovered' }); await refP;
  check('R3 later success clears stale error', m.S.error === null && m.S.detail?.v === 'recovered');
  assertCoherent('R3', m.S);
}
{ // Round 4 — refresh supersedes an in-flight initial, then FAILS with no
  // last-good record; the initial's success is correctly discarded. The
  // modal used to end up entirely blank.
  const dInit = defer(), dRef = defer(); let n = 0;
  const m = makeModal(() => (++n === 1 ? dInit.p : dRef.p));
  m.open('A'); m.refresh();
  dRef.j(new Error('refresh failed')); await tick();
  dInit.r({ v: 'too late' }); await tick();
  check('R4 refresh failure with no fallback surfaces an error', m.S.error !== null, JSON.stringify(m.S));
  assertCoherent('R4', m.S);
}
{ // Refresh failure WITH a last-good record still keeps it (intended)
  const dInit = defer(), dRef = defer(); let n = 0;
  const m = makeModal(() => (++n === 1 ? dInit.p : dRef.p));
  const openP = m.open('A');
  dInit.r({ v: 'good' }); await openP;
  const refP = m.refresh();
  dRef.j(new Error('blip')); await refP;
  check('refresh failure keeps last good record', m.S.detail?.v === 'good' && m.S.error === null);
  assertCoherent('refresh-failure-with-fallback', m.S);
}
{ // Close during flight leaves the modal fully clean
  const d = defer();
  const m = makeModal(() => d.p);
  m.open('A'); m.close();
  d.r({ v: 'late' }); await tick();
  check('close orphans in-flight request',
    m.S.detail === null && !m.S.loading && m.S.id === null);
}

// --- Layer 2: exhaustive interleavings ------------------------------------
// Every combination of: request count (2-3), each request's outcome
// (success | failure), and every resolution ORDER of those requests.
function permutations(xs) {
  if (xs.length <= 1) return [xs];
  const out = [];
  xs.forEach((x, i) => {
    const rest = [...xs.slice(0, i), ...xs.slice(i + 1)];
    permutations(rest).forEach((p) => out.push([x, ...p]));
  });
  return out;
}

let enumerated = 0;
for (const count of [2, 3]) {
  const outcomeSets = [];
  for (let mask = 0; mask < (1 << count); mask++) {
    outcomeSets.push(Array.from({ length: count }, (_, i) => Boolean(mask & (1 << i))));
  }
  for (const outcomes of outcomeSets) {
    for (const order of permutations(Array.from({ length: count }, (_, i) => i))) {
      const defs = Array.from({ length: count }, () => defer());
      let issued = 0;
      const m = makeModal(() => defs[issued++].p);
      m.open('A');                                   // request 0 = initial
      for (let i = 1; i < count; i++) m.refresh();   // the rest = refreshes
      for (const idx of order) {
        if (outcomes[idx]) defs[idx].r({ v: `d${idx}` });
        else defs[idx].j(new Error(`e${idx}`));
        await tick();
      }
      await tick();
      enumerated++;
      const label = `enum n=${count} outcomes=${outcomes.map((o) => (o ? 'S' : 'F')).join('')} order=${order.join('')}`;
      assertCoherent(label, m.S);
      // A modal showing an error must not also be showing content: the
      // template prioritises the error, so that combination hides live data.
      check(`${label}: no error over content`,
        !(m.S.error !== null && m.S.detail !== null), JSON.stringify(m.S));
    }
  }
}

console.log(`modal-race: ${pass} assertions passed, ${fail} failed (${enumerated} enumerated interleavings)`);
process.exit(fail ? 1 : 0);
