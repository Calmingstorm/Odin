# Computer use: decision record

Status: build decisions, 2026-09-06. Base: `d5fc7eb` (v3.95.0), fetched and
fast-forwarded from master before branching. Branch: `feat/isolated-computer-use`.
Authority: Aaron's build authorization recorded in the review document of
2026-09-06. No deployment, restart of Odin, master merge, tag, or release pipeline.

## Revision R1 — assisted-session and platform correction (2026-09-06)

Authority: accepted reassessment (`09-odin-replan.md`) and Claudia's subsequent
instruction on Aaron's behalf. The earlier Q1 X11-only staging and the earlier
source-pixel interpretation of Q3 are superseded below, before dependent code.
Existing commits remain; this is a requirement correction, not a silent rewrite
of their history. Stages 7/8, deployment, release, and live desktop access remain
unauthorized. No application or session on Aaron's desktop is a test target.

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
requirement. Claudia's read-only report of Aaron's layout is a synthetic test
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
installation requires Aaron. Unsupported feasibility findings are reviewable
results, not Stage 6 completion. Do not build atop an unverified input guarantee.

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
profiles. Pinta is not installed; installing it system-wide needs Aaron, and is
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
package installation is authorized; use existing dependencies or ask Aaron.

## Q5 — Execution surfaces and the confirmed image defect

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
authorization to operate Aaron's real session is not.

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
