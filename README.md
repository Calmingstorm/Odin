# Odin

An autonomous execution agent on Discord. Norse god of wisdom and war, stuck managing mortal infrastructure for eternity.

Odin is a general-purpose AI assistant and infrastructure operator that lives in Discord. Give it a task — monitoring, deployment, code review, investigation, automation — and it executes immediately using 71 tools, shell access, browser automation, scheduled tasks, background agents, and a persistent knowledge base. It also handles moderation, conversation, and creative tasks.

## What It Can Do

**Infrastructure & DevOps**
- Shell execution on managed hosts (`run_command`, `run_script`)
- Git operations, Docker management, kubectl, Terraform
- HTTP endpoint probing with timing breakdown
- Scheduled health checks (cron or one-shot)
- Background multi-step workflows (`delegate_task`)

**AI & Code**
- Claude Code delegation for code generation, review, and analysis
- Codex (GPT-5.4) conversation with full tool use
- ComfyUI image generation
- PDF analysis, web search, browser automation

**Automation**
- Autonomous loops with stuck-detection and backoff
- Sub-agent spawning (parallel, nested up to depth 2)
- User-created Python skills with hot-reload
- Cron scheduling with adaptive tick and wake events

**Knowledge & Memory**
- Persistent memory (per-user and global notes)
- Knowledge base with FTS5 search, dedup, versioning
- Conversation session management with compaction
- Trajectory saving for every interaction

**Security**
- CommandGovernor: blocks destructive shell commands and exfiltration patterns before execution
- Permission tiers (admin/user/guest) with per-tool filtering
- Secret scrubbing on all input/output paths
- AST-based skill validation (no exec during validation)
- Web API authentication with per-session isolation

**Web UI** (19 pages)
- Dashboard, chat, sessions, tools, skills, knowledge
- Schedules, loops, agents, processes, audit log
- Config editor, memory viewer, traces, health, resources
- Internals: startup diagnostics, subsystem guard, governor stats, connection pools

## Architecture

```
Discord ──> OdinBot (client.py)
               │
               ├── Tool Executor ──> 71 tools (shell, browser, git, docker, etc.)
               │       │
               │       ├── CommandGovernor (blocks dangerous commands)
               │       ├── Risk Classifier (observability)
               │       └── Bulkhead isolation (concurrency limits)
               │
               ├── Codex Client ──> GPT-5.4 (tool loop with up to 30 iterations)
               │
               ├── Agent Manager ──> Sub-agents (parallel, nested)
               ├── Loop Manager ──> Autonomous monitoring loops
               ├── Scheduler ──> Cron + one-shot + webhook triggers
               ├── Skill Manager ──> User-created Python tools
               ├── Knowledge Store ──> FTS5 + vector search
               ├── Session Manager ──> Per-channel history + compaction
               ├── Browser (native Playwright) ──> Screenshots, page reading, JS eval
               └── Web API (aiohttp) ──> 136 REST endpoints + WebSocket
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

The web UI starts automatically at the configured port (default 3001). If `web.api_token` is set in config.yml, you'll need to authenticate.

## Configuration

| File | Purpose |
|------|---------|
| `config.yml` | Main config: Discord, tools, LLM, browser, scheduling, web UI, permissions |
| `.env` | Secrets: `DISCORD_TOKEN` |
| `data/codex_auth.json` | Codex OAuth credentials (generated via `scripts/codex_login.py`) |
| `data/context/*.md` | Infrastructure context files injected into every LLM prompt |

### Key Config Sections

- **`discord`**: token, allowed users/channels, mention-only mode, bot interaction
- **`openai_codex`**: model (gpt-5.4), max tokens, credentials, model routing, context compression
- **`tools`**: SSH hosts, command timeout, skill URLs, Claude Code host
- **`browser`**: native Playwright (empty `cdp_url`) or remote CDP
- **`web`**: port, API token, session timeout
- **`permissions`**: default tier, per-user overrides

## Tools (71)

| Category | Tools |
|----------|-------|
| System & Commands | `run_command`, `run_script`, `read_file`, `write_file`, `list_directory`, `search_files`, `post_file` |
| DevOps & Infrastructure | `git_ops`, `docker_ops`, `kubectl`, `terraform_ops`, `http_probe` |
| Agents & Orchestration | `spawn_agent`, `send_to_agent`, `wait_for_agents`, `get_agent_results`, `kill_agent` |
| Workflows & Tasks | `delegate_task`, `execute_plan`, `schedule_task`, `start_loop`, `stop_loop` |
| AI & Generation | `claude_code`, `generate_image`, `analyze_image`, `analyze_pdf` |
| Skills | `create_skill`, `edit_skill`, `invoke_skill`, `delete_skill`, `install_skill` |
| Knowledge & Search | `search_knowledge`, `ingest_document`, `search_history`, `search_audit` |
| Network & Web | `browser_screenshot`, `browser_read_page`, `web_search`, `fetch_url` |
| Discord | `send_message`, `add_reaction`, `read_channel`, `create_poll` |
| Memory & State | `memory_manage`, `manage_list` |
| Integrations | `issue_tracker`, `slack_send` |

## Testing

```bash
# Core smoke tests (fast)
pytest tests/test_executor_integration_smoke.py -q

# Full suite (~5300 tests)
pytest tests/ --ignore=tests/test_tools -q
```

## Project Structure

```
src/
  __main__.py              Entry point
  config/schema.py         Pydantic config with protected_namespaces
  discord/
    client.py              OdinBot — main executor (~4800 lines)
    cogs/                  9 moderation/utility cog extensions
    background_task.py     Delegated task execution
  tools/
    executor.py            Tool dispatch + CommandGovernor
    registry.py            71 tool definitions
    skill_manager.py       Skill CRUD + AST validation
    skill_context.py       Skill runtime API
    risk_classifier.py     Risk classification + CommandGovernor
    autonomous_loop.py     Background monitoring loops
    browser.py             Native Playwright browser
    process_manager.py     Background process registry
  llm/
    system_prompt.py       Odin's personality + rules
    codex_auth.py          OAuth token management (atomic writes, 0600 perms)
    openai_codex.py        Codex chat client
    secret_scrubber.py     Input/output secret detection
  agents/manager.py        Sub-agent lifecycle + state machine
  scheduler/scheduler.py   Cron + one-shot + webhook triggers (deadlock-free)
  sessions/manager.py      Per-channel history + compaction + archive retention
  knowledge/store.py       FTS5 knowledge base with dedup + versioning
  search/fts.py            Full-text search index
  health/
    server.py              aiohttp web server + auth middleware
    checker.py             Component health status
    startup.py             Boot-time diagnostics (8 checks)
  web/
    api.py                 136 REST endpoints
    chat.py                Web chat handler
    websocket.py           Live log/event streaming + WS chat
  permissions/manager.py   RBAC tier system
  audit/logger.py          HMAC-chainable audit log

ui/                        Vue 3 + Tailwind web dashboard (19 pages)
tests/                     5300+ tests
scripts/                   codex_login.py, deploy helpers
config.yml                 Default configuration template
```

## License

MIT
