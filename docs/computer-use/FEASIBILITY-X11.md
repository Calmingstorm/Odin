# X11 independent-input feasibility — bounded fixture results

Scope: R1 independent input gate only. Read the entire
DECISIONS.md (198 lines) and 09-odin-replan.md (109 lines) before preparation.
Prepared first and waited. Parent explicitly authorized execution after the R1
contract/import/geometry checks passed. Experiment date: 2026-09-06 UTC.

**Verdict: assisted-session eligibility is NOT established, with concrete negative
evidence.** Separate masters work across two windows even in one GTK process, but
two entries in one window share toolkit focus. Abrupt input-client disconnect
leaves held input down; subsequent owned-device removal caused the GTK fixture to
exit. See the same-process follow-up below. Real desktop window-manager behavior
and physical hardware remain untested.

## Reproducible harness

`scripts/computer-feasibility/x11-run.py --execute-isolated` launches a uniquely
named systemd DynamicUser service and bwrap namespace sandbox, patterned after
the existing runtime profile without editing it. It exposes only `/usr`, font
configuration and these read-only harness files; workspace/home/run/tmp are
private memory-backed storage. No host display, session bus, home, network,
credentials or device access. Xvfb is fixed to `:177` **inside its own network,
mount, PID, IPC and user namespaces**. No display discovery or fallback exists.
The default invocation refuses execution. Root is refused inside the harness.
Private dbus-run-session, resource/time caps and owned-child cleanup are explicit.
The final sandbox intentionally has **no procfs**, no GLX, and no nested-userns
disable flag (see compatibility findings below). These are fixture restrictions,
not modifications to the existing runtime or a production profile recommendation.

Two GTK3 fixture processes start before the input controller attaches. A second
real XI2 master pointer/keyboard pair is created. Separate X client connections
select their master pointer using XISetClientPointer; XTEST sends actual input.
The human simulator retains the original master pair. XIQueryPointer/XIGetFocus
snapshots include pointer position, per-master focus, modifier and button state;
XI2 raw telemetry includes device/source IDs. GTK receipts include device/source,
event type, text changes, menu activation and modal responses. Rendering a second
cursor is not an acceptance criterion.

Planned phases: independent typing with simulated human Shift held; robot motion,
click, drag concurrent with human motion, scroll, owned-only cancellation with
human Shift preserved, menus/modal grabs and human typing during those grabs.
Detach removes only the new master pair; shell verifies both original application
processes remain alive before separately shutting down the disposable fixture.

## Limitations

- A custom GTK fixture is not a representative real-world application corpus.
- There is no window manager; toolkit-local focus and grabs do not prove desktop
  window-manager/compositor policy or same-process multi-document focus behavior.
- Simulated human input uses a separate XTEST client, not physical hardware.
- Finite phase snapshots may miss transient focus or pointer interference; raw
  telemetry plus application receipts must be reconciled, not blindly marked pass.
- This is interleaved input on two independent clients, not a sustained concurrent
  physical-human workload. The human pointer is deliberately moved once from
  (70,80) to (80,80) during Odin's held-button drag; all other sampled changes are
  Odin's only. There is no move-back mechanism.
- Raw X11 evidence is XI2 raw events plus per-master queries and GTK event delivery.
  A separate legacy core-only application receipt probe has not been executed.
- The same-process follow-up found input-client disconnect does NOT automatically
  release held input, and owned-device removal did not preserve application life.
- The script's exit status proves only execution, never semantic coexistence.

## Preparation evidence

Installed pkg-config versions observed without a graphical connection:
Xlib 1.8.7, Xi 1.8.1, Xtst 1.2.3, GTK 3.24.41. GCC strict syntax-only check,
Python AST parsing, shell syntax and default invocation refusal passed before go.

## Executed evidence

Clean final run command: `python3 scripts/computer-feasibility/x11-run.py
--execute-isolated`, working directory `${SOURCE_ROOT}`.
Run ended 2026-09-06 23:30:33 UTC, exit 0, no XERROR or Python tracebacks.
Exact retained tool result ID: `a1975243f31f4545b6fe116fda616535`
(39,602 bytes, read through EOF; retention expires 2026-09-07 23:30:33 UTC).
Owned unit: `odin-xi2-feasibility-b1aa9eb4befa4c16854a8df75a92db91.service`.
Private fixture UID 65534, Xvfb/X.Org 21.1.11 (release 12101011), XI2 negotiated
2.2, GTK runtime 3.24.41. Human masters 2/3, XTEST slaves 4/5; Odin masters 8/9,
XTEST slaves 10/11. Human GTK window 2097154, Odin GTK window 4194306.

Observed results, **one clean fixture trial, not a corpus score**:

