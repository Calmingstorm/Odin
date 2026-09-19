"""Tool affordance metadata — cost / risk / latency / preconditions.

The goal is to help the LLM choose between comparable tools by surfacing
*what each call is going to cost you* in four dimensions:

- **cost**: order-of-magnitude token/compute burden. A subprocess is not
  the same kind of expensive as an in-process lookup.
- **risk**: what happens if the call goes wrong. `run_command` on an SSH
  host is categorically different from `web_search`.
- **latency**: how long the work set in motion by a typical call takes.
  `fetch_url` is seconds; supervised processes and agents can be unbounded.
- **preconditions**: short list of hidden requirements ("SSH key must be
  configured for <host>", "browser must be started").

Descriptions stay human-readable. The merger appends a single-line
"[affordances: cost=... risk=... latency=...]" footer to each tool's
description at definition-build time. Not a separate object the LLM has
to query — it reads alongside the normal description.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum


class Cost(StrEnum):
    FREE = "free"  # in-process, no I/O
    LOW = "low"  # local filesystem / short local subprocess
    MEDIUM = "medium"  # one network round-trip or one SSH call
    HIGH = "high"  # many calls / large I/O / browser page
    VERY_HIGH = "very_high"  # LLM-in-tool, multi-file analysis


class Risk(StrEnum):
    NONE = "none"  # read-only, no state change
    LOW = "low"  # mostly read-only / reversible state change
    MEDIUM = "medium"  # state change, but scoped/reversible
    HIGH = "high"  # potentially destructive / side-effecty
    CRITICAL = "critical"  # destructive by design (delete, kill, purge)


class Latency(StrEnum):
    INSTANT = "instant"  # in-process, <10ms
    FAST = "fast"  # tens of ms to a few seconds
    SECONDS = "seconds"  # typical one-off network/SSH call
    MINUTES = "minutes"  # large analysis, orchestrated workflows
    UNBOUNDED = "unbounded"  # depends on target (loops, agents)


@dataclass(slots=True, frozen=True)
class Affordance:
    cost: Cost | None
    risk: Risk
    latency: Latency | None
    preconditions: tuple[str, ...] = field(default_factory=tuple)
    gotchas: tuple[str, ...] = field(default_factory=tuple)


# ---------------------------------------------------------------------------
# Per-category defaults. Any tool matching a prefix inherits these unless
# it has an explicit override in _EXPLICIT below.
# ---------------------------------------------------------------------------
_CATEGORY_DEFAULTS: list[tuple[str, Affordance]] = [
    # Shell execution on remote hosts
    (
        "run_command",
        Affordance(
            Cost.MEDIUM,
            Risk.HIGH,
            Latency.SECONDS,
            ("managed host alias configured", "SSH key available for non-local hosts"),
        ),
    ),
    (
        "run_script",
        Affordance(Cost.MEDIUM, Risk.HIGH, Latency.SECONDS, ("managed host alias configured",)),
    ),
    (
        "run_command_multi",
        Affordance(Cost.HIGH, Risk.HIGH, Latency.SECONDS, ("managed host aliases configured",)),
    ),
    # File I/O
    (
        "read_file",
        Affordance(Cost.MEDIUM, Risk.NONE, Latency.FAST, ("path accessible by ssh user",)),
    ),
    (
        "apply_patch",
        Affordance(Cost.MEDIUM, Risk.HIGH, Latency.SECONDS, ("root writable by ssh user",)),
    ),
    # Browser
    (
        "browser_read_",
        Affordance(
            Cost.HIGH,
            Risk.LOW,
            Latency.SECONDS,
            ("browser enabled", "installed Chromium or reachable configured CDP endpoint"),
        ),
    ),
    (
        "browser_click",
        Affordance(
            Cost.HIGH,
            Risk.HIGH,
            Latency.SECONDS,
            ("browser enabled", "installed Chromium or reachable configured CDP endpoint"),
        ),
    ),
    (
        "browser_fill",
        Affordance(
            Cost.HIGH,
            Risk.HIGH,
            Latency.SECONDS,
            ("browser enabled", "installed Chromium or reachable configured CDP endpoint"),
        ),
    ),
    (
        "browser_evaluate",
        Affordance(
            Cost.HIGH,
            Risk.HIGH,
            Latency.SECONDS,
            ("browser enabled", "installed Chromium or reachable configured CDP endpoint"),
        ),
    ),
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
    ("add_reaction", Affordance(Cost.MEDIUM, Risk.LOW, Latency.FAST, ())),
    ("create_poll", Affordance(Cost.MEDIUM, Risk.LOW, Latency.FAST, ())),
    ("post_file", Affordance(Cost.HIGH, Risk.LOW, Latency.SECONDS, ())),
    ("generate_file", Affordance(Cost.MEDIUM, Risk.LOW, Latency.SECONDS, ())),
    ("purge_messages", Affordance(Cost.HIGH, Risk.CRITICAL, Latency.SECONDS, ())),
    # Agents / loops / scheduler
    (
        "spawn_agent",
        Affordance(Cost.VERY_HIGH, Risk.HIGH, Latency.UNBOUNDED, ("agent tool enabled",)),
    ),
    ("kill_agent", Affordance(Cost.LOW, Risk.CRITICAL, Latency.FAST, ())),
    ("wait_for_agents", Affordance(Cost.LOW, Risk.NONE, Latency.MINUTES, ())),
    ("get_agent_results", Affordance(Cost.LOW, Risk.NONE, Latency.FAST, ())),
    ("start_loop", Affordance(Cost.VERY_HIGH, Risk.HIGH, Latency.UNBOUNDED, ())),
    ("stop_loop", Affordance(Cost.LOW, Risk.MEDIUM, Latency.FAST, ())),
    (
        "schedule_task",
        Affordance(
            Cost.LOW,
            Risk.HIGH,
            Latency.FAST,
            (),
            (
                "workflow steps need populated tool_input with all required fields",
                "run_at must be offset-aware ISO — use parse_time first for natural language",
            ),
        ),
    ),
    ("delete_schedule", Affordance(Cost.LOW, Risk.CRITICAL, Latency.FAST, ())),
    ("update_schedule", Affordance(Cost.LOW, Risk.HIGH, Latency.FAST, ())),
    (
        "delegate_task",
        Affordance(
            Cost.HIGH,
            Risk.HIGH,
            Latency.UNBOUNDED,
            (),
            (
                "every run_command step needs tool_input.command",
                "steps execute sequentially — use {prev_output} to chain results",
            ),
        ),
    ),
    # Infra
    ("manage_process", Affordance(Cost.LOW, Risk.HIGH, Latency.UNBOUNDED, ())),
    ("http_probe", Affordance(Cost.MEDIUM, Risk.HIGH, Latency.SECONDS, ())),
    # Skills
    ("create_skill", Affordance(None, Risk.HIGH, None, ())),
    ("edit_skill", Affordance(None, Risk.HIGH, None, ())),
    ("delete_skill", Affordance(Cost.LOW, Risk.CRITICAL, Latency.FAST, ())),
    (
        "invoke_skill",
        Affordance(
            None,
            Risk.HIGH,
            None,
            ("skill must exist and be enabled",),
            (
                "pass skill arguments under input, not at top level",
                "use list_skills first if unsure about parameter names",
            ),
        ),
    ),
    # Knowledge management
    ("ingest_document", Affordance(Cost.HIGH, Risk.MEDIUM, Latency.SECONDS, ())),
    ("bulk_ingest_knowledge", Affordance(Cost.HIGH, Risk.MEDIUM, Latency.MINUTES, ())),
    ("delete_knowledge", Affordance(Cost.LOW, Risk.CRITICAL, Latency.FAST, ())),
    # Memory / lists / permissions
    ("memory_manage", Affordance(Cost.LOW, Risk.LOW, Latency.FAST, ())),
    ("manage_list", Affordance(Cost.LOW, Risk.LOW, Latency.FAST, ())),
    ("set_permission", Affordance(Cost.LOW, Risk.HIGH, Latency.FAST, ())),
    ("parse_time", Affordance(Cost.FREE, Risk.NONE, Latency.INSTANT, ())),
    # Image / media gen
    (
        "generate_image",
        Affordance(
            Cost.VERY_HIGH,
            Risk.LOW,
            Latency.MINUTES,
            ("Codex provider active", "native image generation enabled", "usable credentials"),
        ),
    ),
    # Post-action validation + runbook detection (our new tools)
    (
        "validate_action",
        Affordance(
            Cost.HIGH,
            Risk.HIGH,
            Latency.SECONDS,
            ("validation checks reference reachable hosts",),
            ("command checks execute real commands",),
        ),
    ),
    # Audit / search
    ("search_audit", Affordance(Cost.LOW, Risk.NONE, Latency.FAST, ())),
    # Skill lifecycle (non-destructive toggles + packaging)
    ("enable_skill", Affordance(Cost.LOW, Risk.LOW, Latency.FAST, ())),
    ("disable_skill", Affordance(Cost.LOW, Risk.LOW, Latency.FAST, ())),
    ("install_skill", Affordance(None, Risk.HIGH, None, ())),
    ("export_skill", Affordance(Cost.LOW, Risk.LOW, Latency.FAST, ())),
    ("skill_status", Affordance(Cost.LOW, Risk.NONE, Latency.FAST, ())),
    # Task lifecycle
    ("cancel_task", Affordance(Cost.LOW, Risk.MEDIUM, Latency.FAST, ())),
    # Browser (explicit leaf entries alongside the prefix)
    (
        "browser_screenshot",
        Affordance(
            Cost.HIGH,
            Risk.LOW,
            Latency.SECONDS,
            ("browser enabled", "installed Chromium or reachable configured CDP endpoint"),
        ),
    ),
    # Discord surfaces
    ("read_channel", Affordance(Cost.MEDIUM, Risk.NONE, Latency.FAST, ())),
    # Agent messaging / orchestration
    (
        "send_to_agent",
        Affordance(Cost.LOW, Risk.HIGH, Latency.FAST, ("target agent exists and is running",)),
    ),
    # Email tools (SMTP/IMAP)
    (
        "email_send",
        Affordance(
            Cost.MEDIUM,
            Risk.HIGH,
            Latency.SECONDS,
            ("email.enabled", "SMTP credentials configured"),
        ),
    ),
    (
        "email_search",
        Affordance(
            Cost.HIGH,
            Risk.NONE,
            Latency.SECONDS,
            ("email.enabled", "IMAP credentials configured"),
        ),
    ),
    (
        "email_read",
        Affordance(
            Cost.MEDIUM,
            Risk.NONE,
            Latency.SECONDS,
            ("email.enabled", "IMAP credentials configured"),
        ),
    ),
    (
        "email_list_recent",
        Affordance(
            Cost.HIGH,
            Risk.NONE,
            Latency.SECONDS,
            ("email.enabled", "IMAP credentials configured"),
        ),
    ),
    # Retained-output and dynamically catalogued computer-use tools
    ("get_tool_output", Affordance(Cost.LOW, Risk.NONE, Latency.FAST, ())),
    ("computer_session", Affordance(Cost.MEDIUM, Risk.HIGH, Latency.SECONDS, ())),
    ("computer_observe", Affordance(Cost.MEDIUM, Risk.LOW, Latency.SECONDS, ())),
    ("computer_act", Affordance(Cost.MEDIUM, Risk.HIGH, Latency.SECONDS, ())),
]

# Default when no prefix matches. Unknown cost and latency stay unclassified;
# risk fails closed because an omitted table entry is not evidence of safety.
_FALLBACK = Affordance(None, Risk.HIGH, None, ())


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
    parts = []
    if aff.cost is not None:
        parts.append(f"cost={aff.cost.value}")
    parts.append(f"risk={aff.risk.value}")
    if aff.latency is not None:
        parts.append(f"latency={aff.latency.value}")
    footer = "[affordances: " + " ".join(parts) + "]"
    if aff.preconditions:
        footer += " (requires: " + "; ".join(aff.preconditions) + ")"
    if aff.gotchas:
        footer += " (gotchas: " + "; ".join(aff.gotchas) + ")"
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
    records: dict[str, dict] = {}
    for prefix, aff in _CATEGORY_DEFAULTS:
        record = {
            "risk": aff.risk.value,
            "preconditions": list(aff.preconditions),
            "gotchas": list(aff.gotchas),
        }
        if aff.cost is not None:
            record["cost"] = aff.cost.value
        if aff.latency is not None:
            record["latency"] = aff.latency.value
        records[prefix] = record
    return records
