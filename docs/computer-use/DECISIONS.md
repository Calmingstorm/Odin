# Isolated computer use: decision record

Status: build decisions, 2026-09-06. Base: `d5fc7eb` (v3.95.0), fetched and
fast-forwarded from master before branching. Branch: `feat/isolated-computer-use`.
Authority: Aaron's build authorization recorded in the review document of
2026-09-06. No deployment, restart of Odin, master merge, tag, or release pipeline.

## Q1 — First-release environment

An offline Linux/X11 desktop in its own mount, PID, IPC, network, and session-bus
namespaces, with private Xvfb. A dedicated ephemeral unprivileged identity is
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
64 MiB per session and 256 MiB global, maximum 2 MiB and 2 million pixels per
frame, one full current frame plus at most one crop in the model working set.
Audit receives bounded provenance/receipt summaries, never pixels/base64 or
typed text. Export requires an explicit bounded file selection; retrieval checks
current authorization. Export is a download, never execution or an arbitrary
host destination. Symlinks, traversal, special files, and raced substitutions
must fail closed. Workspace storage is separately bounded.

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

Fix the confirmed spawned-agent image-dict stringification inline in Stage 3 as
a narrow safety repair: unsupported image results become bounded, explicit
capability failures, never `str(dict)` with base64. Do not add agent vision or
loop/scheduler desktop authority here. Preserve existing foreground image
delivery and prove the final serialized model request contains native pixels.

## Q6 — External accounts

Excluded, not deferred behind a permissive flag. No network, authenticated
websites, host-service access, admin prompts, terminal profile, arbitrary
executables, or security-setting changes. An unexpected modal pauses and requires
fresh evidence; it never confers new authority. A future online tier needs its
own grant/effect/approval design and is outside this branch.

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
