# Remote desktop feasibility assessment (R11)

Assessment only, based on source inspection at `ab03f51`. No SSH desktop worker
was built, provisioned, connected or qualified in this work. Subsequent R11 source
changes require a dependency/transport recheck. The target is an existing remote
user session without installing the full Odin service on that machine.

## Finding

**Remote attached X11 is feasible, but not an argv-only transport swap today.**
The isolated worker's JSON-lines seam is useful prior art, not the attached worker
implementation. A small versioned remote desktop runtime plus an authenticated SSH
transport is a reasonable design. The current attached module import closure,
local `/proc` checks and multi-process guardian ownership need deliberate factoring.
Do not advertise a two-package install or claim that copying ten runtime files
already works. Remote Wayland needs more desktop-local components and native ABI
packaging; a first remote release should start with attached X11.

## Observed source, not assumptions from the proposal

* `runtime/worker.py` and `runtime/supervisor.py` implement the **isolated** path.
  The supervisor launches `launch_argv` from `profile.py`, which owns local
  systemd/sandbox lifecycle. `protocol.py` supplies JSON lines, in-band base64
  frames and a 24 MiB wire cap. This is not the attached capture/action protocol.
* `runtime/x11_attached.py` launches `x11_attached_worker.py` for capture and
  `x11_guardian.py` for actions. Capture has a 3 MiB reply cap and a 2 MiB image
  limit; the guardian has a 65536-byte message bound and an independent two-second
  lease. Preserve each bound rather than applying the isolated cap everywhere.
* `x11_attached_worker.py` imports `src.computer.runtime.x11_attached` and capture
  modules after adding the package root to `sys.path`. `x11_attached.py` itself
  imports sibling application, geometry and model modules. The worker is a
  standalone **process**, not a standalone stdlib-only distributable file.
* `x11_capture.py` imports python-xlib and the renderer; `render.py` imports Pillow.
  Geometry/render/vision/model modules outside `runtime/` are part of this closure.
  `x11_app_scope.py` uses python-xlib/XRes and Linux `/proc` process provenance.
  `x11_owned_device.py` loads libX11/libXi/libXtst through ctypes. Attached native
  input is not implemented by xdotool; that executable belongs to other isolated
  runtime/diagnostic paths and is not established as a minimal attached dependency.
* `x11_attached.py` records and validates local PID/start ticks, UID and ancestry
  through `/proc`; recovery also resolves local process identities. Replacing its
  subprocess with `ssh` would inspect the SSH client, not the remote worker.
* `x11_guardian.py` creates a local socketpair and passes an FD to a separate
  injector. Both processes must remain on the remote host, with independent
  release authority surviving transport loss. SSH exit is not proof of release.
* `wayland_portal.py` runs a desktop-UID broker, GI/Gio/GLib and
  GStreamer/GstApp/GstVideo, local session D-Bus, PipeWire streams and Unix-FD
  passing. `wayland_guardian.py` launches a trusted native binary with the EIS FD
  via `pass_fds`; it validates root ownership and non-writable path components.
  Unix descriptors cannot simply be serialized into JSON and used across SSH.
* `wayland_backend.py` also imports Pillow, admission, model, geometry, scope,
  identity and probe modules. Compositor scope and same-stack release qualification
  need to run beside the remote desktop, not against the controller's compositor.
* `src/tools/process_manager.py` already has `_remote_call` and
  `_remote_controller_command`. Reuse the managed-host authorization/transport
  approach, not its process results as desktop-release evidence. `host_id` already
  scopes controller sessions/evidence, but does not make OS identities portable.

## Proposed remote requirements

For X11: an existing Linux X11 desktop and SSH server, authorized desktop-user
login, Python 3.11+ with python-xlib and Pillow, libX11/libXi/libXtst, and server
XTEST/XInput/XRes/RandR support. Match dependency versions to the runtime release;
distribution package names and extension availability vary. Include any topology/
power dependencies introduced by the final R11 implementation. No need to launch
Xvfb, Openbox or a sandbox application for attached use. No full Odin daemon,
WebUI, credentials store or LLM dependencies should be required after factoring.

Connect as the authorized desktop user and discover/verify that user's real
display and access mechanism with explicit consent. Do not assume `DISPLAY=:0`,
`~/.Xauthority`, a UID, connector name or ambient SSH session-bus environment.
Do not use X forwarding as a substitute: the target is the existing remote screen.
An SSH host grant is not consent to view every monitor or control the user's apps.

For Wayland, additionally provision the matching trusted native guardian (currently
libei >=1.3.901 and libxkbcommon), GI/GStreamer/PipeWire dependencies, functioning
ScreenCast/RemoteDesktop/ConnectToEIS portal backend, trusted compositor scope
provider and disposable same-stack probe prerequisites. GNOME/KDE registration
does not qualify a remote stack; unsupported wlroots/Hyprland paths remain named
refusals. Package native assets per supported ABI/architecture and retain their
trust policy. A user-writable cache is not acceptable for the current root-trusted
Wayland guardian. Consent prompts appear on the **remote** screen and require the
remote user's approval. Never expose the session bus or EIS endpoint over TCP.

## Work needed before offering remote input

1. Extract/test a minimal versioned desktop runtime import closure. Provision it
   idempotently through an authorized managed-host path, validating artifact
   identity, ownership and version before launch. Do not copy the whole service.
2. Introduce an attached transport interface with pinned host identity, existing
   known-host/key policy, no PTY, bounded messages and deadlines. Negotiate worker
   version/capabilities. Keep auth material and display cookies out of transcripts.
3. Make process ownership host-aware: remote PID, start ticks and boot/session
   identity must be checked remotely and bound to the authenticated worker/host.
   Move `/proc` reconciliation and cleanup checks there. Never kill local PIDs
   using numbers received from another machine.
4. Keep guardian/injector and, for Wayland, portal/broker/PipeWire/EIS operations
   remote-local. Transport only bounded frames, semantic actions and receipts.
   Preserve release-on-EOF/lease-loss, no replay, revoke-before-cleanup, denied
   classes, application preservation, host authorization and private evidence TTL.
5. Verify disconnect during held input, SSH death, worker death, remote reboot,
   stale topology, consent revocation, protocol mismatch, high latency, oversized
   frames and recovery uncertainty in disposable sessions. Reconnect must not
   resume old input authority or replay unknown actions. Measure usability rather
   than assuming base64 frames are fast enough on every home network.

The isolated DynamicUser/systemd/bubblewrap containment does not automatically
carry over; remote attached use need not offer isolated launching. Local filesystem
exports, local compositor probes and local PID receipts cannot be reused unchanged.
The architecture is promising, but implementation and remote safety evidence remain
gaps. No remote acceptance claim follows from the existing local test suite.
