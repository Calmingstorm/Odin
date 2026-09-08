# Computer use: decision record

Status: build decisions, 2026-09-06. Base: `d5fc7eb` (v3.95.0), fetched and
fast-forwarded from master before branching. Branch: `feat/isolated-computer-use`.
> Historical decision record. Current setup and the R11 implementation contract
> live in OPERATOR.md. Past app restrictions and named machine artifacts are not
> current capability gates or consent for another user's session.

Authority: the operator's build authorization recorded in the review document of
2026-09-06. No deployment, restart of Odin, master merge, tag, or release pipeline.

## Revision R8: compositor-specific Wayland input admission (2026-09-07)

The product requirement is production Wayland support in this branch. Replace the blanket
platform refusal with an actual input adapter and compositor-specific admission.
Qualify at least one unmodified distribution compositor, not only the previously
patched laboratory build. Preserve the X11 implementation and all ordinary tools.
The new adapter still needs consent, source-local mapping, application grounding,
bounded independent input release and application-preserving detach.

Session admission must distinguish a measured button-release defect from missing
evidence or missing portal/input facilities. A refusal must identify the detected
compositor/build and tested backend when known, explain the actual failed check,
and provide an operator remedy. A version string alone is not a behavior proof:
vendor patches, loaded library identity and native versus nested backends matter.

The startup test itself is subject to the no-damage rule. Never discover whether
a compositor leaves buttons held by deliberately abandoning held input on the
operator's desktop. A duplicate EI descriptor prevents genuine last-owner EOF;
an ordinary release, a replacement device, or a successful portal Close cannot
be substituted for measured EOF release. Destructive or unsafe demonstrations are
not authorized. Evaluate contained behavioral qualification and exact active-stack
binding, and explicitly document which parts are measured versus inferred. Do not
claim that testing a different compositor instance proves the running instance.

All new graphical/fault tests use owned disposable environments. No production
deployment, restart, live-install edit, main-session input experiment, master merge,
tag or pipeline. Record actual qualified/refused versions, cleanup evidence,
remaining limitations and local test results before claiming completion.

R8 implementation choice after read-only source review: native-headless Mutter and
the native hardware compositor share `META_TYPE_BACKEND_NATIVE`,
`META_TYPE_VIRTUAL_INPUT_DEVICE_NATIVE` and its per-device disposal release path.
The headless backend disables physical libinput. Use this same-stack disposable
test, with active-code identity checks before/after, instead of deliberately
stranding a button on the operator's seat. This is a same-implementation inference,
explicitly not direct measurement of the active instance. A stock compositor must
still pass graphical execution; source review alone never marks it qualified.

## Revision R7: autonomous cleanup and qualified offerings (2026-09-07)

The reported Cinnamon wake issue is a pre-existing operator/compositor issue,
not an Odin defect. Do not add a compositor restart, wake workaround, periodic
monitor probe, or automatic production display-configuration repair for it.

Separate two contracts. Production attached cleanup revokes input, releases only
owned presses, reaps owned workers and purges private evidence without depending
on a fresh screenshot, stable topology, or awake monitors. It leaves the user's
applications and intended document edits alone. It must not restore an old desktop
layout over a user's new layout or move the shared pointer back after ordinary use.

The opt-in exclusive scratch harness has a stricter leave-as-found transaction.
After stopping input and its own scratch processes, automatically restore the
validated, durably recorded topology when its resource inventory still matches,
then baseline window metadata, focus/pointer, and finally original power state.
Use bounded attempts, independently recorded stages and a final exact comparison;
failure of one stage must not prevent process/evidence cleanup or power restoration.
Only geometry-only position drift of an identity-verified hidden baseline client
may be repaired, and only under that explicit scratch transaction after topology
restoration; never unhide, activate, resize, or edit that client to force a pass.

Physical unplug/replacement, changed resource identity, concurrent user input,
unresponsive X server, and unknowable guardian death cannot safely be made into
verified restoration by retries. Report exact unfinished stages and required
operator actions, retain uncertainty, and never replay the GUI task. Reproduce
faults only in owned private displays or harmless stub primitives, never the user's
desktop. Application offerings must match measured tasks: unqualified Calc/Draw
and Writer lifecycle operations must either gain independent qualification or
cease to be offered. No deploy, restart, merge, tag, pipeline or live-install edit.

