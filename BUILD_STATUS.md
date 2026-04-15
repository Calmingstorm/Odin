# Odin Build Status — 50-round all-around improvement loop

This file is the chain of context between rounds. Every round MUST read this
file top-to-bottom before doing any work, validate previous rounds' work,
execute its own round, then append verbose notes to the "Round Notes" section
at the bottom.

## Loop configuration

- **Total rounds**: 50
- **Branch**: `master` (direct commits; push handled by runner script)
- **Each round runs**: `claude --print --dangerously-skip-permissions --no-session-persistence`
- **Each round ends with**: `git add -A && git commit -m "[Round N] …"`
- **Runner pushes** to `origin master` after the round succeeds

## Hard rules — every round

### Never weaken the direct-executor ethos
Odin was forked from Heimdall. Both are direct executors. Both refuse nanny
behavior. Do NOT remove, narrow, or gate any of the following — they are what
makes Odin effective:

- `detect_fabrication`, `detect_promise_without_action`, `detect_tool_unavailable`,
  `detect_hedging`, `detect_code_hedging`, `detect_premature_failure`
  (all live in `src/discord/response_guards.py`)
- Bot-to-bot "EXECUTE immediately" preamble logic
- Tool-less bot responses NOT saved to session history (anti-poisoning)
- Tool-choice "auto" on Codex calls (never narrow to a fixed tool)
- Completion classifier fail-open behavior (timeout → COMPLETE, not blocked)
- `start_loop` classifier bypass (scheduling a loop IS the completion)
- System prompt must stay < 5000 chars
- Tool loop caps (`max_tool_iterations_chat`, `max_tool_iterations_loop`) may
  be tuned via config but the config plumbing must remain

If a round finds a change that would weaken these, REVERT it and document why
in the round notes.

### Forbidden additions (explicitly rejected ideas)
These were tried in earlier ancestors and removed because they were annoying
or counter-productive. Do NOT reintroduce them:

- Active-tool-call list rendered as a persistent Discord embed during tool
  execution (Loki did this; Heimdall removed it because it spammed channels)
- Cancel button UI on every tool run (Loki had this; removed as noise)
- Dedicated shell wrappers for routine ops (`check_service`, `check_disk`,
  etc.) — these were consolidated into `run_command`; keep them consolidated
- Tool packs system for "optional" infrastructure tools — keep tools
  first-class, not dynamically loaded bundles
- "Are you sure?" modals, consent interstitials, or refusal UX for otherwise
  allowed operations — Odin is a direct executor
- Narrowing tool scope for safety theater (e.g. read-only SSH mode,
  sandboxed file writes by default). Add observability (logs/audit/metrics),
  not friction.

### Universal per-round process
1. `git fetch origin && git pull --ff-only origin master` — reconcile first.
2. Read this file end-to-end. Understand what previous rounds did. Find
   anything unfinished, incorrect, or broken from earlier rounds — fix those
   FIRST and document the fix.
3. Look up your round's task in the Plan section.
4. Run `python3 -m pytest tests/ -q` to establish the pre-round baseline.
   Note pass/fail count.
5. Implement the round's task. Write code AND tests. Tests must test real
   code behavior via imports and function calls — NEVER test `.md` file
   content or file existence.
6. Re-run `python3 -m pytest tests/ -q`. If tests fail because of your
   changes, fix them before committing. If tests fail for reasons unrelated
   to your round, document in notes and proceed only if the failures
   pre-existed.
7. Append a verbose Round Notes entry with: files changed (paths + line
   refs), new tests added, issues found in prior rounds, anything the next
   round must watch for.
8. `git add -A && git commit -m "[Round N] <concrete change>"` — commit
   message must be specific, not "improvements" or "progress".
9. DO NOT push. The runner pushes after each round returns.

### Test discipline
- Tests exercise actual code paths via imports and function calls.
- Do NOT write tests that assert string contents of `.md` files or
  directory listings. That was a footgun in earlier loops.
- Flaky tests → fix the flakiness or delete the test, don't retry-loop.
- Coverage counts less than honesty: if a subsystem is genuinely hard to
  test (Discord gateway, voice receive), don't fake coverage — just note it.

---

## Plan

Rounds are grouped into 10 phases of 5 rounds each. Earlier rounds set up
infrastructure that later rounds build on. Every 10th round is a REVIEWER
round with no new scope — only validation, bug fixes from prior rounds, and
tightening of prior work.

### Phase 1 — Observability & cost (rounds 1–5)
| # | Focus | Status | Summary |
|---|-------|--------|---------|
| 1 | Cost tracking: prompt+completion tokens and estimated USD per Codex call, aggregated per user / channel / tool in Prometheus + web UI | done | CostTracker module, LLMResponse token fields, Prometheus metrics, /api/usage endpoint, web UI page |
| 2 | Token-budget awareness: track running tokens per session, expose in `/metrics`, auto-compact when budget exceeded | done | Session.estimated_tokens, token-budget compaction, Prometheus metrics, /api/sessions/token-usage, config.sessions.token_budget |
| 3 | Trajectory saving: dump every message's full turn (prompt, all tool calls, final response) as JSONL under `data/trajectories/` | done | TrajectorySaver module, TrajectoryTurn/ToolIteration types, date-partitioned JSONL, search/list/read, REST API (3 endpoints), Prometheus metric |
| 4 | Trace viewer web UI page: given a message id, render the full tool chain with timings and outputs | done | Trace viewer page with message ID lookup, search/filter, expandable iteration timeline, duration bars, token counts |
| 5 | Log filter UI: server-side search / time-range / level filtering on the Logs page | done | AuditLogger.search_logs + get_log_stats, /api/logs/search + /api/logs/stats endpoints, Logs page Search History mode with level/time/keyword/tool filters |

### Phase 2 — Reliability hardening (rounds 6–10)
| # | Focus | Status | Summary |
|---|-------|--------|---------|
| 6 | Exponential backoff with jitter on Codex and SSH retries (replace fixed [2s,5s,10s] ladder) | done | backoff module with full jitter, RetryConfig in schema, Codex + SSH retry integration |
| 7 | Per-tool timeouts in `config.yml` instead of a single global tool_timeout_seconds | done | ToolsConfig.tool_timeouts dict + get_tool_timeout(), executor/agent/skill per-tool lookup, REST API endpoints, 36 tests |
| 8 | Bulkhead isolation: SSH failures must not cascade into Codex; tool failures isolated from message handler | done | Bulkhead module with semaphore-based concurrency limits per resource category (SSH/subprocess/browser), config, executor integration, planner gather fix, Prometheus metrics, REST API |
| 9 | SSH connection pooling (paramiko multiplex) and aiohttp keepalive pool | pending | |
| 10 | REVIEWER: validate rounds 1–9, tighten tests, fix bugs found | pending | |

### Phase 3 — New tools (rounds 11–15)
| # | Focus | Status | Summary |
|---|-------|--------|---------|
| 11 | `git_ops` tool: clone / commit / push / branch / diff / status with safe defaults and branch freshness check | pending | |
| 12 | `kubectl` tool: apply / get / logs / describe against clusters via SSH or kubeconfig | pending | |
| 13 | `docker_ops` tool: build / run / exec / logs / compose up/down against local or remote hosts | pending | |
| 14 | `terraform_ops` tool: plan / apply with safe plan preview, never auto-approves | pending | |
| 15 | `http_probe` tool: issue requests with retries, timing, response capture; useful for API debugging | pending | |

### Phase 4 — Integrations (rounds 16–20)
| # | Focus | Status | Summary |
|---|-------|--------|---------|
| 16 | MCP (Model Context Protocol) client: invoke external MCP servers as first-class tools | pending | |
| 17 | Slack output: post responses/alerts to Slack webhook alongside Discord | pending | |
| 18 | Linear / Jira: create issues from loop reports, comment on existing issues | pending | |
| 19 | Richer Grafana alert handling: parse payloads, auto-spawn remediation loops | pending | |
| 20 | REVIEWER: validate rounds 11–19, tighten tests, fix bugs found | pending | |

### Phase 5 — Memory & knowledge (rounds 21–25)
| # | Focus | Status | Summary |
|---|-------|--------|---------|
| 21 | Knowledge deduplication: content hashing on ingest, skip or merge near-duplicates | pending | |
| 22 | Knowledge versioning: edit history per entry with audit trail | pending | |
| 23 | Adaptive session consolidation: compaction target scales with channel activity | pending | |
| 24 | FTS5 session search in web UI: search prior conversations by keyword/user/time | pending | |
| 25 | Knowledge import: bulk ingest of markdown dirs, PDFs, web URLs | pending | |

