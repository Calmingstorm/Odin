# R8: production Wayland with per-session compositor qualification

Final implementation/test revision: `b7711cead9bec7ed16e61848fcd807c14def0d15`.
Subsequent checkpoint/PR-description changes are documentation only. PR350 remains
draft. No merge, deployment, restart, tag or GitHub/release pipeline was performed.

## Delivered

The blanket Wayland refusal is removed. Configured foreground computer tools
select the real portal/PipeWire/libei backend, run per-session release
qualification, expose the identified compositor and precise input admission
report, then allow input only with consent, source mapping and trusted application
focus. Default-off operation and all ordinary tools remain unchanged.

The safe probe uses a private compositor with the **same installed executable and
mapped input/render/vendor library objects**, checking device/inode/hash and active
PID/start/boot/session before and afterward. It observes held key/button callbacks,
sole sender EOF, real release callbacks, same-receiver fresh input and cleanup.
It reports `same_stack_disposable`, never direct active-instance measurement.
No deliberate stuck-button experiment is run in the operator's compositor.

* Stock Debian13 GNOME Shell `48.7-0+deb13u2` / Mutter `48.7-0+deb13u1`:
  **6/6 native-headless and 6/6 nested-X11 Wayland lifecycle cases passed**.
* Actual production same-stack runner: **48.7 native and nested eligible**;
  baseline GNOME Shell46.0/Mutter46.2 nested **refused** after real button-down,
  sender EOF, key-up but missing button-up. Precise reason and upstream/vendor
  remediation are returned. This is not a version allowlist.
* Actual ComputerController task on native Inkscape1.4-6: **rectangle drawn and
  GUI-saved into an operator-opened scratch SVG**, repeated successfully. Frozen
  native10 producer `88c126a644e938bf5975def5fe59ef2598c6398a` matched all12
  recorded source hashes. SVG1165bytes contains one positive rectangle; final
  screenshot1280x900, independently checked rectangle interior7200/7200black.
  First3action raster checks verified; Save raster check not_satisfied, while
  separately inspected saved bytes prove save. No retry or verdict laundering.
* Actual controller cleanup complete, released/input/capture revoked, EI and portal
  connections closed, portal Close acknowledged, same Inkscape process alive.
  Exact container/cgroup/PID census and outer subreaper cleanup passed.

## Important boundaries

Wayland currently offers **native GNOME Inkscape**, not arbitrary apps. The
operator opens the document; all dialogs and document open/new/close/reopen are
refused. Xed/Writer/Draw/Calc are not offered as Wayland inputs. Existing X11
profiles retain their prior scope. GNOME scope requires the explicitly installed
companion extension; other compositor families lack a trusted scope adapter and
are unsupported, not falsely diagnosed with Mutter's button bug.

Exact vendor/render mismatches can prevent qualifying otherwise correct hardware
stacks. The headless test measures matching native input implementation, not
physical-device concurrency or the active instance's hidden state. No boolean
override, editable qualification JSON, compositor patch or security-policy bypass.
Source/consent changes require a fresh task. Shared focus/pointer and bounded ASCII
remain explicit limitations. User-visible close acknowledgment is distinguished
from merely reaping the connection owner.

## Review fixes and validation

Independent review found four P1 races/failure paths and all were fixed with
regressions: queued writes crossing revocation, avoidable stale focus after
identity/region awaits, cancellation skipping later cleanup resources, and
unbounded portal send/authentication. Follow-up independent review at b7711ce
confirmed all four fixed, no new blocker in those paths. This is not a formal
whole-PR approval. Additional actual-runtime fixes include the empty GNOME banner
container, non-NUL-terminated EI keymap payload, immutable runtime descriptor,
missing injected receipt field and renewed-generation launch persistence.

* Final ordinary full suite: **13,508 passed,5 skipped**,550.31seconds, exit0.
  Standalone supervisor complete census, cleanup_ok=true, no residuals/signals.
  Receipt: `/home/odin/tmp/computer-r8-fullsuite-final-20260907.json`.
* Earlier full run:13,505passed,5skipped,3failed. Failures were stale generated
  API line references and missing local spawn-site classifications. Corrected
  explicitly;161focused tests then passed, followed by the final full suite.
* Type ratchet:2baseline/2head,**0new**. Lint ratchet:**0new**.
* Config registry:36sections/285leaves,0findings. Branch diff-check passed.
* Browser:46templates,263callable bindings, computer operator and live-log
  regressions passed. Rebuilt ui/dist is identical to committed output.
* Legacy full-suite coroutine/async-generator teardown warnings remain. No test,
  threshold or baseline was weakened. **Coverage-instrumented full suite and
  coverage ratchet were not rerun in R8**; the earlier consolidation's coverage
  failures remain an open merge/release gate. GitHub CI deliberately not run.

## Host state and operational debt

No R8 main-session capture or input, no settings changes and no compositor wake
workaround. The known Cinnamon issue remains the operator's environment issue.
All new graphical fixtures and final validation workloads were removed/reaped;
only intentionally retained evidence/images and development worktrees remain.
Live service stayed PID3254906,0restarts,active; independently discovered listener
port3002 `/health` returned200 with statusok.

**Eight new dead children remain parented to the unchanged live service**:
seven from my initial browser/build checks that I failed to wrap in the standalone
subreaper, and one early private bwrap smoke. Count rose424to432, then remained
stable through supervised work. These are dead zombies, not active containers;
another process cannot reap them. No injection/restart was used to hide them.
This execution mistake is recorded and not attributed to the qualified compositor
or quietly folded into a clean-host claim. Subsequent workloads used standalone
subreapers and verified exact cleanup.

Host dependency change in R8: `dbus-next==0.2.3` installed only in the development
venv, reversible with uv pip uninstall against that venv. System packages for
Wayland experiments were installed inside new Docker images, not into the active
desktop. Retained test images/evidence are listed in the qualification reports.

Operator entrypoint: **WAYLAND-OPERATOR-R8.md**, plus LOCAL-DEPLOY-TESTING.md targetC.
Evidence: WAYLAND-QUALIFICATION-R8.md, WAYLAND-PROBE-R8-EVIDENCE.md and
WAYLAND-COMPOSED-R8.md. The operator owns local deployment/testing; review occurs before
the PR leaves draft.
