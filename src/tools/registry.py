from __future__ import annotations


TOOLS: list[dict] = [
    # --- Shell execution ---
    {
        "name": "run_command",
        "description": "Runs a shell command on a managed host. Returns stdout/stderr (max 200 lines). On failure: 'Command failed (exit N): output'. For multi-line scripts, use run_script. For multiple hosts, use run_command_multi.",
        "input_schema": {
            "type": "object",
            "properties": {
                "host": {
                    "type": "string",
                    "description": "Host alias from config (e.g. 'myserver', 'webhost')",
                },
                "command": {
                    "type": "string",
                    "description": "Shell command to execute (single line; for multi-line use run_script)",
                },
            },
            "required": ["host", "command"],
        },
    },
    {
        "name": "run_script",
        "description": (
            "Runs a multi-line script on a managed host via temp file. Handles heredocs, code blocks, "
            "and complex quoting. Returns stdout/stderr (max 200 lines). On failure: 'Script failed (exit N): output'. "
            "Interpreters: bash (default), python3, python, sh, node, ruby, perl. "
            "For single commands, use run_command."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "host": {
                    "type": "string",
                    "description": "Host alias from config",
                },
                "script": {
                    "type": "string",
                    "description": "Full script content to execute",
                },
                "interpreter": {
                    "type": "string",
                    "description": "Interpreter (default: bash)",
                },
                "filename": {
                    "type": "string",
                    "description": "Temp filename (default: auto-generated)",
                },
            },
            "required": ["host", "script"],
        },
    },
    {
        "name": "run_command_multi",
        "description": "Runs a command on multiple hosts in parallel. Returns per-host '### hostname\\n```\\noutput\\n```'. Pass ['all'] for all configured hosts. For one host, use run_command.",
        "input_schema": {
            "type": "object",
            "properties": {
                "hosts": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "List of host aliases, or ['all'] for all hosts",
                },
                "command": {
                    "type": "string",
                    "description": "Shell command to execute on each host",
                },
            },
            "required": ["hosts", "command"],
        },
    },
    # --- File operations ---
    {
        "name": "read_file",
        "description": "Returns the contents of a file on a managed host. Default 200 lines, max 1000. To write, use write_file. For multi-file analysis, use claude_code with allow_edits=false.",
        "input_schema": {
            "type": "object",
            "properties": {
                "host": {
                    "type": "string",
                    "description": "Host alias from config",
                },
                "path": {
                    "type": "string",
                    "description": "Absolute path to the file",
                },
                "lines": {
                    "type": "integer",
                    "description": "Max lines to read (default 200, max 1000)",
                },
            },
            "required": ["host", "path"],
        },
    },
    {
        "name": "write_file",
        "description": "Writes content to a file on a managed host (creates or overwrites). To read first, use read_file. For multi-file edits, use claude_code.",
        "input_schema": {
            "type": "object",
            "properties": {
                "host": {
                    "type": "string",
                    "description": "Host alias from config",
                },
                "path": {
                    "type": "string",
                    "description": "Absolute path to the file",
                },
                "content": {
                    "type": "string",
                    "description": "Content to write",
                },
            },
            "required": ["host", "path", "content"],
        },
    },
    # --- Discord operations ---
    {
        "name": "purge_messages",
        "description": "Deletes recent messages in the current Discord channel and resets conversation history. Default 100, max 500.",
        "input_schema": {
            "type": "object",
            "properties": {
                "count": {
                    "type": "integer",
                    "description": "Number of messages to delete (default 100, max 500)",
                },
            },
        },
    },
    {
        "name": "post_file",
        "description": "Fetches a file from a managed host and posts it as a Discord attachment. Max 25MB. For generated content, use generate_file.",
        "input_schema": {
            "type": "object",
            "properties": {
                "host": {
                    "type": "string",
                    "description": "Host alias from config",
                },
                "path": {
                    "type": "string",
                    "description": "Absolute path to the file on the host",
                },
                "caption": {
                    "type": "string",
                    "description": "Optional message to include with the file",
                },
            },
            "required": ["host", "path"],
        },
    },
    {
        "name": "generate_file",
        "description": "Creates a file (script, code, CSV, report, etc.) and posts it as a Discord attachment. For files on a host, use post_file.",
        "input_schema": {
            "type": "object",
            "properties": {
                "filename": {
                    "type": "string",
                    "description": "Filename with extension (e.g. 'containers.csv', 'report.md', 'deploy.sh')",
                },
                "content": {
                    "type": "string",
                    "description": "File content to generate",
                },
                "caption": {
                    "type": "string",
                    "description": "Optional message to include with the file",
                },
            },
            "required": ["filename", "content"],
        },
    },
    # --- Scheduling ---
    {
        "name": "schedule_task",
        "description": (
            "Schedules a recurring (cron), one-time (run_at), or webhook-triggered task. "
            "Use parse_time to convert natural language to run_at. "
            "Actions: 'reminder' = post message, 'check' = run_command check, 'digest' = infrastructure digest, "
            "'workflow' = multi-step tool chain."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "description": {
                    "type": "string",
                    "description": "Human-readable description (e.g. 'Daily disk check on server')",
                },
                "cron": {
                    "type": "string",
                    "description": "Cron expression for recurring tasks (e.g. '0 9 * * *' = daily 9am). Omit for one-time.",
                },
                "run_at": {
                    "type": "string",
                    "description": "ISO datetime for one-time tasks (e.g. '2026-03-20T09:00'). Use parse_time to convert natural language. Omit for recurring.",
                },
                "trigger": {
                    "type": "object",
                    "description": "Webhook trigger (AND logic). E.g. {\"source\": \"github\", \"event\": \"push\", \"repo\": \"myproject\"}.",
                    "properties": {
                        "source": {
                            "type": "string",
                            "enum": ["gitea", "grafana", "generic", "github"],
                            "description": "Webhook source to match",
                        },
                        "event": {
                            "type": "string",
                            "description": "Event type (e.g. 'push', 'pull_request', 'alert')",
                        },
                        "repo": {
                            "type": "string",
                            "description": "Repository name substring (case-insensitive)",
                        },
                        "alert_name": {
                            "type": "string",
                            "description": "Grafana alert name substring (case-insensitive)",
                        },
                    },
                },
                "action": {
                    "type": "string",
                    "enum": ["reminder", "check", "digest", "workflow"],
                    "description": "'reminder' = post message, 'check' = run_command check, 'digest' = infrastructure digest, 'workflow' = multi-step tool chain",
                },
                "message": {
                    "type": "string",
                    "description": "For reminders: the message to post",
                },
                "tool_name": {
                    "type": "string",
                    "description": "Tool to run for 'check' action (e.g. 'run_command')",
                },
                "tool_input": {
                    "type": "object",
                    "description": "REQUIRED for action='check'. Must contain the tool's parameters, e.g. {'host': 'localhost', 'command': 'uname -r'} for run_command. Empty/missing will cause the fired schedule to error.",
                },
                "steps": {
                    "type": "array",
                    "description": "Workflow steps (sequential). Each step MUST include tool_input populated with that tool's parameters.",
                    "items": {
                        "type": "object",
                        "properties": {
                            "tool_name": {"type": "string", "description": "Tool to run"},
                            "tool_input": {"type": "object", "description": "REQUIRED — parameters for tool_name, e.g. {'host':'localhost','command':'ls'} for run_command"},
                            "description": {"type": "string", "description": "Step description"},
                            "condition": {"type": "string", "description": "Run if previous output contains this (! to negate)"},
                            "on_failure": {"type": "string", "enum": ["abort", "continue"], "description": "Default: abort"},
                        },
                        "required": ["tool_name", "tool_input"],
                    },
                },
            },
            "required": ["description", "action"],
        },
    },
    {
        "name": "list_schedules",
        "description": "Lists all scheduled tasks with IDs, descriptions, and next run times. To delete, use delete_schedule.",
        "input_schema": {
            "type": "object",
            "properties": {},
        },
    },
    {
        "name": "update_schedule",
        "description": (
            "Updates an existing schedule by ID. Only provided fields are changed. "
            "Can change description, cron, run_at, trigger, message, tool_name, tool_input, steps, or channel_id. "
            "Changing timing (cron/run_at/trigger) replaces the previous timing mode."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "schedule_id": {
                    "type": "string",
                    "description": "Schedule ID to update (from list_schedules)",
                },
                "description": {
                    "type": "string",
                    "description": "New description",
                },
                "cron": {
                    "type": "string",
                    "description": "New cron expression (replaces previous timing)",
                },
                "run_at": {
                    "type": "string",
                    "description": "New ISO datetime for one-time (replaces previous timing)",
                },
                "trigger": {
                    "type": "object",
                    "description": "New webhook trigger (replaces previous timing)",
                },
                "message": {
                    "type": "string",
                    "description": "New message (for reminder actions)",
                },
                "tool_name": {
                    "type": "string",
                    "description": "New tool name (for check actions)",
                },
                "tool_input": {
                    "type": "object",
                    "description": "New tool input parameters",
                },
                "steps": {
                    "type": "array",
                    "description": "New workflow steps",
                    "items": {
                        "type": "object",
                        "properties": {
                            "tool_name": {"type": "string"},
                            "tool_input": {"type": "object"},
                            "description": {"type": "string"},
                        },
                        "required": ["tool_name"],
                    },
                },
                "channel_id": {
                    "type": "string",
                    "description": "New channel ID for notifications",
                },
            },
            "required": ["schedule_id"],
        },
    },
    {
        "name": "delete_schedule",
        "description": "Deletes a scheduled task by ID. To list schedules first, use list_schedules.",
        "input_schema": {
            "type": "object",
            "properties": {
                "schedule_id": {
                    "type": "string",
                    "description": "Schedule ID to delete",
                },
            },
            "required": ["schedule_id"],
        },
    },
    {
        "name": "parse_time",
        "description": (
            "Converts natural language time to ISO datetime "
            "(e.g. 'in 2 hours', 'tomorrow at 9am', 'next Friday at 3pm'). "
            "Uses bot timezone. For schedule_task's run_at parameter."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "expression": {
                    "type": "string",
                    "description": "Natural language time (e.g. 'in 2 hours', 'tomorrow at 9am', 'next Friday at 3pm')",
                },
            },
            "required": ["expression"],
        },
    },
    # --- History and memory ---
    {
        "name": "search_history",
        "description": "Searches past conversation history and full channel message logs from all users. Uses keyword, semantic, and FTS matching. Returns '[date] (role): content'. For ingested docs, use search_knowledge.",
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
        "description": "Persistent memory that survives across conversations. 'save'/'get'/'list'/'delete' notes. 'personal' = per-user, 'global' = shared with everyone.",
        "input_schema": {
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["save", "get", "list", "delete"],
                    "description": "'save' a note, 'get' a single note by key, 'list' all notes, or 'delete' a note",
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
                    "description": "'personal' (default, this user only) or 'global' (shared, visible to all)",
                },
            },
            "required": ["action"],
        },
    },
    # --- Audit ---
    {
        "name": "search_audit",
        "description": "Searches audit log of tool executions. Returns '[date] tool_name by user (status, Nms)'. Filterable by tool, user, host, keyword, date.",
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
                "limit": {
                    "type": "integer",
                    "description": "Max results (default 20)",
                },
            },
        },
    },
    {
        "name": "create_digest",
        "description": "Creates a scheduled daily infrastructure digest across all hosts (disk, memory, services, alerts).",
        "input_schema": {
            "type": "object",
            "properties": {
                "cron": {
                    "type": "string",
                    "description": "Cron expression (default '0 8 * * *' = daily 8am)",
                },
                "description": {
                    "type": "string",
                    "description": "Description (default 'Daily Infrastructure Digest')",
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
                    "description": "Skill name (lowercase, underscores only, e.g. 'check_ssl_expiry')",
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
        "description": "Lists all user-created skills with descriptions, status, and input schemas.",
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
        "description": "Installs a skill from a URL. Downloads the Python file, validates it, and loads it as a new tool.",
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
        "description": "Shows detailed status for a skill: version, author, dependencies, config, execution stats, diagnostics.",
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
            "Executes a skill by name, passing the given input dict. Use this to run a skill you just created "
            "or edited without waiting for tool-registry cache refresh. Returns the skill's string result. "
            "Equivalent to the skill appearing as a direct tool call, but works the same turn it's created. "
            "ALWAYS pass the skill's parameters via the 'input' object — top-level fields other than 'name' "
            "are ignored. If the skill declares required fields, omitting them will return an error."
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
                    "description": "Input dict passed to the skill's execute() — matches the skill's declared input_schema",
                },
            },
            "required": ["name"],
        },
    },
    # --- Background task delegation ---
    {
        "name": "delegate_task",
        "description": (
            "Runs a multi-step task in the background, posting progress to Discord. "
            "Steps run sequentially with conditions (substring match, ! to negate), "
            "on_failure (abort/continue), store_as ({var.name}), {prev_output} substitution. "
            "IMPORTANT: each step using run_command MUST have tool_input with 'command' key. "
            "Example step: {\"tool_name\": \"run_command\", \"description\": \"List files\", "
            "\"tool_input\": {\"command\": \"ls -la /tmp\"}}. "
            "Track with list_tasks, stop with cancel_task."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "description": {
                    "type": "string",
                    "description": "Task description",
                },
                "steps": {
                    "type": "array",
                    "description": "Ordered tool calls to execute",
                    "items": {
                        "type": "object",
                        "properties": {
                            "tool_name": {"type": "string", "description": "Tool to run"},
                            "tool_input": {"type": "object", "description": "Input parameters"},
                            "description": {"type": "string", "description": "Step description"},
                            "condition": {"type": "string", "description": "Run if previous output contains this (prefix ! to negate)"},
                            "on_failure": {"type": "string", "enum": ["abort", "continue"], "description": "Default: abort"},
                            "store_as": {"type": "string", "description": "Save output as named variable"},
                        },
                        "required": ["tool_name"],
                    },
                },
            },
            "required": ["description", "steps"],
        },
    },
    {
        "name": "list_tasks",
        "description": "Lists background tasks. Without task_id: overview. With task_id: step-by-step details. See delegate_task, cancel_task.",
        "input_schema": {
            "type": "object",
            "properties": {
                "task_id": {
                    "type": "string",
                    "description": "Task ID for detailed results (omit for overview)",
                },
            },
        },
    },
    {
        "name": "cancel_task",
        "description": "Cancels a running background task. Get task IDs from list_tasks.",
        "input_schema": {
            "type": "object",
            "properties": {
                "task_id": {
                    "type": "string",
                    "description": "Task ID to cancel (from list_tasks)",
                },
            },
            "required": ["task_id"],
        },
    },
    # --- Knowledge base ---
    {
        "name": "search_knowledge",
        "description": (
            "Searches ingested knowledge base (docs, runbooks, configs). "
            "Returns ranked '[source] (score: N) content'. "
            "Search here FIRST before web_search. To add, use ingest_document. To list, use list_knowledge."
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
                    "description": "Max results (default 5)",
                },
            },
            "required": ["query"],
        },
    },
    {
        "name": "ingest_document",
        "description": (
            "Ingests a document into the knowledge base (chunked + embedded for search). "
            "Re-ingesting same source replaces previous. For host files, read_file first. Search with search_knowledge."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "source": {
                    "type": "string",
                    "description": "Document identifier (e.g. 'ansible/roles/apache/README.md', 'server-runbook')",
                },
                "content": {
                    "type": "string",
                    "description": "Document text content",
                },
            },
            "required": ["source", "content"],
        },
    },
    {
        "name": "bulk_ingest_knowledge",
        "description": (
            "Bulk-import documents into the knowledge base. Accepts a list of items: "
            "directories of markdown/text files, PDF URLs, or web page URLs. "
            "Each item needs a type ('directory', 'pdf', or 'url') plus type-specific params."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "items": {
                    "type": "array",
                    "description": (
                        "Import jobs. Each object needs 'type' plus: "
                        "directory → 'path' (+ optional 'pattern', default '**/*.md'); "
                        "pdf → 'url' (+ optional 'source'); "
                        "url → 'url' (+ optional 'source')"
                    ),
                    "items": {
                        "type": "object",
                        "properties": {
                            "type": {"type": "string", "enum": ["directory", "pdf", "url"]},
                            "path": {"type": "string"},
                            "url": {"type": "string"},
                            "source": {"type": "string"},
                            "pattern": {"type": "string"},
                        },
                        "required": ["type"],
                    },
                },
            },
            "required": ["items"],
        },
    },
    {
        "name": "list_knowledge",
        "description": "Lists all knowledge base documents with source names and chunk counts. To search, use search_knowledge. To remove, use delete_knowledge.",
        "input_schema": {
            "type": "object",
            "properties": {},
        },
    },
    {
        "name": "delete_knowledge",
        "description": "Removes a document from the knowledge base by source name. To list sources first, use list_knowledge.",
        "input_schema": {
            "type": "object",
            "properties": {
                "source": {
                    "type": "string",
                    "description": "Source name to remove",
                },
            },
            "required": ["source"],
        },
    },
    # --- Browser automation ---
    {
        "name": "browser_screenshot",
        "description": "Takes a screenshot of a URL (renders JavaScript) and posts to Discord. Works on dashboards, SPAs, and dynamic pages unlike fetch_url. For text, use browser_read_page.",
        "input_schema": {
            "type": "object",
            "properties": {
                "url": {
                    "type": "string",
                    "description": "URL to screenshot",
                },
                "full_page": {
                    "type": "boolean",
                    "description": "Capture full scrollable page (default false = viewport only)",
                },
                "wait_seconds": {
                    "type": "integer",
                    "description": "Extra wait after page load for dynamic content (default 0, max 10)",
                },
            },
            "required": ["url"],
        },
    },
    {
        "name": "browser_read_page",
        "description": "Reads a URL's text content (renders JavaScript). Returns 'Title (url)\\n\\ntext'. Works on SPAs/dynamic pages unlike fetch_url. Scope via CSS selector. For tables, use browser_read_table. For screenshots, use browser_screenshot.",
        "input_schema": {
            "type": "object",
            "properties": {
                "url": {
                    "type": "string",
                    "description": "URL to read",
                },
                "selector": {
                    "type": "string",
                    "description": "CSS selector to scope extraction (e.g. '#main-content', '.results')",
                },
                "wait_seconds": {
                    "type": "integer",
                    "description": "Extra wait for dynamic content (default 0, max 10)",
                },
                "max_chars": {
                    "type": "integer",
                    "description": "Max characters to return (default 4000, max 8000)",
                },
            },
            "required": ["url"],
        },
    },
    {
        "name": "browser_read_table",
        "description": "Extracts an HTML table from a URL as markdown (| col | col |). Renders JavaScript. For text, use browser_read_page.",
        "input_schema": {
            "type": "object",
            "properties": {
                "url": {
                    "type": "string",
                    "description": "URL containing the table",
                },
                "table_index": {
                    "type": "integer",
                    "description": "Which table to extract (0-based, default 0 = first table)",
                },
                "wait_seconds": {
                    "type": "integer",
                    "description": "Extra wait for dynamic content (default 0, max 10)",
                },
            },
            "required": ["url"],
        },
    },
    {
        "name": "browser_click",
        "description": "Navigates to a URL and clicks an element by CSS selector. Returns visible page text after clicking. To fill forms, use browser_fill.",
        "input_schema": {
            "type": "object",
            "properties": {
                "url": {
                    "type": "string",
                    "description": "URL to navigate to",
                },
                "selector": {
                    "type": "string",
                    "description": "CSS selector to click (e.g. '#login-btn', 'button.submit')",
                },
                "wait_seconds": {
                    "type": "integer",
                    "description": "Extra wait before clicking (default 0, max 10)",
                },
            },
            "required": ["url", "selector"],
        },
    },
    {
        "name": "browser_fill",
        "description": "Navigates to a URL and fills a form field by CSS selector. Optionally submits by pressing Enter. To click buttons, use browser_click.",
        "input_schema": {
            "type": "object",
            "properties": {
                "url": {
                    "type": "string",
                    "description": "URL to navigate to",
                },
                "selector": {
                    "type": "string",
                    "description": "CSS selector of the input (e.g. '#username', 'input[name=password]')",
                },
                "value": {
                    "type": "string",
                    "description": "Text to fill",
                },
                "submit": {
                    "type": "boolean",
                    "description": "Press Enter after filling (default false)",
                },
            },
            "required": ["url", "selector", "value"],
        },
    },
    {
        "name": "browser_evaluate",
        "description": "Evaluates JavaScript on a URL and returns the result. For custom scraping or interaction.",
        "input_schema": {
            "type": "object",
            "properties": {
                "url": {
                    "type": "string",
                    "description": "URL to navigate to",
                },
                "expression": {
                    "type": "string",
                    "description": "JavaScript expression (e.g. 'document.title', 'document.querySelectorAll(\"a\").length')",
                },
                "wait_seconds": {
                    "type": "integer",
                    "description": "Extra wait before evaluating (default 0, max 10)",
                },
            },
            "required": ["url", "expression"],
        },
    },
    # --- Web tools ---
    {
        "name": "web_search",
        "description": "Searches the web via DuckDuckGo. Returns 'N. title\\nurl\\nsnippet' (max 10). For full content, use fetch_url or browser_read_page.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Search query",
                },
                "max_results": {
                    "type": "integer",
                    "description": "Max results (default 5, max 10)",
                },
            },
            "required": ["query"],
        },
    },
    {
        "name": "fetch_url",
        "description": "Fetches a URL and returns text (HTML→readable text, JSON passed through). Static only — for JS-rendered pages use browser_read_page.",
        "input_schema": {
            "type": "object",
            "properties": {
                "url": {
                    "type": "string",
                    "description": "URL to fetch",
                },
            },
            "required": ["url"],
        },
    },
    # --- Claude Code ---
    {
        "name": "claude_code",
        "description": (
            "Deep reasoning agent for complex multi-step tasks (3+ tool calls): code generation, "
            "repo analysis, debugging, building/deploying. Runs an entire chain in one session. "
            "Results as text + files on disk. With allow_edits=true, appends 'FILES ON DISK: ...' manifest.\n"
            "NOT for: single files (read_file/write_file) or single commands (run_command)."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "host": {
                    "type": "string",
                    "description": "Host alias (defaults to claude_code_host from config)",
                },
                "working_directory": {
                    "type": "string",
                    "description": "Absolute path to the repo/directory (e.g. '/root/project/')",
                },
                "prompt": {
                    "type": "string",
                    "description": "Detailed prompt: specify files, functions, and expected behavior",
                },
                "allow_edits": {
                    "type": "boolean",
                    "description": "true = can edit/write files (non-root). false (default) = read-only analysis.",
                },
                "allowed_tools": {
                    "type": "string",
                    "description": "Restrict tools — space-separated (e.g. 'Read Grep Glob'). Default: all.",
                },
            },
            "required": ["working_directory", "prompt"],
        },
    },
    # --- Permissions ---
    {
        "name": "set_permission",
        "description": "Sets a Discord user's permission tier. Admin-only. Tiers: admin (full access), user (read-only), guest (chat only).",
        "input_schema": {
            "type": "object",
            "properties": {
                "user_id": {
                    "type": "string",
                    "description": "Discord user ID (numeric string, e.g. '123456789012345678')",
                },
                "tier": {
                    "type": "string",
                    "enum": ["admin", "user", "guest"],
                    "description": "Permission tier",
                },
            },
            "required": ["user_id", "tier"],
        },
    },
    # --- PDF analysis ---
    {
        "name": "analyze_pdf",
        "description": "Extracts text from a PDF (URL or host:path). Returns markdown text (max 12000 chars). For image-heavy PDFs, use browser_screenshot.",
        "input_schema": {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "URL to fetch PDF from"},
                "host": {"type": "string", "description": "Host alias for file-based PDF"},
                "path": {"type": "string", "description": "File path on host"},
                "pages": {"type": "string", "description": "Page range, e.g. '1-5' or '3' (default: all)"},
            },
        },
    },
    # --- Rich Discord messaging ---
    {
        "name": "read_channel",
        "description": (
            "Reads recent messages from the CURRENT Discord channel into your context. "
            "Returns channel history from ALL users and bots. Do NOT pass channel_id — "
            "omit it to read the channel the message came from. The returned messages are "
            "for YOUR eyes only — do NOT paste or echo them. Read, understand, then respond "
            "with your own summary, analysis, or action."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "limit": {
                    "type": "integer",
                    "description": "Number of messages to read (default 10, max 100)",
                },
                "channel_id": {
                    "type": "string",
                    "description": "Numeric channel ID. Omit to use current channel (recommended).",
                },
            },
        },
    },
    {
        "name": "add_reaction",
        "description": "Adds an emoji reaction to a message. Unicode emoji or custom format (<:name:id>).",
        "input_schema": {
            "type": "object",
            "properties": {
                "message_id": {"type": "string", "description": "Discord message ID to react to"},
                "emoji": {"type": "string", "description": "Emoji to react with"},
            },
            "required": ["message_id", "emoji"],
        },
    },
    {
        "name": "create_poll",
        "description": "Creates a Discord native poll in the current channel. "
                       "Max 10 options. Duration in hours (default 24, max 168/7 days).",
        "input_schema": {
            "type": "object",
            "properties": {
                "question": {"type": "string", "description": "The poll question"},
                "options": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "List of answer options (max 10)",
                },
                "duration_hours": {"type": "integer", "description": "Poll duration in hours (default 24)"},
                "multiple": {"type": "boolean", "description": "Allow multiple selections (default false)"},
            },
            "required": ["question", "options"],
        },
    },
    # --- Process management ---
    {
        "name": "manage_process",
        "description": (
            "Manages background processes (start/poll/write/kill/list). "
            "Start spawns a command, returns PID. Poll gets output. Write sends stdin. "
            "Max 20 concurrent, auto-killed after 1hr."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["start", "poll", "write", "kill", "list"],
                    "description": "Action to perform",
                },
                "host": {
                    "type": "string",
                    "description": "Host alias (required for start)",
                },
                "command": {
                    "type": "string",
                    "description": "Shell command to run (required for start)",
                },
                "pid": {
                    "type": "integer",
                    "description": "Process ID (required for poll, write, kill)",
                },
                "input_text": {
                    "type": "string",
                    "description": "Text to send to stdin (required for write)",
                },
                "timeout": {
                    "type": "integer",
                    "description": "Max lifetime in seconds (default 300, max 3600)",
                },
            },
            "required": ["action"],
        },
    },
    # --- List management ---
    {
        "name": "manage_list",
        "description": (
            "Manages named lists (grocery, todo, shopping, etc.). "
            "Created on first add. 'personal' = private, 'shared' = visible to all. "
            "Supports mark_done/mark_undone."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": [
                        "add", "remove", "show", "clear",
                        "mark_done", "mark_undone", "list_all",
                    ],
                    "description": (
                        "'list_all' shows all lists. "
                        "Other actions operate on a specific list_name."
                    ),
                },
                "list_name": {
                    "type": "string",
                    "description": (
                        "List name (e.g. 'grocery', 'todo', 'hardware store'). "
                        "Required for all actions except list_all."
                    ),
                },
                "items": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Item(s) to add, remove, or mark.",
                },
                "owner": {
                    "type": "string",
                    "enum": ["personal", "shared"],
                    "description": (
                        "'personal' = this user only, 'shared' = everyone (default). "
                        "Only applies on first add (list creation)."
                    ),
                },
            },
            "required": ["action"],
        },
    },
    # --- Image analysis ---
    {
        "name": "analyze_image",
        "description": (
            "Analyzes an image from URL or host path. Returns text description. "
            "For web page screenshots, use browser_screenshot."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "URL of the image"},
                "host": {"type": "string", "description": "Host alias for file-based image"},
                "path": {"type": "string", "description": "File path on host"},
                "prompt": {
                    "type": "string",
                    "description": "What to look for (default: describe the image)",
                },
            },
        },
    },
    # --- Autonomous loops ---
    {
        "name": "start_loop",
        "description": (
            "Starts an autonomous loop. Each iteration triggers a full LLM reasoning cycle "
            "with all tools. Use for monitoring, game playing, event watching, periodic updates. "
            "Returns loop ID. Check with list_loops, stop with stop_loop."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "goal": {
                    "type": "string",
                    "description": (
                        "Goal for each iteration (be specific). "
                        "E.g. 'Monitor disk usage, warn if above 80%' or "
                        "'Watch /tmp/events.log, summarize new entries'"
                    ),
                },
                "interval_seconds": {
                    "type": "integer",
                    "description": "Seconds between iterations (default: 60, min: 10)",
                },
                "mode": {
                    "type": "string",
                    "enum": ["notify", "act", "silent"],
                    "description": "notify = report always, act = act + report, silent = act, report only if notable",
                },
                "stop_condition": {
                    "type": "string",
                    "description": "Auto-stop condition, e.g. 'when disk below 50%' or 'after 5 iterations'. Evaluated each cycle.",
                },
                "max_iterations": {
                    "type": "integer",
                    "description": "Hard max iterations before auto-stop (default: 50)",
                },
            },
            "required": ["goal"],
        },
    },
    {
        "name": "stop_loop",
        "description": "Stops an autonomous loop by ID. Use 'all' to stop all loops. To list loops first, use list_loops.",
        "input_schema": {
            "type": "object",
            "properties": {
                "loop_id": {
                    "type": "string",
                    "description": "Loop ID to stop, or 'all'",
                },
            },
            "required": ["loop_id"],
        },
    },
    {
        "name": "list_loops",
        "description": "Lists all autonomous loops with status, iterations, and last activity. To create, use start_loop. To stop, use stop_loop.",
        "input_schema": {
            "type": "object",
            "properties": {},
        },
    },
    # --- Agent orchestration ---
    {
        "name": "spawn_agent",
        "description": (
            "Spawns an autonomous agent for a sub-task. Runs silently in background with "
            "isolated context (cannot spawn sub-agents). Results are NOT posted to Discord — "
            "use wait_for_agents to collect results, then deliver a cohesive summary yourself. "
            "Max 5/channel, 1hr lifetime, 30 LLM turns."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "label": {"type": "string", "description": "Short name (e.g. 'disk-audit')"},
                "goal": {"type": "string", "description": "Full task description for the agent"},
            },
            "required": ["label", "goal"],
        },
    },
    {
        "name": "send_to_agent",
        "description": (
            "Sends a message to a running agent, injected as context in its next "
            "LLM turn. Use to provide additional instructions, data, or course corrections."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "agent_id": {"type": "string", "description": "Agent ID (from spawn_agent)"},
                "message": {"type": "string", "description": "Message text to inject"},
            },
            "required": ["agent_id", "message"],
        },
    },
    {
        "name": "list_agents",
        "description": (
            "Lists all agents with status, iteration count, and runtime. "
            "Shows running, completed, failed, and timed-out agents."
        ),
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "kill_agent",
        "description": "Terminates a running agent immediately. Agent status set to 'killed'.",
        "input_schema": {
            "type": "object",
            "properties": {
                "agent_id": {"type": "string", "description": "Agent ID to kill"},
            },
            "required": ["agent_id"],
        },
    },
    {
        "name": "get_agent_results",
        "description": (
            "Returns the final results of a completed/failed agent. Returns result "
            "text, tools used, iteration count, and runtime. Returns 'still running' if active."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "agent_id": {"type": "string", "description": "Agent ID"},
            },
            "required": ["agent_id"],
        },
    },
    {
        "name": "wait_for_agents",
        "description": (
            "Waits for one or more agents to complete and returns their results. "
            "Essential for fan-out (spawn N agents → wait → collect results) and "
            "pipeline (spawn A → wait → spawn B with A's output) coordination patterns. "
            "Returns results for each agent once all finish or timeout."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "agent_ids": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Agent IDs to wait for",
                },
                "timeout": {
                    "type": "number",
                    "description": "Max seconds to wait (default 300)",
                },
            },
            "required": ["agent_ids"],
        },
    },
    # --- Loop-Agent integration ---
    {
        "name": "spawn_loop_agents",
        "description": "Spawns agents from a loop iteration with context. Max 3/iter, 10/loop.",
        "input_schema": {
            "type": "object",
            "properties": {
                "loop_id": {"type": "string", "description": "Loop ID"},
                "tasks": {
                    "type": "array",
                    "description": "Agent tasks to spawn",
                    "items": {
                        "type": "object",
                        "properties": {
                            "label": {"type": "string", "description": "Agent name"},
                            "goal": {"type": "string", "description": "Agent task"},
                        },
                        "required": ["label", "goal"],
                    },
                },
            },
            "required": ["loop_id", "tasks"],
        },
    },
    {
        "name": "collect_loop_agents",
        "description": "Collects results from loop-spawned agents. Omit agent_ids for all.",
        "input_schema": {
            "type": "object",
            "properties": {
                "loop_id": {"type": "string", "description": "Loop ID"},
                "agent_ids": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Agent IDs (omit for all)",
                },
                "timeout": {"type": "number", "description": "Seconds (default 300)"},
            },
            "required": ["loop_id"],
        },
    },
    # --- Git operations ---
    {
        "name": "git_ops",
        "description": (
            "Git operations on a managed host. Actions: clone, status, diff, log, branch, "
            "commit, push, pull, checkout, fetch, stash. Push checks branch freshness first "
            "and refuses if local is behind remote. Use --force-with-lease (never bare --force) "
            "when force is needed. For complex multi-step git workflows, use run_script."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "host": {
                    "type": "string",
                    "description": "Host alias from config",
                },
                "action": {
                    "type": "string",
                    "description": "Git action: clone, status, diff, log, branch, commit, push, pull, checkout, fetch, stash",
                    "enum": [
                        "clone", "status", "diff", "log", "branch", "commit",
                        "push", "pull", "checkout", "fetch", "stash",
                    ],
                },
                "params": {
                    "type": "object",
                    "description": (
                        "Action-specific params. Common: repo (path, default '.'). "
                        "clone: url (required), dest, branch, depth. "
                        "diff: target, staged (bool), context (int). "
                        "log: count (int, max 50), oneline (bool), branch. "
                        "branch: name (create), delete (bool), list (bool). "
                        "commit: message (required), add_all (bool), files (array). "
                        "push: remote, branch, force (bool), set_upstream (bool). "
                        "pull: remote, branch, rebase (bool). "
                        "checkout: target (required), create (bool). "
                        "fetch: remote, prune (bool). "
                        "stash: subaction (push/pop/list/drop/apply), message."
                    ),
                },
            },
            "required": ["host", "action"],
        },
    },
    # --- Kubernetes operations ---
    {
        "name": "kubectl",
        "description": (
            "Kubernetes operations on a managed host. Actions: get, describe, logs, apply, delete, "
            "exec, rollout, scale, top, config. Runs kubectl via SSH on the target host (or locally). "
            "Supports namespace, context, and kubeconfig overrides. For complex multi-resource workflows, "
            "use run_script."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "host": {
                    "type": "string",
                    "description": "Host alias from config",
                },
                "action": {
                    "type": "string",
                    "description": "Kubectl action: get, describe, logs, apply, delete, exec, rollout, scale, top, config",
                    "enum": [
                        "get", "describe", "logs", "apply", "delete", "exec",
                        "rollout", "scale", "top", "config",
                    ],
                },
                "params": {
                    "type": "object",
                    "description": (
                        "Action-specific params. Common: namespace, context, kubeconfig. "
                        "get: resource (required), name, output (json/yaml/wide/name), selector, all_namespaces (bool). "
                        "describe: resource (required), name. "
                        "logs: pod (required), container, tail (int), previous (bool), since (e.g. '1h'), follow (bool), selector. "
                        "apply: file (path/URL, required unless kustomize), kustomize (dir), dry_run (bool). "
                        "delete: resource (required), name, selector, force (bool), grace_period (int). "
                        "exec: pod (required), command (required), container. "
                        "rollout: subaction (status/restart/undo/history/pause/resume), resource (required). "
                        "scale: resource (required), replicas (required, int). "
                        "top: resource (pods/nodes), name, selector, containers (bool). "
                        "config: subaction (get-contexts/use-context/current-context/view), context_name (for use-context)."
                    ),
                },
            },
            "required": ["host", "action"],
        },
    },
    # --- Docker operations ---
    {
        "name": "docker_ops",
        "description": (
            "Docker operations on a managed host. Actions: ps, run, exec, logs, build, pull, "
            "stop, rm, inspect, stats, compose_up, compose_down, compose_ps, compose_logs. "
            "Runs docker/docker-compose via SSH on the target host (or locally). "
            "For complex multi-container workflows, use run_script."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "host": {
                    "type": "string",
                    "description": "Host alias from config",
                },
                "action": {
                    "type": "string",
                    "description": (
                        "Docker action: ps, run, exec, logs, build, pull, stop, rm, "
                        "inspect, stats, compose_up, compose_down, compose_ps, compose_logs"
                    ),
                    "enum": [
                        "ps", "run", "exec", "logs", "build", "pull", "stop", "rm",
                        "inspect", "stats", "compose_up", "compose_down", "compose_ps",
                        "compose_logs",
                    ],
                },
                "params": {
                    "type": "object",
                    "description": (
                        "Action-specific params. "
                        "ps: all (bool), filter (str), format (str). "
                        "run: image (required), command, name, detach (bool), rm (bool), "
                        "env (object), ports (array of 'host:container'), volumes (array), network. "
                        "exec: container (required), command (required), workdir, env (object), user. "
                        "logs: container (required), tail (int), since (e.g. '1h'), follow (bool), timestamps (bool). "
                        "build: path (default '.'), tag, dockerfile, no_cache (bool), build_args (object), target. "
                        "pull: image (required). "
                        "stop: container (required), timeout (int). "
                        "rm: container (required), force (bool), volumes (bool). "
                        "inspect: target (required, container or image name/ID), format (str). "
                        "stats: container (optional, all if omitted), no_stream (bool, default true), format. "
                        "compose_up: services (array), detach (bool, default true), build (bool), "
                        "force_recreate (bool), file (compose file path), project (name). "
                        "compose_down: remove_volumes (bool), remove_images ('all'/'local'), file, project. "
                        "compose_ps: services (array), format, file, project. "
                        "compose_logs: services (array), tail (int), follow (bool), timestamps (bool), file, project."
                    ),
                },
            },
            "required": ["host", "action"],
        },
    },
    {
        "name": "terraform_ops",
        "description": (
            "Terraform operations on a managed host. Actions: init, plan, apply, output, show, "
            "validate, fmt, state, workspace, import. "
            "Apply ALWAYS requires a saved plan file (run plan with out=<file> first). "
            "-auto-approve is never used. Runs terraform via SSH on the target host (or locally)."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "host": {
                    "type": "string",
                    "description": "Host alias from config",
                },
                "action": {
                    "type": "string",
                    "description": (
                        "Terraform action: init, plan, apply, output, show, validate, "
                        "fmt, state, workspace, import"
                    ),
                    "enum": [
                        "init", "plan", "apply", "output", "show", "validate",
                        "fmt", "state", "workspace", "import",
                    ],
                },
                "params": {
                    "type": "object",
                    "description": (
                        "Action-specific params. All actions support working_dir (string, -chdir). "
                        "init: backend_config (object), upgrade (bool), reconfigure (bool), migrate_state (bool). "
                        "plan: out (file path to save plan), destroy (bool), var (object), var_file (str), "
                        "target (array of resource addresses), compact_warnings (bool). "
                        "apply: plan_file (REQUIRED — saved plan file from plan action). "
                        "output: name (specific output), json (bool). "
                        "show: plan_file (optional, show plan instead of state), json (bool). "
                        "validate: json (bool). "
                        "fmt: check (bool), diff (bool), recursive (bool), path (str). "
                        "state: subaction (list/show/mv/rm/pull), address, source, destination, id. "
                        "workspace: subaction (list/select/new/delete/show), name. "
                        "import: address (REQUIRED), id (REQUIRED), var (object), var_file (str)."
                    ),
                },
            },
            "required": ["host", "action"],
        },
    },
    # --- HTTP probe ---
    {
        "name": "http_probe",
        "description": (
            "Probe an HTTP/HTTPS endpoint with timing, retries, and full response capture. "
            "Useful for API debugging, health checks, and latency measurement. "
            "Runs curl on a managed host (or locally if host omitted). "
            "Returns response headers, body, status code, and timing breakdown "
            "(DNS, connect, TLS, TTFB, total)."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "url": {
                    "type": "string",
                    "description": "URL to probe (http or https)",
                },
                "host": {
                    "type": "string",
                    "description": "Host alias to run curl from (omit to run locally)",
                },
                "method": {
                    "type": "string",
                    "description": "HTTP method (default GET)",
                    "enum": [
                        "GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS",
                    ],
                },
                "headers": {
                    "type": "object",
                    "description": "Request headers as key-value pairs (e.g. {\"Authorization\": \"Bearer tok\"})",
                },
                "body": {
                    "type": "string",
                    "description": "Request body string (for POST/PUT/PATCH). Max 50KB.",
                },
                "timeout": {
                    "type": "integer",
                    "description": "Request timeout in seconds (default 30, max 120)",
                },
                "follow_redirects": {
                    "type": "boolean",
                    "description": "Follow HTTP redirects (default true)",
                },
                "verify_ssl": {
                    "type": "boolean",
                    "description": "Verify SSL certificates (default true)",
                },
                "retries": {
                    "type": "integer",
                    "description": "Number of retries on failure (default 0, max 5)",
                },
                "retry_delay": {
                    "type": "integer",
                    "description": "Delay between retries in seconds (default 1, max 30)",
                },
            },
            "required": ["url"],
        },
    },
    # --- Issue tracker (Linear / Jira) ---
    {
        "name": "issue_tracker",
        "description": (
            "Create, comment on, query, list, and transition issues in Linear or Jira. "
            "Useful for filing bugs from loop reports, tracking remediation, and updating issue status."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["create_issue", "comment", "get_issue", "list_issues", "transition"],
                    "description": "Action to perform",
                },
                "title": {
                    "type": "string",
                    "description": "Issue title (for create_issue)",
                },
                "description": {
                    "type": "string",
                    "description": "Issue body/description (for create_issue)",
                },
                "issue_id": {
                    "type": "string",
                    "description": "Issue ID or key (for comment, get_issue, transition). Linear: UUID. Jira: PROJECT-123",
                },
                "body": {
                    "type": "string",
                    "description": "Comment text (for comment action)",
                },
                "status": {
                    "type": "string",
                    "description": "Target status name (for transition and list_issues filter)",
                },
                "priority": {
                    "type": "string",
                    "description": "Priority: urgent/high/medium/low (for create_issue)",
                },
                "labels": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Label IDs (Linear) or label names (Jira) to apply",
                },
                "team_id": {
                    "type": "string",
                    "description": "Linear team ID (overrides default from config)",
                },
                "project_key": {
                    "type": "string",
                    "description": "Jira project key (overrides default from config)",
                },
                "issue_type": {
                    "type": "string",
                    "description": "Jira issue type (default: Task). Common: Bug, Story, Epic",
                },
                "limit": {
                    "type": "integer",
                    "description": "Max issues to return for list_issues (default 25, max 50)",
                },
            },
            "required": ["action"],
        },
    },
    # --- Image generation (ComfyUI) ---
    {
        "name": "generate_image",
        "description": "Generates an image from a text prompt via ComfyUI and posts to Discord. Requires ComfyUI enabled in config.",
        "input_schema": {
            "type": "object",
            "properties": {
                "prompt": {
                    "type": "string",
                    "description": "Text description of the image to generate",
                },
                "negative": {
                    "type": "string",
                    "description": "Negative prompt — things to avoid (default: empty)",
                },
                "width": {
                    "type": "integer",
                    "description": "Image width in pixels (default 1024)",
                },
                "height": {
                    "type": "integer",
                    "description": "Image height in pixels (default 1024)",
                },
                "model": {
                    "type": "string",
                    "description": "Checkpoint/model name to use (e.g. 'realisticVisionV60B1_v60B1VAE.safetensors'). "
                                   "If omitted, uses the default. Query available models via run_command: "
                                   "curl -s http://localhost:8188/object_info/CheckpointLoaderSimple",
                },
            },
            "required": ["prompt"],
        },
    },
    {
        "name": "execute_plan",
        "description": (
            "Execute a multi-step workflow plan using the Odin DAG planner. "
            "Accepts a declarative plan as a JSON string or dict with dependency-aware "
            "parallel execution, timeouts, retries, and failure cascading."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "plan": {
                    "type": "string",
                    "description": (
                        "JSON string defining the plan. Must include 'name' and 'steps' array. "
                        "Each step needs 'id' and 'tool' fields; optional: params, depends_on, "
                        "timeout, retries, continue_on_failure."
                    ),
                },
                "format": {
                    "type": "string",
                    "description": "Output format: 'summary', 'json', or 'dict'. Default: summary.",
                },
            },
            "required": ["plan"],
        },
    },
]

TOOL_MAP: dict[str, dict] = {t["name"]: t for t in TOOLS}


# Cache for get_tool_definitions — avoids rebuilding dicts on every message.
_tool_defs_cache: list[dict] | None = None


def get_tool_definitions() -> list[dict]:
    """Return tool definitions.

    Results are cached. Call invalidate_tool_defs_cache()
    if TOOLS list is modified at runtime (e.g. by tests).
    """
    global _tool_defs_cache
    if _tool_defs_cache is not None:
        return _tool_defs_cache
    _tool_defs_cache = [
        {
            "name": t["name"],
            "description": t["description"],
            "input_schema": t["input_schema"],
        }
        for t in TOOLS
    ]
    return _tool_defs_cache


def invalidate_tool_defs_cache() -> None:
    """Clear the tool definitions cache.

    Call after modifying TOOLS at runtime (e.g. in tests) or after
    config changes that affect tool availability.
    """
    global _tool_defs_cache
    _tool_defs_cache = None
