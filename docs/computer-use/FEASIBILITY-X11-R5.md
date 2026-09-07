# X11 R5: attached owned-input continuation, private corpus passed

## Cross-UID lifecycle gate superseded

See [FEASIBILITY-X11-R5-CROSSUID.md](FEASIBILITY-X11-R5-CROSSUID.md) for the final
private root-worker acceptance: distinct sudo wrapper, exact root/helper identity
ACK gates,5 held-input releases,2 capture launch gates, withheld-ACK refusal,
5 actual Xed actions,71 absent host identities and125 focused tests. This replaces
the historical privileged-wrapper blocker below, not main-desktop acceptance.

## Parent identity review correction

The independent final review reproduced an interpreter-provenance bypass: a
non-Drawing Python process could rewrite its own argv to name the installed
Drawing script and pass the earlier scope check. Trusted interpreter and script
inodes do not prove which script a process executed. Parent removed that path.
Attached input now accepts the installed native Xed executable only; every Drawing
interpreter identity is refused before argv inspection. Isolated Drawing support
is unchanged because its process was launched under the owned sandbox authority.
Regression tests cover apparently legitimate and malicious-looking script argv.
No untrusted process or test acted on the real desktop.

## Superseding existing-core-XTEST continuation (2026-09-07)

The earlier capture-only report below is preserved as historical evidence.
This authorized continuation implemented practical attached input, accepted
shared cursor/focus explicitly, and did NOT repeat device creation/removal.
No main-session access, host package install, commit/push, live-install edit,
deployment, Odin restart, master merge or pipeline was performed.

### Delivered runtime artifacts

* `x11_attached.py`: opt-in `input_enabled=True`, default remains capture-only;
  `creates_devices=False`; approved app/source observations, stable source revision
  across unchanged frames and ordinary document-title changes, click/type/key/
  polyline actions, private source-local transform, consumed observations,
  independent guardian release before detach, and raster-change-only receipts.
* `x11_guardian.py`: one action per supervisor process, separate injection child
  and XTEST connections. A potential-down ledger is recorded BEFORE dispatch.
  Controller EOF/cancel, abrupt normal helper `_exit(0)`, completion and a fixed
  nonrenewable two-second lease fence/reap the helper, then release only tracked
  synthetic key/button codes. No blanket key-up, physical injection, XI hierarchy,
  session setting, focus-steal, app launch/close or cursor-restoration operation.
* `x11_owned_device.py`: ctypes X11/Xi/Xtst adapter verifies existing core masters
  and their synthetic slaves. Queries ordinary held keys/buttons, physical slaves,
  raw physical edges and hierarchy notifications. Shared input admission refuses
  busy physical or pre-existing synthetic state. Physical interaction after
  dispatch makes the receipt unknown; same-key overlap is not repaired by
  releasing/repressing physical devices. Cleanup permits unrelated hotplug or
  keymap invalidation only while original core synthetic endpoints still match.
* `x11_app_scope.py`: XRes1.2 authoritative local-client PID, stable proc start
  ticks/executable identity/UID, immutable installed native Xed identity,
  bounded focus ancestry, source intersection, pointer descendant checks and
  same-process transient chains. Terminal/security/control-plane metadata is
  rejected. Only classified Save/Open application dialogs may be eligible with
  a freshly grounded expected modal. Drawing's Information startup is currently
  unrecognized, not silently approved. Ordinary metadata changes do not revise
  source identity; modal identity and safety classification do.

Explicit `runtime_sudo=True` prepends `/usr/bin/sudo -n /usr/bin/env -i` to the
fixed installed helper interpreter/path, with only the sealed worker environment.
This is operator configuration, never model input or implicit fallback. It is
necessary when the service UID cannot inspect the operator's `/proc/PID/exe`.
The scope checks allow a root worker to validate another UID without trusting
WM_PID hints. The sudo argv contract has a stub test; cross-UID/main-session
native execution was NOT exercised by this agent. Install code/interpreter and
configure sudo/Xauthority deliberately before use. Empty authority is `/dev/null`;
no ambient cookie/session-bus discovery occurs.

