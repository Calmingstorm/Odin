"""Tool definitions — purge_messages … parse_time (slice 2/9 of the original TOOLS order).

RFC-004 P1: verbatim positional slice. ORDER IS BEHAVIOR (the tool
catalog feeds prompt assembly) — do not reorder, and do not move
tools between sections; the characterization contract pins the
concatenated order exactly.
"""

TOOLS_SECTION: list[dict] = [
    # --- Discord operations ---
    {
        "name": "purge_messages",
        "description": (
            "Deletes recent messages in the current Discord channel and resets conversation "
            "history. Default 100, max 500."
        ),
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
        "description": (
            "Fetches a file from a managed host and posts it as a Discord attachment. Max 25MB. "
            "For generated content, use generate_file."
        ),
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
        "is_core": True,
        "description": (
            "Creates a file (script, code, CSV, report, etc.) and posts it as a Discord "
            "attachment. For files on a host, use post_file."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "filename": {
                    "type": "string",
                    "description": (
                        "Filename with extension (e.g. 'containers.csv', 'report.md', 'deploy.sh')"
                    ),
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
        "is_core": True,
        "description": (
            "Schedules a recurring (cron), one-time (run_at), or webhook-triggered task. "
            "Use parse_time to convert natural language to run_at. "
            "Actions: 'reminder' = post message, 'check' = run_command check, 'digest' = "
            "infrastructure digest, "
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
                    "description": (
                        "Cron expression for recurring tasks (e.g. '0 9 * * *' = daily 9am). Omit "
                        "for one-time."
                    ),
                },
                "cron_timezone": {
                    "type": "string",
                    "description": (
                        "IANA timezone for the cron expression (e.g. 'America/New_York'). The task "
                        "fires on that timezone's wall clock across DST. Defaults to UTC."
                    ),
                },
                "run_at": {
                    "type": "string",
                    "description": (
                        "ISO datetime for one-time tasks (e.g. '2026-03-20T09:00'). Use parse_time "
                        "to convert natural language. Omit for recurring."
                    ),
                },
                "trigger": {
                    "type": "object",
                    "description": (
                        'Webhook trigger (AND logic). E.g. {"source": "github", "event": '
                        '"push", "repo": "myproject"}.'
                    ),
                    "properties": {
                        "source": {
                            "type": "string",
                            "enum": [
                                "gitea",
                                "grafana",
                                "generic",
                                "github",
                                "gitlab",
                                "discord_reaction",
                                "discord_message",
                            ],
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
                    "description": (
                        "'reminder' = post message, 'check' = run_command check, 'digest' = "
                        "infrastructure digest, 'workflow' = multi-step tool chain"
                    ),
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
                    "description": (
                        "Parameters for the tool (for action='check'). Alternatively use the "
                        "'command' and 'host' shortcuts below for run_command."
                    ),
                },
                "command": {
                    "type": "string",
                    "description": (
                        "Shortcut: shell command to run (auto-builds tool_input for run_command). "
                        "Use this instead of nesting inside tool_input."
                    ),
                },
                "host": {
                    "type": "string",
                    "description": (
                        "Shortcut: target host (default 'localhost'). Paired with 'command' for "
                        "run_command checks."
                    ),
                },
                "steps": {
                    "type": "array",
                    "description": (
                        "Workflow steps (sequential). Each step MUST include tool_input populated "
                        "with that tool's parameters."
                    ),
                    "items": {
                        "type": "object",
                        "properties": {
                            "tool_name": {"type": "string", "description": "Tool to run"},
                            "tool_input": {
                                "type": "object",
                                "description": (
                                    "REQUIRED — parameters for tool_name, e.g. "
                                    "{'host':'localhost','command':'ls'} for run_command"
                                ),
                            },
                            "description": {"type": "string", "description": "Step description"},
                            "condition": {
                                "type": "string",
                                "description": "Run if previous output contains this (! to negate)",
                            },
                            "on_failure": {
                                "type": "string",
                                "enum": ["abort", "continue"],
                                "description": "Default: abort",
                            },
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
        "is_core": True,
        "description": (
            "Lists all scheduled tasks with IDs, descriptions, and next run times. To delete, use "
            "delete_schedule."
        ),
        "input_schema": {
            "type": "object",
            "properties": {},
        },
    },
    {
        "name": "update_schedule",
        "is_core": True,
        "description": (
            "Updates an existing schedule by ID. Only provided fields are changed. "
            "Can change description, cron, run_at, trigger, message, tool_name, tool_input, steps, "
            "channel_id, or paused. "
            "Changing timing (cron/run_at/trigger) replaces the previous timing mode. "
            "Set paused=true to suspend a schedule without deleting it; paused=false to resume."
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
                "cron_timezone": {
                    "type": "string",
                    "description": (
                        "IANA timezone for the cron expression (e.g. 'America/New_York'). Defaults "
                        "to UTC."
                    ),
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
                "paused": {
                    "type": "boolean",
                    "description": "Pause (true) or resume (false) the schedule",
                },
            },
            "required": ["schedule_id"],
        },
    },
    {
        "name": "delete_schedule",
        "is_core": True,
        "description": (
            "Deletes a scheduled task by ID. To list schedules first, use list_schedules."
        ),
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
        "is_core": True,
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
                    "description": (
                        "Natural language time (e.g. 'in 2 hours', 'tomorrow at 9am', 'next Friday "
                        "at 3pm')"
                    ),
                },
            },
            "required": ["expression"],
        },
    },
]
