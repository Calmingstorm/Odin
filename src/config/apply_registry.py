"""How each configuration field reaches the running bot.

`PUT /api/config` validates, rebinds ``bot.config``, invalidates the tool
catalog, and writes the file. Whether an edit takes effect depends entirely on
how each consumer reads config:

* built in ``wiring.build_services(config)`` — holds a boot snapshot, so the
  change waits for a restart;
* built in ``wiring.build_components(bot, services)`` with
  ``get_config=lambda: bot.config`` — reads live.

The WebUI used to present all of them identically and report "Config saved
successfully" either way. This module is the single place that states the
truth, so the API and the UI cannot drift from each other or from the code:
every classification below was established by tracing the consumers, and
``scripts/ci/apply_registry_gate.py`` fails the build when a schema field has
no entry, so a new field cannot be added silently.

Apply modes
-----------
``live``                every consumer re-reads config; effective immediately.
``live_for_new_work``   effective for the next spawn/turn; in-flight work keeps
                        the values it started with, by design.
``dedicated``           the generic endpoint persists it, but the runtime is
                        only reconfigured through a named endpoint.
``restart``             a boot-time snapshot; persisted, effective next start.
``activation_required`` persisted, but the feature is not wired to a running
                        consumer and must never spring to life on upgrade.
``dead``                consumed nowhere. Preserved, never presented as live.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

ApplyMode = Literal[
    "live",
    "live_for_new_work",
    "dedicated",
    "restart",
    "activation_required",
    "dead",
]


@dataclass(frozen=True)
class FieldSpec:
    """What happens when this path changes, and who owns it."""

    apply_mode: ApplyMode
    summary: str
    #: Page that owns this setting when it is not the generic config page.
    owner: str | None = None
    #: Endpoint that actually reconfigures the runtime, for ``dedicated``.
    dedicated_endpoint: str | None = None
    #: Why a restart is required — never left to the reader to infer.
    restart_reason: str | None = None
    #: Per-consumer detail where one field reaches several consumers
    #: differently. Presenting a single badge for those would be a lie.
    consumers: tuple[tuple[str, ApplyMode, str], ...] = field(default_factory=tuple)


# Section-level defaults. A field with no explicit entry inherits its section's
# spec, so the gate below only demands an override where the section is not
# uniform — which keeps the exceptions visible instead of drowning them.
SECTIONS: dict[str, FieldSpec] = {
    "timezone": FieldSpec(
        "live",
        "Timezone used for prompts and scheduled-time parsing.",
        consumers=(
            ("Prompt assembly", "live", "Every prompt reads the current value."),
            (
                "parse_time tool",
                "restart",
                "A module global set once during service construction.",
            ),
        ),
    ),
    "discord": FieldSpec(
        "live",
        "Global Discord gating: allowlists, mention and bot-reply defaults.",
    ),
    "openai_codex": FieldSpec(
        "dedicated",
        "Codex model, effort, transport and pool settings.",
        owner="llm",
        dedicated_endpoint="PUT /api/llm/codex/config",
    ),
    "ollama": FieldSpec(
        "dedicated",
        "Ollama provider settings.",
        owner="llm",
        dedicated_endpoint="PUT /api/llm/ollama/config",
    ),
    "kimi": FieldSpec(
        "dedicated",
        "Kimi provider settings.",
        owner="llm",
        dedicated_endpoint="PUT /api/llm/kimi/config",
    ),
    "llm_provider": FieldSpec(
        "dedicated",
        "Which provider serves turns.",
        owner="llm",
        dedicated_endpoint="POST /api/llm/switch",
        consumers=(
            (
                "Gateway client selection",
                "live",
                "Reads current config, but bypasses the provider lock, "
                "availability check, in-flight drain and rollback that the "
                "dedicated switch performs.",
            ),
        ),
    ),
    "context": FieldSpec(
        "restart",
        "Static context directory injected into every request.",
        restart_reason="ContextLoader is constructed with the directory at startup.",
    ),
    "sessions": FieldSpec(
        "restart",
        "Conversation history limits, budgets and archive policy.",
        restart_reason="SessionManager receives every limit as a constructor scalar.",
    ),
    "tools": FieldSpec(
        "restart",
        "Execution policy: hosts, timeouts, governor, pools, streaming.",
        restart_reason="ToolExecutor holds the ToolsConfig it was built with.",
    ),
    "logging": FieldSpec(
        "restart",
        "Log verbosity.",
        restart_reason="The level is applied once at startup by logging.basicConfig.",
    ),
    "usage": FieldSpec(
        "activation_required",
        "Usage accounting. The tracker is in-memory; the directory is a "
        "reserved path with no writer.",
    ),
    "webhook": FieldSpec(
        "restart",
        "Inbound webhook listener and authentication.",
        restart_reason="HealthServer captures the config and registers routes at startup.",
    ),
    "learning": FieldSpec(
        "restart",
        "Reflection and learned-memory limits.",
        restart_reason="Reflector limits are constructor scalars.",
    ),
    "observability": FieldSpec(
        "live",
        "Tracing, trajectory capture and prompt accounting.",
    ),
    "email": FieldSpec(
        "restart",
        "SMTP and IMAP settings for the email tools.",
        restart_reason="ToolExecutor captured the EmailConfig at startup.",
        consumers=(
            (
                "Tool catalogue visibility",
                "live",
                "The tools appear or disappear immediately.",
            ),
            (
                "Tool execution",
                "restart",
                "Handlers resolve the boot-time config, so enabling live "
                "advertises tools that still refuse.",
            ),
        ),
    ),
    "search": FieldSpec(
        "restart",
        "Knowledge and history search backends.",
        restart_reason="Embedder, FTS and vector stores open their handles at startup.",
    ),
    "browser": FieldSpec(
        "restart",
        "Browser automation limits and viewport.",
        restart_reason="BrowserManager is constructed with these values.",
    ),
    "permissions": FieldSpec(
        "restart",
        "Default tier and per-user tier map.",
        restart_reason="PermissionManager copies the tier map at construction.",
    ),
    "comfyui": FieldSpec("live", "ComfyUI image backend connection."),
    "image": FieldSpec("live", "Image backend routing and native generation."),
    "web": FieldSpec(
        "restart",
        "Management API listener, auth and sessions.",
        restart_reason="HealthServer binds and builds its middleware at startup.",
    ),
    "attachments": FieldSpec(
        "live",
        "Attachment limits, paths and retention.",
    ),
    "personality": FieldSpec(
        "dedicated",
        "Response identity, voice and presets.",
        owner="personality",
        dedicated_endpoint="PUT /api/personality",
    ),
    "reaction_triggers": FieldSpec(
        "activation_required",
        "Discord reaction automation. The cog is loaded without config or "
        "scheduler, so it cannot fire.",
    ),
    "message_triggers": FieldSpec(
        "activation_required",
        "Discord message automation. The cog is loaded without config or "
        "scheduler, so it cannot fire.",
    ),
    "mcp": FieldSpec(
        "activation_required",
        "Model Context Protocol servers. No manager is constructed, so the "
        "routes report unavailable.",
    ),
    "slack": FieldSpec(
        "restart",
        "Slack destinations and forwarding.",
        restart_reason="The notifier is constructed when HealthServer starts.",
    ),
    "issue_tracker": FieldSpec(
        "activation_required",
        "Issue tracker provider. No client is constructed, so the tool errors "
        "if the catalogue advertises it.",
    ),
    "audit": FieldSpec(
        "restart",
        "Audit signing.",
        restart_reason="The HMAC signer is built with AuditLogger at startup.",
    ),
    "agents": FieldSpec(
        "live_for_new_work",
        "Spawned-agent budgets and timeouts.",
        consumers=(
            (
                "New spawns",
                "live_for_new_work",
                "Read from current config at spawn and snapshotted onto the agent.",
            ),
            (
                "Running agents",
                "restart",
                "Keep their spawn-time snapshot by design, so a live change "
                "cannot move a deadline mid-flight.",
            ),
        ),
    ),
    "grafana_alerts": FieldSpec(
        "restart",
        "Grafana alert intake and remediation.",
        restart_reason="The handler is built from config when HealthServer starts.",
    ),
    "outbound_webhooks": FieldSpec(
        "restart",
        "Outbound event targets.",
        restart_reason="The dispatcher and its targets are registered at startup.",
    ),
    "graceful_degradation": FieldSpec(
        "restart",
        "Subsystem failure thresholds.",
        restart_reason="SubsystemGuard captures its thresholds at construction.",
    ),
    "llm_recovery": FieldSpec(
        "restart",
        "Generation recovery deadlines and capacity breaker.",
        restart_reason="Breaker thresholds are constructed into the registry at startup.",
        consumers=(
            (
                "Recovery deadlines",
                "live",
                "Read from current config on every generation.",
            ),
            (
                "Capacity breaker",
                "restart",
                "Thresholds are constructor scalars on ModelBreakerRegistry.",
            ),
        ),
    ),
    "turn_state": FieldSpec(
        "restart",
        "Durable turn checkpoints and retention.",
        restart_reason="The store is opened at startup and its path fixed then.",
        consumers=(
            (
                "Retention sweeps",
                "live",
                "Housekeeping reads the current values each pass.",
            ),
            (
                "Store and auto-resume",
                "restart",
                "Enablement, path and the resume waiter are boot-captured.",
            ),
        ),
    ),
}

# Per-field overrides where a field differs from its section.
FIELDS: dict[str, FieldSpec] = {
    "discord.token": FieldSpec(
        "restart",
        "Bot credential, supplied by the environment.",
        owner="secrets",
        restart_reason="The token is consumed once when the client connects.",
    ),
    "openai_codex.agent_model": FieldSpec(
        "live",
        "Model for spawned agents. Resolved from current config per iteration.",
        owner="llm",
    ),
    "openai_codex.agent_reasoning_effort": FieldSpec(
        "live",
        "Reasoning effort for spawned agents, resolved per iteration.",
        owner="llm",
    ),
    "openai_codex.connection_pool": FieldSpec(
        "restart",
        "HTTP pool sizing.",
        owner="llm",
        restart_reason="Pool sizing is applied only when the client is created, "
        "so even the dedicated reload cannot change it.",
    ),
    "openai_codex.context_compression": FieldSpec(
        "restart",
        "Context compression thresholds.",
        owner="llm",
        restart_reason="The compressor holds the sub-config object it was built with; "
        "no endpoint rebuilds it.",
    ),
    "observability.audit_failure_classification": FieldSpec(
        "restart",
        "Whether audit failures are classified.",
        restart_reason="Captured when AuditLogger is constructed.",
    ),
    "learning.loop_reflection_enabled": FieldSpec(
        "live",
        "Whether loop turns produce reflections. Read per turn.",
    ),
    "tools.enabled": FieldSpec("live", "Master switch for tool use, read per turn."),
    "tools.max_tool_iterations_chat": FieldSpec(
        "live", "Chat tool-iteration cap, read per turn."
    ),
    "tools.max_tool_iterations_loop": FieldSpec(
        "live", "Loop tool-iteration cap, read per turn."
    ),
    "tools.claude_code_dir": FieldSpec("live", "Working directory named in prompts."),
    "tools.local_working_dir": FieldSpec(
        "restart",
        "Working directory for local commands.",
        restart_reason="Deliberately stable: swapping it at runtime would break "
        "two-step workflows that write a file in one command and read it in the next.",
    ),
    "turn_state.payload_retention_days": FieldSpec(
        "live", "Checkpoint payload retention, read by each housekeeping pass."
    ),
    "turn_state.ledger_retention_days": FieldSpec(
        "live", "Ledger retention, read by each housekeeping pass."
    ),
    "agents.max_children_per_agent": FieldSpec(
        "dead",
        "Not consulted: the limit comes from a module constant in the agent manager.",
    ),
    "context.max_system_prompt_tokens": FieldSpec(
        "dead", "No consumer reads this value."
    ),
    "usage.directory": FieldSpec(
        "dead",
        "Cost tracking is in-memory; nothing writes to this path. It is still a "
        "protected root for local commands.",
    ),
    "slack.forward_alerts": FieldSpec(
        "dead", "No consumer reads this value; there is no alert stream to subscribe to."
    ),
    "grafana_alerts.enabled": FieldSpec(
        "dead",
        "Not read. Grafana intake is gated by webhook.enabled, and remediation "
        "by auto_remediate.",
    ),
    "graceful_degradation.enabled": FieldSpec(
        "dead", "Not read: the subsystem guard is always active."
    ),
}

#: Paths whose VALUES must never be returned by any API.
SECRET_PATHS: frozenset[str] = frozenset({
    "discord.token",
    "openai_codex.credentials_path",
    "ollama.api_key",
    "kimi.api_key",
    "web.api_token",
    "webhook.secret",
    "audit.hmac_key",
    "email.smtp.password",
    "email.imap.password",
    "slack.webhook_urls",
    "slack.default_webhook_url",
})


def spec_for(path: str) -> FieldSpec | None:
    """The spec governing a dotted config path, or None if unclassified.

    Falls back to the section spec, so uniform sections need one entry rather
    than one per field.
    """
    if path in FIELDS:
        return FIELDS[path]
    section = path.split(".", 1)[0]
    return SECTIONS.get(section)


def is_secret(path: str) -> bool:
    """Whether a path's value must be withheld from API responses."""
    return path in SECRET_PATHS
