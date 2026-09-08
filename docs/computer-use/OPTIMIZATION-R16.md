# Optimization round: first deployment checkpoint

## Increment 1: verification capture becomes the next view

Fresh `computer_act` results now carry the existing post-action capture through
the same native-image delivery path as `computer_observe`. There is no additional
screenshot solely for delivery. The image includes its new observation ID,
source-local geometry, crop, consent generation, source revision, available
sources and input status. The separately settled action receipt accompanies it.

This removes the required duplicate observe between an action's verification
capture and the next action. It does not remove freshness checks or authorize
unseen screenshots:

- Capture alone never sets delivered-observation authority.
- The foreground integration issues the image for that invocation only. Delivery
  still checks invocation identity, live owner, generation, exact metadata,
  digest and age. Request assembly retains the native-frame guards.
- The next action still requires the delivered observation ID and independently
  rechecks live target binding and freshness before dispatch.
- Pixels are transport-only, not stored in durable action receipts. Repeating an
  action ID returns the original receipt without sending input or reissuing a
  frame. There is no automatic replay or rollback.
- A failed effect remains failed even when an image is delivered successfully.
  An image-delivery failure reports the already-settled receipt and asks for a
  fresh observation, not a retry of the action.
- Missing verification captures still require an explicit observe. Unknown
  input/release outcomes retain the existing stop path. Cleanup is unchanged.

## Qualification and subsequent increments

This checkpoint is source implementation, not live qualification. No new tests
or pytest runs are performed during this phase. Syntax, lint and whitespace
checks precede the push; the full regression/coverage gate remains an end-of-phase
requirement.

After operator deployment, measure consecutive scratch actions using the
returned image IDs, including a crop; verify effects and clean release/detach.
Report all GUI inputs including shell, explicit observe calls, redundant
captures, recovery calls, elapsed time and task completion. Do not count saved
round trips until measured. No desktop actions were needed to build this change.

## Additional pushed increments

- Descriptive task context retains bounded goal/tool/color/brush hints and the
  latest target/view identity. Hints are explicitly unverified and become stale
  on input, pause and target changes. They are never consulted for authorization.
- Action settlement is extracted before image-delivery validation. A rejected
  image no longer changes an already settled action into a failed turn-ledger
  operation; the receipt is still returned for reconciliation without replay.
- Provisioning moved to System > Computer, with changed-field review, independent
  lifecycle controls, restart metadata and reload after uncertain save. The
  Config Center section was removed and production UI assets rebuilt.

No live qualification has occurred for these increments. One UI commit omitted
the phase's CI-skip marker, triggering three workflows automatically. All three
were cancelled; this is not a CI pass and not a completed end-of-phase gate.

## Integrated source checkpoint

The remaining charter areas now have source implementations, not live passes:

- Bounded sequences/disconnected strokes reserve step IDs atomically, retain
  individual receipts and interrupt on sampled target changes. Captures between
  steps only veto targets from the original delivered view. They never become
  synthetic delivery grants. Native focused editable identity permits text or
  selection changes within the same initially focused field; without that proof,
  keyboard batches remain conservatively raster-bound.
- Effects distinguish region change, native window disappearance, newly mapped
  dialog/menu appearance, pointer location and complete field-text equality.
  Appearance now requires before/after map inventory, not just activating an
  already-open dialog. Unknown release stops; confirmed release with uncertain
  effects yields an interrupted result and no automatic replay.
- AT-SPI field replacement is implemented for isolated and attached X11 with
  native identity across captures and original-node readback. Attached discovery
  requires an existing accessibility bus and usable optional GI support; it does
  not enable desktop accessibility or install anything. Unsupported environments
  report unavailable rather than silently substituting keyboard/clipboard input.
- Click count/modifiers, modified scroll and drag/polyline are wired through
  backend validation. X11 checks modifier semantics and rejects unsupported
  implicit keysym levels instead of sending the wrong symbol. Wayland extensions
  require the newly provisioned guardian capability; old binaries refuse them.
- Prepress dispatch admission estimates and bounded native progress diagnostics
  are implemented. These estimates are not performance measurements.

All source integrations received lint, syntax/import and targeted type checks;
the Wayland guardian received a strict C syntax check. No new tests or pytest
were run. Three existing broad tool-loop mypy audit-call errors were reproduced
on the starting head, rather than attributed to this work.

The running installation was still on the previous deployment at the final
read-only check. No GUI inputs, shell GUI batches, captures or live recovery calls
were performed in this build turn. Consequently there is no measured GUI task
elapsed time, batching improvement or runtime cleanup claim for this checkpoint.

Next: operator deployment, then supervised scratch qualification of post-action
views, drawing sequences, expected dialogs, native field replacement and modifier
actions. Report total GUI inputs including shell, explicit/redundant captures,
recovery, elapsed time and verified task completion. Run the full end-of-phase
regression and coverage gate only after the testing phase ends.
