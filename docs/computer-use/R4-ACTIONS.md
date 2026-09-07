# R4 isolated grounded click increment

This is a finite controller increment, not a complete computer-use capability or
an existing-session input acceptance result. Work is confined to
`controller.py`, new `actions.py`, `test_computer_actions_r4.py`, and this document.
No desktop access, process launch, package installation, service operation,
deployment, commit, push, or CI execution was performed for this increment.

## Supported public action

The existing `computer_act` tool schema is unchanged. The controller accepts a
strict subset: `operation=click` with required `session_id`, `generation`,
`consent_generation`, `source_id`, `source_revision`, `action_id`, `observation_id`,
integer delivered-pixel `x` and `y`, and `expect` containing exactly
`type=pointer_at`, `x`, and `y`. Expected coordinates must equal click coordinates.
Opaque IDs are bounded to 96 ASCII alphanumeric/underscore/hyphen characters.
Generation fields are positive non-boolean integers below 2**63. Unknown fields,
arbitrary key/text/semantic operations, model receipts, and broader postconditions
are refused. An empty historical capability probe retains its old refusal code.

The declared description still says unavailable during the R1 gate. Updating the
tool description belongs to the integration owner after review; this increment
does not silently widen the public schema. There is no `move` operation in that
schema, hence no invented public move operation here.

## Authority, grounding and no replay

Only isolated grants with isolated adapter capabilities are admitted, even if an
existing-session adapter claims verified release/detach. Existing-session start
remains blocked. Foreground, user/channel/host/turn ownership, active generation,
consent, task wall/monotonic deadlines, 200-action limit, source input scope, known
mapping and focus remain mandatory. Native vision admission belongs to integration;
the controller additionally requires its recorded delivery of the exact current
observation. Capture without native delivery is not action authority.

Input compares the delivered observation against a fresh capture, including full
source geometry, focus and modal binding. Changed pixels also fail closed rather
than accepting a new visual target just because geometry is unchanged. This exact
digest check is deliberately conservative for animations. Unexpected modals pause
or stop; they never grant authority. The adapter separately revalidates its private
native window/process/focus/token immediately around input. Controller snapshots
do not prove atomicity against changes after capture.

Arguments are deep-copied before awaited grounding. After grounding and renewed
authorization, the existing SQLite FULL-synchronous transaction increments the
action count and commits `pending` before the input coroutine is constructed.
Same ID/same canonical payload returns the durable receipt without input, including
after expiry/revocation while current requester authorization and turn ownership
remain valid. Changed payload is rejected. Existing pending entries return unknown;
store recovery converts pending to durable unknown. There is no automatic replay.

The delivered observation is consumed on attempt. New input needs a newly observed
and delivered frame, including after a refusal returned by the worker. Backend
exceptions, timeouts, cancellation, invalid receipts, revoked state or uncertain
post-action grounding produce durable unknown and bounded stop. Cancellation is
re-raised only after recording unknown. Input calls are bounded to two seconds or
the remaining task lease, whichever is shorter. Private worker release/lease
enforcement remains a separate requirement; cancellation of a Python await alone
does not prove that an arbitrary backend stopped injecting.

## Internal adapter and receipt contract

`backend.act` receives exactly `type=click`, source ID/revision/consent, delivered
integer x/y and `expected={type:pointer_at,x,y}`. It maps the delivered pixel center
through the verified source transform, explicitly flooring for integer input. No
global display coordinate, XID, process ID, executable or secret is model input.

Execution evidence needs strict boolean `injected` and `released`. A refusal is
`status=unavailable`, `injected=false`, `released=true`. Successful injection uses
`status=executed|verified|not_satisfied`, `injected=true`, `released=true`.
Independent postcondition data is `postcondition` with `type=pointer_at`,
`method=pointer_query_after_release`, matching source ID/revision/consent and
`actual={x:<input integer>,y:<input integer>}`. The adapter must obtain actual
coordinates by a fresh independent query after release and recheck native binding,
not echo the requested coordinates. The controller recalculates the mapped target
and compares actual values; backend verdicts do not decide satisfaction.

