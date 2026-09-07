# Pixel replacement integration handoff

The new action is `replace_field_pixels`, single-action only, with required
`region: {x,y,width,height}` and single-line `text` (empty clears). Only visual
expectations are allowed. Native payload region is ROOT/native coordinates.
`replace_field` still requires native accessible identity and independent
same-node AT-SPI readback; no silent Ctrl+A downgrade.

Parent must integrate guardian (agent explicitly forbidden to edit that file):

1. At start of `input_steps`, if kind is `replace_field_pixels`, return
   `pixel_field_steps(action, native, error=GuardianFailure)` imported from
   `src.computer.runtime.pixel_fields`. This resolves the entire key plan before
   dispatch. The existing complete dispatch budget still applies.
2. After input_steps preflight, call
   `pixel_field_bounds(request["action"], expected, monitor, error=GuardianFailure)`.
3. In validate's non-move `scope.assert_snapshot(...point=pointer[0],...)`, pass
   `require_focused_window=request["action"]["type"] == "replace_field_pixels"`.
   This disallows hitting a different same-process window. The existing exact
   scope snapshot, native focus, topology and pointer checks run before EVERY
   keyboard/button step. A failed click/scope/focus check must abort, never type.

No claim is made to know toolkit widget focus without AT-SPI. Even a verified
click on the exact focused native window does not prove the selected rectangle
is an editable widget. Operator/model must ground an actual field from pixels;
only raster change is measured afterward, and contents need visual inspection.

IsEnabled true only describes the session switch. Editable handles depend on
the application's actual exported AT-SPI nodes; GIMP identity is not promised.

Wayland currently reports the compound operation unavailable rather than
claiming unimplemented native guarantees. Existing explicit region clicks work.
