# R8 production Wayland composition, running qualification record

2026-09-07. This record is separate from the already completed stock 12/12
lifecycle survey. The target is actual `WaylandRuntimeBackend` composition with
`WaylandPortalSession`, authenticated scope extension, current J-chord guardian,
and `GnomeSameStackQualifier`. **Native9 and frozen-source native10 completed the
narrow existing-document rectangle/save task.** Historical failures below remain
failures. The final result is recorded at the end.

## Task and isolation

The simulated operator opens an existing, empty SVG at
`/tmp/work/r8-composed-scratch.svg`. Its initial contents contain no shape.
The intended task is to use production input to select the rectangle tool, draw
a rectangle, deselect and Ctrl+S the existing scratch file. This avoids a
save-as dialog, which the production scope explicitly refuses. It does not
qualify file-picker input, new/open/close/reopen or arbitrary Inkscape tasks.

The disposable target is Debian 13 GNOME Shell 48.7 native-headless at 1280x900,
UID1003, no host displays/buses/devices, no network, private IPC/PID/cgroup,
read-only root, no capabilities, no-new-privileges, 2GiB memory/no extra swap,
3 CPUs, 512 PID ceiling, 768MiB /tmp. Docker uses `--init`; outer harness uses
the existing exact label/name/cgroup/PID-start census and a standalone R6
subreaper. No live service/deploy/restart, no host desktop changes, no push.

Inner production bwrap requires **container-only** seccomp, AppArmor and
systempaths `unconfined` settings so unprivileged nested user namespaces/private
/proc can work. These are explicit isolation concessions, not host security
configuration changes. No production qualifier is bypassed or replaced with
JSON fixtures. The original R8 private operator simulator presses the real
visible GTK portal controls. It is not used for any application edit.

Additional packages in the image: Inkscape 1.4-6, python3-dbus-next 0.2.3-4,
python3-pil 11.1.0-5+deb13u4 and their dependencies; bubblewrap was already
installed in the stock image. `gcc -Wall -Wextra -Werror` compiles the current
production guardian, including the J chord path. Import validation executes
inside each assembled image. No host package installation.

## Recorded attempts, without rewriting failures

Evidence roots `/home/odin/tmp/r8-composed-<name>-20260907`; corresponding outer
logs `/home/odin/tmp/r8-composed-<name>-driver.log`, ownership receipts
`/home/odin/tmp/r8-composed-<name>-owned.json`.

| Attempt | Image | Actual outcome |
|---|---|---|
| native1 | r8a | Portal+EIS+scope identity+guardian established. Real qualifier refused `private_compositor_vendor_stack_mismatch`. No app input. |
| native2 | r8b | Final corrected selector: genuine qualifier eligible, fresh PipeWire capture; focused=false and task refused before input. Initial diagnostic mistakenly used raw grant props, reported source unavailable. |
| native3 | r8b | Same eligible result. Correct diagnostic uses authenticated capture metadata; actual production Snapshot returns `wayland_scope_unavailable`. No app input. |
| native4 | r8c | Parent runtime7c4437f fixes included. Eligible+capture pass. Separate read-only private diagnostic proves scope rejects an empty banner bin. No app input. |
| native5 | r8d | Parent banner77fad9a included, but newer parent probe now refuses `probe_private_telemetry_or_sender_error` before scope. Fresh refused capture passes; same Inkscape process survives detach. No input. |
| native6 | r8e | Actual ComputerController entrypoint now used. Before any portal/start, app_profiles.py:66 refuses Inkscape because `(platform, environment) != ('x11', 'existing_session')`. Exact error `application_environment_unsupported`. Same app preserved, no input. |
| native7 | r8f | Parent8bff004 + portal0bfa942: real Controller start eligible, focused observation and delivery receipt accepted. First type `r` returns unknown; runtime cleanup quarantined, outer cleanup succeeds, same app preserved. |
| native8 | r8f | Diagnostic subclass calls unchanged production backend, tees guardian event queue without consuming/changing events. Selected receipt has keyboard=true, text=false, keymap_format=none, keymap_layouts=0. Begin then closed reason=invalid-command, exit2. Raw exception `WaylandGuardianError: wayland_guardian_input_path_lost`. No successful task. |

Native8 concrete blocker is absent guardian keymap, not an inferred portal timeout
or modifier-change event. Full exception/event evidence lives in
`/home/odin/tmp/r8-composed-native8-20260907/composition.jsonl`. The first
`T 72` command is refused because `g.keymap` is absent. Do not replace the keymap
with a fabricated US layout or waive the modifier/scope protections. Parent owns
runtime fixes. Portal deadline followup f9df52b is ready for a final image rebuild.

