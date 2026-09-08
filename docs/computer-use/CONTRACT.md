# Computer contract and acceptance matrix (R8)

Three configured-only tools: `computer_session`, `computer_observe`,
`computer_act`. No desktop dependency imports, prompt text, processes, listeners,
or additional model-visible definitions when disabled. Existing tool ordering
and schemas are unchanged. Feature collision names are reserved when enabled.

Admission binds requester, channel/web session, host authorization, root turn,
task/session and generation server-side. Model arguments never set identity,
approval, host display, executable, socket, bus, or runtime path. Only foreground
entry is admitted for desktop tools. Desktop tools run in an ordinary turn alongside
all other authorized tools, including mixed batches. Session start, close, failure,
recovery, disable and later turns never narrow another tool's availability for the
requester or other channel participants. There is no conversation mode or durable
restriction. Obsolete pre-R3 restriction tables are dropped on store open without
erasing sessions, receipts or evidence. Observation text remains untrusted data and
cannot grant another tool's authority. Desktop refusal classes and owned-session
fences apply to desktop actions only; generic non-computer tool scopes are unchanged.

Platform (X11/Wayland) is independent of environment (isolated/existing-session).
Launching an application, offline access and disposable processes are isolated
backend properties, never shared session prerequisites. Real-session assisted
work is the destination of the same product. Explicit R4 overnight authorization
permits bounded, harmless main-session tests, not deployment or standing access.
Both platform families are feasibility gates now; input eligibility remains
separate from a successful capture-only experiment.

States: starting → active → paused/cancelled/closed/quarantined. Resume requires
a new generation, renewed authorization and a new observation. Stop fences the
task and consent bindings first, disconnects capture/input, and attempts release
of only owned devices/input, reporting unverified cleanup rather than success.
Isolated backends may tear down their owned sandbox;
existing-session backends must leave applications and the desktop alive. A human
does not have to stop using the machine for us to revoke agent authority.
Private-display-wide key cleanup is never available to existing-session adapters.

Observations bind an opaque ID to task generation, consent generation, monotonic
capture time/expiry, opaque source ID/revision, delivered raster dimensions,
source-local geometry and explicit crop/affine input transforms. Optional focus,
modal and semantic evidence can be unknown; missing evidence is not permission.
No public display number, XID, desktop-global coordinate, bus address or cookie.
Capture scope, input reach, task authority, pointer/keyboard separation, owned-input
release and application-preserving detach are separate capabilities. Capture
permission is not input confinement. R2 accepts shared or unknown separation when
honestly exposed to the operator/model; unknown cleanup is not a clean result.
Existing-session input requires verified owned-input release and application-safe
detach regardless of separation. R5's bounded X11 guardian supplies these measured
capabilities with shared-input and crash-recovery limitations documented in the
handoff. For shared X11 these capabilities describe cooperative/acknowledged
cleanup with a surviving guardian, including injector/helper failure. Abrupt death
of the guardian itself loses its sole ledger; the native consequence is untested
and no universal server-side release guarantee is proven. Process absence or
worker-fence receipts alone do not establish release of held server-side input.
R8 replaces blanket Wayland refusal with per-session compositor-specific
admission. A laboratory patch or a version string is not production qualification.
Run a real bounded release test in an isolated compositor using the same identified
native virtual-input implementation, then revalidate the active stack/session
binding. Report this as `same_stack_disposable`, never an active-instance test.
The test must observe actual button/key release and application survival, not only
successful input dispatch. No intentional held-input EOF fault is permitted in the
operator's compositor. Unknown/mismatched code, failed behavior or cleanup denies
input with an identified reason and remedy, not a platform-wide allegation.
Capabilities are server-owned evidence assertions, not model-supplied consent.
Moving/restoring the human pointer must never be described as independence.
Shared widget focus is observable as a limitation; detected focus changes require
re-grounding, and unknown focus denies keyboard grounding. No exclusive-focus or
atomicity guarantee is inferred from a snapshot. Uncertain text is never replayed.

Multi-monitor capture is source-scoped from day one, including different origins,
fractional scales, rotations and gaps. Placement belongs inside the backend; no
single desktop-wide scale or bounding-span action plane is inferred. Actions bind
to one observed source. Resize, hotplug, same-sized replacement, region/device
replacement and consent revocation invalidate the binding. Missing input mapping
allows a capture-only result, never a guessed scale=1 action. Every action needs
a fresh observation, unique ID, target and expected postcondition. No indefinite
key/button holds.

Receipt states distinguish executed, verified, not_satisfied, unavailable, and
unknown. An action is durably marked pending before injection. Duplicate ID and
same payload returns the receipt, never injects again; a changed payload is an
error. Crash/pending outcomes become unknown, not eligible for replay. Fresh
observation and explicit reconciliation are the only recovery path.

