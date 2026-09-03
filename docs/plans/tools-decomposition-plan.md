# RFC-004: Tools Layer Decomposition (registry.py + executor.py)

Status: R1 — APPROVED (Odin re-review LGTM, no remaining blockers; live inventory independently verified against master @ 7263c03).
Campaign branch: `refactor/tools-decomposition` (created after plan approval).
Predecessors: RFC-001 (client.py), RFC-002 (facade retirement, native_tools domains), RFC-003 (api.py + CI gate). This is the first campaign gated by CI from its first PR.

## 1. Motivation

`src/tools/registry.py` (1,978 lines) and `src/tools/executor.py` (1,893 lines) are now the two largest files in the codebase and form one system split across two monoliths. Every tool call from every pipeline funnels through `ToolExecutor.execute()`; the three most recent production bugs found in soak (spawn_loop_agents AttributeError, background-task failure visibility, RBAC wiring) lived in or around this layer. Adding a tool today means coordinated edits to a 1,978-line literal list and a 1,893-line class.

## 2. Inventory (verified against master @ 7263c03)

- **73 tools** in the `TOOLS` list (exact ordered names captured in the P0 contract). **Order is behavior**: `get_tool_definitions()` feeds the tool catalog → prompt assembly; reordering changes prompts.
- **Two-tier dispatch** (`tool_loop.py:871`): `native_tools.handles(name)` → native table in `src/discord/native_tools/registry.py` (36 registered natives + 10 skill tools special-cased + user skills by name), else → `ToolExecutor.execute()`.
- **28 executor-routed tools**, dispatched via `getattr(self, f"_handle_{tool_name}")` — string reflection, the pattern RFC-002 banned on the Discord side.
- `execute()` is a **middleware pipeline** around the handlers: contextvars → RBAC `check_permission` → risk classification → timeout → `_try_tool` → recovery (hint/skip/retry, `UNSAFE_TO_RETRY`) → mutation annotation → result validation → `ToolResult` assembly. This pipeline is NOT moving.
- **Narrow external surface**: `tools/__init__.py` re-exports `TOOLS`/`get_tool_definitions`; `skill_manager.py` reads `TOOLS` (read-only, `BUILTIN_TOOL_NAMES`); `web/api/observability.py` reads `get_tool_definitions`; `wiring.py` constructs `ToolExecutor` once. `invalidate_tool_defs_cache()` called by skill CRUD.
- **Native side residue**: skill CRUD dispatch is inline `if/elif` inside `native_tools/registry.py` (lines ~155–230) — a hidden domain living in the dispatch-table file.

## 3. Deliverables

