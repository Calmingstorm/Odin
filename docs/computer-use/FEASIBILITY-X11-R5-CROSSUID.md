# R5 cross-UID runtime_sudo acceptance

**Private cross-UID acceptance passed; no real desktop was accessed by this agent.**
Root controller invokes actual `/usr/bin/sudo -n -- /usr/bin/env -i` fixed worker
paths with GTK/Xed running as uid65534. Private sudo policy forces a distinct
monitor wrapper (15s command timeout), rather than mistaking exec-in-place for
wrapper-death coverage. Root controller rather than unprivileged-to-root sudo is
an explicit fixture limitation. Real installed sudo, root workers, cross-UID proc
inspection and XRes/app validation run unchanged. Only namespace-local `/etc`
has fixture sudoers/PAM policy. No host configuration, live services, graphical
sessions, `/opt/odin`, desktop sockets, app-scope or native-device code changed.

## Runtime artifacts

`x11_attached.py`, `x11_attached_worker.py`, `x11_guardian.py` and new
`x11_worker_lifecycle.py` implement:

* Root capture/guardian announces its own PID/start ticks before an operation.
  Controller verifies root UID, live identity and ancestry through sudo, then
  synchronously persists it. Launch-pending stays true through unrecorded
  descendants. Guardian announces injector identity; controller persists it
  BEFORE sending matching ACK. No injector dispatch before ACK.
* Guardian TERM/HUP/INT and Linux parent-death signal revoke rather than kill its
  release path. Existing nonrenewable2s lease and caller EOF/cancel fence/reap the
  exact injector, then release ledger-owned synthetic input. Injector has an
  independent parent-death SIGKILL and4s alarm, including idle socket waits.
  Launch gates have independent2s deadlines. Capture retains its5s alarm.
* Capture cleanup closes its pipe and waits its deadline, never assumes killing
  sudo cleaned root descendants. Exact announced identities must disappear,
  including zombies; missing identity/release evidence quarantines. Receipt read
  after wrapper exit is bounded even if descendants hold stdout open. No
  supervisor kill while holding input, no broad process cleanup.
* Sudo-mode `input_supported` starts false until successful worker handshake/start.
  Public `input_limits` describes printable ASCII/existing keymap, shared cursor
  and uncertain same-key overlap. Interpreted Drawing remains denied; Xed is the
  actual attached-input application in this acceptance.

## Final actual evidence

`/tmp/crossuid-r5-5.log`, wrapper exit0, SHA256
`61876d9aef80d3c0845614d988d178b649d3b06ab59ed68022b6c7a325a3005b`.
Unit `odin-xi2-feasibility-89734d760b1749bb987d621f1202917e.service`.

* **5/5 held-Control/button1 trials**: complete, caller EOF, cancel,2s lease,
  exact sudo-wrapper SIGKILL ONLY AFTER successful release receipt. Same GTK
  process survives; toolkit release telemetry and fresh simulated-human text are
  required; both held-state sets empty. Exact guardian/injector identities absent
  before each pass. Respective release latencies18.345,34.107,17.829,17.792,17.974ms.
* **1/1 withheld ACK**: no input, helper and guardian gone, app preserved.
* **2/2 capture launch cancellation/timeout**: no operation sent, root worker gone,
  capture-only recovery verifies exact absence.
* **5/5 PRODUCT Xed actions**: click, ASCII type, polyline, ctrl+a, BackSpace.
  Typing has different independent raster hashes. Same Xed survives detach and
  empty scratch document subsequently closes normally. No device changes.
* Input-enabled recovery returns unknown/release-unproven even after exact worker
  absence. Intentional conservative crash recovery, not a false clean receipt.
* **71 host PID/start identities** independently rechecked gone/reused, no zombies
  or survivors, no census errors, exact unit inactive/not-found, cgroup absent.
  Host20ms census is sampled, not a birth trace. Exact root/helper identities are
  additionally collected through synchronous per-action launch handshakes.

`validate_action` bundle `crossuid_r5_private_release_and_exact_absence`: **4/4**,
actual evidence/absence replay, **125 focused tests**, owned-runtime ruff and
git diff-check, and four runtime imports. Parent owns final aggregate type/suite
gates and integration enablement. No full-suite/type-clean claim here.

Reproduce `x11-run.py --execute-isolated --crossuid-guardian`; replay the retained
log through `x11-crossuid-evidence-check.py`. Attempts1/2 failed pre-input on
missing fixture CAP_KILL/PAM account validation. Attempt3 passed exec-in-place
but was not accepted as distinct-wrapper evidence. Attempt4 forced a real
monitor and passed5+5; attempt5 added withheld ACK/capture gates. All exact fixture
cgroups were cleaned and host process ledgers reported no survivors.

## Limits

This proves private root-worker/cross-UID lifecycle, not Aaron's unprivileged sudo
PAM policy, physical hardware overlap, real desktop acceptance, server-hang
recovery or saved-document semantics. Blocked native supervisor or externally
killed guardian cannot prove release; quarantine remains mandatory. Parent owns
any separately authorized real-session acceptance. No commits/push/deploy.
