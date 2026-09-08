# F3: attached X11 scope/readiness diagnosis

## Observed cause, not an input qualification claim

Read-only actual `:0` queries on 2026-09-07 ran the real XRes/proc/AppScope
adapter, without capture pixels, input, native-device creation, focus changes,
host configuration changes, session changes or live installation writes.

* The service worker UID is 1003; the desktop application belongs to UID1000.
  Live configuration omits `runtime_sudo`, whose schema default is false.
  The unprivileged worker returned `application_uid_mismatch` on all four
  monitors. X11 capture access does **not** confer proc identity access.
* An explicitly privileged **read-only diagnostic**, not an input worker, could
  resolve the actual focused application with the same adapter. Three monitors
  returned `focused_application_outside_source`; the fourth was eligible.
  Startup previously selected the first monitor regardless of focused target.
* The previous `snapshot()` swallowed every failure as None, leaving a generic
  empty input target set. Device availability alone was reported as input support.
  Disabled/no-session operator declarations correctly remain `not_checked`, not
  a promise of input support, and must not probe a desktop implicitly.

Both live diagnostic runs used the owned test supervisor: reports
`/tmp/r13-scope-live-odin.json` and `/tmp/r13-scope-live-root.json` have primary
exit0 and cleanup_ok=true. A prior root sample had an ineligible focus; the
desktop is dynamic. No title, executable path, process arguments, cookie or
screen content is included in the diagnostic output.

## Changes

* Preserve all UID equality/ownership checks, XRes PID authority, stable proc
  identity, denied titles/classes, modal family checks and pointer-hit validation.
* Add a static, allowlisted scope reason alongside the private binding. Distinguish
  cross-UID refusal, unreadable proc, denied app, absent focus and wrong monitor.
  Unexpected exception text never crosses the IPC/public boundary.
* At authorized startup, perform read-only target discovery across granted
  monitors before claiming readiness; select an eligible source if one exists.
  Target discovery alone never creates a usable observation or grants input.
* Update readiness from the actual pixel-bound observation. Session status and
  observation results carry readiness plus safe refusal reason. Stale observations
  and inactive sessions cannot retain a positive readiness claim. HTTP retains
  only known reasons; monitor selection requires new observation.

## Evidence and limits

`tests/harness/x11_scope_r13.py` creates a private authenticated, high-number
Xvfb with stock core devices and no keymap modifications. A UID65534 application
creates its own window; root AppScope resolves its authoritative XRes PID,
cross-UID proc identity and stable snapshot. No input is injected or native
input endpoint pre-created. Receiver, Xvfb, exact PIDs, lock and socket are
cleaned. `/tmp/r13-scope-native2.json` reports exit0 and cleanup_ok=true.
The initial fixture attempt failed because UID65534 cannot traverse the dev venv;
the receiver now uses the existing system Python/Xlib, with no dependency install.

The focused regression command covers scope, popup/denied classes, capture races,
controller/status/HTTP, keyboard grounding and admission. See final task report
for the recorded final count; earlier runs are retained, not counted as success.

## Follow-up required before real input

This does not make the deployed cross-UID worker privileged and deliberately does
not loosen the permission boundary. Provision the existing explicit
`runtime_sudo` policy or a worker running as the desktop UID under separate
operator authorization; do not auto-sudo after a failure. Then, only after F1's
real detach safety is independently accepted and deployment authorized, repeat
supervised input against a harmless focused application on the selected monitor,
verify application result, and verify Stop restores the core physical devices.
Input support on the actual live desktop remains **unvalidated** by this task.