1. `registry.py` → `src/tools/defs/` package: section modules each owning a **contiguous slice** of the original TOOLS order (same model as api.py's section carve — sections are positional, not semantic, so concatenation reproduces exact order). `registry.py` becomes a composition root (< 250 lines): concatenates section lists, builds `TOOL_MAP`, keeps `get_tool_definitions()` + cache + invalidation with identical semantics.
2. `executor.py` → middleware core + `src/tools/handlers/` domain modules. Core keeps: `execute()` pipeline, `_try_tool`, recovery, metrics, RBAC/governor/host-access wiring, SSH plumbing (`_exec_command`, `_run_on_host`, `_govern_command`, `_resolve_host`), contextvars, bulkheads. Handlers move to domain owners reached through an **explicit dispatch table of the native_tools shape** — `name → (owner_key, attr)` — with the handler **resolved via `getattr(owner, attr)` at CALL time, never pre-bound at `__init__`** (R1 blocker #1: pre-binding captures originals and breaks the `executor._handle_x = fake` patch seam — the RFC-003 `process_web_chat` failure mode). During migration waves an assertion verifies `getattr(self, f"_handle_{name}")` resolves to the same function the table resolves. The f-string `getattr` dispatch is retired and contract-banned only in the final phase.
3. Handler domains (verbatim moves; ~27 handlers + their private helpers):
   - `system.py`: run_command, run_script, run_command_multi, manage_process
   - `files_docs.py`: read_file, apply_patch, analyze_pdf
   - `browser_web.py`: browser_read_page/read_table/click/fill/evaluate, web_search, fetch_url, http_probe
   - `state.py`: memory_manage, manage_list (+ their persistence helpers)
   - `devops.py`: git_ops, kubectl, docker_ops, terraform_ops
   - `comms.py`: email_send/search/read/list_recent, issue_tracker
   - `validation.py`: validate_action
   Shared access via a frozen `HandlerDeps` — the ToolLoopDeps pattern; no `__init__(self, executor)` back-references. **R1 blocker #3 — explicit stateful inventory, identity-preserved:** exactly ONE `HandlerDeps` instance per executor, carrying the existing singletons by reference: `_memory_path` + `_memory_lock`, `_lists_lock`, browser manager, email config accessor, output streamer, `command_governor`, `host_access_manager`, `freshness_stats`/`risk_stats`/`recovery_stats`/`validation_stats`, current-tool-timeout accessor, user/tier contextvar accessors, `_resolve_host`/`_resolve_default_host`/`_run_on_host`/`_exec_command`/`_govern_command` as callables, ssh pool, bulkheads. Domain modules MUST NOT instantiate their own locks or stats objects — a P0 identity contract asserts the shared objects are the same `id()` before and after each wave (separate instances pass happy-path tests but ship deadlocks, races, and observability lies).
4. Native residue cleanup: skill CRUD if/elif → `native_tools/skills_tools.py` domain module registered like the other five (scope-fenced: mechanical move of existing blocks, no behavior change).
5. `src/tools/` package at **zero ruff findings** (absorbed per-wave, P6-style).

## 4. Contracts (P0, before any carve)

- **Tool-parity contract** (`tests/characterization/test_tool_parity.py`): exact ordered 73-name list; per-tool schema deep-equality against a pinned snapshot; `TOOL_MAP` completeness; `get_tool_definitions()` output identity + cache invalidation behavior.
- **Registry mutability pins** (R1 advisory #3): `TOOLS` is module-level mutable and `TOOL_MAP` builds ONCE from it; `invalidate_tool_defs_cache()` clears the defs cache but does NOT rebuild `TOOL_MAP`. Pin these semantics exactly as they are — no accidental "improvement" during the carve.
- **Dispatch-parity contract**: the executor-routed set (73 − native − skills = 27) each resolves to a handler; `handles()`/executor split pinned exactly; unknown-tool → `ok=False, error="unknown_tool"` preserved AND pinned to bypass RBAC/risk/timeout (handler-lookup failure returns before the middleware runs, as today); explicit table == legacy getattr resolution for every name.
- **Patch-seam contract** (R1 blocker #2): a P0 test monkeypatches `executor._handle_run_command = fake` and asserts `execute("run_command", ...)` calls the fake — proving execution-time resolution. This test is re-pointed at the new owner attribute as each handler migrates and must pass in every phase; the invariant "handler resolved at execution time, not construction" holds campaign-wide.
- **Native skill-dispatch pins** (R1 blocker #4, before the extraction phase): `handles()` truth table (registered natives, `SKILL_CRUD_TOOLS`, `list_skills`/`export_skill`/`skill_status`/`invoke_skill`, dynamic user-skill names); skill CRUD sets `effects.rebuild_system_prompt=True` and invalidates the tool catalog + skills-text cache; `invoke_skill` with missing required input fails loudly; file-delivery modes pinned (chat sends, loop stages, `export_skill` always stages).
- **Middleware pins**: existing test_executor/test_tool_rbac/test_tool_timeouts suites stay green untouched (they are the middleware's characterization); add pins for the P0-audit gaps: tuple `(output, exit_code)` returns, `_ERROR_RESULT_PREFIXES` classification, recovery retry-once semantics, **contextvar isolation across concurrent `execute()` calls, permission-denial metrics increment, timeout path preserving `ToolResult.error`** (R1 advisory #6).
- **HandlerDeps identity contract** (R1 blocker #3): shared singletons (locks, stats, browser manager) are identity-equal (`is`) through the deps object before and after every wave.

## 5. Phases (each = one PR, Odin-reviewed, CI-gated; resequenced per R1 advisories #1–2)

- **P0**: contracts + this plan committed. No production-code changes.
- **P1**: registry carve (defs/ sections + composition root). Parity green.
- **P2**: executor dispatch table introduced over UNMOVED handlers — `name → (owner_key, attr)` entries all pointing at the core owner, resolved by `getattr` at call time; f-string fallback retained + logged-if-hit; table-vs-getattr identity assertion. Behavior-identical wave.
- **P3**: native skill-CRUD extraction to `native_tools/skills_tools.py` (moved earlier: independent of executor waves, and late skill regressions would churn — pinned by the P0 skill-dispatch contracts).
- **P4**: handler wave 1 — `system.py` + `files_docs.py` (SSH plumbing seam proven first).
- **P5**: handler wave 2 — `browser_web.py` + `devops.py` (coding.py retired with claude_code).
- **P6**: handler wave 3 — `state.py` (memory/list locks reviewed in isolation) + `comms.py` + `validation.py`; core slim-down.
- **P7**: retire the f-string fallback; contract bans `_handle_`-string spellings outside the core — **the ban scan is AST/token-aware, not raw grep** (re-review advisory: must not flag fixture names, comments, or the intentional compat assertion in its removal phase); production startup assertions (R1 advisory #5: `len(TOOLS)==73`, no duplicate names, table keys == expected executor-routed set); final metrics; docs; soak deploy + two-battery protocol — round-2 MUST include the negative-path battery: unknown tool, RBAC-denied, host-access-denied run_command, tiny-timeout, nonzero exit, run_command_multi mixed success/failure, memory round-trip, skill CRUD+invoke, http_probe redirect safety, validate_action (R1 advisory #10). Sign-off report.

## 6. Size targets & quality gates

registry.py < 250 · executor.py **target < 700, hard ceiling 800** — coherence beats line-count theater (R1 advisory #9); middleware and shared plumbing stay core, tool-specific logic moves · each defs/ section < 400 · each handlers/ domain < 450 · native registry.py sheds the ~80-line skill blob. **Lint scope** (R1 blocker #5): `src/tools/` package to ZERO ruff findings; the two files P3 touches outside it (`native_tools/registry.py`, new `skills_tools.py`) also to zero; everything else rides the CI lint-no-new gate. Deliberate non-goals: no semantic regrouping of TOOLS order (sections are positional slices, never hand-curated domains — R1 advisory #4); no changes to middleware behavior, recovery policy, or the native/executor split; no tool additions/removals/renames; `analyze_pdf`'s helpers stay local to `files_docs.py` (advisory #7); browser/static-web stay one module unless size forces a split (advisory #8).

## 7. Risks & mitigations

- **Order sensitivity** → contiguous-slice sections + exact-order contract (the 183-route lesson).
- **getattr dispatch is load-bearing and invisible to grep** → explicit table built and verified against getattr resolution before any handler moves (P2 gate), fallback retired only in P7.
- **Handler tuple/str return duality** → middleware pins in P0; handlers move verbatim.
- **Hidden helper coupling** (memory/list persistence, email cfg, SSH internals) → helpers move WITH their sole consumers; shared plumbing stays in core; import-cycle check per wave.
- **Skill seam** (`skill_manager` ↔ registry cache) → `BUILTIN_TOOL_NAMES` and `invalidate_tool_defs_cache` semantics pinned in P0.
- **Registrar-swallow class** (RFC-003 wave-1 near-miss) → executable composition assertions: every section list consumed exactly once, concatenation length == 73, every table entry bound exactly once.
- **Patch-seam capture** (R1) → call-time getattr resolution + the P0 patch-seam contract re-pointed each wave.
- **Deps identity drift** (R1) → HandlerDeps identity contract; domains banned from constructing locks/stats.
- **Native skill side effects** (R1) → P0 pins on effects/cache-invalidation/file-delivery before P3 moves anything.
- **Registry mutability surprise** (R1) → TOOLS/TOOL_MAP/cache semantics pinned as-is.

## 8. Rollback

Every phase is one revertable merge commit on the campaign branch; campaign→master is a single merge commit (`git revert -m1` path). Live install rides the campaign branch only during soak, master otherwise.

## R2 — results (code-complete, 2026-07-06)

**Registry**: `registry.py` 1,978 → **84 lines** (composition root + TOOL_MAP + defs cache + startup dup-assertion); 9 positional section modules in `src/tools/defs/` (129–326 lines each). Exact 73-tool order after the editor cleanup — every one of the 135 inherited long-line rewraps proven value-identical by the schema-hash contract.

**Executor**: `executor.py` 1,893 → **~730 lines** — the middleware core (execute pipeline, `_try_tool`, recovery, RBAC/risk, SSH plumbing, contextvars, memory persistence primitives) plus the dispatch table. ALL 27 handlers live in 7 domain modules in `src/tools/handlers/` (system, files_docs, browser_web, devops, state, comms, validation — each < 320 lines) behind the late-resolving `HandlerDeps` seam; domain owners are public attributes. The f-string dispatch is retired: the table is the only class-level path, the executor-instance `__dict__` override remains the sanctioned patch seam, and the characterization contract's AST scan permits exactly ONE dynamic `_handle_` spelling in src/ (the resolver's probe).

**Native residue**: skill CRUD/meta/invoke dispatch extracted to `native_tools/skills_tools.py` (registry.py 324 → 193).

**Quality**: `src/tools/` package + touched native files at **ZERO ruff findings** (~230 pre-existing findings resolved campaign-wide, incl. 7 verified StrEnum conversions); suite 6,079 → **6,12x green** throughout (+40 P0 contracts and wave additions); every phase PR CI-gated, new=0 at every step.

**Declared deviations from R1**: (1) the production startup assertion pins INVARIANTS (no duplicate tool names; every table entry resolves on its owner at construction) rather than the literal `len(TOOLS)==73` — a hardcoded count in prod would fail the next legitimate tool addition in the wrong place; the 73-count/order pin lives in the characterization contract where changing it is a reviewed edit. (2) The historical executor-instance patch seam was RETAINED via `__dict__`-override precedence instead of re-pointing the 13+ existing patch sites — strictly better than the planned re-pointing (zero churn on patchers, both seams live).

## R1 amendment log (Odin plan review, 2026-07-05)

Blockers, all fixed: **B1** dispatch table is late-bound `name → (owner_key, attr)` resolved at call time, never pre-bound (§3.2); **B2** patch-seam contract added to P0, re-pointed per wave (§4); **B3** HandlerDeps stateful inventory enumerated with identity contract (§3.3, §4); **B4** native skill-dispatch pins added to P0, gating the extraction (§4); **B5** lint scope stated precisely (§6). Advisories, all adopted: **A1** skill extraction resequenced to P3, ahead of handler waves; **A2** `state.py` split out of wave 1 into P6 for isolated lock review; **A3** TOOLS/TOOL_MAP mutability semantics pinned as-is; **A4** positional-slice discipline reaffirmed; **A5** production startup assertions in P7; **A6** middleware pins expanded (contextvars, denial metrics, timeout error, unknown-tool bypass); **A7** analyze_pdf helpers stay local; **A8** browser/static-web stay merged; **A9** executor core soft 700 / hard 800, no line-count theater; **A10** negative-path soak battery specified in P7. Path correction applied (`src/discord/native_tools/registry.py`). Re-review verdict: **LGTM, no remaining blockers**; final advisory adopted — P7 spelling-ban scan is AST/token-aware rather than raw grep.
