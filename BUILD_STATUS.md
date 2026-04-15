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
| 4 | Trace viewer web UI page: given a message id, render the full tool chain with timings and outputs | pending | |
| 5 | Log filter UI: server-side search / time-range / level filtering on the Logs page | pending | |

### Phase 2 — Reliability hardening (rounds 6–10)
| # | Focus | Status | Summary |
|---|-------|--------|---------|
| 6 | Exponential backoff with jitter on Codex and SSH retries (replace fixed [2s,5s,10s] ladder) | pending | |
| 7 | Per-tool timeouts in `config.yml` instead of a single global tool_timeout_seconds | pending | |
| 8 | Bulkhead isolation: SSH failures must not cascade into Codex; tool failures isolated from message handler | pending | |
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
