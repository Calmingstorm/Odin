# Wayland lifecycle feasibility — R2 requirements, R3 continuation

Latest status is the superseding single corrected experiment below: orderly
release plus same-application survival measured; EOF coverage still incomplete.
The earlier three failures remain part of the evidence record.

2026-09-07 00:49–01:00 UTC. **BLOCKED / incomplete.** Real consent,
PipeWire frames and libei negotiation reran successfully, but owned-input release
and full application-survival postconditions are NOT proven. Three bounded
executions, two corrective batches after the first failure, then stopped.
No product backend, eligibility, independence or Stage 6 pass is claimed.

## Scope and isolation

Read DECISIONS R2/R3, FEASIBILITY-WAYLAND.md and CLEANUP-R2.md, plus every existing
wayland* script before editing/running. Existing branch `feat/isolated-computer-use`.
Only owned wayland* scripts and this report changed by this agent. Unrelated
pre-existing modifications were left alone. Partial scripts were inherited, not
assumed tested. No commit, deploy, restart, merge, pipeline or live desktop access.

Docker only, no Podman invocation. Existing rootful daemon; UID/GID1003, --init,
foreground attachment waited by the shell, exact unique name plus ownership
label. Private PID/IPC/cgroup namespaces, network none, cap-drop ALL,
no-new-privileges, read-only root, 1GiB memory/no extra swap, one CPU,128 processes,
private512MiB /tmp. Only read-only harness and new UID1003-owned evidence bind.
No host devices, home, bus or desktop sockets. Private Xvfb :77 simulates the
operator; GNOME uses --wayland --nested --no-x11, private system/session buses.
Never :0. Genuine portal ConnectToEIS/libei is the tested sender. XTEST and AT-SPI
are solely the separately simulated operator, not a product fallback. Genuine
checkbox/Share UI actions, no mocked reply or permission-store modification.

Preflight fixes ensured evidence ownership, merged recorded process identities,
attempted final running-process inventory, rejected missing frames/unnegotiated
sender trials, and avoided spawning a replacement editor to manufacture survival.

## Dependency ledger

No host packages installed. Contained gedit/dependency layer was already cached;
only sender recompiled with gcc -Wall, exit0. Log `/home/odin/tmp/wayland-r3-build.log`.
Retained images:

- Base unchanged: `sha256:71a3276a6b2f0d664c6c367e1926ac53849835aba1c5be2e5edcec2392ae2cd9`.
- Operator tag `localhost/odin-wayland-operator:r1` before:
  `sha256:5fc97bb9a4458356942df5724e2a1de916113972e72e9aaeef944b93e9ff5919`.
- Rebuilt: `sha256:9cb7f0ee93587c58a16ad7ab8a369e15eb3fecccc3627ca91f01b57fa18ee48e`.

Reversal: restore prior exact tag; remove only new exact image after checking
references, never prune. Evidence/images intentionally retained.

## Bounded runs

Evidence: `/home/odin/tmp/wayland-r3-lifecycle{1,2,3}-20260907/`.
Outer logs: `/home/odin/tmp/wayland-r3-lifecycle{1,2,3}-driver.log`.
All complete commands exited **1**. Each cleanup logged
`original_exit=1 cleanup_failure=0` (see later inventory qualification).

1. Run1: gedit started, initial marker absent. Focus search selected non-showing
   editable accessibility nodes; GTK unrealized-widget assertions. No portal
   trial. Fix1 selected the first showing editable node and stopped searching.
2. Run2: initial `beforeattachmarker` observed in real gedit PID155. Genuine
   orderly and EOF portal trials completed. Same editor contained
   `afterorderlymarker` after orderly session Close. Receiver was unfocused:
   its empty held-state samples prove nothing about releases. Later AT-SPI
   traversal hit a stale application proxy after EOF; after-EOF marker unproven.
   Fix2 guarded stale proxies and used simulated Alt+Tab plus receiver focus
   observation rather than assuming Wayland present() grants activation.
3. Run3: initial editor marker observed (PID153), receiver PID145 gained focus
   through Alt+Tab. Genuine orderly portal trial/Close completed. Receiver
   motion reached window-local241,180. Instrumentation then failed:
   `event.button` returned an EventButton union object, not a JSON scalar;
   logging and recurring state sampling raised TypeError. Post-close editor
   marker absent; grabFocus=True did not activate the top-level editor.
   Editor and receiver were alive at checked points, but PID survival is not
   enough. No EOF trial reached. Stopped without a third runtime fix/retry.

