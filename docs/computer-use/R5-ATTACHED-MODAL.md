# Attached X11 modal transitions and action budgets

## Final parent integration

The remaining Return failure was traced in the private fixture to the controller's
post-action capture raising capture_unavailable. Capture workers can observe a
focus/title transition between their two strict snapshots. The worker now makes
at most three complete capture attempts, discarding raced rasters, with30ms between
attempts. Equality, topology validation, input eligibility, five-second worker
alarm and no-replay semantics are unchanged. It does not retry input or bless a
stale frame. Three new tests cover stable recapture, exhausted settling and
capture-only evidence without an input grant.

Actual private acceptance `/tmp/x11-modal-check-9s5lxryi/result.json`: exit0, marker
type, Ctrl+S, safe chooser, Escape, second Ctrl+S, explicit filename, Return and
exact saved-file assertion all reached. Held input was clear after every action;
98 sampled owned identities were gone, cgroup absent, no ledger errors. The traced
earlier failure remains `/tmp/x11-modal-check-z66kask_/result.json`; it is not a pass.
The diagnostic hook records bounded exception type/code only in this private
fixture, not production telemetry or operator pixels. Main-session acceptance is
separately recorded in R5-MAIN-SESSION.md.

## Historical diagnosis checkpoint, not an inferred incident cause

The first authorized MAIN scratch trial's persisted receipts in
`/tmp/assisted-session-r5-4wwfgwqq/private-state/state.sqlite3` contain a verified
typing action followed by `unknown / input_outcome_unknown` for Ctrl+S. The latter
is a controller-level terminal receipt, not a native guardian reason. It cannot
distinguish timeout, native scope failure, or failed postcondition binding. This
fix does not retroactively relabel it or replay its action ID.

Source inspection and focused regression fixtures establish three defects:

1. A shortcut's key-down can create a modal before key-up. Requiring the original
   full focus snapshot for the already-owned key-up incorrectly aborts it.
2. Exact before/after scope equality rejects legitimate same-application modal
   transitions, although the controller explicitly supports such transitions.
3. The controller's two-second backend-call timeout includes privileged startup
   and post-release capture. It incorrectly conflates native injection time with
   RPC verification time.

A fourth defect was proven by the private real-Xed controller fixture:
`/tmp/x11-modal-check-wlmk8g4q/result.json` records a native executed/released
Ctrl+S, matching process/source/root, and an unrecognized chooser. The actual
trusted Xed chooser title is `Save As…` (U+2026). The exact title is now allowlisted
alongside `Save As`; no wildcard or broad punctuation normalization was added.

## Changes and unchanged safety properties

The guardian bypasses old-window validation **only for releases already present
in its own ledger**. Every new down, movement, or wait still requires the original
scope. Release still checks revocation, physical overlap, native identity, helper
liveness, and the hard lease. An unowned release is never allowed. Dispatch has a
1.75-second deadline, with the existing two-second nonrenewable native lease
unchanged. Scope validation overhead cannot extend dispatch admission.

Postcondition matching requires fresh AppScope evidence for the exact process
identity, source topology/rectangle/origin, focused eligible application, and the
same top-level transient family. It allows safe chooser creation and dismissal,
not arbitrary other windows in the same process, other processes, unknown modals,
or source changes. It is evidence only: previous observations remain consumed and
new modal input still requires a freshly delivered observation and explicit modal
acknowledgement.

Controller backend RPC completion is bounded at five seconds and still capped by
the remaining task deadline. This does not change native injection limits or
authorization. Timeout/cancellation retains durable unknown and no replay.

## Focused validation

Recorded final focused run: **277 tests passed** across `tests/test_computer_x11*`,
attached controller, GUI actions, and R4 actions. The tests include a modal created
on Ctrl+S down, tracked releases, rejection of a subsequent new down after scope
change, no physical-state repair, dispatch/hard-lease expiry, same-app modal
postcondition and old-binding rejection, different process/source/modal rejection,
RPC overhead exceeding two seconds, timeout unknown, and no replay.

Ruff passed for the nine edited production/test files and `git diff --check`
passed before the final documentation update.

## Actual isolated result and remaining blocker

`/tmp/x11-modal-check-7qovuey2/result.json` records the final private real-Xed run:
typing verified, Ctrl+S verified, recognized safe chooser with a new revision,
Escape verified, and a second Ctrl+S verified. Ctrl+A returned `not_satisfied`
(no visual change); filename typing verified. **Return was unknown**, despite a
native executed/released receipt and matching raster postcondition. Therefore
the full saved-file acceptance did not pass and the fixture exited 1. No unknown
was replayed. The precise Return/controller failure requires further diagnosis;
this document does not claim that saving is ready for MAIN.

All actions reported held keys/buttons clear. Controller cleanup verified workers
absent, no remaining backend children, unchanged device identities, and Xed
preserved. The outer sandbox reaped Xed/WM/Xvfb, with zero surviving processes,
no surviving cgroup, and zero process-ledger errors.

No MAIN display, real-session capture, or live deployment was accessed by this
fix agent. Real isolated Xed evidence is recorded separately by the private
Xvfb/controller fixture. MAIN retry and exact restoration are the parent
operator's separate authorized acceptance gate, not established by unit tests.
