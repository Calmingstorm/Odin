# Hyprland recovery qualification plan

Status: **design and execution plan only**. The recovery implementation is not
runtime-qualified. `runtime_qualified` remains `false` until every applicable
gate below has recorded passing evidence on a supervised, disposable Hyprland
machine. Offline tests, successful compilation, native ACKs, and manifest
booleans cannot substitute for compositor and receiver evidence.

This plan qualifies four bounded capabilities:

1. task-lineage preservation and same-incarnation native recovery after proven
   release;
2. automatic durable output-grant handoff;
3. persisted-descriptor durable-owner takeover and release-only reconciliation;
4. incarnation-bound retirement after failed cleanup.

It does **not** claim automatic recovery across compositor death. Durable task
continuity after that boundary is an explicit operator-reconciliation flow, not a
seamless session resurrection or native continuation.

It is written for an operator who did not build the feature. Read it completely
before starting. A diagnosed refusal is useful. Weakening a guard until the case
turns green is not.

## Safety boundary and exact claims

Run destructive cases only on a dedicated machine, or a VM with no host DRM,
input-device, display-socket, or GPU passthrough. A person must be present with an
independent stop path. Do not run compositor restart, held-input kill, transport
fault, or reboot cases through an unattended remote session. The current remote
workstation cannot satisfy this prerequisite.

Never use an active personal desktop as the receiver. Never fault-test an unsaved
document. Never use broad process kills. Record exact PIDs/start ticks first and
signal only disposable processes named by the test.

Keep these claims separate:

| Claim | Required evidence | Not proved by it |
| --- | --- | --- |
| task continuity | authorized descriptive intent and recovery lineage survive | continuity of a native window, grant, observation, action, or result |
| native target identity | fresh authenticated inventory plus exact compositor/plugin epoch and `window_id` | matching title/class/process or current focus |
| cleanup ACK | exact authenticated owner transaction completed and ledger is empty | receiver delivery or application/action success |
| receiver release | independent receiver logs the matching up after its down | behavior of untested applications |
| retirement | old input incarnation can never authorize or complete later input | release or receiver release |
| fresh authority | a new durable grant and delivered observation under current consent | authority inherited from the retired incarnation |

**The contract is task-lineage-continuous only where its stated evidence exists.**
Compositor death destroys native object identity. A replacement window is not the
original window. Same title/class, executable, PID, or appearance is insufficient.
The backend may return `fresh_target_required` with a fresh inventory after the
original compositor pidfd has exited, but the controller records
`operator_release_required` when `released` is false. A fresh inventory is not
release proof and cannot advance that state.

After external cleanup and an explicit, authenticated operator attestation, a
later operator-supervised flow may create a successor that carries only saved task
hints and lineage. It must use a fresh explicit inventory selection and
observation. The selection fields are exactly `target_id`, `output_id`, and
`candidate_epoch`, not a title/class match or a `selected_target` object. The
attestation is not native release proof or receiver proof. If application-assisted
document identity is added later, qualify it separately; until then an ambiguous
replacement refuses.

No boolean is compositor proof. `ready`, `released`, `retired`, `clean`, process
absence, or `runtime_qualified` is only a summarized claim. Retain the underlying
authenticated record and independent receiver events.

## Qualification artifact versus production trust

The source build emits `runtime_qualified: false`. Production
`read_trusted_plugin_manifest` and `PluginApproval` reject tuples not already
qualified. **Do not flip the field to make managed loading or testing work.** That
would turn the desired conclusion into a prerequisite.

Initial qualification uses an operator-reviewed, deliberately loaded test artifact
in the supervised disposable compositor, following the existing manual harness.
This is qualification mode, not production managed activation. Record immutable
plugin ELF digest, companion build ID, exact Hyprland version/commit, headers and
dependency ABI; prove mapped image and executing companion agree. Only after the
complete tuple passes may a separately reviewed provisioning change approve that
exact tuple. Then repeat managed activation and normal lifecycle restart cases
without weakening policy. Do not treat a compositor replacement as recovered task
continuity.
Guardian-only or extracted native fixtures qualify parser/state-machine behavior,
not the full mapped plugin tuple.

## Prerequisites and commands

Use a clean checkout of the exact candidate:

```sh
git status --short
git rev-parse HEAD
```

Required environment:

