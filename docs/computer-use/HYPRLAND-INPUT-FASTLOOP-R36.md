# R36: native click/release fast loop, candidate 1

## Evidence and diagnosis

The target is running `41f6d501` and the native `HyprlandGuardian` /
`odin-hyprland-input` route. The libei helper's `plost` branch is not this route.
Read-only inspection of Clippy's stored `palette-open-1` receipt found only the
controller's generic dispatch exception result: sent/injected unknown, release
unconfirmed. It does **not** establish a dropped virtual pointer. An earlier
`color-open` receipt on the same head completed all three native steps with
release confirmed, followed by unavailable post-action capture.

Two source-supported reliability defects are fixed in this candidate:

1. A fully received, parsed `ok:false` scope reply incorrectly poisoned the
   connection, exactly like a partial or timed-out response. A renewal refused
   after focus revocation could therefore destroy the channel needed to
   acknowledge cleanup. Refusal still stops input; only the synchronized stream
   is preserved for release. Partial, late, malformed and ambiguous replies still
   poison the stream, with no retry or replay.
2. A three-event click unnecessarily returned through poll/Wayland dispatch
   between motion, press, release, and completion. Already-due events now queue
   together (at most 32 events due at batch entry), followed immediately on
   completion by explicit release and synchronization.
   Every event keeps its compositor-side scope check and pointer frame. Native
   socket pumping occurs between groups instead of every event. Future
   timestamps, pixel-permit barriers, cancellation and input deadlines remain.

Cleanup alone has a bounded 500 ms scope-reply budget after submitting owned
releases, rather than 50 ms. Arm/renew deadlines, the 250 ms scope lease, lock,
quarantine and unknown-outcome policy are unchanged. No plugin changes.

Native failures now journal only allowlisted diagnostics and input/release flags,
so the next failed normal turn can distinguish native completion and cleanup
facts without exposing commands, coordinates, application text or scope tokens.
These changes address concrete source defects; the exact historical trigger is
not recoverable from the generic stored receipt and is not claimed proven.

## Handoff boundary

Candidate for Claudia's protected deployment and normal-turn draw. Rebuild and
install `odin-hyprland-input`; a Python-only checkout would leave the native fixes
uninstalled. The scope plugin source/build identity is unchanged, so no plugin
reload is needed. No deployment, service restart, input, capture, config/data
write, new tests, pytest or CI gate was performed for this candidate. Full checks
remain for the end of the successful live loop. X11 and libei source unchanged.
