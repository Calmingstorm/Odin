"""Tool definitions — http_probe … email_list_recent (slice 9/9 of the original TOOLS order).

RFC-004 P1: verbatim positional slice. ORDER IS BEHAVIOR (the tool
catalog feeds prompt assembly) — do not reorder, and do not move
tools between sections; the characterization contract pins the
concatenated order exactly.
"""

TOOLS_SECTION: list[dict] = [
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
                        "GET",
                        "POST",
                        "PUT",
                        "DELETE",
                        "PATCH",
                        "HEAD",
                        "OPTIONS",
                    ],
                },
                "headers": {
                    "type": "object",
                    "description": (
                        'Request headers as key-value pairs (e.g. {"Authorization": "Bearer tok"})'
                    ),
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
            "Useful for filing bugs from loop reports, tracking remediation, "
            "and updating issue status."
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
                    "description": (
                        "Issue ID or key (for comment, get_issue, transition). "
                        "Linear: UUID. Jira: PROJECT-123"
                    ),
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
    # --- Image generation (native OpenAI or ComfyUI, per config) ---
    {
        "name": "generate_image",
        "description": (
            "Generates an image from a text prompt and posts it to Discord. The "
            "backend is chosen by config. Provide 'prompt'; add 'size' only when a "
            "specific size/aspect ratio is wanted."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "prompt": {
                    "type": "string",
                    "description": "Text description of the image to generate",
                },
                "size": {
                    "type": "string",
                    "description": "Optional size as WxH (e.g. '1024x1024', '1536x1024'). Any "
                    "specified size selects ComfyUI; OMIT it to let the native backend choose "
                    "its own dimensions and aspect ratio. Only pass it if the user asked for a "
                    "specific size.",
                },
                "negative": {
                    "type": "string",
                    "description": "ComfyUI only — negative prompt. Selects ComfyUI; rejected "
                    "by the OpenAI backend. Omit unless the user specifically wants one.",
                },
                "model": {
                    "type": "string",
                    "description": "ComfyUI only — checkpoint name. Selects ComfyUI. The OpenAI "
                    "image model is set in config, not here. Omit unless a checkpoint is named.",
                },
            },
            "required": ["prompt"],
        },
    },
    # --- Post-action validation ---
    {
        "name": "validate_action",
        "is_core": True,
        "description": (
            "Runs a bundle of validation checks after an operational change (deploy, "
            "restart, config "
            "push, migration) to confirm the system is actually healthy — not just "
            "that the preceding "
            "commands returned exit 0. Checks run concurrently on managed hosts. "
            "Never blocks; verdict "
            "is informational. Verdict: 'pass' (all OK), 'degraded' (only warn-severity failures), "
            "'fail' (≥1 critical failure), 'error' (every check errored — likely config issue). "
            "ALWAYS call this automatically after deploys, service restarts, "
            "container replacements, "
            "compose up/down, config writes to running services, firewall changes, DNS updates, "
            "schema migrations — do not wait to be asked. "
            "Cost: low-medium. Risk: none. Latency: depends on slowest check.\n"
            "\n"
            "Check types:\n"
            "  http            target=URL, expected=status code or list "
            "(default [200,201,204,301,302,307,308])\n"
            "  port            target='host:port' or just 'port' (implies 127.0.0.1)\n"
            "  service         target=systemd unit name, expected='active' or list of states\n"
            "  process         target=pgrep pattern\n"
            "  log_absent      target='unit=NAME:PATTERN' or plain regex — passes if "
            "pattern NOT found\n"
            "  log_present     same target format — passes if pattern IS found\n"
            "  command         target=shell command, compare='exit_zero'|'exit_nonzero'"
            "|'contains'|'not_contains'|'equals'|'regex_match'\n"
            "\n"
            "Each check: {type, target, severity?, host?, expected?, compare?, "
            "window_seconds?, timeout_seconds?, name?}.\n"
            "Severity 'critical' (default), 'warn', or 'info'. Only critical failures "
            "flip verdict to 'fail'."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "bundle_name": {
                    "type": "string",
                    "description": "Short label for this bundle (e.g. 'after_nginx_restart')",
                },
                "default_host": {
                    "type": "string",
                    "description": (
                        "Host alias used for any check without an explicit 'host'. "
                        "Uses the requester's explicit default-host policy when omitted."
                    ),
                },
                "grace_seconds": {
                    "type": "integer",
                    "description": (
                        "Optional wait before running checks (0-60), to let services settle."
                    ),
                },
                "max_parallel": {
                    "type": "integer",
                    "description": (
                        "Max concurrent checks within this bundle (default 12, cap 25). "
                        "Use a lower value when validating against a "
                        "resource-constrained host."
                    ),
                },
                "format": {
                    "type": "string",
                    "description": (
                        "Output format: 'summary' (human-readable, default) or 'json' "
                        "(full structured report)."
                    ),
                },
                "checks": {
                    "type": "array",
                    "description": "List of validation checks (max 25).",
                    "items": {
                        "type": "object",
                        "properties": {
                            "type": {
                                "type": "string",
                                "description": (
                                    "http|port|service|process|log_absent|log_present|command"
                                ),
                            },
                            "target": {"type": "string"},
                            "expected": {
                                "description": "Type-specific expectation (int, string, list)"
                            },
                            "severity": {
                                "type": "string",
                                "description": "critical (default) | warn | info",
                            },
                            "host": {"type": "string"},
                            "compare": {"type": "string"},
                            "window_seconds": {"type": "integer"},
                            "timeout_seconds": {"type": "integer"},
                            "name": {"type": "string"},
                        },
                        "required": ["type", "target"],
                    },
                },
            },
            "required": ["checks"],
        },
    },
    # --- Email tools (conditional on config.email.enabled) ---
    {
        "name": "email_send",
        "description": (
            "Send an email via SMTP. Returns the sent message ID and recipient "
            "list. Supports plain-text body, CC/BCC, reply-to, and file "
            "attachments from allowed directories."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "to": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Recipient email addresses",
                },
                "subject": {"type": "string", "description": "Email subject line"},
                "body": {"type": "string", "description": "Plain-text email body"},
                "cc": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "CC recipients (optional)",
                },
                "bcc": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "BCC recipients (optional)",
                },
                "reply_to": {"type": "string", "description": "Reply-To address (optional)"},
                "attachments": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "File paths to attach (must be within allowed_attachment_dirs)",
                },
            },
            "required": ["to", "subject", "body"],
        },
    },
    {
        "name": "email_search",
        "description": (
            "Search email via IMAP. On Gmail, uses native Gmail search syntax "
            "(e.g. 'from:alice newer_than:7d has:attachment subject:invoice'). "
            "On other providers, uses standard IMAP SEARCH criteria "
            "(e.g. 'FROM \"alice\" SINCE 01-Jun-2026'). Returns message summaries."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search query"},
                "folder": {"type": "string", "description": "Mailbox folder (default: INBOX)"},
                "limit": {
                    "type": "integer",
                    "description": "Max results to return (default: 20)",
                },
            },
            "required": ["query"],
        },
    },
    {
        "name": "email_read",
        "description": (
            "Read a specific email by UID. Returns full headers, plain-text body "
            "(truncated to configured limit), and attachment metadata. "
            "Use email_search or email_list_recent to find UIDs first."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "uid": {"type": "string", "description": "Message UID from search/list results"},
                "folder": {"type": "string", "description": "Mailbox folder (default: INBOX)"},
            },
            "required": ["uid"],
        },
    },
    {
        "name": "email_list_recent",
        "description": (
            "List the most recent emails in a folder. Returns summaries with "
            "sender, subject, date, size, and flags. Use email_read for full content."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "folder": {"type": "string", "description": "Mailbox folder (default: INBOX)"},
                "limit": {
                    "type": "integer",
                    "description": "Number of recent messages (default: 10)",
                },
            },
        },
    },
]