### Phase 6 — Policy, audit, safety (rounds 26–30)
| # | Focus | Status | Summary |
|---|-------|--------|---------|
| 26 | Action diffs: for file / config changes, audit log records before→after diff | pending | |
| 27 | Audit log signing: append-only with HMAC chain for tamper detection | pending | |
| 28 | Dangerous-command risk classifier: tag commands by risk before execution (observability only, NO blocking) | pending | |
| 29 | Tool RBAC: honor `PermissionsConfig.tiers` on tool calls (not auth only) | pending | |
| 30 | REVIEWER: validate rounds 21–29, tighten tests, fix bugs found | pending | |

### Phase 7 — Agents, loops, lifecycle (rounds 31–35)
| # | Focus | Status | Summary |
|---|-------|--------|---------|
| 31 | Agent worker lifecycle state machine: replace implicit polling with typed states (spawning, ready, executing, recovering, done) | pending | |
| 32 | Recovery-before-escalation: known failure modes auto-heal once before surfacing to user | pending | |
| 33 | Loop branch-freshness check: on test failure, verify branch isn't stale vs origin before treating as regression | pending | |
| 34 | Agent trajectory saving: every spawned agent saves its full trajectory like messages do in Round 3 | pending | |
| 35 | Nested agent spawning: one agent may spawn sub-agents with a depth limit (default 2) | pending | |

### Phase 8 — UX & workflows (rounds 36–40)
| # | Focus | Status | Summary |
|---|-------|--------|---------|
| 36 | Health dashboard page: all component health at a glance (Codex, SSH hosts, DB, knowledge store, voice) | pending | |
| 37 | Memory-usage widget: session count, knowledge DB size, trajectory volume | pending | |
| 38 | Tool output streaming: ship partial results to Discord/UI as tools produce them (opt-in per tool, OFF by default — never spam) | pending | |
| 39 | Auxiliary LLM client: separate cheap-model client for classification / summarization / vision description | pending | |
| 40 | REVIEWER: validate rounds 31–39, tighten tests, fix bugs found | pending | |

### Phase 9 — Anti-hedging + detection hardening (rounds 41–45)
| # | Focus | Status | Summary |
|---|-------|--------|---------|
| 41 | Expand detect_hedging pattern corpus + add regression test suite | pending | |
| 42 | New detector: `detect_stuck_loop` — catches agents iterating without new output (identical tool call chain) | pending | |
| 43 | Tool result schema enforcement: validate each tool's result shape before feeding back to LLM | pending | |
| 44 | Context auto-compression with prompt caching (Anthropic-style static prefix caching) | pending | |
| 45 | Smart model routing: cheap model for intent classification, strong model for execution | pending | |

### Phase 10 — Polish & final (rounds 46–50)
| # | Focus | Status | Summary |
|---|-------|--------|---------|
| 46 | Startup diagnostics: boot-time checks for Codex auth, SSH hosts, DB, knowledge store, with helpful errors | pending | |
| 47 | Graceful degradation: one failing subsystem (knowledge / voice / browser) must not take the whole bot down | pending | |
| 48 | Outbound webhooks: Odin pushes structured events to registered URLs (Jenkins-style triggers) | pending | |
| 49 | Coverage boost: push test coverage on features added in rounds 1–48 above their baseline | pending | |
| 50 | REVIEWER + WRAP: final end-to-end validation; `run_bot` smoke test; summary of shipped features appended to this file | pending | |

---

## Round Notes

(Each round appends a verbose note here. Format below. Most recent at the
bottom. Do not truncate older entries — they are the chain-of-context.)

### Template

```markdown
## Round N — <concise title>
**Focus**: <one line>
**Baseline pytest**: <pass/fail count before this round>
**Post-round pytest**: <pass/fail count after this round>

### Validated from prior rounds
- Round X: <what you checked, what was OK, what you fixed if anything>

### Work done
- `src/foo/bar.py:123` — <change description>
- `tests/test_bar.py` — added <new tests>
- `BUILD_STATUS.md` — status table updated

### Issues found
- …

### Next round watch for
- …
```

## Round 1 — Cost tracking: token estimation + USD cost per Codex call
**Focus**: Add LLM cost tracking with token estimation, aggregation by user/channel/tool, Prometheus metrics, REST API, and web UI page.
**Baseline pytest**: 683 passed, 0 failed
**Post-round pytest**: 718 passed, 0 failed (+35 new tests)

### Validated from prior rounds
- No prior rounds to validate (this is Round 1).

### Work done
- `src/llm/cost_tracker.py` (new) — `CostTracker` class with:
  - `estimate_tokens()` function (~4 chars/token heuristic, matching `sessions/manager.py` convention)
  - `UsageRecord` dataclass for individual call snapshots
  - Thread-safe aggregation via `threading.Lock` — tracks totals and breakdowns by user_id, channel_id, and tool name
  - `record()` method computes USD cost from configurable per-1K-token pricing (default $0.005 input, $0.015 output)
  - Query methods: `get_totals()`, `get_by_user()`, `get_by_channel()`, `get_by_tool()`, `get_recent()`, `get_summary()`
  - `get_prometheus_metrics()` returns dict consumed by MetricsCollector
  - Bounded recent history (max 1000 records, auto-trimmed)
- `src/llm/types.py:28-29` — Added `input_tokens: int = 0` and `output_tokens: int = 0` fields to `LLMResponse` dataclass
- `src/llm/openai_codex.py:283-293` — Added `_estimate_body_input_tokens()` static method that estimates input tokens from the Codex API request body (system prompt + message content + function call args/output)
- `src/llm/openai_codex.py:82-86` — `chat()` now estimates input/output tokens and stores on `_last_input_tokens`/`_last_output_tokens` (for callers that receive str, not LLMResponse)
- `src/llm/openai_codex.py:330-336` — `chat_with_tools()` now populates `LLMResponse.input_tokens` and `output_tokens` from estimation (includes tool call name + args in output count)
- `src/llm/openai_codex.py:30-32` — Added `_last_input_tokens`/`_last_output_tokens` instance vars to `__init__`
- `src/llm/__init__.py` — Exported `CostTracker`
- `src/health/metrics.py:215-261` — Added cost_tracker rendering to `MetricsCollector.render()`:
  - `odin_llm_input_tokens_total` (counter)
  - `odin_llm_output_tokens_total` (counter)
  - `odin_llm_cost_usd_total` (counter)
  - `odin_llm_requests_total` (counter)
  - `odin_llm_user_cost_usd{user="..."}` (counter, per-user)
  - `odin_llm_channel_cost_usd{channel="..."}` (counter, per-channel)
- `src/web/api.py:612-624` — Added `GET /api/usage` (full summary) and `GET /api/usage/totals` (totals only) endpoints. Uses `getattr(bot, "cost_tracker", None)` for graceful degradation.
- `ui/js/pages/usage.js` (new) — Vue 3 page with:
  - Summary cards (requests, input tokens, output tokens, estimated cost)
  - Tabbed breakdowns: by user, by channel, by tool, recent calls
  - Auto-refresh every 15s
  - Skeleton loading / error states matching existing UI pattern
- `ui/js/app.js:20,46` — Imported UsagePage and added route `{ path: '/usage', component: UsagePage, meta: { label: 'Usage', icon: '$' } }`
- `tests/test_cost_tracker.py` (new) — 35 tests covering:
  - `estimate_tokens` (6 tests: empty, short, boundary, long, type)
  - `CostTracker.record` (8 tests: return type, totals, by_user, by_channel, by_tool, empty keys, cost calculation, custom pricing)
  - `CostTracker.get_recent` (4 tests: basic, limit, bounded, timestamps)
  - `CostTracker.get_summary` (3 tests: structure, pricing note, empty)
  - `CostTracker.get_prometheus_metrics` (2 tests: structure, empty)
  - MetricsCollector integration (5 tests: rendered, absent, empty, no-labels, error resilience)
  - `/metrics` endpoint integration (1 test: full HTTP round-trip)
  - `LLMResponse` token fields (2 tests: defaults, set values)
  - `_estimate_body_input_tokens` (4 tests: empty, system-only, messages, function output)

### Issues found
- The Codex Responses API SSE stream does not return token usage metadata, so all token counts are estimates. This is noted in the pricing section of `/api/usage` responses.
- `bot.cost_tracker` is accessed via `getattr` in the API — the bot must attach a `CostTracker` instance for it to work. The wiring into `OdinBot.__init__` or startup should happen when the bot's initialization code is touched (or in a later round that wires subsystems).

### Next round watch for
- Round 2 (token-budget awareness) should USE the `CostTracker` and `estimate_tokens` from `cost_tracker.py` rather than duplicating the estimation logic in `sessions/manager.py`. Consider consolidating `sessions.manager.estimate_tokens` to import from `cost_tracker`.
- The `CostTracker` needs to be instantiated and attached to the bot object (as `bot.cost_tracker`) and registered with `MetricsCollector` (as `metrics.register_source("cost_tracker", tracker.get_prometheus_metrics)`) during bot startup. This wiring depends on how `OdinBot` initializes subsystems.
- The `_last_input_tokens`/`_last_output_tokens` on `CodexChatClient` are for callers of `chat()` (returns str) that want token data — they should call `tracker.record(client._last_input_tokens, client._last_output_tokens, ...)` after each chat call.
- Web UI page auto-refreshes every 15s — if usage volume is very high, consider WebSocket push instead.

