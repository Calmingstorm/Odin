# Seamless X11 live-test branch, 2026-10-31

Base: `origin/master` v4.26.0 (`eb4ee107`). Development only; deployment and
supervised live testing are external. Live testing ends at **18:30 EDT**.

## Slice 1: exact-target pre-dispatch recovery

- Preserve private native target evidence separately from public screenshot
  revision. A revision is never rolled back or accepted as native identity.
- Remove both controller/backend revision-equality capture retry loops.
- On a recoverable attached-X11 pre-dispatch mismatch, one cancellable coordinator
  waits for a full second without physical key, button, or motion edges or held
  keys/buttons. Maximum wait is 30 seconds, at most two activation requests.
- **Deviation from the originally accepted click mechanism:** recovery requests
  `_NET_ACTIVE_WINDOW` for the exact original native window. No pointer move,
  click, key injection, `SetInputFocus`, window relocation, or fallback click.
  An activation request is not proof of focus. The ordinary fresh native scope
  and captured frame must agree before the never-dispatched action can proceed.
  A recent takeover yields instead of repeatedly fighting for focus.
- Window/process/native widget lineage, source/consent, geometry and modal
  evidence remain conjunctive. Retained structure-event monitoring brackets
  captures and overlaps the recovery worker's subscription before authorization.
  Missing incarnation evidence disables recovery, not ordinary capture.
- Only revision churn is rebound. Translation and resize return a fresh view,
  not remapped coordinates. Existing pointer-anchor and keyboard-focus checks
  still apply after recovery. Changed target pixels also return the fresh view.
- Unknown action dispatch/release is never recovered/replayed. Pending input
  prevents single-action recovery. `/stop` fences recovery independently of the
  controller action lock. Expired observations do not become fresh through waiting.
- Receipts carry content-free cumulative phase times under
  `verification.phase_timings_ms`: capture, recovery, combined backend
  dispatch/release/verification, total. Recovery additionally reports its native
  quiet/activation/proof timings when supplied. These phases overlap; do not sum
  them as disjoint wall time. Native input subphases are not separately timed yet.

### Conservative limits

Any observed window create/destroy/reparent currently invalidates recovery,
including events in unrelated applications. This avoids same-XID reincarnation
ambiguity at the cost of recoverability on a structurally busy desktop. Mere
focus changes, pointer motion, and window configuration events do not increment
this epoch. Tracker failure produces no fabricated continuity proof. A failed
tracker is retried with a new proof namespace, at most four subscription attempts
per attachment and at least one second apart. Old proofs never revive after a
subscription gap. The current view is still returned when recovery is unavailable.

WM policy may deny EWMH requests using `CurrentTime`; denial returns evidence,
never a click fallback. X11 focus and input checks remain non-atomic with respect
to other clients. Human overlap during already-dispatched input retains the
existing guardian policy. No guardian termination/fault testing is permitted on
the operator's desktop.

### External live acceptance

1. Observe Krita, focus xed before the action, stop touching input, then request
   the grounded action. Expect exact-window activation, one requested action,
   no focus-click brush speck, new revision, and recovery timings.
2. Move focus away and back before action. Expect revision-only recovery without
   a redundant activation or a multi-call observe/focus/observe loop.
3. Keep moving the pointer or tapping Shift during recovery. Expect no requested
   action until quiet; continuous activity must return `user_active` within the
   bounded wait. A second human focus takeover within five seconds must yield.
4. Move/resize the target, change the anchor, open a dialog, or replace the
   window. Expect fresh evidence and no old-coordinate action or target adoption.
5. Stop during the quiet wait. Expect prompt cancellation and no later activation
   or action. Repeat action IDs must return receipts without re-execution.

Quick checks are fake-only, with native/runtime seams mocked. No native desktop,
service, configuration, deployment, or restart actions were used while building.
Hyprland and portal native recovery rules are unchanged. Odin Desktop's separate source
copy has not been synchronized; that is a later explicit release task.

## Slice 2: never-dispatched sequence suffix continuation

Between fully settled, confirmed-release steps, the sequence may use the same
X11 recovery coordinator. Only its pending envelope and known never-attempted
suffix are exempted from the pending-input veto. An unrelated pending action,
unknown release, attempted step, changed anchor, modal transition, or failed
previous expectation still stops continuation. The original plan remains the
grounding source; only snapshot revision is rebound after exact native proof.

Sequence wall time and all point/text/gesture budgets are unchanged. Recovery
consumes the sequence's remaining wall-time budget; cancellation fences its
worker and cannot return a revoked frame as actionable. Repeating the envelope
ID returns its stored receipt, never its suffix. Receipts report
`verification.pre_dispatch_recoveries` and cumulative phase timings.