Native7/8 standalone and exact-container cleanup revalidated 2/2: no owned
residuals, no new helpers, no signals, absent owned cgroup, complete baseline/final
census without errors. This is outer isolation cleanup, **not** successful
production detach: the runtime correctly reported quarantine and unverified
release. Both same Inkscape PID/start identities remained alive before outer
container teardown. Native7 live checks passed2/2; native8 passed1/1.

Diagnostic harness focused Ruff and diff-check passed. Evidence-verifier suite
remains **10 passed**,0.44s, supervised exit0/cleanup true:
`/home/odin/tmp/r8-composed-unit5.log` and `r8-composed-unit5-owned.json`.
No SVG or post-save screenshot is claimed for these failed attempts.

Each of these is an **exit1 application failure**, not a successful task. Native1
identified a true integration mismatch: probe case-insensitive `libGL` regexp
also selected lowercase libglib while real runtime used case-sensitive basename
prefixes. Probe agent corrected its selector to the runtime predicate, including
regression coverage, in final probe commit4e71e05. Supplied expected mappings
still undergo exact object/hash checks; no qualification evidence was forged.

Native4's diagnostic is an independent fixture-only extension with no D-Bus
export, input or gate mutation. In a stable normal native Inkscape window:
`mode=user`, `overview=false`, `animation=false`, `modal=0`, `stage=null`,
`bannerBinVisible=true`, `banner=false` (actual `_banner` is null). Only Inkscape
remains in window stacking. GNOME's empty container visibility incorrectly trips
the production gate. Parent corrected this narrowly in77fad9a. Native5 instead
exposes a new probe telemetry failure on the later parent snapshot. This remains
recorded; parent is correcting the GI import refactor. An unchanged rerun would
not establish anything further. Next harness also uses ComputerController and
ComputerStore, including the real delivered-observation gate (fixture renderer
acceptance, not an actual model or Discord delivery).

**Current parent integration blocker after native6:** `validate_profile` in
`src/computer/app_profiles.py` still hard-codes X11 for attached-only Inkscape
and Writer, and `application_profile` line16 also refuses all Wayland offerings.
Actual ComputerController catches the former before constructing runtime
authority. The harness must not bypass these gates or mislabel Inkscape as Xed.
Parent owns app offerings; a narrow legitimate Wayland/Inkscape provision and
tests are required to continue. Image r8e contains portal0bfa9428, current typed
runtime with injected=True, actual qualifier GI import correction and banner fix.
Runtime composition cannot substantiate usable public API while this gate fails.

Image manifests and actual source/guardian SHA256 inventories are in each root.
Native4 uses the current parent runtime snapshot, not only the initial runtime
agent commit. Native1-3 used the original runtime snapshot. These differences
must remain attached to the corresponding results.

## Evidence verifier

`r8-composed-evidence.py` requires actual eligible same-stack startup, all four
production GUI action receipts, completed runtime cleanup, a GUI-saved SVG with
a nonzero rectangle and matching recorded SHA256, a decodable final screenshot,
and no exact-owned process/cgroup or new helper residuals. It refuses any logged
failure. Unit data are labelled fixtures and are never supplied to the qualifier.

First verifier suite: **8 passed**, 0.42s, command exit0 and standalone supervisor
cleanup true. Log `/home/odin/tmp/r8-composed-unit1.log`, receipt
`/home/odin/tmp/r8-composed-unit1-owned.json`. This is verifier testing only,
not successful application proof.

Latest controller-aware verifier suite: **10 passed**,0.41s, command exit0,
cleanup true, no residuals or signals. Log `r8-composed-unit4.log`, receipt
`r8-composed-unit4-owned.json` under `/home/odin/tmp`. Focused Ruff for all three
new Python files and git diff-check passed. Full project tests were not run here.

All native1-6 outer commands returned1. Each standalone receipt has
`cleanup_ok=true`, no residuals/signals and complete census; each exact host
cleanup report has no owned process or new helper residual, absent cgroup,
complete baseline/final scan and no census errors. Native1-5 live health checks
passed2/2. Native6 ended before the live check, so the container-running check
correctly FAILED (1/2); its later exact cleanup evidence is separate, not a
retroactive healthy runtime claim.

## Reproduction / continuation

From the qualification worktree, build with these contexts (no deploy paths):

```sh
docker buildx build --load --progress plain \
  --build-context runtime=/home/odin/odin-dev \
  --build-context probe=/home/odin/odin-dev \
  --build-context portal=/home/odin/odin-dev \
  -f scripts/computer-feasibility/r8-composed.Containerfile \
  -t localhost/odin-wayland-composed:r8-next .
```