## Round 2 — Token-budget awareness: per-session token tracking + auto-compaction
**Focus**: Track running tokens per session, expose in `/metrics`, auto-compact when budget exceeded.
**Baseline pytest**: 718 passed, 0 failed
**Post-round pytest**: 759 passed, 0 failed (+41 new tests)

### Validated from prior rounds
- Round 1: `CostTracker`, `estimate_tokens`, `LLMResponse` token fields, `/api/usage` endpoints all present and working. Tests pass (35 tests in `test_cost_tracker.py`). Round 1 asked Round 2 to consolidate `estimate_tokens` — done (see below). Round 1 noted `CostTracker` is not yet wired to the bot — still true, will need wiring when bot initialization code is built.

### Work done

#### 1. Consolidated `estimate_tokens` (Round 1 recommendation)
- `src/sessions/manager.py:14` — Now imports `estimate_tokens` from `src.llm.cost_tracker` instead of defining a local copy. Both had identical logic (`max(1, len(text) // 4)`), so this is a straightforward dedup. The `CHARS_PER_TOKEN = 4` constant remains in both modules since it's referenced by other code in `sessions/manager.py` (`apply_token_budget`).

#### 2. `_estimate_session_tokens()` helper and `Session.estimated_tokens` property
- `src/sessions/manager.py:228-234` — New `_estimate_session_tokens(messages, summary)` function: sums `estimate_tokens()` across all messages and the summary.
- `src/sessions/manager.py:247-249` — New `estimated_tokens` property on `Session` dataclass. Computed on access (not cached) so it always reflects current state. This was a design choice: sessions mutate frequently (messages added/removed, compaction), and caching would require invalidation hooks on every mutation. The property is cheap (O(n) over message list, which is bounded by `max_history`).

#### 3. `SessionManager._needs_compaction()` — dual trigger
- `src/sessions/manager.py:380-385` — New method returns `True` if message count > `COMPACTION_THRESHOLD` (existing behavior) OR if `session.estimated_tokens > self.token_budget` (new). This means compaction fires for sessions with few but very large messages (e.g., 10 messages with tool output that collectively consume 200K tokens).
- `src/sessions/manager.py:397` and `src/sessions/manager.py:487` — `get_history_with_compaction()` and `get_task_history()` both now call `_needs_compaction()` instead of the inline `len(session.messages) > COMPACTION_THRESHOLD` check.

#### 4. `_compact()` handles token-budget case with few messages
- `src/sessions/manager.py:590-594` — When token budget triggers compaction but message count ≤ `keep_count` (default `max_history // 2 = 25`), the keep count is dynamically reduced to `max(2, len(messages) // 2)`. This ensures there's always something to summarize. Without this fix, the method would early-return because `to_summarize` would be empty.

#### 5. `SessionManager.get_session_token_usage()` and `get_token_metrics()`
- `src/sessions/manager.py:553-571` — `get_session_token_usage()`: returns dict keyed by channel_id with `estimated_tokens`, `message_count`, `has_summary`, `budget`, `budget_pct`, `last_active` per session. Used by the `/api/sessions/token-usage` endpoint.
- `src/sessions/manager.py:573-586` — `get_token_metrics()`: returns aggregate metrics dict for Prometheus: `total_tokens`, `session_count`, `over_budget_count`, `token_budget`, `per_session` (channel→token mapping).

#### 6. Config: `SessionsConfig.token_budget`
- `src/config/schema.py:31` — Added `token_budget: int = 128_000` to `SessionsConfig`. Optional with sensible default (128K tokens ≈ 512K chars). This drives the `SessionManager.token_budget` parameter.

#### 7. Prometheus metrics for session tokens
- `src/health/metrics.py:268-301` — Added `session_tokens` source rendering:
  - `odin_session_tokens_total` (gauge) — total estimated tokens across all sessions
  - `odin_session_token_budget` (gauge) — configured per-session budget
  - `odin_sessions_over_budget` (gauge) — count of sessions exceeding budget
  - `odin_session_tokens{channel="..."}` (gauge, per-session) — tokens per active session

#### 8. REST API endpoints
- `src/web/api.py:592-594` — New `GET /api/sessions/token-usage` endpoint returning per-session token usage.
- `src/web/api.py:485` — `GET /api/sessions` now includes `estimated_tokens` in each session object.
- `src/web/api.py:515-516` — `GET /api/sessions/{channel_id}` now includes `estimated_tokens` and `token_budget`.

#### 9. Module exports
- `src/sessions/__init__.py` — Now exports `DEFAULT_SESSION_TOKEN_BUDGET` alongside `SessionManager`.
- `src/sessions/manager.py:49` — New `DEFAULT_SESSION_TOKEN_BUDGET = 128_000` constant.

#### 10. Tests
- `tests/test_token_budget.py` — 41 new tests across 12 test classes:
  - `TestEstimateSessionTokens` (4): empty, summary-only, messages-only, both
  - `TestSessionEstimatedTokens` (4): empty, with messages, with summary, dynamic updates
  - `TestNeedsCompaction` (5): below both, message count over, token budget exceeded, not exceeded, both exceeded
  - `TestTokenBudgetCompaction` (4): get_history triggers, get_task_history triggers, no compaction under budget, compaction reduces tokens
  - `TestGetSessionTokenUsage` (5): empty, single session, multiple sessions, budget percentage, has_summary field
  - `TestGetTokenMetrics` (3): empty, with sessions, over budget count
  - `TestSessionTokenPrometheusMetrics` (4): rendered, absent, empty, over budget value
  - `TestSessionsConfigTokenBudget` (3): default, custom, zero
  - `TestEstimateTokensConsolidation` (2): identity check, consistent results
  - `TestDefaultSessionTokenBudget` (2): value, exported from __init__
  - `TestSessionManagerTokenBudget` (2): default, custom
  - `TestAPISessionTokenUsage` (2): token usage returns data, estimated_tokens property exists
  - `TestCompactionFallbackTokens` (1): fallback preserves summary

### Issues found
- The `CostTracker` is still not wired to the bot object (noted in Round 1, still pending). The `session_tokens` metrics source also needs wiring: `metrics.register_source("session_tokens", session_manager.get_token_metrics)`. This wiring will happen when bot initialization is formalized.
- The `HealthServer.SessionManager` (web auth sessions in `health/server.py:60`) and `sessions.manager.SessionManager` (conversation sessions) have the same class name — potentially confusing. The web auth one is purely for Bearer token session tracking and is unrelated to conversation token budgets.

### Next round watch for
- Round 3 (trajectory saving) should ensure trajectories include per-message estimated token counts so cost analysis can be done offline.
- The `session_tokens` Prometheus source needs to be registered on the `HealthServer.metrics` collector when the bot boots — look for where `metrics.register_source("sessions", ...)` is called and add the session token source alongside it.
- The token budget default of 128K is conservative. Real Codex context windows may be larger or smaller — the config knob (`config.sessions.token_budget`) allows tuning.
- `Session.estimated_tokens` is O(n) per call. If sessions grow large (>100 messages), consider caching. Currently bounded by `max_history=50` and compaction, so unlikely to be a bottleneck.

## Round 3 — Trajectory saving: full message turn recording as JSONL
**Focus**: Dump every message's full turn (prompt, all tool calls, final response) as JSONL under `data/trajectories/`.
**Baseline pytest**: 759 passed, 0 failed
**Post-round pytest**: 812 passed, 0 failed (+53 new tests)

### Validated from prior rounds
- Round 1: `CostTracker`, `estimate_tokens`, `LLMResponse` token fields all present and passing (35 tests). `CostTracker` still not wired to bot object — still pending (noted Round 1, Round 2).
- Round 2: `Session.estimated_tokens`, `_needs_compaction()`, `get_session_token_usage()`, `get_token_metrics()` all present and passing (41 tests). `estimate_tokens` consolidated into `cost_tracker.py` as recommended — verified Round 2's import works. `session_tokens` Prometheus source still needs wiring — still pending.
- Round 2 recommended: "Round 3 should ensure trajectories include per-message estimated token counts so cost analysis can be done offline." — Done: `TrajectoryTurn` includes `total_input_tokens`, `total_output_tokens` per turn, and each `ToolIteration` has `input_tokens`/`output_tokens`. If no token data is provided, `finalize()` falls back to `estimate_tokens()` from `cost_tracker.py`.

### Work done

