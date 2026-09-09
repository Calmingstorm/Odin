# R29 implementation checkpoint: partial delivery, live gate closed

This branch started at current master `f03e95c9`. The requested full Hyprland
backend is **not complete**. The independent source-install defects are fixed;
native identity/capture foundations and an isolated safety experiment are
preserved for review. No existing compositor admission was loosened.

## Implemented first

- Enable and enabled startup safely provision private storage, using no-follow
  descriptor traversal and validation of existing objects and creation winners.
- The authoritative running source root replaces the hardcoded package-root
  exclusion. Unsafe ownership, modes, ancestors, symlinks and SQLite sidecars
  are rejected without repairs or loss of stored receipts.
- An unprivileged, service-owned source checkout can select XDG storage only
  for an absent implicit default. The fallback is persisted before publishing
  enabled authority. Explicit paths and existing or inaccessible stores are
  never silently migrated. Disabled startup and status create nothing.
- Known provisioning/prerequisite failures return canonical typed
  `not_applied` errors. Unknown failures after lifecycle dispatch remain
  `outcome_unknown`; arbitrary exception details are not exposed.
- The UI preserves last-known status as historical, clears evidence handles
  and operational authority, requires an independent refresh and never replays
  a mutation. Emergency Pause/Stop remain separate authenticated revocations.
- Operator documentation and generated API references were refreshed; shipped
  UI distribution was rebuilt.

## Native foundation, intentionally unwired

Separate modules implement exact executable approval, process/boot identity,
matching Wayland/IPC SO_PEERCRED, explicit-output screencopy-v3, bounded native
buffers/deadlines, source-local transform mapping, and post-capture scope
fencing. No portal fallback, runtime registration or input grant is added.
The scope seam requires a future qualified compositor-loop provider; constructing
the Python proof object is not proof of authorization.

See [the foundation report](HYPRLAND-NATIVE-FOUNDATION-R29.md). These helpers are
not offered as a capture-only substitute for the required full input backend.
Source-install helper packaging/activation and production integration remain
pending qualification. Installing files must never activate the companion.

## Phase 3 result: incomplete, therefore NO-GO for live input

The version-pinned plugin candidate uses native API function hooks for
device-aware input and pre-focus fencing, with a compositor-owned dispatcher
closure retaining the RAII ledger until teardown before `dlclose`. This is a
credible **no-core-change candidate**, not a demonstrated guarantee. Initial
physical button census, motion/axis gating, authenticated production consent
and full modifier/overlap handling also remain unfinished.

The native plugin, sender, wire receiver and session-lock fixture compiled on
the target host. Isolation used private namespaces, HOME, runtime and D-Bus;
there were no physical input devices, DRM card/modeset nodes, active display
socket, or live installation inside the lab. Supplementary NVIDIA rendering
nodes were available only for the isolated allocator. Signed lab-parent
packages were extracted privately, not installed into the operating system.

Unmodified Hyprland started, but failed to create a functioning output. Monitor
creation could return `ok` while monitors remained absent or 0x0; GBM buffer
allocation failed. The harness rejected this before its native corpus.

Final result: `native_cases=[]`, `all_test_expectations_met=false`.
**No actual held-button/key SIGKILL cleanup, exceptional-unload release,
focus-transfer safety, lock or 250 ms scope corpus passed.** No Pinta input was
sent. This does not establish that a compositor core patch is required.

The complete candidate limitations, source references and execution record are
in [the Phase 3 research report](../../scripts/computer-feasibility/hyprland-phase3-README.md).
Those scripts are non-shipping research, not installed runtime code.

## Validation and preservation

- Integrated provisioning/API/lifecycle checks: 160 passed.
- Existing computer test matrix before adding the foundation: 3,494 passed.
- New Python foundation tests: 68 passed.
- Native capture helper: strict compilation and 25 isolated fake-wire checks
  passed on both the development host and separate target host. These are not
  actual-compositor qualification. The foundation author also recorded a
  passing Valgrind run.
- Computer browser fixture passed, including historical-status, no-replay,
  identity and concurrent mutation/read fencing. No new lint/type findings.
- Full suite at `a4f36dc9`: **15,688 passed, six skipped, exit 0**. The earlier
  full run found three integration failures (stale API reference and unclassified
  capture subprocess); all three were fixed before this complete rerun.
- Existing async teardown/unawaited-coroutine warnings remain; exit zero is not
  a claim of warning-free execution. Hosted coverage status is separate.
- Independent adversarial review at `6d8cb65a` reported no concrete blockers
  in the delivered increment; it did not qualify the Hyprland backend.

All owned lab compositors were stopped. Target live service PID/restart count
and active compositor PID were unchanged; the live configuration hash matched
the pre-test value. No live checkout, configuration, data, deployment, service
restart or active desktop interaction occurred. No configuration/data backup
was needed for a deployment because no deployment was attempted. Before any
future deployment, protected backup/restore and integrity verification remain
mandatory, including locally modified configuration and live data.

## Next required work

Obtain a functioning hard-isolated output using the target's unchanged stack,
then execute stock negative controls and the full native release/scope corpus.
Complete the remaining plugin safety features and production consent transport
only after that evidence supports proceeding. If a robust no-core approach
cannot satisfy the gate, stop for the operator's decision before relying on a
core modification. No live backend deployment or draw test precedes a genuine
GO result.
