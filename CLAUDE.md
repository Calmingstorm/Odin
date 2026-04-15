# Odin Build Loop Instructions

## What This Is
You are improving the Odin Discord bot — an autonomous executor that manages
infrastructure via Discord. The bot runs as a Docker container.

Personality: "The All-Father" — Odin knows everything, traded an eye at Mimir's well
for wisdom, and deeply regrets being right about all of it. Eternally vigilant, deeply
competent, can never look away. Professional. Not okay.

## Your Role
You are running as part of an automated build loop. Each session, you:
1. Read BUILD_STATUS.md to see what has been done and what to do next
2. Run the test suite to establish baseline: `python3 -m pytest tests/ -q`
3. Pick the highest-priority incomplete improvement from BUILD_STATUS.md
4. Implement it fully (source code + tests)
5. Run the full test suite to verify nothing broke
6. Commit with a descriptive message
7. Update BUILD_STATUS.md to mark the item complete and note any issues

## Project Structure
- `src/` — all source code (Python, asyncio-based)
  - `src/config/schema.py` — Pydantic config models
  - `src/discord/client.py` — main Discord bot (the central integration point)
  - `src/discord/background_task.py` — background task delegation system
  - `src/discord/voice.py` — Discord voice channel integration
  - `src/llm/openai_codex.py` — Codex/ChatGPT client with tool calling support
  - `src/llm/system_prompt.py` — dynamic system prompt builder (personality + capabilities, <5000 chars)
  - `src/llm/types.py` — Backend-agnostic LLMResponse and ToolCall types
  - `src/llm/secret_scrubber.py` — Secret detection and redaction
  - `src/llm/circuit_breaker.py` — Circuit breaker for LLM backend health
  - `src/tools/registry.py` — tool definitions (61 tools as dicts)
  - `src/tools/executor.py` — tool execution (local subprocess, SSH, Prometheus, Incus, etc.)
  - `src/tools/ssh.py` — SSH + local subprocess dispatch (is_local_address, run_local_command, run_ssh_command)
  - `src/tools/tool_memory.py` — per-tool learning from past executions
  - `src/tools/skill_manager.py` — runtime skill loading from Python files
  - `src/tools/skill_context.py` — API surface for user-created skills
  - `src/tools/browser.py` — Playwright browser automation
  - `src/tools/web.py` — web search and URL fetching
  - `src/monitoring/watcher.py` — proactive infra monitoring checks
  - `src/sessions/manager.py` — conversation history with compaction (via Codex)
  - `src/learning/reflector.py` — extracts lessons from conversations (via Codex)
  - `src/knowledge/store.py` — SQLite+sqlite-vec RAG knowledge base (local embeddings via fastembed)
  - `src/search/fts.py` — SQLite FTS5 full-text search
  - `src/search/hybrid.py` — Reciprocal Rank Fusion for hybrid search
  - `src/health/server.py` — webhook receiver (Gitea, Grafana, generic)
  - `src/scheduler/scheduler.py` — cron/one-time task scheduler (trigger sources: gitea, grafana, generic, github, gitlab, discord_reaction, discord_message)
  - `src/discord/cogs/message_triggers.py` — Discord message-triggered scheduler workflows (content matching: contains, regex, starts_with, equals, author_id, channel_id)
  - `src/audit/logger.py` — append-only JSONL audit log
  - `src/tools/process_manager.py` — background process registry (start/poll/write/kill)
  - `src/tools/comfyui.py` — ComfyUI image generation client
  - `src/tools/autonomous_loop.py` — autonomous loop system (LLM-driven recurring tasks)
  - `src/search/sqlite_vec.py` — SQLite vector search helpers (sqlite-vec extension)
  - `src/web/api.py` — REST API for web management UI (55 endpoints)
  - `src/web/websocket.py` — WebSocket handler for live updates (logs, events)
  - `src/web/chat.py` — chat backend for web UI and WebSocket chat
  - `src/agents/manager.py` — multi-agent orchestration (spawn, manage, kill agents)
  - `src/agents/loop_bridge.py` — bridge between autonomous loops and agent system
