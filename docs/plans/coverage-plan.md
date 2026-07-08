# RFC-006: Test-Coverage Campaign (ratchet gate + prioritized waves)

Status: R3 — CONT-1/CONT-2/P5/P6 COMPLETE (campaign shipped through P4b §6b; continuation CONT-1 §6c, CONT-2 §6d, P5 native tools §6e, P6 handlers+parsers §6f). Plan of record was Odin-approved R1 (§6a). Post-campaign coverage sweeps continue opportunistically on the lowest-coverage tractable modules while the ratchet holds every gain.
Campaign branch: `coverage/rfc006` (created after plan approval).
Predecessors: RFC-005 (type-safety ratchet) is the template — a fail-closed CI ratchet plus incremental waves, security/high-value first. Unlike RFC-005, coverage waves add TESTS, not annotations: they can and will surface real bugs. Bug **fixes** are out-of-band (§5).

## 1. Motivation

Measured 2026-07-06 (master @ `16ec441`): **67% line coverage** — 27,283 statements, 9,057 unexercised. The gaps are not uniform, and their shape is the whole argument:

- **Security code is under-tested**: `permissions/token_manager.py` 23%, `permissions/host_access.py` 39%, `web/api/security.py` 17%. Authorization logic is exactly where an untested branch is most expensive.
- **`web/` handler bodies run only in production**: the route-parity contract pins that 183 endpoints exist in order, but many handler bodies (llm_admin 20%, codex_admin 10%, config_admin 23%, agents_loops 21%, skills_api 21%) have never been driven by a test. The five TS bugs (v3.52.0) all lived in exactly this kind of never-walked path.
- **A few large single-file wins**: `tools/skill_manager.py` 28% (511 missed), `tools/handlers/state.py` 21% (239 missed).
- **Legitimately-hard-to-test surfaces stay low by design**: Discord cogs/views (prefix-command UI), `voice.py` (hardware), `browser.py`/`comfyui.py` (optional-extra external services), `packaging/validate.py` (CI-context). These are explicitly OUT of the target denominator (§3).

The pattern: code that has been through a campaign or soak-fix carries its tests (notifications 96%, config 90%, audit 88%, agents 87%); pre-discipline code does not. This campaign closes that gap where it matters and installs a ratchet so it can never silently reopen.

## 2. Targets (proposed — Odin/Aaron to calibrate)

Coverage % as a single number is a blunt instrument, so targets are stated per-scope:

- **Security modules to ≥90%** (`permissions/*` AND `web/api/security.py` — B2: the crown-jewel bucket is consistent; "if auth code is annoying to test, good, that is the point").
- **LLM credential paths to ≥85%** (`codex_auth.py`, `openai_codex.py`) — security-adjacent and historically dangerous.
- **Core-layer to ≥85%** (everything except the §3 exclusions); new gated files must land ≥85 unless explicitly classified otherwise.
- **Overall repo — REPORT ONLY, never gated**: expected to rise from 67% into the high-70s/low-80s as the waves land; the ratchet, not a magic number, is the durable deliverable. Explicitly NOT 95% globally — "that road ends in tests that assert mocks did what mocks were told to do."

Explicitly NOT chasing 95%: the last 10% is cosmetic-UI and hardware paths whose tests cost more than they protect. "As far as we can" = as far as it stays valuable.

## 3. Coverage denominator (what "core" means)

The ratchet and the core target EXCLUDE these hard-to-unit-test surfaces (measured separately, never gated to zero-drop because their coverage is legitimately low):
`src/discord/cogs/**`, `src/discord/views/**`, `src/discord/voice.py`, `src/tools/browser.py`, `src/tools/comfyui.py`, `src/packaging/validate.py`, `src/discord/helpers/error_handler.py`, `src/web/middleware.py`, `src/**/__main__.py`. Rationale per file recorded in the gate config. Excluding them is honest scoping, not hiding — they're reported, just not gated.

## 4. The ratchet (P0 deliverable)

