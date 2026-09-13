# Unqualified Hyprland recovery build

Starting revision: `738783e564dbdd5140e48c5c0e66124147d82787`.
This lane implements recovery without deploying or qualifying it on a desktop.
`runtime_qualified` remains false. The real-machine procedure is
[HYPRLAND-RECOVERY-QUALIFICATION-PLAN.md](HYPRLAND-RECOVERY-QUALIFICATION-PLAN.md).

## Delivered contracts

1. **Task continuity, not window continuity.** Native loss preserves descriptive
   task hints, durable interruption state and command identity. Recovery can
   rediscover a replacement desktop but cannot treat it as the old window.
   Reconciled predecessors support an explicitly selected successor through
   `recovery_session_id` and `recovery_generation`. Actual compositor death
   normally leaves release unknown: that path retires provably dead resources,
   remains quarantined, and requires operator reconciliation. Seamless automatic
   compositor-restart task continuation is **not delivered**.
2. **Automatic durable handoff.** The exact surviving compositor/plugin/window
   and surface lifetime can move to a new scoped output generation after original
   owner release and closure. The controller persists the fence and command before
   native preparation, checks authority again, and commits the parent-linked
   successor with synchronous native activation inside the store transaction.
   Previous pixels are invalid; a new observation and plan are mandatory.
3. **Reconnectable original ownership.** Before any arm, the backend registers
   and persists an exact native owner. Reconciliation uses the original
   compositor/plugin/ledger plus authenticated recovery-process incarnation.
   Lost acknowledgements cause a status query, not release replay. Native
   tombstones are bounded to 4096 and never evicted to admit another owner.
   Reconnection after the controller process restarts remains unsupported;
   persisted descriptors are evidence, not reconstructed authority.
4. **Retirement separate from release.** The native protocol permanently fences
   one owner and can retire its captured virtual client. A retained original
   compositor pidfd plus confirmed local closure can establish old-resource
   retirement after compositor death. Neither path upgrades unknown release or
   receiver evidence. Unproven retirement retains the revoked adapter.

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

## Offline evidence

Seven new test files contain **123 passing tests**:

| File under `tests/` | Count |
| --- | ---: |
| `test_hyprland_reconnect_protocol.py` | 34 |
| `test_hyprland_reconnect_protocol_native.py` | 2 |
| `test_hyprland_recovery_backend.py` | 45 |
| `test_hyprland_recovery_controller.py` | 24 |
| `test_hyprland_recovery_end_to_end.py` | 14 |
| `test_hyprland_recovery_store_atomic.py` | 2 |
| `test_hyprland_recovery_tool_schema.py` | 2 |

These exercise injected transports, real SQLite transactions, actual
controller/runtime persistence integration, and compiled extracted native
ownership/window-lifetime methods. The complete plugin was not compiled against
the pinned headers in this lane and no receiver or compositor runtime was used.

The final local coverage run passed **17,564 tests**, skipped 32, and exited zero
in 432.64 seconds. The unchanged ratchet reported zero findings and 92.7% total
coverage (reported, not gated). Earlier runs failed on outdated protocol fixtures
and a missing consent phrase; those failures were diagnosed and repaired, not
skipped. Existing warnings remain visible. Local lint, type and configuration
classification gates passed. The final plain suite and exact-head hosted gate
results belong to the completion report, not an assumption in this document.

All 16 tracked `x11_*.py` files are byte-identical to `origin/master` at
`ef119814afcaf6a19996f29f12fddf79a3aaa5f9`. No generic Wayland runtime file was
changed by this lane. Shared controller/store changes require the full regression
suite despite that byte-identity attestation.

## Deliberate limits

No application-assisted document restoration protocol, cross-incarnation window
identity, replacement-ledger inference, automatic input replay, emergency unknown
release override, controller-restart authority reconstruction, deployment, or
qualification flag change. The qualification plan distinguishes supported
positive cases from mandatory dead-ledger refusals and identifies the missing
real-machine recovery orchestration driver rather than inventing an executable
command. No workflow, gate, baseline, worker ceiling or lint/type configuration
was weakened.
