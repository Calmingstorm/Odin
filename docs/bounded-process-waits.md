# Bounded quiet-process waits

The repetition guard cannot infer a hung job from silence. In particular,
shell redirection can hide every byte of a healthy build from process capture.
Liveness and elapsed time are not evidence of progress either.

## Policy

Only an iteration containing exactly one `manage_process(action="poll")`
can receive quiet-wait permission. It must request 30–120 seconds and the
execution must actually take at least 30 seconds. A native newest-lines
report must identify the running PID, process generation and its original
one-hour lifetime deadline. Errors, legacy reports, retained page reads,
immediate polls and terminal results keep the existing repetition ladder.

The permission marker is stable. Neither elapsed time nor a heartbeat is
hashed as progress. Judgment explicitly allows that marker only until the
original deadline; it does not reset the warned flag. The existing checkpoint
stores it in the fingerprint window, and resume rechecks the deadline.
Expiry returns to the existing warning/termination policy, without killing
the background process. The process manager's existing auto-kill remains
the execution backstop. Global turn/iteration limits and cancellation remain.

This is a wall-clock deadline, matching the existing process start metadata.
It is not renewed on poll or resume; the independent process lifetime timer
remains the backstop if the host clock changes. There is no arbitrary log-file
inspection or automatic command rewriting.

## Strict paths remain strict

`is_wait_iteration`, `_detect_stuck_from_fingerprints`, `StuckLoopTracker`,
and pre-execution non-wait judgment are unchanged. Mixed batches containing
a poll plus a command still trigger before the third batch executes, even
when the poll returns valid bounded-wait metadata. Agent wait policy is
unchanged. The shared chat loop changes only to measure execution duration,
issue lone-poll markers and recognize them in post-result/resume judgment.

## Invocation

Prefer streaming output. To keep a log as well, invoke a bash pipeline with
`set -o pipefail` and `2>&1 | tee /tmp/job.log`. Use unbuffered output when
supported by the job. Pipefail preserves failure instead of reporting tee's
success. Do not rerun an existing job simply to change how it was launched.
Poll with `wait_seconds=60` (120 is also supported).

## Regression evidence

`tests/test_bounded_process_wait.py` covers forty quiet polls, a stable marker
despite advancing time, expiry, native deadline output, resumed checkpoints,
malformed/mismatched metadata, rapid polls and strict mixed-batch behavior.
Existing wait, non-wait, process and checkpoint tests remain in the suite.
No X11 code, coverage baseline or warning suppression is changed.