## Revision R6: reaping and useful attached applications (2026-09-07)

The current assignment explicitly adds the shipped service's growing zombie leak
to this branch. Diagnose production read-only and reproduce/fix in development;
never restart, inject into, or modify the running service to clear the symptom.
Preserve subprocess ownership of exit status. Age, process name and parent PID
alone are not proof that an exit status is abandoned. Regression tests must mix
short-lived orphan descendants with still-owned asyncio/Popen children, verify
their actual exit codes, and contain/reap the experiments themselves.

Existing-session Xed alone is not the requested usable capability. Extend the
explicit native application profiles to installed LibreOffice document tools,
starting with useful Writer and Draw tasks, with exact executable/XRes/process
identity and freshly grounded application/dialog scope. A broader catalogue is
not qualification: demonstrate actual GUI work and independent saved/reopened
artifact checks before calling an application qualified. Keep isolated launch
profiles separate; do not imply a newly attached profile works in the sandbox.
Interpreter argv and window names must not become execution-provenance shortcuts.
Unknown applications and unsafe dialogs remain refused, including terminals,
credential/security prompts and Odin's control plane. Macro execution is outside
this increment. Preserve source mapping, finite input leases and no-replay rules.

Development and fault/lifecycle tests stay on private displays. Any current-grant
main-session verification is scratch-only, first proven privately, with private
evidence and exact before/after restoration. No existing work is modified. No
deployment, restart, master merge, release pipeline, tag or live-install edits.
The handoff must name the applications and operations actually qualified, not
generalize from either a fake fixture or one successful editor keystroke.

### R6 action-specific attached keyboard grounding

Under R2's accepted shared-widget-focus limitation, X11 existing-session `type` and
`key` actions ground to the freshly revalidated same native application, focus,
modal and source binding, not equality of every screenshot pixel. Exact source
geometry/revision, consent and native application scope remain mandatory. This
permits caret blinking and other raster-only changes; it does not establish that
the same internal widget or document content remains unchanged. Click/drag and
all isolated actions retain full-raster equality. Freshness, delivery, authority,
per-key guardian checks, unexpected-modal pause and durable no-replay receipts
are unchanged. See `KEYBOARD-GROUNDING-R6.md` for the tradeoff and boundaries.
Other platforms retain full-raster equality pending their own grounding review.

## Revision R5: complete the deploy-testable capability (2026-09-07)

### R5 crash workload recovery (2026-09-07)

Recovery is operator-owned read-only reconciliation, never automatic replay or
blind database clearing. Constructor recovery only fences generations and marks
pending receipts unknown. A separate bounded asynchronous operator call verifies
the exact persisted runtime; success closes the quarantine, preserving receipts
and evidence. Current owner/host authority is checked before and after inspection,
and the result uses a generation compare-and-swap. Model observation reconcile
does not grant this recovery capability. No historical workloads are terminated.

Production adapters generate an immutable startup descriptor before launch and
persist every native process identity before sending its launch/request gate.
An isolated descriptor contains the unpredictable exact systemd unit, boot ID,
supervisor PID/start ticks and launch-pending state. Attached descriptors record
all finite capture/guardian process identities, no-device-creation evidence and
whether input was enabled. Runtime IDs stay private, absent from model/API status.
The existing isolated two-second lease and 1200-second unit maximum remain;
elapsed time alone never proves cleanup. Inspection first proves launch-capable
processes/groups gone, then verifies unit inactive/no job/no PID and its fixed
cgroup absent or unpopulated. PID reuse never authorizes signalling; zombies and
unknown inspection results remain incomplete. The recovery code never calls unit
stop, kill, reset-failed, restart or display APIs.

