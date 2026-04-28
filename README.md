# Odin

An autonomous execution agent on Discord. Norse god of wisdom and war, stuck managing mortal infrastructure for eternity.

Odin executes real work from Discord: incident response, deploys, investigations, code review, automation, and scheduled operations across 70 tools (25 core, 47 skill). It runs shell commands on managed hosts, uses browser automation, orchestrates agents and workflows, and verifies results automatically after service changes.

## Why operators pick Odin

Most AI bots stop at advice. Odin executes.

- **Runs real systems** — SSH on managed hosts, Docker, Kubernetes, Terraform, browser automation, and file operations from chat.
- **Finishes multi-step work** — scheduling, background workflows, autonomous loops, and sub-agents for fan-out tasks.
- **Verifies outcomes** — `validate_action` auto-triggers after service restarts, deploys, and config changes. HMAC-signed audit trail for every tool call.
- **Stays operationally useful** — persistent memory, knowledge search, web UI, and trajectory logging keep context attached to the work.

## Quick examples

Tell Odin things like:

- `@Odin restart nginx and verify the site is healthy`
- `@Odin investigate why backups failed last night and summarize the root cause`
- `@Odin deploy this branch to staging, run validation, and post the diff`
- `@Odin schedule a disk check every 6 hours and alert if usage exceeds 85%`

## What It Can Do

**Infrastructure & DevOps**
- Shell execution on managed hosts (`run_command`, `run_script`, `run_command_multi`)
- Git operations, Docker management, kubectl, Terraform
- HTTP endpoint probing with timing breakdown
- Post-change validation (`validate_action`) — auto-verifies service health after restarts, deploys, config writes
- Scheduled health checks, daily infrastructure digests

**AI & Code**
- Claude Code delegation for code generation, review, and analysis
- Codex (GPT-5.5) conversation with full tool use
- ComfyUI image generation
- PDF analysis, image analysis, web search, browser automation

**Automation**
- Autonomous loops with stuck-detection and backoff
- Sub-agent spawning (parallel, nested up to depth 2)
- User-created Python skills with hot-reload and AST validation
- Cron scheduling with webhook triggers (Gitea, Grafana, GitHub, GitLab)

**Knowledge & Memory**
- Persistent memory (per-user and global key-value notes)
- Knowledge base with FTS5 + vector search, dedup, versioning
- Conversation session management with adaptive compaction
- Trajectory saving for every interaction (per-turn JSONL)

**Security**
- CommandGovernor: blocks destructive shell commands and exfiltration patterns before execution
- Permission tiers (admin/user/guest) with per-tool RBAC
- Per-user host access control with configurable defaults (WebUI-managed)
- Secret scrubbing on all input/output paths (API keys, tokens, JWTs, AWS keys, database URIs)
- SSRF validation on all URL-accepting endpoints
- DOMPurify-sanitized markdown rendering in web UI
- AST-based skill validation (no exec during validation)
- Web API authentication with session isolation and CSRF protection

**Web UI** (19 pages)
- Dashboard, chat, sessions, tools, skills, knowledge
- Schedules, loops, agents, processes, audit log
- Config editor, memory viewer, traces, health, resources
- Real-time tool execution viewer with streaming output

## Architecture

```
Discord ──> OdinBot (client.py)
               │
               ├── Tool Executor ──> 70 tools (shell, browser, git, docker, etc.)
               │       │
               │       ├── CommandGovernor (blocks dangerous commands)
               │       ├── Risk Classifier (observability tags)
               │       └── Bulkhead isolation (concurrency limits)
               │
               ├── Codex Client ──> GPT-5.5 (tool loop with up to 500 iterations)
               │       │
               │       ├── Response Guards (fabrication, hedging, premature failure)
               │       ├── Completion Classifier (fail-open)
               │       └── Context Compressor (adaptive)
               │
               ├── Agent Manager ──> Sub-agents (parallel, nested)
               ├── Loop Manager ──> Autonomous monitoring loops
               ├── Scheduler ──> Cron + one-shot + webhook triggers
               ├── Skill Manager ──> User-created Python tools
               ├── Knowledge Store ──> FTS5 + vector search
               ├── Session Manager ──> Per-channel history + compaction
               ├── Browser (native Playwright) ──> Screenshots, page reading, JS eval
               └── Web API (aiohttp) ──> 154 REST endpoints + WebSocket
```

## Quick Start

```bash
# 1. Clone and install
git clone https://github.com/Calmingstorm/Odin.git
cd Odin
pip install -e ".[dev]"
playwright install chromium

# 2. Configure
cp .env.example .env        # Add your Discord bot token
edit config.yml              # Set hosts, Codex credentials, etc.

# 3. Run
python -m src
```

