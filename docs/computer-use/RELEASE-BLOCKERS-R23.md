# R23 release-blocker corrections

## Judgment

**The two specified blockers are fixed. The shared-X11 qualification gap is
resolved by correcting claims, not by certifying abrupt-guardian-death release.**
The frozen implementation/test head `1fa090ff0d5fe046b8dae64f8861c7aecee352b0`
passes all thirteen local gates. Subsequent changes to this report are
documentation only. Ready for the operator's gated deployment and validation;
this is not a deployment, real-desktop qualification, or unconditional claim
that no other defect exists.

## B1: stop cannot depend on writable persistence

The original controller attempted the durable quarantine/revocation write before
clearing observation authority and detaching the backend. A raised write could
therefore prevent the safety work.

- Stop synchronously fences the retained live session and clears delivered and
  captured observation authority before persistence or cleanup awaits.
- Active checks reject the process-local fence before consulting the store.
  Start, resume, and runtime identity callbacks cannot reactivate a fenced grant,
  even if the durable row still says starting, active, or paused.
- Quarantine, cleanup-record, cleanup-readback, and terminal-state failures still
  permit the native detach/stop attempt. Failed pause persistence falls back to
  the same fenced stop path.
- Persistence failure reports `cleanup_persistence_failed`; it does not invent
  a durable closed state. The fenced adapter remains owned for explicit cleanup
  retry. It is removed only after successful cleanup evidence and terminal write.
- A distinct Close waiting behind a failed stop performs its own cleanup retry.
  A terminal write whose readback fails cannot bypass that retry merely because
  the stored state already says closed.

`test_computer_stop_store_failure_r23.py` and `test_computer_stop_retry_r23.py`
contain **23 safe behavioral regressions**. Storage primitives raise a synthetic
SQLite error; native operations are inert mocks. They assert live fencing and
native detach despite persistent write failure, continued fencing after storage
recovers, no revival during start/resume, no post-stop capture delivery, explicit
retry behavior, and one native dispatch after receipt replay. These are real
controller/storage tests with substituted failure primitives, not a destructive
desktop failure experiment.

Independent review found and prompted correction of the concurrent-retry and
terminal-readback fast-path cases before approval. Existing cleanup certificate,
action reservation, receipt lookup, and completion classification requirements
were not weakened.

## B2: short scope evidence lease, independently enforced

Wayland action scope acquisition now has a **250 ms absolute monotonic deadline**.
The lease begins at acquisition start, not when an awaited provider finally
returns. Refresh must complete within the existing authority lease and return
fresh authenticated evidence. Missing, Boolean, stale, future, late, or hung
evidence cannot renew authority. Cancellation-resistant acquisition remains
owned but cannot delay native cleanup or later restore authority.

The deadline is also transmitted to the native guardian. Its independent
`CLOCK_MONOTONIC` check fences dispatch when Python's event loop stalls. Only
increasing, bounded scope deadlines renew the scope lease; ordinary heartbeats
do not. The existing **two-second nonrenewable action maximum is unchanged**.

A final check after command/keymap preflight and before dispatch closes the
review-discovered case where preflight consumed the remaining scope lease.
There is no hard-real-time scheduling guarantee: native checks are independent
of Python but still depend on native process scheduling and native execution.

`test_computer_r23_wayland_scope_deadline.py` and
`test_computer_r23_wayland_native_scope.py` contain **36 safe regressions**:

- Inert backend typing/stroke dispatch is interrupted on stale, hung, expired,
  changed-focus, or cancellation-resistant scope collection, without replay.
- Production C compiled against an inert libei transport fences a held-button
  path and submits release while Python is deliberately blocked.
- Fresh renewals allow completion; expired/future/replayed renewals and
  heartbeats cannot extend authority improperly.
- A linker-wrapped native keymap lookup consumes 300 ms against a 240 ms scope
  lease. Both typing and named-key regressions require **zero input, zero
  completed steps, no action_done, and scope-evidence-expired**. Before the
  post-preflight fix both recorded input; afterward neither does.
- A guardian without `scope_lease_v1` receives no action.

**Deployment coupling:** rebuild and provision the native guardian from this
revision along with Python. The existing package helper build includes this
source. An older installed binary fails closed, rather than silently running
without the scope lease. No binary was installed by this round.

## Shared-X11 qualification: truthful limits

See [R23 shared-X11 release qualification](R23-SHARED-X11-QUALIFICATION.md).
Tool descriptions, runtime limits, public capability limitations, and operator
documentation distinguish surviving-guardian acknowledged cleanup from abrupt
loss of the sole shared-input ledger owner.

**No universal server-side release guarantee has been established after abrupt
shared-X11 guardian death. Its native consequence remains untested.** Worker
settlement proves no remaining owned dispatch, not release of server-held input.
Missing/failed guardian evidence remains unverified and quarantined; clean
acknowledged detach is still accepted. Eleven safe inert-transport tests cover
these receipt distinctions. No crash experiment ran on an actual desktop.

## Final local quality gate

Recorded against frozen head `1fa090ff0d5fe046b8dae64f8861c7aecee352b0`:

| Gate | Result |
| --- | --- |
| Full pytest with coverage | **15,580 passed, five skipped, zero failures/errors**; pytest 774.72 seconds |
| Coverage ratchet | **Zero findings**; 338 gated files, 221 baseline files; 92.7% total reported, baseline unchanged |
| Whole-repo Ruff / changed-Python formatting | Passed |
| Two-tree lint gate | Zero baseline/head findings |
| Two-tree type gate | Two baseline/head findings, zero new findings |
| Configuration apply registry | Passed |
| Generated reference drift | 43 passed; tool-reference regeneration is byte-identical because dynamic computer definitions are excluded from the static catalog |
| UI check/build / committed distribution reproduction | Passed; UI source and distribution unchanged |
| Mandatory real-browser selection | Six passed, zero skipped; both required-browser flags enabled |
| Native guardian compile against real libraries | Passed with Wall, Wextra, Werror; compile-only binary not executed |
| Diff check | Passed |
| Aggregate | Thirteen completed gates, all exit zero, unchanged frozen HEAD and clean working tree |

The first integrated run at `a9a252e6` was **not green**: four readiness tests used
a stub missing the new live revocation field, and an existing process-manager
test lost its short-lived child before pidfd_open. The readiness fixture was
corrected. The process-manager test passed on a focused rerun and on the final
full run; its production/test source was not changed. First-run evidence is
preserved rather than silently substituted with a successful result.

The final suite still reports **998 warnings**, including unawaited mocks and
pending `shutdown_asyncgens` teardown diagnostics. These are retained, not
represented as a globally clean async-task census or proof of a runtime leak.

No hosted pipeline, master merge, release, deployment, service restart, real
desktop interaction, destructive fault-injection command, UI feature, coverage
baseline change, or completion/response-guard change was performed.
