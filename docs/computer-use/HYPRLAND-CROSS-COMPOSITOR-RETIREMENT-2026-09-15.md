# Bounded cross-compositor retirement

## Evidence model

The replacement compositor never supplies evidence about the original ledger.
The original authenticated plugin seals the exact guardian virtual keyboard,
virtual pointer and Wayland client before first input admission. Subsequent arms
must use that same inventory. This inventory is restricted to the pinned native
implementation's process-local Wayland virtual-input resources, not kernel input
devices or arbitrary future input backends.

The original controller retains the authenticated inventory and original kernel
process handles while the compositor and guardian are alive. Retirement requires
both retained lifetimes to report exit, separately recorded local guardian reap
and adapter/provider closure, and an independently authenticated, different
successor compositor on the same boot. The successor establishes only its own
identity. Missing original witness, bare PID absence, a recycled PID, a closed
socket, a manifest boolean, or a successor's assertion is insufficient.

The certificate describes absence of the original protocol-processing endpoints
and virtual devices. It does not claim that no copied file descriptor exists
anywhere, or that a receiver cannot consume an event queued before disposal.
Disposal prevents those retired resources from generating new input. Scope RPCs
use per-request sockets closed in their `finally` blocks; provider closure is a
local lifecycle fence, not an independent kernel certificate of socket absence.

## Authority and uncertainty

Retirement is not release. Original action outcome stays unknown. Release ACK,
receiver release and successful task completion are not inferred. The historical
session remains fenced; continuation requires explicit selection and newly
created authority with fresh pixels. No input or old observation is replayed.

Proofs are bound to the exact owner, predecessor, sealed inventory, command and
successor. The native inventory nonce identifies private exact resource records;
it is not an exported pointer address. Private retained witness state verifies
proofs. Persisted assessments
also bind the recovery generation and command through the store's transactional
session checks. These are trusted-backend provenance records, not independently
reconstructible or self-authenticating native certificates after a controller
restart. A qualified boolean without the matching evidence is rejected.

## Deliberate limits

- The original controller must survive and retain its kernel handles and witness.
  A serialized descriptor does not reconstruct this authority after a crash.
- Same-boot compositor replacement is the bounded case. Reboot startup and
  changed-boot historical retirement are separate claims.
- Plugin reload while the original compositor lives does not satisfy retirement.
- Native protocol support is not itself runtime qualification. Qualification must
  be recorded against the actual lab tuple before enabling the bounded gate.
- This does not qualify the entire task-lineage, output-handoff, durable-takeover,
  human-conflict, or cancellation matrix.

## Venue

Only the disposable KVM guest is used. No production deployment, external
workstation, host desktop input, or host compositor restart is part of this work.
The lab retains its independent SSH stop path, exact process identity checks and
evidence. Faults are ordinary guest test operations, not justification for broad
process kills or deletion of unrelated data.

## Qualification record

**Qualified and enabled:** `same-boot-retained-original-witness-v1`, following
provisional positive evidence and a rebuilt shipping-default final run. See
[the final KVM evidence](HYPRLAND-CROSS-RETIREMENT-LAB-2026-09-15.md) for the exact
tuple, receiver events, failed attempts, source hashes and limits. The original
compositor was killed after a receiver button-down; release remained unknown.
The real controller/store accepted verified resource retirement and required a
fresh target. Neither receiver release nor old-action success was claimed.

| Capability | Outcome |
| --- | --- |
| Incarnation-bound retirement after failed local cleanup | Qualified only for retained original witness, same boot, auto-discovered successor, surviving controller. Shipping bounded gate enabled. |
| Task-lineage/same-incarnation recovery | Prior bounded idle evidence unchanged. Full natural-trigger, cancellation and interrupted-action matrix not newly qualified. |
| Durable output-grant handoff | Prior scale-1 evidence unchanged. Scale-2, coordinate-disambiguation and full topology/race matrix remain unqualified. |
| Persisted-descriptor takeover | Prior native release-only prerequisite evidence unchanged. Controller crash rehydration and stop-during-takeover remain unqualified. |
| Plugin autoload/auto-discovery across guest reboot | Prior positive KVM evidence retained. This run additionally exercises managed loading and discovery across same-boot compositor replacement, not a new reboot run. |

No remaining item is claimed to require hardware unavailable in the lab. The
unqualified cases above lack implementation or recorded matrix evidence. They
are not hidden behind the enabled retirement flag.
