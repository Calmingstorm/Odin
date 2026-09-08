# R6 review: command ownership and useful attached applications

This is source and test evidence for PR350, not a deployment. Runtime frozen at
`0ec10ff`; application qualification harnesses captured at `337a260`. No live
install edit, Odin restart, merge, tag or release/CI pipeline was performed.

## Requested zombie diagnosis and repair

Observed the live service's unreaped-child census increase by one. The shipped positive
adoption scanner misses descendants orphaned before its first observation. Two
independent owned fixtures reproduced this:32/32 and64/64 zombies remained after
three zero-grace scans. This is a demonstrated mechanism, not guessed attribution
for each historical PID. Old statuses cannot be safely consumed by another process.

Local foreground and managed shell commands now have an exclusive stdlib-only
subreaper worker. Original shell exit status and streams are separate from
descendant settlement. Fast double-forks are reaped by their owner; ordinary
Popen/fork/asyncio owners remain untouched. Normal foreground background children
remain alive under their worker; managed jobs preserve explicit cleanup semantics.
Startup/control loss and incomplete cleanup refuse success and veto re-exec.
Durable tests cover pre/post-handshake helper loss, malformed control, non-UTF8
process names, mixed owners, streams, cwd/env, status, timeout and cancellation.

Independent review fixed a pre-protocol helper-death failure and shutdown admission
race; subsequent actual CLONE_PARENT and unrelated Popen status tests passed.
See ZOMBIE-REAP-R6.md. Direct browser/native subprocesses outside the local shell
path remain a distinct boundary. Uncatchable helper death cannot guarantee cleanup.
No historical zombies were cleared or live cure claimed. Minimal-command median
cost increased from0.717ms to36.690ms in24 interleaved pairs; not zero overhead.

## Requested broader existing-session input

Native Xed, Inkscape and LibreOffice Writer/Calc/Draw document profiles are now
eligible on attached X11, with exact trusted executable/XRes/process evidence.
Isolated launch remains Drawing/Xed. Interpreter-based attached Drawing remains
capture-only. Unknown/sensitive dialogs, terminals and control-plane actions stay
refused. Independent review found and fixed nested dialogs regaining refused
scope. Profile lists appear in System > Computer without implicit capture/probes;
they explicitly distinguish eligibility from actual readiness and qualification.

Actual demonstrated work:

- **Inkscape model task:**22 native-image requests,168.055seconds, three-part house
  drawn and saved through GUI. SVG2rect+1path; independent raster/layout checks and
  parent visual review passed. No fake generated artwork or argument rewriting.
- **Writer:** exact two paragraphs and bold style GUI-saved as ODT; later runs
  with ordinary blinking caret also saved successfully. Close/reopen is NOT
  qualified: File > Close returned unknown, owned input released, driver stopped.
- **Main desktop Inkscape:**10 verified actions completed rectangle/ellipse and
  GUI save on the primary monitor. Both CLI runs reported restoration failures honestly. Parent
  restored exact full metadata after a power mismatch and later observed topology
  change; no further main input followed. MAIN-SESSION-R6.md has the full account.

Keyboard actions use newly verified exact native scope rather than full-image
equality, so blinking need not block typing. Arbitrary internal widget/selection
changes in that same scope remain the accepted shared-focus limitation, not an
atomic guarantee. Click/drag remain raster-exact. New41-case regression coverage
uses real adapter revision binding, including same-pixel process replacement,
stale source/modal changes, no input on denial and no replay.

## Validation and release boundary

- First full suite:13023 passed,5 skipped,1 failed; failure was an out-of-date
  new harness fixture missing its private-qualification flag. Fixed and retained
  in the test record. A second focused check found the now-qualified harness flag
  test still assumed false; converted it to explicitly test the false state.
- Current focused results:283 process-related tests;1038 computer tests before
  the final grounding additions;273 grounding/profile tests including41new;
  final harness/grounding batch76passed plus4standalone fixture guards.
- Full-suite rerun: **13026 passed,5 skipped,0 failed,931 warnings**,522.13seconds,
  exit0 at337a260 with runtime unchanged from0ec10ff. Only fixture/test whitespace
  cleanup followed during the run; no executed behavior changed. Log:
  `/tmp/odin-r6-full-337a260.log`. Standalone supervisor report:
  `/tmp/odin-r6-full-337a260-owned.json`, primary0, complete census, no residuals,
  no cleanup signals. Existing pending async-generator/coroutine diagnostics after
  pytest remain visible; do not describe shutdown as warning-free.
- npm check passed, operator browser passed again, dist rebuild matches committed
  artifacts. Lint0new/0total, type0new/2baseline, apply registry0findings.
- Final independent delta review c71835bb found no new concrete blocker for
  bounded supervised native-app deploy testing, tied to337a260/runtime0ec10ff.
  Its own targeted129tests passed with verified standalone cleanup. It explicitly
  rejected unattended, all-app or all-platform completion claims.
- Test-only standalone supervisors verified no residual descendants, including
  browser-test adopted children. Existing async teardown and deprecation warnings
  are not described as clean. Fixture whitespace findings were corrected without
  changing the one-line laboratory compositor patch's behavior.

Read LOCAL-DEPLOY-TESTING.md and its R6 links. Qualified work is bounded native
drawing/document editing, not arbitrary apps. Calc/Draw have no task qualification,
Wayland remains refused, text is short ASCII, and initial deploy tests should use
an awake stable desktop with the user present. This is not an all-app/all-platform
or unattended sleep/topology recovery completion claim.
