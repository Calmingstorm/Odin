# Skills Reference

Skills are user-created Python tools that extend Odin at runtime. They are AST-validated on creation (no code executes during validation), hot-reloaded on edit, and available immediately via `invoke_skill`.

## Creating a Skill

```python
SKILL_DEFINITION = {
    "name": "check_ssl",           # Lowercase, underscores, max 50 chars
    "description": "Check SSL certificate expiry for a domain",
    "input_schema": {
        "type": "object",
        "properties": {
            "domain": {
                "type": "string",
                "description": "Domain to check"
            }
        },
        "required": ["domain"]
    }
}

async def execute(inp: dict, context) -> str:
    """Entry point. Must be async. Returns a string result."""
    result = await context.execute_tool(
        "http_probe",
        {"url": f"https://{inp['domain']}", "timeout": 10}
    )
    return f"SSL check for {inp['domain']}:\n{result}"
```

## Skill Lifecycle

| Tool | Description |
|------|-------------|
| `create_skill` | Create from Python code. Validates, loads, immediately available. |
| `edit_skill` | Replace code. Re-validates and hot-reloads. |
| `invoke_skill` | Execute by name in the same turn it's created. |
| `delete_skill` | Remove permanently. |
| `enable_skill` / `disable_skill` | Toggle without deleting. |
| `install_skill` | Download and load from a URL. |
| `export_skill` | Export as a Python file attachment. |
| `skill_status` | Version, author, dependencies, config, execution stats. |
| `list_skills` | List all user-created skills. |

## Context API

The `context` parameter passed to `execute()` provides:

### Command Execution
- `run_on_host(alias, cmd)` → `str` — Run shell command via SSH
- `read_file(host, path, lines=200)` → `str` — Read file content

### Tool Execution
- `execute_tool(name, input)` → `str` — Call read-only tools (http_probe, search_knowledge, browser_read_page, etc.)

### HTTP
- `http_get(url, headers={})` → `dict | str | bytes`
- `http_post(url, json={}, headers={})` → `dict | str | bytes`

### Memory & Knowledge
- `remember(key, value)` — Store persistent fact
- `recall(key)` → `str | None` — Retrieve fact
- `search_knowledge(query, limit=5)` → `list[dict]` — Search knowledge base
- `ingest_document(content, source)` → `int` — Add to knowledge base
- `search_history(query, limit=10)` → `list[dict]` — Search conversation history

### Scheduling
- `schedule_task(description, action, channel_id, **kwargs)` → `dict`
- `list_schedules()` → `list[dict]`
- `update_schedule(id, **kwargs)` / `delete_schedule(id)`

### Discord
- `post_message(text)` — Send to invoking channel
- `post_file(data, filename, caption="")` — Post file attachment

### Utility
- `get_hosts()` → `list[str]` — Available host aliases
- `get_config(key, default=None)` — Read skill config value
- `get_all_config()` → `dict` — All config for this skill
- `log(msg)` — Log to skill logger

## Limits

| Limit | Value |
|-------|-------|
| Execution timeout | 120 seconds |
| Output truncation | 50,000 characters |
| Tool calls | 50 per execution |
| HTTP requests | 20 per execution |
| Messages sent | 10 per execution |
| Files sent | 10 per execution |
| Dependencies | 10 max per skill |

## Safe Tools

Skills can only call these tools via `execute_tool()`:

`read_file`, `search_history`, `search_audit`, `search_knowledge`, `list_knowledge`, `list_schedules`, `list_skills`, `list_tasks`, `memory_manage`, `parse_time`, `web_search`, `fetch_url`, `http_probe`, `browser_screenshot`, `browser_read_page`, `browser_read_table`

Destructive tools (`run_command`, `write_file`, etc.) are blocked. Use `run_on_host()` for shell access.

## Blocked Paths

Skills cannot read these files via `read_file`:
- `.env*`, `config.yml`, `config.yaml`
- `/etc/shadow`, SSH keys, `.ssh/`
- `credentials.json`, `.kube/config`

## Dependencies

Skills can declare pip dependencies:

```python
SKILL_DEFINITION = {
    ...
    "dependencies": ["requests>=2.0", "beautifulsoup4"],
}
```

Dependencies are auto-installed via pip on skill creation (120s timeout). Max 10 per skill.

## Skill Config

Skills can declare a config schema for operator-tunable settings:

```python
SKILL_DEFINITION = {
    ...
    "config_schema": {
        "type": "object",
        "properties": {
            "timeout_seconds": {
                "type": "integer",
                "default": 10,
                "minimum": 1,
                "maximum": 120
            }
        }
    }
}
```

Access via `context.get_config("timeout_seconds", 10)`. Set via web UI or `skill_status` API.
