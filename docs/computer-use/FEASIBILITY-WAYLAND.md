# Wayland independent-input feasibility — R1

Status: **genuine consent, PipeWire frame and libei-to-native-GTK delivery proven
in a disposable nested GNOME session. Independent input is NOT PROVEN.**
No independent-pointer/focus claim, Xwayland delivery claim, cancellation-matrix
pass, assisted-input eligibility or Stage 6 completion is made.

## Authority and isolation

Read `DECISIONS.md` R1 and the full 109-line
`/home/odin/reviews/computer-use/09-odin-replan.md` on 2026-09-06.
Owned files: `scripts/computer-feasibility/wayland*` and this document only.
No commits, host package installations, host service/config changes, deployment,
live desktop access, privileged input, host devices, or user bus/socket access.

The harness builds dependencies into a **rootless Podman image**, not the host.
Preparation can use the package network; experiments have `--network=none`,
private PID/IPC/user namespaces, no capabilities, read-only image, private `/tmp`,
1 GiB memory/one CPU/128-process limits. Only harness files (read-only) and a new
evidence directory below `/home/odin/tmp/wayland-*` are bind mounted. No host home,
X11 socket, Wayland socket, desktop bus, clipboard, input or GPU device is mounted.
Rendering is software. A fresh `dbus-run-session` and private PipeWire services are
created only during the authorized experiment. There is no fallback to `:0`,
XTEST, uinput, or a privileged compositor connection.

## Observed prerequisites

Host: Linux Mint 22.3 (Ubuntu noble), unprivileged `odin` UID/GID 1003;
rootless Podman 4.9.3; bubblewrap 0.9.0; PipeWire 1.0.5; Xwayland 23.2.6.
No installed Weston/Sway/Mutter/libei; host portal packages are 1.20.0 with GTK
and Xapp backends. These are inventory facts, not runtime capability evidence.
Podman has no systemd user session; it explicitly supports the cgroupfs path,
which is selected without enabling lingering or changing host configuration.
No existing suitable desktop container image was found.

Selected candidate: Ubuntu 24.04 container with GNOME Shell/Mutter 46,
xdg-desktop-portal-gnome 46, libei 1.2.1, PipeWire and Xwayland. Exact image
versions were verified after the successful 41-second image build (exit 0):

| Component | Installed container version |
| --- | --- |
| gnome-shell | 46.0-0ubuntu6~24.04.14 |
| libmutter-14-0 | 46.2-1ubuntu0.24.04.16 |
| xdg-desktop-portal | 1.18.4-1ubuntu2.24.04.2 |
| xdg-desktop-portal-gnome | 46.2-0ubuntu1 |
| libei1 / libeis1 | 1.2.1-1 |
| pipewire | 1.0.5-1ubuntu3.3 |
| wireplumber | 0.4.17-1ubuntu4.1 |
| xwayland | 2:23.2.6-1ubuntu0.8 |
| GTK 3 | 3.24.41-4ubuntu1.3 |

Image ID: `10e880c2cd02fe21a2668b6e11af5210d15cbc92ef542611f33f5310c919d6a2`,
size 1,044,740,833 bytes. The image package query itself exited 0; it did not start
a compositor, input/capture service, or session bus. `bash -n` passed for both
shell scripts, and calling `experiment` without the authorization flag was
verified to refuse with exit 64. These were preparation checks; runtime startup
results are recorded below.
Static container inspection also confirms `gnome.portal` registers the genuine
RemoteDesktop and ScreenCast backend interfaces, and `ConnectToEIS` occurs in
the public portal, GNOME portal backend and Mutter library. `gnome-shell --help`
advertises `--headless` and `--virtual-monitor`. None of these is runtime proof.
Weston/Sway alone would not
establish the required genuine RemoteDesktop consent backend. We do not infer
an interface is absent merely because a compositor executable is absent.

## Reproduction and gate

Run `bash scripts/computer-feasibility/wayland-lab.sh prepare` to build only.
Run its `versions` subcommand to inspect packages without a compositor/session.
The `experiment` command refuses without the explicit
`--parent-authorized-after-contract-correction` flag and a fresh evidence path.
**Do not supply that flag until parent authorization.** The current session
harness is a capability probe, deliberately exits nonzero even if the interface
exists, and cannot claim completion. Dependency installation in the image is
safe preparation, not proof that the experiment can run.

`wayland-portal.py` implements the actual asynchronous portal request/response
sequence with 35-second request deadlines and owned-session closure. It never
auto-approves consent or edits the permission store. If a real dialog cannot be
approved through an authorized isolated operator channel, it records timeout,
not success. It can request genuine PipeWire/EIS FDs following consent, but does
not claim that receiving an FD proves frame capture or libei event delivery.

