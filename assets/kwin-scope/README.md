# Odin authenticated KWin scope provider

This builds an **opt-in, in-process KWin binary plugin**. It exports read-only
focus evidence on KWin's existing session-bus connection. It does not inject
input and does not create a proxy process.

KWin's binary plugin ABI is release-specific. Rebuild against the exact
installed KWin release. A companion package must depend on that exact distro
KWin package version; one `.so` is not portable across releases.

## Build and install

```sh
cmake -S assets/kwin-scope -B build/kwin-scope \
  -DCMAKE_BUILD_TYPE=RelWithDebInfo \
  -DODIN_KWIN_EXACT_VERSION="$(kwin_wayland --version | awk '{print $2}')"
cmake --build build/kwin-scope --parallel
sudo cmake --install build/kwin-scope
```

The artifact is `build/kwin-scope/odin-scope.so`. Installation uses KDE's
platform plugin path. Fedora 43 uses
`/usr/lib64/qt6/plugins/kwin/plugins/odin-scope.so`; Debian multiarch commonly
uses `/usr/lib/${DEB_HOST_MULTIARCH}/qt6/plugins/kwin/plugins/odin-scope.so`.

For nfpm, build in a distro image containing the exact target `kwin-devel`,
Qt 6/KF6 development packages, ECM, libepoxy/libdrm/Vulkan/Wayland development
packages, and a C++20 compiler. Set `KWIN_DEPENDENCY` to the exact runtime
package relation and `KWIN_PLUGIN_PATH` to the path reported by Qt for that
distro. The CMake version assertion prevents accidentally compiling against a
different KWin ABI.

Metadata sets `EnabledByDefault` false. Installing it must not edit KWin
configuration, load the plugin, or restart a desktop. An operator may load it
in an explicitly authorized disposable/target session:

```sh
qdbus6 org.kde.KWin /Plugins org.kde.KWin.Plugins.LoadPlugin odin-scope
```

Unload with `UnloadPlugin`. Never test by replacing the active workstation's
KWin process.

## Protocol and authority

KWin itself acquires `org.kde.KWin.OdinScope` through its already-existing
`QDBusConnection::sessionBus()` and exports `/org/kde/KWin/OdinScope`, interface
`org.kde.KWin.OdinScope`:

* `Identity(string challenge) -> string JSON`
* `Snapshot(string request_json) -> string JSON`

Identity binds a 48-hex challenge and reports `native_wayland=true`,
`compositor_name="kwin_wayland"`, the compiled KWin version, normalized backend
class, and native/x11-nested backend kind.

Snapshot protocol 1 accepts only a 48-hex challenge, 64-hex source digest and
one bounded monitor source whose integer geometry exactly matches one current
logical output. It returns bound challenge/digest, native/safe flags,
`wl_client` credential PID, focus serial/token, bounded title/class, modal
state, and integer source-local content bounds.

It denies Xwayland/non-native focus, lock/input-method clients, lock screen,
fullscreen effects such as overview, shortcut inhibition, interactive
selection/move/resize, pointer constraints, unrelated keyboard-focus versus
toplevel mismatch, ambiguous output geometry and overlapping higher surfaces.
Bounds use `clientGeometry`, excluding KWin decoration controls, and round
inward before clipping to the selected output. An ordinary native grabbed popup
is eligible only when the actual keyboard-focused surface has the `xdg_popup`
role and KWin's compositor-resolved Wayland popup-parent chain reaches the
eligible active application. Every intermediate popup must retain the same
`wl_client`, PID, visibility/security eligibility and unconstrained pointer.
The chain is bounded to 64 hops; app ID or PID equality alone is insufficient.
KWin assigns ordinary XDG popups `WindowType::Unknown`, so the native role is
checked explicitly rather than trusting a menu-type hint. Bounds belong to the
focused popup, not the underlying application. Higher overlapping surfaces
still deny scope, and keyboard-surface changes rotate the focus token even if
the active toplevel does not change. Non-grabbing popups, unrelated/foreign
popups and unresolved parent chains remain unavailable.

The Python adapter independently pins the provider owner to `org.kde.KWin`,
the expected executable/inode, UID and PID, then brackets application process
provenance with two identical observations. Same-user D-Bus alone is not an
isolation boundary.

## Build evidence and current admission status

The artifact was built successfully against stock Fedora 43
`kwin-devel-6.7.4-1.fc43`, KWin private plugin ABI `6.7.4` ABI. Its metadata
carries the exact `org.kde.kwin.PluginFactoryInterface6.7.4` IID. Source API was
also inspected against upstream KWin 6.3.6. Rebuild for every other release.

This revision is **not production-admitted on stock KWin 6.7.4**. Separate
same-stack EIS qualification proved input delivery but found that abrupt EOF
from the sole EI sender did not synthesize release for a held button/key within
four seconds. The controller therefore fails closed with
`compositor_held_button_eof_release_failed`. No usable stock-KWin companion
package should be published until complete input admission passes. The scope
plugin's read-only API was loaded into an isolated rootless-container virtual
KWin, not the workstation desktop. A real GTK context menu was opened and its
item selected using a separately authorized scratch EI helper, with observed
button releases. Native snapshots changed from application bounds to popup
bounds and back, with distinct focus serials/tokens. This proves popup scope
resolution and menu-item targeting in that isolated session, not production
input admission, a portal stream, or EOF release qualification. See
`evidence/20260907-native-popup/RESULT.md` for exact results and limits.