#### 1. New module: `src/trajectories/saver.py`
- `ToolIteration` dataclass (line 30): captures one round of the tool loop — tool calls, results, LLM text, token counts, duration.
- `TrajectoryTurn` dataclass (line 39): captures the complete message turn — message metadata, user content, system prompt, history, iterations, final response, tools used, error/handoff flags, aggregate tokens/duration.
  - `add_iteration()` (line 64): appends a tool iteration to the turn.
  - `finalize()` (line 82): sets final response, aggregates totals from iterations, collects tools used. Falls back to `estimate_tokens()` if no token data.
  - `to_dict()` (line 93): serializes to a dict suitable for JSON. Stores `system_prompt_length` instead of the full system prompt (avoids bloating trajectory files with 5000-char prompts).
- `_collect_tools_used()` (line 108): deduplicates tool names across iterations, preserving first-seen order.
- `_trajectory_filename()` (line 118): generates `YYYY-MM-DD.jsonl` from datetime.
- `TrajectorySaver` class (line 122):
  - `__init__(directory)` — creates `data/trajectories/` directory on init.
  - `save(turn)` — async write of one JSONL line to today's file via `aiofiles`.
  - `save_from_data(...)` — convenience method that builds a `TrajectoryTurn` from keyword args and saves it.
  - `list_files()` — returns sorted list of `.jsonl` files in the directory.
  - `read_file(filename, limit)` — reads entries from a file (most recent first).
  - `search(channel_id, user_id, tool_name, errors_only, limit)` — searches across all files with filter predicates.
  - `get_prometheus_metrics()` — returns `{"trajectories_saved_total": N}` for the metrics collector.
  - `count` property — tracks total saves for metrics.

#### 2. New module: `src/trajectories/__init__.py`
- Exports `TrajectorySaver`, `TrajectoryTurn`, `ToolIteration`.

#### 3. REST API endpoints: `src/web/api.py:638-680`
- `GET /api/trajectories` — list trajectory files + total save count. Returns 503 if `trajectory_saver` not on bot.
- `GET /api/trajectories/{filename}` — read entries from a specific file (limit param, max 500). Validates filename ends with `.jsonl` and contains no path separators.
- `GET /api/trajectories/search/query` — search with filters: `channel_id`, `user_id`, `tool_name`, `errors_only`, `limit`.

#### 4. Prometheus metrics: `src/health/metrics.py:302-311`
- Added `trajectories` source rendering: `odin_trajectories_saved_total` gauge.

#### 5. Tests: `tests/test_trajectories.py` — 53 tests across 13 test classes
- `TestToolIteration` (2): defaults, with data
- `TestTrajectoryTurn` (9): defaults, add_iteration, multiple iterations, finalize totals, finalize fallback tokens, finalize error, to_dict structure, to_dict excludes system prompt, to_dict serializable
- `TestCollectToolsUsed` (4): empty, single, dedup with order, missing name
- `TestTrajectoryFilename` (2): format, different dates
- `TestTrajectorySaver` (9): creates file, writes valid JSON, increments count, appends to same file, sets timestamp, preserves timestamp, creates directory, includes tokens, includes duration
- `TestTrajectorySaverSaveFromData` (1): full round-trip
- `TestTrajectorySaverListFiles` (2): empty, with files
- `TestTrajectorySaverReadFile` (3): nonexistent, read file, with limit
- `TestTrajectorySaverSearch` (7): all, by channel, by user, by tool, errors only, with limit, combined filters
- `TestTrajectoryPrometheusMetrics` (4): get_prometheus_metrics, rendered, absent, zero
- `TestTrajectoryPrometheusMetrics.test_metrics_in_endpoint` (1): full HTTP round-trip via HealthServer
- `TestTrajectoryAPI` (4): list, get file, invalid name, search
- `TestTrajectoryAPIUnavailable` (3): list 503, get 503, search 503
- `TestTrajectoryImports` (2): package import, default directory constant

### Issues found
- `_process_with_tools` is referenced in `src/web/chat.py:177` but not yet implemented on `OdinBot`. Trajectory saving cannot be wired into the tool loop until this method exists. The `TrajectorySaver` is designed to be called from inside the tool loop: create a `TrajectoryTurn` before the loop, call `add_iteration()` after each LLM call, then `finalize()` + `save()` after the loop completes.
- `bot.trajectory_saver` needs to be instantiated and attached during bot startup (same pattern as `cost_tracker` — noted in Rounds 1-2 as still pending).
- The `trajectory_saver` Prometheus source needs to be registered: `metrics.register_source("trajectories", saver.get_prometheus_metrics)`.
- `to_dict()` stores `system_prompt_length` rather than the full system prompt to avoid bloating trajectory files. If full prompt replay is needed, a future round could add an opt-in `include_system_prompt` flag.

### Next round watch for
- Round 4 (trace viewer web UI) should use the `/api/trajectories/{filename}` and `/api/trajectories/search/query` endpoints as its data source. The trajectory JSONL entries contain `iterations` with full tool call/result data and timing — exactly what a trace viewer needs to render.
- The `TrajectorySaver` needs wiring into the bot's `__init__` or startup sequence: `self.trajectory_saver = TrajectorySaver()` and `metrics.register_source("trajectories", self.trajectory_saver.get_prometheus_metrics)`.
- Integration with the tool loop requires calling `turn.add_iteration()` after each LLM response inside `_process_with_tools`, then `turn.finalize()` + `await self.trajectory_saver.save(turn)` at the end. This is blocked until `_process_with_tools` is implemented.
- The `search()` method reads all matching files sequentially — fine for moderate volume but may need optimization (index file, or SQLite storage) if trajectory volume grows large.

## Round 4 — Trace viewer web UI page
**Focus**: Build a trace viewer web UI page that renders full tool chains with timings and outputs, with message ID lookup.
**Baseline pytest**: 812 passed, 0 failed
**Post-round pytest**: 820 passed, 0 failed (+8 new tests)

### Validated from prior rounds
- Round 1: `CostTracker`, `estimate_tokens`, `LLMResponse` token fields all present and passing (35 tests). `CostTracker` still not wired to bot object — still pending (noted Rounds 1-3).
- Round 2: `Session.estimated_tokens`, `_needs_compaction()`, token metrics all present and passing (41 tests). `session_tokens` Prometheus source still needs wiring — still pending.
- Round 3: `TrajectorySaver`, `TrajectoryTurn`, `ToolIteration`, REST API endpoints (`/api/trajectories`, `/api/trajectories/{filename}`, `/api/trajectories/search/query`) all present and passing (53 tests). Trajectory data shape (`to_dict()`) matches what the trace viewer needs. No issues found in prior round implementations.

### Work done

#### 1. New method: `TrajectorySaver.find_by_message_id()`
- `src/trajectories/saver.py:268-289` — Searches all trajectory files (most recent first) for a specific `message_id`. Returns the first matching entry dict, or `None`. Uses the same reverse-file-order pattern as `search()`.

#### 2. New API endpoint: `GET /api/trajectories/message/{message_id}`
- `src/web/api.py:662-671` — Returns `{"entry": {...}}` on match, 404 if not found, 503 if saver unavailable. Uses `find_by_message_id()`. No route conflict with `{filename}` endpoint — different path depth (2 segments vs 1 after `/api/trajectories/`).

#### 3. New UI page: `ui/js/pages/traces.js`
- Full trace viewer page with:
  - **Message ID lookup**: text input + Enter to look up a specific message's full trace, displays as a dedicated single-trace detail view
  - **Search/filter panel**: file selector dropdown, channel ID, user ID, tool name, errors-only checkbox, configurable limit (25/50/100)
  - **Trace list table**: timestamp, user, message preview (truncated to 60 chars), tools used (first 3 + overflow count), duration, token count, status badge (ok/error/handoff)
  - **Expandable trace detail**: clicking a row expands inline detail with:
    - Quick stats row: iteration count, duration, input tokens, output tokens
    - User message content (pre-formatted, scrollable)
    - **Iteration timeline**: each iteration is a collapsible card showing:
      - Header: iteration number, tool call badges (blue), duration, token count
      - Duration bar: proportional width relative to total duration with percentage label
      - LLM text (if present)
      - Tool calls: name highlighted in blue, input as formatted JSON
      - Tool results: name in green (or red for errors), output as formatted JSON (truncated to 5000 chars)
    - Final response (pre-formatted, scrollable)
  - **Single trace view** (from message ID lookup): same detail rendering but full-page, with summary stat cards (iterations, tools, duration, tokens) and back-to-list button
  - Skeleton loading, error state, empty state — all matching existing UI patterns

#### 4. Route registration: `ui/js/app.js`
- Line 21: `import TracesPage from './pages/traces.js';`
- Line 48: `{ path: '/traces', component: TracesPage, meta: { label: 'Traces', icon: '\u{1F50D}' } }`

#### 5. Tests: `tests/test_trajectories.py` — 8 new tests
- `TestTrajectorySaverFindByMessageId` (5 tests):
  - `test_find_existing`: finds an entry by message_id in a multi-entry file
  - `test_find_not_found`: returns None for nonexistent message_id
  - `test_find_empty_directory`: returns None when no trajectory files exist
  - `test_find_across_files`: finds entries in older files when not in recent ones
  - `test_find_returns_most_recent_file_first`: with duplicate message_ids across files, returns from most recent
