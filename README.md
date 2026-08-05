# Odin

An autonomous execution agent on Discord. Norse god of wisdom and war, stuck managing mortal infrastructure for eternity.

Odin executes real work from Discord: incident response, deploys, investigations, code review, automation, and scheduled operations across 74 built-in tools plus user-created skills. It runs shell commands on managed hosts, uses browser automation, orchestrates agents and workflows, and verifies results automatically after service changes.

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
- Multi-LLM: Codex (GPT-5.5), Kimi (K2.6), Ollama (local) — switchable at runtime
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
               ├── Tool Executor ──> 74 tools (shell, browser, git, docker, email, etc.)
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
               └── Web API (aiohttp) ──> 183 REST endpoints + WebSocket
```

## Install

### Debian / Ubuntu (recommended)

Odin ships as a `.deb` on the [releases page](https://github.com/Calmingstorm/Odin/releases). It installs to `/opt/odin`, runs as a dedicated `odin` system user under systemd, and keeps config in `/etc/odin` and data in `/var/lib/odin` (FHS layout).

```bash
# Download the latest release .deb, then:
sudo apt install ./odin_*.deb
```

The installer provisions the service (system user, Python venv + dependencies, SSH key, systemd unit) **non-interactively** and prints the first-time-setup steps. It does **not** start Odin automatically — you set the Discord token and LLM credentials first (below). Requires Python ≥ 3.11 (`python3-venv`); dependencies are pulled automatically.

Upgrades preserve `/etc/odin` and `/var/lib/odin` and restart the service if it was running.

### From source (development)

```bash
git clone https://github.com/Calmingstorm/Odin.git
cd Odin
pip install -e ".[dev]"
playwright install chromium          # optional — enables browser_* tools

cp .env.example .env                 # set DISCORD_TOKEN
$EDITOR config.yml                   # hosts, LLM, permissions

# Local commands run in a workspace OUTSIDE the install, so a bare relative
# path (e.g. cleaning up after extracting an archive whose internal layout
# starts with `data/`) can never resolve against your live data. It must
# exist, be private, and be owned by you — validation fails closed rather
# than silently falling back to the install directory.
sudo install -d -m 0700 -o "$USER" -g "$(id -gn)" /var/lib/odin-workspace
# …or point `tools.local_working_dir` in config.yml at any private directory
# outside the checkout, e.g.:
#   mkdir -p -m 0700 ~/.local/share/odin-workspace

python -m src
```

The web UI starts automatically on the configured port (default **3000**). Set `web.api_token` in `config.yml` to require authentication.

## First-time setup

After installing the `.deb`, complete these three steps (the service is enabled but not yet started):

**1. Discord bot token.** Create a bot at the [Discord developer portal](https://discord.com/developers/applications), enable **MESSAGE CONTENT INTENT** under Bot settings, then:

```bash
sudoedit /etc/odin/.env              # set DISCORD_TOKEN=...
```

**2. LLM backend.** Odin's primary backend is OpenAI Codex (a ChatGPT Plus/Team account). Authenticate as the `odin` user with the installed virtualenv:

```bash
sudo -u odin /opt/odin/.venv/bin/python /opt/odin/scripts/codex_login.py \
     --credentials-path /var/lib/odin/codex_auth.json
# headless server? add --device for the browserless device-code flow
```

Repeat to add more accounts for automatic rate-limit rotation. You can instead configure **Kimi** or **Ollama** from the web UI — see [LLM Configuration](#llm-configuration).

**3. Review config and start.**

```bash
sudoedit /etc/odin/config.yml        # hosts, permissions (localhost + admin tier ship by default)
sudo systemctl start odin
sudo journalctl -u odin -f           # watch it connect
```

Then open the dashboard at **http://localhost:3000**. Set `web.api_token` in `config.yml` to require authentication before exposing it.

*(From-source installs use `data/codex_auth.json` under the repo and `python scripts/codex_login.py` instead of the `/opt/odin` paths above.)*

## LLM Configuration

Odin supports three LLM backends, switchable at runtime from the WebUI (System > LLM Config):

| Provider | Auth | Best For |
|----------|------|----------|
| **Codex** (OpenAI) | OAuth device flow | Primary — GPT-5 family via ChatGPT subscription |
| **Kimi** (Moonshot AI) | API key | Alternative cloud — K2.6, 262K context, competitive pricing |
| **Ollama** (Local/Remote) | None / bearer token | Self-hosted open-source models (Qwen, Llama, etc.) |

All providers are configured from the WebUI without editing the config file. Provider toggles, API keys, model selection, and provider switching save and apply live; the Codex Advanced panel uses an explicit save action. Codex connection-pool and context-compression changes are saved immediately but require an Odin restart.

### Codex Authentication

Codex uses OpenAI OAuth tokens stored in `data/codex_auth.json`. On a `.deb` install, run the login script with the installed virtualenv as the `odin` user and an **absolute** credentials path (the script writes relative to the caller's cwd otherwise): `sudo -u odin /opt/odin/.venv/bin/python /opt/odin/scripts/codex_login.py --credentials-path /var/lib/odin/codex_auth.json`. The commands below are the from-source equivalents.

**Browser login** (machine with a browser):
```bash
python scripts/codex_login.py
```

**Device login** (headless servers):
```bash
python scripts/codex_login.py --device
```
This displays a code to enter at `https://auth.openai.com/codex/device` — no local browser needed.

