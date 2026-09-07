# R7 review: cleanup ownership, bounded recovery, qualified applications

PR350, `feat/isolated-computer-use`. This is source/test work, not a deployment.
Runtime revision for final validation: `9ec4460`. Rebuilt `ui/dist` is committed.
No live-install change, service restart, merge, tag or release/CI pipeline.

## What changed

- Attached cleanup owns its worker jobs, release receipts and reaping independently
  of capture/action waits and repeated caller cancellation. It does not read RandR,
  capture a screen or wait for focus to release input. Privileged cleanup has a
  nine-second drain inside the ten-second attached controller bound; two-second
  input lease unchanged. Isolated timing and other tools remain unchanged.
- Failed/unknown input is never replayed. Cleanup can pass while task outcome is
  unknown. A later explicit Stop can accept late verified cleanup, but a timeout
  never claims release. Controller stop transactions survive cancelled callers.
- Scratch-only baseline restoration is automatic for qualified unchanged-resource
  topology shifts: topology, windows, focus/pointer, power, then exact comparison.
  It requires verified input/app teardown and valid recorded identities. Stages are
  independent; hard failures have concrete handoff actions. Replaced resources,
  unknown window state and held input refuse repair, not a guess or global release.
- Generic Office/Calc/Draw are removed from the offering. `writer` is keyboard-only
  short-note/paragraph/bold/ODT save. Its pointer/menu, open/new and close/reopen
  requests are refused before native dispatch. Xed, Drawing and Inkscape existing
  task scopes remain. Operator and tool metadata explain these actual limits.

## GUI and cleanup evidence

- Real private Xvfb: five blanking/topology/cancel/EOF/lease cases, 20 received
  input edges, no late `a`, verified owned release and application survival.
  Three product capture workers reaped across monitor loss. No hardware DPMS claim.
- Real private Xephyr: 1280x900 to800x600 to exact baseline via RandR. Visible and
  hidden fixture windows retained identity; position-only hidden repair produced
  no map/unmap or activation. No physical sleep/hotplug or native-app claim.
- Integrated Writer at `f5faef0`: `/tmp/attached-apps-r6-751b03mq`, nine executed
  and released native actions; four refused inputs reached native code zero times.
  GUI ODT9735bytes, SHA256
  `28d97217b9db0e5d1734d49b377d6a61915503400f5a397eebff7fcde94324f0`.
  Independent ZIP/text/style verification passed. Exactly two paragraphs, second
  bold. One ctrl+a raster check honestly not_satisfied, no replay. All130 sampled
  process identities absent, cgroup gone, inner/outer children0. Not GUI reopen.
- Integrated exact private Inkscape CLI at `334f302`:
  `/tmp/private-main-r6-0grvjtzd`, ten verified actions/eighteen successful stages,
  rectangle+ellipse saved, verified durable controller cleanup, exact baseline,
  screenshots/HOME purged, no manual actions; outer standalone census complete,
  no residuals/rescue signals. Xvfb has no DPMS, unchanged unavailable is not power
  recovery evidence.
- **Actual main session did not pass the full scratch transaction.** During the
  known external Cinnamon wake incident, one action verified then capture failed.
  Production owned cleanup and automatic Off-power restoration passed. Changed
  output physical metadata blocked exact topology repair; parent recovery was
  required. Original four application windows/layout/focus/pointer/power/input
  now match, but four desktop surfaces were recreated with different XIDs. No full
  exact-baseline or fully unattended hardware recovery claim. See MAIN-SESSION-R7.

## Validation record

- Scratch focused139tests; runtime focused263tests; app focused325tests. These are
  separate overlapping batches, not additive full-suite counts.
- Parent npm check/build and operator browser checks passed. Standalone owners
  reaped their exact browser descendants, no residuals or rescue signals.
- Parent lint gate0findings, type gate0new/2baseline, config-apply0findings and
  merge-base diff-check passed.
- First integrated full suite at334f302: **13157passed,5skipped,1failed**,932warnings.
  The unchanged legacy test exposed a real regression: concurrent Close reused the
  previous failed Stop result instead of its serialized retry. Fixed in9ec4460;
  original test left unchanged. Parent GUI/cleanup/lifecycle rerun **57passed**.
  Failed-suite standalone supervisor cleanup true, complete census, no residuals.
- Final frozen full suite at9ec4460: **13158passed,5skipped,0failed,931warnings**,
  530.08seconds, exit0. `/tmp/r7-full-9ec4460.log` and its `-owned.json` report:
  complete census, no residuals, no rescue signals, cleanup true. Existing pending
  async-generator/coroutine teardown diagnostics remain visible after pytest;
  this is not a warning-free shutdown claim. Only documentation followed.
- Independent read-only review5cc54d7c through9ec4460 found no remaining blocker
  for bounded, explicitly authorized operator deploy testing, not guaranteed
  hardware reconstruction. Its unchanged GUI/cleanup tests **44passed** in4.43s;
  standalone owner cleanup verified. It separately rejected a fully automatic
  main-desktop baseline claim and required no Cinnamon-specific workaround.

## Local-test readiness boundary

The implementation is usable for the named native tasks, with substantially better
owned cleanup and truthful refusals. **The requested automatic restoration through
this machine's hardware wake incident is not achieved.** Do not call this arbitrary
application completion or unattended desktop recovery. Aaron's handoff contains
exact manual steps for changed-resource and permanently unresponsive-server cases.

Read LOCAL-DEPLOY-TESTING.md, RUNTIME-CLEANUP-R7.md,
RECOVERY-QUALIFICATION-R7.md, APPLICATION-QUALIFICATION-R7.md and MAIN-SESSION-R7.md.
All package dependencies were already present; no R7 system package installation.
Historical live zombies remain424, not reaped/injected/restarted by this work.
