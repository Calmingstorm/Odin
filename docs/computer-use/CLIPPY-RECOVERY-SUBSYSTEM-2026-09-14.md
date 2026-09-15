# Ordinary Hyprland drawing continuity, 2026-09-14

Base: `817d840af354c00029f1bed959666466205d5594`.
This is a development handoff, not a completed Discord drawing qualification.

## Verified failure chain

The real Discord trajectory for the affected session (private identifier omitted)
contains a successfully sent/released Ctrl+N and a delivered post-action modal
observation. Create was refused **before input**, with `stale_source_binding`.
The caller used the NEW observation and exact modal. Controller binding error
handling paused merely because any modal existed, revoking generation 1 to 2.
The following observe consequently failed `stale_generation`.

Resume then unconditionally entered native continuity recovery for an attached
Hyprland backend. A clean task pause was treated as lost compositor continuity.
Separately, native backend resume categorically refused captured owner handles.
Finally, normal Discord turn finalization cancelled the session rather than
retaining a safely paused task. These are separate layers of one lifecycle flaw.

## Subsystem stance

- Ordinary clean pause/resume does not enter restart recovery or owner
  reconciliation. It retains exact selected target identity and the original
  task deadline, but retires input resources and all observation authority.
- Resume requires current authorized ownership, renewed consent generation,
  original compositor incarnation, exact window/plugin/application/output, and
  fresh native scope. A new guardian is durably recorded. Old input is never
  replayed. Same-application native modal scope is supported; unrelated root
  focus is not silently adopted.
- Native ACK/receiver limitations do not override confirmed local release.
  Missing/failed local release and unreaped helper evidence still fence.
- Same acknowledged modal with stale geometry refuses old coordinates and
  requests fresh observation without revoking the whole session. Unexpected
  modal transitions remain observation boundaries.
- Generic timeout, transport, parser, and settling errors are not proof of
  compositor death. Affirmative process/peer/plugin/target identity changes
  still enter native recovery. Failed capture invalidates previous frames.
- Clean failed resume, including first-capture failure after successful helper
  startup, returns to paused with explicit status/resume guidance. Unknown
  cleanup and cancellation do not acquire that exception.
- Normal turn completion pauses healthy Hyprland tasks. Explicit stop/cancel,
  expiry, disable, shutdown, and unsafe cleanup retain terminal behavior.
  X11 lifecycle behavior is unchanged.

## Tests and evidence

The composed regression uses the real Hyprland backend, controller, durable
store, integration and tool-loop image delivery with fake native I/O. It opens
and closes a modeled New Document dialog, rejects stale modal coordinates,
draws multiple strokes, crosses real `finish_turn`/resume boundaries, changes
guardian identities, repeats the document/session, and checks no replay or
recovery-pending rows. It is NOT live receiver or Discord proof.

A bounded probe on the target host used the production controller with the modified
backend in a separate diagnostic process. Two actual native pause/resume cycles
passed (generations 1 -> 2 -> 3 -> 4 -> 5), followed by clean close. No brush or
keyboard action was sent. Scope ledger was disarmed/empty; 31 devices clear;
existing window geometries unchanged, original Firefox focus restored.

Broad initial subsystem run: 4,710 passed, 22 skipped, 21 failed, 106 errors.
Independent baseline `817d840` triage reproduced the same 19 failures and all
106 native fixture compilation errors. The two new failures were obsolete
unconditional resume-refusal tests and were corrected with safety negatives.
This baseline is NOT green; do not describe the broad suite as passing.

Final combined targeted validation: **351 passed**, one existing `audioop`
deprecation warning, 11.48 seconds. This includes all three composed drawing
cases, controller/native resume contracts, release/ownership negatives, durable
store/recovery tests, and normal-turn/dispatch/X11 regression coverage. Import
checks, Ruff for changed production/new test files, `git diff --check`, and patch
application check against the clean base passed. Full hosted CI was not run.

## Live stranded session settlement

Only the explicitly requested affected session was settled, after fresh empty native
ledger/device and recorded-process-absence checks. Deployed store APIs performed
generation-CAS acknowledgment and pending archival. It is closed generation 6;
pending removed; original action receipts unchanged; receiver verification false.
Private backup and owner records remain on the host, excluded from attachments.

## Deployment and required acceptance

Python-only changes: controller, error guidance, Hyprland backend. No guardian or
plugin rebuild. The deployment operator owns clean deployment; no config, daemon, branch,
plugin, guardian, compositor, or runtime-qualified change was made by this work.

The final patch supersedes the earlier runtime-only handoff: the composed test
exposed the normal finish-turn cancellation after that handoff was prepared.

After deployment, the authorized operator must issue the ordinary Discord drawing request: new
document, multiple picture elements, natural completion pause, explicit resumed
continuation, then a second new picture/session. Inspect actual pixels and
retained receipts and check no quarantine/unknown release. Do not substitute the
diagnostic probe or synthetic regression for this acceptance test. No destructive
compositor scenarios are authorized or needed.