`scripts/ci/coverage_gate.py`, modeled on `type_gate.py`. **Gate shape per R1 B1 (Odin's amendment — adopted verbatim):**
- **Primary ratchet: per-file MISSED-line-count CEILING** — for every gated file in the committed baseline: `missing <= baseline_missing` (epsilon 0). Punishes adding untested code; does not punish deleting dead uncovered code; can't be masked by newly covered lines elsewhere in the same file.
- **Secondary guard: per-file percent non-regression** — `percent >= baseline_percent - 0.25` (noise epsilon only).
- **New gated files** must meet the configured threshold (≥85 core / ≥90 security bucket) or be explicitly exempted in config with a reason.
- **Deleted/renamed/split files are SURFACED, never silently passed** — the gate lists baseline entries with no matching file and fails until the baseline is deliberately updated.
- **Baseline updates are ceremony**: a distinct `--update-baseline` mode producing a reviewed artifact; the update PR shows a before/after table (improved / unchanged / decreased-with-justification). The baseline never quietly decreases.
- **Total percent: reported, never gated.**
- Baseline record per file: `{path, statements, covered, missing, percent}` in `coverage-baseline.json`.
- New `coverage-no-drop` CI job beside `types-no-new`/`lint-no-new`.
- **P0 includes gate SELF-TESTS (R1 B3)** — the gate must not be the first untested security-critical thing: missing coverage.json fails closed; coverage-run failure fails closed; exclusion patterns match exactly as configured; new gated file below threshold fails; increased missing count fails; unchanged missing count passes regardless of total movement; baseline cannot be updated downward outside the deliberate mode; renamed/deleted files are surfaced.

## 5. Bug protocol (Aaron's gate — same as RFC-005 §5)

Writing tests against never-walked code WILL surface real bugs (this is a feature). Any test that reveals incorrect behavior is NOT quietly worked around: the bug is ledgered (`docs/plans/coverage-findings.md`, stable `COV-NNNN` ids), the test is written to pin the CORRECT behavior and marked `pytest.mark.xfail(strict=True, reason="COV-NNNN ...")` until fixed (STRICT always — "non-strict xfail is where bugs go to retire with benefits"); coverage contributed by xfailed tests is acceptable and ledgered, and the batch goes to Aaron. His verdict fix/defer/won't-fix; approved fixes ride as their own reviewed PRs, never inside a coverage wave. Tests must exercise REAL behavior — never assert trivial truths to pump the number (Aaron's build-loop rule: no asserting file contents/existence; drive actual code paths).

## 6. Phases (each = one PR into the campaign branch, Odin-reviewed, CI-gated)

Resequenced per R1 (LLM credential paths promoted — security-adjacent and historically dangerous; web admin split — "too broad as one PR… before it becomes one giant 'trust me bro' coverage blob"):

- **P0** — `coverage_gate.py` + gate SELF-TESTS + committed baseline + `coverage-no-drop` CI job + findings ledger + this plan.
- **P1 — Security** (`permissions/token_manager.py` 23→90, `host_access.py` 39→90, `manager.py` 81→95, `web/api/security.py` 17→**90**). Fixed as first.
- **P2 — LLM auth/provider credential paths** (`codex_auth.py` 54→85, `openai_codex.py` 61→85 — rotation/failover, mocked transport).
- **P3 — High-value core singles** (`tools/skill_manager.py` 28→75, `tools/handlers/state.py` 21→85).
- **P4a — Web admin API, admin half** (`config_admin`, `llm_admin`, `codex_admin`) — through the aiohttp test client, real route layer, faked boundaries.
- **P4b — Web admin API, rest** (`skills_api`, `knowledge_mem`, `agents_loops`, `observability`, `websocket`, `integrations`).
- **P5 — Discord native tools / task surfaces** (`native_tools/agents_tasks.py`, media.py, knowledge.py, channel_ops.py; `background_task.py`, `scheduled_events.py`, `llm_gateway.py`).
- **R2** — results appended here; final numbers, ledger disposition, whether a stricter target is worth a follow-up.

No wall-clock pressure; the gate protects from P0 on.

## 6a. R1 amendment log (Odin plan review, 2026-07-07)

Required amendments, all adopted: **B1** ratchet redesigned to per-file missed-count ceiling (ε=0) + per-file percent non-regression (ε=0.25) + total report-only; deleted/renamed surfaced; baseline ceremony (§4). **B2** `web/api/security.py` target raised to ≥90, consistently in the crown-jewel bucket (§2/§6). **B3** P0 gate self-tests specified (§4). Advisories adopted: strict xfail w/ COV-id reasons; xfail coverage ledgered; baseline-update before/after table; per-exclusion reasons enforced in config; web handlers driven through the real route layer via aiohttp test client; mock boundaries only, never the unit under test.

## 6b. R2 — results (2026-07-07)

**Total line coverage 67.0% → 72.9%** (whole repo, reported); the gated core (§3 exclusions removed) sits at ~76%. Suite 6,133 → 6,516 (+383 tests). mypy stayed 0 and ruff clean through every wave. **The fourth CI ratchet (`coverage-no-drop`) is live and merged** — the durable deliverable: coverage can no longer silently regress on any future PR.

**Per-file lifts (start → end):**

| File | Wave | Start → End |
|---|---|---|
| `permissions/token_manager.py` | P1 | 23% → **100%** |
| `permissions/host_access.py` | P1 | 39% → **100%** |
| `permissions/manager.py` | P1 | 81% → **100%** |
| `web/api/security.py` | P1 | 17% → **95%** |
| `llm/codex_auth.py` | P2 | 54% → **93%** |
| `llm/openai_codex.py` | P2 | 61% → **85%** |
| `tools/handlers/state.py` | P3 | 21% → **93%** |
| `tools/skill_manager.py` | P3 | 28% → **78%** |
| `web/api/codex_admin.py` | P4a | 10% → **84%** |
| `web/api/config_admin.py` | P4a | 23% → 41% (partial) |
| `web/api/llm_admin.py` | P4a | 20% → 26% (partial) |
| `web/api/skills_api.py` | P4b | 21% → **59%** |
| `web/api/observability.py` | P4b | 58% → **64%** |

