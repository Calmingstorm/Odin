# Process evidence authorization and quota

`manage_process poll` retains its default newest-50-lines view. Explicit
offset/cursor reads use immutable job generations and bounded UTF-8 byte pages.
Output remains evidence, not permission to write stdin or signal an exited job.

## Authorization

New jobs persist the owner, originating delivery channel, credential-scope hash,
and a host binding containing the alias, runtime generation, and a digest of the
connection/trust identity. No API credential or connection details are persisted
in these fields. Runtime generations alone are insufficient across restarts.

Retrieval compares that provenance and rechecks current tool and host grants
before dispatch, after asynchronous waits, and before returning evidence. Remote
reads reacquire only the original authorized host identity after restoration.
The direct execute endpoint uses its stable delivery channel rather than its
ephemeral conversation ID. Production handlers reject legacy manifests lacking
a host binding; empty-scope compatibility is limited to internal test handlers.

## Secret masking

The complete capture is masked before any requested byte slice. JSON credential
keys are decoded (including escaped key characters); complete nested values and
incomplete values at capture boundaries are masked. Replacement uses one ASCII
asterisk per original UTF-8 byte, preserving coordinates. Local capture, remote
supervisor finalization, and remote controller reads share the same scrubber.
Tail views derive from the scrubbed capture only when it contains the entire
emitted stream, or from a complete small in-memory stream after storage loss.
A clipped tail has unverifiable enclosing secret context, even across multiple
lines: it is withheld with explicit `tail_status` and a retrieval cursor for the
safely masked retained prefix. No tail bytes or fabricated intervals are shown
on that failure path. Ordinary complete-capture newest-50 behavior is unchanged.

## Capacity

Each remote start reserves 4 MiB before dispatch against the combined 128 MiB
process-output quota. Pending dispatches count too. Local writers may consume
only the exact remaining unreserved bytes. Accounting charges the greater of
actual retained bytes and a job's reservation, not their sum. A partial chunk
lost to quota sets `capture_error` immediately, without waiting for another read.
A complete small memory tail can still be shown at its true emitted coordinates;
prefix retrieval reports only actual retained coordinates. A terminal remote
snapshot releases unused reservation, retaining its actual byte charge until
expiry. Unknown remote jobs conservatively keep their reservation across
restart. Failed starts release pending reservations; cancellation attempts the
existing unsettled-dispatch cleanup before releasing its lease. Evidence expiry
releases accounting and read leases. The retention period remains 24 hours.

Regression pins: `tests/test_process_retention_security.py` and
`tests/test_process_output_retention.py`, including real executor channel/token
fences, restart/repoint checks, live revocation, local/remote JSON slices,
concurrent reservation accounting, local exact quota remainder, abort paths,
terminal accounting, and expiry.