**Privileged-wrapper lifecycle remains an acceptance blocker.** The private
corpus runs adapter, guardian and application as uid65534 and does not execute
sudo. In sudo mode the adapter records/reaps the sudo wrapper PID, not a proven
root-worker identity. TERM/KILL forwarding, wrapper loss, root helper survival,
cross-UID proc inspection and privileged timeout/cancellation cleanup have NOT
been measured. Do not extrapolate the same-UID corpus's cleanup proof to sudo,
and do not use capture-only wrapper absence as proof that a privileged capture
worker is gone. Before main-session use, add a disposable cross-UID test and an
exact root-helper identity/reaping or conservative quarantine design. There is
no claim here that asyncio timeout, read-worker alarm or reaped sudo PID proves
root-process cleanup. The runtime_sudo argv test is construction-only evidence.

Recovery integration implements `startup_descriptor(session_id)` and synchronous
`runtime_identity_callback`: version1 kind=processes, boot ID, no persistent
devices, input_was_enabled, launch_pending and accumulated exact PID/start ticks.
Before each spawn launch_pending is persisted; after spawn PID is persisted BEFORE
the first request permits any operation. At most2048 identities. Input-enabled
crash recovery cannot infer release merely from process absence; missing release
proof stays unknown/quarantined. Capture-only recovery can use absence evidence.

### Actual private acceptance evidence

Final artifact `/tmp/odin-x11-r5-owned-guardian10.log`, wrapper **exit0**.
SHA256 `a8329611a35de0aad799b86c23f3c4cb4d1c255a2e1bf581e679665a543bc8e9`.
Exact unit `odin-xi2-feasibility-6bd7e97a441b48ffbe3b9d41162cf036.service`.

The SAME private GTK PID12 passed **10/10 held-Control/button1 trials**, two each
of complete, controller EOF, cancel, helper normal abrupt EOF and fixed2s lease.
Every trial queries both synthetic held-state classes empty after release,
requires GTK key/button-release telemetry and fresh subsequent simulated-human
text, confirms helper exit0, same app alive and unchanged six-device inventory.
No native devices were added/removed. The input human simulator uses core XTEST
AFTER owned release, not real hardware. A separate busy-admission case preserves
preheld synthetic Shift/button3 exactly without claiming they are physical input.

| Trigger | Two final release samples, ms |
| --- | --- |
| Complete | 18.137, 18.419 |
| Controller EOF | 18.193, 17.674 |
| Cancel | 18.063, 18.100 |
| Helper abrupt normal EOF | 2.875, 2.890 |
| Fixed lease | 17.678, 17.848 |

Samples are trigger-observation-to-release durations, NOT percentile guarantees
or total action latency. Real hardware same-key overlap is source-backed and
stub-tested via raw edges, not physically tested by this corpus.

The actual PRODUCT backend additionally performed **5/5 Xed actions**: click,
ASCII text, polyline, ctrl+a, BackSpace. XRes/proc/system-executable scope checks
were unmodified. Multiple captures and input kept source_revision1. Type produced
different independent raster digests. Click/polyline with unchanged pixels are
injection receipts only, not successful drawing/semantic assertions. The same
Xed PID39 survived detach; the now-empty scratch app then accepted normal
WM_DELETE_WINDOW and exited0. GTK exited normally on EOF and Xvfb exited0.
37 recovery descriptor callbacks captured18 adapter-worker identities around
launch gates. This is process callback evidence, not durable controller DB testing.

Wrapper census recorded43 PID/start-tick identities. All are absent or no longer
the original identity, no zombies/survivors observed, no census errors, unit
inactive/not-found, cgroup gone. `x11-owned-evidence-check.py` independently
rechecks those facts. The20ms census is sampled, not an exhaustive birth trace.

`validate_action` bundle `x11_R5_owned_guardian_private_acceptance_and_cleanup`
passed **4/4**: actual corpus/cleanup replay, **160 focused tests**, focused ruff
plus git diff-check, and imports without native connection. These are NOT full
suite, Stage6 drawing corpus or main-session acceptance claims.

### Attempts and honest remaining limits

Files `...guardian1.log` through `...guardian10.log` preserve ALL attempts:
1 network-namespace bootstrap lacked CAP_NET_ADMIN;2 missing CAP_SETPCAP for
bounding-set drop;3 workspace root-owned before setpriv. All failed pregraphics.
4/5 exposed redundant MappingNotify poisoning release, fixed by comparing actual
keymap and keeping tracked-code cleanup available on real mapping changes.
6 passed10 lifecycle trials but Xed default private D-Bus activation exhausted
thread limits;7 used a private no-autostart bus and passed10+4 actions.
8 passed10+5 actions and recovery callbacks.9 added a right-button preheld probe
over GtkEntry, opening a context menu and invalidating fixture telemetry; it
failed at the first release telemetry postcondition, not promoted to a pass.
10 moved that human-simulator probe outside the receiver and passed the complete
corpus. All ten exact service/cgroup wrappers reported no remaining identities.
No production security/identity check was relaxed to make an app fixture pass.

