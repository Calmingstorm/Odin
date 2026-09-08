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

Attached use targets the
user's chosen window without an application launch profile. Ordinary applications,
menus, file pickers and document open/new/save/close/reopen are ordinary tasks.
Attached native scope does not deny applications by title or class. Names are
provenance, not task authorization; the assistant's tool-use restrictions and
the user's explicit task still govern what it may do. Process/window provenance,
fresh source/focus checks and input lifecycle gates remain. Eligibility is not
task success.

The tools provide click, double/right/middle click, drag/polyline, scroll, generic
keys, Unicode typing and bounded observation crops. Attached X11 currently uses
the shared-pointer fallback with the core keyboard, creating no extra master devices. Native
master removal crashed an ordinary application even after held input was released,
so independent attached input is not qualified or offered. Stop verifies the
original core-device identities and attachments after draining owned input.
Server-lifetime persistent devices belong only to isolated environments.
Independent per-window keyboard focus does not isolate widget focus inside a
window. Concurrent user input can overlap. Inspect actual session capabilities.
Unicode does not imply every character exists in the active keyboard layout;
unsupported characters must be reported, not silently replaced or resolved by
changing the user's keymap.

**Shared-X11 release boundary:** cooperative cancellation, controller EOF and
injector/helper failure can be handled by a surviving guardian, which fences the
injector and acknowledges ledger-owned release. Abrupt death of the guardian
itself loses the sole shared-input ledger. Its native consequence is untested;
there is **no proven universal server-side release guarantee** on this path.
The two-second lease and a `verified` release capability describe the supported
acknowledged path, not survival of every process failure. Missing/failed release
evidence remains unknown/quarantined, never replay permission. A settled worker
or an unchanged core-device hierarchy alone does not prove held input released.
See [RECOVERY.md](RECOVERY.md). Never fault-test held input on a user's desktop.

GNOME and KDE adapter registration is an implementation contract, not proof that
every version passes. Wayland requires a successful same-stack disposable release
probe, trusted application scope and portal capabilities for each session.
wlroots/Hyprland support must not be inferred from the word Wayland. Historical
R8 results covered specific GNOME/Mutter 48.7 fixtures; R6/R7 application results
covered specific Xed, Drawing, Inkscape and Writer tasks. Those samples are neither
a current attached-app allowlist nor general qualification.

**Measured examples, not an application allowlist:** a real X11 Xed task completed
through the controller with crop delivery, Unicode, click variants, a context menu,
actual popup-menu item selection, save, exact UTF-8 verification, document
close/reopen and automatic detach. The
human/core pointer stayed unchanged and the application survived. A real topology
change invalidated old coordinates. Hardware DPMS sleep/wake is unit-tested but
not hardware-qualified. Unsupported keyboard characters are reported by index;
clipboard/IME fallback is not implemented.

**KDE limits:** the opt-in KWin scope companion loaded and returned authenticated
native-window metadata on stock Fedora 43 KWin 6.7.4. The tested Fedora 43 and
Rawhide KWin 6.7.4 stacks both failed held-button/Shift release after EI sender EOF.
They are refused with `compositor_held_button_eof_release_failed`; successful
ordinary input or scope loading does not override that failure. Install a vendor
fix and run qualification again. A full KDE controller input task is not qualified.
Remote desktop-worker transport is not implemented; remote WebUI access is not
remote computer control.

## Provision one local target

For packages follow [PACKAGING.md](PACKAGING.md). For source installs, provision
the `computer` Python extra, matching runtime assets/native helpers, and a
service-owned private evidence directory (default `/var/lib/odin/computer`, 0700,
no symlink components). Verify both service and worker interpreters. Isolated
workers use system Python; installing extras only in a venv is insufficient.

Configure the target in **System > Computer > Computer provisioning** before an
operator-authorized service restart. Review the changed fields and save the draft;
the panel reports pending restart settings. Computer provisioning is no longer in
Config Center. Saving does not install dependencies, change enablement, attach to
a desktop, or restart anything. A failed/uncertain save requires reloading saved
values before another attempt, not automatically replaying the save.
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
  monitor-wide, not application-private. Verify service-UID access. X11 capture
  permission alone does not grant application-process inspection: a service UID
  different from the desktop UID requires explicit worker privilege provisioning.
  `application_uid_mismatch` or `application_process_unreadable` means input is
  unavailable, even if screenshots work. Run the worker under the desktop identity
  or deliberately provision `runtime_sudo`; never remove process-identity checks.
  Blank
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

