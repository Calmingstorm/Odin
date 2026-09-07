# R8 production runtime implementation and evidence boundary

Parent integration: `WaylandRuntimeBackend` in `wayland_backend.py`, constructor
`enabled=False`, `app_profile='xed'`, `environment='existing_session'`,
`config: WaylandSessionConfig`, `qualify: async callable(identity)->InputAdmission`.
Config pins `bus_address`, `expected_uid`, `guardian_binary`. No ambient session
discovery, sudo, bool qualification switch, or model paths. `start(session_id)`,
`observe/capture`, `act`, `pause`, `resume(consent_generation=...)`, `detach/stop`,
`startup_descriptor`; `startup_timeout_seconds=120`; initially unknown caps and
`input_supported=False`. Failed input probe returns capture-only typed
`input_admission`; no silent upgrade on portal consent alone.

Parent owns actual per-session qualifier. Runtime supplies fresh compositor
identity measured through authenticated portal/Shell owner and EI SO_PEERCRED,
including PID/start/boot plus mapped library binding. Qualification callable must
run actual same-stack disposable behavior probe, not read editable JSON. Parent
admission module commit ff9b6f4 cherry-picked locally as31d6962 for compile/tests.

Production transport child owns only `wayland_portal.py` and its new tests:
real consent, private system-Python GLib helper, authenticated metadata, sole EIS
FD SCM_RIGHTS transfer, PipeWire clock-validated PNG capture. ConnectToEIS is
once per portal session. Guardian keeps one EI context for session lifetime,
releasing each bounded B+M/P/D/K/T action then waiting for next, finite idle
controller lease and nonrenewable active gesture lease. R/C/EOF revokes and exits.

Scope child owns only `wayland_scope.py`, extension asset tree and new tests:
real explicit opt-in Shell extension, D-Bus PID/UID/start/executable auth, native
client executable checks, unique exact monitor source logical bounds, no unsafe
Eval or portal-name impersonation. No app_id/title-only authorization.
Guardian child owns only new C asset and tests. Children do not commit or edit
shared files; parent runtime agent owns backend and sole index/commits.

Never test destructive held-button owner EOF in a human compositor. Disposable
native-headless behavior qualifies same native input implementation only, not
physical concurrency or another active hardware instance. Live orderly down/up
does not test EOF defect. Unknown stack/backend/probe/source/focus denies input.

## Recorded implementation and verification

Actual modules now exist: portal worker with real consent/PipeWire/SCM_RIGHTS,
authenticated GNOME Shell scope provider and explicit opt-in extension, mapped
compositor identity, persistent libei guardian C, asynchronous guardian transport,
and the callable backend. `ConnectToEIS` is called once per grant, with idle
heartbeats and independently nonrenewable gestures. Chords use J and the current
EI xkb keymap; no guessed US keyboard. Scope extension is currently in the
top-level `assets/wayland-scope/` tree and must be packaged and explicitly enabled
by the operator. The backend does not install or enable it.

Runtime-agent recorded validation: required four documents read to EOF; module
import passed; 156 portal/scope/native guardian tests passed, and 10 additional
backend/async native-process transport tests passed. Fake fixtures explicitly do
not prove compositor event delivery. Intermediate lint failed on line lengths,
then was corrected; final combined verification is recorded in the handoff.

Independent qualification worker reported stock Mutter48.7 six release cases
passed in native-headless and nested-X11 sessions using the production guardian
before its J-chord extension. That worker owns exact logs, retained earlier
failures and evidence report. This does NOT establish that the final complete
Python backend/portal/scope/probe composition or arbitrary applications work.
No complete production backend GUI task was run by this runtime worker.
Integration with the separately owned actual per-session qualifier and a real
private GUI task remain REQUIRED release gates.

Backend currently budgets portal65s + guardian8s + qualifier45s within controller
120s. Qualifier worker proposed a longer86s probe; parent must reconcile explicit
total startup budget before enabling rather than hiding a timeout. Capture-only
input refusal retains a precise code. Resume acquires a new portal grant and
repeats qualification. Native vendor/render mappings are included in identity;
mismatched headless/hardware stacks refuse, not pass.

No desktop0, live install, deploy, restart, push, merge or pipeline. No host package
was installed by this worker. Tests used private subprocesses/sockets and reaped
their children; no graphics process was launched by this worker.