The final fixture keeps a root-only namespace bootstrap so installed `/usr`
retains real root ownership, then setpriv drops uid/gid65534 and ALL capabilities
BEFORE private dbus/Xvfb/app/controller execution. Private readonly proc contains
ONLY the new PID namespace. Private network/devices/home/tmp, RO code,1GiB RAM,
no swap,1CPU,64tasks,120s lifetime and exact cgroup cleanup remain enforced.
Three stat-only namespace probes tested ownership (no graphics) before this
bootstrap choice; all transient units exited/collected.

Input text is **printable ASCII on the existing active keymap only**; no keymap,
clipboard or session setting changes. Unsupported text is refused before dispatch.
Shared cursor remains where actions move it. Focus/widget/point checks are bounded
revalidation, not atomic exclusion. Other XTEST clients share synthetic source IDs;
already-held state is refused, but racing same-code synthetic clients are not
separable by source metadata. Server loss, a blocked Xlib supervisor, or killing
the supervisor itself cannot establish owned release; absence remains unknown and
the adapter never kills that supervisor to manufacture cleanup. The two-second
lease was measured with a responsive server, not a server-hang guarantee.

There was NO real-session input, physical device injection, automatic recovery
after supervisor loss, saved GUI deliverable, or full Drawing modal corpus here.
Parent owns integration and any separately authorized main-session acceptance.

### Reproduction (private only)

Run from the development clone:
`/usr/bin/python3 scripts/computer-feasibility/x11-run.py --execute-isolated --owned-guardian`.
Then pass its retained log to `scripts/computer-feasibility/x11-owned-evidence-check.py`.
The harness refuses anything except private uid65534 DISPLAY=:177 with no X0
socket or host home/deploy tree. It is NOT a main-session script.

---

## Historical first R5 increment: capture only

2026-09-07. This increment did not access the real session, create/remove XI
devices, install packages, deploy, restart Odin, commit, push, or touch master.
It is NOT Aaron's requested assisted-input acceptance. I could not complete a
safe usable input backend cleanly within this increment. Input remains denied.

## Implemented artifact

`runtime/x11_attached.py` and `x11_attached_worker.py` provide the actual bounded
capture adapter. Constructor: enabled, explicit display_name, xauthority (empty
means /dev/null, never ambient cookie discovery), monitor_names, app_profile.
`start(session_id)` returns all explicitly named granted sources as opaque IDs,
labels and dimensions. `sources()`, async `select_source(source_id)`,
`observe()`/`capture()`, `pause()`, `resume(consent_generation=...)`, and
`detach()`/`stop()`/`close()` are implemented. Input and export refuse.

Named monitor identity and entire topology are sealed at start; replacement or
topology change requires new consent/start. Every capture revision is new. The
delivered-to-source rational transform is explicit. There is NO input transform,
input scope, native display/XID/global coordinate in the public frame. Focus is
unknown/false: no forged WM_CLASS hint is used as authority. app_profile does not
constrain monitor capture, and does not grant application input. The detach
receipt says owned_devices=not_created, input_was_enabled=false, not that active
input release was tested.

Read-only workers each use an independent five-second alarm and parent timeout;
timeout/cancel/detach reap only exact owned children. Launch/detach are fenced.
No live-session apps are launch/termination targets. No native input APIs are in
this runtime implementation.

## Actual experiments, including failures

All runs used existing DynamicUser/systemd/bwrap private :177 fixture with no
host home/proc/device/display sockets. Every wrapper records exact sampled
PID/start-tick identities, absent cgroup, no survivors including zombies, and no
census errors. No screenshot was retained or posted.

* `odin-x11-r5-send-event.log`: failed pointer comparison fixture (included reply
  sequence metadata); core event-mask SendEvent also delivered no text.
* `odin-x11-r5-send-event2.log`: exit0. Owner-directed NoEventMask delivered GTK
  `a` and release, with unchanged server pointer, focus and keymap. Normal app
  EOF and cleanup passed. This was compatibility, not an input safety pass.
