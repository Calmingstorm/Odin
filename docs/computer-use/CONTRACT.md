# Stage 0 contract and acceptance matrix

Three configured-only tools: `computer_session`, `computer_observe`,
`computer_act`. No desktop dependency imports, prompt text, processes, listeners,
or additional model-visible definitions when disabled. Existing tool ordering
and schemas are unchanged. Feature collision names are reserved when enabled.

Admission binds requester, channel/web session, host authorization, root turn,
task/session and generation server-side. Model arguments never set identity,
approval, host display, executable, socket, bus, or runtime path. Only foreground
entry is admitted. Restricted task context must survive cancellation and resume;
observation text is untrusted data and cannot grant another tool's authority.

States: starting → active → paused/cancelled/closed/quarantined. Resume requires
a new generation, renewed authorization and a new observation. Stop revokes
the generation first, releases held input, then tears down only owned processes.
Human takeover means agent authority is revoked before any human input.

Observations bind an opaque ID to generation, monotonic capture time, display
and window geometry, focus/modal identity, exact image/crop transform, and
bounded semantic nodes. No input consumes an observation older than the finite
freshness limit or one invalidated by geometry/focus changes. Every action
requires an ID, observation, target and expected postcondition. Coordinates map
through trusted transforms. No indefinite key/button holds.

Receipt states distinguish executed, verified, not_satisfied, unavailable, and
unknown. An action is durably marked pending before injection. Duplicate ID and
same payload returns the receipt, never injects again; a changed payload is an
error. Crash/pending outcomes become unknown, not eligible for replay. Fresh
observation and explicit reconciliation are the only recovery path.

Images are native multimodal content with bounded metadata and separate evidence
storage. Unsupported execution surfaces/adapters refuse; they cannot continue
visually blind. Older working frames are removed without severing tool/result
correlation. Typed text is not stored in ordinary audit.

## Required tests (harmless only)

* Disabled catalogue/dispatch/startup parity; independent legacy image behavior.
* RBAC, ownership, host scope, indirect dispatch, revoked generation, disable,
  expired evidence, and alternate-tool denial within restricted tasks.
* Private display/buses/home/network/devices, resource limits, owned cleanup;
  no mutation or capture of the active workstation session.
* Pixel/image byte caps, crop transforms, native serialized requests, fallback
  refusal; no base64 stringification in agents, audit, durable summaries.
* Moved window, stale node/frame, unexpected modal, coordinate bounds,
  wrong postcondition, duplicate ID, lost response, worker crash, unknown effect.
* Mid-gesture pause/cancel, lease loss, hung primitive (stub), no late input,
  no cross-session teardown; record stop latency separately from request success.
* Export traversal/symlink/special-file/race/size checks; authenticated readback.
* Operator keyboard/touch, revoke/reconnect, stop independent of model wait,
  no automatic evidence retrieval on expansion, no screenshot auto-posting.
* GUI-only drawing/editor saves and reopens with independent artifact checks;
  explicit successes/failures and comparison against a safe isolated baseline.

The build evidence document will separate unit/contract proof, actual runtime
measurements, and uncompleted release gates. A service returning exit 0 is not
evidence that drawing, postcondition verification, or containment succeeded.
