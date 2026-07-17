"""Tool definitions — spawn_agent … collect_loop_agents (slice 7/9 of the original TOOLS order).

RFC-004 P1: verbatim positional slice. ORDER IS BEHAVIOR (the tool
catalog feeds prompt assembly) — do not reorder, and do not move
tools between sections; the characterization contract pins the
concatenated order exactly.
"""

TOOLS_SECTION: list[dict] = [
    # --- Agent orchestration ---
    {
        "name": "spawn_agent",
        "description": (
            "Spawns an autonomous agent for a sub-task. Runs silently in background with "
            "isolated context; it may spawn its own sub-agents up to the nesting limit. "
            "Results are NOT posted to Discord — use wait_for_agents to collect results, then "
            "deliver a cohesive summary yourself. Max 5/channel, 4h lifetime. Budget warnings "
            "injected near iteration limit. Optionally set 'model' and/or 'reasoning_effort' to "
            "run THIS agent on a specific Codex model/effort — match the tier to the work; omit "
            "to inherit your configured agent defaults."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "label": {"type": "string", "description": "Short name (e.g. 'disk-audit')"},
                "goal": {"type": "string", "description": "Full task description for the agent"},
                "model": {
                    "type": "string",
                    "description": (
                        "Optional Codex model for this agent. gpt-5.6-sol = deepest reasoning, "
                        "best for hard multi-step or ambiguous work; gpt-5.6-terra = balanced, "
                        "a solid default for most tasks; gpt-5.6-luna = fastest/cheapest, good "
                        "for simple lookups and mechanical work. Omit to inherit the configured "
                        "agent model."
                    ),
                },
                "reasoning_effort": {
                    "type": "string",
                    "enum": ["none", "low", "medium", "high", "xhigh"],
                    "description": (
                        "Optional reasoning effort for this agent — higher is more thorough but "
                        "slower/costlier. Omit to inherit the configured agent effort."
                    ),
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
        "description": (
            "Spawns agents from a loop iteration with context. Max 3/iter, 10/loop. Each task "
            "may set its own 'model'/'reasoning_effort' to run on a specific Codex tier "
            "(sol=deepest, terra=balanced, luna=fastest); omit to inherit the agent defaults."
        ),
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
                                    "Optional Codex model for this agent: gpt-5.6-sol "
                                    "(deepest), gpt-5.6-terra (balanced), gpt-5.6-luna "
                                    "(fastest). Omit to inherit the configured agent model."
                                ),
                            },
                            "reasoning_effort": {
                                "type": "string",
                                "enum": ["none", "low", "medium", "high", "xhigh"],
                                "description": (
                                    "Optional reasoning effort (higher = more thorough, "
                                    "slower). Omit to inherit the configured agent effort."
                                ),
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
