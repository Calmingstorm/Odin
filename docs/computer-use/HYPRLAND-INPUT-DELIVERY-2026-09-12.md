# Isolated Hyprland input-delivery repair, 2026-09-12

Status: the stationary-click non-delivery is diagnosed and repaired. The narrow
three-case receiver corpus passes. **`runtime_qualified` remains false.**

Authorization: `/home/odin/reviews/input-delivery-lane-2026-09-12.md`.
Started from clean `feat/onboarding-wayland-autonomy` at `114dde0d`, pulled
fast-forward-only before editing. This lane does not deploy or change the live
installation. Full local report and evidence are under
`/mnt/storage/hyprland-lab/INPUT-DELIVERY-REPORT.md` and
`/mnt/storage/hyprland-lab/evidence/input-delivery-20260912/`.

## Root cause and control

The initial absolute pointer warp targeted `(640,400)`, exactly where the guest
cursor already sat. Pinned Hyprland 0.55.2 `onMouseWarp()` calls
`mouseMoveUnified()`, whose unchanged-floored-coordinate fast path returns
without establishing pointer focus. The plugin expected the admitted warp to
synchronously establish the already-observed destination. That assumption was
wrong for this stationary initial-positioning case.

An attribution-only control preserved the failure. Its real status names the
three rejections in order:

1. `warp-post-pointer-focus-mismatch`: warp admitted, original returned, scope
   still valid, but pointer focus did not become the destination.
2. `scope-not-armed`: queued button down arrived after warp-triggered revocation.
3. `scope-not-armed`: queued button up also arrived after revocation; no accepted
   down existed in the plugin's owned-button ledger.

Thus `accepted=1, rejected=3` was not three elapsed-deadline failures. The receiver
observed no pointer entry or button pair. Transport flush and cleanup ACK did
not establish delivery. `cursor-control/report.json` records the pre-action
cursor and planned point; the three diagnostic guards survive receiver teardown.

## Production changes

- `assets/hyprland-input/scope-plugin.cpp`: bounded diagnostic storage retains
  the first eight rejection guards after each successful arm, with baseline and
  explicit overflow indication. All previous counter increments retain their
  control flow. The general mutable reason may still change on teardown; the
  diagnostic slots do not. No coordinates, application text, or tokens are added.
- The same file's `onWarp()` reprocesses only an admitted stationary initial
  position through Hyprland's normal `simulateMouseMovement()` path. It does
  not replay the virtual-pointer request, physically move the cursor a second
  time, call `refocus()`, or grant a new lease. The original one-shot positioning
  gate must still be unconsumed; scope, no-held-input, position, and exact
  destination are checked again. Every focus transfer still crosses the existing
  guarded hook. All final scope/focus/destination postconditions remain intact.
- `assets/hyprland-input/guardian.c`: changed rejection counts report
  `scope-rejected-input` / `scope_refused`; a missing counter reports
  `scope-ack-invalid`. Neither is mislabeled as a scope timeout. Cleanup ACK
  calculation is unchanged, and either anomaly still fails the action.

No completion-versus-release harness repair was needed. Its wording did not
cause the native `closed` terminal. The counter mismatch did.

## Targeted regression evidence

Final targeted run: **437 passed, zero skipped/failed/errors, 14.71 seconds**.
One existing `audioop` deprecation warning remains visible. No full-suite,
coverage, hosted gate, or workflow dispatch was run. Changed-test Ruff and
`git diff --check` passed.

New modules:

| Module | Passed | Evidence type |
| --- | ---: | --- |
| `test_hyprland_rejection_attribution_r46.py` | 5 | Extracted real guardian C, synthetic transport doubles |
| `test_hyprland_plugin_rejection_r46.py` | 6 | Extracted C++ diagnostic helper and source contracts |
| `test_hyprland_attribution_capture_r46.py` | 1 | Real captured 35-field status, actual compiled parser |
| `test_hyprland_stationary_warp_r46.py` | 11 | Extracted real warp hook, synthetic compositor context |

The captured fixture is byte-identical to `cursor-control-run.txt`, 1,054 bytes,
SHA-256 `53a2f3f8d569201d9e6efbe43a009b4b9eca11d47b791dd128377808d2d6a338`.
The previous 25-field capture remains unchanged. Existing pointer-entry/framing
test doubles gained the required APIs; held-input assertions now pin both warp
checks and the focus-transfer check instead of requiring the obsolete count.
Removing the stationary reprocessing action makes the stationary regression fail
its delivery-state assertion. Restored production bytes match the guest build.

