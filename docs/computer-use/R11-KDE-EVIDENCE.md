# R11 KDE evidence and refusal

Engineering record, not installed operator documentation.

The compositor registry recognizes GNOME and KWin 6.1+. Portal peer verification
retains the consent-selected compositor bus. KWin scope authenticates the same
process, bus owner, UID, executable and challenge as its opt-in in-process plugin.
Generic scope shares denied-class, process identity and freshness policy with GNOME.

## Actual stock compositor tests

Fedora 43 `kwin-6.7.4-1.fc43`, `libei-1.5.0-1.fc43`, and Rawhide
`kwin-6.7.4-2.fc46`, `libei-1.6.0-2.fc45` loaded their real packaged `eis.so`.
Both delivered ordinary input to a native GTK receiver. After button 1 and Shift
were held and the sole EI sender exited, both left receiver state 257, keys
`[65505]`, buttons `[1]`, without release within four seconds.

Both refuse `compositor_held_button_eof_release_failed`. Explicit guardian releases
were delivered in a separate lower-layer test, but it also failed
`guardian_orderly_exit_failed`. Neither result overrides mandatory admission.
No full KDE controller input completion is claimed.

Evidence: `/tmp/cu-r11-kde-stock-evidence.tar.gz`, SHA-256
`284706f20694a2f2581a4c39fded58a8de7b383ad19e1767b7e15c8049ebba70`.
Consolidation: `/tmp/cu-r11-kde-controller-evidence/`.

## Authentic companion load

Built against Fedora 43 `kwin-devel-6.7.4-1.fc43`, private IID
`org.kde.kwin.PluginFactoryInterface6.7.4`. Binary SHA-256:
`31e0673e44049546a6e442b604e3cfd66cce05285843acb8441a56974683db98`.

A later read-only rootless virtual-session smoke loaded it. KWin and OdinScope
shared the unique bus owner and measured compositor PID, with the plugin mapped
in that process. Identity returned the exact challenge/version/backend. Snapshot
returned the actual ordinary GTK receiver PID, native focus, class and content
bounds. Unload removed the bus name.

The rootless container required removing `cap_sys_nice=ep` inside that container;
executable bytes were unchanged. Snapshot used a synthetic descriptor matching
the virtual output, not a real portal stream. No input was injected by this smoke.
It is not full portal/controller qualification and does not change the refusal.

Evidence: `/tmp/cu-r11-kwin-load-smoke-20260907T1532/`. Inner and outer subreaper
reports completed with zero residual descendants; container removal was verified.
No real desktop or live service was changed.

A subsequent exact-ABI plugin build also resolved an actual GTK popup: scope
changed from application bounds to the popup's native bounds, with focus serial
changes on entry and exit. A scratch EI helper selected a real item and the
receiver observed both right/left button releases. This measured popup-scope
handling, not production admission. Evidence and explicit limits are retained in
`assets/kwin-scope/evidence/20260907-native-popup/`; those engineering artifacts
are excluded from installed packages. Mandatory stock KWin EOF refusal remains.

## Distribution limit

Companion sources and exact-ABI package recipe ship, not a universal binary.
No distro companion was published. This documented installation limitation is
not automatic KDE readiness. Install hooks never load compositor plugins.
