"""Tool definitions — run_command … apply_patch (slice 1/9 of the original TOOLS order).

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
            "Returns a contiguous range from a file on a managed host. start_line is "
            "one-based; lines is a count (default 200, max 1000). Numbered output is the "
            "default. Set raw=true for byte-faithful UTF-8 text in a length-framed metadata "
            "envelope carrying the exact interval, truncation state, content byte count, and "
            "continuation cursor. Consume only the framed source content. "
            "Large ranges never use head+tail truncation. To edit files, use apply_patch."
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
                "start_line": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 9007199254740991,
                    "description": "One-based first source line to read (default 1)",
                },
                "lines": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 1000,
                    "description": "Number of lines to read (default 200, max 1000)",
                },
                "raw": {
                    "type": "boolean",
                    "description": (
                        "Return byte-faithful UTF-8 text in a length-framed metadata envelope "
                        "with explicit truncation/cursor state (default false)"
                    ),
                },
            },
            "required": ["host", "path"],
        },
    },
    {
        "name": "apply_patch",
        "is_core": True,
        "description": (
            "Applies a strict, context-checked patch to text files on a managed host. "
            "The host, absolute root directory, and patch text are all required; every file "
            "path inside the patch must be relative to root. Supports *** Add File, "
            "*** Update File (optionally *** Move to), and *** Delete File sections inside "
            "one *** Begin Patch / *** End Patch envelope. Update hunks start with @@; "
            "consecutive named @@ lines before a hunk body are ordered anchors, each sought "
            "after the previous one, and the body context is matched from the last anchor. "
            "The complete envelope is "
            "validated before any write, and multi-file application rolls back on failure. "
            "Requires a Linux host with glibc 2.28 or newer and filesystem support for "
            "renameat2(RENAME_NOREPLACE); no unsafe fallback is used."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "host": {
                    "type": "string",
                    "description": "Managed host alias; no default is inferred",
                },
                "root": {
                    "type": "string",
                    "description": "Existing absolute root directory for all relative patch paths",
                },
                "patch_text": {
                    "type": "string",
                    "description": (
                        "Complete *** Begin Patch / *** End Patch envelope using relative "
                        "POSIX paths"
                    ),
                },
            },
            "required": ["host", "root", "patch_text"],
        },
    },
]
