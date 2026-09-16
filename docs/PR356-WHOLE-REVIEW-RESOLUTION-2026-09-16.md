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
| F1 | Compatibility correction authorized on 2026-09-16 | Ordinary source-install `0775` ancestors are accepted at startup, initialization storage and environment publication. Group write is diagnostic, not a process-wide refusal. No trust-policy prerequisite remains. Private new initialization directories/files, pinned descriptor identities and replacement checks remain. See the eight-item compatibility resolution below. The previous policy-based remedy did not satisfy unchanged-install compatibility and is superseded. |
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
| F12 | Fixed; legacy reader compatibility corrected on 2026-09-16 | The reader preserves credential layouts accepted by v3.98.0, including symlinked and `0644` stores and valid entries alongside invalid ones. Dynamic-store failure does not veto otherwise-valid static authentication. Corruption or runtime credential loss cannot silently enable anonymous access. Coherent auth snapshots cover HTTP/login/WebSocket policy; publication reloads and verifies its candidate. Only guarded intentional last-token removal can clear protection. |
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
privileged autoload deployment remain
explicit operator/deployment boundaries, not completed live work.

## Unchanged-install compatibility correction (2026-09-16)

Aaron authorized all eight items below against `e22d27a`, with no deployment,
merge, service restart, or gate changes. The campaign branch was first updated
with `git pull --ff-only`. These corrections supersede the original F1 policy
prerequisite and F12 all-or-nothing credential reader, not the deliberate
authentication and connection gates described separately below.

| Item | Resolution | Required compatibility and evidence |
| --- | --- | --- |
| 1 | Accept ordinary existing ancestors | All three predicates accept root/service-owned group-writable ancestors. One diagnostic per directory explains that startup continues. Existing ancestor ownership or mode alone never causes a pre-configuration process exit. Odin-created terminal initialization storage stays private; atomic publication and replacement/identity checks remain. |
| 2 | Remove delegation | `source_trust.py`, its policy documentation and delegation tests are removed. No policy file is read or required. Any previously operator-created policy file is left untouched. |
| 3 | Preserve initialization-storage compatibility | Existing persistent-data layouts and legitimate ancestor symlinks are supported with canonical pinning. State/lock symlinks remain refused. Lock or migration-write failure does not prevent HTTP startup. A verified, never-recorded legacy installation retains ordinary authenticated API access while new durable setup/listener decisions are unavailable. Unreadable, corrupt, mismatched and previously observed but vanished records remain recovery conditions. |
| 4 | Preserve implicit environment location | An invocation without an environment-file override uses the working-directory `.env` captured at startup, as v3.98.0 did, even with an external YAML configuration. Explicit environment-file arguments/overrides remain authoritative. |
| 5 | Preserve accepted credential layouts | Legacy symlinked and `0644` stores load; invalid entries do not erase valid entries. Dynamic-store recovery does not veto valid static credentials. No corruption path falls back to anonymous access. |
| 6 | Retain intentional tokenless loopback restriction | **Behavior change:** installations without usable Web/API authentication bind loopback despite a broader configured host. Localhost-only operation without an API token is supported. Authenticated legacy installations retain their configured listener. Adding a credential to an already-restricted installation still needs explicit authenticated listener consent and an operator restart to widen. This is also stated in `install.md`. |
| 7 | Migrate persisted Spark selections | Load-time handling of retired Spark selections uses the established compatible successor and warning, as for retired 5.5 selections. Migration does not rewrite operator configuration; explicit runtime requests remain rejected. |
| 8 | Document deliberate gates, no code change | Stronger administrator restrictions, session revocation checks and Discord-connected admission requirements remain intentional. See the behavior list below. |

### Deliberate behavior gates retained

1. API routes remain administrator-only by default except the explicit
   `SELF_SERVICE_ROUTES`; the Discord connection status, credential, connect
   and detach endpoints are administrator-only. This preserves and strengthens
   the established default-admin policy rather than inventing a new one.
2. Listener widening requires a one-shot, freshly entered current raw admin
   Bearer credential. Browser sessions and query credentials are refused, and
   the credential is resolved again under the configuration transaction so a
   concurrent rotation, deletion, demotion or identity collision denies it.
3. Exact browser-session logout/expiry and credential rotation, deletion,
   demotion, static replacement or newly enabled authentication revoke affected
   WebSocket authority. Dynamic-store recovery revokes dynamic authority, not
   independently verified static credentials. Stream membership is removed before asynchronous
   close, and every frame and delivery rechecks policy, preventing effects after
   revocation.
4. Computer operator routes require a live exact admin identity and revalidate
   after awaited backend and private-byte-delivery boundaries. Stale sessions,
   identity collisions, rotation, revocation, demotion, recovery and host-scope
   loss fail closed.
5. Discord-delivered schedules require a currently connected gateway at create,
   unpause, run-now, trigger and due-dispatch boundaries. The connection epoch is
   checked again before effects; disconnected or generation-changed work is
   deferred or restored without false history. Pure HTTP webhook actions remain
   operable while Discord is offline.

### Proof scope

Regression tests must be demonstrated failing on `e22d27a` and passing after
the corrections for items 1, 3, 4, 5 and 7. Fixtures represent source umask
`0002`, package directory permissions, symlinked data, external YAML with a
working-directory environment file, legacy credential stores and persisted
Spark selections. Existing real-listener tests pin the intended tokenless
loopback behavior.

The separate live-shape check uses a fresh source clone under umask `0002`,
scratch-only configuration/storage, no credentials, and a free loopback port.
It must serve HTTP before its owned process is stopped. It is not a package
installation or a deployment, and does not touch the live installation or
operator-created policy files. Exact results belong to the tested commit and
are recorded below after execution.

### Executed compatibility evidence

- Against isolated `e22d27a`, the new environment tests failed on the `0775`
  parent and implicit working-directory source; they pass after the fix.
- The ten storage cases produced **5 failed, 5 passed** on `e22d27a` and
  **10 passed** after the fix. They cover `0775` source and `0755` package
  shapes, private new storage, symlinked data/rebinding, state/lock symlinks,
  missing unwritable parents, lock failures, authenticated API continuity,
  failed-write races and corrupt/unsafe/vanished records.
- Four isolated token/model reproductions failed on `e22d27a`: symlinked
  `0644` credentials, invalid entries alongside valid ones, static login
  during dynamic corruption, and persisted Spark. The focused post-fix
  token/model/auth suite passed **247 tests**. Integration review also caught
  and fixed static-session recovery matching by user ID alone; the added
  regression requires the exact session-bound static credential to remain
  current after rotation/revocation.
- Actual source-clone proof ran at `cfa727bc`, under unprivileged umask `0002`
  with naturally `0775` checkout/data directories, a scratch home, empty
  credentials and disabled external integrations. With `web.host=0.0.0.0`,
  the real process listened only on `127.0.0.1:50691`. `/health/live`,
  `/health?detail=1`, and `/api/setup/status` each returned **200**. Four
  group-write diagnostics appeared, exactly once for each group-writable
  directory in that proof path. The process was stopped by its recorded
  PID/start-time identity, exited **0**, and left no listener behind.

Diagnostic wording (the suffix is the actual inspected directory):

```text
Existing configuration ancestor is group-writable; continuing for upgrade compatibility: <directory>
```

The exact diagnostic lines and final hosted-CI verdict are included in the
delivery report. The source-clone proof is intentionally not evidence about
a package installation or any live service. No package was installed.