- `TestTrajectoryMessageAPI` (3 tests):
  - `test_get_by_message_id`: HTTP 200 with entry data
  - `test_get_by_message_id_not_found`: HTTP 404 when message not in trajectories
  - `test_get_by_message_id_unavailable`: HTTP 503 when saver not attached to bot

### Issues found
- The `CostTracker`, `session_tokens` Prometheus source, and `TrajectorySaver` are all still not wired to the bot object. This is a recurring note from Rounds 1-3. The wiring will happen when bot initialization is formalized (or a dedicated round handles subsystem wiring).
- The `find_by_message_id()` method scans all files sequentially — same limitation as `search()`. For high-volume deployments, an index or SQLite storage would be better.
- The trace viewer UI page cannot be browser-tested in this headless build loop environment. The page follows existing UI patterns exactly (audit.js, sessions.js) and uses the same API client, Vue 3 patterns, and Tailwind classes.

### Next round watch for
- Round 5 (log filter UI) should follow the same UI pattern established here: filter panel at top, table with expandable detail below.
- The trace viewer depends on trajectory data having `iterations` arrays with tool call/result detail. Currently trajectories are not wired into the bot's tool loop, so no real data will appear until the wiring is done.
- All three subsystem wiring tasks remain open: `cost_tracker`, `session_tokens` metrics, `trajectory_saver`. A future round should handle this holistically.
- The `/api/trajectories/message/{message_id}` endpoint sits between `/{filename}` and `/search/query` in the route table. No conflict exists (different path depths), but future trajectory sub-routes should be aware of the `{filename}` catch-all at depth 1.

## Round 5 — Log filter UI: server-side search + time-range + level filtering
**Focus**: Add server-side log search/filter capabilities to the Logs page with level, time-range, keyword, and tool name filtering.
**Baseline pytest**: 820 passed, 0 failed
**Post-round pytest**: 857 passed, 0 failed (+37 new tests)

### Validated from prior rounds
- Round 1: `CostTracker`, `estimate_tokens`, `LLMResponse` token fields, `/api/usage` endpoints all present and passing (35 tests). `CostTracker` still not wired to bot object — still pending (noted Rounds 1-4).
- Round 2: `Session.estimated_tokens`, `_needs_compaction()`, token metrics all present and passing (41 tests). `session_tokens` Prometheus source still needs wiring — still pending.
- Round 3: `TrajectorySaver`, `TrajectoryTurn`, `ToolIteration`, REST API endpoints all present and passing (53 tests). `trajectory_saver` still needs wiring — still pending.
- Round 4: Trace viewer page, `find_by_message_id()`, `/api/trajectories/message/{message_id}` endpoint all present and passing (8 tests). UI pattern (filter panel + expandable detail) used as reference for this round's Search History mode.
- All three subsystem wiring tasks remain open: `cost_tracker`, `session_tokens` metrics, `trajectory_saver`.

### Work done

#### 1. `AuditLogger.search_logs()` — server-side log search
- `src/audit/logger.py:176-232` — New `search_logs()` method with filters:
  - `level`: `"error"` (entries with non-null `error` field), `"info"` (entries without error), `"all"` (no level filter). Level is derived from the `error` field — the audit JSONL has no explicit level.
  - `start_time` / `end_time`: ISO-8601 prefix strings compared lexicographically against `entry.timestamp`. Supports both date-only (`2026-04-15`) and full ISO prefixes (`2026-04-15T12:00:00+00:00`).
  - `keyword`: case-insensitive substring match against the full JSON-serialized entry (same approach as `search()`).
  - `tool_name`: exact match on `entry.tool_name`.
  - `limit`: max results (default 100).
  - Returns results in reverse chronological order (most recent first), matching `search()` behavior.

#### 2. `AuditLogger.get_log_stats()` — summary statistics
- `src/audit/logger.py:234-268` — New method returning `{"total": N, "errors": N, "tool_count": N, "tools": [...], "web_actions": N}`. Streams through the file once. Used by the `/api/logs/stats` endpoint to populate the Search History mode stats bar and the tool name dropdown.

#### 3. REST API endpoints
- `src/web/api.py:1338-1376` — Two new endpoints:
  - `GET /api/logs/search` — query params: `level` (error/info/all), `start` (ISO), `end` (ISO), `q` (keyword), `tool` (name), `limit` (1-500, default 100). Returns `{"entries": [...], "count": N}`. Validates `level` enum (400 on invalid). Validates `limit` as integer (400 on invalid).
  - `GET /api/logs/stats` — returns summary stats dict from `get_log_stats()`.

#### 4. Logs page UI: Search History mode
- `ui/js/pages/logs.js` — Redesigned with dual-mode interface:
  - **Mode toggle**: "Live Tail" / "Search History" buttons at the top. Live mode preserves all existing functionality (WebSocket streaming, client-side filters, presets, timeline, pause/resume, export).
  - **Search History mode** adds:
    - **Stats bar**: Total entries, errors, unique tools, web actions — loaded from `/api/logs/stats` on first switch.
    - **Filter panel**: Level dropdown (All/Errors only/Info only), Tool dropdown (populated from stats), Time range quick-select (5m/15m/1h/4h/24h/7d), custom Start/End datetime inputs, keyword text search, configurable limit (50/100/200/500), Search and Clear buttons.
    - **Time range quick-select**: Selecting a preset (e.g., "Last 1 hour") auto-fills the Start datetime input to `now - N seconds`, making it easy to combine with other filters.
    - **Search results**: Rendered as log lines matching the live-tail format, with level coloring, tool badges, and user names. Each line is clickable to expand full detail (timestamp, user, channel, duration, tool input as formatted JSON, result summary, error text).
    - **Export**: Works in both modes — exports either filtered live logs or search results.
    - **Empty states**: "Set filters and click Search" before first search, "No entries match" when search returns empty, loading spinner during search.

#### 5. Tests: `tests/test_log_search.py` — 37 tests across 12 test classes
- `TestSearchLogsNoFilter` (4): returns all in reverse, empty file, no file, limit
- `TestSearchLogsLevel` (3): error level, info level, all level
- `TestSearchLogsTimeRange` (4): start time, end time, both, empty range
- `TestSearchLogsKeyword` (3): match, case-insensitive, no match
- `TestSearchLogsToolName` (2): filter by tool, tool not found
- `TestSearchLogsCombined` (3): level+tool, time+keyword, all filters combined
- `TestSearchLogsResilience` (2): skips invalid JSON, entries missing fields
- `TestGetLogStats` (3): with data, empty, no file
- `TestLogSearchAPI` (9): no filters, level, invalid level (400), time range, keyword, tool, limit, invalid limit (400), combined
- `TestLogStatsAPI` (2): stats, empty stats
- `TestSearchAfterLog` (2): log_execution → searchable, log_web_action → searchable (integration tests verifying the full write→read round-trip)

### Issues found
- The audit log entries have no explicit `level` field — level is derived from the `error` field presence. This means "WARNING" is not distinguishable from "INFO" on the server side. The live-tail mode also derives level this way (`entry.error ? 'ERROR' : 'INFO'`), so this is consistent. A future round could add an explicit `level` field to `log_execution()` if granular levels are needed.
- The `search_logs()` method reads the entire file into memory (`readlines()`), same as the existing `search()` method. For very large audit logs (>100MB), this could be slow. A future optimization could use seek-based reverse reading or SQLite storage.
- All three subsystem wiring tasks remain open from Rounds 1-4: `cost_tracker`, `session_tokens` metrics, `trajectory_saver`. These are not in-scope for Round 5 but should be addressed holistically in a future round.

### Next round watch for
- Round 6 (exponential backoff) is a different subsystem and shouldn't conflict with these changes.
- The `/api/logs/search` and `/api/logs/stats` endpoints use `bot.audit` directly — no `getattr` guard needed since the audit logger is always present (created in bot init).
- The Logs page Search History mode loads stats on first switch to populate the tool dropdown. If tool list changes frequently, the dropdown won't auto-update until the user switches modes again. This is fine for typical usage.
- The `get_log_stats()` method reads the entire file each call. For dashboards that poll stats frequently, consider caching with a short TTL (similar to the `format_hints` pattern in tool_memory with 30s TTL).

## Round 6 — Exponential backoff with jitter on Codex and SSH retries
**Focus**: Replace fixed [2s, 5s, 10s] retry delay ladder with proper exponential backoff + full jitter; add SSH retry for transient connection failures.
**Baseline pytest**: 857 passed, 0 failed
**Post-round pytest**: 911 passed, 0 failed (+54 new tests)