- dedicated supervised Hyprland hardware or an isolated guest;
- exact supported Hyprland build and matching development headers;
- one named output, and two outputs for handoff cases;
- repository native receiver and a harmless disposable receiver window;
- tested WebUI/OOB stop independent of desktop focus and action lock;
- monotonic compositor/plugin/guardian/receiver logs;
- boot ID, `/proc/<pid>/stat`, peer credentials and mapped-image inspection;
- fresh computer state plus a backup before every destructive scenario.

Build inert artifacts without contacting the desktop. Create a unique output
directory for each run; do not delete a prior build directory as part of this
plan:

```sh
build="$(mktemp -d "$PWD/build/hyprland-qualification.XXXXXX")"
sh scripts/build-hyprland-input.sh "$build"
python3 scripts/computer-feasibility/hyprland-live-qualification.py --self-test
sha256sum "$build"/odin-hyprland-input \
  "$build"/odin-hyprland-capture \
  "$build"/odin-hyprland-scope-*.so \
  "$build"/build-identity.json
python3 -m json.tool "$build/build-identity.json"
```

The manifest is expected to remain false during qualification. Install/load only
through the supervised procedure for the disposable machine. Do not bless an
unqualified artifact through normal production admission. Do not overwrite a
mapped ELF or use the compatibility symlink as mapped-image evidence.

Run the existing narrow receiver prerequisite with fresh values, never identities
copied from an old report:

```sh
python3 scripts/computer-feasibility/hyprland-live-qualification.py \
  --wayland-socket "$WAYLAND_SOCKET" \
  --scope-socket "$SCOPE_SOCKET" \
  --manifest "$MANIFEST" \
  --guardian "$GUARDIAN" \
  --capture "$CAPTURE" \
  --receiver "$RECEIVER" \
  --output-name "$OUTPUT_NAME" \
  --log-dir "$EVIDENCE_DIR/narrow-corpus" \
  --compositor-pid "$COMPOSITOR_PID" \
  --logical-width "$LOGICAL_WIDTH" \
  --logical-height "$LOGICAL_HEIGHT" \
  --include-sigterm-stroke
```

This is prerequisite evidence for positive click, stale refusal and cooperative
held-stroke cancellation. It is not recovery qualification. The repository does
not currently provide an executable compositor-death recovery driver: the
recovery scenarios below require operator-supervised or deterministic
fault-injected orchestration around this existing harness. Do not invent a
command line for that missing driver, and do not call the harness alone evidence
of recovery.

## Required evidence and universal pass gate

Use one directory per scenario. Preserve, with secrets and scope tokens redacted:

1. candidate SHA/status, build log, artifact hashes and complete tuple identity;
2. boot ID and compositor PID/start ticks/executable identity;
3. plugin mapped-image/build/instance/protocol/endpoint identity;
4. selected candidate and output topology before and after;
5. old/new session, generation, consent, stop epoch, grant and parent lineage;
6. action receipts, command IDs, cleanup transaction and durable recovery rows;
7. complete native logs and independent receiver log with barriers;
8. screenshots before interruption and before any new action;
9. OOB stop latency and every process exit status; and
10. final ledger/key/button state and process inventory.

Every pass requires:

- old observations, coordinates, candidates, grants and action IDs refuse;
- no uncertain action or sequence tail is replayed, even under a new ID;
- late old-generation callbacks cannot hand off, focus, capture or input;
- current owner/host/task/consent authority is rechecked;
- fresh explicit target selection and delivered pixels precede new input;
- ACK, receiver evidence, retirement and action outcome remain separate; and
- pause/stop wins at every wait and never self-resumes.

Any unexplained input, stale-coordinate action, wrong-window focus, false receiver
claim, unbounded retry, or input after stop is immediate failure.

## Piece 1: task lineage and compositor-death boundary

### Implemented contract under test

`recover_native_authority(consent_generation=..., command_id=...)` returns a typed
result with state `ready_for_replan`, `fresh_target_required`, or
`operator_release_required`; it always retains `original_outcome=outcome_unknown`,
`receiver_release_verified=false`, and `runtime_qualified=false`. The backend stays
suspended until synchronous durable `commit_native_recovery` succeeds.

Within a surviving compositor lineage, only proven release plus exact original
window identity can reach `ready_for_replan`. Across compositor death the backend
returns `fresh_target_required`, never exact-window continuity. The controller
then records `operator_release_required` unless its independently evaluated
cleanup says `released=true` and `resources_retired=true`; a dead original ledger
does not satisfy `released`.

