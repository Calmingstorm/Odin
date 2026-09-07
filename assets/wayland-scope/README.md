# Explicit GNOME Wayland scope provider

This extension is an **operator-installed opt-in** evidence provider for GNOME
Shell 46–48. Installing it is a trusted compositor-code change. It has not been
qualified on an active workstation by this implementation. Do not automatically
install, enable, reload Shell, log out, or modify a user's desktop session.
Development/qualification belongs in a separate user/container/native or nested
GNOME Wayland session with a private D-Bus, not the operator's active desktop.

For an explicitly authorized target session, the operator installs this directory
under `~/.local/share/gnome-shell/extensions/odin-scope@calmingstorm.net/` and
enables `odin-scope@calmingstorm.net` using GNOME Extensions. On versions requiring
a session restart for newly installed extensions, defer to the operator. No
unsafe-mode, Eval, Introspect allowlist changes or portal impersonation is used.
Disable/remove the extension to revoke the provider. Backend owner pinning makes
Shell restart a session failure rather than silently following its replacement.

The private interface is `org.gnome.Shell.Extensions.OdinScope`, object path
`/org/gnome/Shell/Extensions/OdinScope`, method `Snapshot(s) -> s`. It does not
inject input. Only the backend constructs requests, from the **exact authenticated
portal Start stream**. Public APIs must never accept raw native metadata.

The Python provider requires an explicit local Unix session-bus address and UID.
The optional expected compositor PID is supplied from authenticated EIS peer
credentials when input is enabled, not from a guessed process search. Without an
expected PID, read-only identity still authenticates and pins the native owner.
It authenticates the extension's unique bus owner against
`org.gnome.Shell`, queries PID/UID through the bus daemon, verifies stable local
`/proc` start time and root-owned non-writable executable/inode, pins that identity,
and addresses the unique owner directly. Native application PID comes from
Mutter's Wayland `Meta.Window.get_pid()` (`wl_client_get_credentials`), not a
title, app ID, AT-SPI object or X11 property. The client executable must be the
trusted installed xed, Inkscape or LibreOffice binary; Writer additionally requires
the Writer component class. Interpreter/sandbox wrappers, Xwayland, unknown apps,
dialogs/transients, security-sensitive titles, Shell modal UI/overview/lock screen,
overlapping higher application surfaces and ambiguous geometry fail closed.
The extension's `Identity(s) -> s` reports its actual GObject backend class and
Shell package version. Python accepts native or X11-nested Wayland compositor
classes and refuses unknown classes; no XDG_SESSION_TYPE inference is used.

Only monitor source type 1 is supported. The authenticated portal metadata must
contain `node_id`, `session_handle`, `position`, `size`, `source_type`, and optionally
`mapping_id`. It must name exactly one current logical monitor geometry. Source
digest binds node/session/mapping/geometry, and returned bounds are **source-local
logical units**, clipped to the focused application's frame. The capture/input
adapter must independently validate the actual PipeWire pixel dimensions and
logical-to-pixel mapping; never assume unit scale or infer rotation from a title.
This provider does not discover portal sessions or reconstruct streams itself.

Two fresh matching focus observations bracket native process validation; identity
and source/bounds digests permit stale-snapshot rejection. A focus round trip over
500 ms is refused. This is **not atomic focus/input exclusion or isolation from a
malicious same-user process**. Same-user access to the bus is not a cross-user
security boundary. Other installed Shell extensions share compositor privilege.
Custom in-process application UI cannot be classified perfectly by a compositor;
unsafe semantic operations still need the parent's application/action policy.

Runtime dependency: `dbus-next` in the backend environment. Importing this module
does not connect to a bus, inspect a desktop, or require that optional dependency.
