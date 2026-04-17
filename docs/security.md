# Security

## CommandGovernor

The CommandGovernor sits between LLM tool decisions and shell execution. It runs before `run_command`, `run_script`, and `manage_process`.

### Blocked (CRITICAL)

These patterns are always blocked. The command never reaches a shell.

| Pattern | Reason |
|---------|--------|
| `rm -rf /` | Recursive delete on root |
| `mkfs` | Filesystem format |
| `dd if=` | Raw disk write |
| Fork bombs | System destabilization |
| `shutdown`, `reboot`, `halt` | System control |
| `chmod -R 777 /` | World-writable root |
| `iptables -F` | Firewall flush |
| `ufw disable` | Firewall disable |
| `DROP TABLE`, `TRUNCATE` | Database destruction |
| `crontab -r` | Remove all cron jobs |
| `> /dev/sd*` | Block device write |

### Blocked (Exfiltration)

| Pattern | Reason |
|---------|--------|
| `curl \| bash`, `wget \| sh` | Pipe remote script to shell |
| `bash -i >& /dev/tcp/` | Reverse shell |
| `nc -e /bin/sh` | Netcat reverse shell |
| `python -c socket.connect` | Python reverse shell |
| `base64 -d \| bash` | Obfuscated payload |
| `> /etc/passwd`, `> /etc/shadow` | Auth file writes |
| `>> /etc/cron*` | Cron persistence |

### Allowed with Annotation (HIGH)

Commands classified as HIGH risk are allowed but annotated in tool output:

```
[governor: allowed — high risk, recursive delete]
```

Examples: `rm -rf /tmp/specific_dir`, `systemctl restart nginx`, `docker rm container`, `git push --force`.

### Denial Response

When a command is blocked, the tool returns a structured denial:

```
Blocked [critical]: recursive delete on root
Suggested alternative: Use a more specific path, e.g. rm -rf /tmp/specific_dir
```

## Permissions

Three tiers control tool access:

| Tier | Tools | Use Case |
|------|-------|----------|
| `admin` | All 71 | Operators |
| `user` | Read-only subset | Team members |
| `guest` | None (chat only) | Restricted |

User-tier tools: `run_command`, `search_history`, `search_knowledge`, `web_search`, `fetch_url`, `list_schedules`, `list_tasks`, `list_skills`, `list_knowledge`, `manage_list`, `parse_time`.

Set default in config, override per-user via `set_permission` or web UI.

## Secret Scrubbing

All input/output paths scrub secrets:
- Discord messages (inbound) — detected and deleted
- Tool results (outbound) — scrubbed before display
- Audit logs — tool_input string values scrubbed
- Bot message buffer — scrubbed before entering LLM context
- File attachments — scrubbed before context injection

Patterns detected: Discord tokens, API keys, Bearer tokens, SSH private keys, AWS credentials, database URLs with passwords.

## Web API Authentication

- All `/api/*` endpoints require Bearer token auth when `web.api_token` is configured
- Session-based auth via `/api/auth/login`
- Web chat uses server-side identity — caller cannot spoof `user_id`
- WebSocket connections authenticate via query parameter token

## Skill Sandboxing

Skills run in-process as trusted plugins (not sandboxed). Mitigations:
- **Admin-only creation** by default
- **AST validation** — no code executes during `create_skill` validation
- **Safe tool allowlist** — skills cannot call `run_command`, `write_file`, etc. directly
- **Blocked file paths** — cannot read `.env`, SSH keys, credentials
- **Blocked URLs** — localhost, private IPs blocked unless whitelisted
- **Resource limits** — 120s timeout, 50 tool calls, 20 HTTP requests

## Codex Auth

- OAuth tokens stored with 0600 permissions
- Atomic writes (temp + fsync + rename) prevent corruption
- Existing split-account files preserved on restart (no stale overwrite)
- HTTP requests to token endpoint have 30s timeout