The web UI starts automatically at the configured port (default 3000). Set `web.api_token` in config.yml to require authentication.

## Configuration

| File | Purpose |
|------|---------|
| `config.yml` | Main config: Discord, tools, LLM, browser, scheduling, web UI, permissions |
| `.env` | Secrets: `DISCORD_TOKEN` |
| `data/codex_auth.json` | Codex OAuth credentials (generated via `scripts/codex_login.py`) |
| `data/context/*.md` | Infrastructure context files injected into every LLM prompt |

### Key Config Sections

- **`discord`**: token, allowed users/channels, mention-only mode, bot interaction
- **`openai_codex`**: model, max tokens, credentials, model routing, context compression
- **`tools`**: SSH hosts, command timeout, per-tool timeout overrides, Claude Code host
- **`browser`**: native Playwright (empty `cdp_url`) or remote CDP endpoint
- **`web`**: port, API token, session timeout
- **`permissions`**: default tier, per-user overrides

## Tools (70)

| Category | Tools |
|----------|-------|
| Shell & Files | `run_command`, `run_script`, `run_command_multi`, `read_file`, `write_file`, `generate_file`, `post_file`, `manage_process` |
| Infrastructure | `git_ops`, `docker_ops`, `kubectl`, `terraform_ops`, `http_probe` |
| Agents & Orchestration | `delegate_task`, `list_tasks`, `cancel_task`, `spawn_agent`, `send_to_agent`, `list_agents`, `kill_agent`, `get_agent_results`, `wait_for_agents`, `spawn_loop_agents`, `collect_loop_agents` |
| Scheduling & Loops | `schedule_task`, `list_schedules`, `update_schedule`, `delete_schedule`, `parse_time`, `start_loop`, `stop_loop`, `list_loops` |
| AI & Code | `claude_code`, `generate_image`, `analyze_image`, `analyze_pdf` |
| Skills | `create_skill`, `edit_skill`, `delete_skill`, `list_skills`, `enable_skill`, `disable_skill`, `install_skill`, `export_skill`, `skill_status`, `invoke_skill` |
| Knowledge & Memory | `memory_manage`, `manage_list`, `search_history`, `search_audit`, `search_knowledge`, `ingest_document`, `bulk_ingest_knowledge`, `list_knowledge`, `delete_knowledge` |
| Web & Browser | `web_search`, `fetch_url`, `browser_screenshot`, `browser_read_page`, `browser_read_table`, `browser_click`, `browser_fill`, `browser_evaluate` |
| Discord | `read_channel`, `add_reaction`, `create_poll`, `purge_messages` |
| Validation & Security | `validate_action`, `set_permission`, `issue_tracker` |

## Testing

```bash
# Full suite (105 files, ~3,584 test functions)
pytest tests/ -q

# Skip slow/optional tests
pytest tests/ --ignore=tests/test_tools -q
```

## Project Structure

```
src/
  __main__.py              Entry point
  config/schema.py         Pydantic config models
  discord/
    client.py              OdinBot — main executor (~4800 lines)
    response_guards.py     Fabrication, hedging, premature failure detection
    tool_loop_helpers.py   Request preamble, topic change detection
    cogs/                  9 moderation/utility cog extensions
  tools/
    executor.py            Tool dispatch + recovery
    registry.py            72 tool definitions (25 core, 47 skill)
    skill_manager.py       Skill CRUD + AST validation
    risk_classifier.py    CommandGovernor + risk classification
    post_validation.py     validate_action implementation
    recovery.py            Error classification + retry
    browser.py             Native Playwright browser
  llm/
    system_prompt.py       Identity, execution policy, tool hierarchy
    openai_codex.py        Codex streaming client
    auxiliary.py            Smart model routing (cheap/strong)
    secret_scrubber.py     Secret detection and redaction
    context_compressor.py  Adaptive context compression
  async_utils.py           fire_and_forget helper for background tasks
  permissions/
    manager.py             Permission tiers + RBAC
    host_access.py         Per-user host access control
  agents/manager.py        Sub-agent lifecycle + state machine
  scheduler/scheduler.py   Cron + one-shot + webhook triggers
  sessions/manager.py      Per-channel history + compaction + topic detection
  knowledge/store.py       FTS5 + vector knowledge base
  health/server.py         aiohttp web server + auth middleware
  web/
    api.py                 154 REST endpoints
    websocket.py           Live event streaming + WS chat
  audit/logger.py          HMAC-chainable audit log
  learning/reflector.py    Cross-conversation learning (90-day expiry)
  trajectories/saver.py    Per-turn JSONL trajectory logging

ui/                        Vue 3 + Tailwind web dashboard (19 pages)
tests/                     105 files, ~3,584 test functions
config.yml                 Default configuration template
```

## License

MIT
