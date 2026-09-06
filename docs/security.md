# Security

## CommandGovernor

The CommandGovernor sits between LLM tool decisions and shell execution. It runs before `run_command`, `run_script`, and `manage_process`.

### Blocked (CRITICAL)

These patterns are blocked before the command reaches a shell. With `governor.admin_can_override: true` (the schema default and the tracked template), an admin-tier requester can override the block; the override is annotated in the output and recorded in the audit log. Set it to `false` to make the block absolute.

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
| `admin` | All 74 built-in tools | Operators |
| `user` | Eleven read-only tools plus list management | Team members |
| `guest` | None (chat only) | Restricted |

User-tier tools: `get_tool_output`, `search_history`, `search_knowledge`, `web_search`, `fetch_url`, `list_schedules`, `list_tasks`, `list_skills`, `list_knowledge`, `manage_list`, `parse_time`. `run_command` is deliberately excluded (arbitrary shell execution). `manage_list` can change list state; the rest are read-only. Host access is enforced separately per user at execution time.

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
- **Validation versus loading** — standalone AST validation does not execute code. Trusted local create/edit loads Python before validating the runtime definition; URL install additionally runs static validation and prohibited-construct checks before loading. None of these checks is a sandbox.
- **Safe tool allowlist** — skills cannot call `run_command`, `apply_patch`, etc. directly
- **Blocked file paths** — cannot read `.env`, SSH keys, credentials
- **Blocked URLs** — localhost, private IPs blocked unless whitelisted
- **Resource limits** — 120s timeout, 50 tool calls, 20 HTTP requests

## Codex Auth

- OAuth tokens stored with 0600 permissions
- Atomic writes (temp + fsync + rename) prevent corruption
- Existing split-account files preserved on restart (no stale overwrite)
- HTTP requests to token endpoint have 30s timeout
