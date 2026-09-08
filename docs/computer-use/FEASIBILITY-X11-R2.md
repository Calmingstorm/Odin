# X11 R2/R3 safe-lifecycle follow-up — bounded incomplete result

**Latest result:** the parent's fifth attempt completed all 12 lifecycle trials,
retained-device inventory, post-watchdog application typing AND outer-wrapper
process cleanup with exit 0. The fourth attempt also completed the corpus but
failed on a process-census race; both outcomes are retained below.
Earlier incomplete attempts are retained as evidence, not the final corpus count.

Date: 2026-09-07 UTC. Branch: `feat/isolated-computer-use`.
Scope: DECISIONS R2 (overlap accepted, damage forbidden) and R3 (ordinary-turn
tools). This report does not change the controller, integration, eligibility or
tests. Earlier dirty work was preserved. No commit, deployment, host service
change, live-session access or package installation was performed.

## Verdict and finite stopping point

**The requested lifecycle corpus is NOT complete.** Exactly two isolated runtime
attempts were made, then execution stopped at the requested bound. Attempt 1
completed zero of 12 planned trials. Attempt 2 completed **one of 12**, providing
measured owned-input-client EOF release, unchanged held human input, application
survival and continued human typing. Controller cancellation, held-input lease
expiry, graceful detach, watchdog exit and the final retained-device inventory
remain unverified. No third graphical run was made.

The bounded blocker is a **fixture postcondition defect**, not demonstrated backend
failure: repeatedly clicking the same GtkEntry before typing selected its existing
text, so the second harmless `a` replaced the first instead of producing `aa`.
The corpus timed out waiting for `aa`, before its cancellation phase. Existing
GTK receipts show `a` -> empty -> `a`; the precise click-selection mechanism was
not separately instrumented. A future authorized correction must avoid assuming
caret/selection state and verify new receipts, rather than retry uncertain typing.

## Artifacts and changes

Read fully before work: DECISIONS.md, FEASIBILITY-X11.md, existing partial
`x11-lifecycle.c` and `x11-run.py`, plus `x11-session.sh`, `x11-same-target.py`,
`x11-target.py` and `x11-inject.c` supporting harness sources.

Only X11 feasibility scripts and this new document were changed:

- `scripts/computer-feasibility/x11-lifecycle-session.sh`: new isolated build and
  launch wrapper using installed dependencies.
- `scripts/computer-feasibility/x11-lifecycle-corpus.py`: new 12-trial plan,
  three repetitions each of input-client EOF, controller transport EOF,
  non-renewable two-second lease expiry, and graceful detach. Checks actual GTK
  text receipts, XI per-master held state, human pointer/focus, liveness and
  retained inventory. It currently fails at the second-trial text postcondition.
- `scripts/computer-feasibility/x11-run.py`: preserves the earlier safe-lifecycle
  option, refuses all historical removal-based modes, adds a 20 ms host
  PID/start-ticks/comm census scoped to the exact transient service cgroup, then
  verifies recorded identities and the cgroup are gone (zombies count as survivors).
- `scripts/computer-feasibility/x11-same-target.py`: in safe-lifecycle mode only,
  supports normal stdin EOF as fixture-app shutdown. Successful final shutdown
  was not reached in these runs; no normal EOF app-shutdown claim is made.
- `scripts/computer-feasibility/x11-lifecycle.c`: preserves the earlier owned
  watchdog/worker/ledger implementation; fixes the release acknowledgement's
  hard-coded length from 23 to `strlen`, since the message is 24 bytes.

The watchdog records potentially-down input before dispatch, fences and reaps
the owned input client, releases its ledger through its own XI-selected client,
then queries owned modifier/button state. The controller cannot request global
key cleanup. It retains its pair instead of deleting XI devices.

**Retained means enabled, not disabled.** The candidate sends `disabled:false`;
the two master devices and their XTEST slaves are intended to remain enabled
for the private server lifetime. No removal or disable operation was executed.
No final inventory was reached, so this report does not pretend a measured
four-device inventory or safe disabled-state gate. An independent production
supervisor, lost-watchdog recovery, robust device identity generation, arbitrary
key-state proof and real-session authorization remain absent. The fixture's
modifier/button query is not a general proof that every nonmodifier key is up.

## Isolation and preflight evidence