The optional `recovery_session_id` and `recovery_generation` fields are start
metadata for an existing-session Hyprland start, paired with a fresh inventory
selection of `target_id`, `output_id`, and `candidate_epoch`. They preserve only
task lineage. They do not clear unknown release or provide native/action
authority. The predecessor must have durable reconciled cleanup and be closed
before any successor starts. Only descriptive task hints and lineage cross;
observations, scope tokens, actions, live grants and consent do not.

The native owner is PID-bound. A controller or recovery-daemon restart is supported
**only** for a persisted v2 descriptor and its matching capability, where the
exact original compositor, plugin epoch, owner identity, and retained ledger still
exist; the old recovery owner PID/start-tick must positively prove exited; and the
authenticated successor has the exact permitted owner identity. The provider must
attest the original compositor/protocol before takeover. A legacy descriptor,
missing or mismatched capability, living predecessor, changed principal, changed
compositor/plugin/ledger, or lost retained ledger refuses. Descriptor decoding
restores identity data, not input authority.

The supported public recovery operation is release-only reconciliation. There is
no recovery-driver shell command. Use the computer-session API against a durable
session with its current generation, for example:

```json
{
  "operation": "reconcile",
  "session_id": "<durable-session-id>",
  "generation": 7
}
```

This operation may query a lost acknowledgement and, when all exact takeover
conditions hold, adopt the old native owner solely to reconcile/release it. It
does not restore a grant, observation, action, consent, or task execution. A lost
ACK is queried with the same durable command/transaction identity; it is never
released again. Persist the intended successor and original descriptor before
dispatch, and persist the successful successor descriptor before release
reconciliation. If a second controller death leaves adoption ambiguous, refuse.

### Positive procedure: supported lineage after proven release

1. Start a task against receiver A on output A. Record exact target, output grant,
   owner handle, compositor incarnation, and native window-plus-surface lifetime.
2. Deliver an observation and begin a held multi-step action. Use a receiver
   barrier to prove a down/submitted step before interruption.
3. Inject a recoverable same-incarnation fault while the original compositor,
   plugin epoch, owner peer PID/start ticks, window lifetime, and surface lifetime
   remain valid. Do not restart the compositor or native owner daemon.
4. Drive native reconciliation with the durable command ID. Prove exact ledger
   release, local closure, and controller `released=true` plus
   `resources_retired=true` before accepting `ready_for_replan`.
5. Verify the predecessor authority was fenced, the same exact native identity was
   revalidated, and no observation/action/grant was inherited as input authority.
6. Deliver fresh pixels, then issue a genuinely new action based on visible state.

**Receiver evidence:** old down/up or disconnect ordering, barrier after failure,
no duplicate old down, and new input only after fresh pixels.

**Pass:** same-incarnation recovery replans without action replay; the old result
remains unknown; previous delivered pixels are invalid; and the fresh action is
grounded in a new observation.

**Fail:** current focus/same-title adoption; old grant/observation reuse; old
action/tail replay; recovery without reconciled cleanup; loss of task hints; or
input before a fresh observation.

### Expected refusal and explicit successor: compositor death or dead owner ledger

1. Record the original compositor pidfd and all owner identities, then stop only
   the disposable compositor. Do not retry the interrupted action.
2. Confirm the retained original pidfd has exited and that local guardian/scope
   closure evidence is recorded. The backend may return `fresh_target_required`
   and replacement inventory.
3. Confirm the controller records `operator_release_required` because
   `released=false`, even if `resources_retired=true`. A dead ledger or a fresh
   replacement inventory must not promote the state.
4. Do not start a successor automatically. Preserve the evidence. If external
   cleanup is performed, record authenticated operator attestation through the
   explicit reconciliation flow. It remains an unverified attestation, not native
   release or receiver proof.
5. Only after that explicit reconciliation may an operator start a new successor
   session with the preserved descriptive hints and parent lineage. Require fresh
   `target_id`/`output_id`/`candidate_epoch` selection, fresh delivered pixels,
   current consent, and a new grant before any action. Do not carry forward an
   observation, scope token, action ID, native owner, or result.

**Pass:** backend and controller states are both recorded with their different
meanings; no replacement window is adopted automatically; no action is resumed or
replayed; and any later successor is independently selected and authorized. This
is expected refusal evidence plus explicit task-lineage continuity, not automatic
compositor restart.

