# Computer use: operator guide

**Before service start or network exposure, configure API authentication.**
If `web.api_token` is empty and there are no `web.api_tokens` entries or managed
tokens, the general API authentication gate is disabled. Set a strong private
token, restrict the listener and use TLS/access controls for remote API access.
Computer routes additionally require an authenticated administrator; that does
not secure other routes in a tokenless installation. Read [PACKAGING.md](PACKAGING.md).

Installing dependencies is not consent to observe or control a desktop. Enabling
the feature is not a task grant. Obtain the user's explicit, bounded task request
and keep the user present with Stop and administrator Disable available.

## Product contract and evidence

Computer use is default-off and available to authorized foreground conversations,
not autonomous agents, loops or schedules. Ordinary tools retain their normal
permissions; this is not a separate chat mode.

The R11 implementation contract is capability-first attached use: target the
user's chosen window without an application launch profile. Ordinary applications,
menus, file pickers and document open/new/save/close/reopen are ordinary tasks.
Terminals, shells, security/authentication/password prompts, keyrings, polkit and
Odin's own control surface remain denied. Process/window provenance and fresh
source/focus checks remain safety boundaries. Eligibility is not task success.

The contract includes click, double/right click, drag, scroll, generic keys,
Unicode typing and bounded observation crops. It calls for persistent independent
X11 master devices where available, with a reported shared-pointer fallback.
Independent per-window keyboard focus does not isolate widget focus inside a
window. Concurrent user input can overlap. Inspect actual session capabilities.
Unicode does not imply every character exists in the active keyboard layout;
unsupported characters must be reported, not silently replaced or resolved by
changing the user's keymap.

GNOME and KDE adapter registration is an implementation contract, not proof that
every version passes. Wayland requires a successful same-stack disposable release
probe, trusted application scope and portal capabilities for each session.
wlroots/Hyprland support must not be inferred from the word Wayland. Historical
R8 results covered specific GNOME/Mutter 48.7 fixtures; R6/R7 application results
covered specific Xed, Drawing, Inkscape and Writer tasks. Those samples are neither
a current attached-app allowlist nor general qualification.

**R11 validation pending:** this guide records the implementation contract while
parallel changes are integrated. It does not claim new GUI, compositor, Unicode,
pointer or crop qualification. Consult the release checkpoint and runtime status.
Remote desktop-worker transport is not implemented; remote WebUI access is not
remote computer control.

## Provision one local target

For packages follow [PACKAGING.md](PACKAGING.md). For source installs, provision
the `computer` Python extra, matching runtime assets/native helpers, and a
service-owned private evidence directory (default `/var/lib/odin/computer`, 0700,
no symlink components). Verify both service and worker interpreters. Isolated
workers use system Python; installing extras only in a venv is insufficient.

Configure the target offline before an operator-authorized service restart.
Display, environment, platform, storage and privilege settings are restart-pinned.
Only computer enablement toggles are live. Retain rollback configuration. Do not
restart a user's graphical session to test setup.

* **Isolated X11:** an owned disposable desktop launches a fixed Drawing or Xed
  profile. Provision systemd/bubblewrap/Xvfb/Openbox/D-Bus and native application
  dependencies. Export files from `/workspace/exports` while the task is alive;
  ending it destroys the sandbox. Missing one app does not block the other.
* **Existing-session X11:** measure the authorized display and RandR monitor
  names with `xrandr --listmonitors` and `xrandr --query` in that session. Configure
  `environment: existing_session`, `platform: x11`, `display`, `xauthority` and
  `monitor_names` from measurement, not another machine's connectors. Capture is
  monitor-wide, not application-private. Verify service-UID access. Blank
  Xauthority means `/dev/null`, not cookie discovery. Never use `xhost +` or
  publish cookies. Native X11 libraries and XTEST/XInput/XRes/RandR are required.
* **Existing-session Wayland:** configure `environment: existing_session`,
  `platform: wayland`, the desktop user's `wayland_uid`, exact local
  `wayland_bus_address`, and matching `wayland_guardian_binary`. Provision GI,
  GStreamer/PipeWire, portal RemoteDesktop/ScreenCast/ConnectToEIS, libei and the
  compositor's trusted scope provider. The packaged GNOME extension is inert
  until explicitly enabled by the user. Choose desktop/portal packages deliberately;
  do not replace a running compositor. The human selects a monitor and approves
  interaction in the portal for each task. A registered adapter does not replace
  the mandatory behavioral release probe.

Least-privilege service policy is independent. `runtime_sudo` is an explicitly
provisioned choice, not automatic escalation. Never bypass refusal with shell input.

## First supervised task

1. Check service health and independent running-version evidence after authorized
   deployment. An installed package or checkout SHA alone is not proof.
2. Sign in as the same authorized owner used for the foreground task. Open
   **System > Computer**, keeping Stop and administrator Disable visible. The
   owner and scoped credentials need local-host and all three computer-tool
   permissions; administrator status alone does not bypass them.
3. Enable and read back lifecycle status. Enable must not itself capture or start
   input. Native-image transport, desktop access and input capability are separate
   gates; an Enabled label proves none of them.
4. Open a new scratch document in the intended application and keep sensitive
   windows off the granted monitor. Request a short unsaved note, then Stop.
   Authorize any save separately to a new filename. Do not overwrite real work.
5. Observe before acting; use fresh session/generation/source/observation bindings.
   Inspect actual text/drawing and saved files. Pixel changes alone are not success.
6. Exercise Pause/revoke and explicitly authorized resume only while the originating
   foreground task remains alive. Stop ends it. Inspect cleanup and verify the
   user's applications remain alive. Closing a document is an ordinary separately
   requested task, not Stop cleanup.

Use short bounded input chunks. Refresh evidence after topology/scale/power changes
and obtain fresh consent where required. Never act using an old transform or replay
unknown input. For cleanup failure, privacy and rollback, use [RECOVERY.md](RECOVERY.md).
