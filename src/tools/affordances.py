"""Tool affordance metadata — cost / risk / latency / preconditions.

The goal is to help the LLM choose between comparable tools by surfacing
*what each call is going to cost you* in four dimensions:

- **cost**: order-of-magnitude token/compute burden. `claude_code` is not
  the same kind of expensive as `read_file`.
- **risk**: what happens if the call goes wrong. `run_command` on an SSH
  host is categorically different from `web_search`.
- **latency**: how long a typical call takes. `fetch_url` is seconds;
  `claude_code` is minutes.
- **preconditions**: short list of hidden requirements ("SSH key must be
  configured for <host>", "browser must be started").

Descriptions stay human-readable. The merger appends a single-line
"[affordances: cost=... risk=... latency=...]" footer to each tool's
description at definition-build time. Not a separate object the LLM has
to query — it reads alongside the normal description.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum


class Cost(str, Enum):
    FREE = "free"          # in-process, no I/O
    LOW = "low"            # local filesystem / short local subprocess
    MEDIUM = "medium"      # one network round-trip or one SSH call
    HIGH = "high"          # many calls / large I/O / browser page
    VERY_HIGH = "very_high"  # LLM-in-tool, multi-file analysis


class Risk(str, Enum):
    NONE = "none"          # read-only, no state change
    LOW = "low"             # mostly read-only / reversible state change
    MEDIUM = "medium"       # state change, but scoped/reversible
    HIGH = "high"           # potentially destructive / side-effecty
    CRITICAL = "critical"   # destructive by design (delete, kill, purge)


class Latency(str, Enum):
    INSTANT = "instant"    # in-process, <10ms
    FAST = "fast"          # tens of ms to a few seconds
    SECONDS = "seconds"    # typical one-off network/SSH call
    MINUTES = "minutes"    # large analysis, orchestrated workflows
    UNBOUNDED = "unbounded"  # depends on target (loops, agents)


@dataclass(slots=True, frozen=True)
class Affordance:
    cost: Cost
    risk: Risk
    latency: Latency
    preconditions: tuple[str, ...] = field(default_factory=tuple)


# ---------------------------------------------------------------------------
# Per-category defaults. Any tool matching a prefix inherits these unless
# it has an explicit override in _EXPLICIT below.
# ---------------------------------------------------------------------------
_CATEGORY_DEFAULTS: list[tuple[str, Affordance]] = [
    # Shell execution on remote hosts
    ("run_command", Affordance(Cost.MEDIUM, Risk.HIGH, Latency.SECONDS,
        ("managed host alias configured", "SSH key available for non-local hosts"))),
    ("run_script", Affordance(Cost.MEDIUM, Risk.HIGH, Latency.SECONDS,
        ("managed host alias configured",))),
    ("run_command_multi", Affordance(Cost.HIGH, Risk.HIGH, Latency.SECONDS,
        ("managed host aliases configured",))),
    # File I/O
    ("read_file", Affordance(Cost.LOW, Risk.NONE, Latency.FAST,
        ("path accessible by ssh user",))),
    ("write_file", Affordance(Cost.LOW, Risk.HIGH, Latency.FAST,
        ("path writable by ssh user",))),
    # Browser
    ("browser_read_", Affordance(Cost.MEDIUM, Risk.LOW, Latency.SECONDS,
        ("browser session initialized",))),
    ("browser_click", Affordance(Cost.MEDIUM, Risk.MEDIUM, Latency.SECONDS,
        ("browser session initialized",))),
    ("browser_fill", Affordance(Cost.MEDIUM, Risk.MEDIUM, Latency.SECONDS,
        ("browser session initialized",))),
    ("browser_evaluate", Affordance(Cost.MEDIUM, Risk.HIGH, Latency.SECONDS,
        ("browser session initialized",))),
    # Knowledge / search
    ("search_knowledge", Affordance(Cost.LOW, Risk.NONE, Latency.FAST, ())),
    ("search_history", Affordance(Cost.LOW, Risk.NONE, Latency.FAST, ())),
    ("list_", Affordance(Cost.LOW, Risk.NONE, Latency.FAST, ())),
    # Web
    ("web_search", Affordance(Cost.MEDIUM, Risk.NONE, Latency.SECONDS, ())),
    ("fetch_url", Affordance(Cost.MEDIUM, Risk.NONE, Latency.SECONDS, ())),
    ("analyze_pdf", Affordance(Cost.HIGH, Risk.NONE, Latency.SECONDS, ())),
    ("analyze_image", Affordance(Cost.HIGH, Risk.NONE, Latency.SECONDS, ())),
    # Discord output
    ("add_reaction", Affordance(Cost.LOW, Risk.LOW, Latency.FAST, ())),
    ("create_poll", Affordance(Cost.LOW, Risk.LOW, Latency.FAST, ())),
    ("post_file", Affordance(Cost.LOW, Risk.LOW, Latency.FAST, ())),
    ("generate_file", Affordance(Cost.MEDIUM, Risk.LOW, Latency.SECONDS, ())),
    ("purge_messages", Affordance(Cost.LOW, Risk.CRITICAL, Latency.FAST, ())),
    # Agents / loops / scheduler
    ("spawn_agent", Affordance(Cost.VERY_HIGH, Risk.HIGH, Latency.UNBOUNDED,
        ("agent tool enabled",))),
    ("kill_agent", Affordance(Cost.LOW, Risk.MEDIUM, Latency.FAST, ())),
    ("wait_for_agents", Affordance(Cost.LOW, Risk.NONE, Latency.UNBOUNDED, ())),
    ("get_agent_results", Affordance(Cost.LOW, Risk.NONE, Latency.FAST, ())),
    ("start_loop", Affordance(Cost.HIGH, Risk.HIGH, Latency.UNBOUNDED, ())),
    ("stop_loop", Affordance(Cost.LOW, Risk.MEDIUM, Latency.FAST, ())),
    ("schedule_task", Affordance(Cost.LOW, Risk.MEDIUM, Latency.FAST, ())),
    ("delete_schedule", Affordance(Cost.LOW, Risk.MEDIUM, Latency.FAST, ())),
    ("update_schedule", Affordance(Cost.LOW, Risk.MEDIUM, Latency.FAST, ())),
    ("delegate_task", Affordance(Cost.HIGH, Risk.HIGH, Latency.UNBOUNDED, ())),
    # Infra
    ("git_ops", Affordance(Cost.MEDIUM, Risk.HIGH, Latency.SECONDS, ())),
    ("docker_ops", Affordance(Cost.MEDIUM, Risk.HIGH, Latency.SECONDS,
        ("docker daemon reachable",))),
    ("terraform_ops", Affordance(Cost.HIGH, Risk.CRITICAL, Latency.MINUTES,
        ("terraform state accessible",))),
    ("kubectl", Affordance(Cost.MEDIUM, Risk.HIGH, Latency.SECONDS,
        ("kubeconfig configured",))),
    ("manage_process", Affordance(Cost.LOW, Risk.HIGH, Latency.FAST, ())),
    ("http_probe", Affordance(Cost.LOW, Risk.NONE, Latency.SECONDS, ())),
    # LLM-in-tool
    ("claude_code", Affordance(Cost.VERY_HIGH, Risk.MEDIUM, Latency.MINUTES,
        ("CLAUDE_CODE_OAUTH_TOKEN or network access to API",))),
    # Skills
    ("create_skill", Affordance(Cost.MEDIUM, Risk.MEDIUM, Latency.FAST, ())),
    ("edit_skill", Affordance(Cost.LOW, Risk.MEDIUM, Latency.FAST, ())),
    ("delete_skill", Affordance(Cost.LOW, Risk.MEDIUM, Latency.FAST, ())),
    ("invoke_skill", Affordance(Cost.MEDIUM, Risk.HIGH, Latency.UNBOUNDED,
        ("skill must exist",))),
    # Knowledge management
    ("ingest_document", Affordance(Cost.HIGH, Risk.LOW, Latency.SECONDS, ())),
    ("bulk_ingest_knowledge", Affordance(Cost.HIGH, Risk.LOW, Latency.MINUTES, ())),
    ("delete_knowledge", Affordance(Cost.LOW, Risk.CRITICAL, Latency.FAST, ())),
    # Memory / lists / permissions
    ("memory_manage", Affordance(Cost.LOW, Risk.LOW, Latency.FAST, ())),
    ("manage_list", Affordance(Cost.LOW, Risk.LOW, Latency.FAST, ())),
    ("set_permission", Affordance(Cost.LOW, Risk.HIGH, Latency.FAST, ())),
    ("parse_time", Affordance(Cost.FREE, Risk.NONE, Latency.INSTANT, ())),
    # Image / media gen
    ("generate_image", Affordance(Cost.VERY_HIGH, Risk.LOW, Latency.MINUTES,
        ("ComfyUI / image backend reachable",))),
    # Planner / plan execution
    ("execute_plan", Affordance(Cost.HIGH, Risk.HIGH, Latency.UNBOUNDED, ())),
    # Issues / tickets
    ("issue_tracker", Affordance(Cost.MEDIUM, Risk.MEDIUM, Latency.SECONDS,
        ("issue tracker configured",))),
    # Post-action validation + runbook detection (our new tools)
    ("validate_action", Affordance(Cost.MEDIUM, Risk.NONE, Latency.SECONDS,
        ("validation checks reference reachable hosts",))),
    ("detect_runbooks", Affordance(Cost.LOW, Risk.NONE, Latency.FAST,
        ("audit log present",))),
    ("replay_trajectory", Affordance(Cost.LOW, Risk.NONE, Latency.FAST,
        ("trajectory file present for the target message_id",))),
    ("synthesize_runbook", Affordance(Cost.LOW, Risk.NONE, Latency.FAST, ())),
    # Audit / search
    ("search_audit", Affordance(Cost.LOW, Risk.NONE, Latency.FAST, ())),
    ("create_digest", Affordance(Cost.MEDIUM, Risk.NONE, Latency.SECONDS, ())),
    # Skill lifecycle (non-destructive toggles + packaging)
    ("enable_skill", Affordance(Cost.LOW, Risk.LOW, Latency.FAST, ())),
    ("disable_skill", Affordance(Cost.LOW, Risk.LOW, Latency.FAST, ())),
    ("install_skill", Affordance(Cost.MEDIUM, Risk.MEDIUM, Latency.FAST, ())),
    ("export_skill", Affordance(Cost.LOW, Risk.NONE, Latency.FAST, ())),
    ("skill_status", Affordance(Cost.LOW, Risk.NONE, Latency.FAST, ())),
    # Task lifecycle
    ("cancel_task", Affordance(Cost.LOW, Risk.MEDIUM, Latency.FAST, ())),
    # Browser (explicit leaf entries alongside the prefix)
    ("browser_screenshot", Affordance(Cost.MEDIUM, Risk.LOW, Latency.SECONDS,
        ("browser session initialized",))),
    # Discord surfaces
    ("read_channel", Affordance(Cost.LOW, Risk.NONE, Latency.FAST, ())),
    # Agent messaging / orchestration
    ("send_to_agent", Affordance(Cost.LOW, Risk.LOW, Latency.FAST,
        ("target agent exists and is running",))),
    ("spawn_loop_agents", Affordance(Cost.VERY_HIGH, Risk.HIGH, Latency.UNBOUNDED,
        ("agent tool enabled",))),
    ("collect_loop_agents", Affordance(Cost.LOW, Risk.NONE, Latency.SECONDS, ())),
]

# Default when no prefix matches. Deliberately conservative: unknown
# tools are assumed to be ~network-cost, read-only, a few seconds.
_FALLBACK = Affordance(Cost.MEDIUM, Risk.LOW, Latency.SECONDS, ())


def get_affordance(tool_name: str) -> Affordance:
    """Return the affordance for ``tool_name``. Prefix matches are considered
    in order; longer prefixes are checked first so `browser_read_page` hits
    the `browser_read_` entry before a hypothetical `browser_` entry."""
    best: tuple[int, Affordance] | None = None
    for prefix, aff in _CATEGORY_DEFAULTS:
        if tool_name == prefix or tool_name.startswith(prefix):
            score = len(prefix)
            if best is None or score > best[0]:
                best = (score, aff)
    if best is not None:
        return best[1]
    return _FALLBACK


def format_affordance_footer(tool_name: str) -> str:
    """Compact single-line affordance footer appended to a tool description."""
    aff = get_affordance(tool_name)
    parts = [
        f"cost={aff.cost.value}",
        f"risk={aff.risk.value}",
        f"latency={aff.latency.value}",
    ]
    footer = "[affordances: " + " ".join(parts) + "]"
    if aff.preconditions:
        footer += " (requires: " + "; ".join(aff.preconditions) + ")"
    return footer


def decorate_description(tool_name: str, description: str) -> str:
    """Append the affordance footer to a description if not already present."""
    footer = format_affordance_footer(tool_name)
    if footer in description:
        return description
    return f"{description}\n\n{footer}"


def all_affordances() -> dict[str, dict]:
    """Return every tool name that has an explicit or prefix-matched affordance
    entry plus its record, for introspection by tooling / tests."""
    # Walk the defaults table, keying by prefix (since that's the source of
    # truth) — callers who want per-tool resolution can use get_affordance.
    return {
        prefix: {
            "cost": aff.cost.value,
            "risk": aff.risk.value,
            "latency": aff.latency.value,
            "preconditions": list(aff.preconditions),
        }
        for prefix, aff in _CATEGORY_DEFAULTS
    }