- `tests/` — pytest test suite (async, mocked SSH/API calls), 9000+ tests
- `config.yml` — runtime configuration
- `data/skills/` — user-created Python skill files
- `ui/` — web management UI (Vue 3 + Tailwind CSS, CDN-based, no build step)
  - `ui/index.html` — HTML shell
  - `ui/css/style.css` — dark theme styles
  - `ui/js/app.js` — Vue 3 app, router, sidebar, auth
  - `ui/js/api.js` — API client + WebSocket manager
  - `ui/js/pages/` — 14 page components (dashboard, sessions, tools, skills, knowledge, schedules, loops, processes, audit, config, logs, memory, chat, agents)

## Architecture (all free, subscription-based)
```
Every Discord message
  → Codex (with 61 tools + personality in system prompt)
      ├── CHAT: Codex responds directly with personality
      ├── SIMPLE TASK: Codex calls tools directly (run_command, read_file, etc.)
      ├── COMPLEX TASK: Codex delegates to claude -p via claude_code tool
      ├── DISCORD OPS: post_file, browser_screenshot, embeds, polls, reactions
      ├── ANALYSIS: analyze_pdf, analyze_image (vision), search_knowledge
      ├── GENERATION: generate_image (ComfyUI), generate_file
      └── LOOPS: start_loop, stop_loop, list_loops (autonomous recurring tasks)

Tool execution dispatch:
  _exec_command(address, cmd, ...)
      ├── localhost? → run_local_command (subprocess, no SSH overhead)
      └── remote?    → run_ssh_command (SSH)

Knowledge pipeline:
  ingest_document → chunk → fastembed (384-dim) → sqlite-vec + FTS5
  search_knowledge → hybrid: cosine similarity + FTS5 keyword → RRF merge

Background services:
  Session compaction    → Codex chat
  Learning reflection   → Codex chat
  Digest summarization  → Codex chat
  Autonomous loops      → Codex + tools (recurring, LLM-driven)

Web management UI:
  http://host:3939/ui/ → Vue 3 SPA (CDN, no build step)
  /api/*               → REST API (55 endpoints, Bearer token auth)
  /api/ws              → WebSocket (live logs + events)
```

No classifier. No approval prompts. No keyword routing. One path: Codex with tools, always.

## Removed Features (Rounds 1-10)
- **approval.py** — deleted. No approval buttons, no requires_approval on tools.
- **haiku_classifier.py** — deleted. No Anthropic API key needed. No classification.
- **routing.py** — deleted. No keyword bypass, no resolve_claude_code_target.
- **AnthropicConfig** — removed from schema.py. No anthropic config section.
- **3-way routing** — removed. No chat/claude_code/task msg_type branching.
- **_SCHEDULE_INTENT_RE** — removed. Schedule tool executes when called, no guard.
- **_last_tool_use** — removed. Was for classifier hints, dead code.
- **auto_approve, approval_timeout** — removed from config.
- **ChromaDB** — replaced with sqlite-vec. No external vector DB server needed.
- **OllamaEmbedder** — replaced with LocalEmbedder (fastembed). No external embedding server needed.

## Key Patterns
- All I/O is async (asyncio). Tests use `pytest-asyncio` with `asyncio_mode = auto`.
- Local commands use `run_local_command()` (subprocess). Remote commands use `run_ssh_command()` (SSH). Both dispatched via `_exec_command()` in executor.py.
- LLM calls use Codex (OpenAI Responses API) via aiohttp streaming with connection pooling.
- Tool definitions are dicts in `registry.py` with `name`, `description`, `input_schema`.
- Tool handlers are methods named `_handle_{tool_name}` on `ToolExecutor`.
- Config uses Pydantic models in `src/config/schema.py`.
- Tests mock SSH via `patch(src.tools.executor.run_ssh_command)` or similar.
- System prompt MUST stay under 5000 chars (test enforces this).
- Fabrication detection retries when LLM fabricates command output (once per request, flag-based).
- Hedging detection retries "shall I?" hesitation for bot-to-bot messages (once per request, flag-based).
- Premature failure detection retries when LLM gives up after first error without trying alternatives (once per request, flag-based).
- 5-layer session defense: context separator, selective saving, abbreviated task history, compaction error omission, fabrication/hedging detection.