### Required refusals

Repeat with duplicate windows, same PID but changed start ticks, changed executable,
wrong UID/peer, stale candidate, disallowed output, locked desktop, foreign modal,
XWayland target, missing/unapproved plugin tuple, and cancel after discovery but
before commit. Each must remain fenced. No fallback to current focus.

## Piece 2: automatic durable output-grant handoff

### Implemented contract under test

Each grant binds one output and exact application/window identity. The controller
synchronously fences and calls `begin_hyprland_handoff` before awaiting native
work; the durable pending record includes the command ID. Same-compositor handoff
requires the same plugin epoch and stable random `window_id` whose identity is
bound to **both** live weak window and weak surface lifetimes. It is never a raw
address identity. If either weak lifetime has expired or no longer matches, the
binding is unavailable rather than reused.
`focus_bound_candidate(..., allow_output_handoff=True)` may follow that exact
window to another allowed output. Process/title matching is never enough.

Only complete fresh cleanup and exact native proof produce `ready_for_replan`.
`advance_hyprland_output_grant` records an immutable parent-linked successor,
`commit_native_recovery` commits the backend synchronously, then the session may
reactivate. Original pixels remain invalid and input is never replayed.

### Positive procedure

1. Select receiver A on output A; record initial durable grant, `window_id`, and
   its live window-plus-surface lifetime evidence.
2. Deliver pixels and perform a receiver-verified click.
3. With no action pending, move the same test window to allowed output B.
4. Trigger recovery. Verify durable pause/fence occurs before native awaits and old
   pixels become unusable.
5. Verify same compositor/plugin epoch/window ID and both weak lifetimes, full
   cleanup, fresh output-B binding and a parent-linked successor grant.
6. Deliver output-B pixels. Act at a location that would visibly miss if output-A
   coordinates were reused.

**Receiver evidence:** barrier after last output-A event, no event during handoff,
then exactly one intended output-B event after fresh capture.

**Pass:** old grant/source/observation refuse; successor lineage/topology is
durable; no input occurs before fresh pixels; mapping is source-local and correct.

**Fail:** connector name/process/title authorizes handoff; in-place grant mutation;
stale coordinates accepted; cleanup incomplete; pending action; late old callback;
or wrong target/output input.

### Required refusals

Output-name reuse with changed identity; window replacement; hot-unplug during
cleanup; fractional scale/rotation/negative origin; candidate expiry; duplicate
windows; disallowed output; pending action; malformed lineage; stale command or
recovery generation; stop during every phase; and controller restart between
fence and commit. Persisted state either resumes the exact safe phase where
supported or refuses. In-memory absence is never success.

## Piece 3: same-owner native ownership-ledger reconciliation

### Implemented contract under test

Before arm, `owner_capture` binds a `HyprlandOwnerHandle` to exact original
compositor `ProcessPin`, authenticated guardian `{pid,uid,start_ticks}`, random
`plugin_epoch`, random `ledger_id`, peer credentials and pidfd. Native operations
are:

- `owner_status`, a pure query;
- `owner_reconcile(handle, command_id)`, one idempotent release attempt or prior
  clean EOF; and
- `owner_retire(handle, command_id)`, exact captured-client retirement.

Replies retain instance/plugin/ledger identity plus `owner_matched`, `revoked`,
`ledger_empty`, `release_ack`, `unknown_release`, `retired`,
`native_resources_retired`, and `receiver_release_verified=false`. Reconcile
fences the owner forever. Repeated command IDs query the current retained ledger
without repeating mutation. These are not frozen per-operation receipts: later
retirement can advance resource facts, while release uncertainty stays sticky.
Repeated commands never
emit again. Tombstones are capped at 4096 with no eviction; uncertainty is sticky.
Reconciliation requires the original compositor/plugin/ledger and exact original
owner identity. Controller or recovery-daemon rehydration may take over only under
the v2-descriptor/capability conditions specified in Piece 1, including verified
old-owner exit. The successor fences old guardian input and replaces the retained
pidfd, but gains release-only authority. Rehydration never makes a legacy
descriptor usable and never reconstructs input authority.

### Positive procedures

