"""Tool definitions — browser_screenshot … analyze_pdf (slice 5/9 of the original TOOLS order).

RFC-004 P1: verbatim positional slice. ORDER IS BEHAVIOR (the tool
catalog feeds prompt assembly) — do not reorder, and do not move
tools between sections; the characterization contract pins the
concatenated order exactly.
"""

TOOLS_SECTION: list[dict] = [
    # --- Browser automation ---
    {
        "name": "browser_screenshot",
        "description": (
            "Takes a screenshot of a URL (renders JavaScript) and posts to Discord. Works on "
            "dashboards, SPAs, and dynamic pages unlike fetch_url. For text, use browser_read_page."
        ),
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
                    "description": (
                        "Extra wait after page load for dynamic content (default 0, max 10)"
                    ),
                },
            },
            "required": ["url"],
        },
    },
    {
        "name": "browser_read_page",
        "description": (
            "Reads a URL's text content (renders JavaScript). Returns 'Title (url)\\n\\ntext'. "
            "Works on SPAs/dynamic pages unlike fetch_url. Scope via CSS selector. For tables, use "
            "browser_read_table. For screenshots, use browser_screenshot."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "url": {
                    "type": "string",
                    "description": "URL to read",
                },
                "selector": {
                    "type": "string",
                    "description": (
                        "CSS selector to scope extraction (e.g. '#main-content', '.results')"
                    ),
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
        "description": (
            "Extracts an HTML table from a URL as markdown (| col | col |). Renders JavaScript. "
            "For text, use browser_read_page."
        ),
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
        "description": (
            "Navigates to a URL and clicks an element by CSS selector. Returns a confirmation "
            "summary after clicking. To fill forms, use browser_fill. To read page content after "
            "clicking, follow up with browser_read_page."
        ),
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
        "description": (
            "Navigates to a URL and fills a form field by CSS selector. Optionally submits by "
            "pressing Enter. To click buttons, use browser_click."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "url": {
                    "type": "string",
                    "description": "URL to navigate to",
                },
                "selector": {
                    "type": "string",
                    "description": (
                        "CSS selector of the input (e.g. '#username', 'input[name=password]')"
                    ),
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
        "description": (
            "Evaluates JavaScript on a URL and returns the result. For custom scraping or "
            "interaction."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "url": {
                    "type": "string",
                    "description": "URL to navigate to",
                },
                "expression": {
                    "type": "string",
                    "description": (
                        "JavaScript expression (e.g. 'document.title', "
                        "'document.querySelectorAll(\"a\").length')"
                    ),
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
        "description": (
            "Searches the web via DuckDuckGo. Returns 'N. title\\nurl\\nsnippet' (max 10). For "
            "full content, use fetch_url or browser_read_page."
        ),
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
        "description": (
            "Fetches a URL and returns text (HTML→readable text, JSON passed through). Static only "
            "— for JS-rendered pages use browser_read_page."
        ),
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
    # --- Permissions ---
    {
        "name": "set_permission",
        "description": (
            "Sets a Discord user's permission tier. Admin-only. Tiers: admin (full access), user "
            "(read-only), guest (chat only)."
        ),
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
        "description": (
            "Extracts text from a PDF (URL or host:path). Returns markdown text (max 12000 chars). "
            "For image-heavy PDFs, use browser_screenshot."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "URL to fetch PDF from"},
                "host": {"type": "string", "description": "Host alias for file-based PDF"},
                "path": {"type": "string", "description": "File path on host"},
                "pages": {
                    "type": "string",
                    "description": "Page range, e.g. '1-5' or '3' (default: all)",
                },
            },
        },
    },
]