Live test: use two disjoint, grounded actions; switch focus after the first is
released and verified. Expect the first action exactly once, an exact-target
refocus after quiet, then only the remaining step. Repeat with a changed second
anchor or a dialog and confirm the suffix stays `sequence_not_dispatched`.

## Slice 3: continuity, work budgets and frame reuse

Attached-X11 `start` and explicit `resume` return the initial frame they already
captured, with session metadata. The normal invocation-bound image delivery gate
must accept it before input; capture alone is not delivery authority. A frame
formatting failure preserves the successfully started active session and asks
for an observation instead of misreporting start failure.

Live test: start X11 and use the returned image/binding directly for the first
action, without a redundant observe. Inspect the complete scene first. Confirm
one initial capture and that the response includes session and input limits.

- Clean X11 turn completion releases input and pauses the attachment. Only the
  same owner/channel/host/surface's next foreground **visual computer request**
  automatically resumes, with renewed generation/consent and a fresh view. The
  triggering stale action is not dispatched. An unrelated message/status never
  rearms capture. Explicit pause remains explicit; cancellation, error, authority
  loss and `/stop` terminate rather than creating automatic continuation.
- Turn-pause markers are in-memory, attached to the exact clean generation.
  Controller loss never restores automatic input authority. Pending action or
  recovery records block resume; old-turn finalizers cannot stop a later turn.
- Idle expiry is 30 minutes, absolute lifetime four hours. Only a validated
  owner/generation request renews idle time; status, receipt replay and image
  delivery do not. Durable creation time and monotonic cap enforce lifetime.
- The budget is 2,000 dispatch attempts. Action/sequence IDs reserve no budget;
  a durable atomic charge precedes dispatch. Only affirmative no-input and
  confirmed-release native refusal refunds it. Unknown outcomes remain charged;
  refunded IDs never become replayable. Undispatched suffixes cost zero.
- A backend's post-release raster can be consumed once by that exact action,
  including sequence checkpoints. Reuse preserves the original capture timestamp
  and requires fresh scope proof, unchanged source/crop/consent/topology/incarnation
  and bounded age. Changed/missing evidence falls back to capture. This avoids
  duplicate raster/render work, **not** the read-only scope worker startup.

### Run-1 feedback: recovery where focus is actually lost

The coordinator now also runs after confirmed-release action/sequence checkpoints,
before misclassifying a temporary other-app snapshot as a dialog/effect failure.
It refocuses only the exact original nonmodal target. The dispatched prefix is
never replayed. A real dialog, resize, target replacement or uncertain release
still needs inspection or stops input.

A fully dispatched polyline may continue its never-dispatched suffix after exact
target recovery plus independent localized path evidence. Native post-release
`target_application_matches=false` remains recorded; separate recovered-binding
evidence is not rewritten as native proof. Complete step counts, known release,
unchanged mapping, distributed path changes and original next-anchor checks are
all required. The broad native visual-change threshold is no longer an additional
requirement when the narrower path evidence qualifies. Semantic marks remain
unverified until the final view is inspected.

**Still deliberately blocked:** a next stroke starting on changed pixels, even
pixels apparently painted by the preceding stroke. No canvas/tool identity proves
that exception safe. Group connected edges into one polyline or inspect and replan.
Closing/creating a dialog cannot automatically authorize a replacement target.

### External live checks for the new build

1. Repeat S0 with focus excursions while a released action/checkpoint is pending.
   Inspect `post_release_recovery` and `post_release_recoveries`, not only the
   pre-dispatch counter. Expect no duplicate prefix or focus-click specks.
2. Use a thin closed polyline and disjoint rays. Complete path evidence should
   permit the suffix without requiring the broad raster threshold. An overlapping
   changed start anchor must still yield.
3. Complete a turn, then continue in a new turn. Expect same session, new generation,
   one fresh view, no stale input. Explicit pause, idle cancellation and `/stop`
   must not become automatic resume. Ordinary chat/status must not capture.
4. Compare capture timings and frame timestamps. Reused pixels keep their original
   time, and stale/cropped/changed-scope frames force a new capture.
5. Use the shortened configured-backend catalogue and operation-specific session
   `payload` union. Check session start/status/resume and zero-valued coordinates.

## Slice 4: operation-specific contracts

Session, action and expectation alternatives are explicit, including coordinate
versus region targets. Configured-backend descriptions omit irrelevant paths.
Strict transport preserves valid zero coordinates/duration and empty clearing
text, while invalid dummy values fail closed instead of silently becoming defaults.