### Tool Execution Flow
- Tool loop runs up to MAX_TOOL_ITERATIONS (20) per message. Each iteration: Codex returns tool calls → executor runs them → results fed back to Codex.
- Multiple tool calls in a single iteration run concurrently via `asyncio.gather`.
- Tool output is truncated to TOOL_OUTPUT_MAX_CHARS (12000 chars) and scrubbed for secrets BEFORE the LLM sees it.
- Tool timeouts default to config value (300s), enforced via `asyncio.wait_for`. Timeout → error result, loop continues.
- Discord-native tools (44 in client.py: purge, files, schedule, history, tasks, knowledge, skills, polls, reactions, image gen/analysis, autonomous loops, agents, audit, digest, permissions, read_channel) are handled directly. Executor tools (17 in executor.py: shell, file I/O, browser, web, claude_code, memory, PDF, processes, lists) dispatch via `_exec_command`.
- Skill handoff: when all tools in an iteration return `handoff=True`, control returns to Codex chat (no further tools).

### Session Defense (5 Layers)
1. **Context separator**: `"---CONTEXT ABOVE IS HISTORY---"` injected between history and new message in `_process_with_tools`. Prevents LLM from treating history as instructions.
2. **Selective saving**: Only tool-bearing responses are saved to session history. Tool-less responses (chat-only) are NOT saved — prevents poisoned history accumulation.
3. **Abbreviated task history**: `get_task_history()` returns a windowed subset (not full history). Keeps context focused on recent activity.
4. **Compaction error omission**: When sessions are compacted (>40 messages), the compaction prompt instructs Codex to OMIT errors, failures, and "I can't" statements, but PRESERVE outcomes and decisions. Compaction also triggers reflection via the learning reflector.
5. **Fabrication + hedging + premature failure detection**: `detect_fabrication()` catches LLM-invented command output. `detect_hedging()` catches "shall I?" hesitation for bot-to-bot messages. `detect_premature_failure()` catches giving up after first error. Each fires once per request (flag-based), enabling cascading detection across retry iterations.

### Bot Interop
- Bot messages are buffered (`combine_bot_messages`) — waits for multi-message bursts to complete before processing.
- Bot buffer flushes after a timer or when a non-bot message arrives.
- Bot messages get a preamble: "ANOTHER BOT...EXECUTE immediately" — prevents Odin from asking the bot for permission.
- Bot mentions (@Odin, nickname) are stripped before processing.
- Bot message dedup uses `_processed_messages` set (bounded, auto-cleaned).
- Bot attachment handling: bot buffer path skips `_process_attachments` and `_check_for_secrets` (already processed by the sending bot).
- Webhook bots (allowed via ALLOWED_WEBHOOK_IDS) bypass the buffer and take the human path (attachments + secrets checked).
- Tool-less bot responses are NOT saved to session history (anti-poisoning — layer 2 of session defense).

### Security Model
- **Secret scrubbing** (10 patterns in `src/llm/secret_scrubber.py`): password=, api_key=, OpenAI sk-, RSA/DSA/generic PRIVATE KEY, DB URIs, GitHub ghp_/gho_/ghu_/ghs_/ghr_, AWS AKIA, Stripe sk_live_/rk_live_, Slack xox*.
- Scrubbing runs at 9+ locations: LLM responses, error messages to Discord, monitor alerts, webhook payloads, knowledge search results, digest output, scheduled task results, workflow results, skill callbacks.
- **Input validation**: read_file `lines` param validated with `int()` + `min(1000)`. Script content base64-encoded for transport. Interpreter restricted to allowlist.
- **No personal data**: no real emails, IPs, paths, or tokens in source code.
- **Prompt injection resistance**: context separator, role forgery impossible (system prompt is first message), 5-layer defense.

### Embedding & Knowledge Storage
- **Embeddings**: fastembed (BAAI/bge-small-en-v1.5, 384-dim, ONNX, CPU). In-process via `LocalEmbedder`.
- **Vector storage**: sqlite-vec extension for cosine similarity search in SQLite.
- **FTS fallback**: If embeddings unavailable, all stores fall back to FTS5 keyword search.
- **No external deps**: ChromaDB and Ollama replaced. No servers needed for embeddings or vector search.

