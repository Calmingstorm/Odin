# Configuration Reference

Odin reads configuration from `config.yml` at startup. Environment variable substitution is supported via `${VAR}` and `${VAR:-default}` syntax.

## Discord

```yaml
discord:
  token: ${DISCORD_TOKEN}       # Required — bot token
  allowed_users: []              # User IDs (empty = all allowed)
  channels: []                   # Channel IDs (empty = all)
  respond_to_bots: false         # Reply to other bots
  require_mention: true          # Only respond when @mentioned
  ignore_bot_ids: []             # Bot IDs to never respond to
```

## Tools & Hosts

```yaml
tools:
  enabled: true
  ssh_key_path: /home/odin/.ssh/id_ed25519
  ssh_known_hosts_path: /home/odin/.ssh/known_hosts
  command_timeout_seconds: 300   # Default per-command timeout
  tool_timeouts:                 # Per-tool overrides
    claude_code: 3600
  hosts:
    localhost:
      address: 127.0.0.1
      ssh_user: root
      os: linux
    my-server:
      address: 203.0.113.10
      ssh_user: deploy
      os: linux
  max_tool_iterations_chat: 30   # Tool calls per Discord message
  max_tool_iterations_loop: 100  # Tool calls per autonomous loop
```

### SSH Configuration

```yaml
tools:
  ssh_retry:
    max_retries: 2
    base_delay: 0.5
    max_delay: 10.0
  ssh_pool:
    enabled: true
    control_persist: 60          # Seconds to keep connections alive
    socket_dir: /tmp/odin_ssh_sockets
  bulkhead:
    ssh_max_concurrent: 10
    subprocess_max_concurrent: 20
    browser_max_concurrent: 3
```

### Claude Code Integration

```yaml
tools:
  claude_code_host: localhost     # Host alias for Claude Code
  claude_code_user: odin         # SSH user
  claude_code_dir: /opt/odin     # Working directory
```

## LLM / Codex

```yaml
openai_codex:
  enabled: true
  model: gpt-5.5                 # ChatGPT subscription path
  max_tokens: 4096
  reasoning_effort: medium       # none | low | medium | high | xhigh
  agent_reasoning_effort: null   # spawned agents only; null = inherit reasoning_effort
  credentials_path: ./data/codex_auth.json
  request_timeout_seconds: 3600  # whole-request backstop; long reasoning turns stream past 10 min
  stream_stall_timeout_seconds: 180  # fail fast when no stream bytes arrive for this long
  retry:
    max_retries: 3
    base_delay: 1.0
    max_delay: 30.0
  context_compression:
    enabled: true
    max_context_chars: 48000
    keep_recent_iterations: 3
```

Generate credentials: `python3 scripts/codex_login.py`

Tokens expire weekly — re-run the script and copy `data/codex_auth.json` to the deployment.

## Agents

```yaml
agents:
  max_nesting_depth: 2             # Sub-agent nesting levels (root = 0)
  max_children_per_agent: 3
  max_iterations: 120              # LLM turns per interactive spawn
  scheduled_max_iterations: 180    # Scheduled workflow spawns
  hard_max_iterations: 300         # Ceiling for per-spawn overrides
  final_warning_iterations: [20, 10, 5, 1]
  iteration_timeout_seconds: 900   # Per-LLM-call backstop (60-86400)
  max_lifetime_seconds: 14400      # Hard per-agent deadline (60-86400)
```

`iteration_timeout_seconds` bounds each agent LLM call. It is a backstop
against a hung call, not a working limit — set it well above a legitimate
high-effort generation (5–10+ minutes at high reasoning effort); the
streaming transport already fails dead connections fast via
`stream_stall_timeout_seconds`.

`max_lifetime_seconds` is a hard deadline enforced during LLM and tool
waits, not just between iterations. Both values are **snapshotted at
spawn** — changing them live affects newly spawned agents only, never the
deadline of an agent already running.

## Sessions

```yaml
sessions:
  max_history: 50                # Messages per conversation
  max_age_hours: 24              # Auto-expire sessions
  persist_directory: ./data/sessions
  token_budget: 128000           # Auto-compact when exceeded
  adaptive_compaction: true
```

## Browser

