# R5 main-session testing: scratch Xed save and exact restoration passed

## Final acceptance, 2026-09-07 05:55 UTC

The production attached backend and controller completed a real task on the
authorized main X11 session: type a unique note, open Save As, enter a new private
absolute path, save, and independently compare the exact file bytes. This was a
deterministic development driver, not the deployed bot or a model-planned task.
The separate isolated real-model GUI result is in MODEL-GUI-R5.md.

Evidence: `/tmp/r5-main-xed-short-absolute.log`, private journal
`/tmp/cu5-g2dpl7co`. Driver PID3705963 exit0,31seconds. Exact saved artifact SHA256:
`d633fd3ab5ed747fe269cf4539c709af9c5159d5445f7478380e986744adce8a`.
Five actions: type verified, Ctrl+S verified, Ctrl+A not_satisfied (no measured
raster change), type verified, Return verified. The artifact assertion, not those
visual receipts, proves the saved text. No uncertain input was replayed.

All cleanup stages passed. Serialized before/after metadata compares byte-for-byte:
four-monitor RandR topology/modes/transforms, seven pre-existing clients and their
geometry/states/stacking, focus, active client, workspace, pointer and keymap.
DP-4 remains the3440x1440 primary and all monitors remain off. No wake was needed.
Only the newly gated scratch Xed and private bus were terminated; their private
HOME and scratch artifact were removed, screenshots purged, controller closed.
Independent validate_action verified the exact metadata files, absence of scratch
HOME/driver, four monitors, primary, off state and idle active-client state.

### Preserved later failures before the passing run

- `/home/odin/assisted-session-r5-l5myxem8`: UID1000 could not traverse the service
  user's home, so private bus launch failed before desktop effects. The helper now
  creates a unique private /tmp directory and grants traversal only there.
- `/tmp/assisted-session-r5-4wwfgwqq`: typing passed, Ctrl+S returned unknown. The
  original receipt does not identify its cause. Scratch cleanup initially left
  the desktop focused rather than the original nonclient WM focus. The exact
  recorded focus identity was independently checked and restored; full RandR and
  window metadata then matched. Subsequent cleanup performs that bounded identity-
  checked focus restoration before comparing derived FOCUSED state. No WM active
  property is forged, and no hidden application is activated.
- `/tmp/assisted-session-r5-urnje4kj`: four fresh pre-input observations all changed
  before dispatch; no input sent. Exact session restored.
- `/tmp/assisted-session-r5-bpil3ftu`: long absolute filename typing returned unknown;
  no replay. No causal native receipt was retained, so lease expiry is not claimed
  as its established cause. Exact session restored.
- `/tmp/assisted-session-r5-w8vwu8f3`: short basename input completed, but expected
  file was absent. The helper had assumed the chooser's starting folder; that was
  invalid. Exact session restored. Final run uses an explicit short absolute path.

The helper's73 focused tests now include idle WM focus, immutable hidden/sticky
clients, independent cleanup failures and unchanged-client preservation. This
final evidence supersedes the earlier pending-input conclusion below, without
erasing its failed attempts or the earlier topology-restoration evidence gap.

Aaron's explicit overnight scratch-only permission was used. No existing document
was edited, saved or closed; no terminal or Odin WebUI input was sent. The product
was not deployed and the live Odin process was not restarted or modified.

## Historical checkpoint: attempts and observed results before final acceptance

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
