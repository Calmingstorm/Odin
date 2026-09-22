"""Tool definitions — spawn_agent … wait_for_agents (slice 7/9 of the original TOOLS order).

RFC-004 P1: verbatim positional slice. ORDER IS BEHAVIOR (the tool
catalog feeds prompt assembly) — do not reorder, and do not move
tools between sections; the characterization contract pins the
concatenated order exactly.

The spawn_agent description is composed from a base plus INDEPENDENT per-axis
clauses. The tool catalog re-exposes each axis's field + clause only when the
matching agent config axis is "auto" (see
``src/tools/agent_tool_policy.py``); the static definitions here carry both
(the canonical form). Keep the clauses independent — never combine them into
"model and/or effort" wording, or a single-axis schema would read wrong.
"""

# Base spawn descriptions (no per-axis clause) + the independent axis clauses.
SPAWN_AGENT_BASE_DESC = (
    "Spawns an autonomous agent for a sub-task. Runs silently in background with "
    "isolated context; it may spawn its own sub-agents up to the nesting limit. "
    "Results are NOT posted to Discord — use wait_for_agents to collect results, then "
    "deliver a cohesive summary yourself. Max 5/channel; lifetime limit for NEW agents: "
    "14400 seconds. Budget warnings "
    "injected near iteration limit."
)
# Ordered spawn model catalogue: (model, description). ONE ordered constant
# drives BOTH surfaces — the SPAWN_MODEL_CLAUSE tool description and the
# `model` property description — so the two can never disagree, and the seed
# hints in model_hints_seed.json carry these descriptions verbatim.
# ORDER IS BEHAVIOR: it is the operator's preference ranking, GPT-6 tier first.
# gpt-6-sol is the balanced default and gpt-5.6-terra is NOT: terra costs more
# than sol, so a pure-Codex install must not be steered to the older tier.
SPAWN_MODEL_DESCRIPTIONS: list[tuple[str, str]] = [
    (
        "gpt-6-astra",
        "flagship: deepest reasoning for the hardest, highest-stakes work; the most "
        "expensive GPT-6 tier; rejects effort 'none'",
    ),
    (
        "gpt-6-sol",
        "balanced default: complex coding and agentic work at near-Astra reliability, "
        "and cheaper than gpt-5.6-terra",
    ),
    (
        "gpt-6-luna",
        "cheapest GPT-6: focused, high-volume work with a clear goal; raise effort "
        "before escalating",
    ),
    (
        "gpt-5.6-sol",
        "previous generation; gpt-6-sol is stronger and cheaper, so use it only as a "
        "fallback",
    ),
    (
        "gpt-5.6-terra",
        "previous-generation mid tier; costs more than gpt-6-sol, so use it only as a "
        "fallback",
    ),
    (
        "gpt-5.6-luna",
        "previous-generation small tier; gpt-6-luna is stronger and cheaper, so use it "
        "only as a fallback",
    ),
]
SPAWN_MODEL_CLAUSE = (
    " Set 'model' to run THIS agent on a specific Codex model — "
    + ", ".join(f"{model} ({desc})" for model, desc in SPAWN_MODEL_DESCRIPTIONS)
    + "; match the tier to the task. A model selection is required."
)
SPAWN_MODEL_PROPERTY_DESC = (
    "Required Codex model for this agent. "
    + "; ".join(f"{model} = {desc}" for model, desc in SPAWN_MODEL_DESCRIPTIONS)
    + ". Choose a model explicitly."
)

# One ordered constant drives every per-spawn effort enum and clause below —
# kept in lockstep with config.schema.CODEX_REASONING_EFFORTS by a sync test
# (this module stays deliberately import-free). The spawn boundary rejects
# every known-incompatible model/effort pair, including astra + none.
SPAWN_EFFORT_OPTIONS: list[str] = ["none", "low", "medium", "high", "xhigh", "max"]
SPAWN_THINKING_OPTIONS: list[str] = ["adaptive", "enabled", "disabled"]
SPAWN_THINKING_CLAUSE = (
    " Set 'thinking_mode' (adaptive/enabled/disabled) for THIS compatible-model agent. "
    "This is a discrete provider thinking switch, not reasoning_effort. "
    "Omit to use configured policy."
)
SPAWN_NEUTRAL_REASONING_OPTIONS: list[str] = [
    "none",
    "low",
    "medium",
    "high",
    "xhigh",
    "max",
]
SPAWN_NEUTRAL_REASONING_CLAUSE = (
    " Set 'reasoning' (none/low/medium/high/xhigh/max) for THIS agent. This neutral scale is "
    "translated to the chosen model's supported native reasoning control. Omit to use "
    "that model's configured default."
)


