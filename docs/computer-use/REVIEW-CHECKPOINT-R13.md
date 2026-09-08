# R13: first live-test failures

This round changes the development branch only. It does not deploy into the live
installation, restart the service, change desktop settings or send input to `:0`.

## F1: do not claim a successful Stop while input or applications are damaged

The requested native sequence was implemented and exercised on private Xvfb:
revoke input, fence Odin clients, release owned state, restore recorded slaves,
probe owned-master active grabs, remove the pair and verify its absence.
**A real Xed task still crashed after removal with `XI_BadDevice`, minor 42.**
The premise that the crash occurs only during held input did not survive the
composed test. Hierarchy restoration is not application preservation.

Therefore production attached X11 uses the previously authorized shared-XTEST
fallback exclusively. It creates no second seat, moves the shared pointer
explicitly, releases only its owned ledger and compares final core device
identities/attachments through the already-owned topology watcher. It does not
spawn a new privileged probe after revocation. Reserved legacy Odin masters block
admission; they are never deleted by name. Retained-inactive attached cleanup is
rejected by controller and durable store.

The independent removal machinery remains isolated qualification code. It cannot
claim application preservation, and it is not reachable as the production
attached startup choice. Its private lifecycle handles lease revocation, EOF,
caller cancellation, transient removal and post-removal verification retries.
Independent attached input remains **unqualified**, not silently advertised as
working. This is a limitation relative to the independent-pointer goal.

## F2: explicit isolated requests cannot attach to the desktop

Both the configured backend factory and controller reject `start` with `app`
when the target is `existing_session`, before starting workers or creating a
session grant. The error explains that `app` requests isolation and how to make
an explicit attached request. Both X11 and Wayland are covered. Isolated starts
still require a launch profile.

## F3: actual target failure diagnosed, not relaxed away

Read-only probes on the actual workstation established two causes:

* The worker UID is 1003 and the desktop UID is 1000. The configured worker had
  no explicit runtime privilege provisioning. Capture permission did not provide
  the process-identity access needed for input: `application_uid_mismatch`.
* With explicitly privileged read-only inspection, the focused application was
  on the fourth granted monitor, while startup selected the first.

Authorized startup now discovers the eligible focused monitor; actual pixel-bound
scope controls readiness. Static blocker reasons survive status/observation/API
projection and appear in the UI. Stale or inactive observations cannot imply
readiness. Denied application classes and UID/XRes/proc identity checks remain.
No automatic privilege escalation or live configuration workaround was added.

The deployed installation still needs operator-authorized desktop-identity or
`runtime_sudo` provisioning before cross-UID input can work. The final production
shared route does **not** need sudo closefrom override, new privileges, or a new
sudo policy beyond the existing explicitly configured worker execution path.

Final read-only workstation preflight used the actual backend subprocess/identity
gate with an explicit in-memory `runtime_sudo=true`, not a root-only substitute.
It resolved the current focused application on the primary monitor and returned the precise
outside-source reason for the other three monitors. No pixels were captured,
input sent, devices created, focus changed or live configuration written. The
current sudo policy already permits this worker path; no new sudo grant is
needed. `/tmp/cu-r13-live-worker-preflight-owned.json` completed exit0 with verified
cleanup. To activate it in the deployed service, the operator must deliberately
set `computer.runtime_sudo: true` and apply the restart-pinned configuration via
the authorized deployment path. This round does not perform that deploy/restart.

## F4: System UI parity

Computer uses shared card, header, detail and control styles instead of inline
layout. Emergency controls remain sticky, keyboard-accessible and at least 44px
high; mobile controls stack. Behavior and emergency-control concurrency are
preserved. `ui/dist` was rebuilt. Backend blocker explanations are shown rather
than leaving the operator with a generic unavailable label.

## Direct native evidence

Final integration fixture: `/tmp/cu-r13-final-native`, with owned supervisor
`/tmp/cu-r13-final-native-owned.json`. It starts with six stock Xvfb devices,
without precreating masters or editing keymaps. The controller runs as UID1003
and uses the real `runtime_sudo` worker identity gate to act on UID65534 Xed.

Seven controller/native actions produced an exact saved two-line ASCII document.
Six actions met visual-change verification. The initial click was injected and
released but correctly reported `not_satisfied` because the image did not change;
it is not counted as a successful visual postcondition. All original device
identities and attachments remained unchanged, no Odin master remained, Xed was
alive after Stop and controller exit, and cleanup was complete. The shared pointer
moved from (950,650) to (85,185), as declared. Supervisor exit0, completed=true,
cleanup_ok=true, no residuals; private display socket removed.

Earlier failed runs remain in `R13-COMPOSED-QUALIFICATION.md`. The native
master-removal attempt and sudo `-C` failure are not rewritten as passing tests.
Actual post-fix input on the operator's workstation is **not** qualified by this isolated
result; he controls that next supervised test after an authorized deployment.

## Validation

Fresh complete instrumented suite on source `0d99cbec`: **14,613 passed,
5 skipped**, 955 warnings, 737.79 seconds. Coverage gate: **328 gated files,
92.6% total, zero findings**. No appended coverage; thresholds, exclusions and
baselines are unchanged. Reports: `/tmp/cu-r13-final-coverage.{log,json}` and
`/tmp/cu-r13-final-coverage-owned.json`. Supervisor completed with exit0,
cleanup_ok=true, census complete and zero residuals.

Lint and type ratchets against the prior reviewed head `3c6934b0` found no new
findings; configuration registry passed. Full npm checks, dedicated Computer
browser checks, committed distribution rebuild and generated API reference checks
passed. Existing async/deprecation and bundle-size warnings remain. An earlier
diagnostic run failed on stale fixtures/API references and exposed insufficient
in-process lifecycle coverage; those failures are retained, not counted as green.

Read-only live baseline and final checks show the same service process still active with
zero restarts. No test input was sent to `:0`, no live config or installation was
changed, and no pipeline, merge or deploy was performed. This report is evidence
for branch review, not a claim that the fixes are already active on the operator's desktop.
