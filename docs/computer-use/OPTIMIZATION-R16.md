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

The remaining accepted charter is still pending: transition-aware effect
verification and failure diagnostics, bounded sequences/disconnected strokes,
richer targets and field operations, stale-able task context, and moving
provisioning into System > Computer while removing the Config Center section.
