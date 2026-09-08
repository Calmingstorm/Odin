# R13 stock attached X11 composed qualification

Status: **FAILED**, not release-qualified. Source F1 `830477a5` integrated as
`2acebf15` on top of F3 readiness/monitor selection. Harness
`tests/harness/x11_r13_composed.py` uses actual ComputerController, attached capture,
native guardian, session lifecycle, and ordinary Xed. The recording subclass only
records the original start exception; no replies or gates are changed.

## Isolation and evidence contract

Run ONLY below the root `scripts/computer-feasibility/owned-test-supervisor-r6.py`
with a finite deadline. The fixture provisions a new high-number authenticated
Xvfb, private HOME/XDG directories/bus, UID65534 Xed/Openbox, and exact child
teardown. No workstation display, installed Odin runtime, system dependency,
sudoers change, or service restart is involved. All dependencies already existed.

Stock XI2 census must have six devices: the core master pair, core XTEST pair,
and synthetic Xvfb mouse/keyboard. No Odin master is precreated. No setxkbmap,
keyboard remap, cursor-blink setting, or post-setup direct application input is
used. A separate Python-Xlib connection reads XI hierarchy and the core pointer.
Every controller action must leave the original six identities/attachments intact
and the core pointer at (950,650). Final Stop must restore that exact census.
Xvfb's synthetic slaves are not actual workstation hardware qualification.

Seven real actions click the editor, type two ASCII lines, open Save, enter a
scratch path, and save. Exact saved text, including final newline, is asserted:

```text
Stock controller note 123
Independent pointer and clean Stop
```

The click's unchanged raster is honestly `not_satisfied`; injection/release is
acknowledged, not claimed to establish a semantic click effect. Six keyboard/save
actions in runs5/6 reported verified raster change, with matching Xed provenance.
App preservation checks wait 750ms after Stop and exclude zombie state, then the
fixture checks the exact Popen child after the controller process exits.

## Findings

1. **UID1003 runtime_sudo fails with the actual current privilege policy.**
   `/tmp/cu-r13-composed-4/result.json` records start_unavailable. The native cause
   is empty lifecycle-worker identity stdout (JSONDecodeError). An independent
   `sudo -n -C 10 -- /usr/bin/true` exits1 with `you are not permitted to use the
   -C option`. F1's memfd inheritance requires an unprovisioned sudo policy.
   No policy was modified and the harness does not bypass identity rules.
2. **Already-root controller reaches real input, but Stop kills Xed.**
   `/tmp/cu-r13-composed-6/result.json` records all seven native actions and exact
   saved content, stable core pointer, original physical/core attachments, and
   Stop claiming `applications_preserved=true`, `owned_devices=removed`, complete
   release/restoration. Xed is a zombie by the delayed assertion; the fixture
   records exact application exit1. `/tmp/cu-r13-composed-6/xed.log` reports
   `XI_BadDevice (invalid Device parameter)` from XInputExtension minor42 after
   Stop. Therefore the application-preservation claim is false despite successful
   owned-master removal. This is reported to the production lifecycle owner.

Both runs have supervisor `primary_returncode=1`, `completed=true`,
`cleanup_ok=true`, no residual descendants, direct children reaped and X socket
removed. This is a failing native integration with clean test teardown, not a
passing application qualification.

Runs1/2 failed fixture configuration (explicit monitor list/private store parent).
Run3 first exposed the sudo lifecycle failure; run4 added original exception
recording. Run5 completed controller input and Stop but its immediate
`/proc/<pid>` existence check mistook the unreaped Xed process for preserved;
the outer fixture correctly failed when Popen returned1. Run6 strengthens the
assertion and records the fatal X error. Run5 is **not** a pass.

## Reproduction

Use unused report/output paths and the existing development interpreter:

```sh
sudo -n /tmp/cu-r10-dev-venv/bin/python scripts/computer-feasibility/owned-test-supervisor-r6.py \
  --deadline 130 --report /tmp/cu-r13-composed-new-supervisor.json -- \
  /tmp/cu-r10-dev-venv/bin/python -B tests/harness/x11_r13_composed.py \
  --output /tmp/cu-r13-composed-new
```

That tests real UID1003 runtime_sudo. Add `--root-controller` only for the separate,
explicitly privileged native path; it is never proof that runtime_sudo works.
Inspect both result.json and fixture.json plus the supervisor report. Passing
only the inner controller report cannot satisfy the fixture qualification.
