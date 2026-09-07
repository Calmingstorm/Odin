# Wayland R5: EOF root cause isolated, corrected-compositor release measured

2026-09-07 02:39-03:12 UTC. **The R4 EOF failure has a measured compositor cause,
not a focus/ledger workaround.** A same-options source rebuild of Ubuntu Mutter
46.2-1ubuntu0.24.04.16 reproduces the missing button release. Changing exactly one
upstream-fixed line restores genuine GTK button/key releases after last-sender
FD EOF, with the same applications alive and accepting fresh operator input.

The final corrected-compositor corpus completes **6/6**: orderly detach, actual
controller-process EOF, cancellation with queued late input, independent finite
lease expiry, actual sole-EI-owner process loss, and genuine portal Close while
held. Application exit0; outer wrapper exit70 because a new **unattributed global
sudo zombie** appeared during parallel work. All108 sampled owned process
identities and the exact private cgroup were gone; complete scans, zero census
errors. Do not relabel that outer command successful or repair another parent's
zombies to obtain a green result.

**Not production eligibility.** The stock tested compositor remains unsafe for
unattended owned-button cleanup. The corrected nested fixture is not a native
hardware compositor, general input corpus, consent/source/focus adapter or live
backend. The production-consumable refusal and integration contract is
`WAYLAND-R5-CAPABILITY-EVIDENCE.json`; `production_input_eligible` is explicitly
false. No live install, desktop, :0, host package/service, commit, push, deployment,
restart or unrelated workload was touched.

## What was read and changed

Read DECISIONS, CONTRACT, FEASIBILITY-WAYLAND-R4, all relevant R2/earlier Wayland
and X11 lifecycle/cleanup reports completely, then all existing wayland scripts.
The starting shared branch was clean at `ed5e5f2c52b243eefe9faf829bb0d11d48565294`.
Other workers' later modifications are not this evidence. Changes are restricted
to Wayland feasibility/runtime candidate scripts and new Wayland tests/docs.

New `wayland-owned-input.c` is a reusable, one-gesture, sole-EI-FD guardian, not
another fabricated remote-desktop API. It retains the original negotiated EI
devices, accepts only bounded framed input from a trusted adapter, verifies the
exact portal mapping ID and one region, tracks its own key/button before dispatch,
fences commands before release, releases before stop/device destruction, and
enforces a nonrenewable1-2000ms lease independently of controller and output I/O.
Queued late commands, malformed/oversized/NUL input, second holds and missing or
changed mappings fail closed. Release receipts mean submitted, not delivered.
Input-path loss produces unsupported/exit3; no alternate-device/Notify/global
cleanup. A production adapter still needs authority/generation/focus/clock fences.

The lab compiles `WAYLAND_FIXTURE_FAULTS` into a **separate named binary only**.
Its `F` command exits the exact guardian with `_exit(0)`, without explicit release,
closing its last EI FD. That command is absent from the ordinary binary. The
controller-EOF fixture is also a separate process; the portal parent closes its
writer copy, and the controller exits normally after independent held delivery.
No application is killed to simulate either fault. `wayland-portal.py` retains
the real portal session through ordinary guardian cleanup; portal loss is tested
as its own case rather than conflated with a lost controller.

`wayland-process-ledger.py` adds a20ms census of only the exact recorded container
cgroup and descendants, with PID/start identity and explicit error records.
Unknown inventory fails. Container cleanup waits its foreground attachment and
census, removes only the exact name/label/ID, then checks cgroup and identities.
This sampled census may miss extremely short-lived children, not exhaustive
process birth tracing. Docker `--init` provides namespace reaping.
Post-experiment safety tightening binds the census path to the daemon-returned
full64-hex Docker ID, refusing a recycled PID in any other cgroup. Four pure tests
cover systemd/cgroupfs exact paths and unrelated/noncanonical IDs. No new graphics
run is attributed to that change; retained original cgroup paths/IDs support
checking the same predicate independently.

## Root cause: source plus controlled intervention

Exact Ubuntu source, packaging patches applied:
`/home/odin/tmp/wayland-r5-source-20260907/mutter-noble`.
The source helper also fetched libei/libeis1.2.1 for read-only comparison. Relevant
Mutter46.2 paths/functions:

