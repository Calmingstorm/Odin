"""Tool definitions — delegate_task … delete_knowledge (slice 4/9 of the original TOOLS order).

RFC-004 P1: verbatim positional slice. ORDER IS BEHAVIOR (the tool
catalog feeds prompt assembly) — do not reorder, and do not move
tools between sections; the characterization contract pins the
concatenated order exactly.
"""

TOOLS_SECTION: list[dict] = [
    # --- Background task delegation ---
    {
        "name": "delegate_task",
        "is_core": True,
        "description": (
            "Runs a multi-step task in the background, posting progress to Discord. "
            "Steps run sequentially with conditions (substring match, ! to negate), "
            "on_failure (abort/continue), store_as ({var.name}), {prev_output} substitution. "
            "IMPORTANT: each step using run_command MUST have tool_input with 'command' key. "
            'Example step: {"tool_name": "run_command", "description": "List files", '
            '"tool_input": {"command": "ls -la /tmp"}}. '
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
                            "condition": {
                                "type": "string",
                                "description": (
                                    "Run if previous output contains this (prefix ! to negate)"
                                ),
                            },
                            "on_failure": {
                                "type": "string",
                                "enum": ["abort", "continue"],
                                "description": "Default: abort",
                            },
                            "store_as": {
                                "type": "string",
                                "description": "Save output as named variable",
                            },
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
        "is_core": True,
        "description": (
            "Lists background tasks. Without task_id: overview. With task_id: step-by-step "
            "details. See delegate_task, cancel_task."
        ),
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
        "is_core": True,
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
            "Search here FIRST before web_search. To add, use ingest_document. To list, use "
            "list_knowledge."
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
            "Re-ingesting same source replaces previous. For host files, use one complete, "
            "untruncated read_file raw=true response and ingest only its framed UTF-8 source "
            "content; exclude the metadata envelope, end marker, and continuation cursor; "
            "files too large for one raw read are not ingestible through this tool. Search with "
            "search_knowledge."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "source": {
                    "type": "string",
                    "description": (
                        "Document identifier (e.g. 'ansible/roles/apache/README.md', "
                        "'server-runbook')"
                    ),
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
        "description": (
            "Lists all knowledge base documents with source names and chunk counts. To search, use "
            "search_knowledge. To remove, use delete_knowledge."
        ),
        "input_schema": {
            "type": "object",
            "properties": {},
        },
    },
    {
        "name": "delete_knowledge",
        "description": (
            "Removes a document from the knowledge base by source name. To list sources first, use "
            "list_knowledge."
        ),
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
]