| Phase | Observed server state and actual app receipt |
|---|---|
| Independent typing | Human pointer (70,80), focus 2097154, Shift modifier 1. Odin pointer (470,80), focus 4194306, modifiers 0. Human GtkEntry changed to `H`; Odin GtkEntry changed to lowercase `a`. |
| Motion/click | Odin moved to (470,150); human stayed (70,80). Robot GtkDrawingArea received Odin-source motion, button press and release. |
| Drag + human motion | Odin held button 1, moved through (510,180) to (580,210); human moved once to (80,80). Robot GTK motion had state 256; release arrived at local (150,90). No drawing artifact was claimed. |
| Scroll | XI2 raw button 4/5 press/release on master 8/source 10; two GTK GDK_SCROLL receipts from Odin feasibility pointer, human unchanged. |
| Owned cancellation | Before: human mods=1, Odin mods=4/button1 held. After releasing ONLY Odin Control and button1: human mods=1, Odin mods=0/buttons zero. Human pointer remained (80,80), focus 2097154. |
| Menu/grab | Robot receipt `menu-open`, then human entry changed from `H` to `HJ`, then robot `menu-activated`. Both sampled per-master focus values remained on their respective windows. |
| Modal/grab | Robot receipt `modal-open`, human entry changed to `HJK`, then robot `modal-response`, response -5 (GTK OK). No global-focus isolation guarantee is inferred from this GTK fixture. |
| Detach | `DETACH removed-owned-master-pair errors=0`; `kill -0` confirmed both pre-existing GTK processes alive after removal. Fixture owner subsequently terminated/waited only its two app PIDs and Xvfb PID. |

Selected exact receipt excerpts (monotonic timestamp seconds):

```text
{"t": 3890113.124910702, "role": "human", "kind": "text", "value": "H"}
{"t": 3890113.124882672, "role": "robot", "kind": "text", "value": "a"}
{"t": 3890114.328144163, "role": "robot", "kind": "menu-open"}
{"t": 3890114.478242233, "role": "human", "kind": "text", "value": "HJ"}
{"t": 3890114.628629782, "role": "robot", "kind": "menu-activated"}
{"t": 3890114.77991008, "role": "robot", "kind": "modal-open"}
{"t": 3890114.92933231, "role": "human", "kind": "text", "value": "HJK"}
{"t": 3890115.080248818, "role": "robot", "kind": "modal-response", "response": -5}
RAW type=13 device=9 source=11 detail=38
RAW type=14 device=9 source=11 detail=38
RAW type=13 device=3 source=5 detail=43
RAW type=14 device=3 source=5 detail=43
```

Human released its own Shift only after the menu/modal/cancellation cases. No
all-key cleanup command, core pointer restoration or painted cursor was used.

## Failed preparation executions and compatibility findings

Eight initial launches failed before useful input evidence; a ninth completed
run had invalid GTK telemetry. They are NOT passes. The following summarizes
causes/fixes (not a one-to-one numbered execution log):

1. bwrap `--disable-userns` required explicit `--unshare-user` despite unshare-all.
2. Fresh procfs mount failed under the systemd restrictions. A brief diagnostic
   with ProtectKernelTunables=no also failed before child execution; reverted.
   Final fix: no procfs at all, rather than expose the host procfs.
3. `/dev/shm` is not a distinct mount here; retain read-only `/dev` only.
4. `--disable-userns` itself needed writable proc sysctl access; omitted it. The
   harness still unshares user namespaces, drops capabilities and enables NNP,
   but it does NOT claim nested-userns creation is forbidden. This fixture loads
   trusted local harness code only; no downloaded or adversarial content.
5. Private D-Bus needed a minimal passwd/group entry for fixture UID 65534.
6. Xvfb `-version` was unsupported; runtime xdpyinfo provided the actual version.
7. Xvfb startup crashed inside the installed NVIDIA/GLX stack without host devices;
   GLX was disabled for this 2D event-only probe. No driver/host settings changed.
8. First completed input run had a GTK Python telemetry `_ResultTuple` conversion
   error. Its app-event evidence was invalid. Fixed extraction and reran; final
   harness now treats app tracebacks as execution failures.

Xvfb still prints nonfatal missing XF86 keysym warnings and a private socket
directory owner warning; no privilege or host-directory change was used to hide
them. Private GIO local VFS/simple IM removed unnecessary private-bus activation.

## Cleanup and validation

Every launch printed its unique owned service name and ended with
`ControlGroup=` (empty), `ActiveState=inactive`, `SubState=dead`. Separate
`validate_action` bundles checked the successful experiment unit, final run and
all failed-attempt units by exact IDs; all passed. Final source C strict syntax,
shell syntax and git diff whitespace check also passed. No host display/socket
deletion or broad process kill was performed. Runtime files, host desktop,
settings/bus, `/opt/odin`, installed packages and application profiles untouched.
No commit was made; parent authorization is still required for commit.

