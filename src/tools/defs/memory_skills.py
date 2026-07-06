"""Tool definitions — search_history … invoke_skill (slice 3/9 of the original TOOLS order).

RFC-004 P1: verbatim positional slice. ORDER IS BEHAVIOR (the tool
catalog feeds prompt assembly) — do not reorder, and do not move
tools between sections; the characterization contract pins the
concatenated order exactly.
"""

TOOLS_SECTION: list[dict] = [
    # --- History and memory ---
    {
        "name": "search_history",
        "is_core": True,
        "description": (
            "Searches past conversation history and full channel message logs from all users. Uses "
            "keyword, semantic, and FTS matching. Returns '[date] (role): content'. For ingested "
            "docs, use search_knowledge."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Search query",
                },
                "limit": {
                    "type": "integer",
                    "description": "Max results (default 10)",
                },
            },
            "required": ["query"],
        },
    },
    {
        "name": "memory_manage",
        "is_core": True,
        "description": (
            "Persistent memory that survives across conversations. 'save'/'get'/'list'/'delete' "
            "notes. 'personal' = per-user, 'global' = shared with everyone."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["save", "get", "list", "delete"],
                    "description": (
                        "'save' a note, 'get' a single note by key, 'list' all notes, or 'delete' "
                        "a note"
                    ),
                },
                "key": {
                    "type": "string",
                    "description": "Short identifier for the note (required for save/get/delete)",
                },
                "value": {
                    "type": "string",
                    "description": "Content to remember (required for save)",
                },
                "scope": {
                    "type": "string",
                    "enum": ["personal", "global"],
                    "description": (
                        "'personal' (default, this user only) or 'global' (shared, visible to all)"
                    ),
                },
            },
            "required": ["action"],
        },
    },
    # --- Audit ---
    {
        "name": "search_audit",
        "is_core": True,
        "description": (
            "Searches audit log of tool executions. Returns '[date] tool_name by user (status, "
            "Nms)'. Filterable by tool, user, host, keyword, date, status, errors, duration."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "tool_name": {
                    "type": "string",
                    "description": "Filter by tool name",
                },
                "user": {
                    "type": "string",
                    "description": "Filter by user name or ID",
                },
                "host": {
                    "type": "string",
                    "description": "Filter by host alias",
                },
                "keyword": {
                    "type": "string",
                    "description": "Free-text search across all fields",
                },
                "date": {
                    "type": "string",
                    "description": "Filter by date prefix (e.g. '2026-03-12')",
                },
                "status": {
                    "type": "string",
                    "description": "Filter by status (e.g. 'error', 'success')",
                },
                "has_error": {
                    "type": "boolean",
                    "description": "If true, only return entries with non-empty error fields",
                },
                "min_duration_ms": {
                    "type": "integer",
                    "description": "Only return entries that took at least this many milliseconds",
                },
                "limit": {
                    "type": "integer",
                    "description": "Max results (default 20)",
                },
            },
        },
    },
    # --- Skills ---
    {
        "name": "create_skill",
        "description": (
            "Creates a skill (custom tool) from Python code. Available immediately.\n"
            "Define: async def execute(inp: dict, context: SkillContext) -> str\n\n"
            "SkillContext methods (all async):\n"
            "- run_on_host(alias, cmd), read_file(host, path)\n"
            "- execute_tool(name, input), http_get(url), http_post(url, json=)\n"
            "- post_message(text), post_file(data, filename, caption)\n"
            "- search_knowledge(query), ingest_document(content, source), search_history(query)\n"
            "- remember(key, value), recall(key), schedule_task(...), get_hosts(), log(msg)\n"
            "See data/skills/*.template."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": (
                        "Skill name (lowercase, underscores only, e.g. 'check_ssl_expiry')"
                    ),
                },
                "code": {
                    "type": "string",
                    "description": "Full Python source code",
                },
            },
            "required": ["name", "code"],
        },
    },
    {
        "name": "edit_skill",
        "description": "Replaces the code of an existing skill. Immediately reloaded after edit.",
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "Skill name to edit",
                },
                "code": {
                    "type": "string",
                    "description": "New full Python source code",
                },
            },
            "required": ["name", "code"],
        },
    },
    {
        "name": "delete_skill",
        "description": "Deletes a user-created skill. Immediately removed from available tools.",
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "Skill name to delete",
                },
            },
            "required": ["name"],
        },
    },
    {
        "name": "list_skills",
        "description": (
            "Lists all user-created skills with descriptions, status, and input schemas."
        ),
        "input_schema": {
            "type": "object",
            "properties": {},
        },
    },
    {
        "name": "enable_skill",
        "description": "Re-enables a disabled skill.",
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "Name of the skill to enable",
                },
            },
            "required": ["name"],
        },
    },
    {
        "name": "disable_skill",
        "description": "Disables a skill without deleting it. File preserved.",
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "Name of the skill to disable",
                },
            },
            "required": ["name"],
        },
    },
    {
        "name": "install_skill",
        "description": (
            "Installs a skill from a URL. Downloads the Python file, validates it, and loads it as "
            "a new tool."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "url": {
                    "type": "string",
                    "description": "URL to a Python skill file (http/https)",
                },
            },
            "required": ["url"],
        },
    },
    {
        "name": "export_skill",
        "description": "Exports a skill as a Python file attachment for sharing.",
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "Name of the skill to export",
                },
            },
            "required": ["name"],
        },
    },
    {
        "name": "skill_status",
        "description": (
            "Shows detailed status for a skill: version, author, dependencies, config, execution "
            "stats, diagnostics."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "Name of the skill to inspect",
                },
            },
            "required": ["name"],
        },
    },
    {
        "name": "invoke_skill",
        "description": (
            "Executes a skill by name, passing the given input dict. Use this to run a skill you "
            "just created "
            "or edited without waiting for tool-registry cache refresh. Returns the skill's string "
            "result. "
            "Equivalent to the skill appearing as a direct tool call, but works the same turn it's "
            "created. "
            "ALWAYS pass the skill's parameters via the 'input' object — top-level fields other "
            "than 'name' "
            "are ignored. If the skill declares required fields, omitting them will return an "
            "error."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "Skill name to invoke (must already be created and enabled)",
                },
                "input": {
                    "type": "object",
                    "description": (
                        "Input dict passed to the skill's execute() — matches the skill's declared "
                        "input_schema"
                    ),
                },
            },
            "required": ["name"],
        },
    },
]
