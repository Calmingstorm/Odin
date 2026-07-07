# RFC-006 Findings Ledger

Bugs surfaced by coverage waves. Protocol (plan §5): the test pins CORRECT
behavior and is `pytest.mark.xfail(strict=True, reason="COV-NNNN …")` until
fixed; batches go to Aaron (fix / defer / won't-fix); approved fixes ride as
their own reviewed PRs, never inside a coverage wave.

| ID | File:line | Behavior pinned vs observed | Wave | Aaron verdict | Status |
|---|---|---|---|---|---|
| — | — | (none yet) | — | — | — |

Baseline at campaign start (master @ `16ec441`, 2026-07-07): total 66.8%
reported, 202 gated files, ceiling-per-file recorded in
`coverage-baseline.json`.
