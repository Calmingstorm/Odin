# Native Krita runtime verification, 2026-09-14

## Final result

The patched production ComputerController and Hyprland backend attached to the existing Krita process, captured native pixels, dispatched a new bounded 0.6-second three-point brush stroke, and closed cleanly. The resulting connected black check mark was visually inspected in the returned native screenshot.

- Actual output: HDMI-A-1, 1920x1080. Configured fallback was DP-3; selected-target authority correctly used the window's existing output.
- Guardian: all 5 planned steps completed; input sent and release confirmed.
- Raster path: 1600/1600 path pixels changed, coverage 1.0, all 8 interior samples changed.
- Native plugin: zero rejected events; unarmed, zero held keys/buttons after cleanup.
- Controller close: state closed, cleanup complete, applications preserved.
- Compositor PID/start/signature unchanged.
- All four pre-existing windows retained original PID, geometry, workspace, monitor and tiling state.

The stroke remains in a new unsaved test document. No existing user document was overwritten.

## Fixes

Runtime startup rejected successful focus replies because two optional diagnostic booleans were not accepted by its strict schema. That scope exception was mislabeled as an unexpected start failure. Runtime fixes preserve the real static reason, expose actionable recovery guidance, distinguish model deliberation from the short native input lease, and truthfully report pre-arm cleanup and native release acknowledgement separately from action success.

The canvas blocker was independently proven with a read-only hit-test diagnostic: Krita's canvas leaf was a mapped good same-client wl_subsurface whose parent was the exact selected XDG root. The former popup-only destination admission rejected it. The new snapshot captures bounded exact subsurface ancestry, layout and lifetime, without invalidating ordinary paint-content commits.

Commits:
- c0dcad8f: runtime attach and actionable error handling.
- d7a5e4b4: native subsurface target support.

Shipping plugin SHA256:
`8bc303fb49695f3f4f2dd93a61492d9b0aae523700e0140695360f4631525a63`

Shipping companion build identity:
`cd9a146f6844cecf36af013effa9b1621b7565459f478de8852ce395911e3ad3`

Built with the repository shipping script against the target's Hyprland 0.55.2 headers. The running plugin was replaced with this fixed build. No compositor restart or destructive scenario was performed. The first replacement attempt used the resolved path while Hyprland had registered the symlink spelling; it did not unload the original and duplicate load was refused. The second used the registered spelling, verified removal, then loaded and verified the fixed image. No input occurred during replacement.

The target bot service was restarted once after the runtime test to import the Python fixes. The replacement process logged into Discord; HTTP health returned status ok and WebUI returned 200. config.yml checksum remained unchanged. At that checkpoint, the remote deployment checkout HEAD was intentionally not changed; source edits were present on disk and required normal clean-deploy reconciliation with the committed branch. This historical report does not establish the current deployment state.

## Scope and limitations

This was a real production controller/backend path with a separate private diagnostic durable store, not a Discord message turn inside the running bot process. The production bot was then restarted with those same Python files and verified connected. A subsequent ordinary Discord drawing request was not observed in this task.

The earlier failed stroke was not replayed. The successful stroke used a new action ID, a new session and a freshly inspected frame after the code change. Native release acknowledgement remains cooperative best-effort, not universal receiver-release qualification. runtime_qualified remains false. Full CI and coverage were deferred; targeted checks, imports, native compilation and live runtime verification were performed.

The operator scope plugin was originally requested to stay loaded. Final verification required replacing that plugin; this deviation is recorded explicitly rather than claiming the original artifact stayed loaded. No claim of uninterrupted plugin identity is made.

Private evidence is retained in an operator-controlled runtime-fix archive; its host and absolute path are intentionally omitted. Do not publish the durable test stores, which contain owner capabilities. Sanitized screenshots, receipts, diagnostics and patches were attached separately.