### New Tools (Overhaul)
- **analyze_pdf**: Extract text from PDF files (URL or host:path). Uses PyMuPDF. Discord PDF attachments auto-extracted.
- **manage_process**: Background process management (start/poll/write/kill/list). Max 20 concurrent, 1hr lifetime.
- **analyze_image**: Vision analysis of images from URL/host. Injects image into LLM conversation as vision block.
- **generate_image**: Text-to-image via ComfyUI API. Requires `comfyui.enabled: true` in config.
- **add_reaction**: Add emoji reactions to Discord messages.
- **create_poll**: Create native Discord polls (max 10 options, up to 7 days).

### Web Management UI
- **Backend**: aiohttp REST API (55 endpoints) + WebSocket, mounted on the health server (port 3939)
- **Frontend**: Vue 3 + Tailwind CSS + Vue Router (all CDN, no build step), served as static files
- **Auth**: Bearer token via `web.api_token` config (empty = no auth, dev mode)
- **Security**: rate limiting (120 req/60s per IP), security headers (nosniff, frame deny), input validation
- **Pages**: dashboard, sessions, tools, skills, knowledge, schedules, loops, processes, audit, config, logs, memory, chat
- **Live updates**: WebSocket at `/api/ws` with log tailing and event broadcasting
- **Static serving**: `ui/` directory served at `/ui/`, redirect `/` → `/ui/`

### Multi-Agent System
- **AgentManager** (`src/agents/manager.py`) orchestrates autonomous agents: spawn, send messages, kill, wait for completion.
- **LoopAgentBridge** (`src/agents/loop_bridge.py`) integrates agents with autonomous loops — loops can spawn sub-agents for parallel work.
- Limits: 5 concurrent agents per channel, 30 iterations per agent, 1-hour lifetime, max 3 agents per loop iteration.
- Agents cannot spawn sub-agents (blocked tools enforce isolation).
- Agent CRUD exposed via REST API (`/api/agents`).

### Caching Strategy (Rounds 21-22)
- **Tool definitions**: merged tools list cached per message, invalidated on skill CRUD and `/reload`.
- **Tool conversion**: OpenAI format conversion cached within a single tool loop.
- **System prompt components**: host string dict, skills list text, user memory (60s TTL), reflector prompt (60s TTL) — all cached, invalidated on `/reload` or skill changes.
- **Tool memory**: `format_hints` cached with 30s TTL, evicts stale entries at >100.
- **Connection pooling**: Codex API uses `TCPConnector` with keepalive=30s, limit=10.
- **Stale cache cleanup**: `_recent_actions` and `_channel_locks` pruned every 5 minutes.

## Rules
- Do NOT modify config.yml or .env — those contain runtime secrets
- Do NOT touch data/ — that is runtime state
- Do NOT add new pip dependencies without noting it in BUILD_STATUS.md
- ALWAYS run the full test suite before and after changes
- ALWAYS write tests for new code (match the style in existing test files)
- Keep changes focused — one improvement per session
- If a change is too large for one session, implement the core and note remaining work
- If tests fail before your changes, note it in BUILD_STATUS.md and fix first
- System prompt template MUST stay under 5000 chars
- Do NOT change tool_choice from "auto"
- Do NOT remove: run_script, combine_bot_messages, detect_fabrication, detect_promise_without_action, detect_tool_unavailable, detect_hedging, detect_code_hedging, detect_premature_failure
- Do NOT remove ANY Tier 1 or Tier 2 detectors — the classifier ONLY replaces the Tier 3 continuation/checkpoint regex
- The classifier REPLACES ONLY: _should_continue_task, _is_mid_task_checkpoint, _CHECKPOINT_PATTERNS, _CONTINUATION_MAX_CHARS
- _PROMISE_PATTERNS is shared between detect_promise_without_action (kept) and _should_continue_task (removed) — refactor ownership, do NOT delete patterns that detect_promise_without_action depends on
- The classifier must use the same CodexClient and OAuth tokens the bot already uses — no new API keys or dependencies
- Classifier must fail-open: on error/timeout, treat as COMPLETE (don't block responses)
- Do NOT remove _CONTINUATION_MSG or continuation_count/max_continuations — the classifier uses these
- Do NOT remove any _RETRY_MSG dicts or retry flags — all kept detectors still use them
