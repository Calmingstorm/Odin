# R31: reload-free owned release, focused attempt and hard exit

## Decision

**NO-GO for the full owned-only release contract. Phase 4 stays CLOSED.**

The focused candidate was a surviving, sole device-owning supervisor. Even
granting it perfect guardian-death detection and successful releases on the
original resources, stock Hyprland's pointer aggregation can release another
device's same-button hold. Keeping a socket alive fixes actuator lifetime, not
that ownership defect. The plugin route is excluded, not retried.

**For the unchanged full mixed-source contract, the justified next direction is
a compositor-side ownership/aggregation and teardown change, for the operator's
last-resort decision.** No such change is implemented or authorized by this
report. A configuration reload or the virtual-keyboard close option alone would
not fix the pointer defect.

This is a bounded source-backed conclusion about the reviewed mechanisms, **not
a mathematical proof that every conceivable client architecture is impossible**.
In particular, uinput has a genuinely promising *libinput-only* route. It is not
correct to claim that uinput cannot clean up on device-owner death. Its limitation
here is mixed-source preservation and lack of native qualification, not the
absence of any removal cleanup.

## Exact evidence and its limits

Inspected upstream pins, matching the installed package versions:

| Component | Version / upstream commit |
| --- | --- |
| Hyprland | 0.55.2 / `39d7e209c79d451efab1b21151d5938289da838d` |
| Aquamarine | 0.12.1 / `06669631175b4db2383b94e7f8c13f45a9d28757` |
| libinput | 1.31.3 / `26191d396d74d505541d6311f0b4ae68d791b890` |

The target was inspected read-only. Native cases, injected events, created input
devices, plugin loads, lock requests, and receiver launches in R31: **zero**.
There is **no receiver-observed release evidence** and no full safety-corpus pass.
Package-version agreement is not a claim of a byte-reproducible distro build.

The accompanying `scripts/computer-feasibility/hyprland-owned-release-counterexample.cpp`
is an executable **source-logic model**, not a running Hyprland fixture. It
isolates the three cited decision blocks under stable ordinary focus, pointer
capability, no binding/decorations/DnD interception, and successful delivery.
It demonstrates a counterexample even under favorable cleanup assumptions;
it does not simulate a successful native test or certify a watchdog.

## One focused candidate: survivor owns devices, guardian owns requests

Proposed design, rejected at the semantic safety gate before native execution:

1. An independent supervisor is the sole owner/writer/reader of the Wayland
   connection and virtual devices. A worker called the guardian never owns them.
2. The supervisor records held state before dispatch, serializes requests, uses
   generation-bound commands and a short monotonic lease, and watches the exact
   guardian process through a pidfd. No concurrent libwayland FD takeover.
3. On guardian death, EOF, expiry or explicit stop, it stops accepting new work,
   drains only its recorded keys/buttons through the original resources, waits
   for ordering acknowledgement, and then destroys the resources.
4. A receiver/postcondition check would still be required: a Wayland roundtrip
   alone does not certify application release. Partial work is never replayed.

This can credibly fix **worker death while the actual device owner survives**.
It does not by itself fix actual-owner death. A duplicate socket keeps a client
alive only while another holder survives; safe protocol/ledger takeover also
needs consistent state after partially sent requests. Renaming the surviving
owner does not demonstrate its own SIGKILL safety.

More decisively, even a perfectly working survivor fails the overlap example
below. Building an injector and deliberately holding input is unnecessary to
establish that this candidate cannot satisfy the stated guarantee.

## Pointer counterexample: exact-resource release is not ownership-selective

All paths in this subsection refer to the pinned Hyprland source.

- `src/protocols/VirtualPointer.cpp:36-42` emits button requests directly.
- `src/devices/VirtualPointer.cpp:31` forwards them.
- `src/managers/PointerManager.cpp:958-959` calls `onMouseButton`.
- `src/managers/input/InputManager.cpp:726-731` stores button **codes**, appends on
  press, and erases **every occurrence of that code** on one release.