* `odin-x11-r5-attached-corpus1.log`: pre-display failure because /usr/bin/cc's
  alternatives link is absent inside the /etc-less sandbox. Switched to gcc.
* `odin-x11-r5-attached-corpus2.log`: failed four-case corpus, GI EventButton
  fixture decoding TypeErrors. Corrected get_button()/get_coords().
* `odin-x11-r5-attached-corpus3.log`: failed actual four-case corpus. Text receipt
  and server-state checks passed. Pointer input did NOT safely target the robot:
  while the human held buttons, GTK routed synthetic events to the human canvas.
  Human ink changed. With SAME button1 held, the synthetic release cleared the
  human app-side held-button ledger despite server button state staying held.
  Normal human post-EOF click/text and app survival passed. This is concrete
  application misrouting/interference, not theoretical separation discomfort.
* `odin-x11-r5-attached-corpus4-crossing.log`: failed idle-only compatibility
  variant with synthetic EnterNotify before pointer input. Robot canvas got no
  pointer receipts or pixels. No dangerous held-human cases were repeated.
* `odin-x11-r5-capture-adapter.log` and `...adapter2.log`: actual adapter initially
  failed because python-xlib writes authority warnings to stdout. Worker now
  redirects native stdout diagnostics to suppressed stderr, preserving pure JSON.
* `...adapter3.log`: source enumeration succeeded; capture failed because raw
  Fraction fields were not JSON serializable. Fixed rational public transport.
* `odin-x11-r5-capture-adapter4.log`: exit0, actual product adapter captured private
  GTK 900x500 PNG (3122 bytes), independently decoded nonuniform pixels, no input
  scope, unchanged pointer/focus/keymap, app survived detach then exited normal
  stdin EOF. Exact children, unit and cgroup cleaned. This is a capture-only pass.

The SendEvent corpus preserves all earlier held-input failures in the logs. Its
current script runs only the last idle-only crossing variant. It has no release
supervisor and must not be mistaken for production code.

## Why other lifecycle candidates remain unapproved

Source research at upstream Xorg commit
`fc625fe172d9f6a149a594b5214364bedf680239` found:

* Device Enabled=false permits custom masters, but DisableDevice floats XTEST
  slaves. XTEST slaves cannot be disabled (BadAccess) or publicly reattached
  (BadDevice). Enabled floating slaves cannot honestly be reported inactive.
* Existing core XTEST avoids new devices, but the per-master slave is shared
  among clients. `Xi/exevents.c` ET_ButtonRelease explicitly checks attached
  slaves and preserves master buttons still physically held. ET_KeyRelease has
  no corresponding aggregation. Synthetic down, physical same-key down, synthetic
  up can clear master key state while physical slave still holds it.
* Busy-human admission reduces collisions but cannot itself remove the later
  press/release race. Buffered down/up isn't an atomic X protocol operation.

These are source-backed constraints, not runtime certification of the installed
server. No existing-core-XTEST or disable lifecycle was tested. References:
`dix/devices.c`, `Xi/xichangehierarchy.c`, `Xi/exevents.c`, `dix/getevents.c`,
`mi/mieq.c`, `xkb/xkbPrKeyEv.c`, `Xext/xtest.c` in that upstream commit.

## Tests and remaining work

64 tests passed: 25 new attached contract/cancel/timeout/reaping tests plus 39
existing capture tests. Focused ruff and git diff --check passed. Tests use safe
stubs and do not claim held-input lease coverage. New deterministic four-monitor
selection test includes 3440x1440, 2560x1440 and two1920x1080 sources.

No application-safe input, controller-loss held-input release, approved-app
binding, production input guardian, GTK Drawing/Xed task corpus or real-session
input acceptance was completed. Keep input_supported=false. Parent integration
must explicitly admit capture-only sessions separately, never mark lifecycle
verified to sneak through the existing input gate.

Evidence SHA256:

* corpus3: 7023a8b6e62a56759fc5c1c1e13c23ac8c594c9fbb635e751d434edf44e6fbfa
* corpus4-crossing: 444a1c839347c00bda1ddee10763e78ec4c4975161bd8a7e05167ebc8ca7c9a0
* capture-adapter4: 267c00025e8ce5c92ad5685ca16bd924601e5c37084d5fc8cb3139e62f9da14a
