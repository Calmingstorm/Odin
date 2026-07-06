# RFC-005: Type-Safety Ratchet (mypy gate + annotation waves)

Status: R1 — APPROVED, plan of record (Odin re-review LGTM 2026-07-06, no remaining blockers). Implementation advisory adopted: the gate's message normalizer stays boring and deterministic — strip absolute/worktree path prefixes and collapse whitespace, never rewrite quoted attribute/type names.
Campaign branch: `types/rfc005` (created after plan approval).
Predecessors: RFC-001–004 (decomposition era, complete). This campaign changes ZERO runtime behavior by construction: its output is annotations, a checker config, and a CI gate. Bug **fixes** discovered by the checker are explicitly out-of-band (§5).

## 1. Motivation

Three recent production bugs were type errors that Python only surfaces at runtime, on the unlucky execution path:

- `spawn_loop_agents` read `bot.config.context_compression` — an attribute that has never existed on `Config`. Every invocation crashed from the day the tool shipped until soak round-2 (fixed PR #145). mypy error-class: `attr-defined`.
- Loop reflection silently suppressed since the P10 move — `hasattr(self, "reflector")` probing an attribute that had moved owners (fixed PR #148). Same class.
- The `time.monotonic()` zero-sentinel family (7 fixed in v3.47.0) — partially in reach of stricter Optional typing.

The baseline scout (§2) shows **68% of current mypy findings are exactly this class** (`attr-defined` + `union-attr`). A checker in CI moves detection of that class from "weeks later, in production, if soak happens to exercise the line" to "red X on the PR before review starts" — for my PRs and Odin's alike.

## 2. Inventory (scout run verified against master @ cb0911e, mypy 2.1.0, Python 3.12, default mode)

- **408 errors in 68 of 223 source files.** Pydantic plugin (`pydantic.mypy`) is count-neutral on this baseline — it can be enabled from P0 without noise.
- By error class: `attr-defined` 196, `union-attr` 83, `arg-type` 37, `return-value` 26, `valid-type` 14, `import-untyped` 13, `assignment` 10, `index` 8, `import-not-found` 8, `var-annotated` 4, `call-overload` 2, `str-unpack` 1.
- `valid-type` 14 = annotations already in the codebase that are **malformed today** — the checker is partly auditing documentation we already wrote but never verified.
- `import-untyped`/`import-not-found` 21 = third-party libraries needing stub packages (`types-*`) or per-module ignore config — enumerated and resolved in P0.
- Per-package density: discord 223, tools 58, knowledge 23, agents 21, web 19, health 14, search 10, llm 6, sessions 5, `__main__` 5, audit 5, scheduler 4, odin 3, notifications 3, setup_wizard 2.
- The ratchet mechanism already exists in-house: `scripts/ci/lint_gate.py` (RFC-003) computes a normalized finding-set diff vs merge-base for ruff. The type gate reuses that proven pattern with mypy output.

## 3. Deliverables

1. **Tooling (P0):** `mypy` (pinned) + required `types-*` stubs in the `[dev]` extra; committed `mypy.ini` (py 3.12, `plugins = pydantic.mypy`, default strictness campaign-wide); `scripts/ci/type_gate.py`; new `types-no-new` job in `.github/workflows/test.yml` beside `lint-no-new`. Pinned versions: checker upgrades are deliberate PRs, never ambient CI drift.
   - **Gate mechanics (R1 blocker B1):** findings are normalized to `(file, error-code, normalized-message)` — line numbers excluded so drift doesn't churn — and compared as **Counter multisets**, never plain sets: `new_count[key] > base_count[key]` ⇒ regression. A plain set diff cannot see a second identical error appear in the same file, which is precisely the attr/union regression class the gate exists to stop.
   - **Two-tree evaluation (R1 advisory A1):** the gate runs HEAD's checker + HEAD's `mypy.ini` (absolute `--config-file` path) against BOTH the current tree and a merge-base `git worktree` — the `lint_gate.py` model. This makes P0's own PR self-consistent (the merge-base has no mypy config; HEAD's config is applied to it), and every later PR compares like-for-like by construction. The committed baseline snapshot is **documentation and ledger input only, never the enforcement source**.
2. **Baseline snapshot + findings ledger (P0):** the 408 findings triaged once into three buckets — *suspected real bug*, *annotation gap*, *guarded-at-runtime noise* — recorded in `docs/plans/type-safety-findings.md`. **The suspected-real-bug bucket goes to Aaron as a report; he signs off on which get fixed.** This report is a P0 deliverable, not an afterthought — it is the campaign's first payoff. The snapshot records the exact reproduction universe (R1 advisory A2): mypy version, Python version, `mypy.ini` content hash, stub package versions, and the exact command line the gate uses.
3. **Annotation waves (P1+):** per-package error count → 0, excluding ledgered findings awaiting Aaron's triage decision (the ratchet tolerates pre-existing findings indefinitely).
4. **Completion ratchet (final phase):** per-package `disallow_untyped_defs` flips for finished packages so they cannot silently regress to untyped.

## 4. Behavior-preservation rules (the campaign's core contract)

Wave PRs may add ONLY:
- type annotations on existing defs/attrs; `from __future__ import annotations` where needed
- `typing`/`collections.abc` imports and `if TYPE_CHECKING:` import blocks
- type aliases and `Protocol` definitions (in type-only positions)
- `typing.cast(...)` (a runtime no-op returning its argument)
- narrow `# type: ignore[code]` with a trailing reason comment

Wave PRs may NOT add or change ANY statement with runtime effect: no `isinstance`/None guards, no default-value changes, no signature changes, no renames, no control flow, no refactors. **`union-attr` policy:** where the access is already guarded at runtime (truthiness/try-except), resolve with `cast` or a reasoned ignore; where it is NOT guarded, it is a *finding* for the ledger — adding the guard is a behavior change and belongs to Aaron's triage, not to a wave. **`cast` discipline (R1 advisory A4):** `cast` is semantically neutral but still an evaluated call — import it normally (`from typing import cast`), keep casts minimal, and prefer a reasoned ignore where a cast would land on a hot path or read less clearly. **Malformed existing annotations (`valid-type`, R1 advisory A5):** these are lies already checked into the code — fix in the owning wave when the correction is type-only; ledger when the correct type implies behavior uncertainty; never leave one silently under "pre-existing tolerated" without a note. Every wave PR: full suite green (6,156), `lint-no-new` = 0, `types-no-new` ≤ 0 (only removals), and Odin reviews the diff specifically against this section.

**Mechanical wave-review checklist (R1 advisory A3 — applied to every wave PR):**
- [ ] no changed or added non-import runtime statements
- [ ] no added guards or control flow
- [ ] no signature/default changes, no renames, no moved code
- [ ] every `cast`/`# type: ignore[code]` carries a reason comment
- [ ] every unguarded `union-attr` went to the ledger, not a "fix"
- [ ] suite green; `lint-no-new` = 0; `types-no-new` shows only removals

## 5. Findings protocol (Aaron's gate)

An error whose correct resolution would change runtime behavior is never "fixed" inside a wave. It is ledgered with a **stable ID independent of line numbers** (R1 advisory A6): `TS-0001`, `TS-0002`, … with fields `id / file:line-observed / error-code / message / classification / suspected impact / proposed fix / Aaron verdict / status`. Ledger batches go to Aaron; his verdicts: **fix now** (each becomes its own small PR through the standard discussion→review cycle), **defer**, or **won't-fix** (then a reasoned ignore referencing the TS id lands in a later wave). The checker finds; Aaron decides; fixes ride separately with full review.

## 6. Phases (each = one PR into the campaign branch, Odin-reviewed, CI-gated)

- **P0** — tooling + gate + committed baseline + findings ledger + **first report to Aaron**. No annotations.
- **P1** — small-package batch (audit, scheduler, sessions, llm, notifications, search, odin, setup_wizard, `__main__`, health; ≤14 errors each, ~60 total): the wave pattern matures on low-stakes ground.
- **P2** — web (19) + agents (21).
- **P3** — knowledge (23) + tools (58).
- **P4** — discord (223); pre-split by error clustering into P4a (leaf modules) / P4b (client, tool_loop, wiring, intake) if the wave-1 experience says 223 is too big for one review.
- **P5** — per-package `disallow_untyped_defs` flips via **per-module `[mypy-src.<pkg>.*]` override sections** (R1 advisory A7), never a global flip — each completed package gets its own override block as it finishes.
- **R2** — results section appended here; assessment of whether stricter modes are worth a future campaign.

## 6a. R1 amendment log (Odin plan review, 2026-07-06)

Blocker, fixed: **B1** — the type gate compares **Counter multisets** of normalized findings (`new_count[key] > base_count[key]` ⇒ regression), never plain sets, closing the "same error text, different wound" identity hole (§3.1). Advisories, all adopted: **A1** P0 baseline mechanics made explicit — two-tree evaluation with HEAD's checker+config on both head and merge-base worktrees; committed snapshot is documentation only (§3.1); **A2** baseline records the exact invocation universe: versions, config hash, command (§3.2); **A3** mechanical wave-review checklist added (§4); **A4** `cast` runtime-cost discipline (§4); **A5** `valid-type` malformed-annotation handling — fix-if-type-only, ledger-if-uncertain, never silent (§4); **A6** stable `TS-NNNN` ledger IDs with full field set incl. Aaron verdict + status (§5); **A7** P5 strictness flips are per-module override sections, not global (§6). PR shape confirmed: P0 as one PR (gate + config + baseline + ledger/report together, zero annotation churn).

No wall-clock pressure between phases; the gate protects from P0 onward regardless of wave pace.

## 6b. R2 — results (code-complete, 2026-07-06)

**Baseline 388 → 9, and the nine survivors are exactly the findings ledger**: TS-0001 (`utility.py:66,68`), TS-0002 (`diff_tracker.py:91,97`), TS-0003 (`odin/cli.py:76`), TS-0004 (`skill_context.py:162`), TS-0005 (`:336` ×2), and the dead `src.setup` import. The checker's remaining output and the suspected-real-bug ledger are the same list — the campaign's intended end state.

- Waves: P1 small packages −50 (PR #180) · P2 web+agents −37 (#181) · P3 knowledge+tools −75 (#182) · P4 discord −217 (#183). Every wave Odin-reviewed; suite pinned at 6,164 passed / 4 skipped throughout; both gates `new=0` on every PR. Odin's wave verification evolved into an AST-equivalence check (strip annotations/TYPE_CHECKING → compare) — stronger than the plan's checklist and recommended for any future annotation work.
- The single highest-leverage mechanic: typing the RFC-002 narrow-deps dataclass fields via `TYPE_CHECKING` imports (~180 findings). Each collapse lit up a handful of previously-invisible findings (§1's reach effect), several of which were annotation *lies* worth fixing (`-> str` handlers returning tuples, a Literal-valued policy field, decorator-as-type middleware annotations).
- **P5 executed as amended (measured deviation):** `check_untyped_defs = True` adopted globally — measured cost was exactly ONE finding (a monkey-patch marker attr, reasoned ignore), so every function body is now checked. The planned per-package `disallow_untyped_defs` flips were **measured at 228 findings and deferred** to a possible future campaign: flipping mid-P5 would either violate the campaign's own `new=0` discipline or smuggle a fifth annotation wave into a config phase. The operative regression lock is the Counter-multiset gate + full-body checking: new errors of any kind, in any file, block the PR.
- Bugs found by the campaign before any fix shipped: 5 confirmed (TS-0001…0005), two sharing the `_run_on_host` tuple-return root cause, one hiding behind a pre-existing `type: ignore`.

## 7. Risks

- **pydantic + `from __future__ import annotations` interplay** (`config/schema.py` wave): pydantic v2 resolves stringified annotations routinely; the extensive config test coverage plus full suite gates the wave. If a specific model misbehaves, that module skips the future-import (annotations stay evaluated — also inert).
- **discord.py channel unions** drive much of the 83 `union-attr`; §4's policy prevents "fixing" them into behavior changes.
- **Checker/stub version drift** — pinned in P0; upgrades are reviewed PRs.
- **Merge conflicts with concurrent feature work** — annotation diffs are wide but shallow; campaign waves are fast and the repo is between campaigns.

## 8. Revert

Remove the CI job and config — annotations are runtime-inert and can remain harmlessly forever. No deploy dependency: nothing in this campaign requires touching `/opt/odin` except the eventual routine release.
