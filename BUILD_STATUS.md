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
| 2 | Token-budget awareness: track running tokens per session, expose in `/metrics`, auto-compact when budget exceeded | pending | |
| 3 | Trajectory saving: dump every message's full turn (prompt, all tool calls, final response) as JSONL under `data/trajectories/` | pending | |
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
