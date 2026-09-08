# Full controller X11 evidence, R11

## Parent integration recheck

At integrated source `5f1bbd9`, the same complete 15-action harness passed again:
`/tmp/cu-r11-parent-e2e/result.json` and `/tmp/cu-r11-parent-e2e-owned.json`.
The supervisor completed with exit 0, cleanup_ok=true and no residual descendants.
Core cursor remained (950,650), native held-key/button sets were empty, Xed stayed
alive after Stop, and topology change rejected the old observation. This is
disposable-stack evidence, not a new real-workstation test.

The multiline mismatch recorded below was fixed by `5f1bbd9`: Return/Tab resolve
through the existing native keymap, with unit tests for mixed Unicode/multiline
text. The actual task still used an explicit Return call. Legacy fake-pointer
and admission fixtures were repaired separately; no test exclusion was added.

## Popup item selection correction

The audit correctly distinguished run8's open/Escape dismissal from choosing an
item. `/tmp/r11-popup-live3/result.json` now proves actual **Select All** activation
through the unchanged controller/native input path, in disposable Xvfb `:1`.
The separate root-child override-redirect Xed menu is at `[751,148,167,254]`, has
the application's authoritative XRes PID and `WM_TRANSIENT_FOR`. Click `[906,329]`
lies outside the original app extent ending at x860. Subsequent typing replaces
the entire document; saved/reopened UTF-8 content is exactly `Menu-selected café`
plus one newline. Thus this is selection, not merely dismissal or changed pixels.

Sixteen actions acknowledged injection/release with Xed provenance; fifteen
visual-change receipts verified, and short-document scroll correctly reported
not_satisfied. Core pointer remained `[950,650]`, held keys/buttons were empty
after Stop, application stayed alive until fixture teardown. Stop fully revoked
capture/input. `/tmp/r11-popup-live3-supervisor.json` records exit0,
cleanup_ok=true and no residuals; direct fixture children were also reaped.

The small scope correction reuses existing snapshot validation for the actual
owned-pointer hit, allowing focused/transient-family or authoritative same-process
targets. Denied metadata, allowed surface types, descendant PID checks, transient
family provenance, actual target bounds, source bounds and final target/focus
snapshots still apply. No native target IDs are accepted from public input.
The guardian allows source-bounded pointer movement beyond the focused rect but
resolves/gates the actual hit before button-down. Existing focused-rect drag bounds
remain unchanged: a held move must not gain broader authority from this fix.
Lease and release code is unchanged.
Attached source-local/crop transforms needed no change.

Final targeted checks: **146 passed**, including 14 new popup cases and guardian
outside-focused-rect/callback and unchanged drag-bounds regressions; changed-file
Ruff and diff-check passed. Unit supervisor `/tmp/r11-popup-unit4-supervisor.json`
records exit0/cleanup_ok=true.
Runs1/2 failed before popup input at the controller's raster-exact gate, with
visual_target_changed; neither is counted as passing. Run3 uses explicit small
delivered crops for pointer targets to exclude unrelated changing pixels, without
relaxing raster validation. OCR reads the delivered menu image to identify Select
All's row. No post-setup direct injection, gate bypass, :0 operation or deployment.
This is ordinary Xed menu qualification, not exhaustive popup or cross-process
portal qualification; the parent suite/release gates remain independent.

Final-code rerun `/tmp/r11-popup-live4/result.json` also passed all sixteen actions;
`/tmp/r11-popup-live4-supervisor.json` records exit0, cleanup_ok=true. This rerun
includes the explicit preservation of existing polyline bounds.

## Final full-action result

Run8 passed the COMPLETE controller/native/Xed task, including independent
double-click, right-click/context menu, Escape and scroll, in addition to all
keyboard/document/topology/Stop steps below. Source: c63d9ba (native495e00d) plus
independent-pointer fix25c78d5. Artifacts `/tmp/r11-controller-8/result.json` and
`/tmp/r11-controller-supervisor-8.json`: passed=true, primary exit0, cleanup_ok=true,
no residuals. Fifteen actions retained Xed provenance and acknowledged injection
and release. Fourteen raster-change receipts verified; scroll correctly reports
not_satisfied because a two-line document cannot visibly scroll. This proves
scroll injection/release, not scrolling a long document. Core cursor stayed950,650.

The source fix uses native query_pointer(windowid) on the existing identity-pinned
client/master and passes it into AppScope's existing child-descent hit test.
Coordinates, target ancestry, per-child PID and final snapshot checks remain.
It does not move the core pointer or change AppScope's focus connection.
Two regressions prove independent success and rejection of wrong coordinates,
foreign descendants, missing target and changed/denied final snapshot.

