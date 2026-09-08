# R5: ready for scoped manual local-deploy testing, not general desktop completion

PR350 remains draft. Source frozen and fully tested at
`9c17d68489f51fc0d8b84333b3eefab1641de1f5`; only review documentation follows.
The three requested priorities are addressed below. No deployment, Odin restart,
master merge, tag, CI or release pipeline has been performed. The operator owns
the manual deployment and test decision. Unsafe unsupported backends stay refused.

## 1. Wayland release failure explained and contained

The tested stock Mutter46.2 compositor indexes button state with the completed
key-loop variable, not the button. Same-options baseline rebuild reproduces the
failure; the one-line upstream fix restores toolkit-observed release on real EOF.
The corrected nested fixture completes6/6 lifecycle cases, including controller
loss, independent lease, guardian loss and portal Close. The final outer wrapper
still returned70 because an unrelated global sudo zombie appeared; exact owned
container/cgroup/process cleanup passed. Do not call that outer run successful.

This does **not** qualify production Wayland. It is explicitly refused, never
silently routed through X11 or enabled by a version-name guess. No host compositor
was replaced. Details, source hashes, upstream fix, limitations and reversal:
FEASIBILITY-WAYLAND-R5.md and WAYLAND-R5-CAPABILITY-EVIDENCE.json.

## 2. Completed GUI tasks, not just working capture

- Real model, unchanged production computer definitions/native image dispatch:
  isolated Xed note typed, GUI-saved, saved tab closed, blank document created,
  actual disk file reopened, exported bytes matched exactly.11 model requests,
  84.687seconds. Latest PNG digest verified at every serialized model request.
  No host file-writing shortcut. See MODEL-GUI-R5.md.
- Drawing's genuine startup dialog is safely recognized and handled. Three-stroke
  PNG GUI save/close/reopen reproduced twice; reopened canvas exactly matches saved
  decoded pixels. Pause/resume and chooser cancellation measured. This is a fixed
  driver, not a general model benchmark. See R5-DRAWING-FINAL.md.
- Distinct isolated corpus:27/30 tasks, Xed14/15 and Drawing13/15. Unicode/tab
  fidelity, text annotation and selection movement failed. It is not a90% general
  autonomous desktop success rate. See R5-ACCEPTANCE-30*.md.
- **Actual main-session Xed task passed**: new private scratch note typed and saved,
  bytes independently matched; full before/after RandR and window/input metadata
  compares exactly. Four monitors including3440x1440 primary preserved. Screenshots
  purged and scratch processes/HOME removed. No wake needed. This is a development
  driver through the actual controller/backend, not deployed-service acceptance.
  All failed attempts, including the earlier topology-restoration evidence gap,
  remain recorded in R5-MAIN-SESSION.md.

X11 no longer depends on destructive device removal or enabled retained devices.
The input guardian uses existing XTEST with a ledger, independent finite lease,
owned-only release, busy-input checks and application-survival verification.
Shared pointer/focus and same-key/racing-client limitations remain explicit.
Safe modal transitions required actual fixes: own releases cannot depend on stale
focus, postconditions recognize the same trusted transient family, Save As ellipsis
is narrowly recognized, and capture discards raced frames in bounded retries.
Actual private save/escape/reopen and clean held state verified. See
FEASIBILITY-X11-R5*.md and R5-ATTACHED-MODAL.md.

## 3. Production wiring is active in source, default disabled

Lazy lifecycle owner is composed at bot startup; configured tools dispatch inside
ordinary foreground turns. Disabled boot creates no desktop/store/watcher/process.
No conversation restriction, no permanent mode, no changes to ordinary-tool rights.
Authenticated System > Computer supports live enable/disable and independent stop,
pause, status, explicit observation/export and honest recovery. Structural target
settings are restart-pinned; enabling never guesses a display or launches an app.
UI distribution is rebuilt and committed; final rebuild produces no diff.
Live browser revocation, generation boundaries, no-replay, native image transport,
evidence expiry and safe recovered quarantine are tested. See PRODUCTION-WIRING-R5.md.

## Scope the operator must see before local testing

Read LOCAL-DEPLOY-TESTING.md. This increment supports isolated Drawing/Xed and
focused native Xed input on explicitly granted existing X11 monitors. Existing
Drawing is capture-only; arbitrary apps, terminals, security dialogs and Odin's
control plane are not input targets. Wayland is refused. ASCII typing, short chunks,
separate Return/Tab, shared pointer/focus and strict animated-raster refusals apply.
Pause/resume is within a live foreground task; turn completion closes the task,
including paused tasks, without restricting later messages. Attached applications
remain open. Isolated artifacts must be exported before task completion.

Therefore **ready for that bounded manual deploy test** is supported. “Fully
polished computer help for any app on any Linux desktop” is not supported and
must not be claimed. Those wider requirements remain unfinished. Do not lower
release gates or erase corpus failures to change that conclusion.

## Immutable-source validation and review

- Full development-only suite: **12878 passed,5 skipped,928 warnings**,597.97seconds,
  exit0 at9c17d68. `/tmp/odin-r5-full-9c17d68.log`. Source stayed clean and frozen.
  Existing unawaited coroutine/pending async-generator shutdown diagnostics remain;
  no warning-free teardown or causal attribution claim.
- Lint gate vs d5fc7eb:0new,0total. Type gate:0new,2baseline. Apply registry:0findings.
- Computer operator browser, Live Logs browser, shared output renderer,46 templates
  and263 callable bindings pass. Browser fixtures are isolated and API-mocked where
  documented, not evidence of a deployed service. Vite build passes with existing
  large-chunk advisory; generated dist matches committed artifacts.
- Independent broad review72999e54 found no concrete scoped blocker. Final delta
  review682c2b7a tied to9c17d68 found no stale/foreign-input or release blocker.
  Their findings support scoped testing, not an absolute safety guarantee.
- Source-only randomized disabled overhead: ordinary definitions byte-identical,
  no disabled tasks, combined median+3.87%, but noisy batch p95+63.8% and small
  components above5%. Not a blanket zero-overhead or end-to-end latency pass.
  See R5-OVERHEAD.md for raw samples and methodology.

## Environment and reversal

No experiment units or containers remain running. Unrelated existing containers
untouched. Live Odin stayed active without restart, health200. Historic service-owned
zombies left alone under the operator's ruling; no reaping injection/restart. No host
compositor or package was installed in this R5 turn; contained Wayland builds and
development dependency evidence remain in their reports, with exact reversal.
Private evidence paths are not published screenshots or live configuration.

The deliverable is this branch/PR, source and committed UI distribution, measured
GUI artifacts/evidence, and an explicit local-deploy runbook. Nothing has shipped.
