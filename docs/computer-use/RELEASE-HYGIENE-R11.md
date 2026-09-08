# R11 release hygiene evidence

Scope: documentation, the nfpm documentation list and documentation-contract tests.
Both product-target and engineering-notes review documents were read through EOF.
Source inspection for remote feasibility was against `ab03f51` in an isolated
worktree. No service deployment/restart, package installation, graphical access,
remote implementation or release pipeline was performed in this documentation work.

## Changes

* The installed documentation is explicitly PACKAGING.md, OPERATOR.md and
  RECOVERY.md, not a recursive copy of the engineering directory. Relative links
  in those three pages resolve within that installed set.
* New-operator pages retain the tokenless-API warning before start/exposure,
  explicit desktop consent, private evidence storage and no-replay recovery.
* Individual operator/reviewer names in Markdown engineering records are replaced
  by roles. Historical artifacts, test outcomes and unresolved failures remain
  historical evidence. The existing extension's literal installed identifier is
  preserved because changing it only in docs would break setup instructions.
* README.md and historical handoffs distinguish the R11 implementation contract
  from R5-R10 application samples, restrictions and qualification results.
* REMOTE-FEASIBILITY-R11.md assesses actual attached capture/guardian dependencies,
  local identity coupling and Wayland FD/portal requirements. It proposes work,
  not an implemented or qualified remote feature.

## Recorded focused checks

From this worktree using `/tmp/cu-r10-dev-venv/bin/python`:

* `-m pytest -q tests/test_computer_shipped_docs_r11.py tests/test_computer_packaging.py --no-cov`:
  **10 passed**.
* `-m ruff check tests/test_computer_shipped_docs_r11.py`: **passed**.
* `git diff --check`: **passed**.

These validate the source manifest and documentation contracts, not a rebuilt
`.deb`, GUI behavior or the full R11 integrated suite. General attached apps,
actions/Unicode/crops, independent XI2/shared fallback and compositor adapters are
parallel implementation work. Their final integration checkpoint must supply
evidence before any new qualification or release-readiness claim. The parent may
update that checkpoint after integration; this record does not pre-claim it.
