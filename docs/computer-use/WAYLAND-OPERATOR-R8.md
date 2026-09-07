# Production Wayland operator handoff (R8)

This supplements LOCAL-DEPLOY-TESTING.md. Aaron owns deployment, configuration and
any service/session restart. The build did none of those. No automated probe or
input was sent to his desktop for R8; all graphical evidence is from disposable
sessions.

## Qualified and refused stacks

* **Qualified release behavior:** stock Debian 13 GNOME Shell
  `48.7-0+deb13u2`, Mutter `48.7-0+deb13u1`, libei/libeis `1.3.901-1`, portal
  `1.20.3+ds-1`, GNOME portal `48.0-2`, PipeWire `1.4.2-1`.
  Native-headless and nested-X11 Wayland each passed all six real lifecycle cases:
  orderly close, controller EOF, cancel with late input, finite lease, sole EI
  owner loss, and portal withdrawal. Receivers observed actual release callbacks
  and remained alive with the same editor accepting subsequent input.
* **Qualified composed task:** native Wayland Inkscape `1.4-6`, actual
  ComputerController and native observation-delivery gate, real portal consent,
  actual same-stack probe, scope extension and current guardian. A rectangle was
  GUI-created and Ctrl+S saved into an already-open, empty scratch SVG. The saved
  vector shape and raster were checked independently. This is a deterministic
  GUI qualification, not a claimed general model success rate. Save's immediate
  visual check may report not_satisfied even when independently read file bytes
  confirm save. Do not turn that into automatic replay.
* **Refused by the actual probe:** baseline GNOME Shell `46.0` with the
  previously measured Ubuntu Mutter `46.2` nested implementation. Shift released
  after sole sender EOF but the held button did not. The result names
  `compositor_held_button_eof_release_failed` and the older `drop_device` button
  state index defect. Install a distribution build containing upstream commit
  `4ae305f19e391edda1aab0f9a9c47b01062f6330` or the vendor equivalent, then start
  a new desktop session at your convenience and requalify. Odin does not patch
  your compositor, force global input release or restart the desktop.

These are exact measured builds/backends, not blanket approvals or bans by major
version. Every new task probes again against its actual identity. An untested
correct matching GNOME build can pass; an unknown vendor/render mapping fails
with missing-evidence diagnostics rather than an invented defect diagnosis.
KDE/KWin, wlroots and other compositor scope adapters are not implemented in this
increment. They are unsupported, not classified as affected by the Mutter bug.

## Provisioning before the operator's deployment

1. Install the `computer` Python extra into the service environment. It now
   includes `dbus-next>=0.2.3,<1`, in addition to Pillow and python-xlib.
2. Install distribution packages for GNOME/Mutter, public RemoteDesktop and
   ScreenCast portals, PipeWire, GI/Gio/Gtk3/GStreamer, the PipeWire GStreamer
   plugin, Inkscape, libei and libxkbcommon. The system `/usr/bin/python3` used by
   the portal/probe helpers needs the GI modules. Service-venv imports alone do
   not provision the helpers. Debian names include `python3-gi`,
   `gir1.2-gtk-3.0`, `gir1.2-gstreamer-1.0`, `gir1.2-gst-plugins-base-1.0`,
   `gstreamer1.0-pipewire`, `bubblewrap`, `dbus`, and `libei1`.
   Private nested qualification additionally needs Xvfb and xdotool; these never
   target the operator's X11 display. Linux pidfds and unprivileged namespaces
   must be available. Runtime does not install dependencies or compile code.
3. Compile the **matching** `src/computer/runtime/assets/wayland_owned_input.c`
   during packaging with C11, libei and libxkbcommon, then install the resulting
   native helper to the configured absolute path. Compiler flags are
   `-std=c11 -Wall -Wextra -Werror`, pkg-config packages `libei-1.0 xkbcommon`,
   plus `-lm`. The executable and its entire path must be root-owned, not
   group/other-writable and contain no symlink components. Do not configure a
   checkout-local executable or a user-writable helper.
4. Package every `src/computer/runtime/assets/wayland_probe_*.py` asset alongside
   the runtime. The real qualifier uses these installed helpers, not the
   developer feasibility scripts and not cached JSON approval files.
5. Explicitly install and enable the matching companion extension from
   `assets/wayland-scope/` in the **chosen GNOME session**. This is trusted
   compositor code and requires the operator's decision. See its README for
   installation and removal. Odin never installs/enables it or changes Shell
   accessibility/security settings. Missing extension means input is refused.
6. Configure the actual local Unix session bus address and desktop UID, and
   provision the existing private service-owned storage directory. The portal
   helper drops to that UID when the service is root; a non-root service cannot
   silently assume another UID. The service also needs authorized read-only
   process identity access. Do not grant blanket sudo to work around this.
7. The disposable qualification needs the same installed input/render library
   identities. A hardware/vendor stack differing from headless llvmpipe may fail
   exact-stack matching. There is no override to claim it passed. Such a refusal
   is a limitation of the current qualification method, not proof the compositor
   is broken. Use a separately provisioned qualified session for testing.

## First harmless task

Open and focus native Inkscape yourself with a new scratch document. Ask Odin to
draw a simple rectangle, then stop. If save testing is desired, first create and
open a new empty scratch SVG yourself and authorize Ctrl+S into that specific
file. Do not use an existing work document. All Wayland dialogs, Save As,
open/new/close/reopen, Xwayland applications and other app profiles are refused.

Accept the real portal's monitor sharing and remote-interaction request. The
monitor may expose unrelated windows; review its privacy scope. Status shows the
identified compositor, measured probe scope, admission result and remedy. Input
still requires fresh authenticated app focus and source mapping. Pointer and
focus are shared. Typing is bounded printable ASCII through the actual EI keymap;
no clipboard or keyboard-map mutation occurs.

Stop fences input, releases the owned EI ledger, closes the portal and connection,
and reaps helpers without needing a fresh screenshot or stable monitor topology.
Portal Close acknowledgment and connection closure are distinct evidence. Lost
acknowledgment or incomplete release remains quarantine, never a false clean
receipt. The application and its intended edits remain open. On source/topology
change, stop and request a new consented task rather than reusing coordinates.

Evidence: WAYLAND-QUALIFICATION-R8.md, WAYLAND-PROBE-R8-EVIDENCE.md and
WAYLAND-COMPOSED-R8.md. Existing Cinnamon monitor-wake behavior remains the
operator's known environment issue; no Cinnamon workaround was added.