The remaining 414 passes cover parser, release channel, dispatch batching,
pointer entry, framing, native wire loss, deadlines, held inputs, provenance,
popups, packaging, dialog scope, instance endpoints, and target selection.
Exact per-file counts and XML are retained in `verified-summary.json` and
`final-targeted-corrected.xml`.

## Live receiver evidence

Resumed the existing KVM guest, without rebuilding its compositor or graphics
stack. Built the companion separately against the same pinned 0.55.2 tuple.
Each post-refusal experiment used a fresh guest compositor, never a replay of
the refused lease. No unknown-release recovery was bypassed.

The fixed corpus exited **0**, with all three existing cases passing:

- Stationary click: receiver `pointer_enter`, then exactly button 272 down/up.
  Guardian reports `action_done`, acknowledged cleanup. Cursor and intended
  point are both `(640,400)`, matching the failing control.
- Stale snapshot: rejected at arm with `scope_error=stale-snapshot`, zero input
  events queued/submitted. Receiver log contains no corresponding input.
- Cooperative SIGTERM during a held stroke: receiver down precedes the signal;
  receiver up follows it. Native terminal is explicitly `signal_cancel`, with
  acknowledged cleanup and only two of seven planned steps completed.

Final companion counters: `accepted=4`, `rejected=0`, no owned keys/buttons,
unarmed, `failed=false`, release acknowledged. These are guest observations,
not claims about Aaron's workstation.

Guest-tested source SHA-256:

- guardian: `7c8a13bae0990ecf0f07cb50da8e0005f92c3e524ce183f8259d720009af3aff`
- plugin source: `d013f7dae4241c18b1fa54c60706c9d7c2e77f78677ddb550e047dd4b45e37a8`
- plugin ELF: `adf52f9a98b583a6dc96dd224e42805a432a5c785d4cf795ac76513528c1b2e5`

## Qualification boundary and deliberately untouched findings

This qualifies the narrow observed receiver cases, not the entire runtime.
`runtime_qualified` must not move on this evidence alone. The stale test lacks
an explicit receiver drain barrier; live stationary popup entry, alternative
follow-mouse policy, keyboard/modifier release, mixed-source holds, transport
loss, SIGKILL, and compositor teardown/restart remain unproven here. Restart
continuity, durable unknown-release reconciliation, and plugin preparation were
explicitly outside this lane and remain untouched.

Adjacent harness/receipt issues, reported rather than fixed:

- Non-`action_done` completion is called unconfirmed release even with a native
  cleanup ACK. Continuation still stops conservatively.
- Fast guardian exit can race the harness's `/proc/<pid>/exe` read. One attributed
  control hit this while the independently captured plugin guards still identified
  the rejection. It is not receiver proof and was not counted as a pass.
- Stale begin retains outer `reason=invalid-command`, while detailed fields
  correctly name `scope_refused` and `stale-snapshot`.
- `scope_operation` can remain `arm` when cleanup detects changed rejection
  counters. The detailed counter diagnosis is correct; operation labeling is old.
- The stale guardian cleanup request can be negatively acknowledged because arm
  never bound that guardian. Zero queued/submitted input and separate clean
  plugin status are the relevant evidence, not a nonexistent guardian release ACK.
- The existing SIGTERM harness does not itself assert the exact terminal cause;
  this run's actual receipt was independently checked as `signal_cancel`.

## Host isolation and shutdown

QEMU: six vCPUs, 8 GiB guest RAM, 11 GiB cgroup cap, CPU quota six cores,
nice 10, idle I/O, plain `virtio-vga,blob=false`, `-display none`. Device policy
allows KVM, not host DRM/input; namespaces hide host DRM/input, desktop sockets,
Aaron's home and the live install. Runtime FD inventory had no host DRM/input
descriptors. No host graphics backend, passthrough, module, network, session,
Incus, or live-install change was made.

The guest compositor, receivers, guardians, and VM are stopped. Loopback SSH
forward is closed. Offline `qemu-img check` found no errors. Lab allocation was
4.5 GiB (4,774,379,520 bytes before final reports). Aaron's original c1 session
remained active on seat0/tty7/:0, leader 1798. `odin.service` remained active with
`NRestarts=0`. `/opt/odin` was not accessed or modified by this work.
