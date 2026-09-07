# Action-specific attached keyboard grounding, R6

## Decision recorded before implementation

R2 explicitly accepts shared widget focus, not damage or arbitrary application
input. The observed Writer blocker is a changing screenshot (including its
blinking caret) between delivery and action. Full-image equality cannot distinguish
that from unrelated rendering, and is not a proof of exclusive widget focus even
when the pixels match.

For X11 `existing_session` `type`/`key` only, permit raster differences after exact
fresh source geometry and native scope revalidation. The X11 attached adapter
increments source revision whenever its complete input-scope binding changes.
That binding includes native process identity, window/focus paths and metadata,
transient/modal chain, geometry and topology. The input guardian independently
rechecks that scope during bounded injection. This controller exception must not
be interpreted as permission for an adapter lacking those native guarantees.

The decision is deliberately not a caret detector: arbitrary raster changes within
an unchanged native binding also pass. Another human can change an internal widget
or selection without a detectable native focus change. This remains R2's accepted
shared-focus limitation, not an atomic same-widget guarantee. Actions still require
task consent; app eligibility is not permission to overwrite existing work.
Terminals, security/credential dialogs, control-plane input and unsafe application
dialogs remain forbidden. A newly detected modal invalidates binding and pauses.

## Unchanged gates

- `click` and `drag`, every isolated action and other platforms still require
  full-PNG equality. A future attached Wayland adapter does not inherit this rule.
- Delivered observation identity/digest, source selection, generation/consent,
  exact geometry and source revision, focus/modal checks and both age limits.
- Current authority immediately before durable admission and native input.
- Fresh bounded native checks, owned-input release and application-preserving stop.
- Pending receipt before injection, consumed observations, uncertain-outcome stop,
  and stored receipt return rather than replay.
- Raster-change receipts prove only raster change, not successful text insertion
  or a saved document. Independent Writer artifact verification is still needed.

## Validation scope

`tests/test_computer_keyboard_grounding_r6.py` exercises the real attached adapter
and controller with fake native I/O. One actual changed pixel is accepted only for
X11 attached keyboard; pointer, isolated and other-platform keyboard remain strict.
Same-pixel process replacement/PID reuse, window, focus path/metadata, geometry,
source origin, topology and transient/modal changes reject before input-worker
dispatch. Modal changes pause, missing delivery rejects, and successful receipts
return without a second dispatch. The native guardian tests independently cover
scope failure before subsequent key-down and owned release.

The focused seven-file suite passed 273 tests under the finite owned supervisor
(`/tmp/keyboard-grounding-r6-tests-2.json`: primary exit 0, cleanup complete, empty
residuals). The initial test attempt had two fixture failures because the fake
input receipt omitted `injected`; the corrected fixture matches the native receipt
contract. Real Writer verification remains with the existing private-display
application tester; this document does not claim saved-artifact qualification or
grant real-session access.