A crash in the spawn-to-PID persistence gap remains `launch_identity_incomplete`.
Shared attached XTEST input may remain held after abrupt sole-guardian death:
the ledger is lost, the native consequence is untested, and no universal
server-side release guarantee is proven. Cooperative/acknowledged cleanup with
a surviving guardian is a distinct path. Process absence alone does not prove
owned-input release. Such input-enabled sessions remain quarantined
with `owned_input_release_unproven`, not a fabricated release or app-survival claim.
Capture-only sessions can be reconciled by exact process absence. Host restart
invalidates prior-boot processes and input state. Failed/unknown reads do not close
quarantine and can be retried by the operator after independent cleanup.

Pre-descriptor development stores report actionable `operator_cleanup_required`.
The separate, non-model legacy acknowledgment requires exact session identity,
generation and `ACKNOWLEDGE UNVERIFIED CLEANUP <session_id>` from the operator after
independent workload checks. It archives the quarantine to unblock admission but
persists `operator_acknowledged_unverified` and cleanup complete=false, never a
claim that the bot verified old workload or device removal. Ordinary stop/status
cannot silently perform this acknowledgment. No existing session is tested or
cleaned during development; deterministic fixtures exercise recovery.

The operator's instruction requires a working end-to-end GUI task and active,
configured-only production wiring, not another preparatory checkpoint. Continue
on this branch; no deployment, live-install edits, restart, master merge, tag or
pipeline. Local validation and reviewable skip-CI commits remain the delivery path.

Priority is owned-input safety first: resolve the measured Wayland sender-EOF
button-release failure or establish a precise unsupported boundary. A compositor
disconnect or successful portal Close is not release evidence. Unsafe input
backends must stay unavailable, even when capture succeeds. X11 shared focus is
accepted, but application-preserving detach and no stuck owned input remain gates.
Use disposable application event telemetry to establish these before real input.

Next complete real GUI work, including safe recovery from observed application
startup dialogs. A modal is not automatically permission and not automatically a
permanent dead end: observe afresh, identify the approved application's harmless
dialog, ground the exact action and verify its effect. Terminal, security-prompt,
control-plane and existing-work protections stay unchanged. No generated file may
be presented as a GUI-created artifact. Preserve durable no-replay receipts.

Finally wire lazy lifecycle, native transport, authenticated APIs and operator
controls into normal production startup. Disabled startup remains inert. Backend
selection, display/session binding and persistent settings are operator-owned,
never model-provided. Runtime status must distinguish configured availability,
capture capability, input eligibility and measured unsupported conditions.

The actual main-session topology included an additional primary monitor omitted
by a truncated earlier list. R4's full measurements supersede that incomplete list;
fresh source-local topology is authoritative, not a hardcoded fixture. R4's bounded
overnight grant and leave-as-found constraints remain; workers have no implicit
permission to access the main session. Historical service-owned zombies stay alone.

R5 model-backed validation exposed a transport-level schema defect: omitted strict
mode caused the backend to fill every operation-specific optional action property
with dummy values, including unrelated coordinates and keys. Controller rejection
was correct. Computer definitions now explicitly request non-strict generation;
the converter preserves an explicitly boolean strict field while leaving all
existing unannotated tools byte-for-byte unchanged. Runtime validation remains
strict and authoritative. The final model task must use these shipped definitions,
not a harness-only schema or silently scrubbed model arguments.

## Revision R4 — bounded overnight main-session testing (2026-09-07)

Authority: the reviewer relayed the operator's explicit authorization to test the main
session overnight, including waking monitors if necessary, with nothing destructive.
This supersedes the historical blanket display-0 prohibition for this testing
window only. It is not deployment authorization or standing unattended access.

No terminal input, Odin WebUI interaction, existing-work modification, save-over,
application closure, desktop/session restart, or control-plane change is permitted.
Do not change accessibility flags or session settings to manufacture a pass. Prefer
read-only topology/capture checks and newly launched, identifiable scratch apps;
only those test-owned apps may be closed. Preserve existing focus/pointer/layout
and record restoration independently. Keep screenshots private and do not post
operator workspace contents. No agent receives main-session access implicitly.

Nobody is available to issue stop tonight: independently enforced finite leases,
cancellation, owned-input release and application-preserving cleanup remain gates,
not aspirations. The X11 private corpus passed release but retained ENABLED devices.
That does not yet establish leave-as-found detach on an existing desktop. Do not
create/remove master devices on the main session merely to repeat that corpus;
prove a safe lifecycle in disposable sessions first. Real capture-only testing is
useful evidence and must not be labelled real-session input acceptance.

