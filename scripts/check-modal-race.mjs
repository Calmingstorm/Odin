// Guard for the agent-detail modal's async-response class (PR #247, review
// rounds 1-3): a superseded response must never touch modal state — not
// data, not error, not loading — and fresh data must always clear a stale
// error. The transcription below mirrors loadDetail() in
// ui/js/pages/agents.js; if that primitive changes shape, update it here and
// keep every interleaving passing. Runs in `npm run check`.
// Faithful transcription of the loadDetail primitive from agents.js, driven
// through every interleaving raised across review rounds 1-3.
function makeModal(apiGet) {
  const S = { detail: null, error: null, loading: false, id: null, copied: '' };
  let activeRequest = null;

  async function loadDetail(agentId, { initial }) {
    const token = {};
    activeRequest = token;
    if (initial) { S.detail = null; S.error = null; S.loading = true; }
    let data = null, failure = null;
    try { data = await apiGet(agentId); } catch (e) { failure = e; }
    if (activeRequest !== token) return;
    activeRequest = null;
    if (failure) { if (initial) S.error = failure.message; }
    else { S.detail = data; S.error = null; }
    S.loading = false;
  }
  return {
    S,
    open: (id) => { S.id = id; S.copied = ''; return loadDetail(id, { initial: true }); },
    refresh: () => S.id ? loadDetail(S.id, { initial: false }) : Promise.resolve(),
    close: () => { activeRequest = null; S.id = null; S.detail = null; S.error = null; S.loading = false; },
  };
}
const defer = () => { let r, j; const p = new Promise((res, rej) => { r = res; j = rej; }); return { p, r, j }; };
let fail = 0, pass = 0;
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name} ${detail}`); }
};

// R1: open A, close, open B — A's slow response must not land under B
{
  const dA = defer(), dB = defer();
  const m = makeModal(id => id === 'A' ? dA.p : dB.p);
  m.open('A'); m.close(); m.open('B');
  dB.r({ id: 'B' }); await dB.p.catch(() => {});
  dA.r({ id: 'A' }); await new Promise(r => setTimeout(r, 0));
  check('R1 stale agent response discarded', m.S.detail?.id === 'B', JSON.stringify(m.S.detail));
}
// R2: same agent, slow initial + fast refresh — newest must win
{
  const dInit = defer(), dRef = defer();
  let n = 0;
  const m = makeModal(() => (++n === 1 ? dInit.p : dRef.p));
  m.open('A'); m.refresh();
  dRef.r({ v: 'fresh' }); await new Promise(r => setTimeout(r, 0));
  dInit.r({ v: 'stale' }); await new Promise(r => setTimeout(r, 0));
  check('R2 slow initial cannot overwrite newer refresh', m.S.detail?.v === 'fresh', JSON.stringify(m.S.detail));
}
// R3a: older FAILED request must not leave an error over newer good data
{
  const dInit = defer(), dRef = defer();
  let n = 0;
  const m = makeModal(() => (++n === 1 ? dInit.p : dRef.p));
  m.open('A'); m.refresh();
  dRef.r({ v: 'fresh' }); await new Promise(r => setTimeout(r, 0));
  dInit.j(new Error('boom')); await new Promise(r => setTimeout(r, 0));
  check('R3a superseded failure cannot set error', m.S.error === null, `error=${m.S.error}`);
  check('R3a fresh data retained', m.S.detail?.v === 'fresh');
}
// R3b: genuine initial failure THEN successful refresh clears the error
{
  const dInit = defer(), dRef = defer();
  let n = 0;
  const m = makeModal(() => (++n === 1 ? dInit.p : dRef.p));
  const openP = m.open('A');
  dInit.j(new Error('down')); await openP;
  check('R3b initial failure shows error', m.S.error === 'down');
  const refP = m.refresh();
  dRef.r({ v: 'recovered' }); await refP;
  check('R3b later success clears stale error', m.S.error === null, `error=${m.S.error}`);
  check('R3b loading settled', m.S.loading === false);
}
// Refresh failure must keep the last good record (intended behavior)
{
  const dInit = defer(), dRef = defer();
  let n = 0;
  const m = makeModal(() => (++n === 1 ? dInit.p : dRef.p));
  const openP = m.open('A');
  dInit.r({ v: 'good' }); await openP;
  const refP = m.refresh();
  dRef.j(new Error('blip')); await refP;
  check('refresh failure keeps last good record', m.S.detail?.v === 'good' && m.S.error === null);
}
// Close during flight leaves modal fully clean
{
  const d = defer();
  const m = makeModal(() => d.p);
  m.open('A'); m.close();
  d.r({ v: 'late' }); await new Promise(r => setTimeout(r, 0));
  check('close orphans in-flight request', m.S.detail === null && m.S.loading === false && m.S.id === null);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
