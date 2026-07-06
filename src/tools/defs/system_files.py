"""Tool definitions — run_command … write_file (slice 1/9 of the original TOOLS order).

RFC-004 P1: verbatim positional slice. ORDER IS BEHAVIOR (the tool
catalog feeds prompt assembly) — do not reorder, and do not move
tools between sections; the characterization contract pins the
concatenated order exactly.
"""

TOOLS_SECTION: list[dict] = [
    # --- Shell execution ---
    {
        "name": "run_command",
        "is_core": True,
        "description": (
            "Runs a shell command on a managed host. Returns stdout/stderr (max 200 lines). On "
            "failure: 'Command failed (exit N): output'. For multi-line scripts, use run_script. "
            "For multiple hosts, use run_command_multi."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "host": {
                    "type": "string",
                    "description": "Host alias from config (e.g. 'myserver', 'webhost')",
                },
                "command": {
                    "type": "string",
                    "description": (
                        "Shell command to execute (single line; for multi-line use run_script)"
                    ),
                },
            },
            "required": ["host", "command"],
        },
    },
    {
        "name": "run_script",
        "is_core": True,
        "description": (
            "Runs a multi-line script on a managed host via temp file. Handles heredocs, code "
            "blocks, "
            "and complex quoting. Returns stdout/stderr (max 200 lines). On failure: 'Script "
            "failed (exit N): output'. "
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
        "is_core": True,
        "description": (
            "Runs a command on multiple hosts in parallel. Returns per-host '### "
            "hostname\\n```\\noutput\\n```'. Pass ['all'] for all configured hosts. For one host, "
            "use run_command."
        ),
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
        "is_core": True,
        "description": (
            "Returns the contents of a file on a managed host. Default 200 lines, max 1000. To "
            "write, use write_file. For multi-file analysis, use claude_code with "
            "allow_edits=false."
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
        "is_core": True,
        "description": (
            "Writes content to a file on a managed host (creates or overwrites). To read first, "
            "use read_file. For multi-file edits, use claude_code."
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
]
