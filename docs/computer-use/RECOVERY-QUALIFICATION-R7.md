# R7 scratch recovery qualification

Date: 2026-09-07. Reviewed base: `e5bfea98ccc9717b3b69bb7f84d775ceab6a3f13`
on PR 350. Scope: the explicitly exclusive, opt-in scratch harness, not production
attached-session cleanup. Production must preserve the user's current layout.
No Cinnamon-specific workaround, monitor default, guessed layout, automatic task
replay, or production cleanup behavior was added by this review.

## Concrete review findings and fixes

* A replaced baseline window could return `skipped` without errors and be counted
  as a successful stage. Identity changes now report errors; stage aggregation
  also treats skipped baseline resources as failure. `_same` includes identity
  and window type, and the baseline validates identity tuples and client/stacking
  cardinality. The same-process XID reuse limitation of X11 remains explicit.
* Window restoration had no current held-input guard. Every identity-owned write
  now checks depressed keys/buttons under its server grab. Focus/pointer checks
  are repeated between stages and immediately before writes. A newly hidden or
  replaced active client cannot receive a child-focus write after activation was
  refused. Mutable window states are revalidated before each EWMH request.
* RandR capture/inventory validation and writes had a cross-client race. They now
  share a bounded server grab, with held-input refusal before writes. Unknown
  transforms, panning, monitor objects, hotplug/inventory changes and replacement
  modes still refuse before mutation. A server grab is not a physical hotplug or
  human-input lease; this remains an exclusive scratch-only tool.
* Exact comparison missed extra dictionary keys, and its return value could hide
  failures in earlier recovery stages. It now compares the union of keys and
  returns success only when all restoration stages and exact comparison pass.
* Repeated cancellation used to be swallowed as apparent task success. Owned
  cleanup remains shielded, then cancellation is propagated to the caller and
  recorded as task failure. A self-cancelled individual cleanup stage is recorded
  failed without skipping independent later stages.
* `controller.close()` returns `None`; that is not a cleanup receipt. The harness
  now requires the terminal durable attached-session receipt and no retained live
  controller ownership before desktop restoration. Unverified owned input or app
  termination fences topology, coordinates and power writes. Owned scratch
  minimization now uses one identity-checked X request, not an unpinned subprocess
  window ID.
* Results separately report `task_complete`, `artifact_verified`,
  `cleanup_complete`, `baseline_validated`, `session_restored`, and structured
  `manual_actions`. A failed preflight never restores an unvalidated baseline;
  its `session_restored` is null. An unavailable main-display power baseline is
  refused before task effects. The separate private Xvfb gate may report DPMS
  unavailable honestly.
* The outer supervisor writes `handoff.json`. Process cleanup after worker loss
  does not constitute desktop recovery. No hard-crash recovery promise is made.

## Actual private RandR and survivor evidence

Harness: `scripts/computer-feasibility/private-recovery-r7.py`.
Run under the root `owned-test-supervisor-r6.py`, then a bwrap private mount, PID,
network, device, HOME and temporary namespace. Xephyr `:172` is nested only in
owned Xvfb `:171`; both reject absent authorization cookies. No inherited display,
physical graphics/input devices, `:0`, main session, live config or deploy target
was accessed. No packages were installed.

Final artifact directory: `/tmp/r7-private-recovery-g0lss748/`.

* `workspace/randr-before.json`, `randr-altered.json`, `randr-after.json`: actual
  **1280x900 -> 800x600 -> exact full baseline** using the real RandR helper. A
  second restore is a verified no-op.
* `workspace/windows-before.json`, `windows-altered.json`, `windows-after.json`:
  visible and hidden Xlib fixture windows survive with the same XIDs, PID, UID and
  start ticks. Default hidden repair refuses and leaves the changed record alone.
  The explicit hidden-position option restores the exact record with only
  ConfigureNotify (22), no map/unmap, and unchanged active window. Focus/pointer
  restoration reports no errors.
* `workspace/result.json`, readable copy
  `/tmp/r7-private-recovery-final-result.json`: all qualification assertions pass.