Continue build in the existing branch, with local validation and reviewable
increments. No deployment, live-install edits, Odin restart/injection, master merge,
tag or pipeline. Packages may be installed under R2, recording reversible changes.
The acknowledged historical service-owned zombies are dead and out of scope for
further reap attempts. New fixtures still need exact-identity cleanup verification.

### R4 isolated-launch correction, after non-graphical preflight

The first two runtime launches failed before graphics. Four subsequent diagnostic
units ran only true or a read-only containment probe. Measured failures: bwrap0.9
requires explicit --unshare-user with --disable-userns; inherited systemd masked
proc submounts prevented a new private proc mount; /dev/shm was not a mount point
for the old remount operation. The fourth diagnostic exited0 with uid65534,
private PID2, read-only private proc/shm, absent host home/display/devices/sys.

Use explicit user namespace creation; remove outer ProtectKernelTunables and
ProtectKernelLogs masked-proc setup ONLY for this fixed bwrap bootstrap and mount
the resulting private proc read-only instead. No host proc/sys tree is exposed to
the application. NoNewPrivileges, empty capability sets, strict filesystem/home,
private network/devices, owned cgroup and resource bounds remain unchanged. Create
a bounded private shm mount before remounting it read-only. Add deterministic
profile assertions and repeat actual containment checks before any GUI action.
This is not permission to weaken the sandbox until it happens to launch.

Further scratch-only startup diagnostics exposed the host NVIDIA GLX initialization
crashing private Xvfb before ready. Match the previously successful private XI2
fixture: disable GLX only on the new private X server, and precreate its owned
socket directory. Drawing/Xed use the 2D path; hardware/GL applications are not
approved profiles. Do not alter the host driver, compositor or any real-session
graphics setting. Failed startup must remain failed, not a fake ready receipt.

## Revision R3 — ordinary-turn tools, no conversation restriction (2026-09-07)

The operator's binding ruling in `10-ruling-no-channel-lock.md` and the current task
supersede Q5's restricted-actor/conversation mechanism completely. Computer tools
run in an ordinary foreground turn alongside every other authorized tool. A
desktop session is only an internal capture/input/application lifetime; starting,
observing, acting, stopping, failing, disabling or restarting it must not change
any unrelated tool's availability, in this turn, later turns, or for other people
in the channel. No lock, conversation mode, durable restriction, or batch fence.

Remove the restriction schema, store/controller methods, integration guards,
dispatch hooks, tool-description clause, and tests that required that behavior.
Discard any obsolete restriction table when opening a pre-R3 development store;
keep session ownership, receipts and evidence intact. Regression tests must run
ordinary tools alongside an active desktop task, after close/failure/recovery,
and from a later turn and another channel participant. Mixed tool batches remain
ordinary batches, not a hidden authority transition.

Desktop observations remain explicitly untrusted data, never user authority.
The desktop capability's own refusal classes, foreground admission, task/host
ownership, generation fencing, bounded input, private evidence and postconditions
remain unchanged. Removing the conversation restriction does not grant a desktop
action permission to operate terminals, security prompts or Odin's control plane.
The narrow agent image-stringification repair also remains in scope.

Continue feasibility and grounded-action work only in disposable environments.
No deployment, service restart, active-workstation automation, merge or pipeline.
Cleanup reports must distinguish dead unreaped children from live workloads;
do not modify the running service or its parent to manufacture complete reaping.

## Revision R2 — overlap accepted, damage forbidden (2026-09-07)

Authority: the reviewer relayed the operator's revised instruction: packages may be installed
using judgement; prefer contained/rootless dependencies and record every host
installation for reversal. The operator accepts occasional overlap between user and
Odin's input. This supersedes R1's absolute pointer/keyboard separation gate and
per-package approval requirement, not its authority, consent or lifecycle rails.

