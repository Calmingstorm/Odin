# Campaign close review, 2026-09-15

Reviewed campaign base `b72827f6` against master `ef119814`. This close batch
changes computer runtime code, native scope code, tests, and documentation only.
It does not deploy, operate a desktop, enable runtime qualification, or implement
stroke batching, accessibility integration, or reboot reattachment.

## Fixed defects and cleanup

- Malformed native exception metadata could itself raise before backend cleanup.
  Normalize the diagnostic container without hiding the original failure.
- Native release validation must precede normalization of the public
  `receiver_release_verified` field. A malformed receiver claim must not become
  eligible for application-group refresh after that normalization.
- Closed fallback recovery could retain a pending lineage with no top-level
  resolution accepted by startup validation, making the database fail to reopen.
  Persist the terminal assessment in the same transaction while retaining the
  historical assessment and ownership evidence. Test actual close/reopen,
  rollback, unknown release, and admission behavior.
- Pending-release inspection guidance incorrectly advertised recoverability
  despite its terminal safety decision. Keep that decision independent of the
  suggested inspection action.
- Proven-clean modal and resume boundaries lost their execution evidence at the
  integration boundary. Carry explicit controller-owned evidence, not a blanket
  reason-code exemption. Unknown or contradictory release evidence still wins.
- Resume error handling dereferenced unavailable capabilities. Preserve the
  original error and fence incomplete cleanup rather than masking it.
- Remove temporary candidate geometry diagnostics and an unreachable duplicate
  status branch. Preserve real refusal reasons, admission predicates, and strict
  parsing compatibility with older companions' optional diagnostic booleans.
- Correct stale receipt/label expectations and incomplete subprocess/controller
  fakes. Exercise both confirmed and unknown cleanup rather than deleting the
  uncertain-release cases. Give real Unix-socket fixtures explicitly private
  permissions and short temporary roots, including hostile-umask coverage.
- Scrub deployment-specific names, locations, and identifiers from public
  reports. Preserve generic examples and byte-exact synthetic protocol fixtures.
  Refresh generated API source links and mark historical reports as historical.

## Validation policy and evidence

No workflow, CI script, coverage baseline, lint/type configuration, or threshold
was changed by this close batch. Existing campaign changes to those files predate
this review and are not represented as new close-batch work.

The initial full instrumented run failed: 16 failed, 19,960 passed, 29 skipped.
This included known drift, documentation problems, and incomplete test doubles.
Initial coverage also exposed the new backend below its unchanged 85% minimum.
Added 100 backend cases covering capture, focus, and recovery boundaries; their
focused combined backend run measured 87.02%, with 368 tests passing. This is
focused evidence, not a substitute for the final full coverage gate.

Native cleanup validation used the pinned Hyprland 0.55.2 headers and a fresh
guardian. Full plugin compilation passed; 578 native/provider cases passed,
including 19 explicitly enabled native wire cases. An ordinary full suite may
skip optional native-wire tests without their compiled helper, so those results
are recorded separately. No live compositor qualification was performed.

Final full-suite and hosted gate results belong to the exact final commit's CI
records and the accompanying close report. Passing tests do not resolve the
out-of-scope findings below.

## Core findings requiring a separate authorization

These were independently reproduced with isolated collaborators and temporary
files at `b72827f6`. Core source remains unchanged by this close batch. They are
not requests to weaken CI, and a green gate does not make them harmless.

### P1: lexical launch configuration alias loses workspace protection

`src/config/startup_context.py:117-121` canonicalizes the launch path, and
`src/__main__.py:552` passes that canonical path to `load_config`. The schema then
records the canonical target as both active and lexical launch path. Workspace
protection needs the original alias because re-exec traverses the original
arguments. A real temporary symlink/load/validation probe showed the alias was
not preserved and its otherwise-valid workspace was accepted. Deleting the
alias could break restart; this does not expose the canonical configuration.

### P1: stale ready callback reverses a newer disconnect

`src/discord/client.py:423-427,451-456` waits for command reconciliation before
publishing ready. `src/discord/connection_supervisor.py:100-116` checks gateway
generation but not transition ordering within that generation. Pausing the real
ready callback at reconciliation, delivering disconnect, then completing the
older callback changed admission from unavailable back to available without a
new ready event. Add within-generation transition ownership before release.

