# F1 attached X11 detach

The final production attached route uses existing **shared** core XTEST only.
It creates no master, never removes a master, and needs no inherited lease FD or
sudo `-C` permission. Stop drains guardian ledgers and compares the final core
identity emitted by the already-owned topology watcher on EOF. Native session
ownership described below remains isolated qualification machinery, not the
production attached default. Independent pointer operation remains unsupported
until safe per-application native lifecycle coordination is proven.

The isolated qualification path uses a unique session pair, not the persistent pair.
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

## Integration followup and qualification blockers

Emergency pause revokes the owned lease, drains workers and asks the independent
lifecycle to restore physical attachments and remove the session pair. An
unverified session release is never considered released. The same backend cannot
resume a revoked lease or deleted pair; it requires a new session. Shared/capture
only pause remains resumable. Caller cancellation does not cancel the pause owner.

The fallback to shared core XTEST is deliberately narrow: the native add must
raise `HierarchyAddUnavailableError` after proving no created endpoint and an
unchanged full nonowned census. The shared constructor must then validate the
core identity and idle state. Other native/startup/protocol failures never fall
back. Guardians on this path use their existing shared endpoint ledger rather
than session master removal.

**Not qualified for application preservation.** The composed private Xvfb/Xed
run `/tmp/cu-r13-composed-6` recorded successful input/save and physical hierarchy
restoration but Xed subsequently exited with `XI_BadDevice`, XInput minor 42
(`XIBarrierReleasePointer`). No amount of local Odin-client draining proves that
an arbitrary application's queued device requests are drained. Attached cleanup
therefore no longer claims `applications_preserved=true` when it created a pair;
the controller/store must quarantine that outcome even after verified removal.
This followup does not claim to fix that application crash. The lifecycle-only
fixture does not provide composed application acceptance.

**Independent lifecycle sudo provisioning remains blocked.** On the configured UID 1003 route,
`sudo -n -C 10 -- /usr/bin/true` fails with “you are not permitted to use the -C
option.” NOPASSWD alone does not authorize closefrom override. The inherited
session lease FD currently depends on that permission; root-controller fixture
success does not prove the packaged runtime-sudo path. No sudo policy, live
desktop, deployment, service, or system package was changed. A reviewed FD-transfer
design or explicitly authorized narrowly scoped provisioning would be required
before enabling that isolated lifecycle through sudo. The production shared path
does not use it and has now passed the actual UID1003 runtime-sudo fixture.

Final shared-path composed evidence: `/tmp/cu-r13-shared-composed-2/result.json`,
`fixture.json`, and `/tmp/r13-shared-composed-supervisor-2.json`. Seven real
controller click/type/save actions produced the exact expected ASCII document;
all six native devices and attachments remained unchanged. Xed remained alive
after Stop and after controller exit, cleanup was complete and applications were
preserved. Supervisor completed with return code zero and cleanup_ok=true. Core
pointer movement is expected and explicitly shared, not independent.
