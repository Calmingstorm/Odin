# R7 application offering and measured Writer save

**Calc/Draw are not offered. Writer is offered only for a keyboard-driven short
note, paragraph break, bold formatting and GUI ODT save. Writer document
close/reopen remains unqualified and is explicitly refused, not retried.**

This report records one new harmless private GUI fixture plus focused policy,
scope, integration and operator-UI checks. It is not a general application
qualification, model success-rate claim, live deployment or main-session test.

## Offering after this change

Computer use remains disabled by default. "Input eligible" is a fixed backend
declaration, not proof of installation, consent, focus, readiness or task success.

| Profile | Offered scope | Qualification and exclusions |
| --- | --- | --- |
| `writer` | Attached X11 only, installed native LibreOffice Writer document and recognized same-process save dialogs rooted in it. Operator opens/focuses a new document. | Fresh R7 deterministic GUI note/paragraph/bold/ODT save completed in an isolated fixture. No document close/reopen, open/new document, pointer or menu input. No arbitrary Writer formatting or model-driven Writer-task claim. |
| `inkscape` | Attached native X11 drawing/save, unchanged. | Retains R6 shape/save and model three-part-house evidence. This R7 run does not requalify it; disk close/reopen remains unqualified. |
| `xed` | Existing isolated and attached profiles, unchanged. | Existing evidence remains bounded by its original environment and tasks. R7 does not re-run Xed GUI tasks. |
| `drawing` | Isolated input; attached capture-only, unchanged. | Existing isolated evidence remains. Attached script provenance still cannot authorize input. |
| `libreoffice`, `calc`, `draw` | **Not offered; refused.** | No completed Calc/Draw task qualification exists. Old generic `libreoffice` is not an alias for Writer and is not silently migrated. Start a fresh `writer` task instead. |

The model tool schema now advertises `writer`, never generic `libreoffice`.
Operator status and session status expose the same pure Writer profile declaration:
`qualification=partial_isolated_fixture`, exact measured task, explicit
`not_offered_tasks`, `input_operations` and `input_keys`. The operator UI and tool
instructions distinguish session Close/Stop (detach only) from document closing.

Writer task policy permits only `type` and `key`. The allowed keys are `Return`,
`Escape`, `BackSpace`, `Delete`, `space`, `ctrl+a`, `ctrl+b`, `ctrl+s` and
`ctrl+shift+s`. All clicks/drags are refused, not merely known close shortcuts.
Menu-navigation keys and `ctrl+o`/`ctrl+n` are also refused. The ordinary controller
and direct attached backend both apply this policy before input. Existing receipt
handling remains ahead of a new action's policy evaluation, preserving no replay.
Other application action vocabularies are unchanged.

This is a conservative task offering, not a claim of semantic widget isolation.
Keyboard focus is still shared. The operator must focus the intended editor or
recognized save field, and Odin must not use permitted keys to navigate an
unexpected menu. Unknown or sensitive windows/dialogs still deny input. The task
allowlist does not replace native process/focus/modal/source guards or authorize
arbitrary application automation.

## Native scope narrowing

`AppScope` still proves the fixed trusted `soffice.bin` executable through XRes
PID and stable process identity, never by title or argv. Writer document class is
only `libreoffice-writer`. Calc, Draw, Start Center and other component classes
are rejected, including a class string also containing Writer. Generic Office
save dialogs must have a same-process transient chain ending in a Writer document.
Only Save/Save As titles are accepted for Writer; Open/Close dialogs are not.
Unknown intermediate transients cannot launder a safe child dialog.

No family-wide permission or post-scope weakening was added. Sensitive dialogs,
macros, settings, security surfaces, missing XRes and wrong executable/parent
identities remain refused.

## Why close/reopen was not qualified

The preserved R6 run `/tmp/attached-apps-r6-6d2xxu0o/runner.log` was inspected.
It identified File > Close at `(45,167)` and returned a native receipt with
`status=unknown`, `injected=true`, `released=true`,
`reason=input_scope_or_native_failed`, release 30.005ms. It aborted without replay;
its immediate window census still listed the original `result.odt` window.

That broad native failure code does **not** prove the document actually closed,
nor locate a single exact failure point. Source review shows that new native input
requires the original scope, while own tracked releases do not depend on old
focus. Postcondition matching also requires the same root document window and
process. A close that removes that window or enters the generic Start Center can
correctly invalidate scope and cannot establish successful same-document work.
The failure is not evidence that those guards should be relaxed.

R7 chooses the bounded safe outcome: retain independently evidenced editing/save,
remove the unsupported lifecycle offering. The harness no longer attempts Writer
Close or disk reopen. A unit regression asserts that Start Center, a different
document XID or a different process is not same-application success. No complete
GUI disk-reopen claim is made.

## Fresh real Writer save evidence

The single R7 execution used the narrowed harness
`scripts/computer-feasibility/attached-apps-r6.py --execute-isolated --task writer`.
It ran from `/home/odin/reviews/computer-use-r7-apps`, production code at
`bd814b072a682175e51687d164a02531a2fecbb8` plus the recorded R7 harness changes.
This is the task-policy hook revision, **not the separate pending R7 runtime
cleanup revision**. Native changes made later require their own regression
evidence; this report cannot establish that an untested revision passed.