Images are native multimodal content with bounded metadata and separate evidence
storage. The 2-million-pixel / 2-MiB limit applies to delivered frames, not source
geometry: even 1920x1080 exceeds 2 million source pixels. Overview resampling and
detail crops must preserve explicit mappings; backend capture-allocation limits
are independently bounded. Unsupported execution surfaces/adapters refuse; they cannot continue
visually blind. Older working frames are removed without severing tool/result
correlation. Typed text is not stored in ordinary audit.

## Required tests (harmless only)

* Disabled catalogue/dispatch/startup parity; independent legacy image behavior.
* RBAC, ownership, host scope, indirect dispatch, revoked generation, disable,
  expired evidence, and ordinary-tool execution during and after desktop tasks,
  including mixed batches, later turns, other users and recovered/disabled sessions.
* Private display/buses/home/network/devices, resource limits, owned cleanup;
  no active-workstation access without a current explicit test grant. Under R4,
  capture-only tests assert unchanged session state and no persisted screenshots.
* Delivered pixel/image byte caps distinct from source bounds; downsampled 1080p,
  1440p, 4K and wide-layout metadata, detail crops and resize rounding; native serialized requests, fallback
  refusal; no base64 stringification in agents, audit, durable summaries.
* Multi-source negative/nonzero origins, gaps, fractional scales, rotations,
  source-local pixel/input round trips and stale same-size source replacement.
* Changed source/focus, stale node/frame, unexpected modal, coordinate bounds,
  wrong postcondition, duplicate ID, lost response, worker crash, unknown effect.
* Mid-gesture pause/cancel, lease loss, hung primitive (stub), no late input,
  no cross-session teardown; record stop latency separately from request success.
* Export traversal/symlink/special-file/race/size checks; authenticated readback.
* Operator keyboard/touch, revoke/reconnect, stop independent of model wait,
  no automatic evidence retrieval on expansion, no screenshot auto-posting.
* GUI-only drawing/editor saves and reopens with independent artifact checks;
  explicit successes/failures and comparison against a safe isolated baseline.
* Private X11 XI2 and Wayland portal/PipeWire/libei feasibility: actual toolkit
  event receipt, concurrent simulated-human pointer/focus/modifiers, grabs and
  cancellation. A second drawn cursor is not separation evidence. Measure whether
  cooperative revoke/disconnect releases only agent-owned input and leaves
  pre-existing applications alive; this is not abrupt shared-X11 guardian-death proof.
  Report whether owned devices were removed or deliberately retained inactive;
  a stopped=true response alone does not establish either release or app survival.
* Cleanup asserts host processes as well as container/unit inventory: record exact
  owned identities and classify live helpers, zombies, workload and retained evidence.
  Any residual process is incomplete cleanup, even when workload containers are gone.
  Never restart the live service or prune unrelated containers to manufacture a pass.

The build evidence document will separate unit/contract proof, actual runtime
measurements, and uncompleted release gates. A service returning exit 0 is not
evidence that drawing, postcondition verification, or containment succeeded.

R7 narrows fixed profile eligibility to the offered tasks. Isolated
launch remains Drawing/Xed. Attached X11 profiles may target installed native
Xed, Inkscape and LibreOffice Writer only (`app=writer`) with verified process identity;
the tools never launch or close the operator's applications. The handoff names
the tasks actually measured for each application. Macro IDEs, extensions,
security prompts and unknown dialogs do not inherit document-window permission.
Calc/Draw and generic `libreoffice` are refused. Writer's keyboard-only note,
paragraph, bold and GUI ODT save task remains offered; document close/reopen,
open/new and pointer/menu input are not offered and are refused by task policy.
Writer file-dialog scope permits only save dialogs rooted in a Writer document.
See APPLICATION-QUALIFICATION-R7.md for the retained failure and evidence limits.
No UI declaration of an eligible profile establishes that an application is
installed, focused, authorized, input-ready or qualified for an arbitrary task.

### R8 Wayland qualification boundary

Mutter's native and native-headless modes instantiate the same native backend and
virtual-input device implementation. Headless mode disables physical libinput;
the qualification must also isolate display/session buses and physical devices.
This permits exercising the actual held-input EOF cleanup implementation safely
before offering input to the user's native compositor. It does not measure that
active instance's hidden state, physical-device concurrency or every hardware path.
Nested X11 behavior is a different implementation and cannot qualify native input.

The public portal/libei APIs offer no transactional live fault test guaranteeing
rollback if the compositor itself fails release. A duplicated EI FD invalidates
last-owner EOF; a scratch window or another virtual monitor still shares the seat.
Do not rename those mechanisms as equivalent evidence. Separate qualification,
portal consent, trusted source/focus evidence and finite runtime leases remain
independent checks. Exact supported compositor builds and completed GUI operations
belong in the final R8 qualification/handoff record, not this acceptance contract.
