# R6 command zombie ownership

Implemented on existing PR350 branch, uncommitted. No live change or cure claimed.

## Observed diagnosis

Read-only production checks: PID3254906, PPID1, SID3254906; activation September6
16:48:03 EDT and journal Starting Odin16:48:04.405. Zombie census grew423 to424,
including sudo/chrome/crashpad/cat/dbus.414 foreign-session nonleaders,10 session
leaders. This classification is not permission to consume their statuses.
Live-disk and development process_manager.py were byte-identical before edits;
dev metadata3.95.0, branch feat/isolated-computer-use HEAD b918189. Disk equality
does not prove executing-module identity. Filtered journal showed no reaper
failure/eviction messages; absence does not prove reaper task health.

The15-second scanner requires previously observed parent transition or registered
identity. A fast orphan first seen already parented to Odin obtains neither.
Age/faster scanning cannot safely establish ownership.

`tests/helpers/zombie_reap_r6.py` reproduced this in a standalone new-session
subreaper:32 concurrent fork-producing commands, three grace0 sweeps[0,0,0],
32 remaining zombies. Two delayed Popen statuses29 and32 asyncio statuses23
were preserved. Exact fixture-only waits ended with zero descendants, exit0.
This proves a dev mechanism, not individual historical live adoption histories.

## Fix

`local_supervisor_worker.py` is a stdlib-only dedicated subreaper launched with
isolated Python `-I`. It exclusively owns the command shell and adopted children.
Popen retains original shell status; exact pidfd waits handle orphans. No broad
waits, global spawn hooks or negative ownership inference.

Private socket started/exit/settled frames separate shell exit from cleanup.
Payload does not inherit control fd. Stdio is directly inherited; worker closes
its copies after spawn. `local_supervisor.py` exposes shell PID/status/wait,
communicate and streams. Foreground commands can intentionally leave background
children; worker stays to reap them without delaying leader result/EOF. Managed
jobs retain kill-descendants-on-leader-exit semantics through explicit cleanup.

Cleanup pins identities, signals only discovered worker descendants, parses
proc stat as bytes, and fails closed for incomplete discovery/protocol failures.
Startup recovery is shielded; pending launches join the shutdown barrier.
Shutdown rejects new launches and settles existing owners. Missing settlement,
worker loss or unknown pre-protocol cleanup vetoes re-exec. Unkillable children
can exceed deadlines; worker retains ownership instead of abandoning them.

Rejected: global Popen registries (native bypass), generic SID reaping (leadership
history and CLONE_PARENT exceptions). Unrelated Popen/fork/asyncio owners remain
untouched. Local run_command/run_script and manage_process lower shell seams
are integrated. Remote paths and direct browser/native launch paths are not.

## Actual validation

All suites ran from development under the test-only owned supervisor, not live
Odin. Reports below all recorded primary0 and cleanup_ok true on final runs.

- Baseline standalone fixture:32 leaked,0 swept, final descendants0, exit0.
- Initial new tests:3 passed0.73s, `/tmp/zombie-r6-focused-01.json`.
- New tests plus process_manager/tree-reaping:182 passed128.77s,
  `/tmp/zombie-r6-gates-01.json`. Four warnings: two AsyncMock send_signal
  warnings, audioop deprecation, closed-event-loop transport warning.
- Expanded new tests plus visibility, retention, output capture and privacy:
  185 passed2.54s, one warning, `/tmp/zombie-r6-focused-02.json`.
- Main exit/workspace gates initially failed stale spawn-site classification.
  Updated helper classifications and removed process_manager's now-indirect
  site. Rerun177 passed47.80s, `/tmp/zombie-r6-independent-02.json`. Artificial
  shutdown cases emitted pending-task/coroutine diagnostics after pytest.
- Targeted ruff and local_supervisor/ssh/process_manager import smoke passed.
- Durable failure regression batch:10 local-supervisor tests passed3.66s,
  `/tmp/zombie-r6-durable-failures-01.json`, primary0, cleanup_ok true. Added
  isolated-interpreter tests for pre-protocol worker SIGKILL, post-handshake
  control loss, malformed control operation and non-ASCII proc comm. Failure
  cases assert shutdown refusal and re-exec veto, with nested owned-supervisor
  cleanup reports. The fixture does not contaminate pytest's global veto state.

New tests include48 concurrent doublefork workloads,24 ordinary asyncio exits47,
16 delayed Popen exits41 in inherited/new sessions and direct fork43. They verify
streaming, stdin, background leader/EOF separation, cwd/env, negative signal
status, missing executable/cwd, timeouts, launch/command cancellation and pending
shutdown. Worker disappearance and outer cleanup are checked.

Independent reviewer additionally reported real CLONE_PARENT behavior preserving
Popen41, helper SIGKILL failure/veto and non-ASCII comm cleanup. A discovered
pre-protocol SIGKILL cleanup gap was fixed and independently rerun successfully.
Those reviewer observations are separate from directly recorded suites above.

## Remaining limitations

No deployment/live soak; historical zombies remain. Direct BrowserSession/native
launches bypass this seam; browser tests launched through commands are covered,
direct Playwright is not. Uncatchable helper death can transfer descendants to
Odin; proxy fails and blocks re-exec rather than promising universal cleanup.
One extra Python process per command adds overhead; no zero-regression claim.
Background children retain their worker. Uninterruptible tasks cannot promise
bounded death. Late worker failure cannot retract an already delivered leader
result; failed ownership remains for shutdown veto. Existing suite warnings
need separate analysis. Focused tests are not a full-suite/live-health claim.
