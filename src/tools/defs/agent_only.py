"""Agent-only built-in definitions; deliberately absent from the static catalogue.

Like the computer definitions, these live outside ``TOOLS`` so the static
catalog's order and pinned hashes stay unchanged. Unlike them, they are
composed ONLY into spawned agents' catalogs (``agent_tool_policy``): the main
turn, loops, schedules and skills never see them, and dispatch refuses any call
that is not a spawned agent's own (``src/agents/reports.py``). The names stay
reserved built-ins, so ``tools.disabled_tools`` can disable them and no skill or
MCP tool can shadow them.
"""

from copy import deepcopy

REPORT_TOOL_NAME = "report_to_parent"

_DEFINITIONS: list[dict] = [
    {
        "name": REPORT_TOOL_NAME,
        "description": (
            "Queues an interim report for the parent agent or conversation that spawned you. "
            "Returns a receipt at once without waiting for a reply; keep working. A queued "
            "report may reach the recipient at a later step while it is still running; it "
            "never wakes their waits or interrupts their work. Use it for a blocker or "
            "question, a finding that changes the plan, or a milestone they asked for, not "
            "for routine progress. Any reply arrives as a parent message. Your final result "
            "must still contain everything they need."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "message": {
                    "type": "string",
                    "description": (
                        "The report: what you found or need, and what you are doing meanwhile."
                    ),
                },
            },
            "required": ["message"],
        },
    },
]

AGENT_ONLY_TOOL_NAMES: frozenset[str] = frozenset(tool["name"] for tool in _DEFINITIONS)


def agent_only_definitions() -> list[dict]:
    """Affordance-decorated copies; callers never mutate the shared contract."""
    from ..affordances import decorate_description

    tools = deepcopy(_DEFINITIONS)
    for tool in tools:
        tool["description"] = decorate_description(tool["name"], tool["description"])
    return tools