Both attempts used a unique systemd DynamicUser service, PrivateTmp,
PrivateNetwork, PrivateDevices, strict filesystem protection, no capabilities,
NoNewPrivileges, one GiB memory, no swap, one CPU, 64 tasks, 120-second lifetime,
two-second stop timeout, and exact control-group cleanup.

Inside it, bwrap unshares user/mount/PID/network/IPC namespaces and clears the
environment. Only `/usr`, font configuration and read-only harness files are
exposed. `/workspace`, home/run/tmp and the private session bus are disposable.
The harness requires UID 65534, `DISPLAY=:177`, absent procfs, no host home or
deploy tree, and no `X0` socket. It does not discover displays, connect to `:0`,
mount a host session bus or expose physical devices. No window manager is used.
This is trusted fixture isolation, not a hostile-code sandbox certification.

Installed versions: Xlib 1.8.7, Xi 1.8.1, Xtst 1.2.3, GTK 3.24.41.
Runtime X.Org server release: 12101011 (21.1.11); client negotiates XI 2.2.
Strict C compile, Python compile/AST and shell syntax checks were performed.
The outer host reports `systemctl is-system-running=degraded`; that pre-existing
state was not altered. No host package changes were needed.

## Attempt accounting and evidence

Evidence files are outside the deploy tree:

1. `/tmp/odin-x11-r3-lifecycle-attempt1.log` (17,993 bytes).
   Unit `odin-xi2-feasibility-0d631b488bae4110bdfa76f48627924e.service`.
   Wrapper exit **1**; **0/12** completed trials. Held state was observed and
   the input-client EOF release receipt reported **0.264 ms**, but the truncated
   acknowledgement caused the corpus to stop before verifying released server
   state, human typing or survival. This is not a lifecycle pass.
2. `/tmp/odin-x11-r3-lifecycle-attempt2.log` (26,189 bytes).
   Unit `odin-xi2-feasibility-967ba66363014e37b94454c292fe9ac1.service`.
   Wrapper exit **1**; **1/12** completed trials, then the GTK marker blocker.

There was also one shell-wrapper launch failure **before any fixture unit or
display was started**: `/bin/sh` rejected `set -o pipefail`. It was corrected by
explicitly invoking bash. It is not omitted or counted as a graphical trial.

SHA-256, respectively:

```
a4d4ea5b22ef60781abde1d4868c2a97d0f657bc74b09a74d3b3d7ca20d51664
15737207369abd2ca2f57bc1e6e0c9611b48094d9f5cf928e754629a499b4d79
```

### Attempt 2's one completed trial

Private GTK PID 17 existed before watchdog attachment; input worker PID 25 was
normally exited with `_exit(0)` and reaped with status 0. No fatal signal was
used to simulate input-client loss. Human masters were 2/3; owned masters 8/9.

| Observation | Before release | After owned-only release |
|---|---|---|
| Owned modifiers / buttons | Control = 4 / button 1 = 2 | 0 / 0 |
| Human modifiers / buttons | Shift = 1 / button 3 = 8 | 1 / 8, unchanged |
| Human pointer | (850, 450) | (850, 450), unchanged |
| Human keyboard focus | 2097154 | 2097154, unchanged |
| Owned keyboard focus | 2097160 | 2097160 |

Watchdog trigger monotonic `3895058.733967528`; server-release verification
`3895058.734216968`: **0.249 ms** from observed worker EOF. Controller request to
that verification: **0.492 ms**. This is one timing sample, not a percentile or
latency guarantee.

After release, GTK remained alive and received human `H` while human Shift and
button 3 were still down. Only the human simulator then released its own Shift
and button 3; a final XI snapshot showed both masters clear. GTK text receipt
monotonic `3895058.747995686` records human-top=`H`. GTK also recorded the owned
Control and button releases. This proves more than process liveness or raw input
alone, but only for this disposable toolkit fixture and this single case.

The second attachment hit the marker timeout. While waiting, its non-renewable
lease expired and produced a release receipt with status 0 and **3.968 ms**
latency after its two-second deadline. **No held input had been dispatched on
that attachment**, and no full post-release snapshot/typing verification was
reached. Therefore it is not evidence of safe held-input lease expiry.

## Cleanup: measured, including failures

