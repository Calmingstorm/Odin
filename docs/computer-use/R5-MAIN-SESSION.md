# R5 main-session testing: capture passed, input not established

Aaron's explicit overnight scratch-only permission was used. No existing document
was edited, saved or closed; no terminal or Odin WebUI input was sent. The product
was not deployed and the live Odin process was not restarted or modified.

## Attempts and observed results

1. The initial scratch harness refused before app launch because it incorrectly
   treated NumLock's modifier mask as held input. A read-only query found zero
   depressed keys and zero physical/synthetic held buttons. The harness now checks
   depressed keymap and button bits, not toggle locks.
2. The next attempt woke monitors and created a separate new scratch Xed process
   with a private HOME. Product startup returned `capture_unavailable` before any
   action. The test app exited; evidence was purged. Pointer, focus, active client,
   workspace, client inventory, keymap and input-device inventory matched the
   pre-test snapshot. Monitor topology did not: four monitors became three arranged
   horizontally, and the previously enabled fourth output was connected but off.
   **This was not a leave-as-found pass.**
3. The parent restored the measured four-output layout, primary and refresh modes
   using the operator's pre-existing saved configuration as corroboration. That
   file was read only, not changed. All four active resolutions/origins and primary
   were independently rechecked, and monitors remained off as before. HDMI physical
   millimeter metadata changed after re-detection. The initial harness did not
   capture every pre-existing window rectangle or complete mode metadata, so it
   cannot establish full historical restoration. Do not replace that gap with an
   assertion that absolutely nothing changed.
4. Separate read-only attached-backend start and capture using the system Python,
   explicit display and sudo succeeded with monitors still off:1600x670 PNG,
   676472bytes, zero input sources. No screenshot was persisted or posted; exact
   read workers exited and detach reported capture/input revoked with no devices
   created. This demonstrates that forcing wake is unnecessary for capture.
5. The corrected scratch harness adds durable full RandR/window/process/focus/input
   snapshots, no forced wake, a no-activation private bus, gated exact scratch PID
   ownership and independent restoration stages. Its next real preflight refused
   a pending/current identity-filter-name mismatch before launching any app.
   Read-only evidence found equal identity matrices and empty versus nearest filter
   names; these no-resampling states are now admitted without discarding either
   from the exact final comparison.
6. The subsequent read-only preflight found `_NET_ACTIVE_WINDOW=0` while keyboard
   focus belonged to a non-client window. The harness cannot portably restore
   absence of an active managed client after focusing a new app, so it refuses
   before effects. ScreenSaver.GetActive returned false; no unlock or security
   prompt was attempted. Existing managed windows also carried hidden/sticky
   state, which that conservative helper did not yet support preserving. No
   further main-session input test was performed at this checkpoint.

Neither wake-time hotplug/re-detection nor private-bus settings activation was
proven as the cause of attempt2. Both were considered, but the evidence does not
settle that question. Generic `capture_unavailable` likewise does not prove a
particular failure cause. A separate actual UID1003 development-venv launch of the
privileged identity gate passed with empty stderr; no display request was sent.

## Safety and scope

The old attempt created one dead private-bus zombie adopted by the live service.
It was identified as state Z, not a running bus, and was not reaped by injection or
restart. All test-owned live main-session Xed windows/processes were removed; the
live service and historical zombies were left alone. No global process cleanup.

The corrected harness's46 tests pass, including worker/finalizer failures followed
by the remaining restoration steps. These are helper/fake-primitive tests, not
real-main-session input acceptance. Exact same-UID and privileged cross-UID X11
release/application-survival evidence belongs to the disposable runtime corpora.

**Conclusion:** the attached runtime is implemented and privately input-tested,
but this operator's actual session has not yet passed input acceptance. The local
deploy checklist must say so. A human-present test with a new focused Xed document
is the next acceptance step; no background mechanism should bypass this preflight
or silently alter the operator's current desktop to manufacture a pass.
