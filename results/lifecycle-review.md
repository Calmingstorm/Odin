# Independent process/provider/session lifecycle review

Reviewed integrated `0e4f5666c24aeafa99833de3d0cb5a3ce13e3bad` against
`55c15761`, in the exclusive `work/v410-lifecycle-review` worktree. Read campaign
rules, decisions and the complete stored issue bodies for #432, #544-553,
#419, #420, #540, #564, #476 and #505. Also inspected the account-pool,
quota-generation and auxiliary-client lifecycle diffs for cross-cutting races.

## Verified defects fixed in this review

1. **Explicit local kill did not use the new whole-execution settlement.**
   `kill()` still returned `killed` after a leader termination call even without
   owned-session cleanup proof; a proven kill also relied on a later watcher
   to release the host lease. Fake-only regression first failed with a falsely
   successful kill. Now explicit kill uses the existing proof-based
   `_terminate_bound_host_job`, preserves authority when proof fails, reports
   uncertainty, and retires it on positive cleanup proof. Existing real local
   lease regressions for explicit kill and the tool handler now both pass.
2. **Group-only remote exit lost its evidence retention deadline.** The #548
   fix legitimately changes supervisor exit status to unknown, but the unknown
   poll path never copied `finished_at` or scheduled evidence expiry. It thus
   advertised no expiry and held evidence indefinitely. Fake-only regression
   first failed with `finished_at is None`. Now the supervisor timestamp starts
   evidence retention without releasing execution authority. Regression reads
   every page of 8,500 bytes unchanged, verifies expiry, and asserts unresolved
   execution authority remains owned after evidence expires.
3. **An old OpenRouter profile test asserted an unsafe combined route pair.**
   Independent context/output minima are correct: every eligible fallback must
   satisfy both advertised axes. Updated the old regression to prove both
   bounds across all three routes and preserve the pinned-route assertions.

## Observed findings by requested area

- #432: embedded FIFO loop accumulates actual accepted bytes, bounds blocking
  to two seconds, closes the descriptor, and refuses full-delivery claims on
  short acceptance. Caller validates UTF-8 byte count, not character count.
- #544: shared pending-start count fences local/remote admissions before awaits;
  cancellation and failure regressions verify pending counters return to zero.
- #545: spawned records receive lifecycle ownership before initial persistence;
  persistence failure attempts teardown without losing the tracked record.
- #546: timer captures exact `ProcessInfo`, checks identity, and proven settlement
  cancels the timer. PID replacement regression does not target the newer job.
- #547/#549: terminal leader state is not cleanup evidence; generation settlement,
  revoke and shutdown require positive owned cleanup. This review fixes the
  remaining explicit local kill bypass. Unknown cleanup retains ownership.
- #548: current remote worker offers **process-group-only evidence**, not proof
  against escaped descendants. Unknown is the intended result, including after
  apparently ordinary remote exit. It is not a broken test to insist on that
  uncertainty, and no new containment guarantee is claimed here. Supervisor's
  deadline is only a backstop for the containment it actually has.
- #550: SSH master ownership is retained across cancellable closure awaits;
  cancellation regression confirms a surviving master remains registered.
- #551/#552: unchanged identity publication preserves mismatch quarantine;
  test-result publication shares the management transaction lock and rechecks
  active identity after the SSH await. Matching successful retest is explicit.
- #553: CA enrollment scans host certificates, extracts their signer, and uses
  endpoint principal identity instead of private UUID; operator fingerprint
  approval plus strict SSH certificate test remain necessary. Discovery alone
  is not trust. Tests are inert certificate/command fixtures, not a live CA lab.
- #419/#420: native incomplete response status reaches foreground, agents,
  direct-text and loop consumers; unsettled tool calls are discarded. Typed
  partial-text exceptions do not trigger auxiliary fallback; completed long
  native output remains unchanged. Existing 100,000-character regression
  coverage checks no arbitrary successful-output cutoff.
- #540: only one half-open owner is admitted; cancellation/local rejection
  abandons its reservation and internal backoff keeps ownership reserved.
- #564: logical generation lease spans attempts/backoff; inherited request
  task context permits the already-owned retired generation. Pre-dispatch
  retirement is a local typed request error, not an upstream outage latch.
- Account safety: generation/CAS guards fence deleted/replaced records,
  unchanged reload preserves per-account refresh locks, UI indices map to
  canonical records, quota results fence same-object reloads, and secure
  credential writes handle short writes. Account tests passed without APIs.
- #476: empty/non-string summary is rejected before publication and invokes
  existing deterministic extractive fallback, rather than losing raw history
  into an invisible empty summary.
- #505: unique API channels have a memory-only context, save/archive/reflection
  exclusion and final memory cleanup. Ordinary persistent reset semantics are
  not removed; ephemeral reset creates no durable tombstone.

## Targeted validation and limits

All pytest commands ran **from this worktree** using
`/home/odin/odin-dev/.venv/bin/python -m pytest`. No full suite, gate weakening,
live APIs, deployment, restart, merge, generated reference or UI changes.

- Final explicit 15-file run: **219 passed**, one existing `audioop` deprecation
  warning. Files: lifecycle review, campaign reasoning, provider campaign,
  campaign process lifecycle/hosts/SSH, campaign resource sessions, account
  mutation, credential writes, quota check, sessions review, remote processes,
  retention error paths, zero-offset and kill-status tests.
- Additional selected old lease tests: **2 passed**, 40 deselected.
- Ruff on changed production module and new review/reasoning tests: passed.
- Earlier broader 7-file compatibility run: **160 passed, 6 failed, 4 teardown
  errors**. All failures were in `test_process_host_lease_authority.py`. Two
  legitimate explicit-kill lease failures are fixed and rerun green above.
  Remaining stale expectations need coordinator fixture reconciliation:
  unknown force-revoke release (lines 227/342), exact persistence call count
  after watcher failure (503), aged terminal fixture missing cleanup evidence
  (610), and teardown synthesizing `status=killed` without cleanup proof (63).
  The teardown issues deliberately model unproven remote cleanup; do not make
  production shutdown accept those records merely to pass these old tests.
  That earlier run also exercised real disposable sleeper fixtures and emitted
  an event-loop teardown warning; new regressions use only inert fakes. No
  further broad rerun of those fixtures was attempted.

This is a bounded source/targeted-regression review, not a claim of full-suite
pass or a live SSH/provider/certificate/descendant-containment qualification.

## Commits to integrate, in order

- `af2095ad`: independent conservative OpenRouter route-limit regression.
- `a9782660`: unknown remote evidence deadline, complete paginated output test.
- `78e3d91b`: explicit local kill owned-cleanup settlement and fake regression.
- `9c794bd9`: update touched kill-error test to truthful unknown settlement.
- Report commit follows these four commits.

Coordinator should add release-note entries for the two production changes;
this exclusive review was expressly instructed not to edit CHANGELOG.
