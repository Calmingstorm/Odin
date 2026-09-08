# R32 compositor-loop scope companion

`assets/hyprland-input/scope-plugin.cpp` is pinned to Hyprland 0.55.2 commit
`39d7e209c79d451efab1b21151d5938289da838d` and its matching API hash. Build with
C++23, `-shared -fPIC`, `pkg-config --cflags hyprland json-c`, and
`pkg-config --libs json-c`. ABI mismatch refuses initialization.

Compilation and source-contract tests are **not** evidence of receiver delivery,
cleanup under live unload, or successful drawing. Phase 4 remains separate.

## Transport

Socket: `$XDG_RUNTIME_DIR/odin-hyprland-scope.sock`, mode 0600, in a private
compositor-owner runtime directory. Startup never unlinks existing paths.
`SO_PEERCRED` permits compositor UID and root readers. Root Python may obtain
snapshots; the user guardian owns its own Wayland connection. Native identity
comes from `wl_client_get_credentials`, never a supplied PID.
Each transport peer also retains a pidfd, checked for liveness before device
authentication and each owned event; dead-peer numeric PID reuse grants nothing.

One newline-terminated JSON object per request, one outstanding request per
connection, no pipelining. Cap: 8192 request bytes, 16 peers, 64 live snapshots.
Transport and all authorization execute in the compositor event loop.

Guardian ordering: connect and exchange `status` **before creating** VK/VP;
create one of each on the same Wayland client, bind pointer explicitly to the
consented output, then Wayland roundtrip. This makes pre-arm events denyable.

- `{"op":"snapshot","output_name":"DP-1"}` returns fresh 192-bit hex
  `token`, `measured_monotonic_ns`, `locked:false`, `safe_focus:true`,
  `native_wayland:true`, `revision`, `output`, `focus`.
- `output`: `name,x,y,width,height,pixel_width,pixel_height,scale,transform`.
- `focus`: `token,serial,pid,wm_class,title,x,y,width,height,modal:false`.
  Geometry except scale is integer logical global coordinates or pixel sizes.
  Fractional animated geometry refuses, never rounds. Parented/modal toplevels,
  nonnative surfaces and Xwayland refuse. Native scope is provenance and geometry
  evidence, not application or task consent from the authenticated operator.
- `{"op":"arm","token":"...","lease_ms":250}` consumes a snapshot less
  than 250ms old; validates target/output, same-client guardian devices, and
  refuses while human keys/buttons are held.
- `{"op":"renew","token":"...","lease_ms":250}` uses the original arm
  token on the same guardian connection while the old lease remains valid.
  Fresh Python snapshot tokens do not replace the active guardian arm token.
  Both arm and renew also require `deadline_monotonic_ns`: an actual absolute
  monotonic nanosecond deadline, future and within 250ms of dispatch. The
  companion clamps the relative lease to that absolute deadline. Transport delay
  cannot create fresh authority from an expired permit.
- `{"op":"status"}`, `{"op":"release_all"}`, `{"op":"stop"}`.

Replies: `ok,version,armed,keys,buttons,accepted,rejected,failed,reason,revision,
release_submitted,release_acknowledged,receiver_proven`. Refusals add `error`.
Counters increase over plugin lifetime; compare deltas, not absolute zero.
`receiver_proven` is always false. Ledger acknowledgement proves compositor-side
submission/bookkeeping, not application receipt. Failed release entries remain
available for another operator recovery attempt.

## Event gates

Function hooks execute immediately before native InputManager key, modifier,
button, axis, relative-motion and absolute-motion handlers. CVirtualPointer
populates motion device identity beforehand. Each owned event checks surfaces,
native window, geometry, output, epoch, lock, pointer mapping and strict lease
deadline. Pointer destinations must remain inside and hit the authorized
window. There is no asynchronous check-then-send authorization shortcut.

Pointer identity is captured around pinned `newVirtualMouse` and its synchronous
single-device append, not by assuming newPointer observer order. Keyboard
identity additionally matches the native device's client pointer.

Seat focus hooks release before transferring surfaces. Epochs track
focus/lock/output/workspace/config/layer changes; target geometry/lifecycle
signals also invalidate. Dirty-document title updates are harmless. Resource
position/size changes are additionally intercepted at `CWindow::updateWindowDecos`,
which both real-position and real-size animation updates invoke in the pinned
source. The exact symbol was verified in the target executable's export table.
This catches position-away-and-back epochs, not just final geometry differences.

Resource
destruction, Unix EOF, expiry and recovery drain the owned ledger. Unrelated
virtual and physical devices remain outside Odin's owned-device gate.

State belongs to a dispatcher closure. Hyprland removes hooks before dispatchers
and dlcloses afterward. Both normal and exceptional unload therefore use the
same destructor without reading removed trampoline pointers.

## Accepted residuals and operational limits

Load once during explicitly consented setup/recovery, never per action or as an
installer side effect. Loading/unloading may make Hyprland reread configuration;
the plugin never edits configuration.

Hyprland input is best-effort. Hard guardian kill or simultaneous same-button
contention with physical input may leave or clobber held input. R32 accepts
these Hyprland-only residuals; no universal release guarantee is claimed.
Recovery uses the socket or `hyprctl dispatch odin-scope-recovery`.
Compositor crash/SIGKILL cannot run plugin cleanup.

No live input, plugin load, service restart, or configuration mutation is needed
for source implementation and compilation verification.
