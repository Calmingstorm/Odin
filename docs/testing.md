# Development verification

Work in a development clone/worktree, never `/opt/odin` or the live desktop
session. Do not deploy, restart Odin, merge master or dispatch a release
pipeline as part of testing.

Install `python -m pip install -e '.[dev]'` in a Python 3.12 virtualenv, then:

- `make test`: plain full suite, `-q -n 6 --dist loadgroup --durations=25`.
- `make test-cov`: same workers/distribution/durations under
  `COVERAGE_CORE=sysmon`, followed by the unchanged per-file coverage ratchet.
- `make test PYTHON=.venv/bin/python` (and likewise `test-cov`) selects a venv
  without activating it. CI invokes the same Make targets.
- For a serial diagnostic baseline, `python -m pytest -q --durations=25`.
  Targeted `python -m pytest tests/test_example.py` is serial by default.

Six workers is a ceiling per full-suite job, NOT `-n auto`. At most two
full-suite jobs run concurrently, with six workers each: twelve pytest workers.
Make also caps common native numeric-library pools to one thread. This is
not a claim that coordinator, I/O, or child-process thread count is twelve;
do not add CPU-heavy nested pools or another concurrent full-suite run.

`tests/parallel_policy.py` conservatively identifies subprocess, PID-namespace
and private-display tests, their imported test fixtures and the resume-admission
module, and spreads them over three serial `xdist_group` lanes
(`process-and-timing-1` to `-3`). Modules in one lane never run concurrently;
the lanes run concurrently with each other, as the two CI jobs' groups always
have on the shared host. Grouping is within each run, not mutual exclusion
between the two runners. Lanes are balanced by measured seconds per module in
`tests/process_group_weights.json`. After a full plain run with
`--junitxml=timing.xml`, refresh it with
`python scripts/ci/refresh_process_group_weights.py timing.xml`. Weights only
balance the lanes: a module without one gets a default and stays grouped. The
native X11 dispatch/safety proofs share the heaviest lane, run last in it, and
take a per-UID host flock so the two runners cannot run these deadline-sensitive
probes together. That lane carries a minute more measured work than any other,
so the proofs normally start after the run's other process lanes have drained.
This is a scheduling heuristic on measured weights, not a barrier: stale
weights, load or a targeted run can change the order. Their
runtime, assertions and dispatch deadlines are unchanged. Exact child ownership, private
display allocation and temporary paths remain required. New shared-resource
tests must extend the policy and its regression tests when necessary.

Keep BOTH plain and instrumented verdicts: coverage changes scheduling, and
this suite exercises cancellation, subprocesses and shutdown. Do not trade
away that independent signal merely to halve runtime.

Measure before optimizing. Preserve real kernel behavior tests; replace only
irrelevant waits or controlled timeout inputs. Do not replace all sleeps with
no-ops, relax assertions, suppress warnings, retry failures into green, or
edit `coverage-baseline.json` to accommodate test-speed changes. Repeated
parallel runs (including plain/coverage concurrently) are required; report
the exact count and any failures, not a proof that flakes cannot exist.

Stream long-running commands. To retain a log, explicitly invoke Bash with
`pipefail` and `tee`; `/bin/sh` does not necessarily support `pipefail`.

## Deterministic time and concurrency

- Lease, TTL, cooldown and accounting tests must control the clock at the
  owning module, keeping the real store, state machine and expiry predicates.
  Do not patch the shared standard-library `time.monotonic` object: that also
  changes the event loop's clock. Keep accounting start and end samples on the
  same clock, including dataclass default factories captured at import time.
- Synchronize on task completion, an entered callback, a real write, or an
  explicit event/barrier. A sleep is not evidence that another task started or
  finished. Parallelism is proved by overlapping participants, not a wall-clock
  speed threshold. Use bounded harness waits to diagnose deadlocks, not as
  performance assertions. Invoke blocking thread events off the event loop;
  notify asyncio events from worker threads with `call_soon_threadsafe`.
- Keep actual subprocesses, SQLite locks, output drainage and process-death
  assertions where those are the contract. Native input, kernel escalation and
  receiver/transport deadline tests retain real time when simulating the clock
  would stop proving the behavior. These are not claimed deterministic merely
  because they passed under load.
- Never fix a race by enlarging its deadline, loosening its assertion, dropping
  expiry checks, suppressing warnings, or retrying unchanged failures into green.

The final campaign sweep and remaining native timing boundaries are recorded in
`docs/test-timing-sweep-2026-09-12.md`.
