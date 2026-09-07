# Native KWin popup scope regression, 2026-09-07

Bounded fix for audit 84c5fae9 item 2. Base: 9a4531dd1e890a60b11175af96b5fa902874e1a8.

## Observed

* Compiled exact private ABI with `ODIN_KWIN_EXACT_VERSION=6.7.4`, GCC 15.3.1.
  Runtime: stock Fedora 43 `kwin-6.7.4-1.fc43`, Qt 6.10.3, GTK 3.24.52.
* Plugin SHA-256: `6a9c1250e36a1e27bfc88a86a1fcc17b6ba0a24d899a5d3fbb724ea80235dd62`.
* Rootless Podman image `localhost/cu-r11-kde-stock:fedora43-kwin6.7.4`.
  Separate private PID/IPC namespaces, no host display/session mount and no
  network in the runtime container. Container UID 0 maps to unprivileged host
  user. The image's KWin file capability is removed inside the disposable
  container only so rootless execution works; executable bytes remain stock.
* Authenticated scope D-Bus owner and PID matched the running KWin process;
  its `/proc/PID/maps` contained the newly built plugin. Load/unload passed.
* Real GTK context-menu grab: application `(150,139,500,350)`, focus serial 3;
  popup `(401,315,241,35)`, serial 4; restored application, serial 5.
  Same credential PID 30 throughout. Distinct focus tokens asserted.
* Scratch EI right-click opened the native menu. Its actual returned popup
  bounds selected a real menu item. GTK recorded right-button release,
  left-button release, and `item_selected`. Helper explicitly released both
  buttons before closing and disconnecting its EI context. No held keys.
* `native_menu_scope_pass=true`, `scope_load_smoke_pass=true`, subprocess exit 0.
  Inner and outer subreapers recorded `cleanup_ok=true`, no residuals; container
  was removed. No active desktop, deployment, service restart or pipeline used.
* 33 targeted Python tests passed: popup source guards, existing KWin adapter
  and packaging tests. Source-invariant tests are not native negative tests.

## Limits

**Production remains refused on stock KWin 6.7.4** by the unchanged mandatory
`compositor_held_button_eof_release_failed` qualification. Scratch helper input
is not controller admission and does not override that refusal. Source binding
in this isolated scope regression is synthetic, not a portal capture stream.

This run tests one GTK popup with item selection. It does not claim measured
submenu, cross-output, foreign-overlay, locked-session or non-rectangular
input-region coverage. The source retains all lock, security, pointer-constraint
and higher-overlap guards; unrelated/foreign popup ancestry is denied. Those
negative conditions were source checked, not reenacted in this native run.

Initial compile attempts found missing ECM/epoxy dependencies. Dependencies were
installed in a disposable builder, never on the host. The first native menu run
correctly refused because KWin sets ordinary XDG popup type to Unknown. The
final fix adds only native role-qualified popup eligibility; the final rebuild
and rerun passed. An intermediate supervisor invocation failed before spawning
because its exclusive report filename already existed; final reports use fresh
names. Failed attempts remain in the scratch evidence directory.

## Reproduction and retained artifacts

Scratch directory: `/tmp/cu-r11-kwin-menu-20260907T1555/`.
Final evidence: `result.json`, `menu-events.jsonl`, `build.log`, `stack.sha256`,
`inner-supervisor.json`, `outer-supervisor-3.json`, `build-supervisor-3.json`,
`container-final-state.json`, `container-remove.log`, and plugin binary.
Copied harness files accompany this report; they run only in the disposable
container, and import the existing `wayland_probe_sender.py` scratch sender.
The repository sender source is `src/computer/runtime/assets/wayland_probe_sender.py`;
subreaper is `scripts/computer-feasibility/owned-test-supervisor-r6.py`.
`run.sh` intentionally points at the isolated scratch directory, not production.
