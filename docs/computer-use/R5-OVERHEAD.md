# R5 disabled overhead and enabled-idle lifecycle

## Scope and verdict

Measured source-only on 2026-09-07 using
`scripts/computer-feasibility/disabled-overhead.py` and the shared dev venv.
Base: `d5fc7eb2e891d9e0eec8449d794ec42b114d71a0`.
Current PR350 source snapshot: `1c4f66226b52823bd13956b84d981c80bcd47d32`.

The small combined ordinary workload's **median disabled regression was
3.87%**, below DECISIONS' 5% target in this run. This is **not an end-to-end
latency acceptance pass**: disabled p95 was substantially worse in this run,
and tiny component medians exceeded 5%. Do not turn this into a blanket
"disabled overhead under 5%" claim. No full bot composition/startup, provider
request, network, model inference, or real desktop workload was measured.

## Isolation and method

- Unique owned `/tmp` directory, three `git archive` trees, separate persistent
  child interpreters for base, current disabled, and current enabled-idle.
  No checkout, worktree, commit, deployment, live configuration, or restart.
  Current source is required to match HEAD before archiving.
- Only synthetic Config objects; permission and memory paths point into the
  temporary tree. A placeholder Discord value satisfies schema validation;
  no real credentials are loaded. No commands/network are dispatched.
- Three warmup batches per component/mode, excluded from results. Thirty
  rounds, 18 randomized/interleaved batches per round, deterministic seed 350.
  540 raw measured batch times. Imports and fixture construction excluded.
- Counts per batch: cached catalog 100,000; uncached catalog 1,000; scoped
  request catalog 10,000; preprocessing 10,000; dispatch 1,000; combined
  workload 1,000. GC remains enabled. No affinity/frequency isolation.
- Catalog is the real ToolCatalog. Scoped requests use the real request-scoping
  method and PermissionManager's user tier plus a three-tool API allowlist.
- Dispatch uses real `ToolExecutor.execute` through scoping, risk, recovery,
  handler resolution and result handling. The actual `memory_manage` handler's
  missing-key validation branch is deliberately pure. It does not measure
  memory storage, disk access, or a successful memory lookup.
- Preprocessing is narrowly defined as existing catalog scoping plus current
  `_computer_frames` with ordinary text history and the disabled lambda returning
  None. It is not the complete provider/model preprocessing pipeline.
- Combined workload is one such preprocessing operation plus one dispatch.
  This fixed mix avoids diluting overhead with artificial sleeps or network IO.
- After construction a Python audit hook refuses socket connects, subprocess
  launches and os.system. Enabled-idle uses the real ComputerIntegration,
  controller and temporary SQLite/evidence store. Constructor injection skips
  desktop profile preflight; it does not establish backend readiness. No session
  open, observation, capture, or desktop input is invoked.

## Results

All times below are **microseconds per operation**, obtained by dividing batch
wall time by batch count. P95 is the nearest-rank p95 of 30 batch averages,
**not individual-request p95**. Raw integer nanosecond batch samples remain in
the evidence JSON.

| Component | Base median / p95 | Disabled median / p95 | Enabled idle median / p95 | Disabled median delta |
|---|---:|---:|---:|---:|
| Cached catalog | 0.0550 / 0.0584 | 0.0590 / 0.0660 | 0.0581 / 0.0620 | +7.34% |
| Uncached catalog | 68.030 / 71.520 | 69.769 / 71.426 | 202.188 / 206.069 | +2.56% |
| Scoped catalog | 2.453 / 2.566 | 2.433 / 2.594 | 2.498 / 2.608 | -0.81% |
| Narrow preprocessing | 2.517 / 2.619 | 2.716 / 2.834 | 3.185 / 3.314 | +7.92% |
| Ordinary dispatch | 49.536 / 79.529 | 50.859 / 66.090 | 49.668 / 79.591 | +2.67% |
| Combined workload | 55.108 / 55.885 | 57.241 / 91.553 | 56.696 / 84.829 | +3.87% |

Noise: median absolute deviation / median for base/disabled/idle respectively:
cached 0.89/1.51/1.33%; uncached 0.68/0.83/0.61%; scoped
1.92/2.04/1.66%; preprocessing 1.74/1.34/1.34%; dispatch
0.67/1.08/0.75%; combined 0.81/0.87/1.05%.
Low central MAD does not erase tails: combined batch-average ranges were
53.069-59.179 us base, 56.489-110.722 us disabled, and 55.623-108.809 us idle.
The disabled combined p95 was approximately 63.8% above base in this sample.
The 4 ns cached-catalog delta is not a reliable absolute causal attribution;
separate interpreters and host scheduling can affect microbenchmarks. Likewise,
the slightly faster scoped median is not evidence of a real improvement.

## Lifecycle and catalog evidence

- Base and disabled catalogs: 67 definitions. Enabled-idle: 70, with three
  computer tools. All 67 ordinary definitions serialize **byte-identically**
  across all modes after excluding computer tools. SHA-256:
  `8e09894f1b3148bb9bcb5504e42ba60934afb7ca3d14a04998712d3e8d43618f`.
  No skill/MCP definitions were configured in this fixture.
- Disabled lifecycle start: no service constructed and **zero new asyncio
  tasks**. Single construction/start timing 1.45 us, not a latency distribution.
- Enabled-idle lifecycle start: real integration/controller/store constructed,
  one `computer-evidence-expiry` janitor task, 24.2405 ms once. No desktop
  session was requested. Blocking worker command reads mean this fixture is
  not an idle CPU or continuous janitor-scheduling benchmark.
- All three workers closed with zero remaining asyncio tasks and exited 0.
  Lifecycle close asserted service and janitor references were cleared.

## Evidence and reproduction

Successful raw evidence:
`/tmp/odin-r5-overhead-i1ayvg4c/results.json`.
Contains source SHAs, deterministic trial order, all 540 raw times, summaries,
catalog hashes and lifecycle/cleanup observations. Adjacent source archives,
serialized catalogs and child stderr files are retained locally, not committed.

Run from the dev tree with its venv Python and the script path above. It creates
a new unique evidence directory, never overwrites this run, and prints its path.
Two earlier fixture setup attempts failed before any measured trial because
required Config fields were missing. Their evidence remains in
`/tmp/odin-r5-overhead-lnsjjpks` and `/tmp/odin-r5-overhead-v__ytn2h`;
neither contributes samples or acceptance claims.

Validation: script executed successfully, script py_compile passed, and
`git diff --check` passed. No full/main/service/config test suite was run for
this measurement. Existing edits to `main_scratch_windows.py` and its test
were present before this task and were not modified by this task.