**Surviving owner:** hold a button and modifier, sever controller-to-guardian while
leaving plugin/ledger alive, then call recovery with the captured handle and
durable command ID. Verify exactly one release, empty ledger and receiver ups.

**Lost ACK:** drop response after native acceptance. Reconnect/query using the same
command ID. Mutation count stays one; retained ledger evidence remains consistent;
receiver sees only the one
required release.

**Durable takeover:** persist a v2 descriptor/capability, then terminate the
original recovery owner after recording its PID/start ticks. Start an eligible new
owner and invoke release-only `operation: "reconcile"`. Prove the predecessor
pidfd reports exit, the original compositor/plugin/ledger remains exact, the new
owner is recorded before dispatch, and old guardian input is fenced. Then test
stop through rehydration: stop must win, prevent task resurrection, and leave only
the permitted release-only cleanup to finish.

**Active-owner denial:** attempt the same takeover while the original recovery
owner remains alive. It must refuse. Repeat for a legacy descriptor, absent/wrong
capability, mismatched successor identity, changed compositor/plugin/ledger, and
lost retained ledger. Database presence alone is never a pass.

**Receiver evidence:** exact down-before-fault/up-after ordering for every held
key/button, barrier after release, no duplicate event, and source attribution where
supported. Production receipts stay receiver-unverified unless a separate trusted
receiver-evidence ingestion path is reviewed.

**Pass:** exact owner/ledger/command is recovered only under the v2 takeover
conditions; one release mutation occurs at most; ACK, empty-ledger, closure and
receiver events are distinct; and input stays fenced until independently created
fresh authority.

**Fail:** query side effects; untagged release route; ACK treated as receiver proof;
lost ACK resend; replacement compositor receives old release; malformed response
clears quarantine; reconnection grants input; or tombstone eviction permits reuse.

### Required refusals and races

EOF before request; partial write; timeout before/after acceptance; malformed,
truncated or duplicate-field status; stale/unknown command; tombstone exhaustion;
wrong peer/UID/start ticks/boot/instance/plugin epoch/ledger; plugin unload;
compositor replacement; concurrent query/release; two reconcilers; same-button
human hold; and stop at every await. Status must be observational. Human conflict
must defer or require supervised emergency procedure, never desktop-wide release.

## Piece 4: incarnation-bound retirement after failed cleanup

### Sticky-unknown operator remedy

For an ownership ledger marked unknown, the native release guard refuses further
release attempts, including the existing operator `RELEASE-ALL` route. Do not
instruct an operator to repeat it or assume its availability resolves quarantine.
Retire the exact owned resources where evidence permits, verify external cleanup
on the supervised machine, then use the authenticated explicit reconciliation
route. That route records **unverified operator attestation**, not native release
or receiver proof. Missing local-closure evidence keeps the adapter fenced and
retained; confirmed local closure may discard the adapter without clearing durable
native uncertainty. A future emergency override needs a separate reviewed protocol; none is
implemented here.

### Implemented contract under test

Retirement permanently makes one captured incarnation ineligible. Native retirement
may destroy only its captured virtual-client pointer while surviving device identity
still matches. Native resource retirement requires the versioned exact-client
destruction certificate and confirmed local closure. The **retained original pidfd**
reports process exit only. Confirmed local guardian/scope closure is separately
recorded and permits discarding an inactive adapter, not clearing quarantine.
Neither fact upgrades release uncertainty. Guardian death, PID absence, socket
closure, plugin death, replacement-compositor readiness, or a boolean alone is
insufficient.

### Positive procedures

**Surviving matching owner:** begin a held action, force cooperative cleanup to
fail while plugin/device identity survives, then invoke `owner_retire` with exact
handle/command. Verify only the captured virtual client is destroyed, old authority
cannot return, and release/receiver certainty remains what was actually observed.

**Host reboot boundary:** create unknown-release quarantine and preserve evidence,
then reboot only the dedicated machine. Prove boot ID changed and old volatile
resources cannot survive. Retire historical authority without claiming action or
receiver success. Do not resurrect the old session/action. Any continuation needs
a new recovery session, explicit target and fresh pixels.

**Original-compositor exit:** create unknown-release quarantine, retain the
original compositor pidfd, stop that disposable compositor, and confirm both its
pidfd exit and local guardian/scope closure. Expect `original_compositor_exited=true`
and `local_resources_closed=true`, but `resources_retired=false`,
`retirement_basis=unproven`, and `released=false`. It must not establish
native-owner retirement, action success, or receiver release. The controller
remains `operator_release_required` while the locally closed adapter can be
discarded to permit the explicit external-cleanup attestation route.