## Same-process and abrupt disconnect follow-up — negative gate evidence

Executed 2026-09-06, ended 23:47:38 UTC. Command: `python3
scripts/computer-feasibility/x11-run.py --execute-isolated --same-process`.
Earlier two-process mode remains the default and is not removed. The new opt-in
fixture uses one GTK process with two windows and two entries in each window.
It logs PID, window XIDs, toolkit focus target, all entry strings, keyvals,
device/source names and key/button/focus/motion delivery. Input is bounded and
interleaved, not physical-human concurrency. No runtime files or isolation flags
were changed; no package installs, host display/session/bus/home access occurred.

Exact retained evidence: `73b7657e077e4b00aee11263f085ec0e`, 50,364 bytes, read
through EOF; expires 2026-09-07 23:47:38 UTC. Owned service:
`odin-xi2-feasibility-e35d98914cbe46e5af29dfc23c220bda.service`.
Versions: GTK 3.24.41; X.Org/Xvfb 21.1.11 (12101011); XI2 2.2; Xlib 1.8.7,
Xi 1.8.1, Xtst 1.2.3. Fixture PID 21 (private PID namespace), human window
2097154, robot window 2097160; human masters 2/3, robot masters 8/9.

| Question | Actual observed result |
|---|---|
| Two windows, same GTK process | Human `H`, `J` reached human-top (`HJ`); robot `a`, `b` reached robot-top (`ab`). Each window retained its own toolkit focus target. Server keyboard focuses remained 2097154 / 2097160. |
| Two entries, same window | Robot clicked human-bottom and typed `c`; human's next `K`, without refocusing, also reached human-bottom: `cK`. Robot click changed the window's single GtkWindow focus target for BOTH devices. |
| Reverse direction | Human clicked human-top and typed `L`, producing `HJL`; robot's next `d`, without refocusing, also reached human-top: `HJLd`. Both master keyboard focuses were 2097154, but widget focus was shared. |
| Pointer/modifier coexistence | Human moved once deliberately from (70,80) to (80,80). It remained (80,80) throughout robot entry changes, holding Shift (mods=1). Robot moved independently from (470,80) through (480,80) to (70,160), mods=0 before the disconnect case. |
| Child-held input | Fresh child X connection selected robot master 8, held Control and button1, synchronized, then used `_exit(0)` without releases or XCloseDisplay. Before exit robot mods=4, button mask began `02`; human mods=1/buttons zero. |
| Automatic release? **No** | After waitpid confirmed child exit (status 0), the next server snapshot still showed robot mods=4/button1 held. Human Shift/pointer unchanged. This is abrupt input-client process disappearance, not a full supervisor-loss/watchdog test. |
| Owned removal | Controller removed ONLY robot master pair using XIFloating (no transfer of held devices onto human masters). Server emitted robot button/key releases, and XIQueryDevice listed only original devices 2–7, zero remaining owned devices. Human Shift remained mods=1/buttons zero. |
| Safe application survival? **No** | GTK exited with `XI_BadDevice (invalid Device parameter)`, XInputExtension minor_code 40, after removal while its entry was in a held-button interaction. Human server focus became root window 66. The post-removal human `M` had raw events but NO app receipt; do not claim successful typing or preserved focus. |

The exact reason for the GTK error has not been diagnosed from a stack trace.
Temporal correlation with owned removal is observed; universal toolkit behavior
is not established by one fixture. Device removal cleaned the server state but
failed the application-preservation gate. No all-key cleanup, pointer restoration,
painted cursor, or attempt to repair the human focus was performed. Human released
only its own Shift at the end; its final server modifiers were zero.

**Important harness defect found:** this run's wrapper returned 0 despite the GTK
exit. The existing `kill -0 ... && echo ...` list did not propagate failure under
shell errexit, and the old log check only matched `Traceback|XERROR`, not GDK's
fatal X error spelling. Therefore this is NOT a clean successful run. The harness
now explicitly sets result=6 on lost application liveness or GDK X-error text,
and uses only one cleanup PID for the single-process fixture. These detection
changes received syntax/static validation, not another graphical trial; the
observed fatal case was not repeated merely to obtain a nonzero exit code.

The service ended `ControlGroup=` empty, `ActiveState=inactive`, `SubState=dead`;
fixture cleanup waited its owned children. Independent exact-unit validation
confirmed inactivity and empty cgroup after the experiment. Strict C syntax and
shell syntax checks passed. This follow-up is a reviewable feasibility result,
not Stage 6, production readiness, or an assisted-session guarantee. No commit.
