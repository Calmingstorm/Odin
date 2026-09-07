# R16: pointer coexistence assessment and bounded stale-binding recovery

Scope: source inspection and prior recorded evidence only. No desktop connection,
input, experiment, new tests, pytest, deployment or service restart in this phase.
The full round-three request and full R13 checkpoint were read. Item 3 is assessed,
not implemented. Item 4 receives a narrow recovery improvement, not transparent
side-by-side operation. Tool descriptions and generated references are unchanged.

## Item 3: independent pointer is plausible, not production-qualified

The requested persistent-master design already exists as `PersistentXTest` in
`src/computer/runtime/x11_owned_device.py`. It creates/reuses a server-lifetime
master pair, sets the injector connection's client pointer, and has per-master
keyboard focus. Its implementation does not remove, disable or reattach physical
devices. Its `close()` closes handles only. This is different from `SessionXTest`,
whose removal path caused the later regression.

Prior evidence, not a new run: `R11-X11-NATIVE-EVIDENCE.md` records seven reuse
cycles on disposable Xvfb/GTK with the core cursor at (850,600) and the independent
cursor at (120,120), empty owned endpoints after the covered failure cases, and
the GTK app still accepting text. This supports technical feasibility of separate
cursor injection. It does not establish safety on Aaron's current desktop.

The full `REVIEW-CHECKPOINT-R13.md` explicitly records a real Xed task crashing
with `XI_BadDevice`, minor 42, after fully sequenced release, fencing, restoration,
grab checks and master removal. The claim that only removal during held input
causes the crash is contradicted by that evidence. Never-removal avoids that
specific operation; it does not prove arbitrary toolkit preservation or lifecycle
safety. GTK widget focus within one window remains shared even with two masters.
Current scope validation still relies on active application focus, so a second
cursor alone would not allow unattended input to a background application.

Production `X11AttachedBackend.start()` explicitly admits shared input only and
rejects device creation/independent separation. Controller `_stop()` requires
removed devices, no created devices, or closed Wayland portal connections; it does
not accept persistent idle as clean detach. Therefore enabling persistent mode is
not a safe one-line change. It conflicts with the current clean-detach contract,
needs an explicit lifetime/ownership contract and separate qualification, and
must not be advertised as safe merely because it avoids removal. No input-mode,
master lifecycle, physical attachment or cleanup code is changed here.

## Item 4: implemented narrowly

In `ComputerController.act()`, an existing-session `stale_source_binding` detected
during the fresh, pre-dispatch validation capture now returns a durable
`unavailable` receipt rather than an opaque exception. It records no injection,
marks recovery possible, and points to fresh capture evidence when available.
Old observations and their delivery authority are invalidated. Duplicate action
IDs return the refusal receipt rather than attempting input later. These refusals
consume the existing action budget, as other durable action receipts do.

The receipt directs the caller to wait for the user to return focus to the
intended application, explicitly observe without the old crop, verify the intended
application and target from newly delivered pixels, and plan a new action with a
new ID. There is no automatic focus change, target substitution, coordinate
rebasing or retry. Fresh evidence IDs in a refusal are diagnostic only, not
delivered observation authority or permission to act. A fresh observation remains
mandatory even when the user returns to an apparently identical layout.

Unexpected modals retain the existing pause path. Isolated sessions and other
pre-dispatch errors retain their prior behavior. There is no relaxation of the
current tool prohibitions on terminals, security prompts or Odin's control plane.

After acknowledged injection and verified release, a postcondition capture's
`stale_source_binding` now joins the existing capture-unavailable cases: the
receipt retains `executed`, verification is unavailable with the precise reason,
and a new uncropped observation is required. It does not turn acknowledged input
into an unknown outcome and cancel solely because verification capture lost its
binding. It never claims the action achieved its requested visual result.

## Important limits and validation

The observed pre-dispatch exception previously did **not** itself cancel the
session. The change improves recovery guidance and durable no-replay semantics;
it is not a fix for a proven pre-dispatch cancellation. Exceptions after dispatch
with uncertain input/release still become unknown and invoke unchanged stop and
cleanup. Focus loss mid-gesture is not made recoverable by replay.

No native application identity is pinned across the explicit reacquisition step.
The caller must recognize the intended application from fresh evidence, as in the
existing observation contract. This patch deliberately refuses input when it
cannot ensure the old target; it does not claim automatic same-app reacquisition
or elimination of X11's shared focus/check-to-input race. Native per-action scope,
hit checks and lease/release guarantees remain unchanged.

Validation for this phase is limited to static Python syntax parsing and
`git diff --check`. No new tests or pytest were run; behavior needs later
isolated regression qualification before any live deployment claim.
