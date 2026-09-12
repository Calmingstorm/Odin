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

`tests/parallel_policy.py` conservatively assigns subprocess, PID-namespace,
private-display tests and their imported test fixtures to one `xdist_group`.
The resume-admission module joins that group. Grouping is within each run,
not mutual exclusion between the two runners. The native X11 dispatch/safety
proofs additionally run last in that group and take a per-UID host flock so
the two runners cannot run these deadline-sensitive probes together. Their
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