Recorded checks: scope plus native safety58passed; changed-file Ruff passed;
git diff-check passed. A broader historical native-device/guardian suite FAILED:
old guardian fakes lack the new callback, and old native fake display pointers
reach new endpoint-keymap ctypes code and segfault. Supervisor recorded -11 and
cleanup_ok=true in `/tmp/r11-pointer-regressions1.json`. No full-suite success is
claimed; fixture reconciliation remains separate parent work. Real run8 completed
before that suite and its success is independent of those test-double failures.

## Passing actual GUI task

`tests/harness/x11_r11_controller.py` runs real ComputerController -> attached X11
backend -> capture worker/topology watcher/native guardian/injector -> ordinary
Xed. The recording subclass calls super().act unchanged and only retains replies.
No application allowlist, fake backend, bypassed gate or direct post-setup input.

Run 7 at source 7dc35c1 (bb8cf02 plus ac42d8b) passed. Artifacts:

* `/tmp/r11-controller-7/result.json`: passed=true, complete observations/native
  and public receipts, provenance, topology and Stop assertions.
* `/tmp/r11-controller-supervisor-7.json`: primary exit 0, cleanup_ok=true, no
  residual descendants. Direct GUI children were explicitly reaped as well.
* `/tmp/r11-controller-7/controller-note.txt`: saved UTF-8 file, exact assertion.
* `/tmp/r11-controller-7/reopened-document.png`: reopened document; independent
  Tesseract inspection also found Controller evidence café and the second line.
* Same directory: type-note.png (850x600 crop), before-topology.png and
  after-topology.png plus all pre-action delivered frames.

The session starts without app; factory receives None and public grant app=null.
Actual measured capabilities report independent pointer/per-window keyboard.
Xed PID/executable/window provenance persists in all eleven action receipts.
All observation images go through normal controller delivery validation.
An 850x600 crop at (10,10) precedes Unicode typing. The task types a note, Return,
second line, opens Save, enters a scratch path, saves, closes the document, opens
a file picker, enters its location and reopens it. Saved bytes match UTF-8:

```text
Controller evidence café
Second line
```

There is one trailing newline. This independent file assertion is the semantic
check, not merely pixel-change receipt status. Core cursor stays (950,650).
Actual RandR size-in-mm A->B->A advances topology epoch 1->2. Old binding fails
stale_source_binding, then fresh delivered observation has newer revision.
Stop returns complete/stopped/released/capture_revoked/input_revoked and
applications_preserved all true; owned_devices=retained_inactive. Independent
native queries show no held keys/buttons. Xed remains alive after Stop.

## Isolation and reproduction

All commands run below the owned-test-supervisor-r6 subreaper with a deadline.
Xvfb -displayfd allocates a fresh display; :0 is explicitly refused. The harness
owns private HOME, XDG config/data/cache/runtime and session bus. Xdotool only
positions/focuses the initial fixture; every later GUI operation is controller
input. Xed/Openbox/bus/Xvfb teardown occurs only after application-preservation
assertion. Disposable US international keyboard setup is not production remapping.
Dependencies were already installed. No deployment, restart, pipeline or push.

```sh
/tmp/cu-r10-dev-venv/bin/python scripts/computer-feasibility/owned-test-supervisor-r6.py \
 --deadline 180 --report /tmp/r11-controller-supervisor-new.json -- \
 /tmp/cu-r10-dev-venv/bin/python tests/harness/x11_r11_controller.py \
 --keyboard-only --output /tmp/r11-controller-new
```

Choose unused artifact paths. Omit --keyboard-only to exercise pointer operations.
That broader path passed in run8 after25c78d5; older failures remain below.

## Preserved failures and limits

Run1 public multiline type accepts newline/tab but x11_attached rejects controls,
turning a predispatch rejection into unknown/cancellation. Artifact
`/tmp/r11-controller-1/result.json`. Passing task uses explicit Return.

Runs2/3 double-click returns native unknown/injected/released with reason
input_scope_or_native_failed. AppScope.assert_snapshot(point) uses core
query_pointer and demands the human cursor equal the owned XI2 coordinates.
Thus independent pointer fails after movement, before press. Native owner was
sent the exact lines. Raw receipts: `/tmp/r11-controller-3/result.json`.

Run4 was a harness grammar mistake (Ctrl+s rather than lowercase ctrl+s). Run5
completed task/Stop but asserted nonexistent cleanup.verified; actual contract
assertions fixed and runs6/7 passed. These failed runs are not counted as passing.
Runs1-6 had private-bus activation display diagnostics; run7 provisions its own
bus after private display/environment setup and completes without them.
All attempted runs have supervisor cleanup confirmed. Ruff passed after fixing
six line-length findings; diff-check passed before final documentation.

Current passing scope: full generic Xed task including independent double/right
click, bounded scroll injection, crop/delivery, provenance and topology/Stop.
Multiline native resolution is unit-tested after the parent fix; no separate
real-GUI multiline-typing run is claimed here.
Not main-desktop qualification, exhaustive application support, remote support,
hardware sleep/wake, release readiness or simultaneous-native-client-death safety.