**WebUI**: System > LLM Config shows account status and supports device flow login.

**Multi-account**: Store multiple credential sets as a JSON array in `data/codex_auth.json`. Odin rotates between them on rate limits automatically.

Tokens auto-refresh at runtime. Re-run the login script if the bot is offline for more than ~8 days (refresh token expiry).

### Kimi Setup

1. Get an API key from [platform.kimi.ai](https://platform.kimi.ai)
2. In WebUI > LLM Config > Kimi: enable, paste API key, press Enter
3. Select model from dropdown (kimi-k2.6 recommended)

### Ollama Setup

1. Install [Ollama](https://ollama.com) and pull a model (`ollama pull qwen3:14b`)
2. In WebUI > LLM Config > Ollama: enable, set base URL, select model from dropdown
3. For remote instances: set the API key if your reverse proxy requires one

## Configuration

| File | Purpose |
|------|---------|
| `config.yml` | Main config: Discord, tools, LLM, browser, scheduling, web UI, permissions |
| `.env` | Secrets: `DISCORD_TOKEN` |
| `data/codex_auth.json` | Codex OAuth credentials (generated via `scripts/codex_login.py`) |
| `data/context/*.md` | Infrastructure context files injected into every LLM prompt |

### Key Config Sections

- **`discord`**: token, allowed users/channels, mention-only mode, bot interaction
- **`openai_codex`**: model, credentials, model routing, transport, connection pooling, context compression
- **`tools`**: SSH hosts, command timeout, per-tool timeout overrides, Claude Code host
- **`browser`**: native Playwright (empty `cdp_url`) or remote CDP endpoint
- **`web`**: port, API token, session timeout
- **`permissions`**: default tier, per-user overrides

## Tools (74)

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
| Email | `email_send`, `email_search`, `email_read`, `email_list_recent` |
| Discord | `read_channel`, `add_reaction`, `create_poll`, `purge_messages` |
| Validation & Security | `validate_action`, `set_permission`, `issue_tracker` |

## Testing

```bash
# Full suite (134 files, 6,000+ tests; asyncio auto mode)
pytest tests/ -q

# One file or pattern
pytest tests/test_client.py -q
pytest tests/ -k scheduler -q
```

## Project Structure

```
src/
  __main__.py              Entry point
  config/schema.py         Pydantic config models
  discord/
    client.py              OdinBot — composition + Discord lifecycle
    wiring.py              Composition root (services + components)
    intake_pipeline.py     on_message gating chain + message pipeline
    tool_loop.py           Chat + autonomous tool-execution pipelines
    native_tools/          Discord-native tool domains + dispatch table
    prompts.py             System-prompt assembly + caches
    llm_gateway.py         Provider clients, reloads, guarded calls
    delivery.py            Presence, retries, chunked sends
    channel_state.py       Per-channel mutable state registry
    scheduled_events.py    Scheduler/digest/monitor callbacks
    turn_recorder.py       Trajectories, traces, reflection dispatch
    completion.py          Completion classifier
    housekeeping.py        Periodic cache maintenance
    response_guards.py     Fabrication, hedging, premature failure detection
    tool_loop_helpers.py   Request preamble + shared leaf helpers
    cogs/                  9 moderation/utility cog extensions
  tools/
    executor.py            Tool dispatch + recovery
    registry.py            74 built-in tool definitions
    skill_manager.py       Skill CRUD + AST validation
    risk_classifier.py    CommandGovernor + risk classification
    post_validation.py     validate_action implementation
    recovery.py            Error classification + retry
    browser.py             Native Playwright browser
  web/
    api/                   REST API — composition root + 13 domain modules
    api_common.py          Shared web helpers (redaction, validation, admin gate)
    chat.py                Web chat pipeline entry
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
    api.py                 183 REST endpoints
    websocket.py           Live event streaming + WS chat
  audit/logger.py          HMAC-chainable audit log
  learning/reflector.py    Cross-conversation learning (90-day expiry)
  trajectories/saver.py    Per-turn JSONL trajectory logging

ui/                        Vue 3 + Tailwind web dashboard (19 pages)
tests/                     134 files, 6,000+ tests
config.yml                 Default configuration template
```

## License

MIT
