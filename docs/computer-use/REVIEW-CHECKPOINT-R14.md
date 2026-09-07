# R14 first increment: live-tail desktop findings

This is a branch-only checkpoint for the external deploy/test loop, not a claim
that the new code has passed input testing on the operator's desktop.

## Changed

- An explicit observation without a source selection follows current application
  focus across granted X11 monitors instead of retaining the startup monitor.
  Every model observation now includes all granted source IDs and labels.
  Explicit source selection wins. Revalidation and verification never switch
  monitors underneath an action. A spanning window keeps its current source.
- Attached pointer clicks, click variants and scrolling compare a 49 by 49
  delivered-pixel target neighbourhood instead of the entire raster. The check
  tolerates at most 2% changed pixels, capped at 48 pixels, with a per-channel
  noise threshold of 12. This allows a thin caret blink and ignores unrelated
  animation. Material target changes still reject. This is bounded visual
  stability evidence, not an assertion of semantic element equivalence.
- Exact source, geometry, focus, consent, native hit checks, two-second input
  leases, shared-input fallback and detach remain unchanged. Isolated input and
  polylines retain their existing raster check.
- Genericized the two operator names in the R13 checkpoint. The documentation
  test still covers every computer-use Markdown file; its scope was not narrowed.

## Evidence and pending work

The initial focused regression run passed 164 tests, including local target
change refusal, focus-change refusal, no-replay, four-source focus routing and
explicit source override. These are hermetic tests, not live desktop evidence.
No full-suite or full-coverage pass is claimed for this checkpoint.

Pending: post-action native-image delivery, provisioning controls, full final-tree
instrumented gate, and external deployment followed by supervised live validation.
Observation of another monitor does not itself grant permission to type into an
unfocused window. Application-class restrictions have not changed in this increment.

No live-install writes, restart, deployment, merge, tag, agent or pipeline run.
