# Persisted quarantine reconciliation

## Verified diagnosis

The deployed status reader used `settings.display_name`, but the shipped
`ComputerUseConfig` exposes `display`. With the explicit `/dev/null` authority
configuration, AT-SPI status reached this branch and raised `AttributeError`.
The operator status route returned 409 before publishing otherwise valid state.
The corrected read-only status probe reports accessibility enabled.

The reported recovery JSON shapes are valid. The legacy API administrator and
the quarantined Discord-session owner are different identities. Existing
owner-scoped recovery raises `ComputerError('not_found')`, a `ValueError` subclass,
which the old API mislabeled as invalid request (400). This is separate from the
status exception.

Even using the original owner does not unblock this record: its runtime identity
is present, `launch_pending=true`, input was enabled and persistent-device absence
was not certified. Automatic recovery returns `launch_identity_incomplete` and
legacy acknowledgment refuses a modern descriptor. Restart retains those facts.

## Resolution

Fix the actual configuration attribute; expose bounded domain errors. Keep
automatic recovery and legacy acknowledgment owner-scoped. Add explicit,
host-admin, generation-fenced reconciliation for stranded attached sessions,
including a minimal cross-owner quarantine status so a host operator can reach
the admission blocker without gaining capture/evidence access.

The operator attests independently inspected desktop cleanup. A bounded read-only
machine check additionally refuses surviving known processes/groups or unknown
inspection. It never signals processes, opens the display, changes device state,
replays an action, or treats a pending launch as proof of absence. Closure preserves
the failed cleanup, unknown action and runtime descriptor; the attestation is
recorded separately as unverified with complete=false.

The actual historical descriptor was inspected read-only: automatic recovery
returned launch_identity_incomplete; reconciliation prerequisites returned
recorded_processes_gone. No live store edit, recovery override, restart, deployment
or desktop input was performed during diagnosis. End-to-end route recovery and
native-input qualification require the externally gated deployment of this fix.