Missing postcondition evidence gives `executed` with verification unavailable,
never verified. Contradictory or malformed evidence gives unknown. Matching measured
coordinates give `verified`; a valid mismatch gives `not_satisfied`. Both explicitly
say `scope=pointer_location_only`. This does **not** prove that a widget activated,
a document changed, or a click application effect succeeded. A fresh post-action
capture rechecks binding and persists private frame evidence. It is not marked
delivered to the model and cannot be reused as action authority without observation.

The controller trusts its server-owned adapter as an evidence producer. It rejects
model-forged evidence structurally; it cannot cryptographically distinguish a
malicious adapter that fabricates all required measurements. Worker query tests and
real isolated acceptance remain independent evidence obligations.

## Recorded validation

Focused deterministic/non-GUI run from `/home/odin/odin-dev`:

* `tests/test_computer_actions_r4.py` (68 cases), freshness R1, geometry R1,
  contract R2 and normal-turn R3: **118 passed**, one existing `audioop` deprecation
  warning, 3.07 seconds. Includes a real `LinuxDesktopBackend` adapter with fake
  wire transport integrated with the controller; no GUI or native process used.
* Ruff on `src/computer/actions.py`, `src/computer/controller.py` and
  `tests/test_computer_actions_r4.py`: passed.
* `git diff --check`: passed at that checkpoint. Shared-tree changes by other
  agents are not attributed to this increment.
* Separate historical contract R1 plus runtime grounding R4 run: **55 passed,
  1 failed**. The old `test_adapter_never_exposes_private_ids_or_accepts_input`
  fixture lacks the new worker `source_revision` (KeyError) and still requires
  unconditional capture-only behavior. That historical test is outside this
  increment's ownership and needs owner review/update; full regression parity is
  not claimed. The failed bundled command did not run its later import check.

Tests cover pending-before-input, canonical duplicate receipts, changed-payload
conflict, duplicate concurrency, pending recovery, strict schema/bounds, delivered
observation requirement, source/focus/mapping/modal changes, source replacement,
stale capture and authorization delays, expiry/action limits, isolated-only gate,
independent measured receipt comparison, forged verdicts, post-action source
changes, visual-target changes, concurrent stop, exception/cancellation/timeout,
authorization revocation and payload mutation across capture awaits. Existing
normal-turn tests prove ordinary tools remain usable across desktop lifecycle
states; no ordinary-tool policy or availability code was modified.

## Remaining gates

No real GUI result is claimed here. Complete adapter/worker integration, observed
event receipt, independently enforced cancellation/release, application-preserving
cleanup and lifecycle, same-sized native resource replacement/ABA detection,
multi-source runtime coverage, Wayland input feasibility, existing-session consent
and attach, semantic postconditions, text/keyboard/drawing actions, artifact
save/reopen corpus and broader release/CI acceptance remain outside this increment.
Exact image identity may deny legitimate animated apps. Post-click modal/focus or
source changes conservatively become unknown rather than claiming the intended
application effect. These restrictions are deliberate, not full task support.
# Parent review closure

Independent review reproduced a native failed pointer-window check being upgraded
to verified solely because coordinates matched. Native receipts now include the
independently measured Boolean target_window_matches; the controller requires
that evidence, returns not_satisfied on false and unknown when absent/malformed.
An actual NativeDesktop fake through LinuxDesktopBackend through ComputerController
regression covers both matching and mismatching target windows and duplicate
no-replay. The public verification field is target_binding_matches; no XID leaks.

The worker also recaptures and checks raw pixel digest immediately before input,
after controller authorization awaits. This closes the reproduced await gap but
does not promise atomic framebuffer/widget exclusion during a click. Exact pixel
equality can refuse benign animation. Neither snapshot nor pointer location proves
application semantics. Final focused action tests: 73 cases before combined suite.