The offline every-property-present probe covers 18 action wire alternatives,
12 generic session alternatives, 15 sequence-step fixtures and all seven expectation
forms; 843 individual-property `''`/`0`/`null` mutations, 90 blanket-padding probes,
plus observe/crop dummy probes. A wire-normalized start is tested through the actual
integration resume/image-delivery gate.

The subsequent requested provider-level Astra probe actually sent the configured
X11 catalogue in three inert requests (empty-string padding/field clear, zero
coordinates/duration, null optional padding). The first run exposed a real schema
gap: empty `expected_modal` was schema-valid but invalid to the action parser.
The schema now requires a nonempty modal ID while retaining valid empty field text.
All three repeated provider responses passed strict normalization **and** the
canonical action parser, preserving zeros/empty clearing text. Every returned
tool call was treated as data; **zero computer actions were executed**. Auth was
read-only, with refresh/writes disabled. Retained raw/normalized synthetic evidence:
`/home/odin/reviews/computer-use-2026-10-31/06-provider-call-shape-results.json`.
This checks actual provider call generation for three representative cases, not
every operation or live desktop effects. The post-fix focused suite passed 119 tests.

## Slice 5: narrow key-overlap release proof

An unmodified pointer gesture interrupted by physical key overlap can keep its
session only after helper fencing, successful ledger-only release, exact unchanged
native endpoints, both shared XTEST endpoints sampled all-up, and no physical button
edge/hold. Effect remains uncertain, the action is never replayed and the interrupted
sequence never automatically continues. See `computer-use-key-overlap-release.md`.

Synthetic-key/modifier plans, button overlap, unknown/device/query evidence,
guardian loss and existing quarantines do not qualify. The old Run-1 quarantine is
not cleared by this patch. External reconciliation remains required.

## Build validation and review follow-up

First-build focused run: **390 fake-only tests passed**, with one existing Python
`audioop` deprecation warning. Scoped Ruff and `git diff --check` passed. Coverage
measurement, the full suite, CI, and native qualification remain after the live
loop, as requested.

Independent review found and fixed activity arriving during the native focus
proof, a setup alarm that consumed the quiet-wait budget, and permanent recovery
disablement after a transient incarnation-subscription failure. Tests cover the
prepared/barrier/proceed protocol, privileged identity-ready path, cancellation
before proceed, fresh proof namespaces, unknown-release refusal, exact-identity
changes with identical screenshot epochs, and invocation-bound initial images.

The combined backend timing deliberately does not claim to isolate native
dispatch from release or postcondition capture. A failed recovery protocol
reports unknown activation-attempt facts, while separately recording that the
requested click/key/stroke was not dispatched.

Second-build final validation: **941 tests passed**, one existing Python `audioop`
deprecation warning; scoped Ruff and `git diff --check` passed. This includes the
combined offline suites and a separate,
high-number private-Xvfb lifecycle fixture under an owned-process supervisor.
The live desktop is not used. An old fixture assumed monitor removal was noticed
only in a capture worker; it now also accepts the earlier event-watcher veto and
still verifies complete worker cleanup. Full CI/coverage, Desktop synchronization,
hardware qualification and persistent capture workers remain deferred.

## Late operator steer: host-admin emergency lifecycle authority

The authenticated, current WebUI host-admin binding can inspect lifecycle metadata
and stop any selected session on localhost, including bridge-owned sessions. Status
lists up to 100 sessions with real owner IDs; explicit session selection remains
available through the API. Stop uses the selected session and exact generation.
Cross-owner screenshots, evidence access and new input are not granted by this path.

`/recover` and the existing acknowledged `/reconcile` path now accept a loaded,
quarantined shared-X11 controller. The terminal probe refuses active/unknown injectors
without touching their pipes, settles only known read-only workers, proves exact
same-boot process/group absence, and queries both exact recorded shared synthetic
endpoints all-up. It sends no new input and never replays. A separate terminal cleanup
certificate permits close; historical release failure and unknown action receipts
remain intact. Held input, identity drift, missing proof or failed settlement retain
quarantine. Physical input and application effects are explicitly not proven.

Runtime-identity persistence during this probe is separately fenced to its exact
quarantined generation, backend, worker task and current trusted admin authority.
It neither resurrects an active grant nor requires a restart. No live quarantine was
cleared while building; acceptance must use Aaron's authenticated operator page.

Validation: 437 focused Python tests passed across operator/API/auth/cleanup and
regression suites; headless mocked-API browser checks passed for cross-owner
selection and exact-session Stop without capture; 49 Vue templates passed and the
production UI bundle built. Existing deprecation/AppKey and bundle-size warnings
remain. The separate Desktop copy is still not synchronized.
