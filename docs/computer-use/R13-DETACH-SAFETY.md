# F1 attached X11 detach

Attached input uses a unique session pair, not the isolated persistent pair.
Startup refuses pre-existing reserved Odin masters rather than name-only removal.
The independent lifecycle owns the original full hierarchy census. All guardian
and injector X connections hold shared leases; revoke blocks new leases and input
dispatch. The lifecycle obtains an exclusive lease, releases only owned XTEST
state, permits 50 ms best-effort application settling, then holds a short server
grab across the final census, baseline-slave restoration, owned-master conflict
probes, local handle closure, AttachToMaster removal and post-census.

`no_inflight_input` is scoped to Odin input clients. `no_active_grabs` means only
the active-grab conflict probes on Odin's two masters. X11 cannot prove that all
GTK/WM/application clients consumed events or drained device-related requests.
The settle interval is not a zero-crash-risk guarantee. The cause of the original
physical-device migration is not established by this fix.

Missing, replaced, floating, newly discovered or unrelated-seat changes fail
closed, never broad input releases or arbitrary reattachment. Controller/store
reject retained-inactive attached cleanup. Isolated persistence is unchanged.

Caller cancellation does not cancel the backend detach owner. Controller EOF or
parent death revokes the independent lifecycle. At 15 seconds it can report an
unknown result but retains the exact baseline and retries with bounded backoff;
later Stop can consume verified completion. PIDs are recorded before creation.
Recovery after total process loss remains conservative, never clean merely from
PID absence. SIGKILL of the lifecycle itself, malformed/partial native creation,
or initialization failure before a complete native owner are quarantine-only
residuals; no name-based reconstruction of native ownership is attempted.

The private-Xvfb fixture uses a PID-derived display, private authority and owned
subreaper. It exercises held owned keys/buttons, baseline endpoint migration,
external-master grab refusal and retry, EOF lease draining, and actual attached
backend start/detach. No live display, deploy, service restart or dependency
installation is part of this change. Full GUI controller acceptance is separate.
