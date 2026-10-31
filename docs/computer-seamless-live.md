# Seamless X11 live-test branch, 2026-10-31

Base: `origin/master` v4.26.0 (`eb4ee107`). Development only; deployment and
supervised live testing are external. Live testing ends at **18:30 EDT**.

## Slice 1: exact-target pre-dispatch recovery

- Preserve private native target evidence separately from public screenshot
  revision. A revision is never rolled back or accepted as native identity.
- Remove both controller/backend revision-equality capture retry loops.
- On a recoverable attached-X11 pre-dispatch mismatch, one cancellable coordinator
  waits for a full second without physical key, button, or motion edges or held
  keys/buttons. Maximum wait is 30 seconds, at most two activation requests.
- **Deviation from the originally accepted click mechanism:** recovery requests
  `_NET_ACTIVE_WINDOW` for the exact original native window. No pointer move,
  click, key injection, `SetInputFocus`, window relocation, or fallback click.
  An activation request is not proof of focus. The ordinary fresh native scope
  and captured frame must agree before the never-dispatched action can proceed.
  A recent takeover yields instead of repeatedly fighting for focus.
- Window/process/native widget lineage, source/consent, geometry and modal
  evidence remain conjunctive. Retained structure-event monitoring brackets
  captures and overlaps the recovery worker's subscription before authorization.
  Missing incarnation evidence disables recovery, not ordinary capture.
- Only revision churn is rebound. Translation and resize return a fresh view,
  not remapped coordinates. Existing pointer-anchor and keyboard-focus checks
  still apply after recovery. Changed target pixels also return the fresh view.
- Unknown action dispatch/release is never recovered/replayed. Pending input
  prevents single-action recovery. `/stop` fences recovery independently of the
  controller action lock. Expired observations do not become fresh through waiting.
- Receipts carry content-free cumulative phase times under
  `verification.phase_timings_ms`: capture, recovery, combined backend
  dispatch/release/verification, total. Recovery additionally reports its native
  quiet/activation/proof timings when supplied. These phases overlap; do not sum
  them as disjoint wall time. Native input subphases are not separately timed yet.

### Conservative limits

Any observed window create/destroy/reparent currently invalidates recovery,
including events in unrelated applications. This avoids same-XID reincarnation
ambiguity at the cost of recoverability on a structurally busy desktop. Mere
focus changes, pointer motion, and window configuration events do not increment
this epoch. Tracker failure produces no fabricated continuity proof.

WM policy may deny EWMH requests using `CurrentTime`; denial returns evidence,
never a click fallback. X11 focus and input checks remain non-atomic with respect
to other clients. Human overlap during already-dispatched input retains the
existing guardian policy. No guardian termination/fault testing is permitted on
the operator's desktop.

### External live acceptance

1. Observe Krita, focus xed before the action, stop touching input, then request
   the grounded action. Expect exact-window activation, one requested action,
   no focus-click brush speck, new revision, and recovery timings.
2. Move focus away and back before action. Expect revision-only recovery without
   a redundant activation or a multi-call observe/focus/observe loop.
3. Keep moving the pointer or tapping Shift during recovery. Expect no requested
   action until quiet; continuous activity must return `user_active` within the
   bounded wait. A second human focus takeover within five seconds must yield.
4. Move/resize the target, change the anchor, open a dialog, or replace the
   window. Expect fresh evidence and no old-coordinate action or target adoption.
5. Stop during the quiet wait. Expect prompt cancellation and no later activation
   or action. Repeat action IDs must return receipts without re-execution.

Quick checks are fake-only, with native/runtime seams mocked. No native desktop,
service, configuration, deployment, or restart actions were used while building.
Hyprland and portal recovery rules are unchanged. Odin Desktop's separate source
copy has not been synchronized; that is a later explicit release task.