* `src/backends/meta-eis-client.c:138-163`, `drop_device()`: key loop finishes
  with key767 (`MAX_KEY`), then the button loop tests
  `bit_is_set(device->button_state, key)` instead of `button`. `button_state` is
 16 bytes, so this reads outside that array into adjacent key-state storage and
  does not test the pressed button. The key loop is correct; Shift release and
  missing button release are the predicted asymmetry.
* `src/backends/x11/meta-seat-x11.c`, `meta_seat_x11_create_virtual_device()`:
  the nested fixture uses `META_TYPE_VIRTUAL_INPUT_DEVICE_X11`.
* `src/backends/x11/meta-virtual-input-device-x11.c`, `notify_button()` calls
  XTestFakeButtonEvent on the backend XDisplay. This wrapper tracks scroll, not
  down buttons, and has no dispose/finalize release fallback. Destroying the EI
  wrapper does not close that backend XDisplay or release its synthetic hold.
  Genuine later portal Close cannot recover the already-lost tracker.
* The **native** virtual-input backend has `release_device_in_impl()` fallback.
  It is not the backend exercised here; no claim that the same observed bug
  necessarily reproduces on every native GNOME installation.
* `meta-eis-client.c:719-720`, `EIS_EVENT_DEVICE_CLOSED`, calls `remove_device()`
  directly, bypassing `drop_device()`. The one-line fix does **not** establish
  safe voluntary individual-device close. Guardian releases original devices
  before orderly destruction; unmeasured alternate close paths remain refused.