# The ONE load-bearing required-wording tail, shared by the tool-level clause
# AND the field-level property descriptions — a single source so no catalogue
# surface can ever disagree about whether omission is a valid spelling.
SPAWN_EFFORT_REQUIRED_TAIL = (
    "REQUIRED here: the configured default effort is not supported by the "
    "configured agent model, so pick a compatible effort explicitly."
)


def spawn_effort_clause(options: list[str], *, required: bool = False) -> str:
    """Render the effort clause for an ordered option list.

    ONE wording template for both the static catalogue and the policy layer's
    capability-filtered clones (a filtered enum with an unfiltered clause
    would advertise efforts the schema no longer offers). Callers pass a
    subsequence of ``SPAWN_EFFORT_OPTIONS`` — never a sorted set, which would
    scramble the intentional escalation order. ``required`` swaps the
    omit-to-inherit tail for explicit-choice wording: when the configured
    agent model cannot serve the inherited default, omission would be an
    unservable spelling and must not be advertised.
    """
    tail = SPAWN_EFFORT_REQUIRED_TAIL if required else "Omit to use the configured agent effort."
    return (
        " Set 'reasoning_effort' (" + "/".join(options) + ") for THIS agent — "
        "higher is more thorough but slower/costlier. " + tail
    )


def spawn_effort_property_desc(tool_name: str, *, required: bool = False) -> str:
    """Render the ``reasoning_effort`` PROPERTY description — the field-level
    twin of ``spawn_effort_clause``. The static definitions below use the
    optional form (byte-identical to the historical text); the policy layer
    re-renders the required form onto clones, sharing
    ``SPAWN_EFFORT_REQUIRED_TAIL`` so the property description, the tool
    clause, and the required list can never contradict each other.
    """
    required_lead = "Reasoning effort for this agent — higher is more thorough but slower/costlier."
    optional_lead = (
        "Optional reasoning effort for this agent — higher is more thorough but slower/costlier."
    )
    if required:
        return required_lead + " " + SPAWN_EFFORT_REQUIRED_TAIL
    return optional_lead + " Omit to inherit the configured agent effort."


SPAWN_EFFORT_CLAUSE = spawn_effort_clause(SPAWN_EFFORT_OPTIONS)

TOOLS_SECTION: list[dict] = [
    # --- Agent orchestration ---
    {
        "name": "spawn_agent",
        "description": SPAWN_AGENT_BASE_DESC
        + SPAWN_MODEL_CLAUSE
        + SPAWN_EFFORT_CLAUSE,
        "input_schema": {
            "type": "object",
            "properties": {
                "label": {"type": "string", "description": "Short name (e.g. 'disk-audit')"},
                "goal": {"type": "string", "description": "Full task description for the agent"},
                "model": {
                    "type": "string",
                    "description": SPAWN_MODEL_PROPERTY_DESC,
                },
                "reasoning_effort": {
                    "type": "string",
                    "enum": SPAWN_EFFORT_OPTIONS,
                    "description": spawn_effort_property_desc("spawn_agent"),
                },
                "parent_id": {
                    "type": "string",
                    "description": (
                        "Parent agent ID for nested spawns (optional, set automatically when "
                        "spawning from within an agent)"
                    ),
                },
            },
            "required": ["label", "goal", "model"],
        },
    },
    {
        "name": "send_to_agent",
        "description": (
            "Queues a message to a running agent for its next safe boundary. "
            "Wakes an agent waiting for children; does not cancel ordinary tools. "
            "Acknowledges queued, not consumed. Use for instructions, data, or corrections."
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
            "pages with UTF-8 byte length, preview, truncation flag and continuation cursor, "
            "tools used, iteration count, and runtime. Repeat with cursor for complete output. "
            "Retained after live registry cleanup. Returns 'still running' if active."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "agent_id": {"type": "string", "description": "Agent ID"},
                "cursor": {"type": "string", "description": "Continuation from previous page"},
                "limit": {
                    "type": "integer",
                    "minimum": 4,
                    "maximum": 8000,
                    "description": "UTF-8 byte ceiling per page (default 4000, max 8000); "
                    "may be smaller to fit serialized delivery budget",
                },
            },
            "required": ["agent_id"],
        },
    },
    {
        "name": "wait_for_agents",
        "description": (
            "Waits for one or more agents to complete. "
            "Essential for fan-out (spawn N agents → wait → collect results) and "
            "pipeline (spawn A → wait → spawn B with A's output) coordination patterns. "
            "Returns a snapshot for every requested agent once all finish or timeout. "
            "Returns status snapshots with up to 800 UTF-8 bytes of result preview per agent, "
            "possibly less under the aggregate budget. Use get_agent_results and follow its "
            "cursor until truncated=false for complete output. "
            "Inside an agent, a parent message interrupts the wait; children continue."
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
]
