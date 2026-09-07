# R3 review checkpoint — ordinary-turn computer tools

Status: **reviewable development increment, not deployable Stage 6 computer use**.
Existing branch and PR350 retained. No master merge, deployment, release pipeline,
tag, Odin restart or automation of the active workstation session.

## Binding behavior and implementation

Computer use is an on-demand capability inside an ordinary turn. An internal
desktop task may keep its app/capture/input resources across calls; it is never a
conversation mode. Other tools retain the same authority and availability during
the task, afterward, on later turns and for other channel participants.

Removed the restriction table creation, restrict/is_restricted methods, policy
branch, controller/integration taint, dispatcher/executor hooks, tool-catalog
narrowing and completion-classifier exception. Pre-R3 development stores drop
only the obsolete table, preserving sessions, receipts, cleanup and evidence.
The public tool description no longer demands a fresh channel. Q5's old design
is explicitly historical and superseded by the R3 decision committed first.

Desktop-only foreground authority, ownership, generation checks, no-replay,
explicit tool scopes and refusal classes remain. Primitive/application allowlists
were not relaxed. Lost/unsupported desktop pixels retire into bounded text rather
than disabling an ordinary turn. Only computer actions need renewed evidence.
Stop/cancel/close/status remain usable after a vision-model change, with the exact
nonvisual operation bound to its grant. No hidden expansion to other operations.

Independent review found and reproduced two issues during implementation: shutdown
still required vision, and transcript scans could clear the missing-frame fence
using old unrelated pixels. Both were fixed and independently re-reviewed. Only a
newly issued response from the current call, validated against live ownership,
turn, generation, freshness, metadata, pixel digest and replay state, can repair
the action-only evidence refusal. Legacy analyze_image does not repair it.

## Build continued beyond removal

- **Actual bounded rendering:** new lazy optional `render.py`, 45 pixel-level
  tests, real RGB/RGBA source overviews/crops/rotations and serialized native image
  requests. 1080p/1440p/4K and one 7920-wide RGB source no longer fail solely on
  source geometry. Source allocation64MiB is separate from delivered2M pixels /
  2MiB PNG. At most three encoder attempts. See RENDERING.md for caller obligations.
- **X11 lifecycle:** final fixture completed12/12, three repetitions each of owned
  client EOF, controller EOF, held-input lease expiry and graceful detach. Only
  owned Control/button1 released; simulated human Shift/button3, pointer and focus
  remained intact. Same GTK app accepted fresh human input after every release
  and after watchdog exit. Final wrapper exit0, recorded26 process identities gone,
  exact cgroup gone. Devices remain **enabled and retained**, not revoked/removed.
  See FEASIBILITY-X11-R2.md for all five attempts and limitations.
- **Wayland:** genuine consent, PipeWire/libei and orderly release/application
  survival measured after telemetry repairs. EOF trial failed before owned input
  on inconsistent focus-switch key evidence. No full lifecycle or backend claim.
  See FEASIBILITY-WAYLAND-R2.md for all failures and the corrected experiment.
- **Cleanup truth:** fixtures now assert recorded host processes, not merely empty
  container lists. Docker shell tests now stub host census as well as Docker so
  unrelated concurrent test jobs cannot make orchestration tests flaky; actual
  census permission/race failures are separately tested. No production census
  check was weakened.

## Unresolved cleanup is explicit

The reported catatonit and three conmon identities are already dead zombies,
adopted by the active Odin process. One interrupted Podman inventory child is also
dead/unreaped. Exact external waitpid attempts returned ECHILD for all five. There
is no safe external wait/reap operation for another parent's children. No live
parent injection, restart or cleanup-policy change was used. **Old reaping remains
incomplete**, not “cleaned up.” New disposable fixtures were removed and their
recorded identities verified absent. See CLEANUP-R2.md.

## What this does not claim

Production wiring remains deliberately unavailable: no constructed integration
owner in the application, no registered computer API routes, no enabled grounded
actions. Real-session attachment has not been activated. Native serialized pixel
tests use mocked HTTP; they are not a live graphical/model acceptance run.

The next build increment must resolve Wayland EOF/key-state evidence and develop
the owned-input supervisor from the X11 result without calling retained enabled
devices inactive. Then integrate capture revisions, source selection, buffered
frame clock provenance, rendering and grounded receipts/postconditions. Only
after those checks should application wiring and the Stage6 task/recovery corpus
be activated in the isolated tier. Real-session use remains the destination of
the same capability, not a different product or permission to touch display0 now.

## Validation ledger

- Final focused computer tests: **413 passed**, one audioop deprecation warning.
- Including the final checkpoint/resume correction: **434 passed** (computer and
  codec suites). A full-suite run caught the newly added `_computer_frame_error`
  missing from the field census:12,269 passed,5 skipped,1 failed. It was fixed,
  not waived. This field is reconstructed with action admission blocked until a
  new owned observation; a round-trip test proves it never changes ordinary tools.
- Final reviewer: **52 passed**, both reproduced review findings fixed; no open
  P1/P2 in its focused scope. This is not a complete product endorsement.
- Lint gate vs d5fc7eb: zero new findings. Type gate: zero new findings (two baseline).
- Generated API/tool references: current. Apply-registry gate: findings0.
- Full local suite before final review fixes: **12,226 passed, 5 skipped**, 843
  warnings and pending-async-cleanup diagnostics. This run overlapped source work
  and is not the final immutable-source verdict. Final rerun is recorded below
  when complete. Tests run only in the development clone, never the live install.
- Final Docker shell/telemetry tests: **15 passed** after a hermetic test correction.
  A prior shell test returned70 instead of expected25 because it was observing
  unrelated host jobs; that failure was not dismissed as a product pass.
- X11 framing/census tests: **6 passed**. Actual lifecycle results and cleanup are
  separately recorded, not inferred from unit-test success.

No host package installations. Existing Pillow12.3.0 is now explicitly declared
as an optional computer/development dependency; contained Wayland image changes
and reversal instructions are in its feasibility report.

Final browser checks passed: computer operator (stubbed UI harness), existing
live-log browser regression and shared output renderer. No UI source/dist changed.
Final workload cleanup validation was **DEGRADED5/6**: no experiment containers or
units, all23 recorded corrected Wayland identities absent, no live work among old
zombies, service active, and previously reported concurrent test children gone.
Only historical parent-owned zombie reaping remained failed.

Final immutable-source full suite at `33190aac0ff02a2a8fec8a91c8b3703fab8a7926`:
**12,271 passed, 5 skipped, zero failures**, 579.35 seconds. Log:
`/tmp/odin-computer-r3-33190aa-full-pytest.log`. Source/tests/dependencies were
unchanged throughout that run. There were843 warnings plus unawaited/pending
async-shutdown diagnostics, also present in earlier runs; this is not a claim of
warning-free test teardown. Only documentation changed afterward. No CI or
release workflow was run; branch commits use `[skip ci]` under the no-pipeline
boundary and the PR remains draft.