The actual run must have a NEW evidence directory, bounded standalone outer
subreaper, Docker --init and exact cgroup cleanup. Use the following shape with
unique names (existing outputs are not overwritten):

```sh
python3 scripts/computer-feasibility/owned-test-supervisor-r6.py \
  --deadline 420 --grace 5 --report /home/odin/tmp/r8-composed-next-owned.json -- \
  bash scripts/computer-feasibility/r8-composed-lab.sh \
  --isolated-production-composition localhost/odin-wayland-composed:r8-next \
  /home/odin/tmp/r8-composed-next-20260907
```

Only after an actual successful run may `r8-composed-evidence.py EVIDENCE_DIR`
be used to certify the narrow saved-rectangle task. Currently no directory
passed that verifier before native9. All module/source/image identifiers are
preserved in each directory; build5/r8e must not be conflated with later sources.

## Final native GUI qualification: native9 and native10

Both runs completed with standalone supervisor `primary_returncode=0`,
`cleanup_ok=true`, no deadline, residuals or signals. Both pass the independent
`r8-composed-evidence.py` verifier and exact process/cgroup cleanup recheck.

* **native9/r8g:** all three producer contexts were `/home/odin/odin-dev`,
  HEAD3c36322 plus pre-existing app-profile edits. Working source bytes and dirty
  diff are captured in `/home/odin/tmp/r8-composed-native9-source-20260907`.
  This is not a clean-SHA qualification claim.
* **native10/r8h:** final repeat uses immutable `git archive` of clean parent
  **88c126a644e938bf5975def5fe59ef2598c6398a**, extracted to
  `/home/odin/tmp/r8-composed-native10-source-20260907`. Runtime, probe and portal
  contexts ALL use that frozen snapshot. Producer archive/hash and SHA are
  retained there. Independent comparison confirms all12 recorded `/work/src`
  Wayland source hashes match those exact producer bytes.

The real `ComputerController.session` acquired actual visible portal consent,
real same-stack qualifier admission and authenticated focused observations.
Guardian selected `xkb_v1`, two layouts, `text=true`. `ComputerController.act`
typed `r`, dragged the canvas, sent Escape and Ctrl+S. All four receipts have
`injected=true` and `released=true`. The first three report raster-change
`verified`. Save reports **`not_satisfied` for immediate raster change**; that
does not prove save failure or success. Independent file evidence proves save:
the initially empty SVG becomes1165 bytes with one black `rect`, width103.27023,
height113.59724, x389.32874, y130.12048. Both runs save SHA256
`2b1d458bb33baf0e57c2fe0a8a159132bfa794288e4a995db3af986f6230a2c6`.

Native10 final PNG decodes at1280x900 and matches observation hash
`329ccdd4a3fd692c36288e917e42a392d0aa94f1fc4a561fb07226840ff758ac`.
Independent bitmap check finds all7200 pixels in the rectangle interior crop
at(430,350)-(510,440) black. This is a pixel check, not human visual review.
The image-analysis tool did not return a usable description. Raw screenshot and
GUI-saved SVG remain in each evidence directory.

Controller close reports complete=true, released=true, capture_revoked=true,
input_revoked=true, ei_connection_closed=true, portal_connection_closed=true,
portal_session_closed=true, applications_preserved=true. Native10 independently
confirms the same Inkscape PID234/start393625133 alive after detach, before outer
teardown. Exact cleanup finds no owned residual, no new helper, absent owned
cgroup, complete baseline/final scans, no census or scan errors. A delayed
native10 launch-health assertion failed because the short task had already
exited. Appropriate post-teardown verifier/container-absence/cleanup validation
then passed **3/3**. Native9 live launch validation passed2/2.

Final evidence under `/home/odin/tmp`:

* `r8-composed-native10-20260907/`: composition, screenshots, SVG, image/source
  manifests, process census and exact cleanup.
* `r8-composed-native10-owned.json`, `r8-composed-native10-driver.log`.
* `r8-composed-native10-verifier.json`, `r8-composed-native10-independent.json`,
  `r8-composed-native10-cleanup-recheck.json`.
* `r8-composed-build8.log`, `r8-composed-build8-owned.json`.

No runtime change was needed after the keymap fix; no modifier safety was removed.
No dialog bypass, live desktop, host bus/device, service restart, deployment,
merge, push or pipeline action occurred. Scope remains rectangle creation and
ordinary save into an operator-opened existing document, not arbitrary Inkscape
tasks, save-as, new/open/close/reopen, other apps, or general model-driven work.