Shared widget focus is a supported, explicitly reported limitation rather than
an automatic backend disqualification. Unknown separation must be reported as
unknown, never independent. Input still requires a verified source mapping,
bounded operations, task consent, observable focus evidence (including unknown),
and honest receipts. Detected focus changes invalidate keyboard grounding; never
claim atomic exclusive widget focus or blindly retry an uncertain text action.
Neither a painted cursor nor moving/restoring the human pointer proves separation.

Overlap does NOT authorize damage. Application-preserving detach and bounded
owned-input release after client loss remain mandatory independent gates. Never
release the human's held keys/buttons. A failed cleanup must report failure and
deny further input, not silently delete a device while an application uses it.
X11 is a candidate again; evaluate release-before-remove plus an independently
supervised, explicitly owned device lifecycle. A safely disabled retained owned
device may be investigated instead of unsafe removal, but must not be hidden as
complete removal. Wayland remains a first-class candidate and needs its own
measured release/disconnect/application-survival evidence. No runtime activation
or real-session access follows from accepting overlap.

R1 cleanup correction: empty container inventories and inactive fixture units
did not establish host-process cleanup. Initial R2 inspection found one live
Podman pause helper and three already-defunct conmon children adopted by the live
Odin process. Cleanup must distinguish workload containers, helper processes,
zombies, resources and retained evidence. Scope actions to exact recorded owned
identities, never broad kill/prune or restart the live service to hide leftovers.
Document residuals honestly when the parent cannot safely reap them. Future
fixtures need an owned reaping supervisor and host-level postconditions.

Sequence: record this amendment; correct admission/capability tests; repair
fixture cleanup; evaluate X11 and Wayland lifecycle in disposable sessions before
building grounded actions on either. No destructive demonstration, live install
edit, live session automation, deploy, restart, merge, tag or pipeline. Existing
R1 findings below remain historical evidence, not current eligibility rules.

## Revision R1 — assisted-session and platform correction (2026-09-06)

Authority: accepted reassessment (`09-odin-replan.md`) and the reviewer's subsequent
instruction on the operator's behalf. The earlier Q1 X11-only staging and the earlier
source-pixel interpretation of Q3 are superseded below, before dependent code.
Existing commits remain; this is a requirement correction, not a silent rewrite
of their history. Stages 7/8, deployment, release, and live desktop access remain
unauthorized. No application or session on the user's desktop is a test target.

The destination is on-demand assisted work in an operator's existing session,
with the operator present. Isolation is the first safety/development tier of
that product, not a separate product. Platform (X11/Wayland) and authority tier
(isolated/existing-session) are independent. Shared contracts must not assume
the supervisor launched the desktop or applications, disposable applications,
an offline host, arbitrary window enumeration, or a global coordinate space.
Existing-session stop means revoke capture/input and release ONLY Odin-owned
devices/keys; it must never terminate the session or its applications.

Independent pointer AND safe keyboard/focus coexistence are experimental gates,
not promises. A painted cursor and move-then-restore of the human pointer are
failures. Shared or unknown input separation is ineligible for assisted actions;
there is no silent XTEST/uinput/privileged fallback after compositor denial.
Backend-wide key cleanup remains fenced to the private display; an existing
session cannot inherit it through the adapter. Optional accessibility is not a
permission to enable settings in the operator's session.

### R1 coordinate and consent contract — multi-source from day one

Every frame/action binds an opaque task/session grant, consent generation,
opaque capture source ID and source revision. Delivered image pixels map
explicitly through a crop/affine transform into SOURCE-LOCAL input coordinates.
Source pixel dimensions and delivered dimensions are distinct; logical input
extent, rotation, fractional scale and input-region identity are explicit when
known. Missing input mapping means capture-only, not scale=1. Sources may be
granted independently; capture scope, input reach, and task authority are separate.
No XID, display number, global desktop coordinate, or cookie in public contracts.
Resize, rotation, scale/region changes, source replacement/removal, consent
revocation and device replacement invalidate bindings. Never retarget a stale
frame to another source, even if its dimensions match.

Multiple monitors with differing origins and scales are a day-one destination
requirement. The reviewer's read-only report of the operator's layout is a synthetic test
fixture, NOT permission to inspect or automate it: 1920x1080 at +2701+1440,
2560x1440 at +5360+0, and 1920x1080 at +0+213 (7920-wide bounding span).
Backend-private placement can describe this arrangement, but the span is not an
action plane. Include negative origins, fractional scale, rotation, gaps, crops,
round trips, and hotplug/revision invalidation in deterministic tests. No action
may be inferred by dividing coordinates by a desktop-wide scale factor.