Both failed corpora took the explicit failure cleanup path, not the planned
normal-EOF application shutdown. The exact owned watchdog and GTK child PIDs
were terminated and waited (status -15); the exact private Xvfb exited 0 and was
waited. This termination is fixture teardown after failed tests, not assisted
detach and not a destructive behavior demonstration. No broad kill, device
removal, host-display cleanup or live-service restart was used.

Each host census recorded **14 distinct PID/start-tick identities**, including
bwrap, private dbus launcher/daemon, compiler processes, Xvfb, GTK and lifecycle
workers. After exact service stop, both ledgers report:

```
survivors_including_zombies: []
cgroup_exists: false
monitor_errors: []
LoadState=not-found
ActiveState=inactive
SubState=dead
ControlGroup=
```

The census is sampled and can miss very short-lived subprocesses; it does not
claim an exhaustive process birth ledger. Direct fixture parents wait their
children, and the exact service cgroup's disappearance is the additional cleanup
postcondition. No survivors from either attempt were observed; this statement
does not cover unrelated historical Podman residuals documented elsewhere.

Final `validate_action` bundle `x11_r3_two_bounded_attempts_cleanup` passed **5/5**:
exact cgroups gone, exact transient units inactive, strict C/shell checks,
Python compilation/diff whitespace/report existence, and evidence sizes/hashes.
The first validation call was rejected before execution because one command
exceeded its 500-character field limit; splitting checks resolved that validation
request error. Static and cleanup validation do **not** convert the failed
graphical corpus into a pass.

## Remaining gate

Retained enabled devices avoid repeating the earlier GTK-crashing XI removal,
but **do not yet satisfy the complete R2 safe lifecycle gate**. The evidence is
one successful worker-EOF release case plus two failed corpus executions.
No claim of complete cancellation/lease/detach coverage, representative app
corpus, disabled retained devices, physical-human coexistence, production
readiness or Stage 6 completion follows. Further runtime work needs a fresh
authorized bounded correction, not an unreported third attempt.

## Superseding authorized marker correction — attempt 3, bounded failure

The sections above retain both earlier failed attempts unchanged. A further
**single** safe-lifecycle attempt was explicitly authorized on 2026-09-07. It
completed **8/12 trials** (two each of all four modes), then stopped on a new
fixture log-reader failure during trial 9. Wrapper exit was **1**. No retry was
made, and the full corpus remains incomplete.

This continuation changed only `x11-lifecycle-corpus.py` and this appended report.
All pre-existing dirty work, including the controller, was left alone. The marker
check now chooses distinct harmless lowercase keys `a` through `l`, captures the
GTK record cursor and monotonic dispatch timestamp before each tap, then requires
a newer text-change receipt containing that trial's marker. It records the actual
widget text without assuming append, caret position or selection state. Human
typing after release uses the same fresh-receipt requirement with the uppercase
marker (human Shift remains held). The post-watchdog `z` check was also corrected
but was not reached. Owned release, human-state preservation and application
survival checks were not relaxed.

### Evidence and all measured release samples

Artifact: `/tmp/odin-x11-r3-lifecycle-attempt3.log`, **123,915 bytes**, 388 lines.
SHA-256: `a4ffa4797137db7de9a3ed85d38936fe8398ba8e797d264fcd06a9bb22938cfe`.
Exact unit: `odin-xi2-feasibility-3353983d56364e398fe00e9b0bf9eff1.service`.

| Trial | Release reason | Watchdog trigger-to-release ms | Request-to-release ms | Owned GTK text | Fresh human text | Result |
|---|---|---:|---:|---|---|---|
| 1 | input-client-eof | 0.219 | 0.417 | a | A | pass |
| 2 | controller-eof | 1.176 | 1.247 | b | AB | pass |
| 3 | lease-expired | 3.358 | 1987.791 | c | ABC | pass |
| 4 | graceful-detach | 1.209 | 1.313 | cd | ABCD | pass |
| 5 | input-client-eof | 0.154 | 0.416 | e | ABCDE | pass |
| 6 | controller-eof | 1.169 | 1.240 | f | ABCDEF | pass |
| 7 | lease-expired | 3.954 | 1987.896 | fg | ABCDEFG | pass |
| 8 | graceful-detach | 1.194 | 1.300 | fgh | ABCDEFGH | pass |
| 9 | input-client-eof | 1.180 | not recorded by trial-pass | i | receipt found after failure | incomplete |

