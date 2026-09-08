# Bounded computer action sequences

`computer_act` accepts `operation=sequence` with `steps`, or `operation=strokes`
with `strokes`. The envelope carries the ordinary session, generation, consent,
source and delivered observation binding plus a unique aggregate `action_id`.
Do not supply a top-level `expect` for these two operations.

Each sequence step is an ordinary action's operation-specific fields, `expect`
and a unique `action_id`. Each disconnected stroke contains `action_id`, `points`
and `duration`; its expectation is visual change. Steps cannot override binding
or modal identity and cannot contain another sequence. All coordinates must be
planned against the same original delivered view. Confirmed input release is
required before the next step, including strokes. No connecting line is synthesized.
On shared X11, cooperative cleanup requires a surviving guardian and acknowledged
release. Abrupt death of its sole ledger owner has an untested native consequence
and no proven universal server-side release guarantee. Unknown release interrupts
the sequence; neither process absence nor a later observation permits replay.

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
  neighborhood still match. Attached X11 keyboard steps retain exact native
  source/focus binding without requiring unrelated pixels to stay unchanged.
  Other keyboard paths require the original raster or the same focused native
  field. Earlier raster changes never authorize a new field, dialog or target.
  Strokes whose start neighborhood overlaps a previous stroke may still yield.
- Native `replace_field` is accepted inside a sequence. Each original handle is
  reconciled to exactly one fresh node with identical native identity, root,
  ancestry and metadata, including text, focus, role and bounds. Unrelated raster
  changes do not reject an unchanged native field. Changed or ambiguous fields
  still interrupt without substitution. Pixel field replacement remains a
  single-action operation.
- Matching native text readback is not application adoption. Such replacements
  report `executed` with adoption unproven, so the sequence stops before another
  step. Explicit application commit and fresh evidence are required; there is no
  implicit Enter, default-button activation or automatic continuation.
- Each input result must have verified postconditions before another step runs,
  except a completely dispatched/released stroke with independently measured
  distributed path evidence can continue to an unchanged original next anchor.
  These batches still require final visual review. Raster change proves raster
  change, and pointer position proves pointer position, not semantic completion.
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

## Verification boundary

Behavioral regressions exercise original-view native reconciliation, changed and
ambiguous identities, unseen/stale frames, unknown injection, no replay, partial
dispatch and undispatched later steps. Native Xvfb event tests exercise bounded
stroke delivery and release. These do not certify application value adoption or
semantic drawing success on an operator's desktop. See the campaign review report
for exact-source quality and native qualification evidence.
