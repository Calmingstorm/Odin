# Hyprland native input: R32 build and qualification record

## Contract

R32 supersedes the full mixed-source/guardian-SIGKILL guarantee that stopped
R30/R31. Hyprland input is explicitly **best-effort**, not equivalent to the
qualified GNOME/KWin release contract:

- An abrupt hard kill of the last input guardian may leave owned input held.
- Releasing an Odin button can clobber the physical user's simultaneous hold of
  that same button. Ordinary cleanup does not promise source-selective aggregate
  pointer state on stock Hyprland.
- Cooperative cleanup, process termination, protocol roundtrips and native
  companion acknowledgements are distinct from application-receiver evidence.

The implementation must handle graceful exit, controller loss, transport loss
and expiry with bounded owned-input release. It must not use these accepted
residuals to excuse stale-frame input, lock/unknown-state input, unbounded input,
automatic replay, or effects outside the observed application/output.

The native companion may be loaded explicitly once during setup. Hyprland can
re-read its configuration on plugin load/unload. Installing artifacts does not
activate them, add autostart entries or edit the operator's compositor config.
Recovery is explicit, infrequent, and never silently resumes a task.

## Scope and sequencing

The new route uses explicit-output screencopy-v3 and native virtual-pointer /
virtual-keyboard input with compositor-loop scope checks. It does not use portal
capture as a fallback for Hyprland. Existing X11, GNOME and KWin routes retain
their admission policies. Other-compositor refusals remain separate.

Phase 4 follows the completed build and bridge handoff. The operator performs
the branch deploy with configuration and data protected, then supervises the
bounded draw-in-Pinta test. A successful build is **not** a native safety-corpus
pass or proof that drawing works on the target.

## Validation record

Before this round's code was integrated, the existing computer suite at
`f8ffb096` completed with **3,562 passed, 166 warnings, exit 0** in 187.01 seconds.
This is a baseline, not validation of the new Hyprland implementation.

## Delivered implementation

- Explicit `wayland_backend: hyprland` runtime/configuration route. Native
  identity, output, executable trust and helper paths are operator-controlled;
  no ambient output selection or portal fallback.
- Native VP/VK guardian with owned state, parent-death/EOF/signal/expiry cleanup,
  a nonrenewable two-second action lease and refreshed short scope evidence.
- Exact-ABI compositor companion, privately authenticated by kernel peer
  credentials. Event-loop hooks check input destination/focus/geometry, lock,
  DPMS and topology. Absolute monotonic deadlines prevent delayed renewal from
  restarting the freshness budget.
- Native screencopy-v3 observations, orientation/crop transforms, source-local
  action mapping, post-action evidence and conservative interruption without
  replay. Receipts distinguish input submission, cleanup acknowledgment and
  unmeasured receiver proof.
- Hyprland-only best-effort capability/status, administrator release control and
  standalone recovery when the controller is gone. Successful recovery still
  requires renewed consent and observation.
- Inert optional helper installer/package definition and rebuilt operator UI.
  The headless base does not acquire a Hyprland dependency or activation hook.

Operator installation, explicit setup/recovery and initial capability limits are
in [HYPRLAND-OPERATOR-R32.md](HYPRLAND-OPERATOR-R32.md). In particular, this initial
native route is not a promise to control XWayland apps, ambiguous/parented modal
surfaces or characters absent from the owned virtual keyboard map.

## Recorded checks after integration

- Native guardian and capture helper compiled locally with strict warnings.
- The complete guardian/capture/plugin bundle compiled on the unchanged target
  against Hyprland 0.55.2, exact header/API commit
  `39d7e209c79d451efab1b21151d5938289da838d`. This included the absolute-deadline
  correction, not an earlier individual-plugin compilation.
- **19 native wire tests passed**: 12 actual-C-helper/fake-compositor cases plus
  seven joined Python-wrapper/native-helper cases. Includes repeated actions,
  a 650 ms stroke with renewals, rejection receipts, cancel/EOF/SIGTERM,
  controller death with stdin still open, blocked stdout, expiry, failed release
  and delayed reply poisoning. These are not a real compositor/receiver corpus.
- The shipping C++ deadline rule compiled with delayed/stale/overflow boundary
  assertions. Companion source-contract tests passed; those are not native
  plugin execution.
- Actual target artifacts passed inert installer staging, expected file modes
  and byte comparison. An nFPM package was not built or installed.
- Lint/type no-new gates and configuration classification passed. The type gate
  retains two unrelated baseline findings and adds none.
- Operator browser check passed; 47 Vue templates and 263 callable bindings
  checked; production UI build passed. Existing bundle-size warning remains.
- Dependency lockfiles are unchanged. `npm ci` reported four existing audit
  findings; this round does not claim dependency-audit clearance.

The first broad suite found six inventory/documentation integration failures
(new API route, schema count, shipped links and native spawn classification).
Those were corrected and their focused checks passed. Final broad-run completion
is recorded below; earlier progress is not a successful suite result.
