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

The subsequent complete suite finished with **15,880 passed, six skipped,
1,018 warnings, exit 0**, in 730.10 seconds, with the native wire binary enabled.
Existing asynchronous teardown/unawaited-coroutine diagnostics remain; this is
not a warning-free result. The final native transport suite also passed on the
target in private scratch: **12 passed**, without contacting its compositor.
The Pages build initially found a missing operator-page allowlist entry; that
was fixed and the complete VitePress build then passed with dead-link checking
still enabled. Hosted coverage remains a separate CI result, not established by
the ordinary suite or these local gates.

## Phase 4 handoff

**Build ready for config-protected branch deployment and supervised native
qualification. Not live-qualified and not a release approval.**

No live desktop input, virtual-device creation on the live compositor, plugin
load/unload, compositor reload, Odin deployment or service restart was performed
in R32. Native builds/tests stayed in private scratch; the installed configuration
and data were not edited or checked out. Both configuration hashes, service and
compositor process identities, restart count and device-inventory digest matched
the preflight record. Pinta's measured geometry was unchanged. Another existing
window's geometry differed between snapshots; no input was sent by this work,
and the observation is not attributed to a cause without evidence.

The supervising operator must back up, protect/restore and verify `config.yml`
and `data/` before the branch deploy. Load the exact-ABI companion once at setup,
verify the disclosed capabilities, then perform the bounded Pinta draw and check
receiver behavior and input cleanup. No source/fake-wire result replaces that
last stage. Keep the standalone recovery command available throughout.

## Phase 4 execution update: qualification exposed a receiver defect

The later continuation performed the protected branch deployment on the target,
not on the local Odin installation. Both pre-deploy snapshots preserve the
operator's exact configuration, live data and local changes. Data manifests were
verified while the service was stopped before restart; runtime writes after
restart are not misreported as data loss. The original configuration bytes were
restored and verified, with no computer configuration silently persisted.

The target needed `dbus-next`; it was installed into that install's virtual
environment. Native helpers were installed inertly, then the exact companion was
loaded explicitly. A later recovery unload/load applied a focused motion-frame
fix. Both compositor configuration hashes remained unchanged and its process
survived. These setup/recovery rereads are the R32-approved exception, not
per-action activation.

The native backend started with input support, captured the explicitly bound
output and accepted bounded Pinta strokes. **The initial and repeat strokes
painted only a straight start-to-end segment, not the intermediate mountain
vertices. Live drawing qualification therefore did not pass at that point.**
Receipts correctly described submission/cleanup, but were not proof of the
intended shape. The delivered screenshots were inspected rather than treating
changed raster hashes as semantic success.

Pinned source has no seat frame at the end of `onMouseWarp`, while generic
virtual-pointer frames are ignored without pending axis state. A narrowly owned
frame completion was added and compiled, but the same live endpoint-only result
persisted. That change alone did not solve the observed defect. An isolated
real-wire timing test then confirmed all five coordinates arrived at the peer
over 650 ms, each with a distinct timestamp and following frame. The remaining
diagnostic boundary is downstream compositor-to-application delivery.

Every probe was closed with a cooperative cleanup ACK; explicit standalone
release recovery was also exercised successfully. The native ledger reported
zero keys/buttons and no active lease. No guardian remained. Existing human
marks and unsaved Pinta document were preserved. Human focus/tool changes caused
several pre-input interruptions, not automatic replay or unsafe continuation.

Hosted ordinary tests passed. Hosted coverage reported two new-file threshold
failures, now addressed with meaningful cancellation/recovery tests: targeted
statement coverage is 100% for the guardian wrapper and 95.57% for scope, with
66 targeted tests passing. A later hosted run remains necessary for final CI
status. **Do not interpret the earlier build-ready handoff as successful live
qualification.**

## Phase 4 final result: bounded Pinta draw and cleanup passed

The receiver defect was resolved and **the actual supervised Pinta draw now
passed**. The successful run rendered every vertex of a two-peak mountain in
650 ms, then a separate closed eye/diamond in 450 ms. Inspection showed both
complete shapes, no unwanted connecting line, and the surrounding existing
marks preserved. The unsaved document remained open. A later independent stroke
is evidence of usable released input, not merely a successful helper exit.

The apparently ineffective frame fix had not actually replaced the running
image. `/proc/<compositor>/maps` still referenced the old deleted plugin inode,
while the on-disk hash was new and the expected diagnostic operation returned
`unknown-operation`. GNU-unique symbols were present. Loading an immutable
versioned pathname established the new image and diagnostic operation; only
then did the complete mountain render. Thus disk-file hashes and an `ok` reload
reply were insufficient to verify this plugin update. No compositor restart or
core patch was required. The setup/update guidance must verify the loaded build,
not overwrite an existing mapped pathname.

A bounded target-only native protocol trace recorded the second shape's nine
motion events, each followed by a frame, plus button press/release. It recorded
surface-local coordinates only during owned dispatch. The trace is compositor
emission evidence, not proof of application processing by itself; the inspected
Pinta raster supplies the application-side evidence for these particular draws.

Final native status: disarmed, zero owned keys, zero owned buttons, no failed
release, cooperative ACK true. Guardian process reaped, owned virtual devices
gone; the pre-existing virtual input devices remained. Explicit operator
release-all was verified again. Both target configuration files retained their
original bytes. Pinta and the other original application processes remained
alive. During the campaign the human also edited the same Pinta canvas and
changed focus; those human marks were not attributed to Odin or removed.

The target Odin service was restarted **twice deliberately** for the protected
branch deployments. Its automatic restart count stayed zero; that is not a
claim of zero service restarts. The compositor process remained unchanged.
The local live Odin installation and service were not deployed or restarted.

Live actuation accounting: five bounded stroke invocations (three earlier
endpoint-only results and the final two successful shapes), one successful
tool-selection click, and three explicit shell focus selections of the requested
Pinta window. Several pre-input attempts were refused after changed grounding
or unavailable scope. Repeated captures and reconciliation were required; no
claim of optimal observation efficiency is made. The accepted hard-guardian-
kill and simultaneous same-button residuals remain unchanged and were not
deliberately fault-tested on the live desktop.

**Scope of this pass:** config-protected deployment, native backend capture,
timed drawing, actual Pinta output, subsequent interaction, cooperative cleanup
and standalone recovery. This is not arbitrary-app/modal/Unicode qualification,
a proof of SIGKILL cleanup, or a complete live controller/WebUI workflow test.
