# No-deploy hardening and isolated qualification

Started from `30b966e4` on `feat/onboarding-wayland-autonomy`, PR #356 draft.
No deployment, live-install access, service restart, master merge, gate weakening,
or host graphics/network/module change. The active desktop was not an input target.

## Delivered scope

1. **Store migration: done.** Online SQLite backup of the real v0 store, followed
   by migration of private copies only. Exact schema and index validation now
   rejects malformed state without repair; historical restrictions are removed
   only with their verified shape. Foreign-key declarations/orphans and persisted
   recovery semantics are checked. Schema failures have their own bounded public
   diagnostic rather than pretending the directory is unwritable.
2. **Adjacent receipt/harness findings: repaired with tests.** Completion, native
   cleanup, receiver delivery and local closure are separate claims. Definitive
   arm refusal does not fabricate a negative ownership-cleanup ACK; ambiguous arm
   outcomes still attempt cleanup. Missing rejection evidence invalidates ACK;
   changed counters name `release_all`. Exact SIGTERM cause and receiver drain
   barrier assertions are present. Final fast-exit harness hardening is described
   in the private adjacent report.
3. **VM qualification: partial.** Receiver evidence expanded, but no complete
   adversarial native corpus or live-desktop qualification is claimed.
4. **Offline workstreams: partial.** Plugin preparation before inventory is
   integrated. Native-continuity loss and unknown release preserve descriptive
   task intent in a durable quarantine, invalidate authority and prevent replay.
   Existing authenticated operator reconciliation can retire a cleanly detached
   session while recording that cleanup was unverified. Failed native cleanup
   retains the revoked adapter; safe automatic retirement and same-window
   continuity across compositor death remain deliberately unimplemented.

## Real-store evidence

The initial source was opened read-only and copied with `sqlite3.backup()`. The
new store class was never pointed at the live database. Final source was retested
on a new backup of that private captured snapshot.

| Existing table | Before | After |
| --- | ---: | ---: |
| sessions | 42 | 42 |
| receipts | 1,313 | 1,313 |
| session_cleanup | 42 | 42 |
| session_runtime | 42 | 42 |
| session_recovery | 1 | 1 |
| evidence | 0 | 0 |

The assignment described 447 evidence rows; the actual captured source had zero.
That is a source-description discrepancy, not a migration loss. Typed SQLite
values were compared using explicit TEXT/BLOB length framing and REAL bytes.
All existing values survived exactly. Version became 1; all three added tables
were empty; integrity and foreign-key checks passed. Reopening preserved rows
and schema; malformed/future copies were rejected unchanged. Real rows remain
private, not committed as fixtures.

Final store source SHA-256:
`e48697742fa7006831699ac970fa9083c6053b20ac9a1fef3b3b1b647d115a16`.
Machine evidence and runner:
`/mnt/storage/hyprland-lab/evidence/no-deploy-20260912/final-store/`.

## Receiver evidence and boundaries

The existing KVM guest used six vCPU, 8 GiB RAM, an 11 GiB cgroup cap, plain
virtio-vga and `-display none`. Host DRM/input/display sockets were inaccessible;
no passthrough. Native cases executed sequentially, then the VM powered off before
local full suites or hosted gates.

- Final repaired native guardian corpus: positive click with final orderly
  closure; stale refusal with receiver barrier 2; cooperative SIGTERM with exact
  cause and receiver press-before/release-after ordering. All three passed.
- Final guardian also delivered Shift+A with exact key sequence/modifier reset,
  Shift-plus-button cleanup under SIGTERM, and button cleanup on controller EOF.
- One alternate follow-mouse policy (`0`) delivered a positive click.
- SIGKILL yielded receiver release through the surviving plugin, but no guardian
  terminal. The harness stopped on unknown release, not a fabricated completion.
- Compositor SIGTERM yielded receiver release followed by disconnect, while the
  guardian correctly reported transport loss and unacknowledged cleanup. A fresh
  compositor, fresh target and fresh click later worked. That is not continuity
  of the old window or permission to replay its action.

Live stationary popup entry, independent overlapping sources, abrupt modifier
owner loss, arbitrary transport faults and full restart continuity remain
unproven. **`runtime_qualified` remains false.**

## Review corrections and validation

Independent and parent review caught an initial cleanup shortcut that confused an
unconfirmed arm with a refused arm; it was replaced with definitive-refusal-only
handling. Store review caught post-commit validation poisoning, rejection of valid
quarantined/resolved history on reopen, missing backend identity checks, and
insufficient schema/index validation. Those received fixes and regression pins.
The first full coverage run found an inaccurate historical fixture and personal
names in previous handoff documents; both were corrected without changing gates.

Local full coverage after those repairs: **17,429 passed, 32 skipped**, exit 0,
430.30 seconds; unchanged coverage gate reported **0 findings**, 92.8% reported
coverage. Lint, types and configuration-classification gates passed locally.
Separate plain full suite: **17,429 passed, 32 skipped**, exit 0, 423.04 seconds.
Both full-suite runs precede the final harness-only fast-exit correction; targeted
regressions and the exact final-head hosted suites validate that last increment.
Final hosted gate status belongs to the exact PR head reported after push, not
this preliminary local count. Visible coroutine/shutdown warnings remain, not
suppressed or represented as fixed.

Private reports under `/mnt/storage/hyprland-lab/`:
`NO-DEPLOY-STORE-REPORT.md`, `NO-DEPLOY-ADJACENT-REPORT.md`,
`NO-DEPLOY-QUALIFICATION-REPORT.md`, `NO-DEPLOY-WORKSTREAMS-REPORT.md`.