**Waves shipped:** P0 gate+self-tests+baseline (PR #188), P1 security (#189), P2 credential paths (#190), P3 core singles (#191), P4a web-admin (#192), P4b web-REST partial (#193) — every one Odin-reviewed and CI-gated. Odin's plan review caught the gate's identity hole (missed-count ceiling, not covered-count floor) and hardened P0 with 8 self-tests.

**COV ledger: EMPTY.** Tests were written against never-walked authorization, credential-rotation, memory, skill, and admin-route code — every path behaved exactly as the tests pinned correct behavior. The gate's first act was catching its *own* nondeterminism (config `.env` branch + `store.py` exception-branch flake), both fixed deterministically, not by loosening the ratchet. Two genuine hygiene finds (relative-`Path("config.yml")` test hazard; a duplicate-named shadowed test) were fixed as they surfaced.

**Deliberately deferred (a P4-continuation campaign, whenever there's appetite):** `web/api/config_admin.py` and `llm_admin.py` to ≥85 (CONT-2, done — §6d), plus `knowledge_mem`/`agents_loops`/`integrations`/`websocket` (CONT-1, done — §6c), and P5 (discord native tools). These are large multi-registrar route surfaces; Odin endorsed partial-per-file, and the ratchet holds every gain as the permanent floor while they wait.

## 6c. R3 — P4-continuation CONT-1 (2026-07-07)

Picks up the §6b deferred web-route surfaces. Four files, one PR, Odin-reviewed, coverage-gated.

**Total line coverage 72.9% → 74.7%** (whole repo, reported). Suite 6,516 → 6,606 (+90 tests). mypy stayed 0, ruff clean.

| File | Start → End |
|---|---|
| `web/api/integrations.py` | 45% → **100%** |
| `web/api/knowledge_mem.py` | 47% → **99%** |
| `web/api/agents_loops.py` | 21% → **99%** |
| `web/websocket.py` | 46% → **88%** |

**Method (per Odin's wave advisory — real interfaces, faked boundaries):** `knowledge_mem` drives a real `KnowledgeStore` (temp sqlite, FTS-only via `embedder=None`) and a real `ConversationReflector` (temp learned.json) with real round-tripping memory persistence — only embeddings faked. `integrations` fakes every remote service (MCP / Slack / issue-tracker / Grafana / webhooks): request parsing, validation, delegation — never the network. `agents_loops` uses real route dispatch with faked loop/agent/process runtime boundaries (no real loops started). `websocket` uses aiohttp's real ws test client for the `handle` message loop and `_handle_chat`; broadcast/close/tail helpers driven directly with hashable fake sockets; autouse `chdir(tmp_path)` isolates the relative `./data/audit.jsonl` tail read.

**Uncovered by design:** the two `_iteration_cb` runtime closures in `agents_loops` (would require starting real loops — Odin: "don't worship the green bar"); `websocket`'s 1 s-poll log-tail loop (timing-heavy) plus a few deep auth/CLOSE branches; two dead-defensive `except` / `_safe_int_param` fallback lines in `knowledge_mem`.

**COV ledger: EMPTY.** Every failing test during authoring was a *test-setup* error the production code corrected me on — dedup-skipped identical ingest, non-numeric `channel_id` → `int()` raise, `_validate_string` being length-only, `_safe_int_param` gracefully falling back (not 400), `SimpleNamespace` unhashable inside a socket set. No real bugs surfaced; no `xfail`s written.

**Scope discipline:** the ratchet was reverted for three files my tests *incidentally* lifted (`knowledge/store.py`, `learning/reflector.py`, `web/api_common.py`) — kept at their looser ceilings so this PR's baseline diff is exactly its four target files, and to avoid locking a tighter number on `store.py` (past coverage nondeterminism). Those gains are real and claimable by a later targeted ratchet.

## 6d. R3 — P4-continuation CONT-2 (2026-07-07)

The two large web-admin registrar surfaces from §6b, finished. One PR, Odin-reviewed, coverage-gated.

| File | Start → End |
|---|---|
| `web/api/config_admin.py` | 41% → **100%** |
| `web/api/llm_admin.py` | 26% → **99%** |

Suite **+90 tests**; mypy 0, ruff clean.

**Method:** real pydantic `Config` + faked components through the real aiohttp route layer. Two dangerous boundaries were stubbed by construction, not avoided: the setup wizard's success path schedules a SIGTERM to its own PID — `os.kill` is patched to a no-op so it can never reach the test runner; personality's global preset-registry mutation (`register_user_presets`) is patched so tests don't leak into each other. LLM-admin fakes aiohttp sessions and provider reloads (no network); `_persist_config`'s sync inner is stubbed so no test writes `config.yml`, while the SSRF `_validate_ollama_url`, `_parse_int`, `_safe_secret`, and the ruamel round-trip `_persist_llm_sections_sync` are unit-tested directly (getaddrinfo patched — private / public / link-local / unresolvable all covered without DNS).

**Uncovered by design:** an unreachable `except Exception` after `ip_address()` in `_validate_ollama_url` (that call only raises `ValueError`) and a dead defensive non-http check in `probe-models` (guarded upstream by `_validate_ollama_url`) — 3 lines, both genuinely unreachable.

**COV ledger: EMPTY.** No real bugs; no `xfail`s.

**End state:** the six web-route surfaces the §6b campaign deferred are now 88–100% covered; the coverage-no-drop ratchet holds each as a permanent floor. Only P5 (discord native tools) remains deferred.

## 6e. R3 — P5 discord native tools (2026-07-07)

The last deferred surface: the five Discord-native tool domain handlers (`src/discord/native_tools/`). One PR, Odin-reviewed, coverage-gated.

| File | Start → End |
|---|---|
| `native_tools/channel_ops.py` | 15% → **100%** |
| `native_tools/knowledge.py` | 17% → **100%** |
| `native_tools/media.py` | 13% → **100%** |
| `native_tools/scheduling.py` | 46% → **100%** |
| `native_tools/agents_tasks.py` | 34% → **95%** |

Suite **+103 tests**; mypy 0, ruff clean.

**Method:** each domain `*Tools` class is constructed directly with faked deps and its `_handle_*` methods driven with crafted inputs; the handlers return plain strings (or `analyze_image`'s `__image_block__` marker dict). Every external boundary is faked hard — `discord.Forbidden/NotFound/HTTPException` are real exceptions raised from mocks; no gateway, no network (aiohttp sessions + `getaddrinfo` faked), no SSH subprocess (`create_subprocess_exec` faked), no ComfyUI, no browser. For `agents_tasks`, the runtime is fully neutralized: `run_background_task` is patched, and the loop/agent/bridge managers are mocks — **no real task, loop, or agent ever executes.**

**Uncovered by design (`agents_tasks`, 17 lines = 95%):** exactly the inner `_iteration_cb` / `_tool_exec_cb` / `_codex_followup` / `_run` closures that only execute inside a live loop or spawned agent. Per Odin's standing advisory ("don't start real loops/agents just to worship the green bar"), these are left to the loop/agent integration paths, not driven synthetically.

**COV ledger: EMPTY.** No real bugs; no `xfail`s.

**Campaign end state:** whole-repo line coverage **67.0% → ~78%** across RFC-006 (P0–P5); the four CI ratchets (lint / types / coverage / suite) hold every gain. The web-API, web-admin, and native-tool surfaces are now 88–100% covered.

## 6f. R3 — P6 tool handlers + parsers (2026-07-07)

Post-P5 sweep of the next-lowest-coverage tractable modules. One PR, Odin-reviewed, coverage-gated.

| File | Start → End |
|---|---|
| `tools/time_parser.py` | 11% → **100%** |
| `tools/handlers/coding.py` | 6% → **100%** |
| `tools/handlers/files_docs.py` | 17% → **100%** |

Suite **+51 tests**; mypy 0, ruff clean.

**Method:** `time_parser` is pure logic driven with an injected fixed `now` (a Wednesday noon UTC) — fully deterministic, no wall clock. The two handler domains are built via `HandlerBase.__new__` with only the deps each method touches (the P3 state-handler pattern); every boundary faked — no SSH (`_exec_command`/`_run_on_host` AsyncMocks), no network (aiohttp faked), no PDF library (`fitz` is not installed here, so it's injected as a fake `sys.modules` entry), and the command governor is a mock.

**COV ledger: EMPTY.** No real bugs; no `xfail`s.

## 6g. R3 — P7 web routes + channel logger (2026-07-07)

Next sweep of low-coverage tractable modules. One PR, Odin-reviewed, coverage-gated.

| File | Start → End |
|---|---|
| `web/api/schedules_api.py` | 26% → **100%** |
| `discord/channel_logger.py` | 27% → **92%** |
| `web/api/self_update.py` | 14% → **90%** |

Suite **+34 tests**; mypy 0, ruff clean.

**Method:** `schedules_api` is safe schedule CRUD through the real route layer with a faked `bot.scheduler` (croniter real). `channel_logger` is pure JSONL file I/O driven against a real tmp dir with faked Discord message objects and a small fake FTS index.

**SAFETY — self_update:** `apply_update` runs real `git reset --hard` / `checkout master` and `os.kill(getpid(), SIGTERM)`. Every test stubs **all** exec primitives — `subprocess.run`, `os.kill`, `os.path.exists`, `os.walk` — so the destructive actions are impossible by construction (per the never-run-a-destructive-command rule). It stops at **90%**: the residual lines are the config-backup/restore/pip/pycache steps inside that destructive flow, which would require fragile global `builtins.open` patching that risks the async test harness — deliberately left uncovered rather than covered unsafely. `channel_logger`'s residual 8% is defensive I/O `except` handlers requiring equally fragile failure injection.

**COV ledger: EMPTY.** No real bugs; no `xfail`s.

## 6h. R3 — P8 kimi provider + attachments (2026-07-07)

Continued sweep. One PR, Odin-reviewed, coverage-gated.

| File | Start → End |
|---|---|
| `llm/kimi.py` | 59% → **99%** |
| `discord/attachments.py` | 71% → **96%** |

Suite **+62 tests** (kimi new file; attachments extended); mypy 0, ruff clean.

**Method:** `kimi`'s message/schema/tool/response conversion is pure logic tested directly; the request/retry/chat/health paths use a fake aiohttp session with `asyncio.sleep` patched so retry backoff is instant (no network, no real delay). `attachments` extends the existing suite with the uncovered handler branches — image size/jpg-alias/read-failure, the PDF handler (`fitz` injected as a fake `sys.modules` entry — no PDF library), tar extraction + limits + path-escape blocks, `_preview_archive_files` caps, and cleanup edge cases — all against real tmp workspaces with faked attachment objects.

**Uncovered by design:** kimi's one line is an unreachable `raise` after a retry loop that always returns/raises inside it. attachments' residual 4% is an unreachable "unknown archive format" branch (the extension set only contains zip/tar variants) plus two deep `.resolve()`-based path-escape checks and a read-exception handler that need fragile filesystem-failure injection.

**COV ledger: EMPTY.** No real bugs; no `xfail`s.

## 6i. R3 — P9 skill context (2026-07-07)

The skill API surface — the biggest single-file lift of the campaign. One PR, Odin-reviewed, coverage-gated.

| File | Start → End |
|---|---|
| `tools/skill_context.py` | 42% → **100%** |

Suite **+25 tests**; mypy 0, ruff clean.

**Method:** `SkillContext` is the API handed to user skills — thin delegations to the tool executor, channel callbacks, persistent memory, config, HTTP, knowledge base, and scheduler, all wrapped in resource-limit trackers. Built with a MagicMock executor + faked deps; memory is a real tmp file, HTTP uses a fake aiohttp session (no network), and `is_url_blocked` is patched for determinism (no DNS). Every delegation, limit guard, SSRF/path-denial check, and the module helpers (`is_path_denied`, `is_url_blocked`, `ResourceTracker`) are exercised.

**COV ledger: EMPTY.** No real bugs; no `xfail`s.

## 6j. R3 — P10 scheduled-event handlers (2026-07-07)

The scheduler's Discord callback handlers — likely the last of the clearly-tractable modules. One PR, Odin-reviewed, coverage-gated.

| File | Start → End |
|---|---|
| `discord/scheduled_events.py` | 61% → **100%** |

Suite **+40 tests**; mypy 0, ruff clean.

**Method:** `ScheduledEventHandlers` fire on scheduler events — daily digest, monitor alert, reminder, check, and multi-step workflow. Built with faked deps (executor, tool_loop, audit, llm_gateway, agent_task_tools, channels) so nothing is really dispatched; tests assert on channel sends, audit calls, ToolResult shaping, condition-skip logic, spawn-agent auto-collect, and the abort/continue-on-failure branches — including the check/workflow paths that re-raise to signal the scheduler.

**COV ledger: EMPTY.** No real bugs; no `xfail`s.

## 6k. Diminishing-returns boundary (2026-07-07)

With P10 the clearly-tractable modules are covered. The remaining low-coverage gated files all wrap infrastructure that can't be faked without either heavy harnesses or real side effects: `health/server.py` (large aiohttp server + middleware), `monitoring/watcher.py` (live metric-poll loops), `search/vectorstore.py` (sqlite-vec extension), `discord/llm_gateway.py` + `discord/wiring.py` (provider lifecycle / composition root), `discord/client.py` (the gateway lifecycle), `discord/intake_pipeline.py` and `tools/background_task.py` (real message/loop execution). These are the "returns get very difficult" tier — meaningful coverage there needs integration-style harnesses, not the boundary-faking pattern that carried P0–P10, and several would risk real side effects to exercise. The coverage-no-drop ratchet holds every gain (whole-repo **67.0% → ~82%**) as a permanent floor; further waves here are a deliberate future decision, not low-hanging fruit.

## 6l. R3 — P11 safe tier-1, round 1 (2026-07-07)

First safe pass into the "harder" tier — the files whose dangerous paths are shallow enough to stub airtight (no real execution, network, or gateway). Aaron's directive for this round: do all the work solo, one final PR, Odin reviews only that PR. (The genuinely dangerous files — `background_task`, `discord/client`, `watcher` — are deferred to a future Incus-sandboxed round, since this desktop *hosts* live Odin and localhost is a destructible target.)

| File | Start → End |
|---|---|
| `discord/llm_gateway.py` | 37% → **99%** |
| `web/api/observability.py` | 64% → **96%** |
| `web/api/sessions_chat.py` | 69% → **94%** |

Suite **+46 tests**; mypy 0, ruff clean.

**Method / safety:** `llm_gateway` — the provider client classes (`CodexChatClient`/`OllamaClient`/`KimiClient`/`CodexAuthPool`) are patched so reloads build fakes (no real tokens, no network, no health-check hits a server), and the deferred-close `call_later` is stubbed so nothing schedules on a live loop. `observability` — all read-only stat routes with a faked bot; the file-reading aggregates (`context`/`failure`/affordances) are patched so no real trajectory/audit file is touched. `sessions_chat` — chat/execute go through the patched `process_web_chat` seam (never a real LLM call); session + trajectory routes use a faked store/saver. **Residual uncovered = the unreachable `except ValueError` branches around `_safe_int_param` (it swallows, never raises) and a couple of `.resolve()` path-escape / auth-configured-identity branches.**

**COV ledger: EMPTY.** No real bugs; no `xfail`s.

**Deferred (still safe, next round):** `learning/reflector`, `sessions/manager`, `scheduler` (validation/matching subset), `intake_pipeline` — intricate logic that deserves careful treatment, not a rushed tack-on.

## 6m. R3 — P12 safe tier-1, round 2 (2026-07-07)

Careful pass at the intricate-but-safe files, targeting the tractable methods without over-reaching into the mock-drift zone. One PR, Odin-reviewed.

| File | Start → End (approx) |
|---|---|
| `learning/reflector.py` | 78% → **~87%** |
| `scheduler/scheduler.py` | 86% → **~89%** |

**Method / safety:** `reflector` — `reflect_on_operation`/`session`/`compacted` and `_reflect` are driven through a FAKE `text_fn` (the LLM callback is injected via `set_text_fn` — no real model call); `_parse_entries` and the `get_prompt_section` injection selection (include-all vs gated pinning) are tested as pure logic against a real tmp `learned.json`. `scheduler` — only the pure validation/normalization/trigger-matching helpers (`_validate_timezone`/`_validate_trigger`/`_validate_webhook_config`/`_normalize_webhook_config`/`_trigger_matches`); **`_execute_webhook` (real outbound HTTP) and the fire loop are deliberately left to the future sandboxed round.**

**Deliberately NOT pushed further:** reflector's `_consolidate`/`_repair_damaged` and the scheduler fire loop / `_execute_and_record` — intricate enough that a heavily-mocked test would validate shape, not behavior. Left for careful future work.

**COV ledger: EMPTY.** No real bugs; no `xfail`s.

## 6n. R3 — P13 intake gating (2026-07-07)

The real-behaviour parts of the message-intake gating chain. One PR, Odin-reviewed.

| File | Start → End (approx) |
|---|---|
| `discord/intake_pipeline.py` | 70% → **~80%** |

**Method / safety:** covers `is_allowed_user`/`is_allowed_channel` (pure allowlist logic), `_process_attachments` (with a faked `AttachmentProcessor` — no download), and the early `handle` gates: own-message short-circuit and the full secret-scrub path (detect → scrub → delete → notify, including the NotFound / Forbidden / HTTPException / send-failure sub-branches). The downstream `pipeline`/`tool_loop` are faked — **no LLM, no tool dispatch, no gateway.**

**Deliberately NOT covered:** the deep `handle` body (cog dispatch, bot-buffer flush, voice) and `MessagePipeline.run`/`_run_inner` — they route into the tool loop, so honest coverage needs the sandboxed round, not more mocking.

**COV ledger: EMPTY.** No real bugs; no `xfail`s.

**Safe-tier status:** P11–P13 covered the tractable "harder" files (llm_gateway, observability, sessions_chat, reflector, scheduler-validation, intake-gating). What's left below the gate is either intricate mock-drift territory (`sessions/manager` compaction/archival, the deep intake/pipeline routing, reflector `_consolidate`/repair) or the genuinely-dangerous Incus-only tier. Whole-repo ≈ 83%, gated core ≈ 86%.

## 6o. R3 — P14 sessions manager (real-behaviour + pure helpers) (2026-07-07)

The session manager, driven against a **real** `SessionManager` (not a mocked one) with a tmp persist dir, plus the module-level pure helpers. One PR, Odin-reviewed.

| File | Start → End |
|---|---|
| `sessions/manager.py` | 85.21% → **91.72%** (missing 125 → 70) |

**Method / safety.** Two safe surfaces:

1. *Real SessionManager* — sessions populated via the real `add_message`; state ops (count/ids/exists/get/items_snapshot/reset/reset_many/clear_all), token/activity metrics, `remove_last_message`, the **compaction trigger** (`get_history_with_compaction`/`get_task_history` → `_compact`, LLM callback faked via the clean `set_compaction_fn` seam), in-memory `search_history` step 1 (summary / segment / message hits + `user_id`/`after`/`before`/`channel_id` filters + limit), and `scrub_secrets`. Real file storage in tmp; no network, no LLM.
2. *Pure module helpers* — `summarize_tool_response` (all branches: below-threshold, short-body, multi-paragraph with short-last-paragraph inclusion, >15-unique-tool cap, single-block, degenerate-whitespace fallback, budget-trim + mid-word cleanup — 28 dark lines), `compute_activity_rate` (window-drop and zero-span paths), `apply_token_budget` (summary-pair-dropped-last), and the pure `_render_context_summary` static method (recency render, query-based semantic segment selection with a trace object, empty-segment skip, bad-timestamp header fallback).

**Deliberately deferred (mock-drift / harness tier):** `search_history` steps 3–4 (hybrid vector store + channel-log backend orchestration — faking two search backends risks validating a wrong contract), the archival `_archive_session`/`_restore_from_archive`/`_search_archives` reflection+indexing edge branches (already covered in the bulk by the existing session suite; the remainders need real reflector/vector-store harnesses), and `_fallback_compact` edges. These are the honest boundary between safe real-behaviour tests and the sandboxed round.

**COV ledger: EMPTY.** No real bugs; no `xfail`s.

## 6p. R3 — P15 ollama transport + config validators + audit read paths (2026-07-07)

Three unrelated safe files in one PR, Odin-reviewed. Whole-repo 83.6% → **84.1%**.

| File | Start → End |
|---|---|
| `llm/ollama.py` | 63.3% → **97.2%** (missing 65 → 5) |
| `config/schema.py` | 89.6% → **99.8%** (missing 59 → 1) |
| `audit/logger.py` | 82.5% → **91.0%** (missing 52 → 27) |

**Method / safety.**
- *ollama* — the HTTP transport (`_request_with_retry` success / retryable-5xx-then-success / retry-exhausted / non-retryable-status / `ClientError`-then-success / `ClientError`-exhausted, with `asyncio.sleep` patched so retries don't wall-clock), `chat`/`chat_with_tools`, `health_check` (exact-model / base-name-prefix / non-200 / exception), `_headers`, and the real `_get_session`/`close` lifecycle. The only faked boundary is a queue-backed fake `aiohttp` session — **no real network.**
- *config/schema* — every out-of-range field validator's raise arm (parametrized), `_substitute_env_vars` (required / default / missing-raises), `load_config`'s success path plus all four `SystemExit` arms (env-missing, bad-YAML, non-mapping, validation-failure) against tmp files, and `WebConfig.resolve_api_identity` (listed-token + single-token fallback). Pure + tmp-file reads.
- *audit/logger* — real `AuditLogger` on a tmp jsonl: entries written via the logger's own `log_execution`/`log_web_action` (real `_persist`), then read back through `search`/`_match` (every filter: tool/user/host/keyword/date/status/has_error/min_duration/limit), `count_by_tool`, `get_log_stats`, `initialize_chain` (HMAC chain resumed by a second logger + `verify_integrity` green), and log rotation (tiny `max_bytes` → `.1` backup created). `_cap_tool_input` both arms. Real file I/O only.

**Deliberately deferred:** ollama's few remaining defensive lines; the audit search-by-risk / diff-search / verify-integrity-failure edges (partly covered by the existing `test_audit_signing`/`test_audit_persist_concurrency` suites) — remaining 27 are lower-yield branch tails.

**COV ledger: EMPTY.** No real bugs; no `xfail`s.

## 6q. R3 — P16 email client + health checker (2026-07-07)

Two safe files in one PR, Odin-reviewed. Whole-repo 84.1% → **84.4%**.

| File | Start → End |
|---|---|
| `tools/email_client.py` | 77.5% → **90.9%** (missing 52 → 21) |
| `health/checker.py` | 84.3% → **100.0%** (missing 42 → 0) |

**Method / safety.**
- *email_client* — pure MIME parsing (`_extract_body`: multipart-plain / multipart-html-only / no-text-body / single-part / empty / truncation; `_decode_header_value`: empty + encoded-bytes) plus SMTP send and IMAP search/read/list with `smtplib.SMTP` / `imaplib.IMAP4_SSL` **faked** (a queue-backed fake conn / context-manager server): happy paths, the Gmail `X-GM-RAW` branch, non-OK / UID-not-found / connect-failure error arms, password redaction, and attachment-outside-allowed-dir / not-a-file guards. **No real SMTP/IMAP, no network** — only constructed in-memory messages.
- *health/checker* — the provider-configured paths of `check_ollama`/`check_kimi` (all three circuit-breaker states + the error arm) driven with real *un-connected* `OllamaClient`/`KimiClient` objects (breaker-state inspection + `pool_stats` only, no request), `check_codex`'s lazy-`None`-session branch, the exception arms of `check_browser`/`check_loops`/`check_agents` (probe raises → "down"), and `check_all`'s crashed-checker handling (a patched raising checker → recorded as down, overall unhealthy). Fake `bot` namespaces; no network, no LLM call.

**Deliberately deferred:** email_client's remaining 21 lines are attachment-encoding sub-branches and a few provider-quirk tails — lower-yield, left for a future pass.

**COV ledger: EMPTY.** No real bugs; no `xfail`s.

## 6r. R3 — P17 web tools + channel config (2026-07-07)

Two safe files to 100%, one PR, Odin-reviewed. Whole-repo 84.4% → **84.7%**.

| File | Start → End |
|---|---|
| `tools/web.py` | 48.0% → **100.0%** (missing 51 → 0) |
| `discord/channel_config.py` | 53.1% → **100.0%** (missing 38 → 0) |

**Method / safety.**
- *tools/web* — pure `_HTMLToText` (skip-tag + block-newline) and `_parse_ddg_results` (link/snippet extraction + `uddg=` redirect unwrap + no-results), plus `fetch_url`/`web_search` with `aiohttp.ClientSession` **faked** (queue-backed fake session/response) and the SSRF `is_url_blocked` guard patched: blocked-URL, HTML/JSON/text content types, non-200, truncation, `ClientError`, and generic-exception arms. **No real HTTP, no network.**
- *discord/channel_config* — real `ChannelConfigManager` on a tmp JSON path: the channel > guild > global resolution ladder for `is_enabled`/`should_require_mention`/`should_respond_to_bots` (including `guild_id=None` skipping the guild layer), the set/get/clear mutators (None-values-skipped, clear removes), persistence round-trip via a second manager, and the corrupt-file load guard. Pure dict logic + tmp-file I/O.

**COV ledger: EMPTY.** No real bugs; no `xfail`s.

## 6s. R3 — P18 planning store + error handler (2026-07-07)

One gated file to 100% plus additive coverage of an excluded surface, one PR, Odin-reviewed. Whole-repo 84.7% → **84.9%**.

| File | Start → End | Gated? |
|---|---|---|
| `planning/store.py` | 61.4% → **100.0%** (missing 39 → 0) | yes — ratcheted |
| `discord/helpers/error_handler.py` | 0% → **100.0%** | **no** — on the §3 EXCLUDES list; tests are additive |

**Method / safety.**
- *planning/store* — real `PlanStore` on a tmp JSON path: create/get_pending (most-recent-wins, user/channel scoping), `list_pending` filters, the `mark_executing`/`mark_completed`/`mark_cancelled` transitions (+ missing-plan no-ops), expiry pruning (`_prune_expired` flips pending→expired), persistence round-trip via a second store, the corrupt-file load guard, and the `ExecutionPlan` `is_expired`/`to_dict`/`from_dict` (unknown-key-filtering) helpers. Pure dataclass logic + tmp-file I/O.
- *error_handler* — `handle_command_error` dispatch for every discord.py error type (MissingPermissions / BotMissingPermissions / MissingRequiredArgument / BadArgument / CommandOnCooldown / NoPrivateMessage / CommandNotFound-silent / CheckFailure / generic-unhandled) plus the `CommandInvokeError` unwrap, using real discord error objects + a fake ctx. **This file is on the coverage-gate EXCLUDES list ("discord.py error-event glue")**, so it is *not* ratcheted — the tests are additive regression coverage that improve whole-repo % without changing the gate's exclusion policy. (It proved cleanly unit-testable; if a future pass wants it gated, un-excluding it in `coverage_gate.py` is a one-line change — deferred here to keep the wave a pure test/baseline diff.)

**COV ledger: EMPTY.** No real bugs; no `xfail`s.

## 7. Risks / discipline

- **Coverage theater**: the §5 real-behavior rule + Odin review of every test are the guard. A test that would pass against a `pass` body is rejected.
- **Flaky/slow additions**: the suite is 63s today; new tests must stay fast and deterministic (mock transport/clock, no real sleeps/network). Budget: keep full suite under ~2 min.
- **Mock-drift false confidence**: prefer driving real code with faked *boundaries* (transport, filesystem via tmp_path, discord objects) over mocking the unit under test — the TS week proved fakes shaped like the wrong contract validate bugs.
- **Baseline churn**: missed-count ceilings are ε=0; percent non-regression uses ε=0.25 only for noise. Refactor/rename churn is handled by explicit baseline ceremony, not silent tuning.

## 8. Revert

The gate is one CI job + one script + one baseline file; tests are purely additive. Remove the job and nothing else is affected. No deploy dependency.