## Required experiment and evidence (partial execution; see results below)

1. Record compositor/portal/libei/PipeWire/Xwayland/toolkit versions, namespaces,
   public portal interface version and compositor-private input capabilities.
2. Genuine `RemoteDesktop.CreateSession`, `SelectDevices`, `ScreenCast.SelectSources`,
   and `RemoteDesktop.Start`; observe actual backend consent UI and approve only
   inside the disposable compositor. No mock portal and no permission-store edit.
3. `ScreenCast.OpenPipeWireRemote`: capture actual frames and record stream IDs,
   sizes, mapping/region data. Connect to the granted `ConnectToEIS` FD using libei;
   record negotiated seats, devices, capabilities and regions. No invented scale.
4. Instrument native Wayland and Xwayland applications for motion/click/drag/scroll,
   keyboard focus, held modifiers, menus, dialogs, grabs. Simulated human input must
   have a separately identified private input source. Observe actual event targets,
   human pointer/focus, and concurrent interference. A painted cursor is not proof.
5. Disconnect/cancel mid-input, verify only Odin-owned keys/buttons release, and
   attach/detach to this already-running disposable desktop without killing apps.
6. If no independent seat/focus path exists, report exact unsupported/shared status,
   versions and evidence. Portal approval does not imply isolation of input reach.

## Cleanup

### Actual authorized experiment results (2026-09-06 23:28–23:33 UTC)

Parent GO explicitly followed the neutral-contract correction checks. No work
was committed. The first rootless Podman runtime attempt failed **before process
start**, exit 126: runc could not create a cgroup in `/sys/fs/cgroup/system.slice`.
No delegated cgroup permission was available. We did **not** disable resource
limits or change host cgroup configuration. Existing Docker 29.8.0 with systemd
cgroup-v2 support was available, so the single image was imported to that daemon.
The revised reproduction is `import-docker`, then `experiment-docker` with the
same explicit GO flag and a new evidence path. Docker workloads use UID/GID 1003,
zero capabilities, no-new-privileges, private default PID namespace, private IPC
and cgroup namespace, no network, read-only root and no forwarded host devices.
This is **not a rootless runtime**; its existing rootful daemon provides enforced
1 GiB memory/no-extra-swap, one CPU and 128 PID ceilings. No daemon config changed.

Bounded setup failures and fixes, all confined to the container/harness:

* Docker rejected `--pid=private` (exit 125); omission uses Docker's private PID
  namespace default. It never used host PID mode.
* Unknown UID 1003 caused private D-Bus authentication failure; a container-only
  passwd/group entry fixed that. Runtime-directory creation moved before D-Bus.
  Current image: `f63019da5a110fa37435f65af8d77c9f60a66315282882e532213266808e1478`.
  That is the Podman image ID. Docker's imported image reports
  `sha256:71a3276a6b2f0d664c6c367e1926ac53849835aba1c5be2e5edcec2392ae2cd9`;
  do not assume cross-runtime image IDs remain identical after export/import.
* Mutter initially could not create its private X11 directory. After that fix,
  it automatically advertised **container-private** X11 `:0`/`:1`; neither is the
  host display and no host socket was mounted or addressed. Nonetheless the
  final probe uses `--no-x11` to avoid even this ambiguous numbering. **Xwayland
  event-delivery testing has NOT been performed.**
* GNOME Shell required a system-bus connection. A second empty, container-private
  D-Bus daemon is supplied via `DBUS_SYSTEM_BUS_ADDRESS`; it exposes no host
  services and does not mock consent. Missing ancillary logind/Polkit/RTKit/GDM
  names produce logged warnings, not host service access.
* The first portal advertised device/source masks zero and CreateSession response
  2 because it started before the GNOME environment was ready. Explicit private
  `XDG_SESSION_TYPE=wayland`, `GDK_BACKEND=wayland` and a short readiness delay
  allowed the real GNOME backend to initialize. Interface presence alone would
  have produced a false positive here.

Best observed run: `/home/odin/tmp/wayland-r1-docker6-20260906/`.