Upstream fix: [4ae305f19e391edda1aab0f9a9c47b01062f6330](https://github.com/GNOME/mutter/commit/4ae305f19e391edda1aab0f9a9c47b01062f6330),
"backends/eis-client: Release buttons on device remove", 2024-06-14,
[MR3809](https://gitlab.gnome.org/GNOME/mutter/-/merge_requests/3809), found by
Coverity. Source inspection finds the corrected loop in upstream46.3,46.8,47.0;
the installed Ubuntu46.2-.16 lacks it. Do not use an undifferentiated "GNOME46"
or version-only capability allowlist. A vendor backport and backend matter.

Retained original patch SHA256:
`e435e7706775646a4a6d798aa59c9ab1c8f572b275751e740f9329b287098b4a`.
Ubuntu source archive SHA256:
`009baa77f8362612caa2e18c338a1b3c8aad3b5fe2964c2fef7824d321228983`.
Ubuntu packaging archive SHA256:
`688d078edc4c5c8afb682d56216534fff37aebcf740cf4df16fcfd55387ddbfc`.
Baseline `meta-eis-client.c`:
`75386e3ff6b1aaa54e4b4b5ffb6c8f71b892947c2729e5172aec48911a411864`;
after the single apply_patch correction:
`f9dbe6171c8cd7a19995ba8766fa69d747d031f8657b9ffb96aae7c59a7b6ed8`.
Reviewable reproduction patch: `wayland-mutter-button-release.patch`. Reverse
patch preflight against corrected source passed without changing that source.

### Same-options baseline versus one-line corrected build

`wayland-mutter-build.Containerfile` builds both from the same source/package
tree, dependency layer and meson options, only the button-index line differs.
No system library was replaced on the host. Runtime library **file** hashes are
printed by the private session (not claimed as a separately sampled process-map
proof); identical clutter hash and different main Mutter hashes:

| File | SHA256 |
|---|---|
| Baseline libmutter-14.so.0.0.0 | `d3053a9618d596d5e433d6e14ef564172569058fcf11921091cfe4a3d5db18eb` |
| Fixed libmutter-14.so.0.0.0 | `3e19024a80c18e6c052c73f268f1de5565aba7c1a6efb7ad34a83c08dd058058` |
| Both libmutter-clutter-14.so.0.0.0 | `c97412e5750c3a57b4e07e56c5ef7ab1f6f3bdcdf62bc56f28729a4d8eaece1b` |

Baseline still fails: EOF receiver mask260, keys both Ctrl, button[1], including
after genuine Close. The corrected run records EOF GTK BUTTON_RELEASE0.784ms
and Shift release1.174ms after sender pre-exit monotonic log, then mask4 and
empty buttons with human Ctrl retained. Same receiver145 and gedit153 survive
and receive fresh text after Close. **This intervention, not only source
inspection or API exit0, establishes the cause for this tested stack.**

## All six graphical executions, including failures

All directories below are `/home/odin/tmp/wayland-r5-<suffix>-20260907`.
All outer logs are `/home/odin/tmp/wayland-r5-<suffix>-driver.log`.

| Suffix | Modes completed | App / outer exit | Observation |
|---|---:|---:|---|
| guardian1 |4/4|0 /0|Stock compositor, guardian ordinary/R/pipe-EOF/C/lease. This first EOF is writer closure, not a subprocess exit.|
| causal-baseline |1/2|1 /1|Orderly pass; raw sole-EIS EOF missing button release. Same-app survival does not erase failure.|
| causal-fixed1 |2/2|0 /0|Identical build plus one line: orderly and raw EOF pass.|
| guardian-fixed1 |5/5|0 /70|Adds actual controller subprocess loss and actual guardian loss. Two new unattributed global sudo zombies, owned cleanup clean.|
| guardian-fixed2 |5/6|1 /1|All first5 pass. Genuine portal revoke delivered release but libei INFO stderr interleaved with JSON and parser failed. No completed revoke/survival claim for this run.|
| guardian-fixed3 |6/6|0 /70|Separated stderr, no weakened assertion. All6 pass including portal Close while held; one new unattributed global sudo zombie.|

Fixed2 failure details: portal Close acknowledged, receiver actually got both
releases, guardian correctly exited3/unsupported after input-path withdrawal.
Parser then failed on `INFO | Disconnected by EIS` mixed into the JSONL. Kept
the failed command/evidence. Correction separated stderr into a retained file;
it did not filter/erase telemetry, send substitute release, relax masks or replace
the apps. Fixed3 verifies the complete revoke postconditions and exit semantics.

Total granted/held mode attempts25, full postconditions completed23. Two incomplete:
baseline EOF release failure and fixed2 revoke harness failure. Three fixed
guardian-loss attempts passed (including the first5 modes of fixed2); one separate
fixed raw-sender EOF passed. Do not count source-only tests as additional graphical
trials or say all six outer commands passed.

### Final6/6 application measurements

Final receiver146 and gedit154 existed before first attachment. Every mode
recorded fresh focused owned Shift_L/button1 delivery with human Control_R and
mask261, then actual owned release callbacks and mask4 while Ctrl stayed down.
Only the private operator subsequently released its Ctrl. The simulator also
generated Control_L: this is not a pristine one-physical-key or independent-seat
claim. Markers were checked fresh in the same receiver and same editor after each
Close; caret insertion need not append and no hidden click cleans a held button.

| Trigger | Shift release ms | Button1 release ms | First checked clear sample ms |
|---|---:|---:|---:|
| Guardian orderly |0.584|0.693|156.172|
| Real controller-process EOF |0.695|0.847|160.566|
| Cancel plus queued late H |0.536|0.638|198.089|
| Independent lease expiry |0.941|1.096|87.463|
| Actual sole-EI-guardian `_exit` |1.230|0.776|52.559|
| Genuine portal Session.Close while held |2.075|1.751|148.460|

Timing origin is guardian `release_begin` for first4, its pre-`_exit` log for loss,
portal parent's pre-Close trigger for revoke. Not kernel timestamps, not transport
or compositor deadlines. Lease began before dispatch; the logged held-to-trigger
delta was2002.291ms, so measured scheduling overhead is about2.3ms beyond2seconds,
not a hard real-time guarantee. All clocks are local monotonic without a time
namespace, not a calibrated source-frame clock. GDK masks are cached toolkit
state; callback evidence is independently required. No private compositor-state
query, physical-input attribution or arbitrary input proof.

## Build/test commands and evidence

From `/home/odin/odin-dev` (each build log retained in `/home/odin/tmp`):

```text
bash scripts/computer-feasibility/wayland-lab.sh prepare-operator
docker build --tag localhost/odin-wayland-mutter-baseline:r5 --build-context mutter-src=/home/odin/tmp/wayland-r5-source-20260907/mutter-noble --file scripts/computer-feasibility/wayland-mutter-build.Containerfile scripts/computer-feasibility
# Apply ONLY recorded key->button correction to the source with apply_patch.
docker build --tag localhost/odin-wayland-mutter-fixed:r5 --build-context mutter-src=/home/odin/tmp/wayland-r5-source-20260907/mutter-noble --file scripts/computer-feasibility/wayland-mutter-build.Containerfile scripts/computer-feasibility
docker build -t localhost/odin-wayland-guardian-fixed:r5 -f scripts/computer-feasibility/wayland-guardian-fixed.Containerfile scripts/computer-feasibility
bash scripts/computer-feasibility/wayland-lab.sh experiment-guardian --parent-authorized-after-contract-correction /home/odin/tmp/wayland-r5-guardian1-20260907
bash scripts/computer-feasibility/wayland-lab.sh experiment-baseline --parent-authorized-after-contract-correction /home/odin/tmp/wayland-r5-causal-baseline-20260907
bash scripts/computer-feasibility/wayland-lab.sh experiment-fixed --parent-authorized-after-contract-correction /home/odin/tmp/wayland-r5-causal-fixed1-20260907
bash scripts/computer-feasibility/wayland-lab.sh experiment-guardian-fixed --parent-authorized-after-contract-correction /home/odin/tmp/wayland-r5-guardian-fixed1-20260907
bash scripts/computer-feasibility/wayland-lab.sh experiment-guardian-fixed --parent-authorized-after-contract-correction /home/odin/tmp/wayland-r5-guardian-fixed2-20260907
bash scripts/computer-feasibility/wayland-lab.sh experiment-guardian-fixed --parent-authorized-after-contract-correction /home/odin/tmp/wayland-r5-guardian-fixed3-20260907
.venv/bin/pytest -q scripts/computer-feasibility/wayland-owned-input-test.py scripts/computer-feasibility/wayland-telemetry-test.py scripts/computer-feasibility/wayland-lab-test.py
```

First combined tests: **34 passed,28 subtests passed,11.36seconds** on current
guardian C SHA256 `d1ba5aeb7a8a621502fdcab452ac2806e2cc85e8333ddbb2ccc150c0701bfcb2`.
After the final cgroup-identity hardening, the same command plus
`scripts/computer-feasibility/wayland-census-test.py` passed **38 tests and37
subtests in11.35seconds**, followed by successful Python/shell/whitespace checks.
Post-experiment logging-only correction labels guardian-loss/revoke as
`ordered_release_submitted=false`; retained earlier logs' ambiguous
`ordered_release_only_not_toolkit_proof` field is not release evidence. No input
behavior changed or new graphical result is claimed by that correction.
Guardian fake-libei tests16 methods/38 subprocess cases; strict compile
`-std=c11 -D_DEFAULT_SOURCE -Wall -Wextra -Werror`. The fake library traces
dispatched exact KEY/BUTTON sequences and covers R/C/queued late commands,
finite unrenewed lease, EOF including partial commands, malformed/oversize/NUL,
mapping/bounds, second hold original-ledger preservation, output full/lost, and
disconnect/pause/remove unsupported status3 without fake release receipts.
Source-only fault tests do not count as toolkit proof. Three temporary mutation
sensitivity checks detected wrong-key release, missing key release and disabled
expiry against an earlier reviewed C revision; no mutation was applied to repo C.

Combined test command succeeded, but its following Python compile subcommand
initially failed because `/bin/sh` did not expand a brace path. Explicit individual
paths then passed Python compilation, shell syntax and scoped diff whitespace.
No repository full-suite, CI, live backend or production rollout test claimed.

Each evidence directory retains inspect/container IDs, raw receiver/session/
portal/consent logs, exact process/cgroup census and cleanup. `wayland-evidence.py`
produces `r5-analysis.json` and SHA256/byte `artifact-inventory.json`, never converts
API success to toolkit proof. Earlier incomplete records remain incomplete.

## Isolation, cleanup and dependency ledger

All six experiments: existing Docker `--init`, exact owned label/name, private
PID/IPC/cgroup, UID/GID1003, network none, read-only root, cap-dropALL,
no-new-privileges,1GiB memory/no extra swap, oneCPU,128PIDs,512MiB private tmp.
Only read-only harness and new private evidence binds. Private Xvfb77 simulates
operator; GNOME nested Wayland `--no-x11` controls native Wayland GTK/gedit. No
host desktop/socket/device/home/bus, no Xwayland application test. Real portal UI
consent via the private simulated operator, no permissions database bypass.
XTEST is ONLY that simulator/backend's implementation, not a product fallback.

All six runtime validate bundles passed exact containment1/1. Cleanup bundles:
guardian1 4/4; baseline3/3 (cleanup only, explicit failed lifecycle preserved);
causal-fixed1 3/3; guardian-fixed1 DEGRADED3/4; fixed2 3/3 (only5 completed trials);
fixed3 DEGRADED3/4. Qualified warnings are the global-helper assertion only.
All exact containers and cgroups absent, complete zero-error host scans, no owned
residuals. Sampled identity counts77,58,59,98,96,108 respectively. Namespace init
reaps workload; fixture shutdown is not an application-preserving detach claim:
survival/fresh input is measured **before** later disposable namespace teardown.
Final `wayland_R5_final_qualified_evidence` validation is **DEGRADED4/5**:
all six exact daemon-ID/cgroup bindings and currently absent recorded identities,
no owned labelled containers, report/refusal artifact, and six toolkit records
pass; preserved original global-helper warning fails. The read-only checker is
`wayland-evidence-check.py`. This does not upgrade any failed outer command.

Fixed1 new global sudo zombies3492801/start390279073 and3493619/start390282629;
fixed3 new global sudo3498765/start390317690. Parent3254906, outside fixture
cgroup and not inferred as owned. No sudo command was used for this work. They
were left untouched. Historical service-owned zombies also left alone. Host
zombie counts164->164 for first3,170->172 for fixed1,172->172 fixed2,172->173
fixed3. Cleanup reports cannot claim a zombie-free host.

No host packages installed. Builder image alone uses Ubuntu `apt-get build-dep
mutter` and ninja; retained build logs show dependency transactions. Source/build
directories and images intentionally retained. Runtime image changes are only
candidate binaries or source-built libraries, not service configuration. Initial
operator image `d3ff82442f0abf8d4dc78ddf430ba6988b4e01ab0c52cadda04a73f5ae96fb8e`;
final images:

| Tag | Image SHA256 |
|---|---|
| operator:r1 | `191bbe35f54d0fe3e64759dd9e0c9b71131ed1228a5a0cbb5af1a1cfc65411a9` |
| mutter-baseline:r5 | `92608f8929d94cb0c3b0d16bbafaf81048df2d4d5ff6d0ff3ab65b5e8d08067b` |
| mutter-fixed:r5 | `5fbeef561f3d61ace640ddc4fe23f4a887e4be4685f4eb3b1917e3bddb8bc5ee` |
| guardian-fixed:r5 | `7d614343f6b0ac2c879539e81e8c536a8e66e152adf09aa255c9a7a03f4901b1` |

All tags prefixed `localhost/odin-wayland-`. Reversal is exact-tag restoration,
then optional removal of only unreferenced recorded images/evidence on request;
never prune. Retained images are not deployed software.

## Production boundary and next engineering, not another mystery harness

1. Affected stock nested Mutter46.2-.16 must return
   `MUTTER_EIS_DROP_DEVICE_BUTTON_INDEX_BUG`, deny input and allow separately
   qualified capture-only. Portal consent or a successful EI socket isn't enough.
2. Ordinary controller loss can be guarded with the supplied C runtime protocol,
   but **guardian death or portal loss** still needs compositor-owned automatic
   release. A second FD copy is not a release supervisor and delays EOF. On the
   corrected fixture, genuine guardian death and genuine portal Close now have
   toolkit/same-app proof. A production target needs its own exact build/backend
   assertion and safe lifecycle corpus; never auto-upgrade from these lab hashes.
3. Handle session revocation/device removal as authority withdrawal immediately;
   guardian's exit3 is honest unsupported-path status even when the corrected
   compositor releases for it. Do not report the guardian sent those releases.
4. Voluntary EI_DEVICE_CLOSED, simultaneous human **same** key/button holds,
   arbitrary nonmodifier keys/buttons, changing regions/focus/modal/grabs and a
   real native compositor remain unmeasured. Release through another new device
   or cleaning a shared human seat is forbidden. Unknown effect cannot replay.
5. Map from portal-granted source to exact EI region via trusted adapter, preserve
   generation/consent/source revision, separate capture clock/freshness from
   GStreamer PTS, and keep topology/multi-monitor transforms explicit. No general
   Wayland observe/act implementation or production authority change occurred here.

The original EOF mystery is resolved and a usable engineering path is evidenced.
The evidence deliberately leaves unsupported boundaries explicit instead of
changing `owned_input_release` to true because a wrapper exited0.