Lease latency is measured from the fixed two-second deadline, not from the earlier
held-state snapshot. These are individual fixture samples, not a percentile or
production guarantee. All nine watchdog release receipts have `client_status:0`,
`retained:true`, `disabled:false`. The eight completed trials observed owned
Control/button 1 state `(4,2)` become `(0,0)` while human Shift/button 3 `(1,8)`,
pointer `(850,450)` and focus `2097154` remained unchanged. GTK PID 17 survived and
received fresh human text before human-owned releases; final snapshots were clear.
Trial 9 also has held/released snapshots with those values, but did not reach its
human-own-release check and must not be promoted to a completed trial.

The marker defect is demonstrably corrected for the reached trials: actual text
varied between replacement (`b`, `e`) and insertion (`cd`, `fg`, `fgh`) without
assuming either behavior. The new stopping error is `JSONDecodeError: Unterminated
string starting at ...` in `records('gtk')`, called by `expect_new_text` while
checking trial 9's human receipt. That reader parses every `splitlines()` fragment,
including a possibly incomplete concurrently written trailing record. The final
dump contains a complete human-top=`ABCDEFGHI` receipt at monotonic
`3895503.179407953` and subsequent key release events. This supports a live log
framing race, rather than a demonstrated lifecycle failure; it does not retroactively
turn the failed corpus into a pass. No log-reader repair or additional runtime
attempt was performed after the bound was reached.

### Exact cleanup ledger and limitations

The same pre-existing DynamicUser/systemd/bwrap safe-lifecycle isolation was used.
No XI device removal, real display/session access, Podman, broad process cleanup,
controller changes, commits, deployment, host-service restart or pipeline occurred.
Failure teardown terminated and waited only owned namespace PIDs: watchdog 24
(-15), GTK 17 (-15), Xvfb 12 (0). Normal watchdog quit and normal GTK EOF shutdown
were not reached. Completed trial input-worker PIDs were 25, 32, 39, 46, 53, 60,
67 and 74; their release receipts record successful reaping. Trial 9 also has a
successful client-status release receipt, but no trial-pass worker-PID field.

The exact host cgroup census recorded these **20 PID/start-tick identities**:

```
3399071/389549800 bwrap          3399072/389549805 bwrap
3399073/389549806 dbus-run-sessio 3399074/389549806 dbus-daemon
3399075/389549806 python3        3399078/389549807 gcc
3399079/389549807 cc1            3399081/389549819 collect2
3399082/389549819 ld             3399085/389549823 Xvfb
3399090/389549825 python3        3399098/389549888 lifecycle
3399106/389549892 lifecycle      3399110/389549895 lifecycle
3399113/389549896 lifecycle      3399140/389550102 lifecycle
3399149/389550106 lifecycle      3399156/389550110 lifecycle
3399189/389550313 lifecycle      3399196/389550315 lifecycle
```

The final ledger reports `survivors_including_zombies:[]`, `cgroup_exists:false`,
`monitor_errors:[]`. The unit is not-found/inactive/dead with empty ControlGroup.
As before, a 20 ms census can miss short-lived subprocesses; it is not an exhaustive
process-birth trace. The exact service cgroup disappearance is the additional
cleanup postcondition.

Retained devices were **enabled**, not disabled or revoked. Final inventory and
post-watchdog application survival were not reached. The measured two repetitions
per mode improve the disposable GTK evidence, but provide neither the requested
12-trial completion nor representative-app, arbitrary-key, physical-human,
lost-watchdog, production-lifecycle or Stage 6 approval. The finite attempt ended
at its first failure. Any further runtime requires new explicit authorization.

Post-attempt `validate_action` bundle
`x11_marker_attempt3_cleanup_and_static_only` passed **6/6**: exact cgroup gone,
exact unit inactive, all 20 recorded host PIDs absent, Python compile/whitespace,
strict C and shell syntax checks, and retained evidence checksum. This validates
cleanup/static conditions only, not completion of the failed graphical corpus.

## Superseding parent run — attempt 4, complete lifecycle corpus