### Validated from prior rounds
- Round 1: `CostTracker`, `estimate_tokens`, `LLMResponse` token fields, `/api/usage` endpoints all present and passing (35 tests). `CostTracker` still not wired to bot object — still pending (noted Rounds 1-5).
- Round 2: `Session.estimated_tokens`, `_needs_compaction()`, token metrics all present and passing (41 tests). `session_tokens` Prometheus source still needs wiring — still pending.
- Round 3: `TrajectorySaver`, `TrajectoryTurn`, `ToolIteration`, REST API endpoints all present and passing (53 tests). `trajectory_saver` still needs wiring — still pending.
- Round 4: Trace viewer page, `find_by_message_id()`, API endpoint all present and passing (8 tests).
- Round 5: `AuditLogger.search_logs()`, `get_log_stats()`, `/api/logs/search`, `/api/logs/stats` all present and passing (37 tests). No issues found in prior implementations.
- All three subsystem wiring tasks remain open: `cost_tracker`, `session_tokens` metrics, `trajectory_saver`.

### Work done

#### 1. New module: `src/llm/backoff.py`
- `compute_backoff(attempt, base_delay, max_delay)` (line 19): Full jitter exponential backoff using the AWS Architecture Blog algorithm: `random(0, min(max_delay, base_delay * 2^attempt))`. This decorrelates concurrent retriers to reduce thundering-herd effects on shared backends (Codex API, SSH hosts).
- `compute_backoff_no_jitter(attempt, base_delay, max_delay)` (line 33): Deterministic variant for testing and predictable use cases.
- Constants: `DEFAULT_BASE_DELAY=1.0`, `DEFAULT_MAX_DELAY=30.0`, `DEFAULT_MAX_RETRIES=3`.

#### 2. New config model: `RetryConfig` in `src/config/schema.py:38-41`
- `max_retries: int = 3` — maximum number of attempts.
- `base_delay: float = 1.0` — base delay in seconds for the exponential curve.
- `max_delay: float = 30.0` — upper cap on any single retry delay.
- Added to `OpenAICodexConfig` as `retry: RetryConfig = RetryConfig()` (line 79).
- Added to `ToolsConfig` as `ssh_retry: RetryConfig = RetryConfig(max_retries=2, base_delay=0.5, max_delay=10.0)` (line 51). SSH defaults are more conservative (2 retries, 0.5s base) since SSH failures often indicate persistent issues — retrying too aggressively wastes time.

#### 3. `src/llm/openai_codex.py` — Codex retry overhaul
- Removed module-level `MAX_RETRIES = 3` and `RETRY_BACKOFF = [2, 5, 10]` constants.
- `CodexChatClient.__init__()` (line 24): Now accepts `max_retries`, `retry_base_delay`, `retry_max_delay` kwargs with sensible defaults from the backoff module.
- `_stream_tool_request()` (line 367): All 5 retry sites (empty 200, 429 rate limit, 500-504 server error, aiohttp.ClientError) now use `compute_backoff(attempt, self.retry_base_delay, self.retry_max_delay)` instead of fixed `RETRY_BACKOFF[attempt]`. Log messages updated from `%ds` to `%.1fs` for fractional delay display.
- `_stream_request()` (line 607): Same changes as `_stream_tool_request` — 4 retry sites updated to use `compute_backoff`.
- Both methods use `self.max_retries` instead of the old `MAX_RETRIES` constant, making retry count configurable per client instance.

#### 4. `src/tools/ssh.py` — SSH retry for transient failures
- Added `_SSH_TRANSIENT_EXIT_CODES = frozenset({255})` (line 18): SSH convention — exit code 255 indicates SSH-level (not command-level) failure.
- Added `_SSH_TRANSIENT_PATTERNS` tuple (line 22): 7 known transient failure strings: "Connection refused", "Connection reset", "Connection timed out", "No route to host", "Network is unreachable", "ssh_exchange_identification", "kex_exchange_identification".
- `_is_ssh_transient_failure(exit_code, output)` (line 43): Returns True only when exit code is 255 AND output contains a known transient pattern. This prevents retrying on SSH auth failures (255 + "Permission denied"), which are not transient.
- `run_ssh_command()` (line 79): New params `max_retries=1`, `retry_base_delay=0.5`, `retry_max_delay=10.0`. Default `max_retries=1` means no retry unless callers opt in — backward compatible. The retry loop only fires for `_is_ssh_transient_failure()` results and `asyncio.TimeoutError`. Non-SSH exceptions (OSError, etc.) are NOT retried since they indicate local system problems. Command-level failures (exit != 0 but not 255+transient) are returned immediately — the remote command actually ran and produced a valid result.

#### 5. `src/tools/executor.py:108-118` — Plumbing
- `_exec_command()` now reads `self.config.ssh_retry` and passes `max_retries`, `retry_base_delay`, `retry_max_delay` to `run_ssh_command()`. Local commands via `run_local_command()` are unaffected — they don't have the same transient failure profile as SSH.

#### 6. `src/llm/__init__.py` — Exports
- Added `compute_backoff`, `compute_backoff_no_jitter` to `__all__`.

#### 7. Tests: `tests/test_backoff.py` — 54 tests across 12 test classes
- `TestComputeBackoff` (8): bounds checking for attempts 0/1/5, max_delay cap, custom base, float return, jitter variation, large attempt cap.
- `TestComputeBackoffNoJitter` (6): attempts 0/1/2, max cap, custom base, determinism.
- `TestBackoffDefaults` (3): default constant values.
- `TestRetryConfig` (6): defaults, custom values, on OpenAICodexConfig (default + custom), on ToolsConfig (default + custom).
- `TestCodexClientRetryConfig` (2): default and custom retry params on CodexChatClient.
- `TestIsSSHTransientFailure` (12): all 7 transient patterns at exit 255, exit 255 with non-transient output, exit 1 not transient, exit 0 not transient, exit code set, patterns nonempty.
- `TestSSHRetry` (8): no retry on success, no retry on command failure (exit 127), retry on connection refused (255), exhausted retries, retry on timeout, no retry on exception (OSError), default retry params, backoff called with correct params.
- `TestExecutorSSHRetryConfig` (3): passes retry config, default config values, local command unaffected.
- `TestCodexRetriesUseBackoff` (3): old RETRY_BACKOFF constant gone, old MAX_RETRIES constant gone, compute_backoff imported.
- `TestRetryConfigYAML` (3): ToolsConfig from dict, OpenAICodexConfig from dict, ToolsConfig without retry key.

### Issues found
- The `CostTracker`, `session_tokens` Prometheus source, and `TrajectorySaver` are all still not wired to the bot object. This is a recurring note from Rounds 1-5. Unrelated to this round's scope.
- The `CodexChatClient` constructor now accepts `max_retries`/`retry_base_delay`/`retry_max_delay` but the bot initialization code that creates the client doesn't pass `config.openai_codex.retry` values yet — it will need to when `OdinBot.__init__` is formalized. The defaults match the old behavior (3 retries) but with jittered delays instead of fixed [2, 5, 10].
- SSH retry defaults to `max_retries=1` (no retry) on the function signature for backward compat, but the executor passes `ssh_retry.max_retries=2` from config — so the effective default for tool execution is 2 attempts. Direct callers of `run_ssh_command()` without passing retry params get no retry.

### Next round watch for
- Round 7 (per-tool timeouts) will interact with the retry config in `ToolsConfig`. The `ssh_retry` field and per-tool timeout fields will both live on `ToolsConfig` — ensure they don't conflict semantically. A per-tool timeout should be the total timeout per attempt, not the total across all retries.
- When `OdinBot` initialization is formalized, the `CodexChatClient` constructor should receive `config.openai_codex.retry.max_retries`, `.base_delay`, `.max_delay`.
- The `compute_backoff` function uses `random.uniform` which is not cryptographically secure — this is fine for retry jitter where the goal is decorrelation, not security. No change needed.
- The scheduler's existing exponential backoff in `src/scheduler/scheduler.py:552-558` uses a different formula (`base * 2^n`, no jitter, different cap). It was left unchanged since it serves a different purpose (task retry over minutes/hours) and its defaults are appropriate for that timescale.

## Round 7 — Per-tool timeouts in config instead of a single global timeout
**Focus**: Replace the single `tool_timeout_seconds` global with per-tool timeout overrides via `config.tools.tool_timeouts` dict, falling back to `command_timeout_seconds`.
**Baseline pytest**: 911 passed, 0 failed
**Post-round pytest**: 947 passed, 0 failed (+36 new tests)

