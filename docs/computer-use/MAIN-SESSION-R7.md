# R7 main-session check: owned cleanup passed, hardware restoration refused

On 2026-09-07 the integrated revision `334f302` was tested once on the explicitly
authorized `:0`, DP-4, with a new private-HOME/private-bus Inkscape process. The
exact private CLI had just passed all ten actions and eighteen stages at the same
revision in `/tmp/private-main-r6-0grvjtzd`. No fault was injected into the real
desktop and no existing document received input. There was no second GUI attempt.

## Actual result, not a success claim

Main evidence: `/tmp/cu-r6-sh7s3l7g/`, output `/tmp/r7-main-scratch.log`.

- Initial monitor power was Off. The first native keyboard action verified, then
  capture became unavailable during the existing Cinnamon wake/layout incident.
  The task stopped without replay. No artifact was saved.
- Production controller cleanup **completed**: stopped/released, input and capture
  revoked, applications preserved, no created devices. That receipt was verified
  before any scratch desktop restoration.
- Scratch process termination, pixel purge, private HOME removal, connection close,
  and automatic restoration of original Off power **all passed**.
- The baseline topology repair **refused**, correctly: output physical-dimension
  metadata changed along with modes/origins and an output becoming disabled. It
  was not the unchanged-resource topology shift qualified by private RandR tests.
  Coordinate-dependent recovery was fenced. The CLI returned1 with explicit
  `cleanup_complete=false`, `session_restored=false`, and manual stage actions.
- Standalone supervisor reports primary1, cleanup true, no owned residuals.
  **Process cleanup is not desktop restoration.**

Aaron already identified this wake issue as longstanding Cinnamon behavior,
unrelated to Odin. No Cinnamon workaround, restart, automatic inventory relaxation
or production display repair was added. A test fixture pass cannot erase this
failed main-session result.

## Baseline-directed recovery and final state

The parent recovered only the recorded layout: original four mode IDs, origins,
rotation, primary, framebuffer and physical dimensions, followed by the recorded
hidden application's position, focus, pointer, workspace and Off power. No
document operation, unhide, activation, resize, logout or application termination
was used on an original application. A position-only request was identity/state/
size checked against the original hidden client, which lacks frame extents; the
general scratch helper conservatively refuses that unqualified case.

The desktop manager recreated its four desktop surface XIDs. The original four
application window records match exactly. The replacement desktop surfaces have
the same owner PID/UID/start ticks, geometry, state and types, but different XIDs.
Those replacements prevent a full exact-baseline claim and were not forged back.

Final independent metadata report `/tmp/r7-main-final-comparison.json`:

- exact full RandR baseline and original power: true;
- four surviving application records exact: true;
- four replaced desktop surfaces, matching geometry/state/owner: true;
- focus identity/revert, pointer, workspace, active state and keymap exact: true;
- eight current clients, all UID1000; scratch HOME and pixels absent;
- **full exact baseline: false**, due to recreated desktop identities.

The full metadata is in `/tmp/r7-main-final-full.json`. No screenshots or document
contents are present in these reports. Validation confirmed four monitors, original
Off power and no scratch data. Live Odin was not restarted or modified.

## Operator consequence

Production Stop can clean its own resources across capture/topology loss without
repairing Cinnamon or changing the user's layout. That part passed on the actual
session. However, **unattended exact desktop restoration through this machine's
hardware wake incident is not qualified and did not complete automatically**.

If it recurs during Aaron's local test: Stop/Disable computer use, retain the
cleanup receipt, let the display settle, and choose the intended layout in the
normal display controls. Do not replay the interrupted action. If an output,
resource identity or desktop window was replaced, start a fresh authorized task
afterward. For a developer scratch run, use `before.json`, `after.json` and
`handoff.json` to inspect remaining stages; do not force XIDs or unknown mode IDs.
Power, topology and window reconstruction beyond the conservative baseline cannot
honestly be promised as automatic here. The handoff states that limit explicitly.
