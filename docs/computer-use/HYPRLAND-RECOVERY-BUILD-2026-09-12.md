# Unqualified Hyprland recovery build

Completion scope: changes through `3972b34d` and its durable-recovery follow-up.
This lane implements recovery without deploying or qualifying it on a desktop.
`runtime_qualified` remains false. The real-machine procedure is
[HYPRLAND-RECOVERY-QUALIFICATION-PLAN.md](HYPRLAND-RECOVERY-QUALIFICATION-PLAN.md).

## Delivered contracts

1. **Task continuity, not window continuity.** Native loss preserves descriptive
   task hints, durable interruption state and command identity. Recovery can
   rediscover a replacement desktop but cannot treat it as the old window.
   Reconciled predecessors support an explicitly selected successor through
   `recovery_session_id` and `recovery_generation`. Actual compositor death
   normally leaves release unknown. It records local closure separately and
   preserves the task through explicit external-cleanup attestation into a fresh
   selected successor. The user need not reconstruct task hints. Seamless automatic
   cross-compositor native authority remains refused without a native witness.
2. **Automatic durable handoff.** The exact surviving compositor/plugin/window
   and surface lifetime can move to a new scoped output generation after original
   owner release and closure. The controller persists the fence and command before
   native preparation, checks authority again, and commits the parent-linked
   successor with synchronous native activation inside the store transaction.
   Previous pixels are invalid; a new observation and plan are mandatory.
3. **Narrow durable takeover of original ownership.** Before any arm, the backend
   registers and persists an exact native owner. A controller or recovery-daemon
   restart may rehydrate **only** a persisted v2 descriptor with its exact secret
   capability, original compositor/plugin/ledger, exact permitted successor
   identity, and verified old-owner PID/start-tick exit. The provider attests the
   original compositor/protocol, fences old guardian input, and gives the new
   owner release-only reconciliation authority. Lost acknowledgements cause a
   status query with the original durable transaction identity, not release replay.
   The intended successor is persisted before dispatch and a successful successor
   descriptor before reconciliation. Legacy descriptors, absent/wrong capability,
   an active old owner, mismatched identity, changed compositor/plugin/ledger, or
   an unavailable retained ledger refuse. Native tombstones are bounded to 4096
   and never evicted to admit another owner.
4. **Retirement separate from release.** The native protocol permanently fences
   one owner and can retire its captured virtual client with a versioned native
   destruction certificate. A retained original compositor pidfd proves only its
   process exit, not native retirement or release. Confirmed local closure permits
   dropping the inactive adapter while durable quarantine remains. Incomplete
   local closure retains it. Neither case upgrades receiver evidence.

## Safety repairs found during integration

- Initial source adoption now checks the exact selected window and plugin epoch
  both before guardian creation and after startup. A same-process sibling is not
  an acceptable substitute.
- Recovery spawn persistence permits only the exact live preparation, backend,
  generation, epoch and executing task. Late callbacks after stop remain refused.
- The handoff/quarantine savepoint is selected from immutable backend identity,
  not a racy pending-row read. A failed session update rolls back lineage too.
- Unknown action release cannot take the known-no-input output-handoff path.
- Sticky native release uncertainty cannot be repaired by repeating RELEASE-ALL.
  The documented remedy is exact retirement where provable, external operator
  cleanup, and authenticated explicit reconciliation without a release claim.
- Compositor death remains unqualified for native release proof. Resource absence
  without an exact supported certificate remains false, and no universal receiver
  release is claimed. After explicit external cleanup/attestation, a fresh
  successor may carry task hints and lineage only. It must select a fresh target,
  deliver fresh pixels, receive current consent and a new grant before new input.
  No action, observation, grant, scope token, native authority, or result is
  resurrected.

## Operator surface

There is no shell recovery driver. The release-only public operation is:

```json
{
  "operation": "reconcile",
  "session_id": "<durable-session-id>",
  "generation": 7
}
```

It does not resume a task or authorize input. It either performs the narrowly
eligible durable-owner query/takeover-and-release flow, records an explicit
operator-reconciliation boundary, or refuses. A post-compositor-death successor
is an operator-created session with fresh target selection and observation, not an
automatic continuation.

## Offline evidence

Final focused run: **178 passed**, exit zero, 5.35 seconds.

| File under `tests/` | Count |
| --- | ---: |
| `test_hyprland_reconnect_protocol.py` | 34 |
| `test_hyprland_reconnect_protocol_native.py` | 2 |
| `test_hyprland_recovery_backend.py` | 51 |
| `test_hyprland_recovery_controller.py` | 24 |
| `test_hyprland_recovery_end_to_end.py` | 14 |
| `test_hyprland_recovery_store_atomic.py` | 2 |
| `test_hyprland_recovery_tool_schema.py` | 2 |
| `test_hyprland_durable_reconnect.py` | 34 |
| `test_hyprland_durable_recovery.py` | 15 |

These exercise injected transports, real SQLite transactions, actual
controller/runtime persistence integration, and compiled extracted native
ownership/window-lifetime methods. The complete plugin was not compiled against
the pinned headers in this lane and no receiver or compositor runtime was used.

The complete local coverage run passed **17,619 tests**, skipped 32, exit zero,
433.73 seconds. The unchanged ratchet reported zero findings and 92.7% total
coverage (reported, not gated). Existing warnings remain visible. The completion
report records the separate plain suite and exact-head hosted gates.

All 16 tracked `x11_*.py` files are byte-identical to `origin/master` at
`ef119814afcaf6a19996f29f12fddf79a3aaa5f9`. No generic Wayland runtime file was
changed by this lane. Shared controller/store changes require the full regression
suite despite that byte-identity attestation.

## Deliberate limits

No application-assisted document restoration protocol, cross-incarnation window
identity, replacement-ledger inference, automatic input replay, emergency unknown
release override, automatic controller-restart authority reconstruction, deployment,
or qualification flag change. The narrow v2 durable takeover is not a generic
restart recovery mechanism and grants release-only reconciliation, never task or
input authority. The qualification plan distinguishes it from mandatory
dead-ledger refusals and identifies the missing real-machine recovery orchestration
driver rather than inventing an executable command. No workflow, gate, baseline,
worker ceiling or lint/type configuration was weakened.