## Measured portal evidence versus unproven lifecycle

Versions: GNOME Shell46.0, Mutter46.2, portal1.18.4, GNOME backend46.2,
libei/libeis1.2.1, PipeWire1.0.5, GTK3.24.41; exact revisions in session.log.
RemoteDesktop v2/device mask3; ScreenCast v5. Real Start response0, grant3,
screen800x600 origin0,0; negotiated absolute-region mapping ID matched portal,
physical scale1. Each run2 mode and run3 orderly acquired RGB800x600 Gst sample,
1,440,000 bytes. Frame acquisition measured, visual content/source-clock age not.

Run2 orderly sender logged own Shift(evdev42)/left button272 held, then
ORDERLY_RELEASE_SENT about800ms later. EOF sender logged700ms from HELD to
_exit(0); kernel closed last sender EIS FD, parent duplicate closed after spawn.
Real Session.Close confirmed after deliberate two-second post-sender observation
interval. **These are sender/portal timings, not application release latency.**
Held-event delivery, release and preservation of operator-held Control_R were
not reliably measured. No safe release bound or noninterference pass.

Files: portal-{orderly,eof}.jsonl, consent-*-check-box.txt,
consent-*-push-button.txt, session.log, receiver.log, gedit.log and component logs.
Consent files record OPERATOR_UI_ACTION True. Run2 same-editor markers are at
session.log17/29; run3 receiver serialization failure starts receiver.log70.
Overlap allowed by R2; no independence claim. Marker intended for receiver landed
in gedit in run2; grabFocus did not activate gedit in run3. Unknown event target
must invalidate grounding, not invite blind text retry.

## Tests and cleanup

Six inherited Docker-stub fixture tests passed pre-run and after final runtime
changes: normal, create-committed failure, runtime nonzero, TERM/reap, inventory
error, authority refusal/Podman suspension. Then parent review found a separate
ledger problem: /proc errors silently skipped, so absence could be false.
Post-experiment safety-only correction (not another runtime retry) records scan
completeness/errors, accepts FileNotFound race only after proc directory absence,
fails verification for incomplete/legacy baseline, includes catatonit, reports
current residual states, and marks global new helpers as unattributed possible
parallel work rather than owned. Added three tests for permission/malformed
records, vanished races, and catatonit. Final **9 tests passed**, log
`/home/odin/tmp/wayland-r3-tests-final.log`. Shell syntax and owned diff whitespace
checks passed. No repository full-suite or lifecycle matrix pass.

Live private-runtime validate_action checks passed1/1 in run2 and run3 for
running/init/user/network/read-only/memory/PIDs. Earlier run1 check failed because
container was already removed; not a health pass. Retained inspect JSON confirms
two exact mounts, no devices, capabilities dropped.

All three labelled containers absent. Recorded PID+start identities:11,11,21
(run3 adds mid-run capture); old host-cleanup.json reports no owned residuals or
new helpers. **Those old scans lacked completeness metadata**, so their clean
verdict is limited, not retroactively upgraded by the ledger fix. New complete
host snapshot `/home/odin/tmp/wayland-r3-final-host-inventory.json` taken after
fix. Startup/final snapshots are not exhaustive process lifetime event streams.
Fresh complete-scan verification in
`/home/odin/tmp/wayland-r3-final-identity-verification.json` found no remaining
PID+start identities from any of the three runs, with zero scan errors.
Final validate_action `wayland_r3_final_cleanup` was **DEGRADED:3/4**: container
absence, complete scan/recorded identity absence, and artifact/whitespace passed;
the explicit historical-zombie reaping check failed with warn severity.

Preexisting zombies:74 before/74 after each run. Known inherited
3326474(catatonit),3335865/3336516/3339721(conmon),3389007(podman) remain Z under
parent3254906. None signalled/repaired. No recorded new fixture process remained;
host-wide cleanup is **degraded**, not zombie-free. Containers and private
workloads removed, evidence/images intentionally retained.

## Precise next blockers

