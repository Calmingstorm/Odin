# Final campaign timing sweep

This is a tests-and-documentation change on PR #356, not a runtime change or
deployment. The previous hosted failure at `6e66c4da` was the real store correctly
rejecting a checkpoint after a half-second lease expired. The test incorrectly
assumed two 0.3-second sleeps would always fit around a heartbeat.

## Scope and accounting

The sweep searched the test tree for sleeps, elapsed-time assertions, TTLs,
timeouts, deadlines, cooldowns and heartbeats, then inspected their surrounding
contracts. Search found 135 files containing sleep calls before the edits.
That is a search inventory, not a claim that all 135 were defective.

The final diff changes 80 existing test-function bodies across 35 test files,
plus shared test fixtures/helpers. This counts functions, not parameterized
cases. It includes companion clock-consistency changes and synchronization
cleanup; it does not mean 80 independently reproduced CI failures.

Changes cover:

- Real SQLite lease renewal and expiry fencing under controlled UTC, including
  advancing beyond the original TTL while staying inside renewed leases.
- Production heartbeat writes synchronized with thread-safe event notification.
- Circuit-breaker cooldown and recovery retry-after floors/caps under module-local
  monotonic clocks; fast-fail still forbids a recovery wait.
- Generation/tool/end-to-end accounting with aligned synthetic nanosecond clocks.
- Planner fan-out/diamond overlap and per-request context isolation using actual
  rendezvous barriers instead of machine-speed thresholds.
- Agent completion, auxiliary-client draining, reflection and policy-publication
  synchronization using completion tasks or entered callbacks.
- Real process launch, reader entry, terminal status, output drainage and kernel
  death checks instead of fixed sleeps. Process identity is selected from the
  newly started record, not a possibly retained historical record.
- Real exclusive SQLite lock failure with the adopted 100ms busy timeout checked
  directly, instead of demanding a scheduling slice under 500ms.
- Hyprland Python-only scope timeout submission remains exactly 250ms under a
  controlled clock; the native runtime is not altered or qualified by that test.

## Deliberately retained real time

Native Wayland guardian leases/heartbeats, socket/helper deadlines, real browser
and WebSocket cancellation, process-tree reaping, SIGTERM/SIGKILL escalation,
watchdog behavior and independent receiver timing retain their actual kernel and
transport clocks. X11 runtime modules and native fixtures are untouched.
Replacing these with fake time would remove the real behavior under test.
Existing isolation/grouping still applies; these tests retain residual
load sensitivity and are not claimed mathematically flake-free.

The resume-admission integration still exercises the real waiter, capacity-breaker
pacing, channel-lock queueing and delivery order. Bounded polling for external
process progress remains where no deterministic callback exists.

## Review corrections and evidence policy

Focused review caught and corrected three intermediate mistakes before final
validation: a thread Event.wait called on the event loop (the hung focused pytest
process was terminated), synthetic process substitutions that removed real
shutdown evidence, and mismatched accounting clock origins. Bare increases to
test deadlines were rejected and removed. These failed intermediate attempts
are not counted as successful repetitions.

Coverage baseline, exclusions and runtime code are unchanged. Shutdown warnings
remain visible and unsuppressed. Full local repetition results, exact hosted
checks/timings and final SHA belong in the PR body so they can refer to the
tested commit without a self-referential evidence commit.

## Campaign pause boundary

Onboarding, spark-only retirement, global DM slash registration, bounded quiet
process polling and the six-worker verification standard remain implemented.
The larger Hyprland campaign remains foundations only: full compositor-restart
continuity, durable grant handoff, reconnectable native ownership reconciliation
and receiver qualification are deferred. Live Discord/auth/DM propagation has
not been deployment-qualified. No deploy, merge or manual pipeline dispatch is
part of this task.