- `InputManager.cpp:892` and `src/managers/SeatManager.cpp:294-307` send the event
  to the receiver without pointer-owner identity.
- `src/protocols/core/Seat.cpp:219-239` suppresses duplicate presses and sends the
  first matching release. It too tracks codes, not owners.

Choose `BTN_LEFT`, stable ordinary focus and no event interception:

1. A human's physical pointer holds it.
2. Odin's Wayland virtual pointer presses it. The second receiver press is
   suppressed.
3. The guardian dies. Grant the supervisor perfect recovery.
4. The supervisor releases through **Odin's original resource**.
5. Hyprland clears the aggregate code and sends button-up while the human still
   holds it. The human's later release is suppressed as no longer held.

Thus this is not merely a defect of *replacement-device* cleanup. Recording
which codes Odin pressed is insufficient to preserve another owner's hold.
It clears receiver/compositor state, not the physical device's hardware state.

Destroying instead is not a fix: `VirtualPointer.cpp:8-15,94-96`,
`devices/VirtualPointer.cpp:17-20`, `InputManager.cpp:1499-1509` and
`PointerManager.cpp:1108-1110` destroy/remove the pointer and listeners without
an owned held-button release path. A different client can sometimes clear the
aggregate code with an explicit release; the accurate limitation is that it
cannot thereby provide **ownership-selective** cleanup, not that release events
from another client are universally ineffective.

## Uinput/libinput: real improvement, but not the full guarantee

This dependency check closes a material gap in a Hyprland-only source review.

- libinput `src/evdev.c:2955-2985` removes a device by first suspending it.
- `src/evdev.c:2880-2897` calls the dispatcher's suspend hook.
- `src/evdev-fallback.c:1201-1270` releases tracked keys/buttons and returns the
  fallback device to neutral during suspension.
- `src/libinput.h:1520-1534` documents the per-button seat-wide count.
- Aquamarine `src/backend/Session.cpp:579-592` forwards a press only when that
  count becomes 1, and a release only when it becomes 0.

For a properly classified uinput pointer and human physical pointer within the
same libinput aggregation, owned removal/release can preserve a same-button human
hold. Correct last-uinput-owner destruction and native receiver behavior remain
unqualified here; these are source findings, not an executed SIGKILL result.

However, Wayland virtual pointers bypass that count. Even granting perfect
kernel/libinput cleanup, another source-level counterexample is:

1. A **non-Odin Wayland virtual pointer** holds `BTN_LEFT`.
2. Odin's uinput pointer presses it; its libinput count becomes 1.
3. Odin's owner dies; grant successful removal-generated release. The libinput
   count becomes 0, so Aquamarine forwards the up event.
4. Hyprland clears the shared code and sends button-up although the other
   virtual pointer remains held.

This mixed-source case is part of preserving other input without excluding or
reconfiguring it. It is **not a claim that a Wayland virtual pointer was observed
on the current primary desktop**. The pre-existing named virtual device there
is a ydotoold device; its name alone is not evidence of the Wayland protocol path.
The counterexample concerns an allowed source, including a subsequently created
one. Polling inventory cannot atomically exclude it at compositor dispatch.

A separately approved libinput-only contract would change this analysis. It
would require enforceable cohort admission and native proof, not a silent change
of requirements. No physical device is grabbed, rerouted, disabled or reset to
make this case pass. No uinput device is created on the primary session.

## Other proposed exits

