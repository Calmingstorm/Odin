# R11 native X11 implementation evidence

Scope: guardian/native XTEST, persistent XI2 pair, RandR/DPMS capture helper.
No deployment, main-session access, pipeline or push. Tests use an automatically
allocated disposable Xvfb only, with a disposable GTK3 TextView application.

## Observed native results

Command: `/tmp/cu-r10-dev-venv/bin/python tests/harness/x11_r11_persistent.py`.
Recorded 2026-09-07, exit 0. Detailed output retained locally in
`/tmp/cu-r11-persistent-evidence.json`.

- Xvfb allocated `:1`; no `:0` connection. GTK PID 4110519 stayed responsive.
- Owned master pointer/keyboard and XTEST slave IDs were 8/9/10/11. Seven
  detach/re-attach cycles reused those exact IDs. No remove/disable/reattach call
  exists in this implementation.
- Core cursor remained at (850,600), independently injected cursor at (120,120).
- Normal completion, controller EOF, cancel, helper SIGKILL, scope loss while
  button held, lease expiry and dispatch expiry all left owned endpoints empty.
  Interrupted effects reported unknown, not replayable success.
- Killing the guardian-owner process while its helper held button 1 also left
  the endpoints empty: the injector's own bounded potential-down ledger releases
  on parent revocation/EOF. The guardian independently retains release authority
  for helper failure. Simultaneous forced death of both clients is not certified.
- GTK accepted `aliveé` after those cycles. Unicode `é` resolved to active
  AltGr keycode 92 + keycode 26. Unsupported emoji was rejected at index 1
  before any injection. Native keymap snapshots were unchanged.
- Native RandR screen-size-in-mm A->B->A produced revision 1->5 despite restored
  geometry, and capture rejected the old topology. This is actual event evidence.
- Xvfb reported DPMS unsupported. Real sleep/wake is **not hardware-qualified**;
  asleep/query-failure behavior is unit-tested and returns no successful frame.

The harness changes only its disposable X server's layout as fixture setup.
Production never changes a keymap. XI2 master keyboards have their own active
layout; unsupported characters are reported rather than copying/remapping a
human keyboard layout. Clipboard paste is not implemented.

## Wire contract

Capture worker operation `input_capabilities` probes actual endpoints without
injecting input. It creates/reuses the persistent pair and returns `pointer`,
`keyboard_focus`, `widget_focus`, `shared_pointer`, `shared_keyboard`,
`persistent_input_devices`, exact `device_identity`, `released` and
`owned_devices`. `persistent_idle` requires all queried endpoints empty.
Guardian receipts carry the same separation/identity metadata; persistent idle
requires fenced helper, released ledger and independent empty endpoint query.
Never infer that state merely because a process exited.

Independent pointer focus is per master across windows. GTK widget focus within
one window remains shared. Shared core-XTEST fallback is preserved when master
creation is unavailable; injector mode cannot fall back midway through a gesture.

`--watch-topology` capture-worker mode retains the RandR event subscription,
emits topology_ready/topology_changed records and exits on stdin EOF. Event
revision belongs to its retained connection; physical source seals are separate.
The backend must invalidate observations on every event/error/exit, bracket
capture against watcher state and recheck before input. One-shot connections
cannot establish historical absence of topology changes.

## Limits

Focused regression result: 245 passed across native-device, guardian R5/R10,
new R11 actions, RandR/DPMS, capture R4/R10 and attached-worker fixture suites.
Ruff passed on the five runtime modules and directly changed tests/harness;
`git diff --check` passed. No full repository suite or deployment validation is
claimed by this subtask.

This is bounded disposable-stack evidence, not a zero-risk claim or certification
of every X server/toolkit. Pointer injection still depends on active-window scope
validation, lifecycle gates and operator stop. Global simultaneous SIGKILL or a
dead X server can defeat release; those cases must remain unverified cleanup.
No device removal is an appropriate attempted repair for them.
