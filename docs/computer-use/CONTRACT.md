# Computer contract and acceptance matrix (R1)

Three configured-only tools: `computer_session`, `computer_observe`,
`computer_act`. No desktop dependency imports, prompt text, processes, listeners,
or additional model-visible definitions when disabled. Existing tool ordering
and schemas are unchanged. Feature collision names are reserved when enabled.

Admission binds requester, channel/web session, host authorization, root turn,
task/session and generation server-side. Model arguments never set identity,
approval, host display, executable, socket, bus, or runtime path. Only foreground
entry is admitted. Restricted task context must survive cancellation and resume;
observation text is untrusted data and cannot grant another tool's authority.

Platform (X11/Wayland) is independent of environment (isolated/existing-session).
Launching an application, offline access and disposable processes are isolated
backend properties, never shared session prerequisites. Real-session assisted
work is the destination of the same product, not permission for this branch to
access the active workstation. Both platform families are feasibility gates now.

States: starting → active → paused/cancelled/closed/quarantined. Resume requires
a new generation, renewed authorization and a new observation. Stop fences the
task and consent bindings first, disconnects capture/input, and releases only
owned devices/input. Isolated backends may tear down their owned sandbox;
existing-session backends must leave applications and the desktop alive. A human
does not have to stop using the machine for us to revoke agent authority.
Private-display-wide key cleanup is never available to existing-session adapters.

Observations bind an opaque ID to task generation, consent generation, monotonic
capture time/expiry, opaque source ID/revision, delivered raster dimensions,
source-local geometry and explicit crop/affine input transforms. Optional focus,
modal and semantic evidence can be unknown; missing evidence is not permission.
No public display number, XID, desktop-global coordinate, bus address or cookie.
Capture scope, input reach, task authority, and pointer/keyboard independence are
separate capabilities. Capture permission is not input confinement. Unknown or
shared input separation denies assisted actions rather than moving the human
pointer and restoring it afterward.

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
  expired evidence, and alternate-tool denial within restricted tasks.
* Private display/buses/home/network/devices, resource limits, owned cleanup;
  no mutation or capture of the active workstation session.
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
  cancellation. A second drawn cursor is not a pass. Revoke/disconnect removes
  only agent devices and leaves pre-existing disposable-session applications alive.

The build evidence document will separate unit/contract proof, actual runtime
measurements, and uncompleted release gates. A service returning exit 0 is not
evidence that drawing, postcondition verification, or containment succeeded.