### Validated from prior rounds
- Round 1: `CostTracker`, `estimate_tokens`, `LLMResponse` token fields, `/api/usage` endpoints all present and passing (35 tests). `CostTracker` still not wired to bot object — still pending (noted Rounds 1-6).
- Round 2: `Session.estimated_tokens`, `_needs_compaction()`, token metrics all present and passing (41 tests). `session_tokens` Prometheus source still needs wiring — still pending.
- Round 3: `TrajectorySaver`, `TrajectoryTurn`, `ToolIteration`, REST API endpoints all present and passing (53 tests). `trajectory_saver` still needs wiring — still pending.
- Round 4: Trace viewer page, `find_by_message_id()`, API endpoint all present and passing (8 tests).
- Round 5: `AuditLogger.search_logs()`, `get_log_stats()`, `/api/logs/search`, `/api/logs/stats` all present and passing (37 tests).
- Round 6: `compute_backoff`, `RetryConfig`, Codex + SSH retry integration all present and passing (54 tests). Round 6 flagged: "per-tool timeout should be total timeout per attempt, not total across all retries" — addressed: the per-tool timeout is the hard cap on wall-clock time for a single tool invocation in `ToolExecutor.execute()`, consistent with existing behavior. SSH retries within `_exec_command()` use `command_timeout_seconds` per attempt independently.
- All three subsystem wiring tasks remain open: `cost_tracker`, `session_tokens` metrics, `trajectory_saver`.

### Work done

#### 1. `ToolsConfig.tool_timeouts` and `get_tool_timeout()` — `src/config/schema.py:52,59-60`
- Replaced the unused `tool_timeout_seconds: int = 300` field with `tool_timeouts: dict[str, int] = Field(default_factory=dict)` — a mapping of tool name → timeout in seconds. Empty by default (all tools use `command_timeout_seconds`).
- Added `get_tool_timeout(tool_name: str) -> int` method: returns the per-tool override if present, otherwise falls back to `command_timeout_seconds`. This is the single lookup point for all timeout consumers.
- Config YAML example: `tools: { tool_timeouts: { claude_code: 600, read_file: 30 } }`.

#### 2. `ToolExecutor.execute()` per-tool timeout — `src/tools/executor.py:64`
- Changed from `timeout = self.config.command_timeout_seconds` to `timeout = self.config.get_tool_timeout(tool_name)`. The timeout is now per-tool, used in `asyncio.wait_for(coro, timeout=timeout)`.
- The `_exec_command()` method at line 107 still uses `self.config.command_timeout_seconds` for SSH/subprocess per-attempt timeout — this is intentional: the outer per-tool timeout is the hard cap, while the inner command timeout is per SSH attempt.
- Error messages on timeout now correctly reflect the per-tool timeout value: `"timed out after {timeout}s"`.

#### 3. Agent manager per-tool timeouts — `src/agents/manager.py:112,160,397,486-493`
- `spawn()` now accepts `tool_timeouts: dict[str, int] | None = None` parameter. Passed through to `_run_agent()`.
- `_run_agent()` now accepts `tool_timeouts: dict[str, int] | None = None` parameter.
- Tool execution within agents now uses `(tool_timeouts or {}).get(tool_name, TOOL_EXEC_TIMEOUT)` instead of the hardcoded `TOOL_EXEC_TIMEOUT`. This means:
  - Tools with per-tool overrides use their custom timeout.
  - Tools without overrides fall back to `TOOL_EXEC_TIMEOUT` (300s), preserving existing behavior.
  - The `TOOL_EXEC_TIMEOUT` constant is NOT removed — it serves as the default for agent tool execution when no per-tool config is available.

#### 4. Skill manager per-tool timeouts — `src/tools/skill_manager.py:385,400,917-921,931`
- `SkillManager.__init__()` now accepts `tool_timeouts: dict[str, int] | None = None` parameter, stored as `self._tool_timeouts`.
- Skill execution timeout now uses `self._tool_timeouts.get(tool_name, SKILL_EXECUTE_TIMEOUT)` instead of the hardcoded `SKILL_EXECUTE_TIMEOUT`. User-created skills can have custom timeouts via config.
- The `SKILL_EXECUTE_TIMEOUT` constant (120s) is preserved as the default for skills without overrides.

#### 5. REST API: `/api/tools/timeouts` GET + PUT — `src/web/api.py:619-653`
- `GET /api/tools/timeouts`: returns `{"default_timeout": N, "overrides": {...}}`.
- `PUT /api/tools/timeouts`: accepts `{"overrides": {...}, "default_timeout": N}` (both optional). Validates all timeout values are positive numbers. Updates `bot.config.tools.tool_timeouts` and/or `bot.config.tools.command_timeout_seconds` in place. Returns the updated state.
- Input validation: rejects negative/zero values, non-dict overrides, non-numeric types.

#### 6. `/api/tools` now includes `timeout` — `src/web/api.py:605-615`
- Each tool in the `GET /api/tools` response now includes a `"timeout"` field showing the effective timeout for that tool (per-tool override or global default).

#### 7. Tests: `tests/test_tool_timeouts.py` — 36 tests across 9 test classes
- `TestToolsConfigToolTimeouts` (5): default empty, custom values, old field removed, from dict, explicit empty.
- `TestGetToolTimeout` (5): no overrides, override returns custom, non-overridden returns default, multiple overrides, custom default.
- `TestExecutorPerToolTimeout` (5): uses per-tool timeout, uses global for unconfigured, timeout error message with per-tool value, timeout message with global, metrics on timeout.
- `TestAgentPerToolTimeout` (3): spawn accepts tool_timeouts, agent uses per-tool timeout, agent uses default without override.
- `TestSkillManagerPerToolTimeout` (2): accepts tool_timeouts, default empty timeouts.
- `TestConfigYAMLCompat` (5): without tool_timeouts, with tool_timeouts, full Config with, full Config without, model_dump includes.
- `TestToolTimeoutsAPI` (7): GET timeouts, PUT overrides, PUT default, invalid override rejected, invalid default rejected, non-dict rejected, list tools includes timeout.
- `TestExecutorConfigIntegration` (2): reads config, config change reflected immediately.
- `TestBackwardCompat` (2): tool_timeout_seconds not present, command_timeout_seconds still works.

### Issues found
- The `CostTracker`, `session_tokens` Prometheus source, and `TrajectorySaver` are all still not wired to the bot object. This is a recurring note from Rounds 1-6. Unrelated to this round's scope.
- The `SkillManager` and `AgentManager.spawn()` need to receive `config.tools.tool_timeouts` from their callers when wired into the bot. Currently `SkillManager` defaults to empty dict if not passed, and `AgentManager.spawn()` defaults to `None` (falls back to `TOOL_EXEC_TIMEOUT`). The wiring will happen when bot initialization is formalized.
- The `PUT /api/tools/timeouts` endpoint modifies `bot.config.tools` in place but does NOT persist to `config.yml`. For persistence, use `PUT /api/config` which writes to disk. This is consistent with other runtime-adjustable settings.
- The per-tool timeout in `ToolExecutor.execute()` is the total wall-clock cap including any internal retries (SSH retries from Round 6). The SSH per-attempt timeout within `_exec_command()` remains `command_timeout_seconds`. This means a tool with `tool_timeouts: {run_command: 60}` will abort the entire invocation after 60s, even if SSH retries haven't been exhausted. This is the correct semantic: per-tool timeout is a hard cap.

### Next round watch for
- Round 8 (bulkhead isolation) should ensure that per-tool timeouts integrate with the isolation model. Tool failures should not cascade — the per-tool timeout already provides per-tool isolation at the time dimension, but bulkhead isolation should add resource (connection/concurrency) isolation.
- When `OdinBot` initialization is formalized, `SkillManager` should receive `config.tools.tool_timeouts`, and `AgentManager.spawn()` callers should pass `config.tools.tool_timeouts`.
- The `PUT /api/tools/timeouts` allows runtime timeout changes that take effect immediately (since `ToolExecutor.execute()` reads from `config` on each call). This is powerful but unsaved to disk — a restart resets to config.yml values.
- The `_exec_command()` in executor.py still uses `command_timeout_seconds` as the SSH per-attempt timeout. If a per-tool timeout is shorter than `command_timeout_seconds`, the outer `asyncio.wait_for` in `execute()` will cancel the inner SSH before the SSH-level timeout fires. This is correct behavior.
- All three subsystem wiring tasks remain open from Rounds 1-6: `cost_tracker`, `session_tokens` metrics, `trajectory_saver`.

## Round 8 — Bulkhead isolation: SSH failures isolated from Codex; tool failures isolated from message handler
**Focus**: Add semaphore-based concurrency limiters (bulkheads) per resource category so SSH/subprocess/browser failures cannot cascade across categories. Fix planner gather isolation.
**Baseline pytest**: 947 passed, 0 failed
**Post-round pytest**: 996 passed, 0 failed (+49 new tests)

