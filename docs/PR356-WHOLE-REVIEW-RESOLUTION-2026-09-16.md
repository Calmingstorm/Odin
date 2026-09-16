# PR 356 whole-branch review resolution

Review baseline: `32a0e8ed`. The campaign branch was updated with
`git pull --ff-only` before implementation. Pre-existing uncommitted work was
preserved in a named stash, not overwritten or reapplied to this work.

This report covers F1-F22 from the 2026-09-15 whole-branch review and the
additional authorized retirement of the legacy 5.5 model. No deployment,
service restart, merge, live-desktop input, or external-machine access occurred.
CI/gate configuration and thresholds are unchanged.

## Finding decisions

| ID | Decision | Implementation and proof |
| --- | --- | --- |
| F1 | Fixed with explicit deployment prerequisite | Service-owned group-writable source ancestors can be delegated through a root-controlled exact UID/GID policy. Primary-group membership alone grants no trust. World write, foreign ownership, ACL ambiguity, unsafe policy ownership and symlinks remain refused. State parent stays private and environment writes remain 0600. Provisioning errors exit cleanly. Tests cover the permitted and refused boundaries. See `source-install-trust.md`; unchanged 775 installations still require that policy or administrator permission correction before deployment. |
| F2 | Fixed | Authenticated listener consent endpoint and UI reauthentication record durable widening consent only after completed setup and usable Web auth. A fresh raw admin credential is revalidated under the config publication transaction; sessions, query tokens, mutable labels and colliding user IDs cannot grant consent. Running sockets never change. Tests cover permission, source collisions, revocation/rotation, malformed stores and restart-time policy. |
| F3 | Fixed; behavior changed | Unexpected owned gateway completion, cancellation or failure requests service shutdown with exit status 1. The process supervisor can recover it. Normal library reconnects remain library-owned; tokenless bootstrap and intentional detach remain HTTP-only. Configured gateways make readiness false until connected. Tests exercise real supervisor/entrypoint failure and shutdown races. |
| F4 | Fixed; behavior changed | Global slash publication proceeds despite failed guild cleanup. Failed scopes remain retryable; temporary duplicate legacy guild commands are preferable to blocking all global commands. Tests cover partial and universal cleanup failure. |
| F5 | Fixed; behavior changed | Retry only proven connect-phase connector failures with existing bounded backoff. Generic OS errors, timeouts and uncertain delivery are not blindly replayed. Each attachment retry has an independent stream/wrapper; tests use actual multipart cleanup and cover borrowed buffers, paths, cancellation and exhaustion. |
| F6 | Diagnostic/documentation fixed; privilege limitation retained | Default managed activation remains enabled as requested, but strict mapped-image trust still requires a privileged controller. Added explicit root-required diagnostics and configuration/deployment descriptions. Desktop UID and runtime sudo do not meet that verifier. Stock unprivileged service autoload is not claimed. No manual-mode fallback weakens trust. |
| F7 | Fixed | Null/blank optional selection fields mean absent. Zero, false, malformed selections and incomplete populated recovery pairs remain invalid. X11 start-shape fixture tests cover the normalization without live input. |
| F8 | Fixed | Initialization state caches content reads with metadata/trust invalidation; completion, bind writes, replacement, chmod and deletion invalidate it. Recovery reason is logged without secret exception text. Both cached and authoritative startup paths remember observed records, preventing a vanished pending record from becoming legacy-complete. |
| F9 | Fixed | First attach uses public library startup even on an unqualified library version. Compatibility diagnostic remains visible. Retirement closes/cancels through public APIs, but private reset and another attachment remain blocked on mismatch. Dependency pin is unchanged. |
| F10 | Fixed; behavior changed | Pure outbound HTTP webhook actions work without Discord across admission, timers, trigger scans, retries, resume and run-now. Scheduler starts with application services. API and UI support channel-less HTTP actions. Discord-delivered actions remain gated. Failure history/retry state persists offline; Discord failure-alert callbacks are suppressed without current connection admission. |
| F11 | Fixed | Removed both nonexistent web-config publication callbacks. The health server continues using the live configuration owner. |
| F12 | Fixed | Token stores parse all-or-nothing and fail closed for corruption, unsafe files, unknown fields and runtime loss. A formerly protected store replaced by an empty list cannot silently enable anonymous access. Coherent auth snapshots cover HTTP/login/WebSocket policy; publication reloads and verifies its candidate. Only guarded intentional last-token removal can clear protection. Adversarial tests cover these transitions and publication races. |
| F13 | Fixed documentation | Lifecycle/action tool descriptions explicitly distinguish local ledger release from compositor acknowledgement or receiver proof. Tool reference and parity pins updated; release policy unchanged. |
| F14 | Deferred external verification | A synthetic historical schema-v0 fixture migrates and reopens under strict validators. The actual powered-off external store was not accessed. No claim of its compatibility is made. |
| F15 | Fixed | Post-commit recovery settlement runs outside the outer rollback exception handler. Tests preserve the original failure and verify durable closed state without an active transaction. |
| F16 | Fixed test coverage | X11 capture-failure regression proves old observations and delivery authority are cleared. Shared runtime semantics are unchanged. |
| F17 | Declined additional restart requirement | ComfyUI genuinely reads current config per generation. A regression proves an existing backend adopts setup configuration without reconstruction; documentation now states that behavior. |
| F18 | Fixed | Handle absent parsed keys before lookup; removed the unreachable branch. Environment publication tests remain green. |
| F19 | Fixed | Weakly held per-loop locks retain strong references for active owners/waiters and disappear afterward. Concurrent restart, cancellation and pruning tests preserve serialization. |
| F20 | Fixed | Removed the unreachable operational-status setup response. Composed middleware tests assert `/api/status` remains forbidden during setup and `/api/setup/status` is the supported probe. |
| F21 | Declined cosmetic native change | Documented the existing literal backslash-zero separator. Changing an opaque native digest/image solely for notation would invalidate recorded artifact qualification without improving behavior. No native source or qualification tuple was changed. |
| F22 | Fixed documentation | README describes upcoming automatic loopback bootstrap startup, SSH forwarding, authentication, explicit listener consent and manual restart. Published-release behavior is distinguished from this branch. |

## Model retirement

File loading migrates legacy main/fixed-agent/auxiliary selections to the current
balanced successor with warnings, preserving unrelated provider namespaces,
effort and inheritance. Image carrier migration uses its established successor.
Migration is in memory: it does not rewrite operator YAML or environment
placeholders. Explicit runtime legacy selections are rejected, not silently
rerouted. Active UI choices and registries no longer offer the retired model;
historical provenance and migration evidence remain readable. Tests cover
namespace isolation, old pins, overrides and explicit-request rejection.

## Verification and remaining boundaries

Each behavior fix has targeted regression coverage. Independent integration
review additionally found and repaired attachment lifecycle, shutdown fencing,
listener credential provenance, state disappearance and hot-reload auth races.
Generated UI assets and API/tool references were rebuilt after integration;
route and tool contract pins represent actual changes.

Full-suite and hosted-CI results belong to the final pushed commit and are
reported separately, rather than inferred from isolated agent test runs.
There is no new native qualification claim. Existing external-store validation,
privileged autoload deployment and source-directory trust provisioning remain
explicit operator/deployment boundaries, not completed live work.
