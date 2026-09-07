# R1 review checkpoint — contracts and feasibility, not Stage 6

Status: **draft engineering checkpoint; not deployable computer use**.
Branch: `feat/isolated-computer-use`, retained from the authorized build. No
master merge, deployment, release, live desktop automation or host package install.
Decision amendments precede their dependent changes. The isolated tier remains
the safe engineering environment of the assisted-session product, not a different
product and not permission to weaken the real-session requirement.

## What is reviewable

- `DECISIONS.md` and `CONTRACT.md`: corrected platform/tier separation,
  multi-source day-one geometry, conservative capture freshness and owned input.
- `geometry.py`, `models.py`, `vision.py`: opaque source/revision/consent bindings;
  exact rational crop/rotation/resize transforms; pixel-center input semantics;
  separate delivered/source/input dimensions; missing mapping denies input.
- The incorrect source 2-million-pixel check is gone. Bounded downsampled 1080p,
  1440p, 4K and 7920-wide source-metadata fixtures pass, alongside readable crops.
  This is **not** evidence of actual multi-monitor capture, selection, or hotplug.
- Existing agent image-stringification repair and serialized native-pixel tests
  remain. Legacy foreground image behavior is covered separately.
- Default-off dispatch compatibility includes same-name skills, empty scopes,
  disabled native rejection, and facade-level emergency-stop authority tests.
- Both feasibility reports include actual versioned results and failed attempts.
  These are not generated-image demonstrations or an input-command exit-code claim.

## What is deliberately unavailable

`ComputerController.act()` rejects `grounded_actions_unavailable`. The public
private-X11 adapter rejects input and exposes capture-only scope. Its legacy
primitive is retained but is not the neutral adapter action entry point. It emits
a new source revision on every capture because the worker has not yet acquired
trustworthy lifecycle epochs; that is conservative invalidation, not hotplug support.

Existing-session attachment is not enabled. An existing-session lifecycle stub
proves the controller chooses `detach` rather than application/session termination;
it is not a working real-session backend. Assisted actions require verified
pointer AND keyboard/focus separation, not only a second cursor.

Previous interrupted UI/API/integration work is preserved as groundwork. The
application does not construct `ComputerIntegration` or register the computer
API routes. The generated live API inventory remains 211 REST registrations,
zero `/api/computer` routes. Operator component tests use a stubbed harness;
they do not prove live wiring. The config UI explicitly says development-only
instead of linking to a nonexistent working panel. Its distribution was rebuilt.

## Important feasibility result: X11 is not assisted-session eligible

See `FEASIBILITY-X11.md` for evidence, versions and reproducible harnesses.

1. XI2 master devices + per-client XTEST really delivered independent pointer
   and keyboard input to separate GTK windows. This was actual application
   telemetry, not an overlay. Human pointer/modifier state stayed independent.
2. **Two entries in the same GTK window share widget focus.** Odin's click caused
   the simulated human's next key to go to Odin's entry; the reverse direction
   misdirected Odin's next key. A second master keyboard does not fix the toolkit.
3. **Abrupt input-client exit left Odin's Control and button held.** Removing the
   owned master cleaned server state without releasing the human's Shift, but
   GTK exited with `XI_BadDevice`. That fails application-preserving detach.

No live session was targeted, and the fatal fixture was not repeated just to get
a cleaner exit code. The wrapper's false-success detection was fixed and marked
as static-validated only. Do not generalize one toolkit trial to every X11 app;
equally, do not advertise safe concurrent same-window work from the earlier
two-process success. There is no silent shared-pointer fallback.

## Remaining gates before layering capability

The Wayland follow-through did obtain genuine UI consent, a real 800x600 RGB
PipeWire frame, matching portal/libei region mapping IDs, and actual native GTK
motion/button receipts. This required a separately isolated simulated operator
to activate the real consent checkbox/Share button; no portal reply was faked.
The earlier Start timeout is superseded for that stack. See `FEASIBILITY-WAYLAND.md`.

- Wayland independent-human pointer/focus coexistence, keyboard/grabs/cancellation
  and Xwayland receiver evidence. One native receiver and an EIS device named
  "shared virtual pointer" establish neither independence nor universal failure.
- A safe X11 cancellation/disconnect device lifecycle and explicit handling of
  toolkit shared widget focus. Per-app limitations must be observable and denied,
  not papered over with pointer restoration or broad key releases.
- Real multi-source capture with source-selected coordinates, lifecycle epochs,
  scaling/rotation changes, input-region mapping and bounded native allocations.
- Buffered-frame clock provenance: current synchronous capture timestamps are
  labelled request-start lower bounds. Old buffered frames cannot inherit them.
- Purpose-built observation transport, request-bound authority wiring, action
  receipts/postconditions/reconciliation, real operator controls, and the Stage 6
  task/recovery corpus. No claim that passing contract tests completes these.
- Existing private launcher profile needs its own runtime verification: fixture
  work needed compatibility changes (no procfs/GLX; namespace details in report)
  which were deliberately NOT copied into production groundwork unreviewed.

## Review fixes already incorporated

An independent read-only review reproduced falsely fresh capture timestamps:
response arrival time erased processing delay. The controller now stamps the
request before awaiting a fresh synchronous capture, labels the lower bound,
rejects expired arrivals and rechecks both observations after verification waits.
Immutable frame metadata is serialized freshly, and coherent same-size source
replacement now exercises the binding comparison rather than only malformed scope.

Standalone worker imports were also checked independently of package imports.
The private `runtime` package no longer eagerly imports the controller adapter,
which had broken direct-file launch imports. These checks launch no desktop.

## Validation ledger

Initial full suite: **12,104 passed, 5 skipped, 6 failed**. The six failures were
schema/path counts, missing new state-path relocation and process-spawn accounting,
and generated reference source-line drift. All six were fixed and their focused
tests passed; they were not dismissed as flakes. A second run loaded the codec
before its new process-local field classification was patched and found that
single census failure; the focused census rerun passed. The final frozen-source
full suite at `6fc45f2` completed with **12,114 passed, 5 skipped, zero failed**
in 574.22 seconds. It still emitted 843 warnings and pending-async-cleanup
diagnostics at process exit; test success is not a claim of warning-free output.

Focused computer/agent-image coverage: **268 passed**. Worker direct-file import
and codec tests: **22 passed**. No native desktop was started by these suites.

Local `npm run check`, including the existing live-log/browser regression checks
and distribution rebuild, passed. Separate operator-view stub browser checks
passed. Type and lint gates against base `d5fc7eb` report **zero new findings**.
Keep real graphical results, stubbed UI checks and pure contract tests distinct.