| Observation | Actual result |
| --- | --- |
| Mutter rendering | surfaceless software renderer; virtual monitor Meta-0 1280×720 |
| GNOME Shell | startup recorded, isolated `wayland-0` |
| Public RemoteDesktop | interface v2; AvailableDeviceTypes=7; ConnectToEIS introspected |
| Public ScreenCast | interface v5; AvailableSourceTypes=7; AvailableCursorModes=7 |
| CreateSession | genuine Response 0, session handle returned |
| SelectDevices (keyboard+pointer) | genuine Response 0 |
| SelectSources (monitor, embedded cursor) | genuine Response 0 |
| Start | request created; no successful Response during 35-second deadline |
| Consent grant | **not obtained; not bypassed** |
| Cleanup D-Bus calls | request/session Close timed out; no false close-success claim |
| PipeWire frames / ConnectToEIS FD | **not reached** |
| libei handshake / human separation | **not tested** |

`portal-client.jsonl` records interface values and responses; `portal-introspection.txt`
records the actual public methods; `compositor.log`, `portal*.log`, `pipewire.log`,
`wireplumber.log` and `session.log` retain component evidence. The genuine GNOME
portal process emitted a parent-window association warning when Start attempted
to present its UI. No screenshot was obtained, so **visible consent UI is not
claimed**. Mutter later logged `surface_state_changed` assertion failure. These
are observed warnings, **not a demonstrated root cause** for the timeout. The
test has no separately instrumented operator input channel to approve the prompt;
neither approval nor independent-input delivery can be concluded from this run.
No permission-store edit, D-Bus Notify input, uinput, XTEST, privileged injection,
or compositor-private input bypass was used to force the result.

The run exited 25; the full experiment is therefore **blocked/incomplete**, not a
successful supported implementation and not evidence that Mutter lacks EIS.
Do not layer assisted actions atop this result. A next experiment needs a genuine
isolated consent operator channel, stable window rendering, libei device/event
instrumentation and actual native Wayland/Xwayland receiver apps before any
coexistence claim. The current harness deliberately has no independence-pass path.

`validate_action` confirmed an actually running owned container with UID1003,
network none, 1,073,741,824-byte memory, 128 PIDs and all capabilities dropped.
Post-run `validate_action` passed **3/3**: no matching Docker containers, no matching
Podman containers, and retained portal evidence without a desktop socket in the
export directory. Temporary desktop/bus sockets were inside the removed container.
The earlier broad inspection check could pass when no container existed; only
the later exact-output check supports the running-resource claim.

Scripts passed `bash -n`; the portal client passed Python compilation. Those
checks are syntax evidence only. No automated test suite or independence matrix
has passed. Cached image copies and small evidence directories remain intentionally.

The experiment is bounded to 240 seconds with a three-second kill grace;
Podman `--rm` removes the owned container and its private process namespace. Its
exit does not touch any host session. Evidence and the intentionally cached image
remain; remove only the explicitly recorded evidence path/image when requested.
Never broad-kill processes or prune unrelated container state. Verify owned
container absence after any interrupted run; command exit alone is not sufficient.

## References and limits

### Isolated operator follow-through (2026-09-06 23:44–23:56 UTC)

Read all207 lines of DECISIONS.md and all211 then-current lines of this document.
Parent explicitly authorized the disposable simulated-operator channel; no product
layers were changed. All additions are wayland* harness files and this document.

**New demonstrated result:** run `/home/odin/tmp/wayland-operator8-20260906/`
obtained real portal consent, one genuine PipeWire frame, a negotiated libei sender
connection and actual native Wayland GTK motion/button delivery. It still exits24
(incomplete), intentionally not an independence pass.

Private image preparation added Xvfb, xdotool, ImageMagick, GStreamer PipeWire and
AT-SPI Python dependencies **inside the image only**. Existing host tesseract was
used read-only on exported private screenshots. The image is
`localhost/odin-wayland-operator:r1`, manifest
`sha256:d0802285af96b855f543f43b3e2c76e27ebbbf7dfcd44c342110e576ebe8e8c7`.
Build3 completed exit0, including gcc -Wall for the finite libei probe.

The operator display is a new Xvfb **:77 inside the same private container**.
GNOME Shell uses --wayland --nested --no-x11, so the controlled application is
native Wayland, not Xwayland. Docker retained UID1003, no capabilities, no devices,
network none, read-only root, private IPC/cgroup/PID namespaces,1GiB/no-extra-swap,
one CPU,128 PIDs and private /tmp. Only harness read-only and evidence binds exist.
No host desktop socket, bus, home, input device or display was accessed. There is
no host :0 fallback. XTEST on :77 was explicitly a simulated **operator** channel,
not the mediated sender and not an eligible product input backend.

Bounded observations and corrections:

* Run1 screenshot utility failed creating a thread under the128-PID ceiling;
  LP_NUM_THREADS=2, OMP_NUM_THREADS=1, MAGICK_THREAD_LIMIT=1 bounded software
  rendering threads. Resource limits were not relaxed.
