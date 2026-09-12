# Hyprland campaign pause checkpoint, 2026-09-12

This checkpoint advances the selected-target startup and known-no-input focus
recovery path. It is **not native runtime qualification**, compositor-restart
recovery, or permission to replay an interrupted action. PR #356 remains a
partial implementation of the broader autonomy plan.

## Integration defects found

The previous component tests did not connect the actual native selection wire
format to the provider, backend and controller lifecycle. Inspection found:

1. Native inventory used a status envelope whose extra fields the provider's
   strict inventory parser rejected.
2. The provider sent integer process start ticks; native focus required a JSON
   string, so legitimate requests failed identity comparison.
3. Focus can itself advance the native revision. Returning that new revision
   violated the provider's original-candidate epoch contract.
4. The controller closed the inventory backend and constructed another backend
   for startup, discarding the provider's private candidate proof.
5. Backend startup compared native selection identity keys with a different
   snapshot identity schema. Focus recovery treated structured output geometry
   as a string instead of comparing the measured geometry.
6. Recovery did not invalidate all old observation state on every failure or
   cancellation path.

The fix must carry only the original private selection proof, maintain exact
compositor incarnation and application/output identity, consume selection once,
and require fresh observation after focus. Refreshing inventory and silently
selecting a replacement is not an equivalent fix.

Known-no-input recovery remains **process/output scoped**, not a proof of the
same original top-level window. A matching native candidate is refocused only
after rechecking the immutable process and output; a fresh observation is then
required. Multiple top-levels from the same process need explicit treatment in
the next recovery design before claiming exact-window continuity.

## Shared-code boundary

The controller selection-proof handoff and observation invalidation were flagged
before editing. Both are inside Hyprland-only paths. All eleven `x11_*.py`
runtime modules remain untouched. Existing owner, host, turn, expiry and
single-use checks remain; channel and request surface also bind selection.

## Isolated lab result

No usable isolated Hyprland compositor was established. Incus was active, but
its existing default ZFS storage pool was **unavailable**. No lab container was
created; the existing stopped container was neither started nor changed.

The fallback used a temporary non-login user, private HOME/runtime directories,
a private Weston headless/Pixman parent and a bubblewrap namespace sandbox.
The sandbox excluded the live X11 display, primary DRM nodes and input devices.
Two no-DRM attempts, including `WLR_BACKENDS=headless`, `WLR_RENDERER=pixman`
and `WLR_LIBINPUT_NO_DEVICES=1`, failed before backend/output initialization.
A separate render-node-only attempt also failed. It did not establish exclusive
GPU ownership or a usable graphics isolation boundary.

The pinned Hyprland 0.55.2 build uses **Aquamarine**, not a wlroots renderer
selector. Its inspected startup code requests headless, optional DRM and
Wayland fallback implementations. Aquamarine's startup allocator path requires
a DRM FD from an implementation and constructs a GBM allocator. Merely setting
the wlroots variables did not change that requirement in this build.

The observed error was `CBackend::create() failed`. Hyprland uses that message
for both creation and startup failure. Internal per-instance logs were empty,
so allocator absence is a source-backed explanation for the no-DRM setup, **not
an experimentally isolated diagnosis of every failure**, particularly the
render-node attempt. No application, plugin load or receiver test succeeded.

The lab binary came from a pre-existing locally modified compositor tree.
Compilation against its pinned headers is not unmodified-release provenance or
qualification. `runtime_qualified` remains false.

### Cleanup and retained evidence

Recorded lab launcher/compositor PIDs were gone; the temporary user and home
were removed and its render-node ACL revoked. The original render-node ACL and
stopped-container state were rechecked. No broad process kills, live desktop
connection, Odin deployment or compositor restart was performed.

Host-local evidence is retained at `/home/odin/hyprland-lab-20260912/`:
`preflight.txt`, `run-isolated-wlr-selector.sh`, `isolation-summary.txt`,
`hyprland-no-drm.log`, `hyprland-wlr-selector.log`,
`render-node-assessment.txt`, `rendernode-startup-observation.txt`,
`cleanup-process-check.txt` and `cleanup-final.txt`.
The archived launcher references the now-removed temporary user/home; it is
evidence for reconstructing the isolated setup, not a ready-to-run installer.

## Next-session order

1. Establish an available **separate** Incus directory-backed pool or another
   explicitly isolated lab. Do not repair unrelated storage or start an existing
   container just to make the test convenient. A container alone does not supply
   a graphics allocator.
2. Establish an allocator-capable parent/graphics boundary without primary DRM,
   input-device or live X11 passthrough. Capture internal Aquamarine diagnostics
   and preserve clean build provenance before claiming a startup root cause.
3. Build the exact pinned helper/plugin tuple and qualify native inventory,
   selection, focus, fresh capture and bounded input with a real receiver.
   Compilation and protocol harnesses are not substitutes for this step.
4. Integrate explicit authorized plugin preparation before target inventory.
   Inventory currently remains read-only, so an unloaded plugin still blocks
   selection; managed activation during startup alone does not solve that cycle.
5. Implement task-continuous compositor-restart recovery and durable output-grant
   handoff, retaining stop fences, new observations and exact trust anchors.
6. Reconcile unknown input release against a surviving ownership ledger. The
   existing bounded lost-ACK query is not a durable ledger or receiver proof.
   Never restart input or replay a stroke on an unknown release outcome.

The previously archived recovery coordinator remains unintegrated and is not
being added as dormant production code. Its callback state machine alone does
not implement the native ownership, authority transfer or stop guarantees.

## Verification

Final commit, test results and hosted gate evidence are recorded in PR #356.
This document distinguishes the intended integration repair from native runtime
qualification; the latter remains explicitly incomplete.

The native selection contract harness extracts the production candidate
structure, helpers and complete selection methods. It joins those methods to
the production Python provider, with fake compositor objects and transport.
Linux process/pidfd checks remain real. Its 89 cases cover wire types, stale or
consumed candidates, focus-induced revision changes, identity/output mutations
and post-focus state revalidation. This is substantially stronger than the old
standalone JSON fixture, but still does not exercise a real compositor receiver.

The full pinned native bundle compiled locally at header commit
`39d7e209c79d451efab1b21151d5938289da838d`. The default `-Werror` build stopped on
upstream-header `unused-parameter` and `missing-field-initializers` warnings;
the lab compile succeeded with only those warning classes demoted. Build-script
defaults were not changed. The plugin ELF SHA-256 is
`bfd85bded93c2caf8072bf4278e9976ef94f3ca3355ec73fc873f502db1410db`, under
`/tmp/odin-hyprland-20260912-build/`. The source-derived companion build ID and
manifest were independently checked; the manifest still reports
`runtime_qualified: false`. No helper or plugin was installed or loaded.