### P2: onboarding credential binding is not durable for every accepted YAML

`src/web/onboarding.py:112-149` updates the runtime candidate and environment
credential without persisting the YAML token reference. Real setup/reload probes
confirmed blank and literal YAML credentials do not reload the submitted token;
`${DISCORD_TOKEN}` configurations do. Preserve a durable reference binding.

### P2: setup configuration and runtime consumers disagree

`src/web/onboarding.py:183-189` publishes configuration but does not rebuild the
host registry, browser manager, or time parser initialized by wiring. Setup's
response has no restart requirement. Isolated probes retained the old registry
and parser, and the disabled browser remained absent. Apply through the owning
components or explicitly report the required restart.

### P2: gateway retirement waits through reconnect backoff

`src/discord/discordpy_adapter.py:58-67` closes the transport and waits for the
gateway task without cancelling its reconnect sleep. A real library connect loop
with mocked network failure and controlled sleep stayed in retirement after
transport closure, completing only when that sleep was released. This proves
avoidable backoff latency, not a permanent deadlock.

### P2: overlapping scheduled runs leak reservation metadata

`src/scheduler/scheduler.py:1129-1134` returns on overlap before the reservation
cleanup at `1173-1176`. A blocked real `run_now` plus three overlaps left three
reservations after all executions finished, with no in-flight task. Clean only
the rejected execution's reservation; preserve the running task's ownership.

The two P1 findings blocked an unconditional merge-readiness recommendation at
the review snapshot. All six received separate authorization on 2026-09-15 and
were addressed in the follow-up below; the original findings remain as history.

## Authorized six-defect follow-up

Based on `3ed6b2e9`. Changes stay in campaign-added startup, gateway ownership,
onboarding and scheduler-reservation paths. Existing master overlap behavior,
configuration loading and workspace protection are not redesigned.

| Finding | Correction | Regression evidence |
|---|---|---|
| Lexical launch alias | Keep canonical setup identity and a separate lexical launch path; pass the latter through the existing configuration loader. Original restart arguments remain intact. | Real `main()` / `load_config()` probes for file and directory symlinks failed before the fix, then preserved both protected roots and rejected alias workspaces. |
| Stale ready callback | Capture within-generation transition ownership before dispatch and recheck after awaited reconciliation; repeated disconnects invalidate older readiness. | Controlled ready/resumed callbacks cannot reverse a later disconnect; a delayed disconnect cannot reverse a newer resume. Queued-event and direct-callback variants fail before the fix. |
| Credential binding | Persist `${DISCORD_TOKEN}` in the submitted YAML leaf and the secret only in the declared environment source. | Fresh environment reloads cover blank, literal, standard-reference and custom-reference YAML; unsubmitted placeholders remain unchanged. |
| Unapplied setup settings | Explicitly return affected restart-required fields through setup HTTP and display the notice alongside gateway outcomes. No automatic restart. | Real stores and HTTP responses retain old host/browser/timezone consumers while reporting the restart. Tests also cover partial-publication retry and UI notices. |
| Reconnect retirement | Cancel the owned gateway task after transport closure, before settling and resetting it. | Real discord.py connect loop with a mocked network failure and a controlled backoff that never elapses now retires through cancellation. |
| Overlap metadata | Remove only the rejected execution's reservation before returning from the existing overlap guard. | Blocked real `run_now` retains its reservation during overlap rejection, then leaves neither reservation nor in-flight ownership after completion. |

Regressions are in `test_startup_onboarding_context.py`,
`test_gateway_transition_regressions.py`,
`test_onboarding_durable_binding_restart.py`, and
`test_scheduler_gate_races_campaign.py`. Each defect has recorded pre-fix failure
and post-fix success. These are isolated software tests, not live Discord,
process re-exec, or desktop qualification. Final full-suite and hosted gate
verdicts belong to the exact follow-up commit's CI records.

No deployments, external-machine access, workflow/CI-script changes, coverage
baseline updates, or lint/type configuration changes accompany this follow-up.