### R1 sequence and feasibility gate

1. Amend this decision record (this increment).
2. Correct contracts, multi-source geometry and tier-specific lifecycle; keep
   the current X11 runtime private and default-off.
3. Experiment on private X11 and Wayland sessions before layering new transport,
   operator UI or grounded-task features. Record actual server/compositor/toolkit
   versions and application event delivery, human pointer position/focus, held
   modifiers, grabs/dialogs and cancellation. Exercise attach/detach to an
   existing DISPOSABLE session without killing its applications.
4. Build purpose-specific bounded observations from those results; still prove
   native pixels in the final serialized request and preserve analyze_image.
5. Complete grounded actions/recovery/operator controls, then the Stage 6 corpus.

Wayland consent/capture/input path: RemoteDesktop + ScreenCast portals, PipeWire,
ConnectToEIS/libei, capability-negotiated. Missing components or compositor
features produce precise unsupported/degraded results, never a pass. Prefer a
private dependency prefix/container using existing facilities; any system-wide
installation requires the operator's authorization. Unsupported feasibility findings are reviewable
results, not Stage 6 completion. Do not build atop an unverified input guarantee.

R1 review clarification: the synchronous private capture adapter does not supply
a trustworthy source timestamp yet. Record the controller's request-start time
as an explicitly labelled conservative lower bound, never the time the response
arrived. This relies on the adapter taking a NEW capture for each request; buffered
Wayland frames will require source timestamp/clock-domain validation before that
adapter can claim freshness. Reject observations already expired on arrival and
recheck both original and verification frames after awaited capture/authorization.
Store immutable render provenance; public serialization must not mutate receipts.

## Q1 — First-release environment (R1 corrected)

An offline desktop in its own mount, PID, IPC, network, and session-bus
namespaces. X11 uses private Xvfb; Wayland requires its own private compositor,
portal stack and mediated input. A dedicated ephemeral unprivileged identity is
preferable to adding a permanent host account: use systemd DynamicUser where
available, and fail closed if the required isolation cannot be established.
Only approved installed applications and controlled staged inputs are supported.
No host display sockets, desktop bus, Xauthority, home, clipboard, devices,
credentials, or writable runtime. Never discover or fall back to display `:0`.
Arbitrary downloaded documents, browsers, external effects, and VM work are later.
Namespace isolation shares the host kernel; it is not a hostile-content VM.

## Q2 — Applications and showcase

Use the installed Drawing application (GTK) and Xed editor for the initial
profiles. Pinta is not installed; installing it system-wide needs operator authorization, and is
not necessary to prove this capability. App profiles are fixed executable/argv
allowlists, not shell strings. The showcase is a GUI-created annotated drawing,
saved/reopened PNG and companion editor note, plus harmless layout and modal
recovery. No generated image may masquerade as GUI drawing. Editable native
documents are supported only where the selected app actually has that format.
If application capabilities force a change, record it before implementation.

## Q3 — Evidence

Private evidence expires at a fixed 24 hours (reads do not renew it). Start with
64 MiB per session and 256 MiB global, maximum 2 MiB and 2 million DELIVERED pixels
per frame, one current source overview plus at most one matching detail crop in
the model working set. R1: source geometry is NOT subject to this pixel cap.
1920x1080 (2,073,600 pixels), 2560x1440, 4K and wide multi-monitor layouts must
support bounded downsampled overviews and readable crops. The old source check
rejected even 1080p; preserving it is not a defensible memory bound. Source
capture allocation must instead be bounded independently at the backend, with
explicit capability failures and no unbounded full-desktop intermediates.
Audit receives bounded provenance/receipt summaries, never pixels/base64 or
typed text. Export requires an explicit bounded file selection; retrieval checks
current authorization. Export is a download, never execution or an arbitrary
host destination. Symlinks, traversal, special files, and raced substitutions
must fail closed. Workspace storage is separately bounded.