The parent corrected the concurrent log reader to consume only newline-committed
records. Three pure tests cover partial JSON, incomplete final newline, preserved
ordering and rejection of malformed complete records. No input or lifecycle
assertion was weakened. One additional isolated run then completed **12/12**,
three repetitions of each mode, and both final inventory and application checks.

Evidence: `/tmp/odin-x11-r3-lifecycle-attempt4.log`.
SHA-256: `9442598353addbf8f201aac377fcd63079060541f12b5ba7049b6bcab7de792c`.
Unit: `odin-xi2-feasibility-6441b44b7bad4a50b64e1117dadeadff.service`.

| Release condition | Three trigger-to-release samples (ms) |
| --- | --- |
| Owned input-client EOF | 0.203, 0.132, 1.176 |
| Controller transport EOF | 1.188, 1.172, 1.191 |
| Held-input lease expiry | 3.716, 3.908, 3.841 after the two-second deadline |
| Graceful detach | 1.192, 1.177, 1.190 |

All trials observed owned Control/button 1 released while the simulated human's
Shift/button 3, pointer and focus were unchanged, followed by fresh human text
receipts. After watchdog exit the SAME GTK PID17 received the additional `z`
(`ABCDEFGHIJKLz`). Four owned devices remained present and **enabled**. The
application then exited normally on stdin EOF; GTK, watchdog and Xvfb were all
waited with exit status 0. This establishes the measured retained-pair approach
for the selected keys/buttons and this GTK fixture, not general key-state proof,
compositor-wide revocation or a production backend. No XI deletion was performed.

### Outer-wrapper failure is not hidden

The graphical corpus result was 12/12 with exit_status0, but the **outer command
exited 1**: its 20ms process census encountered `ProcessLookupError` while a
process disappeared. The wrapper correctly refused to call incomplete census
evidence a cleanup pass. The ledger nevertheless recorded 27 exact identities;
its final survivor list was empty and the unit/cgroup gone.

Independent post-run validation `x11_R3_attempt4_disposable_teardown` passed4/4:
exact unit inactive/cgroup absent, all 27 recorded PIDs absent, twelve case and
post-watchdog application receipts without X errors, and existing Odin service
still active. This separately verifies recorded-process cleanup, not an exhaustive
birth ledger or a retroactive successful outer exit. Historical Podman zombies
remain accounted for in CLEANUP-R2.md. No host package install or live-session
interaction occurred. The census race remains a fixture improvement to make;
the lifecycle corpus itself no longer blocks on marker or JSON framing defects.

## Fifth and final run — complete corpus and wrapper cleanup

Corrected the census disappearance race: FileNotFoundError/ProcessLookupError
counts as absent only after the exact process directory is also gone; permission
errors, malformed records and still-present unreadable entries continue to fail.
Six pure tests now cover record framing and these error boundaries. The corrected
wrapper then ran once, exiting **0** with **12/12** lifecycle trials, normal GTK
EOF and watchdog exits, fresh post-watchdog text, retained enabled inventory,
zero census errors, zero recorded process survivors and absent cgroup.

Artifact: `/tmp/odin-x11-r3-lifecycle-attempt5.log`.
SHA-256: `df9521bf5b34199079bc7c04eeda848521c89a4ca3f6bdc47501208a3948491c`.
Exact unit: `odin-xi2-feasibility-6ce3dff198d449cb8998ec5bbcdafbd5.service`.
All 26 sampled host PIDs were absent on independent post-run validation;
`x11_R3_attempt5_complete` passed3/3. Historical parent-owned zombies are excluded
from this fixture-cleanup statement and remain explicitly unresolved.

| Release condition | Final three trigger-to-release samples (ms) |
| --- | --- |
| Owned input-client EOF | 0.208, 0.117, 1.151 |
| Controller transport EOF | 1.179, 1.187, 1.276 |
| Held-input lease expiry | 3.580, 3.756, 4.182 after the two-second deadline |
| Graceful detach | 1.202, 1.191, 1.187 |

These remain **fixture measurements**, not latency guarantees. Application-safe
retention is now measured across this complete corpus; devices were NOT disabled
or removed. Production device revocation, watchdog loss while input is held,
arbitrary-key state proof, representative applications and runtime integration
still require engineering. Do not set `owned_devices=retained_inactive` from this
enabled-device experiment or promote it to a real-session backend automatically.