```yaml
browser:
  enabled: true
  cdp_url: ""                    # Empty = native Playwright launch
  default_timeout_ms: 30000
  viewport_width: 1920
  viewport_height: 1080
```

Leave `cdp_url` empty to launch a local headless Chromium. Set to `ws://host:port?token=secret` for remote Browserless.

Run `playwright install chromium` after installation.

## Image Generation

```yaml
comfyui:
  enabled: true
  url: http://localhost:8188

image:
  backend: auto            # auto | openai | comfyui
  openai:
    enabled: true          # kill switch for the native wire implementation
    outer_model: gpt-5.5   # Responses model hosting the image tool (pinned)
    image_model: gpt-image-2
    allowed_sizes: ["1024x1024"]
    default_size: "1024x1024"
```

The `generate_image` tool can target two backends:

- **Native OpenAI** — generates via the `image_generation` tool on the Codex
  ChatGPT OAuth backend, riding the **same account Odin uses for chat** (no
  separate auth; subscription-quota-backed, so it draws on that account's usage
  limit). Available only while the active provider is `codex`.
- **ComfyUI** — the local Stable-Diffusion backend (`comfyui.enabled`), which
  also supports `negative`, `width`/`height`, and checkpoint `model`.

`backend` selects between them:

- `auto` (default) follows the active chat provider: on `codex`, native OpenAI
  is used with ComfyUI as a pre-generation fallback; on any other provider,
  ComfyUI only. A `negative`/`width`/`height`/`model` argument routes the
  request to ComfyUI. If neither backend is available (e.g. Kimi with no
  ComfyUI) the tool is hidden from the registry.
- `openai` forces native OpenAI (ComfyUI-only arguments are rejected).
- `comfyui` forces ComfyUI.

`outer_model` is pinned here rather than following your chat model, so changing
the chat model (Sol/Terra/…) never alters image generation. Only sizes listed in
`allowed_sizes` are accepted — widen it only after verifying a size works against
this private endpoint.

## Web Management UI

```yaml
web:
  enabled: true
  port: 3000
  api_token: ${WEB_API_TOKEN}    # Required for production
  session_timeout_minutes: 0     # 0 = persist until logout
```

19-page dashboard: Dashboard, Chat, Sessions, Tools, Skills, Knowledge, Schedules, Loops, Agents, Processes, Audit, Config, Logs, Memory, Traces, Health, Resources, Internals, Usage.

## Permissions

```yaml
permissions:
  default_tier: user             # admin, user, or guest
  tiers:
    "123456789012345678": admin   # Per-user overrides
```

Runtime overrides persist in `data/permissions.json` and take precedence.

| Tier | Access |
|------|--------|
| admin | All 71 tools |
| user | Read-only: run_command, search_*, list_*, web_search, fetch_url, parse_time |
| guest | Conversation only, no tools |

## Webhooks

```yaml
webhook:
  enabled: false
  secret: ''                     # HMAC-SHA256 verification
  channel_id: ''                 # Default notification channel
```

## Context Files

Place `.md` files in `data/context/` — they are injected into every LLM prompt as infrastructure context.

```yaml
context:
  directory: ./data/context
  max_system_prompt_tokens: 32000
```

## Logging

```yaml
logging:
  level: INFO                    # DEBUG, INFO, WARNING, ERROR
  directory: ./data/logs
```

## File Paths (DEB install)

| Purpose | Path |
|---------|------|
| Config | `/etc/odin/config.yml` |
| Secrets | `/etc/odin/.env` |
| Data | `/var/lib/odin/` |
| Logs | `/var/log/odin/` |
| Application | `/opt/odin/` |
| Systemd | `/usr/lib/systemd/system/odin.service` |

## Restarts (self-update and setup wizard)

The WebUI self-updater (Updates page) requires a **git-clone install** —
`.deb` installs have no repository and should upgrade via `apt` instead
(the endpoint answers 409 with the same hint).

After a successful update — and after the first-boot setup wizard saves its
config — Odin restarts **in place** by re-executing itself once graceful
shutdown completes. Recovery therefore does not depend on the service
unit's `Restart=` policy, Docker restart policy, or any supervisor at all.
`Restart=always` (what the packaged unit ships) is still recommended so the
service also recovers from crashes and reboots.