* `/tmp/r7-private-recovery-owned-final.json`, readable copy
  `/tmp/r7-private-recovery-final-owned-readable.json`: exit 0, completed and full
  census, cleanup true, residuals empty, no deadline, no signals. All four owned
  fixture/Openbox/Xephyr/Xvfb children exited 0. Cookie file removed.
* `/tmp/r7-private-recovery-final.log`: exact copied source hashes and paths.

This is **real private RandR and window-protocol evidence**, not a native-app
content/lifecycle claim. Xephyr has **no DPMS extension**, so power forcing is
covered only by stub tests of command selection, refusal and readback ordering.
No hardware monitor sleep/wake recovery was demonstrated. Xrandr's gamma warning
had exit 0 and gamma is outside the claimed topology baseline. Early fixture
attempts failed due to isolated EGL initialization and WM readiness; all their
supervisor cleanups passed. Disabling GLX/forcing software rendering and bounded
WM settling addressed fixture issues, not desktop policy.

## Focused regression evidence

`/tmp/r7-recovery-focused-2.log`: **139 passed in 9.26 seconds**, including scratch
windows/RandR/support/cleanup, main native harness orchestration and private guard
tests. `/tmp/r7-recovery-focused-2-owned.json`: primary exit 0, complete census,
cleanup true, no residuals, signals or deadline. These include repeated
cancellation, stage self-cancellation, baseline validation failure, task failure,
controller quarantine, exact restoration, hidden-state/input/identity races,
extra-key mismatch, and return-status distinctions.

Focused Ruff and `git diff --check` passed after lint fixes. This is not a claim
about the full repository suite or required GitHub CI. Earlier 135-test run also
passed; the final 139-test run adds actual fake-orchestrator failure/cancellation
coverage. No destructive desktop tests were run.

After the controller-receipt/minimization changes, one additional exact private
native CLI run was necessary: `/tmp/private-main-r6-lihau_te/`. The result under
`workspace/tmp/cu-r6-qd4b5u4g/result.json` passed with 10 verified GUI actions,
one native rectangle plus ellipse, all 18 stages successful, terminal durable
controller receipt, `cleanup_complete=true`, `session_restored=true`, content
purged and no manual actions. Its `handoff.json` and `supervisor.json` passed.
Readable result: `/tmp/r7-recovery-private-cli-final2-result.json`.
Outer report: `/tmp/r7-recovery-private-cli-owned-final2.json`, exit 0, complete
census, cleanup true, residuals empty, no deadline/signals. This Xvfb run still
has no DPMS: unchanged `unavailable` is metadata, not a power recovery claim.
An initial invocation omitted the required `--execute-isolated`, refused before
launch with exit 2, and was corrected; that invocation is not qualification.

## Failure handoff and limits

| Condition | Automatic boundary | Manual action |
| --- | --- | --- |
| Cold/unvalidated preflight | Close connection, remove owned scratch data; no baseline writes | Inspect refusal; do not replay an unsupported baseline |
| Ordinary task failure/cooperative cancellation | Bounded owned teardown, then topology/windows/focus/power, exact comparison | None only if `cleanup_complete` is true |
| Controller quarantine or unverified app termination | Owned teardown still attempted; desktop writes fenced | Verify/revoke only owned input and inspect supervisor plus receipt |
| Held input/concurrent change | Effect-boundary checks refuse; never synthesize key/button release | Restore exclusive idle conditions and review changed metadata |
| Hotplug/mode replacement/unsupported topology | No guessed topology or coordinate repair | Review `before.json` and live hardware; choose layout explicitly |
| Hidden window changed beyond position | Never map, activate, resize or change its state | Review exact window identity and metadata; leave unrelated windows alone |
| Power unavailable or unresponsive X server | Bounded attempt fails; no settings rewrite | Inspect actual server and power state before authorized repair |
| Hard worker kill, server death or watchdog expiry | Supervisor terminates/reaps only owned processes and purges content | Read `handoff.json`, `supervisor.json`, then `before.json`; manually assess desktop. Process cleanup is not restoration |

The durable metadata contains no document content, screenshot, title or keystroke
text. Exact-baseline success applies only to represented metadata. WM-private
normal bounds and native application unsaved content are not reconstructible by
this helper. Main-session authorization and prior private task qualification
remain mandatory. No push, deployment, restart, merge, tag or pipeline run was
performed by this review.
