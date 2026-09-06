TOOLS_SECTION = [{
    "name": "get_tool_output",
    "description": (
        "Read retained tool evidence without re-running its tool. "
        "Follow cursor until truncated=false. "
        "Pages are contiguous head-only; initial labelled tails are context only. "
        "Evidence expires 24 hours after capture (fixed TTL), with per-result/global quotas. "
        "Original caller, channel, tool permission and host scope are rechecked; "
        "a cursor is not permission. "
        "For process spools use the returned manage_process retrieval arguments instead."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "cursor": {"type": "string",
                       "description": "Exact cursor returned by tool output delivery."},
            "limit": {"type": "integer", "minimum": 4, "maximum": 8000, "default": 4000,
                      "description": "Maximum code points; envelope budget may yield fewer."},
        },
        "required": ["cursor"],
    },
}]
