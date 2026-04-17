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
  model: gpt-5.4                 # ChatGPT subscription path
  max_tokens: 4096
  credentials_path: ./data/codex_auth.json
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

## Web Management UI

```yaml
web:
  enabled: true
  port: 3001
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