KWin's provider uses a private, version-specific compositor ABI. It needs a
matching `odin-kwin-scope` companion package and explicit operator loading.
The main package contains the companion sources, not a universal binary. This
branch provides the companion build/package recipe but does not publish distro
binaries. Without a matching companion, KDE is not a zero-manual-step setup;
source builders must follow the shipped companion README. Do not install a
binary built for a different KWin ABI or load it into an untested real session.

Least-privilege service policy is independent. `runtime_sudo` is an explicitly
provisioned choice, not automatic escalation. Mixed shell and computer tools are
legitimate within the authorized task. They must not bypass unavailable desktop
permissions, uncertain input release or the user's task boundaries.

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
   For an attached session, omit `app` when starting. An explicit `app: xed` or
   `app: drawing` requests an isolated launch and is rejected while the configured
   environment is `existing_session`, never redirected onto the real desktop.
   Selecting the isolated environment is an operator configuration change.
5. Observe before acting; use fresh session/generation/source/observation bindings.
   Startup selects a granted monitor containing an eligible focused application
   when possible. Check `input_readiness` and `input_blocker`; device availability
   is not an actionable target. Wrong-monitor, privilege and
   missing-focus failures have separate static reasons. Status without a current
   observation does not claim input readiness.
   Inspect actual text/drawing and saved files. Pixel changes alone are not success.
   When an action returns verification pixels, inspect that new view and use its
   observation ID for the next action instead of taking a duplicate screenshot.
   A receipt without pixels grants no new input authority. If the view is stale,
   absent or no longer matches the intended target, obtain a fresh observation.
   Optional `task_context` notes on observe retain short goal/tool/color/brush
   descriptions across interruptions. They are caller hints, never verified
   application state or authority; actions and target changes mark them stale.
6. Exercise Pause/revoke and explicitly authorized resume only while the originating
   foreground task remains alive. Stop ends it. Inspect cleanup and verify the
   user's applications remain alive. Closing a document is an ordinary separately
   requested task, not Stop cleanup.

Use short bounded input chunks. Refresh evidence after topology/scale/power changes
and obtain fresh consent where required. Never act using an old transform or replay
unknown input. For cleanup failure, privacy and rollback, use [RECOVERY.md](RECOVERY.md).

## Reading action and cleanup evidence

Native editable-field handles bind the actual accessibility node, root and ancestry
to the observed window. A visible field is not sufficient: discovery must retain
that identity, and replacement must return exact text readback. An Offscreen or
nonvisual toolkit node need not expose a Component interface. Unsupported toolkits
still use the explicitly selected pixel-region replacement path, which does not
claim native identity or semantic text readback. Accessibility enablement alone
does not certify either field availability or a successful edit.

For a connected shape, send one bounded multi-point polyline. For disconnected
details, a strokes batch keeps separate action IDs and requires confirmed release
before the next stroke. Full native dispatch and distributed local path changes may support the
next preplanned stroke, provided its original start anchor and native binding
remain valid. Missing path evidence, partial dispatch or an unexpected target
transition stops the remainder. The result stays **executed, visual review
required**, not a claim that the intended brush, color or artwork is correct.
Inspect the final delivered pixels. Cursor movement, toolbar repaint and general
raster changes are not semantic proof of a painted mark.

A measured new same-application dialog at the end of a sequence can complete that
step and return its image. No later step may operate inside the newly opened dialog
until a new view is delivered and inspected. Reusing any parent or child action ID
returns evidence only; it does not resume a partial sequence. Compact tool receipts
retain per-step status and uncertainty; detailed durable measurements remain in the
private evidence store.

Cleanup uses three-valued measurements. In shared X11 mode, an owned-worker fence
can establish `no_inflight_input`, while master restoration/removal are not
applicable because no owned masters were created. A global shared-server grab
probe is unsupported. These fields are `null` with explicit `cleanup_checks`
reasons, never invented `false` measurements or a claim that another client's
input was inspected. A reported negative measurement prevents a complete cleanup
certificate. Operator reconciliation preserves prior uncertainty rather than
rewriting an interrupted action as successful.

The current session deadline remains 20 minutes. Longer lifetime and explicit
operator-approved renewal are proposals, not shipped functionality. An action
must not renew its own authority merely by continuing to send input.