The reviewed R5 launcher provides a disposable transient cgroup and private
PID/mount/network namespaces, Xvfb `:177`, uid65534 app HOME and private bus.
Writer uses GTK3, a fresh disposable profile disabling first-run tips and a normal
1200ms blinking caret. No `:0`, live data/config, desktop session, restart, deploy,
pipeline, merge or tag was used. Application setup does not generate documents.

The task used ordinary production controller observe, native image validation,
delivery validation and single-use act, with the direct native backend task gate.
Before editing, fresh grounded click, drag, `ctrl+o` and `ctrl+n` requests were
refused as `application_task_not_offered`; each recorded native input calls **0**.
Then nine native dispatches all reported executed/released. There were eight
`verified` raster receipts and one honest `not_satisfied` for Save-dialog `ctrl+a`
because before/after raster digests matched. No uncertain input was replayed.
Final task success comes from the artifact check, not from counting changed pixels.

- Evidence root: `/tmp/attached-apps-r6-3xjgddcr`
- Saved GUI output: `workspace/home/result.odt`, **9734 bytes**
- SHA256: `4bd2b6a39e9eb2e070e4705a7979399982f9fac4c17f54c50d2cde75db2a93d3`
- Exactly two paragraphs: `R6 private note.` and `Save verified.`
- Second paragraph inherits a bold ODF style, independently verified.
- Final retained frame: `workspace/frame-014.png`; document remained open.
- Harness ledger explicitly says `reopened=false`, `close_reopen=not_offered`.

Independent read-only verifier `scripts/computer-feasibility/verify-writer-save-r7.py`
checks ZIP CRC, ODT mimetype, XML text and style inheritance, checksum, refusal and
dispatch ledgers, saved frame presence, exact process identities and cleanup.
Result: `/tmp/r7-writer-save-verified-1.json`. Reading the ODT archive from disk is
independent save verification, **not** a GUI reopen.

## Owned resources and verification results

All commands launching test subprocesses used `owned-test-supervisor-r6.py` with
explicit finite deadlines. The real fixture supervisor
`/tmp/r7-writer-save-owned-1.json` reports primary exit0, completed=true,
cleanup_ok=true, census_complete=true, residuals=[], no timeout, 31.93 seconds.
Inner and outer fixture reapers each report remaining children0.

Exact unit `odin-xi2-feasibility-2bf8d52c80c34e398720052b4da9204d.service` is
not-found/inactive/dead with no ControlGroup. All **129 sampled original PID/start
identities** are absent, including zombies; no cgroup or census errors remain.
Independent verifier supervisor `/tmp/r7-writer-save-verifier-owned-1.json` exited0
with cleanup verified. Automatic `validate_action` bundle
`r7_writer_private_save_and_owned_cleanup` passed **3/3** checks.

Focused recorded results (not a full-suite claim):

- Profile, scope, policy and tool schema: **162 passed**;
  `/tmp/r7-apps-profile-tests-1.json` cleanup verified.
- Expanded action/keyboard/integration/import regressions: **317 passed**, one
  existing `audioop` deprecation warning; `/tmp/r7-apps-regression-1.json` cleanup
  verified. This run precedes the controller/backend hook cherry-pick.
- Integrated hooks plus app/scope/status/harness: **132 passed**;
  `/tmp/r7-apps-integrated-hooks-2.json` cleanup verified.
- Final combined focused regression run after hook integration: **325 passed**,
  one existing `audioop` warning; `/tmp/r7-apps-final-tests-1.json`, primary exit0
  and cleanup verified. No full repository-suite claim is made.
- Operator UI: `node scripts/check-computer-browser.mjs` **passed** in actual
  headless Chromium with mocked fixture-only API. Tests Writer-only label and
  lifecycle refusals, no auto capture and existing operator controls.
  `/tmp/r7-apps-browser-1.json` cleanup verified, seven adopted children reaped,
  no residuals. Temporary dependency symlink was removed.
- Targeted production/profile-test Ruff run passed;
  `/tmp/r7-apps-profile-lint-2.json`. Final scoped Ruff including the independent
  verifier passed, `/tmp/r7-apps-final-lint-2.json`, cleanup verified.
  `git diff --check` passed.

Preserved non-evidence failures: initial Ruff found six overlong lines, corrected
before its successful rerun. The independent verifier initially had unsorted
imports, corrected before the final targeted lint rerun. One integrated test
invocation mistyped a filename,
ran no tests and exited4; the corrected invocation above is the evidence. No GUI
retry, no failed GUI save and no close/reopen attempt occurred in this R7 fixture.

## Handoff

`LOCAL-DEPLOY-TESTING.md` is parent-owned and must advertise the exact offering
above, not the historical generic Office scope in R6 reports. New operator tasks
should explicitly request only a short Writer note/paragraph/bold and save to a
new scratch filename. Odin must refuse Writer close/reopen or pointer/menu work
and leave document lifecycle to the operator. Old generic Office sessions must
not acquire Writer permission by name aliasing. Historical R6 reports remain
preserved facts, not current capability advertising.