Before another separately authorized bounded experiment: typed GDK button
extraction plus serialization regression test; mandatory fresh delivered
held/released-state assertions; explicit simulated operator top-level activation
and existing-editor marker verification; then orderly/EOF with reliable samples.
Current harness remains diagnostic/incomplete, not lifecycle eligibility proof.

## Superseding finite corrected run — 2026-09-07 01:09 UTC

**PARTIAL: orderly delivery/release and same-application survival measured; EOF
not executed. Overall command FAILED, cleanup DEGRADED.** This section supersedes
only the old assertion that *no* receiver release was measured. All three earlier
failed runs above remain evidence. Exactly ONE additional Docker `--init`
experiment was authorized and executed; no corrective runtime retry followed.

### Corrections and preflight

Read this report and all of wayland-{receiver,lifecycle,portal,ei.c,lab.sh}, plus
session, operator Containerfile, lab tests, process ledger and cleanup record.
Pre-existing changes were present across the checkout. This increment changed
only receiver.py, lifecycle.py, ei.c, this report and new
`wayland-telemetry-test.py`; no unrelated code, commits, deployment, restart,
merge, pipeline, host setting/device change, Podman or real-session access.

- Receiver now uses typed `get_button/get_keyval/get_coords/get_state` accessors,
  never union attributes. Five pure fake-union regressions passed, including
  unavailable required-field failure and a sample error followed by a live next
  timer tick. Runtime errors emit `telemetry_error`; driver refuses them.
- Bounded simulated Alt+Tab uses private outer Xvfb :77 only. Before typing,
  receiver must have a fresh GTK active/toplevel-focus/entry-focus sample; gedit
  must expose its actual PID's active AT-SPI frame AND showing focused editable
  document. `grabFocus` alone is not accepted as top-level activation.
- Before each release/EOF trial, driver requires delivered human Control_R,
  delivered owned Shift_L/button1, and matching GDK seat modifier mask. Sender
  waits for a separate release gate after the owned-state sample; a missing gate
  triggers bounded orderly safety cleanup with exit3, not a successful EOF test.
- Five telemetry tests and nine inherited Docker-stub/ledger tests passed.
  Python compilation, shell syntax, scoped tracked diff whitespace checks passed.
  Logs `/home/odin/tmp/wayland-r3-corrected-{telemetry-tests,lab-tests,build}.log`.
  No host packages installed. Container apt dependency layer cached; gcc -Wall
  rebuilt the sender successfully. Operator image changed from
  `sha256:9cb7f0ee93587c58a16ad7ab8a369e15eb3fecccc3627ca91f01b57fa18ee48e`
  to `sha256:d3ff82442f0abf8d4dc78ddf430ba6988b4e01ab0c52cadda04a73f5ae96fb8e`.
  Both and previous evidence remain retained; reversal is exact-tag restoration,
  never pruning. No host dependency reversal needed.

### Actual result, not wrapper success

Evidence `/home/odin/tmp/wayland-r3-corrected-single-20260907/`; outer log
`/home/odin/tmp/wayland-r3-corrected-single-driver.log`. Exact container
`odin-wayland-r2-20260907T010927-3406219`, ID
`8553e4edab240cd52d1bc69ed408dd72275290223adfcfe803f0e9c4f150ec9d`.
Container ran 01:09:27.900–01:09:51.925Z, exit1, OOMKilled=false. Supervising
command exit70 because cleanup deliberately refused a host-wide clean verdict.

**Orderly:** genuine consent, RGB800x600/1,440,000-byte PipeWire frame, matching
mapping ID and negotiated libei keyboard/pointer succeeded. Preexisting gedit
PID153 contained `beforeattachmarker`. Receiver PID145 had fresh actual focus
after one Alt+Tab, not an assumed focus transfer.

Delivered Control_R keyval65508 was observed before enabling the sender; the
simulated operator also caused Control_L65507 events. Therefore this is not a
claim of a pristine one-physical-key operator stream. Both Ctrl values remained
in the receiver ledger during owned release and cleared only after the deliberate
operator keyup. Owned Shift_L65505/button1 presses were delivered; held sample
mask261 = SHIFT1 + CONTROL4 + BUTTON1(256). After release, mask4 and Ctrl ledger
remained, owned Shift and button cleared, and both release events were recorded.
No human Control_R release occurred within the checked owned-release interval.

Measured from sender's monotonic `ORDERLY_RELEASE_BEGIN` at3896063.238257s:

| Observation | Measured latency |
| --- | ---: |
| Receiver Shift_L release event | 0.515ms |
| Receiver button1 release event | 0.628ms |
| First receiver sample with owned state cleared, Ctrl retained | 5.783ms |

These are one-run observations, **not guaranteed safe latency bounds**. The
driver's later confirmation was151.955ms after opening its release gate (includes
sender scheduling and driver observation); that is a different quantity.
Receiver recorded173 recurring samples and65 events, zero telemetry errors;
largest observed sampling interval154.288ms. Typed button serialization worked.

GDK event `state` is pre-transition event metadata; the Python key/button sets
are an event ledger, NOT a server held-state query. The recurring mask comes
from `Gdk.Window.get_device_position(default_seat.pointer)` in this Wayland GTK
client and may use cached compositor-delivered state. No independent compositor
seat query, physical device attribution or noninterference guarantee was measured.
Same-app focus overlap remains explicit and accepted; independence is not claimed.

Real Session.Close confirmed at3896065.340645s. Thereafter receiver145 received
fresh `aftercloseorderly`; one bounded Alt+Tab restored actual gedit frame activity
and document focus, and the SAME gedit153 document became
`beforeattachmarkerafterorderlymarker`. Thus orderly detach preserved both tested
applications and subsequent operator input, not merely their PIDs. No replacement
editor was spawned.

**EOF blocked before owned input:** second genuine consent/frame/ConnectToEIS
completed, but fresh clean-state gate timed out. The receiver ledger retained
Alt_L65513 from switching away, while its GDK mask was0 and top-level/entry focus
had returned. No Alt release had reached that entry. This specifically demonstrates
why the event ledger must not be equated with current server state. The strict
gate did not silently accept the discrepancy or clear the ledger to fabricate a
pass. No EOF sender was started, no held-input EOF latency measured, no after-EOF
markers verified. Failure termination ended the second portal client; its log
contains no `owned_session_closed` acknowledgement. Do not treat that as orderly
Close proof. No second experiment or post-failure runtime patch was attempted.

### Cleanup and retained inventory

Runtime validation `wayland_corrected_single_runtime` passed1/1: running/init,
UID1003, network none, read-only root,1GiB memory and128 PID cap. Retained inspect
records preserve namespace, mount and capability details. Start plus mid-run
Docker top records yielded23 PID+start identities. Final top was unavailable
because container had already exited; this limitation is recorded, not called a
complete process lifetime trace. Exact container removed; all23 recorded owned
identities absent in complete host scans with zero scan errors. Foreground attach
and shell supervisor3406218/3406219 absent. No matching labelled fixture remains.

Original cleanup: `original_exit=1 cleanup_failure=1`. Host-global zombies were
76 before /79 after. Three newly observed `sleep` zombies3406573,3406623,3406831
have parent3400417 (python), **not the recorded container process ancestry**.
They remain unattributed possible concurrent work; no signal/reaping/host changes
were attempted. Existing historical zombies3326474,3335865,3336516,3339721,3389007
also remain. Never claim host-wide zombie-free cleanup or attribute new global
entries to this fixture without provenance.

Fresh verification remains failed for new global helpers, although exact owned
identity absence passes. Final `wayland_corrected_single_cleanup` was
**DEGRADED3/5**: exact container absence, complete23-identity scan and orderly
evidence checks passed; no-new-global-helpers and historical-reaping warn checks
failed. `host-cleanup.json` contains the later scan; original report is preserved
as `original-host-cleanup.json` and in cleanup.log. Additional host snapshot:
`/home/odin/tmp/wayland-r3-corrected-final-inventory.json`.

`corrected-analysis.json` contains exact events, timestamps, counts and scan
results. `artifact-inventory.json` lists36 retained evidence files with byte counts
and SHA256 (excluding its own manifest). Images, reports and evidence intentionally
remain. Complete snapshots are not exhaustive process-lifetime tracing.

### Remaining blocker

Need a separately authorized follow-up design for focus-loss-aware event ledger
semantics and independently trustworthy seat-state telemetry, without pretending
focus-out is a release or clearing human state. Then remeasure held-input EOF and
same-application post-EOF markers. No production backend eligibility, client-loss
release guarantee, full lifecycle matrix, Stage6 pass or deployment readiness claim.