### Validated from prior rounds
- Round 1: `CostTracker`, `estimate_tokens`, `LLMResponse` token fields, `/api/usage` endpoints all present and passing (35 tests). `CostTracker` still not wired to bot object — still pending (noted Rounds 1-7).
- Round 2: `Session.estimated_tokens`, `_needs_compaction()`, token metrics all present and passing (41 tests). `session_tokens` Prometheus source still needs wiring — still pending.
- Round 3: `TrajectorySaver`, `TrajectoryTurn`, `ToolIteration`, REST API endpoints all present and passing (53 tests). `trajectory_saver` still needs wiring — still pending.
- Round 4: Trace viewer page, `find_by_message_id()`, API endpoint all present and passing (8 tests).
- Round 5: `AuditLogger.search_logs()`, `get_log_stats()`, `/api/logs/search`, `/api/logs/stats` all present and passing (37 tests).
- Round 6: `compute_backoff`, `RetryConfig`, Codex + SSH retry integration all present and passing (54 tests).
- Round 7: `ToolsConfig.tool_timeouts`, `get_tool_timeout()`, executor/agent/skill per-tool lookup, REST API all present and passing (36 tests). Round 7 flagged: "bulkhead isolation should add resource (connection/concurrency) isolation" — done: three bulkheads (ssh/subprocess/browser) with independent semaphores.
- All three subsystem wiring tasks remain open: `cost_tracker`, `session_tokens` metrics, `trajectory_saver`.

### Work done

#### 1. New module: `src/tools/bulkhead.py`
- `BulkheadFullError` (line 20): Exception raised when a bulkhead's queue is full. Includes bulkhead name for diagnostics.
- `Bulkhead` class (line 30): Semaphore-based concurrency limiter with observability.
  - `__init__(name, max_concurrent, max_queued)`: max_concurrent controls the semaphore size; max_queued caps how many requests can wait (0 = unlimited queuing, no rejection).
  - `acquire()` async context manager (line 82): acquires a semaphore slot. Rejects with `BulkheadFullError` if queue is full. Tracks active/queued/total/rejected/errors counts.
  - `get_metrics()` (line 103): returns dict with all counters for Prometheus/observability.
- `BulkheadRegistry` class (line 113): Named collection of bulkheads for different resource categories.
  - `register(name, max_concurrent, max_queued)`: creates and stores a bulkhead.
  - `get(name)`: returns bulkhead by name, or None.
  - `get_or_create(name, max_concurrent, max_queued)`: idempotent registration.
  - `get_all_metrics()`: returns per-bulkhead metrics dict.
  - `get_prometheus_metrics()`: returns flattened dict for the Prometheus collector.

#### 2. Config: `BulkheadConfig` in `src/config/schema.py:46-52`
- `ssh_max_concurrent: int = 10` — max simultaneous SSH connections.
- `subprocess_max_concurrent: int = 20` — max simultaneous local subprocesses.
- `browser_max_concurrent: int = 3` — max simultaneous browser operations.
- `ssh_max_queued: int = 20` — max SSH requests waiting in queue before rejection.
- `subprocess_max_queued: int = 40` — max subprocess requests waiting.
- `browser_max_queued: int = 6` — max browser requests waiting.
- Added to `ToolsConfig` as `bulkhead: BulkheadConfig = BulkheadConfig()` (line 63).

#### 3. `ToolExecutor` bulkhead integration — `src/tools/executor.py`
- `_build_bulkhead_registry(config)` (line 46): factory function that creates a `BulkheadRegistry` with three bulkheads from config values.
- `ToolExecutor.__init__()` (line 61): now creates `self.bulkheads` via `_build_bulkhead_registry()`.
- `_exec_command()` (line 100): wraps SSH calls in the `ssh` bulkhead and local subprocess calls in the `subprocess` bulkhead. When a bulkhead is full, returns `(1, "Error: ... bulkhead full")` instead of raising — the executor's `execute()` error handler catches this gracefully.
- `_browser_with_bulkhead()` (line 273): helper method wrapping browser coroutines in the `browser` bulkhead. Returns error string on rejection instead of raising.
- All 5 browser handler methods (`_handle_browser_read_page`, `_handle_browser_read_table`, `_handle_browser_click`, `_handle_browser_fill`, `_handle_browser_evaluate`) now wrap their calls through `_browser_with_bulkhead()`.

#### 4. Planner gather isolation — `src/odin/planner.py:119-130`
- Changed `asyncio.gather(*tasks)` to `asyncio.gather(*tasks, return_exceptions=True)`. Previously, if any parallel step raised an unhandled exception, the entire gather would cancel all sibling tasks. Now exceptions are collected as results.
- Added post-gather unpacking: `BaseException` results are converted to `StepResult(status=FAILED, error=...)`. Normal `(step_id, StepResult)` tuples pass through unchanged.
- This ensures one step's crash does not prevent sibling steps from completing.

#### 5. Prometheus metrics — `src/health/metrics.py:317-368`
- Added `bulkheads` source rendering with three metric families:
  - `odin_bulkhead_count` (gauge): number of registered bulkheads.
  - `odin_bulkhead_active{bulkhead="..."}` (gauge): current active operations per bulkhead.
  - `odin_bulkhead_rejected_total{bulkhead="..."}` (counter): rejected requests per bulkhead.
  - `odin_bulkhead_operations_total{bulkhead="..."}` (counter): total operations per bulkhead.
- Follows the same pattern as existing per-label metrics (cost_tracker, session_tokens).

#### 6. REST API endpoint — `src/web/api.py:662-668`
- `GET /api/tools/bulkheads`: returns per-bulkhead metrics (active, queued, total, rejected, errors, max_concurrent, max_queued). Returns 503 if executor not available.

#### 7. Tests: `tests/test_bulkhead.py` — 49 tests across 11 test classes
- `TestBulkhead` (7): acquire/release, concurrent limit enforcement, rejection when queue full, error tracking, metrics, properties, unlimited queuing.
- `TestBulkheadRegistry` (8): register/get, get_missing, get_or_create (new + existing), names, get_all_metrics, get_prometheus_metrics, empty registry.
- `TestBulkheadFullError` (1): error message contains bulkhead name.
- `TestBulkheadConfig` (6): defaults, custom, on ToolsConfig (default + custom), from dict, without bulkhead key.
- `TestExecutorBulkheadIntegration` (8): executor has registry, creates three bulkheads, config applied, SSH uses bulkhead, local uses subprocess bulkhead, SSH bulkhead full returns error, subprocess bulkhead full returns error, browser bulkhead wraps handler.
- `TestPlannerGatherIsolation` (3): step exception doesn't crash gather, parallel steps both recorded, failed step cascades to dependents.
- `TestBulkheadPrometheusMetrics` (5): metrics rendered, absent, empty registry, update after operations, rejected metrics.
- `TestBulkheadAPI` (2): GET bulkheads, unavailable returns 503.
- `TestBuildBulkheadRegistry` (2): from default config, from custom config.
- `TestConfigRoundTrip` (3): full Config with bulkhead, without bulkhead, model_dump includes bulkhead.
- `TestIsolationSemantics` (4): SSH errors don't block local, SSH bulkhead tracks errors, separate bulkheads independent, tool execute catches bulkhead error.

### Issues found
- The `CostTracker`, `session_tokens` Prometheus source, and `TrajectorySaver` are all still not wired to the bot object. This is a recurring note from Rounds 1-7. Unrelated to this round's scope.
- The `bulkheads` Prometheus source needs to be registered on the `HealthServer.metrics` collector: `metrics.register_source("bulkheads", executor.bulkheads.get_prometheus_metrics)`. This wiring will happen when bot initialization is formalized.
- The `_exec_command()` bulkhead wrapping catches `BulkheadFullError` and returns `(1, "Error: ...")`. This means the error is treated as a command failure, not a tool failure — the LLM will see it as a command that returned exit code 1 with an error message. This is the correct semantic for the LLM to understand the resource is congested.
- Browser bulkhead is applied inside handler methods (after the `_browser_manager` check). If browser automation is disabled, the bulkhead is never touched — no wasted semaphore slots.

### Next round watch for
- Round 9 (SSH connection pooling) should be aware that bulkheads already cap SSH concurrency at 10. Connection pooling should work within the bulkhead — the pool manages connections, the bulkhead manages concurrency. They are complementary: the pool reuses connections, the bulkhead prevents new connections from being opened when the system is overloaded.
- The `BulkheadConfig` defaults (ssh=10, subprocess=20, browser=3) are conservative. Production deployments with many hosts or heavy tool usage may need higher limits. The config is fully customizable via `config.yml`: `tools: { bulkhead: { ssh_max_concurrent: 30 } }`.
- The `max_queued` values (ssh=20, subprocess=40, browser=6) mean that at most `max_concurrent + max_queued` operations can be pending per category. Beyond that, requests are rejected immediately with an error message. Setting `max_queued: 0` disables rejection (unlimited queuing).
- The planner `asyncio.gather` fix in `src/odin/planner.py:119-130` converts unhandled `BaseException`s (not just `Exception`) into FAILED steps. This correctly handles `asyncio.CancelledError` (BaseException subclass) — a cancelled step is recorded as failed, not silently dropped.
- All three subsystem wiring tasks remain open from Rounds 1-7: `cost_tracker`, `session_tokens` metrics, `trajectory_saver`.