**Failed proof:** same-boot PID absence without the retained original pidfd,
guardian SIGKILL, socket unlink, plugin disappearance, and replacement-compositor
readiness must remain quarantined and expose operator remedy. A replacement
compositor never vouches for the old ledger.

**Receiver evidence:** retain actual down/up/disconnect ordering. Retirement may
pass while receiver release remains unknown, but the report must say so. Prove no
later receiver event can originate from the retired incarnation, including delayed
callbacks and endpoint recreation.

**Pass:** retirement binds exact owner/incarnation/device lifetime; historical
uncertainty remains; old grants/callbacks refuse; replacement uses new authority.

**Fail:** process death substitutes for lifetime proof; replacement vouches for old
ledger; unknown becomes confirmed; evidence is deleted; delayed work rearms input;
or reboot resumes an old action/session.

## Cancellation, stop, and crash matrix

For every piece, pause/stop at: initial fence, release submission, status query,
idle wait, discovery, plugin preparation, inventory, focus, capture, durable grant,
backend commit, successor startup and model handoff. Use deterministic fixture
gates, not timing luck. The current controller recovery wrapper bounds the native
task at **22 seconds**. The backend's native recovery block has an internal
**20-second** ceiling, so its own work must finish within 20 seconds and the
controller must complete or fence it by 22 seconds. Record both measured bounds;
neither is a receiver-release claim.

Verify durable generation/consent/stop epoch advances before awaits; OOB stop does
not wait on the action lock; late success cannot alter state; pause requires
explicit resume; stop forbids task resume although release-only cleanup may finish;
unknown release stays visible; and rehydration either queries the exact durable
command under the v2 takeover conditions or refuses. It never repeats mutation,
input, or task execution. Define and record an acceptable OOB latency before the
run. Reachability is not release evidence.

## Offline and native pre-gates

Run focused implementation tests named by the final diff, plus existing anchors:

```sh
.venv/bin/python -m pytest -q --no-cov \
  tests/test_hyprland_durable_reconnect.py \
  tests/test_hyprland_reconnect_protocol.py \
  tests/test_hyprland_reconnect_protocol_native.py \
  tests/test_hyprland_recovery_backend.py \
  tests/test_hyprland_recovery_controller.py \
  tests/test_hyprland_recovery_end_to_end.py \
  tests/test_hyprland_recovery_store_atomic.py \
  tests/test_hyprland_recovery_tool_schema.py \
  tests/test_hyprland_scope_parser_r45.py \
  tests/test_hyprland_release_channel_r41.py \
  tests/test_hyprland_input_loss_campaign.py \
  tests/test_computer_hyprland_durable_fence_r42.py \
  tests/test_hyprland_handoff_campaign.py \
  tests/test_computer_reconciliation_r18.py
```

Record exit status and per-file counts. Extracted native fixtures prove shipped
state-machine bytes under simulated transport. They do not prove ABI load,
compositor lifetime, mapped image, native event delivery, or receiver release.
Build and test the complete tuple separately.

After shared controller/store/tool-schema changes, run full repository gates plus
X11 and portal-Wayland regression matrices. Confirm every
`src/computer/runtime/x11_*.py` is byte-identical to the agreed baseline, but do not
treat filename identity alone as enough: shared lifecycle, persistence, API and
cancellation must pass.

## Final decision record

Produce a reviewed matrix with one row per scenario: candidate SHA, tuple,
environment, evidence path, exit status, verdict, reviewer and limitations. Failed
or missing scenarios remain failed or missing. Do not edit manifest/configuration
during a run to record a desired outcome.

`runtime_qualified` may move only for the exact tuple after the supported positive
procedures pass, including lost-ACK query/persistence, new-owner restart,
active-owner denial, stop during rehydration, and repeated compositor-death task
lineage through external cleanup/attestation and a fresh successor; compositor-
death/dead-ledger cases must record their required fail-closed refusal. All other
refusal/race/cancellation/reboot boundaries must fail closed; full tuple,
orchestration and managed activation must be separately demonstrated; X11 and
portal gates must pass on the same SHA; and an independent reviewer must reproduce
every evidence-to-verdict decision. Until then the only honest value is false.
