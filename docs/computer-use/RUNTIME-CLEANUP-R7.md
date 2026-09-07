# R7 attached X11 cleanup evidence

Source/test work for PR350, not deployment, desktop repair or application
qualification. Exclusive development cwd:
`/home/odin/reviews/computer-use-r7-runtime`, branch `work/computer-r7-runtime`.
No active desktop, live install/config, Cinnamon change, restart, deployment,
pipeline, merge or tag. No production topology, power, pointer or focus restoration
was added. The confirmed external compositor issue is not a cleanup prerequisite.

## Correctness changes

* Previously detach/pause awaited the action/capture lock after guardian wait.
  Post-input capture could delay cleanup despite released input. Cleanup now joins
  **owned worker jobs and reapers only**, never capture, RandR, focus or action locks.
* Independent asyncio owners are registered before launch awaits. Caller
  cancellation, even repeatedly or during spawn, revokes a flag and pipe without
  cancelling the owner or losing a spawned child/receipt. No nested untracked
  release shield remains. Clean-stop tests assert no residual asyncio cleanup task.
* Capture timeout, observer cancellation and Stop share a single reaper. Only the
  owned capture child can be terminated. A release guardian is never killed to
  manufacture success. Final direct-child wait is bounded and fails closed.
* Already-read receipts survive later wait/identity failure rather than rereading
  EOF. Nonzero exit, missing/malformed receipt, unverified privileged identity and
  released=false still cannot become clean. A worker cancelled before any request
  was sent needs exact settlement, not fictional input-release evidence.
* Controller stop persists a single owner-driven cleanup transaction despite
  repeated transport cancellation. Resume refuses unsettled workers/reapers.
  **Action unknown and cleanup complete are distinct**, with no duplicate replay.
* Empty potential-down ledgers need no native query to release nothing. Nonempty
  ledgers still require fencing, exact original synthetic endpoints and verified
  release. No blanket key-up, physical injection or endpoint-following was added.

The input lease remains two seconds. Attached cleanup allows nine seconds inside
the controller's ten-second stop/pause budget, accommodating the five-second
privileged capture-worker alarm plus wrapper exit/identity checks. Isolated stop
retains three seconds. Timeout is unsettled, not a permanently latched negative
release receipt: owned jobs continue autonomously and a later Stop may use their
verified result. Until proof arrives, cleanup is quarantined, never clean.

## Validation

Final focused run: **263 passed, 0 failed, 7.25 seconds**, exit0.
`/tmp/odin-r7-runtime-complete.log` and
`/tmp/odin-r7-runtime-complete-owned.json` record the result and complete owner
census: cleanup true, no residuals or rescue signals. Scoped `ruff check` passed
on changed source/tests and `git diff --check` passed. No full-suite claim.

Pytest ran from the development cwd via the fully reviewed
`scripts/computer-feasibility/owned-test-supervisor-r6.py`, using
`/home/odin/odin-dev/.venv/bin/python -B` for supervisor and pytest. The focused
command is supervisor `--deadline 90 --grace 3 --report <report> --` followed by
the interpreter and `-B -m pytest -q` with these files:

* `tests/test_computer_cleanup_r7.py`
* `tests/test_computer_x11_attached_r5.py`
* `tests/test_computer_x11_guardian_r5.py`
* `tests/test_computer_x11_owned_device_r5.py`
* `tests/test_computer_attached_controller_r5.py`
* `tests/test_computer_actions_r4.py`
* `tests/test_computer_recovery_r5.py`
* `tests/test_computer_keyboard_grounding_r6.py`
* `tests/test_computer_profile_hooks_r7.py`
* `tests/test_computer_x11_cleanup_r7.py`

Regressions cover stop without action locks; cancellation during spawn/receipt and
repeated cancellation; timeout; no remaining cleanup tasks; unresponsive guardian
quarantine; cancelled pause refusing resume; nonzero/malformed release; durable
controller stop; post-input capture loss; pending-action timeout; unchanged
duplicate unknown receipts. Existing grounding and endpoint-replacement refusals
remain in the same batch.

`tests/fixtures/computer_x11_cleanup_r7.py` creates an authenticated high-number
Xvfb, random private authority, no TCP listener, sanitized environment, separate
event receiver and exact owned injectors. No ambient display/cookie/bus/home/app.
Five actual trials hold Control plus button1, then exercise real RandR monitor
replacement, actual X11 blanking plus simulated capture unavailability, controller
cancel, controller EOF and a shortened lease. All yielded **unknown action with
released=true**. The receiver remained alive and received exactly **20 input
edges**. The queued later `a` never arrived. Device held states were empty,
identities unchanged and injectors reaped. Recorded release latency17.433 to17.814ms
is a measurement, not a real-time guarantee. Product capture also reaped three
workers (start, observation, refused stale monitor) and detached after monitor
loss while receiver/Xvfb remained alive. Only then did fixture teardown close its
own receiver and Xvfb and verify PID/socket/lock disappearance.

`/tmp/odin-r7-runtime-native2.log`: one pytest pass, five native trials.
`/tmp/odin-r7-runtime-native2-owned.json`: primary0, cleanup true, complete census,
zero residuals/signals. Xvfb has **no hardware DPMS**: this is actual blanking and
RandR testing, not physical sleep/hot-unplug, CPU suspend or compositor recovery.
The event receiver proves application preservation, not arbitrary app qualification.

Initial failures retained: native wrapper expected four capture children but only
three were requested; corrected. An older async guardian fixture never replied on
EOF; fixed to emit its single receipt like the real process. A fake-child controller
timeout fixture failed on missing PID before dispatch; isolated that stub from real
/proc recording. Initial lint formatting findings were corrected. These failed
runs are not cited as successful validation.

## Exact recovery if proof is fundamentally unavailable

Normal blanking/topology changes require **no restoration command**. Stop may be
clean while the action remains unknown. Never replay it. Later work requires new
consent and freshly measured sources, not the old mapping.

For `cleanup.complete=false`, quarantined state or `owned_x11_cleanup_unverified`:

1. **Stop**, then **Disable computer use**, then read status. Authority is revoked
   independently of screen wake. A disabled boolean does not establish release.
2. Preserve session/action/cleanup receipts and private runtime descriptor (boot
   ID, PID/start ticks). Inspect only exact identities. Never kill an application,
   release guardian, graphical session or name-matched process population.
3. If the display merely slept, wake it normally, leave automation disabled, let
   owners finish, then Stop/status again. No automatic topology/pointer/power/
   Cinnamon reset is attempted.
4. **Reconcile recorded workload** is read-only. Process absence alone cannot
   prove same-boot input release. Modern uncertain records have no acknowledge-
   anyway or replay override; do not delete receipts or send global releases.
5. Permanently unresponsive X11, replaced native endpoints, uncatchable guardian
   death or lost ownership evidence have **no proven non-disruptive software
   recovery here**. Keep quarantined and escalate externally. If the operator
   independently chooses maintenance reboot after protecting unsaved work, obtain
   separate explicit authorization and use the externally owned process. After
   reboot, changed boot ID permits read-only absence reconciliation. It never
   repairs/replays the old action; new work still requires new consent.

## Integration boundary

The apps agent's API was cherry-picked; independent hook commit `c10c20b` adds
controller/direct-backend policy enforcement and profile metadata. No qualification
scope or main-session harness edits were made here. Its Writer save run included
the hook but **preceded this cleanup revision** and cannot prove the full Writer
lifecycle of the final runtime. No full suite, new cross-UID repeat, hardware sleep
or release readiness is claimed.
