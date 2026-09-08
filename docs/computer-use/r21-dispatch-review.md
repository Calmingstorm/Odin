# R21 bounded dispatch review

## Defects corrected

- Attached X11 polyline waits previously started after each native scope check.
  This added guard/round-trip latency to every segment's requested duration.
  Polyline waits now follow a cumulative timeline, like isolated X11 strokes.
  Click spacing remains relative. The 1.75-second dispatch deadline, two-second
  lease, per-step scope checks, admission reserve, fencing and release remain.
- Effect receipt classification now rejects contradictory success evidence:
  unequal planned/completed counters, a native failure reason, or unknown release
  diagnostics cannot become success merely because pixels or the pointer changed.
  Such receipts require observation and reconciliation, never replay.
- `SessionXTest` performed a final census outside its base constructor's cleanup
  handler. Failure there leaked the open native connection/device handles and
  skipped safe removal of a newly created pair. It now runs the same exact-owned
  startup cleanup and always closes handles on this additional failure path.

## Recorded behavior

The authenticated disposable-Xvfb fixture uses the actual native device,
guardian, injector, application scope and X event receiver, never a desktop.
The receiver verifies ordered held-button motion vertices plus exactly one press
and release. Its supervisor verifies owned-process cleanup and zero residuals.

- Before the pacing fix, an 18-point, 0.8-second stroke with a deterministic
  35 ms delay around each real wait-step scope check expired at 32/37 steps.
  It correctly returned `unknown` with confirmed release, not success.
- After the fix, the same stressed stroke completed 37/37 in three consecutive
  runs. Normal and stressed delivery pass on both shared and independent XTEST.
- A 120 ms per-wait delay still forces an honest partial outcome with confirmed
  release. The event receiver proves a strict prefix of the path, not all points.
- A 256-point over-budget plan refuses before any input or event.
- A one-shot final-constructor census fault on an actual newly created session
  pair reproduces the unclosed connection before the cleanup fix. With the fix,
  handles close and the complete native topology equals its pre-create baseline.

Eight native parameterized cases and the targeted dispatch, effects, primitive,
owned-device and guardian regression selection passed: **384 tests**. Ruff check,
Ruff format and Git diff whitespace checks passed for the changed files.

## Limits and review boundary

This is event-delivery and cleanup evidence, not proof an application painted a
semantic mark, and not an unrestricted reliability guarantee under arbitrary
scheduling stalls. No deadlines were extended and no vertices are dropped to fit
a deadline. Unknown partial work remains non-replayable.

Reviewed X11 native event/ledger/fence paths, isolated primitive stroke timing,
and Wayland guardian dispatch/terminal receipt handling. No Wayland native
compositor runtime was exercised in this task; no Wayland implementation change
or broader compositor guarantee is claimed. Existing Wayland timeout paths
return unknown/unavailable and the shared effect classifier now vetoes
contradictory successful completion counters when supplied.

No new feature, full-suite run, deployment, restart, push or hosted CI was performed.
