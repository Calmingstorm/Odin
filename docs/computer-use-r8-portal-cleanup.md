# Portal helper deadlines and cleanup receipts

`WaylandPortalSession` is one-shot. An RPC uses one absolute monotonic deadline
covering startup, transport lock acquisition, socket writes and the response.
Socket writes use `MSG_DONTWAIT` with deadline/cancellation-aware readiness waits;
they do not change the socket mode used by the reader. Cancellation shuts down
the private controller socket instead of queueing another write behind a blocked
send. The independently owned close task settles writers, joins the reader and
reaps only its own helper, even if callers repeatedly cancel cleanup.

The helper remains inert until its first RPC. A private cancellation watcher calls
`Gio.Cancellable.cancel()` independently of GLib dispatch, including during
synchronous initial D-Bus authentication. Authentication has a three-second cap
and cannot outlive the requested open deadline. Controller EOF, the operation
deadline and the helper's nonrenewable one-hour lifetime cancel that watcher.
No code accepts consent or connects to an ambient bus. Failed construction owns
and releases its partial connection, thread and pushed GLib context.

The retained close receipt distinguishes evidence:

* `closed`: local session fenced; not evidence of a remote acknowledgment.
* `process_reaped`: no helper was started, or its exact child process was reaped.
* `session_close_acknowledged`: **only** a successful D-Bus `Session.Close` reply.
  False when there was no session, the request failed, or the reply was lost.
* `connection_closed`: the helper confirmed its private D-Bus connection closed,
  or helper process exit proves that process no longer owns the connection.
  This is not a `Session.Close` acknowledgment and does not prove when the remote
  portal processes connection EOF.
* `cleanup_errors`: retained stage-qualified failures, including close-request,
  connection-close, request-close, subscription, capture-pipeline, reader,
  forced-kill or reaping failures.

Cleanup attempts `Session.Close` with its own bounded timeout even after ordinary
operations are cancelled; it then unsubscribes, closes the private bus, stops the
cancellation watcher and pops its context. Repeated close returns the same
receipt, preserving failures rather than upgrading them to a false success.
Helper failure replies preserve any available cleanup receipt. If a reply is
lost, controller reaping establishes connection closure only, never a close ACK.

Regression tests in `tests/test_computer_wayland_portal_deadlines_r8.py` fill
private socket buffers, hold private send locks, and accept authentication on a
private Unix listener that never replies. They do not contact a real desktop.
Run these and the existing portal tests beneath the standalone
`scripts/computer-feasibility/owned-test-supervisor-r6.py`, and inspect its JSON
report for primary status, complete census, residuals and cleanup signals.
