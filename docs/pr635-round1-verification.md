# PR 635 round 1: compatibility evidence

All probes ran in development trees, using temporary files and privately owned
sleep/Python children. No live-install tests, services, deployments or agents.
Baseline: v4.11.0 master `a93348f004`.

## Foreground lifetime and output

`tests/test_pr635_round1.py` covers `sh`, `auto`, and `bash` through
`run_command`, `run_command_multi`, skill `run_on_host`, and streaming:
nohup, setsid, and fork/exit-parent children survive normal foreground return.
Separate tests verify timeout, cancellation and shutdown reap those same fixture
types, using exact supervisor ownership. No numeric-PID cleanup is used.

`tests/pr635_compat_probe.py` was run against master and this branch in each
mode. Every recorded `(code, text, recovery category)` matched master exactly:
successful command/multi/skill output; missing and unreadable files; apply_patch
host failure; HTTP transport timeout; script timeout and nonzero exit. Every
normal-completion background child was still alive four seconds after return,
and was subsequently reaped by the private supervisor shutdown.

## Settlement and latency

The existing ACK protects against the observed rapid-exit socket-close/write
race, but is no longer on the foreground return path. The monitor's ACK drain
and the empty worker's ACK wait are each bounded at two seconds. Delayed and
missing ACK tests verify respectively that foreground success does not wait and
that an already-empty worker cannot hang indefinitely.

An initial comparison exposed a 20ms startup polling quantization with bash.
The worker now uses a 1ms control-poll interval only during its first 100ms;
long-lived jobs keep the existing 20ms interval. Ownership and teardown are
unchanged.

Final interleaved samples (`tests/pr635_latency_probe.py`, 60 measurements each
after five warm-ups), milliseconds:

| Tree/mode | Median | Mean | Standard deviation |
|---|---:|---:|---:|
| master before sh | 64.01 | 69.83 | 13.06 |
| branch sh | 61.35 | 63.09 | 11.75 |
| master before auto | 66.48 | 72.78 | 13.01 |
| branch auto | 62.82 | 63.89 | 4.04 |
| master before bash | 64.95 | 71.85 | 15.77 |
| branch bash | 62.87 | 64.21 | 9.39 |
| master after bash | 69.94 | 75.62 | 15.06 |

No measured regression; these are workstation samples, not a universal latency
guarantee. In particular, ACK completion is asynchronous, not charged to the
foreground call.

## Remaining review items

Effective-shell text was removed from command results and process start/poll/list
presentation. Dynamic contracts, durable process records and process API fields
remain. Internal transports and recovery prefix gates retain the legacy contract.
Every pre-existing system-prompt line is identical to master, with only the shell
reminder added and the two size tests raised to 5400 characters.

Brace-range tests are classification-only; no dangerous classifier input is
executed. Session rollback tests restore one valid and one future-dated record,
discard only the future record, then persist and restore a new valid session.
