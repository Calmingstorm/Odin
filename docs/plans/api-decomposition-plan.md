# RFC-003: CI Test Gate + Web API Decomposition

**Status:** PLAN OF RECORD — Odin LGTM 2026-07-05 conditional on the R1 amendments, applied below
**Author:** Claude (with Aaron's directive)
**Reviewer:** Odin
**Depends on:** RFC-002 (facade retirement, shipped v3.46.0)
**Branch:** `refactor/api-decomposition` (isolated; no master merge without Aaron's sign-off; local deploy for soak)

## 1. Motivation

Two workstreams, sequenced so the first protects the second.

**A. There is no CI test gate.** `.github/workflows/` holds `release.yml` (tag-triggered) and `ui.yml` (dist drift). The 6,073-test suite, the characterization harness, and the facade contract never run automatically — every guarantee from RFC-001/002 depends on reviewer diligence. One `test.yml` converts the safety net from practice into law, and (because `pull_request` workflows run from the PR merge ref) it starts gating this very campaign's phase PRs the moment P0 merges to the campaign branch.

**B. `web/api.py` is the new biggest file.** 4,155 lines, 183 routes, ~30 URL domains, one module. Same disease RFC-001/002 cured, one layer up: every WebUI feature lands here, review diffs are needles in a haystack, and a meaningful slice of the 1,470-finding lint baseline lives here. The playbook is proven: characterize → carve verbatim by domain → contract.

Non-goals: zero behavior change, zero endpoint URL/schema changes, no new endpoints, no auth-middleware changes, `ui/` untouched, no master merge without sign-off.

## 2. Current state (measured 2026-07-05, master @ 4b04373)

- `create_api_routes(bot)` (api.py:167) builds one `RouteTableDef` with all 183 handlers as closures over `bot`; ~25 section comments already mark domain boundaries.
- Module-top shared helpers (`_is_sensitive_key`, `_validate_string`, `_safe_filename`, `_scoped_chat_channel`, `_sanitize_error`, `_safe_int_param`, `_contains_blocked_fields`, `_deep_merge`, `_redact_config`, `_write_config`, `_write_env_file`) are used across domains.
- Route census by URL prefix: knowledge 11, skills 9, sessions 8, schedules 8, codex 8, grafana-alerts 6, ollama 5, llm 5, tools 4, permissions 4, outbound-webhooks 4, memory 4, mcp 4, kimi 4, discord 4, agents 4, trajectories 3, tokens 3, slack 3, pools 3, loops 3, issues 3, host-access 3, auth 3, audit 2, + singletons (chat, execute, health, status, config/reload cluster, processes, learned, compression, routing, resource-usage, governor, startup, affordances, agent-trajectories).
- Endpoint behavior is already test-covered (test_web_api_new_endpoints, test_web_chat, test_execute_api, test_web_auth_policy, test_web_security_reliability, test_knowledge_*, test_connection_pools, test_health_checker, …) — that suite is the behavioral net; what's missing is a **route-table parity pin**.
- Post-RFC-002 the handlers consume only public bot surface (`bot.llm_gateway`, `bot.prompt_builder`, …) — the negative contract holds over `src/web/`, so moved handlers can't smuggle facade spellings back in.

## 3. Design

### 3.1 P0 — the CI gate (`.github/workflows/test.yml` + `scripts/ci/lint_gate.py`)

- Triggers: `pull_request` (all branches) + `push` to master. Concurrency-cancel per ref. `actions/checkout` with `fetch-depth: 0` (R1) — the lint gate needs real history for `git merge-base` on PR merge refs.
- Job `tests` (ubuntu-latest, Python 3.12, pip cache): `pip install -e ".[dev]"` → `pytest -q` (asyncio auto; ~2 min). The 4 local skips must skip identically in CI; anything newly failing in CI gets a skip-with-reason or a fix in P0 itself — the gate merges green.
- Job `lint-no-new`: full `ruff check` cannot gate (1,470 pre-existing findings), so the gate is the finding-set DIFF: `scripts/ci/lint_gate.py` (committed, stdlib-only — the content-normalized comparator proven during RFC-002) runs ruff at the PR merge-base and at HEAD (via `git worktree`), normalizes findings to (file, code, source-line-text), and fails on any NEW finding while printing resolved ones. Push-to-master runs report-only.
- Explicitly NOT in P0: coverage gates, Windows matrix, pyright — future work, listed §7.

### 3.2 The carve — domain modules under `src/web/api/`

`src/web/api.py` becomes a package: `src/web/api/__init__.py` keeps the public entry `create_api_routes(bot)` AND (R1) the full compatibility surface live consumers actually use — `setup_api(app, bot)`, re-exports of `_is_sensitive_key`/`_redact_config`/`_safe_int_param` from `common.py`, and a module-level `process_web_chat` binding so `patch("src.web.api.process_web_chat", ...)` seams keep working. P1 lands an import-compatibility pin (a test importing every one of those names from `src.web.api`) BEFORE the swap, so P5 cannot break them undetected. Composition:

```
src/web/api/
  __init__.py      create_api_routes(bot): routes = RouteTableDef(); register_* calls; return routes
  common.py        the 11 shared helpers (moved verbatim; single home)
  llm_admin.py     codex/ollama/kimi/llm/pools (~25 routes)
  security.py      auth/tokens/permissions/host-access/governor (~14)
  sessions_chat.py sessions/chat/execute/trajectories/agent-trajectories (~15)
  knowledge_mem.py knowledge/memory/learned (~16)
  skills_api.py    skills (~9)
  schedules_api.py schedules (~8)
  agents_loops.py  agents/loops/processes/tasks (~10)
  config_admin.py  config/reload/discord/startup/affordances/personality cluster (~14)
  integrations.py  grafana-alerts/outbound-webhooks/slack/issues/mcp (~20)
  observability.py audit/health/status/resource-usage/compression/routing/tools (~12)
```

Registrar shape: `def register_llm_admin(routes: web.RouteTableDef, bot) -> None:` with the handler closures moved VERBATIM (same decorators, same bodies, same closure-over-`bot` pattern — no behavior surface to drift). `create_api_routes` calls the registrars in the original section order so route registration order (and any aiohttp precedence) is unchanged.

### 3.3 The contract — route-table parity

P1 lands `tests/characterization/test_api_route_parity.py` BEFORE any carve:
- Pins the exact frozen set of `(method, path)` pairs (all 183, generated from the pre-carve table and hand-audited) — the carve cannot lose, rename, or duplicate a route.
- Pins registration ORDER as a list (aiohttp resolves static-vs-variable path collisions by order; two domains share prefixes).
- Pins that every handler is still a closure receiving the same `bot` object (spot-checked via a fake-bot dispatch test per domain).
- Negative addition: after P5, `src/web/api/` modules may import shared helpers ONLY from `common.py` (source-scan) — no copy-paste drift, the RFC-001 lesson.

### 3.4 Lint burn-down (scoped)

After the carve, each domain module is small enough to clean. P6 fixes ALL ruff findings inside `src/web/api/` (measured: 59 — 49×E501, 7×I001, 1 each E401/N806/N811; R1 corrected the earlier overestimate) and re-baselines the CI lint gate accordingly. Debt outside `src/web/` stays untouched (explicitly out of scope).

## 4. Phases (one PR each into `refactor/api-decomposition`; every PR Odin-reviewed; CI green required from P1 on)

| Phase | Scope | Key gates |
|---|---|---|
| **P0** | `test.yml` + `scripts/ci/lint_gate.py`; fix/skip-with-reason anything CI-red that is green locally | both jobs green on the P0 PR itself; suite time ≤ ~5 min |
| **P1** | Route-parity characterization (set + order + dispatch spot-checks); import-compatibility pin for `create_api_routes`/`setup_api`/helpers/`process_web_chat` (R1); `common.py` extracted with api.py re-imports (no handler moves yet) | parity + import pins green pre-carve; zero new lint |
| **P2** | Carve wave 1: `llm_admin`, `security`, `observability` | parity green; per-domain web tests green; api.py shrinks accordingly |
| **P3** | Carve wave 2: `knowledge_mem`, `skills_api`, `schedules_api` | same |
| **P4** | Carve wave 3: `sessions_chat`, `agents_loops` | same |
| **P5** | Carve wave 4: `config_admin`, `integrations`; api.py → package `__init__` composition (≤ ~120 lines); helper-single-home scan lands | parity green; `wc -l` gate: no module > ~600 lines |
| **P6** | Lint burn-down inside `src/web/api/`; CI lint baseline re-anchored | `ruff check src/web/api/` fully clean; suite green |
| **P7** | Docs (README structure block, architecture memory), **local deploy to /opt/odin**, soak: web-focused battery (Odin drives every WebUI page domain + REST spot checks over the bridge) + my journal/audit parallel audit; findings → fix PRs | service healthy; battery PASS; report for Aaron's pipeline sign-off |

Rollback: phase merges are merge commits on the campaign branch; `git revert -m1` any phase. Branch deleted after the eventual master merge per the standing hygiene rule.

## 5. Risk register

| Risk | Mitigation |
|---|---|
| Route order changes resolution for overlapping paths | order pinned as a list in the parity contract; registrars called in original section order |
| A moved handler silently drops auth/middleware behavior | middleware is app-level (health/server.py), untouched; handlers move verbatim; test_web_auth_policy stays green |
| CI diverges from local (missing system dep, env) | P0 merges only when green; skips carry reasons; the job mirrors the documented local commands |
| lint_gate.py false positives on line moves | content-normalized comparison (file, code, source-line-text) — proven during RFC-002 against 1,481 baseline findings |
| Helper drift (copies of `_redact_config` etc.) | single-home `common.py` + source-scan test |
| api.py file→package import breakage | public entry name + import path preserved; import-smoke in CI; grep for `from src.web.api import` consumers before P5 |

## 6. Success criteria

1. Every PR to the repo runs pytest + the lint diff automatically; a red X blocks merge.
2. `src/web/api.py` (4,155 lines) → package of ~11 domain modules, none > ~600 lines; composition `__init__` ≤ ~120 lines.
3. Route-table parity: identical (method, path) set and order before/after; zero endpoint behavior change (full web test files green throughout).
4. `ruff check src/web/api/` completely clean; CI lint baseline re-anchored.
5. Full suite green; soak on /opt/odin healthy with a web-focused battery PASS.

## 6.1 Results (carve complete, 2026-07-06)

- `src/web/api/__init__.py`: **4,155 → 217 lines** of pure composition (imports, the ordered registrar call list, `setup_api`, the R1 re-export surface).
- **13 domain modules + `api_common`** (`llm_admin` 589, `config_admin` 586, `security`/`sessions_chat` 522, `observability` 405, `integrations` 383, `knowledge_mem` 357, `codex_admin`, `agents_loops`, `self_update`, `schedules_api`, `skills_api`, plus `api_common` 189) — none over the ~600 gate; two size splits enforced it (codex OAuth, self-update).
- Route parity: **183 routes, exact registration order**, held through every wave; **48 registrars**, each called exactly once from the root (composition assertions executable in the carve tooling after the wave-1 aggregates incident).
- The R1 pins earned their keep operationally: they guarded the file→package swap, and the `process_web_chat` patch seam caught its own severance in wave 3 (fixed via call-time resolution through the package attribute).
- **P6 was paid per-wave**: `ruff check src/web/api/ src/web/api_common.py` = **zero findings**; the file rename made all pre-existing api.py debt visible to the gate in wave 1, and each wave left its modules clean. The CI lint baseline needs no re-anchor — the gate's merge-base comparison self-adjusts.
- CI (P0) gated every phase PR; suite 6,079 throughout.

## 7. Deferred (named, not forgotten)

Windows CI matrix; pyright/Protocol typing for the Deps surfaces; coverage measurement; the small quality batch (exit-nonzero on fatal startup, fetch_url SPA message, old-skill-format docs note, atcharpentier Codex 401).

## 8. Revision log

- R2 (2026-07-06): P6 absorbed into the waves — the package rename surfaced all pre-existing api.py findings to the gate in wave 1, so each wave's PR left its modules lint-clean; the package finished at zero findings with no separate burn-down phase. Two size-gate splits added (`codex_admin.py`, `self_update.py`). `agent trajectories` landed in `sessions_chat` (its true domain) rather than a config bucket; `degradation` in `observability`.
- R1 (2026-07-05, from Odin's review): package `__init__` preserves the FULL live import surface (`setup_api`, `_is_sensitive_key`, `_redact_config`, `_safe_int_param`, `process_web_chat` patch seam), pinned by a P1 import-compatibility test before the swap; P0 checkout uses `fetch-depth: 0` for merge-base availability; lint burn-down estimate corrected to the measured 59 findings.
- R0 (2026-07-05): initial draft for Odin review.