* Screenshots in runs2–6 visibly contained the genuine **Remote Desktop** prompt,
  but rendering had clipped text. Run2 operator Escape produced genuine Start
  **Response1 (cancelled)**. Several coordinate attempts did not yield approval;
  stopped owned containers were not reported as successful.
* Read-only AT-SPI inside the isolated bus showed the real backend's active,
  modal, showing/visible frame; **Allow Remote Interaction** checkbox, the exact
  screen-sharing explanatory label, and **Share** button. All AT-SPI extents had
  origin0,0, so they were not treated as trustworthy global coordinates.
* The final simulated operator explicitly activated the actual checkbox's
  toggle UI action and actual Share button's click UI action. Evidence records
  OPERATOR_UI_ACTION with True. This is UI consent, not a fabricated portal reply,
  a private compositor input method, or a permission-store edit. No permission
  persistence was requested. AT-SPI is private-lab-only and not a product fallback.
* Run7 achieved consent and a frame but executing the compiled probe from /tmp
  failed EACCES. The helper moved to the image's read-only /usr/local/bin at
  build time; /tmp execution/mount protections were **not** weakened.

Run8 exact evidence:

| Gate | Observed result |
| --- | --- |
| Real Start | Response0, devices3 (keyboard+pointer) |
| ScreenCast stream | node40, id0,800×600, position0,0, source_type1 |
| Portal mapping ID | 449a49d6-5900-4fd3-a806-bb4d9a837922 |
| OpenPipeWireRemote | FD returned; Gst appsink received RGB800×600 buffer,1,440,000 bytes, PTS7,913,618 |
| ConnectToEIS | FD returned, libei CONNECT and SEAT_ADDED |
| Seat | mutter default seat |
| Device negotiation | absolute pointer, relative pointer, keyboard; DEVICE_RESUMED observed |
| Absolute region | 0,0 800×600, physical scale1, mapping ID exactly matches portal |
| Mediated action | bounded absolute motion to250,250 plus matched press/release, no held input |
| Native receiver | GTK3 GDK_MOTION_NOTIFY250,218 and BUTTON_PRESS/RELEASE250,218 |
| Session cleanup | actual owned-session Close succeeded |

The receiver's y218 is a **window-local** delivered coordinate; do not silently
equate it with portal-source y250. The receiver inherits explicit GDK_BACKEND=wayland
and the compositor has X11 disabled. Its log records Core Pointer/Core Keyboard;
the EIS device name includes “shared virtual absolute pointer.” **Neither naming
nor one-seat negotiation proves human-pointer independence or proves coexistence.**
No second independently tracked human pointer/focus source was compared. Keyboard,
grabs, held-modifier overlap, cancel/disconnect cleanup and Xwayland remain untested.
No source-clock/freshness mapping is claimed from the single Gst PTS.

Evidence: consent-before.png, controls-toggle.txt, controls-share.txt,
portal-client.jsonl, receiver.log, component logs and session.log in run8.
Run8's libei stdout is interleaved in portal-client.jsonl (not strict JSONL); the
final harness captures it as a JSON string instead. This logging-only adjustment
and reproduction subcommand were syntax checked after the successful runtime,
not rerun as a new runtime claim. prepare-operator builds the additional image;
experiment-operator requires the same explicit parent-GO flag. Operator actions
remain separate and explicit, never automatic consent in the portal client.

**Decision:** the earlier “cannot reach consent” blocker is superseded for this
specific isolated stack. The independent pointer/focus and lifecycle gates remain
open; assisted actions are not eligible and no product action layers should be
built atop this partial result.

Final validate_action bundle wayland_operator_final_cleanup passed3/3: all owned
operator containers absent (including stopped containers), shell/Python syntax and
tracked diff whitespace checks passed, and screenshot/frame/EIS/native-button
evidence remains with no socket in the run8 export directory. No application test
suite, independence matrix, full visual frame-content validation or Xwayland
delivery matrix is claimed. No commit was made by this follow-through agent.

Knowledge-base search returned unrelated material, so it was not used as evidence.
Official portal documentation:
<https://flatpak.github.io/xdg-desktop-portal/docs/doc-org.freedesktop.portal.RemoteDesktop.html>
describes genuine consent, combined ScreenCast, and EIS as the recommended input
method; after EIS connection, do not use Notify methods for that session.
Official libei documentation: <https://libinput.pages.freedesktop.org/libei/>
explicitly says EI events normally enter the compositor's ordinary input stack
and look like physical-device input to clients. Therefore **libei is not a
portable independent-pointer or independent-focus guarantee**. A web search
failed HTTP 202; this document does not rely on its results.
