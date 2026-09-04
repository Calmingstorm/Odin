"""Tool definitions — spawn_agent … collect_loop_agents (slice 7/9 of the original TOOLS order).

RFC-004 P1: verbatim positional slice. ORDER IS BEHAVIOR (the tool
catalog feeds prompt assembly) — do not reorder, and do not move
tools between sections; the characterization contract pins the
concatenated order exactly.

The spawn_agent / spawn_loop_agents descriptions are composed from a base plus
INDEPENDENT per-axis clauses. The tool catalog re-exposes each axis's field +
clause only when the matching agent config axis is "auto" (see
``src/tools/agent_tool_policy.py``); the static definitions here carry both
(the canonical form). Keep the clauses independent — never combine them into
"model and/or effort" wording, or a single-axis schema would read wrong.
"""

# Base spawn descriptions (no per-axis clause) + the independent axis clauses.
SPAWN_AGENT_BASE_DESC = (
    "Spawns an autonomous agent for a sub-task. Runs silently in background with "
    "isolated context; it may spawn its own sub-agents up to the nesting limit. "
    "Results are NOT posted to Discord — use wait_for_agents to collect results, then "
    "deliver a cohesive summary yourself. Max 5/channel, 4h lifetime. Budget warnings "
    "injected near iteration limit."
)
SPAWN_LOOP_BASE_DESC = "Spawns agents from a loop iteration with context. Max 3/iter, 10/loop."
SPAWN_MODEL_CLAUSE = (
    " Set 'model' to run THIS agent on a specific Codex model — gpt-6-astra (GPT-6 "
    "generation: the newest and strongest reasoning tier, for the hardest multi-step "
    "work; rejects effort 'none'), gpt-5.6-sol (deepest 5.6 reasoning, for "
    "hard/ambiguous work), gpt-5.6-terra (balanced default), gpt-5.6-luna (fastest, "
    "for simple/mechanical work); match the tier to the task. Omit to use the "
    "configured agent model."
)
# One ordered constant drives every per-spawn effort enum and clause below —
# kept in lockstep with config.schema.CODEX_REASONING_EFFORTS by a sync test
# (this module stays deliberately import-free). "max" is gpt-5.6-family only;
# the spawn boundary rejects known-incompatible model/effort pairs.
SPAWN_EFFORT_OPTIONS: list[str] = ["none", "low", "medium", "high", "xhigh", "max"]


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
    if tool_name == "spawn_loop_agents":
        required_lead = "Reasoning effort (higher = more thorough, slower)."
        optional_lead = "Optional reasoning effort (higher = more thorough, slower)."
    else:
        required_lead = (
            "Reasoning effort for this agent — higher is more thorough but slower/costlier."
        )
        optional_lead = (
            "Optional reasoning effort for this agent — higher is more thorough but "
            "slower/costlier."
        )
    if required:
        return required_lead + " " + SPAWN_EFFORT_REQUIRED_TAIL
    return optional_lead + " Omit to inherit the configured agent effort."


SPAWN_EFFORT_CLAUSE = spawn_effort_clause(SPAWN_EFFORT_OPTIONS)

TOOLS_SECTION: list[dict] = [
    # --- Agent orchestration ---
    {
        "name": "spawn_agent",
        "description": SPAWN_AGENT_BASE_DESC + SPAWN_MODEL_CLAUSE + SPAWN_EFFORT_CLAUSE,
        "input_schema": {
            "type": "object",
            "properties": {
                "label": {"type": "string", "description": "Short name (e.g. 'disk-audit')"},
                "goal": {"type": "string", "description": "Full task description for the agent"},
                "model": {
                    "type": "string",
                    "description": (
                        "Optional Codex model for this agent. gpt-6-astra = GPT-6 generation, "
                        "the newest and strongest reasoning tier, for the hardest multi-step "
                        "work (rejects effort 'none'); gpt-5.6-sol = deepest 5.6 reasoning, "
                        "best for hard multi-step or ambiguous work; gpt-5.6-terra = balanced, "
                        "a solid default for most tasks; gpt-5.6-luna = fastest/cheapest, good "
                        "for simple lookups and mechanical work. Omit to inherit the configured "
                        "agent model."
                    ),
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
            "required": ["label", "goal"],
        },
    },
    {
        "name": "send_to_agent",
        "description": (
            "Sends a message to a running agent, injected as context in its next "
            "LLM turn. Use to provide additional instructions, data, or course corrections."
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
            "text, tools used, iteration count, and runtime. Returns 'still running' if active."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "agent_id": {"type": "string", "description": "Agent ID"},
            },
            "required": ["agent_id"],
        },
    },
    {
        "name": "wait_for_agents",
        "description": (
            "Waits for one or more agents to complete and returns their results. "
            "Essential for fan-out (spawn N agents → wait → collect results) and "
            "pipeline (spawn A → wait → spawn B with A's output) coordination patterns. "
            "Returns results for each agent once all finish or timeout."
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
    # --- Loop-Agent integration ---
    {
        "name": "spawn_loop_agents",
        "description": SPAWN_LOOP_BASE_DESC + SPAWN_MODEL_CLAUSE + SPAWN_EFFORT_CLAUSE,
        "input_schema": {
            "type": "object",
            "properties": {
                "loop_id": {"type": "string", "description": "Loop ID"},
                "tasks": {
                    "type": "array",
                    "description": "Agent tasks to spawn",
                    "items": {
                        "type": "object",
                        "properties": {
                            "label": {"type": "string", "description": "Agent name"},
                            "goal": {"type": "string", "description": "Agent task"},
                            "model": {
                                "type": "string",
                                "description": (
                                    "Optional Codex model for this agent: gpt-6-astra (GPT-6, "
                                    "strongest; rejects effort 'none'), gpt-5.6-sol (deepest "
                                    "5.6), gpt-5.6-terra (balanced), gpt-5.6-luna (fastest). "
                                    "Omit to inherit the configured agent model."
                                ),
                            },
                            "reasoning_effort": {
                                "type": "string",
                                "enum": SPAWN_EFFORT_OPTIONS,
                                "description": spawn_effort_property_desc("spawn_loop_agents"),
                            },
                        },
                        "required": ["label", "goal"],
                    },
                },
            },
            "required": ["loop_id", "tasks"],
        },
    },
    {
        "name": "collect_loop_agents",
        "description": "Collects results from loop-spawned agents. Omit agent_ids for all.",
        "input_schema": {
            "type": "object",
            "properties": {
                "loop_id": {"type": "string", "description": "Loop ID"},
                "agent_ids": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Agent IDs (omit for all)",
                },
                "timeout": {"type": "number", "description": "Seconds (default 300)"},
            },
            "required": ["loop_id"],
        },
    },
]