| Mechanism | Finding |
| --- | --- |
| Passive evdev observer and delayed release | Cannot read Wayland-virtual held state; reading physical state then dispatching has a race. Waiting indefinitely for human release is not independent bounded cleanup. |
| Release then re-press the human's code | Exposes an application button-up first and fabricates a new press; not preservation. |
| Global/seat reset | `InputManager.cpp:2031-2041` releases aggregate buttons and clears the list. It is not owned-only. |
| IPC `sendkeystate` / targeted shortcut | `src/config/shared/actions/ConfigActions.cpp:1481-1547` sends code-only seat events and changes/restores focus/modifiers. It does not remove one device's owned contribution. |
| `release_pressed_on_close` | `VirtualKeyboard.cpp:125-142` is a conditional **keyboard-only** cleanup, live value false. No virtual-keyboard protocol request enables it. Changing it is outside the unchanged-config rail and cannot fix buttons. |
| Plugin load/unload | `src/plugins/PluginSystem.cpp:135,192-193` schedules configuration reload. Excluded by R31; not attempted. |

Do not generalize the pointer overlap defect to keyboards. Hyprland has
per-keyboard pressed state, `InputManager.cpp:1814-1835` checks other participating
keyboards, and `1582-1595` suppresses an up while another holds that key. Depressed
modifiers are also merged at `1634-1639,1838-1854`. These paths have sharing/IME
conditions and were not natively qualified here, but the pointer counterexample
is not evidence that the normal merged keyboard path has the same defect.

## Hard exit and minimum compositor-side direction

Stop this attempt. Do not retry the plugin, create live holds, rerun the failed
rendering experiments, or proceed to draw-in-Pinta. A nested compositor would be
appropriate to qualify a viable candidate; it is not necessary to expose this
source-level counterexample, and no nested/native success is being claimed.

For the unchanged full contract, the ownership fix must cover all contributions
at their common aggregation boundary, preserving device identity until accounting
is complete. It must remove only the dying/revoked owner's contribution, emit a
seat release only when the final contributor is gone, and retain unconditional
teardown cleanup for the actual actuator owner. A virtual-pointer-only
"send ups in destructor" patch is insufficient because the overlap bug remains.

This is a direction for the operator's core-change decision, **not a proposed
patch with robustness proven**. Shipping/integration, focus/lock fencing, scope
expiry, modifiers/IME, crash recovery, and the full receiver-observed corpus
would still need implementation and qualification. No compositor code, installed
configuration, runtime input admission, or packaging is changed by R31.

## Executed checks and preservation

The source-logic artifact compiled with
`c++ -std=c++20 -Wall -Wextra -Werror -O2` and ran successfully both locally and
on the target host, without any display environment or compositor connection
on the target run. Its four checked cases were:

| Source-logic case | Observed artifact result |
| --- | --- |
| Sole owner, explicit release | Modeled receiver clears normally |
| Physical pointer plus Odin Wayland pointer | Premature up; later human up suppressed |
| Physical pointer plus Odin uinput, same libinput cohort | Human overlap preserved; final release clears |
| Other Wayland pointer plus Odin uinput | Premature up despite assumed perfect owned removal |

These are two controls and two source-level counterexamples, **not four native
passes**. The artifact explicitly prints `native cases=0; receiver evidence=none;
live gate=CLOSED`. No pytest/full product suite was run for these documentation
and nonshipping research-only changes. `git diff --check` passed.

The remote compilation used a fresh `/tmp` directory; its binary and directory
were removed and absence verified. No dependency packages were installed on the
target. Upstream dependency source was obtained only in local research storage.
No nested compositor, live receiver, guardian or watchdog was launched.

Before/after read-only checks showed the same primary Hyprland PID **2272**, Odin
PID **998**, active Odin service and **zero service restarts**. The live Odin
configuration hash, aggregate Hyprland configuration digest and output-query
digest were identical. The primary plugin list stayed empty. The target's
pre-existing dirty checkout remained unchanged; its modifications are not R31
work. No live application data was written, and no physical input was inspected
through evdev, grabbed, reset or injected. Device inventory is not proof of
held-state cleanliness; no test-owned held contribution was created.

Public artifacts contain no target credentials, network endpoint, raw window
inventory or private configuration. The report and source model are the R31
deliverables; production Hyprland support remains incomplete.
