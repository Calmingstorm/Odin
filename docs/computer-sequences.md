# Bounded computer action sequences

`computer_act` accepts `operation=sequence` with `steps`, or `operation=strokes`
with `strokes`. The envelope carries the ordinary session, generation, consent,
source and delivered observation binding plus a unique aggregate `action_id`.
Do not supply a top-level `expect` for these two operations.

Each sequence step is an ordinary action's operation-specific fields, `expect`
and a unique `action_id`. Each disconnected stroke contains `action_id`, `points`
and `duration`; its expectation is visual change. Steps cannot override binding
or modal identity and cannot contain another sequence. All coordinates must be
planned against the same original delivered view. Input is released between
every pair of steps, including strokes. No connecting line is synthesized.

## Limits and conservative behavior

- At most eight steps, 256 total polyline points, 512 total text characters and
  four seconds total requested stroke duration. Ordinary per-step limits still
  apply, including the one-second stroke duration and two-second native input
  lease. Wayland retains its stricter per-step text/postcondition limits.
- The dispatch/capture/authorization portion has a 30-second total wall deadline,
  further bounded by the original observation's age and session expiry. Release
  and stop cleanup may outlive this deadline; cleanup is not abandoned to meet it.
- All step structure, finite durations and mapped coordinates are checked before
  any step is sent. Runtime-dependent native keymap support, exact native window
  bounds and device readiness are still checked by each backend before its input.
- A step proceeds only while its original binding and original pointer-start
  neighborhood still match. Keyboard steps require the original full raster to
  match. Earlier raster changes cannot authorize a new field, dialog or target.
  This intentionally rejects some otherwise useful click-then-type plans and
  strokes whose start neighborhood overlaps a previous stroke. Use a new delivered
  view and explicitly plan another call, rather than relaxing the check.
- Each input result must have verified postconditions before another step runs.
  Raster change proves raster change, and pointer position proves pointer position,
  not semantic task completion.
- X11 sequence captures disable the ordinary capture path's brief focus-settling
  retry. Any sampled changed binding interrupts rather than waiting for it to
  return. Native in-action focus/geometry/release guards remain unchanged. This is
  not a claim that every excursion between samples is detected.

## Receipts, interruption and recovery

The store reserves all IDs and the entire step budget in one transaction before
input. Each step has its own durable receipt. The aggregate receipt hydrates the
individual records even after restart; replay never continues a partial plan.
Remaining undispatched steps are settled as known no-input receipts on a handled
interruption. A controller crash leaves pending receipts unknown, not retryable.

Known interruptions yield the latest captured frame to the ordinary image-delivery
path. The frame only becomes actionable after actual model delivery. Internal
checkpoint captures never acquire delivered authority. Unexpected dialogs end the
plan even when they belong to the same application; the model must inspect them.

Cancellation or unknown input outcome invokes the existing independent shielded
stop/cleanup path. Capture is never prioritized over uncertain input release.
When capture fails or cleanup revokes capture, the aggregate explicitly reports
the frame unavailable rather than inventing an interruption screenshot. A replay
contains receipt/evidence metadata, never a newly actionable image.

## Verification status

Implementation checkpoint only. Import, lint and diff checks do not qualify a
backend or prove live GUI task completion. No desktop interaction, deployment,
service restart, pytest run or new tests were performed for this increment.
End-phase verification must cover no-replay after partial dispatch, cancellation
at each await, storage failure cleanup, unexpected focus/dialog changes, schema
parity, and ordinary single-action regression behavior.