Private durable state defaults to `/var/lib/odin/computer`, not a CWD-relative
deployment directory. An operator must provision that directory for Odin's
service identity before enabling the feature. Development tests use explicit
private temporary directories. No auto-sudo directory creation or silent path
fallback is allowed.

## Q4 — Resources and responsiveness

One active session globally. Initial ceilings: 1 GiB RAM, one CPU, 128 processes,
256 MiB writable workspace; task 20 minutes, 200 actions. Eight operations per
batch at most, two seconds active input per call, at most 256 polyline points.
No held input across calls. Controller-loss lease is two seconds; target normal
stop/release latency is 250 ms, isolated termination/quarantine within 3 seconds.
These are acceptance targets until measured, not claims of observed performance.
Resource enforcement is mandatory, not a model instruction. No system-wide
package installation is authorized; use existing dependencies or ask the operator.

## Q5 — Execution surfaces and the confirmed image defect (restriction superseded by R3)

Historical Q5 below is retained only to explain the removed design, not as an
implementation requirement. R3 above is binding.

Foreground Discord/WebUI initiation only through Stage 6. A desktop task is a
server-enforced restricted actor, not a new root-capable shell assistant. Its
tools cannot delegate, schedule, create skills, or call another privileged route.
Desktop-derived output cannot reopen privileged tool access in that task, even
after the session closes. General agents/loops/schedules remain denied.

Implementation clarification, recorded before dispatch integration: the durable
restriction applies to the entire conversation/channel, not only its original
requester. Discord history is shared; a different participant must not inherit
desktop observations with unrestricted tools. It remains effective after close,
disable, and restart. Use a genuinely new empty conversation for unrelated
privileged work. Clearing a session or changing principal is not an authority
reset. An already queued mixed computer/privileged tool batch is restricted
before any member begins, preventing admission races.

Fix the confirmed spawned-agent image-dict stringification inline in Stage 3 as
a narrow safety repair: unsupported image results become bounded, explicit
capability failures, never `str(dict)` with base64. Do not add agent vision or
loop/scheduler desktop authority here. Preserve existing foreground image
delivery and prove the final serialized model request contains native pixels.

## Q6 — External accounts

For the isolated Stage 6 tier: excluded, not deferred behind a permissive flag.
No network, authenticated
websites, host-service access, admin prompts, terminal profile, arbitrary
executables, or security-setting changes. An unexpected modal pauses and requires
fresh evidence; it never confers new authority. A future online tier needs its
own grant/effect/approval design and is outside this branch. Existing-session
attachment is the same product's destination, not a weakening of this tier;
its architecture and disposable-session feasibility are in scope now, but
authorization to operate the user's real session is not.

## Q7 — Acceptance and honesty

All deterministic authority, stale-frame, unknown-effect/no-replay, cancellation,
image-delivery, export, and default-off compatibility checks must pass. No false
verified-success result is acceptable in the negative corpus. A meaningful
supported-task corpus targets at least 27/30 successes, independently checking
saved artifacts, plus repeated harmless recovery trials. Record denominators,
failures, dependency/version details, and measured stop latency. Compare enabled
and disabled overhead; target under 5% existing-workload latency regression under
the resource ceiling. A single attractive demo does not satisfy this gate.
If live graphical testing or comparative measurement cannot be completed,
publish it as a review blocker rather than claiming Stage 6 complete.

## Scope and review increments

0. Decisions, contracts, acceptance specification (this commit).
1. Default-off admission, task authority, capability/tool policy.
2. Isolated session supervisor, finite input leases, stop protocol.
3. Typed observations, private evidence, foreground pixels, agent safety repair.
4. Grounded actions, receipts, postconditions, reconciliation, cancellation.
5. Authenticated operator view, pause/stop, explicit export.
6. Real multi-step offline GUI validation, recovery corpus, regression evidence.

Stages 7/8 are not authorized. No :0 automation or modification of its
accessibility flags is permitted. Its previously verified flags are off; detect
that only read-only when needed, and enable accessibility solely inside the
private environment. Never use a destructive command as a test, even one
expected to be rejected. Use harmless markers and stubbed primitives.
