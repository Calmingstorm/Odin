# Hyprland Phase 3: native qualification work, not a backend

**Gate: INCOMPLETE / NO-GO for live input.** These are isolated research assets.
They are not installed, packaged, enabled, or called by Odin runtime. No Pinta
draw test is authorized by these results. No claim that a Hyprland core patch is
necessary has been established.

## Exact target and source findings

Target: Hyprland 0.55.2, upstream commit
`39d7e209c79d451efab1b21151d5938289da838d`. All paths below are in that
upstream commit, not approximate references to current master.

* `src/protocols/VirtualKeyboard.cpp:125-143`: `releasePressed()` emits releases;
  `destroy()` uses `input:virtualkeyboard:release_pressed_on_close`. This
  defaults false. It covers keys, not a demonstrated modifier-state cleanup.
* `src/protocols/VirtualPointer.cpp:8-15,36-42,94-96`: pointer requests emit
  button events; destroy emits destroy, with no per-resource button ledger or
  owned-button release. `PointerManager.cpp:1108-1110` only removes listeners.
* `src/managers/input/InputManager.cpp:715-731`: the cancellable global mouse
  event drops the `SP<IPointer>` identity; held buttons are aggregate by code.
  An external watcher and blanket global release are not ownership proof.
* `src/managers/SeatManager.cpp:145-170`: key arrays and modifiers reach the
  new focus before `keyboardFocusChange`. An ordinary post-focus observer
  cannot prevent a held-key transfer. The candidate interposes before this.
* `src/plugins/PluginSystem.cpp:114-125,143-188`: failed init calls
  `unloadPlugin(..., true)`, skipping pluginExit. But core removes function hooks
  then registered dispatchers before dlclose. An inert dispatcher closure can
  own a RAII ledger whose destructor runs before code is unmapped. This is a
  credible non-core lifetime primitive, **not a native release proof**.
* `src/protocols/SessionLock.cpp:198-200`: newLock is emitted BEFORE locked=true;
  the candidate latches revocation from the event, rather than trusting a
  false re-read in that callback.
* A <=250 ms scope lease must be checked synchronously before each event.
  Timer dispatch alone cannot promise a real-time wall-clock release while the
  compositor loop is stalled. No such real-time guarantee is claimed.

## Assets

* `hyprland-ledger-plugin.cpp`: exact-version gated, NON-SHIPPING API-function-
  hook experiment. Native pointer/key/modifier identity; pre-focus fencing;
  pidfd/client-destroy/lock/deadline revocation; raw event-loop sources; sole
  dispatcher-owner RAII teardown; destroys the exact owned client on unload.
  Read its complete limitations before using it. Initial physical button-held
  census, motion/axis gating, production authenticated consent, policy identity,
  reconnect admission and full modifier/IME/concurrent-input proof are absent.
* `hyprland-ledger-ejector.cpp`: artificial `unloadPlugin(victim,true)` exercise.
  This must be described as SIMULATED EJECT, not real runtime crash recovery.
  Actual init-throw mode in the victim is pre-arm; neither path has been run.
* `hyprland-native-sender.c`: native virtual keyboard/pointer fixture. Uses an
  inherited peer-checked fd, never environment socket autodiscovery. The
  supervisor connects in the child before exec, preserving wl_client PID.
* `hyprland-wire-receiver.c`: xdg-shell/shm surface and wire-level receiver,
  including keyboard-enter held-key arrays, pointer releases and modifiers.
* `hyprland-lock-fixture.c`: native isolated lock request fixture.
* `hyprland-native-proof.py`: pending corpus supervisor, hard-isolated `/proof`
  only. Verifies an actual nonzero-size output before any native case. It is
  intentionally not admitted as tested merely because it compiles.
* `hyprland-native-receiver.py`: unused alternate GTK receiver. The native
  receiver is required for held-key enter-array evidence.
* `hyprland-isolated-lab.py`: disposable mount/user/PID/network/IPC/UTS namespace
  launcher with fresh HOME/runtime/D-Bus, fixed FIFO `proof`/`stop`, no live
  installation, input nodes, card nodes, host bus or active display socket.
  NVIDIA render nodes are the current fixture configuration, not portable
  production defaults. No modeset node is exposed.

## What was actually executed

On the target host, C sender, wire receiver and lock fixture compiled with
`cc -std=c11 -Wall -Wextra -Werror -O2`, including generated protocol C. Both
plugins compiled against installed 0.55.2 headers. Receiver and lock-fixture
socketpair-only timeout smoke tests exited unsuccessfully as expected; these
are transport checks, NOT compositor or held-input tests.

The initial Weston 15.0.1 headless parent could not supply the protocol/allocator
required by Aquamarine. A diagnostic compositor-version-only shim was attempted
but did not provide dmabuf capability; it was removed from the final launcher.
No fake dmabuf version or fabricated allocator was used.

Signed Arch packages were downloaded, verified with the host's package keyring,
and extracted only into the private proof directory (not installed globally):
labwc 0.20.1-1, wlroots0.20 0.20.2-1 and libsfdo 0.1.4-1. labwc's real headless
GLES2/GBM parent successfully allocated NVIDIA buffers. No shim in the final run.
Unmodified Hyprland then started in the namespace and accepted peer-pinned IPC.

**Compositor startup was not success:** its initial monitor list was empty.
Creating a headless output returned `ok`, but the output was 0x0. Aquamarine
logged GBM allocation failures at both 800x600 and 1920x1080. A final attempt
to create a Wayland output also returned `ok`, but the monitor list stayed empty.
The corrected harness rejected this before any input test.

Final retained result: `native_cases=[]`, `all_test_expectations_met=false`,
`shipping_gate="INCOMPLETE / NO-GO"`. Thus **no actual BUTTON/KEY SIGKILL release,
unload/eject release, focus-transfer safety, modifier preservation, or 250 ms
scope/lock corpus was proven**. The fixture is a plausible starting point, not
a substitute for the requested full-native proof.

Final owned lab parent and Hyprland exited 0; failed harness exited 1. No owned
lab compositors or receiver/sender/lock processes remained. The pre-existing
active compositor stayed alive and was never connected to, injected into,
reloaded, upgraded or killed. Live Odin config/data were not touched. Full host
logs/namespace details are retained privately, never committed to this repo.

## Next gate, before any live input

Fix or replace only the isolated rendering fixture so the unmodified target
actually has a valid output and rendered receiver. Run positive explicit
release and stock-SIGKILL negative controls first. Then prove key AND button
release for guardian death, graceful unload, simulated eject and actual failed
init; inspect receiver event ordering, no keys on the new focus, no input after
deadline/lock/revocation, and physical overlap/modifier preservation. Do not
claim full support while initial physical state and motion/axis fencing remain
unimplemented. If a robust no-core path cannot meet those requirements, report
that specific result and wait for the user's compositor-modification decision.
