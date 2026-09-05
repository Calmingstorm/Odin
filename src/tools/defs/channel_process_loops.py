"""Tool definitions — read_channel … list_loops (slice 6/9 of the original TOOLS order).

RFC-004 P1: verbatim positional slice. ORDER IS BEHAVIOR (the tool
catalog feeds prompt assembly) — do not reorder, and do not move
tools between sections; the characterization contract pins the
concatenated order exactly.
"""

TOOLS_SECTION: list[dict] = [
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
        "description": (
            "Adds an emoji reaction to a message. Unicode emoji or custom format (<:name:id>)."
        ),
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
                "duration_hours": {
                    "type": "integer",
                    "description": "Poll duration in hours (default 24)",
                },
                "multiple": {
                    "type": "boolean",
                    "description": "Allow multiple selections (default false)",
                },
            },
            "required": ["question", "options"],
        },
    },
    # --- Process management ---
    {
        "name": "manage_process",
        "is_core": True,
        "description": (
            "Manages local or remote background processes (start/poll/write/kill/list). "
            "Start spawns a detached command on the selected managed host and returns PID. "
            "Poll defaults to newest 50 lines, with emitted/retained/shown-byte "
            "and capture-loss metadata. Use poll with offset=0 or the returned "
            "generation-bound cursor and limit (default 4000, 4-8000 UTF-8 bytes) "
            "for repeatable retained-output pages; follow cursor until truncated=false. "
            "Reads never consume another reader's output. Local and remote capture "
            "retain at most 4 MiB. "
            "Output stays read-only for 24 hours after exit; access is rechecked on every read. "
            "Write sends stdin; Kill verifies process-group termination. "
            "Max 20 concurrent, auto-killed after 1hr. When monitoring a "
            "long-running process (build, test suite, download), poll with "
            "wait_seconds (60 is a good default) — one call waits server-side "
            "until exit or the deadline, instead of many rapid polls."
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
                "wait_seconds": {
                    "type": "number",
                    "description": (
                        "Poll only: wait up to this many seconds (0-120) for "
                        "the process to exit before reporting. 0 (default) "
                        "reports immediately. Exit ends the wait early."
                    ),
                },
                "cursor": {
                    "type": "string",
                    "description": (
                        "Poll only: opaque job-generation output cursor; "
                        "do not combine with offset."
                    ),
                },
                "offset": {
                    "type": "integer", "minimum": 0,
                    "description": (
                        "Poll only: retained-output UTF-8 byte offset "
                        "(0 begins complete retrieval)."
                    ),
                },
                "limit": {
                    "type": "integer", "minimum": 4, "maximum": 8000,
                    "description": (
                        "Poll page maximum UTF-8 bytes (default 4000); "
                        "complete envelope may reduce the page."
                    ),
                },
            },
            "required": ["action"],
        },
    },
    # --- List management ---
    {
        "name": "manage_list",
        "is_core": True,
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
                        "add",
                        "remove",
                        "show",
                        "clear",
                        "mark_done",
                        "mark_undone",
                        "list_all",
                    ],
                    "description": (
                        "'list_all' shows all lists. Other actions operate on a specific list_name."
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
                    "description": (
                        "notify = report always, act = act + report, silent = act, report only if "
                        "notable"
                    ),
                },
                "stop_condition": {
                    "type": "string",
                    "description": (
                        "Auto-stop condition, e.g. 'when disk below 50%' or 'after 5 iterations'. "
                        "Evaluated each cycle."
                    ),
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
        "description": (
            "Stops an autonomous loop by ID. Use 'all' to stop all loops. To list loops first, use "
            "list_loops."
        ),
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
        "description": (
            "Lists all autonomous loops with status, iterations, and last activity. To create, use "
            "start_loop. To stop, use stop_loop."
        ),
        "input_schema": {
            "type": "object",
            "properties": {},
        },
    },
]
