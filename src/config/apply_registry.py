"""How every configuration leaf reaches the running bot.

The config page renders apply-mode from THIS module, so the page states what
the code actually does instead of inferring from a value's shape. Every claim
here is a claim about code: if a field is marked live and it is not, the page
becomes a confident liar in the one place built to stop lying.

Resolution order for a path is explicit-leaf, then pattern, then section
default. ``scripts/ci/apply_registry_gate.py`` fails the build when a leaf in a
section known to be non-uniform falls back to that section default, when this
module names a path the schema no longer has, and when a credential-shaped
leaf is classified public. It does NOT catch a new leaf in a section whose
leaves genuinely agree — that one inherits deliberately.

Apply modes
-----------
``live_read``           consumers re-read config; the next read sees it.
``live_apply``          a named apply handler reconfigures the running
                        component. Generic Config saves persist the value but
                        do not dispatch that handler.
``live_for_new_work``   effective for the next spawn/turn; work already running
                        keeps the values it started with, by design.
``restart``             a boot-time snapshot; persisted, effective next start.
``activation_required`` wired, but deliberately gated: saving does not turn it
                        on, so a feature never springs to life on upgrade.
``dormant``             read by nothing at all. Distinct from the above on
                        purpose — telling an operator to "activate" a setting
                        no code consults would send them looking for a switch
                        that does not exist.
``legacy_control``      superseded by an older switch that still governs the
                        behaviour. Reserved for the config page; unused here.

The vocabulary is exactly what the page renders (``APPLY_MODE_LABELS`` in
``ui/js/pages/config.js``). It has to be: the page maps any mode it does not
know onto "Restart required", so an invented mode would tell an operator that
restarting activates something restarting cannot touch.
"""

from __future__ import annotations

import enum
import functools
import hashlib
import hmac
import json
import secrets as secrets_module
import types
import typing
from dataclasses import dataclass, field, replace
from typing import Any, Literal

from pydantic import BaseModel

from .sensitivity import is_sensitive_key
from .workspace_paths import WORKSPACE_PROTECTED_CONFIG_PATH_NAMES

ApplyMode = Literal[
    "live_read",
    "live_apply",
    "live_for_new_work",
    "restart",
    "activation_required",
    "dormant",
    "legacy_control",
]

Sensitivity = Literal["public", "sensitive", "secret_container"]

#: What the API returns in place of a secret. Never a prefix, never a length.
REDACTED = "•" * 8

SCHEMA_VERSION = 1

# The server and Config Center must speak exactly this health vocabulary. The
# cross-language contract test reads HEALTH_STATES from config-health.js, while
# build_meta_payload derives its counters here and rejects invented states.
HEALTH_STATES: tuple[str, ...] = (
    "applied",
    "pending_restart",
    "dormant",
    "invalid",
    "drift",
    "unknown",
)


@dataclass(frozen=True)
class Consumer:
    """One reader of a field, when readers disagree about liveness.

    A single badge over disagreeing consumers is a lie in one direction or the
    other, so the disagreement is published instead of averaged away.
    """

    name: str
    apply_mode: ApplyMode
    detail: str


@dataclass(frozen=True)
class FieldSpec:
    """What happens when this path changes, and who owns it."""

    apply_mode: ApplyMode | None = None
    owner: str | None = None
    label: str | None = None
    description: str | None = None
    unit: str | None = None
    enum: tuple[str, ...] | None = None
    constraints: dict[str, Any] = field(default_factory=dict)
    sensitivity: Sensitivity | None = None
    #: Named handler that reconfigures the runtime, for ``live_apply``.
    apply_handler: str | None = None
    #: Why a restart is required — never left to the reader to infer.
    restart_reason: str | None = None
    #: What activation means, for ``activation_required``.
    activation_policy: str | None = None
    #: False when the schema value was present at boot but boot wiring did not
    #: pass it to the component. Such a snapshot cannot prove effective state.
    boot_snapshot_is_effective: bool = True
    consumers: tuple[Consumer, ...] = ()


@dataclass(frozen=True)
class SectionSpec:
    """Default treatment for a section's leaves."""

    apply_mode: ApplyMode
    description: str
    owner: str | None = None
    apply_handler: str | None = None
    restart_reason: str | None = None
    activation_policy: str | None = None
    #: Published when every leaf in the section shares the same disagreement.
    consumers: tuple[Consumer, ...] = ()


# --------------------------------------------------------------------------
# Sections
# --------------------------------------------------------------------------

SECTIONS: dict[str, SectionSpec] = {
    "timezone": SectionSpec("restart", "Locale and scheduling defaults used across Odin."),
    "discord": SectionSpec(
        "live_read",
        "Discord conversational-intake policy. Allowed users and channels are "
        "absolute global gates within that path; guild and channel settings "
        "cannot bypass them. Prefix commands use their own authorization, and "
        "the explicitly allowed test-webhook path bypasses the user gate. "
        "Require-mention and bot-response behavior can be overridden per guild "
        "or channel; an explicit mention bypasses the ignored-bot check, but "
        "the effective respond-to-bots policy still applies.",
    ),
    "llm_provider": SectionSpec(
        "live_apply",
        "Active language-model provider and failover ownership.",
        owner="llm",
        apply_handler="POST /api/llm/switch",
    ),
    "openai_codex": SectionSpec(
        "live_apply",
        "Codex models, reasoning, transport, and pool behaviour.",
        owner="llm",
        apply_handler="PUT /api/llm/codex/config",
    ),
    "ollama": SectionSpec(
        "live_apply",
        "Local or remote Ollama provider settings.",
        owner="llm",
        apply_handler="PUT /api/llm/ollama/config",
    ),
    "kimi": SectionSpec(
        "live_apply",
        "Kimi provider settings and request limits.",
        owner="llm",
        apply_handler="PUT /api/llm/kimi/config",
    ),
    "context": SectionSpec(
        "restart",
        "System-prompt source files.",
        restart_reason="Prompt sources are assembled when the prompt builder is "
        "constructed at startup.",
    ),
    "sessions": SectionSpec(
        "restart",
        "Conversation persistence, retention, and history limits.",
        restart_reason="The session manager captures its limits at construction.",
    ),
    "tools": SectionSpec(
        "restart",
        "Execution policy, hosts, timeouts, pools, and recovery.",
        restart_reason="The tool executor captures this policy at construction.",
    ),
    "logging": SectionSpec(
        "restart",
        "Runtime log verbosity and workspace-fence declarations.",
        restart_reason="Logging verbosity is selected when startup installs the process handlers.",
    ),
    "usage": SectionSpec(
        "activation_required",
        "Usage accounting and durable history storage.",
        activation_policy="Cost tracking is in-memory today. Durable usage "
        "history must be enabled explicitly before this path is written.",
    ),
    "webhook": SectionSpec(
        "restart",
        "Inbound webhook listener and authentication policy.",
        restart_reason="The listener binds its routes and auth policy at startup.",
    ),
    "learning": SectionSpec(
        "restart",
        "Reflection, consolidation, and learned-context limits.",
        restart_reason="The reflector captures its budgets at construction.",
    ),
    "observability": SectionSpec(
        "live_read", "Metrics, tracing, and failure-classification controls."
    ),
    "email": SectionSpec(
        "restart",
        "SMTP and IMAP behaviour for email tools.",
        restart_reason="Mail clients are constructed from this section at startup.",
    ),
    "search": SectionSpec(
        "restart",
        "Knowledge and history search backends.",
        restart_reason="Search backends and their indexes open at startup.",
    ),
    "browser": SectionSpec(
        "restart",
        "Browser automation limits and viewport defaults.",
        restart_reason="Browser defaults are captured when the tool is built.",
    ),
    "permissions": SectionSpec(
        "restart",
        "Default and per-user execution policy.",
        restart_reason="The permission manager loads its tier policy at startup.",
    ),
    "comfyui": SectionSpec("live_read", "ComfyUI image backend connection settings."),
    "image": SectionSpec("live_read", "Image routing and native generation policy."),
    "web": SectionSpec(
        "restart",
        "Management API listener, authentication, and sessions.",
        restart_reason="The management listener binds its socket and auth at startup.",
    ),
    "attachments": SectionSpec("live_read", "Attachment limits, paths, and cleanup policy."),
    "personality": SectionSpec(
        "live_for_new_work",
        "Response identity, style, and personality presets.",
        owner="personality",
    ),
    "reaction_triggers": SectionSpec(
        "dormant",
        "Discord reaction event automation.",
        owner="reaction_triggers",
        activation_policy="The cog loads with no configuration and no "
        "scheduler, and nothing in production supplies them. There is no "
        "activation action yet.",
    ),
    "message_triggers": SectionSpec(
        "dormant",
        "Discord message event automation.",
        owner="message_triggers",
        activation_policy="The cog loads with no configuration and no "
        "scheduler, and nothing in production supplies them. There is no "
        "activation action yet.",
    ),
    "mcp": SectionSpec(
        "live_apply",
        "Model Context Protocol servers and tool publication.",
        owner="mcp",
        apply_handler="POST/PUT/DELETE /api/mcp/servers*, POST /api/mcp/enabled",
        activation_policy="Managed live through the dedicated /api/mcp routes: "
        "server CRUD, the global switch, reconnect, and tools refresh persist "
        "desired state to this file and reconcile the running control plane "
        "in the same operation. Direct file edits apply on restart.",
    ),
    "slack": SectionSpec(
        "restart",
        "Slack destinations and internal alert forwarding.",
        restart_reason="The Slack notifier is constructed at startup.",
    ),
    "issue_tracker": SectionSpec(
        "dormant",
        "Issue-tracker configuration and its currently incomplete tool lifecycle.",
        owner="issue_tracker",
        activation_policy="No production path constructs an issue-tracker "
        "client. Provider settings are stored only; configured-and-healthy "
        "tool gating is planned for the next campaign, not present today.",
    ),
    "audit": SectionSpec(
        "restart",
        "Audit signing, verification, and retention.",
        restart_reason="The audit chain binds its signing policy at startup.",
    ),
    "agents": SectionSpec(
        "live_for_new_work",
        "Spawned-agent budgets, inheritance, and tree limits.",
    ),
    "grafana_alerts": SectionSpec(
        "restart",
        "Grafana alert routing and remediation policy.",
        owner="grafana_alerts",
        restart_reason="The GrafanaAlertHandler is constructed from these values "
        "at startup; saving does not rebuild it.",
    ),
    "outbound_webhooks": SectionSpec(
        "restart",
        "Outbound event targets, delivery, and safety policy.",
        owner="outbound_webhooks",
        restart_reason="The dispatcher is built at startup, and only if it was "
        "enabled then. Saving configuration does not create or update it; the "
        "dedicated endpoint edits the running dispatcher without persisting.",
        consumers=(
            Consumer(
                "Saving configuration",
                "restart",
                "Persisted, but the running dispatcher is not rebuilt.",
            ),
            Consumer(
                "Outbound webhook endpoints",
                "live_apply",
                "Edits the running dispatcher immediately, and does NOT write "
                "config — the change is lost on restart.",
            ),
        ),
    ),
    "graceful_degradation": SectionSpec(
        "restart",
        "Always-on subsystem request guarding and its failure thresholds.",
        restart_reason="The SubsystemGuard is constructed with these thresholds "
        "at startup; saving does not rebuild it.",
    ),
    "llm_recovery": SectionSpec(
        "restart",
        "Provider recovery, breaker, and retry policy.",
        restart_reason="Recovery policy is captured when the provider stack is built.",
    ),
    "turn_state": SectionSpec(
        "restart",
        "Durable turn checkpoints, expiry, and resume behaviour.",
        restart_reason="The checkpoint store opens with this configuration.",
    ),
}

#: Sections whose leaves genuinely disagree with each other. A leaf here must be
#: classified explicitly — inheriting the section default would publish a claim
#: nobody checked against a consumer. Enforced by the CI gate.
MIXED_SECTIONS: frozenset[str] = frozenset(
    {
        "openai_codex",
        "tools",
        "llm_recovery",
        "turn_state",
        "learning",
        "personality",
        "agents",
        "observability",
        "issue_tracker",
    }
)

#: Heading copy for every two-segment subgroup the page renders as a card.
#: The page groups deeper-than-two-segment leaves by their first two path
#: segments and shows this as the card's description — its OWN text, never a
#: child's. The first cut of the page stole the first child's description as
#: the group heading ("Ssh Retry: SSH retry attempts."), which is exactly the
#: mislabeling this dict prevents. The CI gate requires an entry for every
#: subgroup the schema actually produces.
GROUP_DESCRIPTIONS: dict[str, str] = {
    "email.imap": "How Odin reads mail: server, credentials, and polling.",
    "email.smtp": "How Odin sends mail: server, credentials, and identity.",
    "grafana_alerts.rules": "Per-alert routing and remediation rules.",
    "image.openai": "Native OpenAI image generation behaviour.",
    "mcp.servers": "Configured Model Context Protocol servers.",
    "observability.context_trace": "What each per-turn context trace records, "
    "and how large one may grow.",
    "openai_codex.auxiliary": "A cheaper Codex model for the four background "
    "jobs: compaction, reflection, consolidation, and follow-up.",
    "openai_codex.connection_pool": "HTTP connection reuse for the Codex "
    "client. Sized when the client's session is created.",
    "openai_codex.context_compression": "Compress long tool loops before "
    "they exceed the model's window.",
    "openai_codex.retry": "How failed Codex requests are retried.",
    "outbound_webhooks.targets": "Where lifecycle events are delivered.",
    "personality.user_presets": "Saved custom identity presets.",
    "tools.branch_freshness": "Warn when work starts from a stale git branch.",
    "tools.bulkhead": "Concurrency ceilings per execution kind, so one busy "
    "path cannot starve the others.",
    "tools.governor": "The command safety governor: what it refuses, and who may override it.",
    "tools.hosts": "Named hosts commands may target over SSH.",
    "tools.recovery": "Automatic recovery after a failed tool call.",
    "tools.ssh_pool": "Reuse SSH connections across commands.",
    "tools.ssh_retry": "How failed SSH connections are retried.",
    "tools.streaming": "Stream long tool output as it is produced.",
    "web.api_tokens": "Scoped API tokens defined in the config file.",
}

# --------------------------------------------------------------------------
# Leaves
# --------------------------------------------------------------------------

#: Identity text is rebuilt per prompt, but an agent or a suspended turn keeps
#: the identity it started with. Shared by the four identity leaves.
_IDENTITY_CONSUMERS: tuple[Consumer, ...] = (
    Consumer(
        "Chat, Discord, and loop prompts",
        "live_read",
        "Every prompt is assembled fresh and reads the current value.",
    ),
    Consumer(
        "Spawned agents",
        "live_for_new_work",
        "An agent's prompt is built once at spawn and runs its whole life on it.",
    ),
    Consumer(
        "Resumed turns",
        "live_for_new_work",
        "A turn suspended before the change resumes on its checkpointed prompt.",
    ),
)

FIELDS: dict[str, FieldSpec] = {
    "timezone": FieldSpec(
        label="Timezone",
        description="Timezone used in prompts and scheduled-time parsing.",
        apply_mode="restart",
        restart_reason="The scheduling parser captures timezone during startup.",
        consumers=(
            Consumer(
                "Prompt context",
                "live_read",
                "Future prompts read the configured value.",
            ),
            Consumer(
                "Time parser",
                "restart",
                "The parser currently captures the boot value.",
            ),
        ),
    ),
    "discord.token": FieldSpec(
        owner="secrets",
        sensitivity="sensitive",
        apply_mode="restart",
        description="Write-only Discord bot credential.",
        restart_reason="The gateway connection is established with this token at startup.",
    ),
    "discord.allowed_users": FieldSpec(
        description="Absolute global user gate for ordinary conversational "
        "intake. An empty list allows all users; guild and channel settings "
        "cannot readmit a blocked user. Prefix commands use separate "
        "authorization, and explicitly allowed test webhooks bypass this gate.",
    ),
    "discord.channels": FieldSpec(
        description="Absolute global channel gate for ordinary conversational "
        "intake. An empty list allows all channels; guild and channel settings "
        "cannot readmit a blocked channel. Prefix commands use separate "
        "authorization.",
    ),
    "discord.require_mention": FieldSpec(
        description="Require a mention by default. Guild and channel settings "
        "may override this behavior.",
    ),
    "discord.respond_to_bots": FieldSpec(
        description="Allow replies to bot-authored messages by default. Guild "
        "and channel settings may override this behavior.",
    ),
    "discord.ignore_bot_ids": FieldSpec(
        description="Bot IDs ignored by default. An explicit mention bypasses "
        "this ignore check, but the effective respond-to-bots policy still "
        "applies.",
    ),
    "llm_provider.active_provider": FieldSpec(
        description="Provider used for new primary requests.",
    ),
    "logging.level": FieldSpec(description="Minimum runtime log level."),
    "logging.directory": FieldSpec(
        apply_mode="restart",
        description="Declared path protected from overlap with the local command "
        "workspace. Odin does not write logs here or configure a log handler "
        "from this value.",
        restart_reason="The command executor snapshots the full configuration "
        "used by its workspace fence at startup.",
        consumers=(
            Consumer(
                "Local command workspace fence",
                "restart",
                "The executor protects the path captured when it was built.",
            ),
        ),
    ),
    "browser.default_timeout_ms": FieldSpec(
        unit="ms", description="Default browser operation timeout."
    ),
    "browser.viewport_width": FieldSpec(unit="px"),
    "browser.viewport_height": FieldSpec(unit="px"),
    "sessions.max_history": FieldSpec(unit="messages"),
    "sessions.max_age_hours": FieldSpec(unit="hours"),
    "attachments.temp_directory": FieldSpec(
        apply_mode="live_read",
        description="Workspace for downloaded and processed message attachments.",
        consumers=(
            Consumer(
                "Attachment intake and cleanup",
                "live_read",
                "New attachment operations read the current configured path.",
            ),
        ),
    ),
    "usage.directory": FieldSpec(
        apply_mode="activation_required",
        description="Target for durable usage history; no durable store is active today.",
        activation_policy="Validate the path and explicitly enable durable usage history.",
    ),
    "slack.forward_alerts": FieldSpec(
        apply_mode="activation_required",
        description="Forward normalized internal alerts to tested Slack destinations.",
        activation_policy="Requires an effective notifier, a tested destination, "
        "and an activation receipt.",
    ),
    # ---------------- issue_tracker ----------------
    # The enabled switch has one real effect today: the generic Config save
    # invalidates the tool catalog, whose next read includes or removes the
    # built-in definition. No production client is constructed, so visibility
    # is not usability; the advertised tool returns "not configured".
    "issue_tracker.enabled": FieldSpec(
        apply_mode="live_read",
        description="Controls whether issue_tracker is offered in the tool "
        "catalog. The catalog re-reads this value after a generic save, but no "
        "production client is constructed, so enabling it advertises a tool "
        "that answers 'not configured'. Configured-and-healthy gating is "
        "planned for the next campaign, not present in this release.",
        consumers=(
            Consumer(
                "Tool catalog visibility",
                "live_read",
                "The generic save invalidates the catalog; its next read uses "
                "this switch to include or remove issue_tracker.",
            ),
            Consumer(
                "Tool execution",
                "activation_required",
                "No production issue-tracker client is constructed, so an "
                "advertised tool answers 'not configured'. The next campaign "
                "will require a configured, healthy client before publication.",
            ),
        ),
    ),
    "issue_tracker.provider": FieldSpec(
        apply_mode="dormant",
        description="Stored provider choice; no production issue-tracker client "
        "reads it in this release.",
    ),
    "issue_tracker.api_token": FieldSpec(
        apply_mode="dormant",
        description="Stored issue-tracker credential; no production client is "
        "constructed to use it in this release.",
    ),
    "issue_tracker.base_url": FieldSpec(
        apply_mode="dormant",
        description="Stored Jira base URL; no production client is constructed "
        "to use it in this release.",
    ),
    "issue_tracker.project_key": FieldSpec(
        apply_mode="dormant",
        description="Stored default Jira project; no production client is "
        "constructed to use it in this release.",
    ),
    "issue_tracker.default_team_id": FieldSpec(
        apply_mode="dormant",
        description="Stored default Linear team; no production client is "
        "constructed to use it in this release.",
    ),
    "issue_tracker.scrub_secrets": FieldSpec(
        apply_mode="dormant",
        description="Stored output-scrubbing preference; no production client is "
        "constructed to produce issue-tracker output in this release.",
    ),
    # ---------------- agents ----------------
    "agents.max_concurrent_agents": FieldSpec(
        apply_mode="live_for_new_work",
        label="Maximum concurrent agents per channel",
        description="Maximum concurrently running agents per channel. "
        "Saving applies to new spawn admissions; agents already running are "
        "not stopped.",
    ),
    "agents.max_children_per_agent": FieldSpec(
        apply_mode="live_for_new_work",
        description="Lifetime direct-child limit per agent (1-10). Counts "
        "children ever spawned, not merely concurrent ones.",
        consumers=(
            Consumer(
                "New agent trees",
                "live_for_new_work",
                "The root snapshots this at spawn; every descendant inherits "
                "the root's value, and the agent's own prompt advertises it.",
            ),
            Consumer(
                "Trees already running",
                "live_for_new_work",
                "A running tree keeps the limit its root started with.",
            ),
        ),
    ),
    "agents.max_nesting_depth": FieldSpec(
        apply_mode="live_for_new_work",
        description="How deep an agent tree may nest. Both spawn paths read "
        "it at spawn time; running trees keep the depth they started with.",
    ),
    "agents.max_iterations": FieldSpec(
        apply_mode="live_for_new_work",
        description="Iteration budget for a spawned agent, fixed at spawn.",
    ),
    "agents.scheduled_max_iterations": FieldSpec(
        apply_mode="live_for_new_work",
        description="Iteration budget for agents spawned by a schedule.",
    ),
    "agents.hard_max_iterations": FieldSpec(
        apply_mode="live_for_new_work",
        description="Ceiling a spawn request may not exceed.",
        consumers=(
            Consumer(
                "spawn_agent",
                "live_for_new_work",
                "Each spawn clamps its request to this ceiling.",
            ),
            Consumer(
                "spawn_loop_agents",
                "activation_required",
                "The loop path does not consult this ceiling.",
            ),
        ),
    ),
    "agents.final_warning_iterations": FieldSpec(
        apply_mode="live_for_new_work",
        description="Remaining-iteration counts at which an agent is warned.",
        consumers=(
            Consumer(
                "spawn_agent",
                "live_for_new_work",
                "Each spawn reads the configured warning points.",
            ),
            Consumer(
                "spawn_loop_agents",
                "activation_required",
                "Loop-spawned agents fall back to the built-in warning points.",
            ),
        ),
    ),
    "agents.iteration_timeout_seconds": FieldSpec(
        apply_mode="live_for_new_work",
        unit="seconds",
        description="How long one agent iteration may run, fixed at spawn.",
    ),
    "agents.max_lifetime_seconds": FieldSpec(
        apply_mode="live_for_new_work",
        unit="seconds",
        description="Total lifetime budget for an agent, fixed at spawn.",
    ),
    # ---------------- observability ----------------
    # Live except the audit classifier, which the audit logger is constructed
    # with. Losing that one exception in a refactor is how a section-wide
    # "live" badge starts lying about a single leaf.
    "observability.context_trace.enabled": FieldSpec(
        apply_mode="live_read",
        description="Record per-turn context assembly.",
    ),
    "observability.context_trace.memory_key_mode": FieldSpec(
        apply_mode="live_read",
        description="How much memory-key detail a context trace records.",
    ),
    "observability.context_trace.include_segment_ids": FieldSpec(
        apply_mode="live_read",
        description="Include prompt segment identifiers in the trace.",
    ),
    "observability.context_trace.max_trace_bytes": FieldSpec(
        apply_mode="live_read",
        unit="bytes",
        description="Cap on one recorded context trace.",
    ),
    "observability.audit_failure_classification": FieldSpec(
        apply_mode="restart",
        description="Classify audited failures into stable categories.",
        restart_reason="The audit logger is constructed with this setting; the "
        "rest of the section is re-read per use.",
    ),
    "observability.prompt_budget_accounting": FieldSpec(
        apply_mode="live_read",
        description="Record how the system-prompt budget was spent.",
    ),
    "observability.trajectory_user_content": FieldSpec(
        apply_mode="live_read",
        description="Store user message content in trajectory records.",
    ),
    "observability.max_user_content_chars": FieldSpec(
        apply_mode="live_read",
        unit="characters",
        description="Cap on stored user content per record.",
    ),
    "observability.loop_trace": FieldSpec(
        apply_mode="live_read",
        description="Record autonomous-loop iteration detail.",
    ),
    "observability.max_tool_result_chars": FieldSpec(
        apply_mode="live_read",
        unit="characters",
        description="Cap on stored tool-result text per record.",
    ),
    # ---------------- learning ----------------
    "learning.enabled": FieldSpec(
        apply_mode="restart",
        description="Reflect on conversations and record what was learned.",
        restart_reason="The reflector is built with this flag at startup.",
    ),
    "learning.max_entries": FieldSpec(
        apply_mode="restart",
        description="Maximum learned entries retained.",
        restart_reason="The reflector is built with this budget at startup.",
    ),
    "learning.consolidation_target": FieldSpec(
        apply_mode="restart",
        description="Entry count consolidation aims for.",
        restart_reason="The reflector is built with this budget at startup.",
    ),
    "learning.injection_token_budget": FieldSpec(
        apply_mode="restart",
        unit="tokens",
        description="Token budget for learned context added to a prompt.",
        restart_reason="The reflector is built with this budget at startup.",
    ),
    "learning.loop_reflection_enabled": FieldSpec(
        apply_mode="live_read",
        description="Reflect on autonomous-loop turns as well as conversations.",
    ),
    "learning.loop_reflection_cooldown_hours": FieldSpec(
        apply_mode="restart",
        unit="hours",
        description="Minimum gap between loop reflections.",
        restart_reason="The loop-reflection gate is built with this value at startup.",
    ),
    "learning.loop_reflection_max_per_hour": FieldSpec(
        apply_mode="restart",
        description="Loop reflections allowed per hour.",
        restart_reason="The loop-reflection gate is built with this value at startup.",
    ),
    # ---------------- personality ----------------
    # The generic save republishes presets and rebuilds the prompt, so these
    # are live. Spawned agents and resumed turns keep the identity they
    # started with, which is a real split and is published as such.
    "personality.preset": FieldSpec(
        apply_mode="live_for_new_work",
        description="Active identity preset. Prompts read it on every build.",
        consumers=_IDENTITY_CONSUMERS,
    ),
    "personality.custom_name": FieldSpec(
        apply_mode="live_for_new_work",
        description="Name used when the preset is 'custom'; ignored otherwise.",
        consumers=_IDENTITY_CONSUMERS,
    ),
    "personality.custom_identity": FieldSpec(
        apply_mode="live_for_new_work",
        description="Identity text used when the preset is 'custom'.",
        consumers=_IDENTITY_CONSUMERS,
    ),
    "personality.custom_voice": FieldSpec(
        apply_mode="live_for_new_work",
        description="Voice text used when the preset is 'custom'. This is the "
        "response style, unrelated to audio.",
        consumers=_IDENTITY_CONSUMERS,
    ),
    "personality.user_presets": FieldSpec(
        apply_mode="live_apply",
        apply_handler="PUT /api/config (republishes the preset registry)",
        description="Saved custom presets. Resolution reads a process-global "
        "registry, which the save republishes.",
    ),
    # ---------------- openai_codex ----------------
    "openai_codex.enabled": FieldSpec(
        apply_mode="live_apply",
        apply_handler="PUT /api/llm/codex/config",
        description="Whether the primary Codex client exists.",
        consumers=(
            Consumer(
                "Codex client lifecycle",
                "live_apply",
                "The reload path creates or drops the live client.",
            ),
            Consumer(
                "generate_image tool visibility",
                "live_read",
                "Read from the tool catalogue, which the generic save invalidates.",
            ),
        ),
    ),
    "openai_codex.model": FieldSpec(
        apply_mode="live_apply",
        apply_handler="PUT /api/llm/codex/config",
        description="Primary Codex model.",
        consumers=(
            Consumer(
                "Chat and autonomous loops",
                "live_apply",
                "Requests use the live client's model, which only a Codex reload refreshes.",
            ),
            Consumer(
                "Spawned agents inheriting the main model",
                "live_read",
                "Agent generations resolve the model from config at call time, "
                "so agents adopt it before chat does.",
            ),
        ),
    ),
    "openai_codex.reasoning_effort": FieldSpec(
        apply_mode="live_apply",
        apply_handler="PUT /api/llm/codex/config",
        description="Main Codex reasoning effort.",
        consumers=(
            Consumer(
                "Chat and autonomous loops",
                "live_apply",
                "Requests use the live client's effort, refreshed by a Codex reload.",
            ),
            Consumer(
                "Agents that inherit effort",
                "live_apply",
                "Inheriting agents snapshot the live client's effort, so they "
                "follow the same reload — unlike the model, which they read "
                "from config directly.",
            ),
        ),
    ),
    "openai_codex.agent_reasoning_effort": FieldSpec(
        apply_mode="live_read",
        description="Reasoning policy for spawned-agent generations; the next "
        "iteration reads it at call time.",
    ),
    "openai_codex.agent_model": FieldSpec(
        apply_mode="live_read",
        description="Model policy for spawned-agent generations; the next "
        "iteration reads it at call time.",
    ),
    "openai_codex.credentials_path": FieldSpec(
        owner="secrets",
        sensitivity="sensitive",
        apply_mode="restart",
        description="Credential store for the Codex account pool. The generic "
        "save refuses this field, and no endpoint changes it.",
        restart_reason="The account pool captures this path when it is built; "
        "reloading re-reads the captured path, never the configured one.",
    ),
    "openai_codex.request_timeout_seconds": FieldSpec(
        apply_mode="live_apply",
        apply_handler="POST /api/codex/reload",
        unit="seconds",
        description="Whole-request timeout, a backstop rather than a working limit.",
        consumers=(
            Consumer(
                "Primary Codex client",
                "live_apply",
                "The reload copies this onto the live client.",
            ),
            Consumer(
                "Auxiliary Codex client",
                "live_apply",
                "Snapshotted when the auxiliary client is built, so it stays "
                "stale until PUT /api/llm/auxiliary/config rebuilds it — a "
                "Codex reload alone does not reach it.",
            ),
        ),
    ),
    "openai_codex.stream_stall_timeout_seconds": FieldSpec(
        apply_mode="live_apply",
        apply_handler="POST /api/codex/reload",
        unit="seconds",
        description="Maximum silence between streamed reads before the "
        "connection is treated as dead.",
        consumers=(
            Consumer(
                "Primary Codex client",
                "live_apply",
                "The reload copies this onto the live client.",
            ),
            Consumer(
                "Auxiliary Codex client",
                "live_apply",
                "Snapshotted when the auxiliary client is built, so it stays "
                "stale until PUT /api/llm/auxiliary/config rebuilds it — a "
                "Codex reload alone does not reach it.",
            ),
        ),
    ),
    "openai_codex.retry.max_retries": FieldSpec(
        apply_mode="live_apply",
        apply_handler="POST /api/codex/reload",
        description="Total request attempts. Zero means one attempt with no retries.",
        consumers=(
            Consumer(
                "Primary Codex client",
                "live_apply",
                "The reload copies this onto the live client.",
            ),
            Consumer(
                "Auxiliary Codex client",
                "live_apply",
                "Snapshotted when the auxiliary client is built, so it stays "
                "stale until PUT /api/llm/auxiliary/config rebuilds it — a "
                "Codex reload alone does not reach it.",
            ),
        ),
    ),
    "openai_codex.retry.base_delay": FieldSpec(
        apply_mode="live_apply",
        apply_handler="POST /api/codex/reload",
        unit="seconds",
        description="Initial retry delay.",
        consumers=(
            Consumer(
                "Primary Codex client",
                "live_apply",
                "The reload copies this onto the live client.",
            ),
            Consumer(
                "Auxiliary Codex client",
                "live_apply",
                "Snapshotted when the auxiliary client is built, so it stays "
                "stale until PUT /api/llm/auxiliary/config rebuilds it — a "
                "Codex reload alone does not reach it.",
            ),
        ),
    ),
    "openai_codex.retry.max_delay": FieldSpec(
        apply_mode="live_apply",
        apply_handler="POST /api/codex/reload",
        unit="seconds",
        description="Maximum retry delay.",
        consumers=(
            Consumer(
                "Primary Codex client",
                "live_apply",
                "The reload copies this onto the live client.",
            ),
            Consumer(
                "Auxiliary Codex client",
                "live_apply",
                "Snapshotted when the auxiliary client is built, so it stays "
                "stale until PUT /api/llm/auxiliary/config rebuilds it — a "
                "Codex reload alone does not reach it.",
            ),
        ),
    ),
    "openai_codex.connection_pool.max_connections": FieldSpec(
        apply_mode="restart",
        description="Maximum Codex transport connections.",
        restart_reason="Pool sizing is fixed when the client's HTTP session is "
        "created; no reload path rebuilds it for the primary client.",
        consumers=(
            Consumer(
                "Primary Codex client",
                "restart",
                "The session is built once and persists.",
            ),
            Consumer(
                "Auxiliary Codex client",
                "live_apply",
                "The auxiliary client is rebuilt from live config, so it does adopt this.",
            ),
        ),
    ),
    "openai_codex.connection_pool.keepalive_timeout": FieldSpec(
        apply_mode="restart",
        unit="seconds",
        description="Codex connection keepalive timeout.",
        restart_reason="Pool keepalive is fixed when the client's HTTP session "
        "is created; no reload path rebuilds it for the primary client.",
    ),
    "openai_codex.auxiliary.enabled": FieldSpec(
        apply_mode="live_apply",
        apply_handler="PUT /api/llm/auxiliary/config",
        description="Route the background jobs to a separate Codex model.",
    ),
    "openai_codex.auxiliary.model": FieldSpec(
        apply_mode="live_apply",
        apply_handler="PUT /api/llm/auxiliary/config",
        description="Model used for compaction, reflection, consolidation, and "
        "background follow-up.",
    ),
    "openai_codex.context_compression.enabled": FieldSpec(
        apply_mode="restart",
        description="Compress long tool loops before they exceed the window.",
        restart_reason="The compressor is built at startup; later saves replace "
        "the config object it was built from without rebuilding it.",
    ),
    "openai_codex.context_compression.max_context_chars": FieldSpec(
        apply_mode="restart",
        unit="characters",
        description="Explicit ceiling on the compaction target, in "
        "characters. Null means auto: the per-model budget resolver derives "
        "the target from the serving model's usable input budget. An "
        "explicit value only lowers the derived target, never raises it.",
        restart_reason="The compressor holds the configuration object it was "
        "built with, which a save replaces rather than updates.",
    ),
    "openai_codex.context_budget_overrides": FieldSpec(
        apply_mode="live_read",
        unit="tokens",
        description="Per-model usable-input-budget overrides, keyed by "
        "canonical model. Read at each logical generation's budget "
        "resolution: chat turns, agent iterations, and rescue ladders pick "
        "up a save on their next generation; an in-flight generation keeps "
        "its snapshot.",
    ),
    "openai_codex.context_utilization": FieldSpec(
        apply_mode="live_read",
        unit="percent",
        description="Working-set share of the effective budget that "
        "compaction targets. Read at each logical generation's budget "
        "resolution; never reduces budgets at or below 272K tokens, so a "
        "change may have no effect on smaller models by design.",
    ),
    "openai_codex.context_compression.keep_recent_iterations": FieldSpec(
        apply_mode="restart",
        unit="iterations",
        description="Recent tool iterations preserved during compression.",
        restart_reason="The compressor holds the configuration object it was "
        "built with, which a save replaces rather than updates.",
    ),
    # ---------------- tools ----------------
    "tools.enabled": FieldSpec(
        apply_mode="live_read",
        description="Whether tools are offered to the model at all.",
    ),
    "tools.max_tool_iterations_chat": FieldSpec(
        apply_mode="live_for_new_work",
        description="Tool-iteration ceiling for a chat turn.",
        consumers=(
            Consumer(
                "New chat turns",
                "live_read",
                "Each turn reads the current ceiling when it starts.",
            ),
            Consumer(
                "Turns already running",
                "live_for_new_work",
                "A running turn keeps the ceiling it started with.",
            ),
        ),
    ),
    "tools.max_tool_iterations_loop": FieldSpec(
        apply_mode="live_for_new_work",
        description="Tool-iteration ceiling for one autonomous-loop iteration.",
        consumers=(
            Consumer(
                "New loop iterations",
                "live_read",
                "Each iteration reads the current ceiling when it starts.",
            ),
            Consumer(
                "Iterations already running",
                "live_for_new_work",
                "A running iteration keeps the ceiling it started with.",
            ),
        ),
    ),
    "tools.claude_code_dir": FieldSpec(
        apply_mode="live_read",
        description="Working directory advertised for the coding tool.",
    ),
    "tools.claude_code_host": FieldSpec(
        apply_mode="restart",
        description="Host the coding tool runs on.",
        restart_reason="Execution reads the host from the tool executor's "
        "boot configuration, even though the tool's visibility updates live.",
        consumers=(
            Consumer(
                "Tool visibility",
                "live_read",
                "An empty value hides the tool; the catalogue refreshes on save.",
            ),
            Consumer(
                "Execution",
                "restart",
                "The executor resolves the host from the configuration it was built with.",
            ),
        ),
    ),
    "tools.claude_code_user": FieldSpec(
        apply_mode="restart",
        description="User the coding tool runs as.",
        restart_reason="The executor resolves this from the configuration it was built with.",
    ),
    "tools.command_timeout_seconds": FieldSpec(
        apply_mode="restart",
        unit="seconds",
        description="Default per-command timeout.",
        restart_reason="The executor applies the timeout it was built with; "
        "only the tool-loop wrapper reads the configured value live.",
        consumers=(
            Consumer(
                "Tool-loop wrapper",
                "live_read",
                "The outer wait reads the current value each turn.",
            ),
            Consumer(
                "Command execution",
                "restart",
                "The executor uses the value it was built with.",
            ),
            Consumer(
                "Tool-timeout endpoint",
                "live_apply",
                "The dedicated endpoint changes the executor's own value.",
            ),
        ),
    ),
    "tools.tool_timeouts": FieldSpec(
        apply_mode="restart",
        description="Per-tool timeout overrides.",
        restart_reason="The executor applies the map it was built with.",
        consumers=(
            Consumer(
                "Spawned agents",
                "live_for_new_work",
                "An agent reads the map at spawn and keeps it for its life.",
            ),
            Consumer(
                "Command execution",
                "restart",
                "The executor uses the map it was built with.",
            ),
            Consumer(
                "Tool-timeout endpoint",
                "live_apply",
                "The dedicated endpoint changes the executor's own map.",
            ),
        ),
    ),
    "tools.hosts": FieldSpec(
        apply_mode="restart",
        description="Named hosts commands may target.",
        restart_reason="Both execution and the host-access fence resolve hosts "
        "from the configuration they were built with, so a host added live is "
        "advertised and scheduled but refused when a command runs.",
        consumers=(
            Consumer(
                "Command execution and host access",
                "restart",
                "A newly added host is rejected as unknown until restart.",
            ),
            Consumer(
                "Scheduled host digests",
                "live_read",
                "The digest job iterates the configured hosts immediately.",
            ),
            Consumer(
                "Prompt host list",
                "activation_required",
                "The prompt's host list is cached; POST /api/reload republishes it.",
            ),
        ),
    ),
    "tools.ssh_key_path": FieldSpec(
        owner="secrets",
        sensitivity="sensitive",
        apply_mode="restart",
        description="Private key used for SSH to configured hosts.",
        restart_reason="The executor's SSH paths come from the configuration "
        "it was built with; only the media tool reads them live.",
    ),
    "tools.ssh_known_hosts_path": FieldSpec(
        apply_mode="restart",
        description="Known-hosts file used to verify SSH targets.",
        restart_reason="The executor's SSH paths come from the configuration "
        "it was built with; only the media tool reads them live.",
    ),
    "tools.audit_log_path": FieldSpec(
        apply_mode="live_read",
        description="Audit log path used by the observability read endpoint. "
        "The audit writer's own path is fixed in code, so this redirects "
        "reading, not writing.",
        consumers=(
            Consumer(
                "Audit observability endpoint",
                "live_read",
                "The endpoint reads the current configured path on each request.",
            ),
        ),
    ),
    "tools.trajectory_path": FieldSpec(
        apply_mode="live_read",
        description="Trajectory directory used by the observability read "
        "endpoint. The writer's own path is fixed in code, so this redirects "
        "reading, not writing.",
        consumers=(
            Consumer(
                "Trajectory observability endpoint",
                "live_read",
                "The endpoint reads the current configured path on each request.",
            ),
        ),
    ),
    "tools.skill_allowed_urls": FieldSpec(
        apply_mode="restart",
        description="Sources a skill may be installed from.",
        restart_reason="The allowlist is published to a process-wide value at startup.",
    ),
    "tools.local_working_dir": FieldSpec(
        apply_mode="restart",
        description="Working directory for local commands.",
        restart_reason="Deliberately stable: moving it under a running process "
        "would break workflows that write a file in one command and read it in "
        "the next.",
    ),
    "tools.governor.block_critical": FieldSpec(
        apply_mode="restart",
        description="Refuse commands classified as critical.",
        restart_reason="The governor is constructed with these values.",
    ),
    "tools.governor.block_exfil": FieldSpec(
        apply_mode="restart",
        description="Refuse commands that would exfiltrate data.",
        restart_reason="The governor is constructed with these values.",
    ),
    "tools.governor.admin_can_override": FieldSpec(
        apply_mode="restart",
        description="Let an admin proceed past a governor refusal.",
        restart_reason="The governor is constructed with these values.",
    ),
    "tools.governor.host_overrides": FieldSpec(
        apply_mode="restart",
        description="Per-host governor exceptions.",
        restart_reason="The governor copies this map when it is constructed.",
    ),
    "tools.ssh_retry.max_retries": FieldSpec(
        apply_mode="restart",
        description="SSH retry attempts.",
        restart_reason="Read from the configuration the executor was built with.",
    ),
    "tools.ssh_retry.base_delay": FieldSpec(
        apply_mode="restart",
        unit="seconds",
        description="Initial SSH retry delay.",
        restart_reason="Read from the configuration the executor was built with.",
    ),
    "tools.ssh_retry.max_delay": FieldSpec(
        apply_mode="restart",
        unit="seconds",
        description="Maximum SSH retry delay.",
        restart_reason="Read from the configuration the executor was built with.",
    ),
    "tools.bulkhead.ssh_max_concurrent": FieldSpec(
        apply_mode="restart",
        description="Concurrent SSH operations allowed.",
        restart_reason="Bulkhead semaphores are sized when they are created.",
    ),
    "tools.bulkhead.subprocess_max_concurrent": FieldSpec(
        apply_mode="restart",
        description="Concurrent local subprocesses allowed.",
        restart_reason="Bulkhead semaphores are sized when they are created.",
    ),
    "tools.bulkhead.browser_max_concurrent": FieldSpec(
        apply_mode="restart",
        description="Concurrent browser operations allowed.",
        restart_reason="Bulkhead semaphores are sized when they are created.",
    ),
    "tools.bulkhead.ssh_max_queued": FieldSpec(
        apply_mode="restart",
        description="Queued SSH operations allowed before rejection.",
        restart_reason="Bulkhead queues are sized when they are created.",
    ),
    "tools.bulkhead.subprocess_max_queued": FieldSpec(
        apply_mode="restart",
        description="Queued subprocesses allowed before rejection.",
        restart_reason="Bulkhead queues are sized when they are created.",
    ),
    "tools.bulkhead.browser_max_queued": FieldSpec(
        apply_mode="restart",
        description="Queued browser operations allowed before rejection.",
        restart_reason="Bulkhead queues are sized when they are created.",
    ),
    "tools.ssh_pool.enabled": FieldSpec(
        apply_mode="restart",
        description="Reuse SSH connections across commands.",
        restart_reason="The connection pool exists only if it was enabled at startup.",
    ),
    "tools.ssh_pool.control_persist": FieldSpec(
        apply_mode="restart",
        description="How long a pooled SSH connection is kept open.",
        restart_reason="The pool is constructed with this value.",
    ),
    "tools.ssh_pool.socket_dir": FieldSpec(
        apply_mode="restart",
        description="Directory holding pooled SSH control sockets.",
        restart_reason="The pool is constructed with this value.",
    ),
    "tools.recovery.enabled": FieldSpec(
        apply_mode="restart",
        description="Attempt recovery after a failed tool call.",
        restart_reason="The executor captures this flag when it is built.",
    ),
    "tools.branch_freshness.enabled": FieldSpec(
        apply_mode="restart",
        description="Warn when work starts from a stale branch.",
        restart_reason="The executor captures this flag when it is built.",
    ),
    "tools.streaming.enabled": FieldSpec(
        apply_mode="restart",
        description="Stream long tool output as it is produced.",
        restart_reason="The streamer is built only when this is enabled at startup.",
    ),
    "tools.streaming.tools": FieldSpec(
        apply_mode="restart",
        description="Tools whose output is streamed.",
        restart_reason="The streamer is constructed with this list.",
    ),
    "tools.streaming.chunk_interval_seconds": FieldSpec(
        apply_mode="restart",
        unit="seconds",
        description="How often streamed output is flushed.",
        restart_reason="The streamer is constructed with this value.",
    ),
    "tools.streaming.max_chunk_chars": FieldSpec(
        apply_mode="restart",
        unit="characters",
        description="Maximum size of one streamed chunk.",
        restart_reason="The streamer is constructed with this value.",
    ),
    # ---------------- llm_recovery ----------------
    "llm_recovery.generation_deadline_seconds": FieldSpec(
        apply_mode="live_read",
        unit="seconds",
        description="How long a generation may wait out capacity failures. "
        "Bounds waiting, not an in-flight attempt.",
    ),
    "llm_recovery.backoff_cap_seconds": FieldSpec(
        apply_mode="live_read",
        unit="seconds",
        description="Ceiling on the wait between recovery attempts.",
    ),
    "llm_recovery.breaker_generation_threshold": FieldSpec(
        apply_mode="restart",
        description="Failed generations before a model's breaker opens.",
        restart_reason="The breaker registry is built with this value, and each "
        "per-model breaker copies it again on first use.",
    ),
    "llm_recovery.breaker_cooldown_base_seconds": FieldSpec(
        apply_mode="restart",
        unit="seconds",
        description="Initial cooldown after a breaker opens.",
        restart_reason="The breaker registry is built with this value, and each "
        "per-model breaker copies it again on first use.",
    ),
    "llm_recovery.breaker_cooldown_cap_seconds": FieldSpec(
        apply_mode="restart",
        unit="seconds",
        description="Maximum breaker cooldown.",
        restart_reason="The breaker registry is built with this value, and each "
        "per-model breaker copies it again on first use.",
    ),
    # ---------------- turn_state ----------------
    "turn_state.enabled": FieldSpec(
        apply_mode="restart",
        description="Checkpoint Discord chat turns so they survive an outage.",
        restart_reason="The checkpoint store is opened at startup, and every "
        "consumer tests whether it exists rather than re-reading this flag.",
    ),
    "turn_state.db_path": FieldSpec(
        apply_mode="restart",
        description="Location of the checkpoint database.",
        restart_reason="The database is opened at startup.",
    ),
    "turn_state.auto_resume": FieldSpec(
        apply_mode="restart",
        description="Resume a suspended turn automatically once capacity returns.",
        restart_reason="The resume waiter captures this flag when it is built.",
    ),
    "turn_state.resume_ttl_hours": FieldSpec(
        apply_mode="restart",
        unit="hours",
        description="How long a suspended turn stays resumable.",
        restart_reason="Waiters give up at the value they started with, so "
        "raising this live keeps rows alive with nothing waiting on them.",
        consumers=(
            Consumer(
                "Expiry sweep",
                "live_read",
                "The sweep reads the current value and keeps rows longer.",
            ),
            Consumer(
                "Auto-resume waiter",
                "restart",
                "Waiters give up at the value captured when they were built.",
            ),
        ),
    ),
    "turn_state.payload_retention_days": FieldSpec(
        apply_mode="live_read",
        unit="days",
        description="How long checkpoint payloads are kept.",
    ),
    "turn_state.ledger_retention_days": FieldSpec(
        apply_mode="live_read",
        unit="days",
        description="How long the operation ledger is kept.",
    ),
}


# --------------------------------------------------------------------------
# Patterns — leaves that exist only once a user adds an entry
# --------------------------------------------------------------------------


def _pattern_spec(path: str) -> FieldSpec | None:
    """Specs for user-created leaves, which cannot be enumerated in advance.

    Paths arrive either concrete (``tools.hosts.prod.address``) or as the
    schema wildcard the CI gate walks (``tools.hosts.*.address``); both are
    matched by prefix so the gate checks exactly what the API will serve.
    """
    if path.startswith("tools.hosts."):
        return FieldSpec(
            apply_mode="restart",
            description="Connection detail for a configured host.",
            restart_reason="Command execution and the host-access fence both "
            "resolve hosts from the configuration they were built with.",
        )
    if path.startswith("personality.user_presets."):
        return FieldSpec(
            apply_mode="live_apply",
            apply_handler="PUT /api/config (republishes the preset registry)",
            description="Field of a saved custom preset.",
        )
    if path.startswith("mcp.servers.") and (path.endswith(".headers") or path.endswith(".env")):
        return FieldSpec(
            owner="secrets",
            sensitivity="secret_container",
            description="Credential-bearing container for this MCP server.",
        )
    if path.startswith("outbound_webhooks.targets."):
        if path.endswith(".secret"):
            return FieldSpec(
                owner="secrets",
                sensitivity="sensitive",
                description="Signing secret for this target.",
            )
        if path.endswith(".scrub_secrets") or path.endswith(".verify_ssl"):
            return FieldSpec(
                description="Target-bound safety override. Boot wiring drops "
                "the persisted value and the live target defaults to true; "
                "the dedicated endpoint can change the running dispatcher "
                "without persisting it.",
                boot_snapshot_is_effective=False,
            )
    return None


def _is_sensitive_path(path: str) -> bool:
    """Use the same compound-key rule as GET /api/config redaction.

    A credential-bearing scalar or plain mapping makes its descendants secret
    (``slack.webhook_urls.ops``). A container OF schema records does not:
    ``web.api_tokens.0.tier`` is public metadata beside the token field. The
    schema distinction prevents both leaking arbitrary-key maps and redacting
    whole records into uselessness.
    """
    segments = path.split(".")
    facts = schema_facts()
    for index, segment in enumerate(segments):
        if not is_sensitive_key(segment):
            continue
        ancestor = ".".join(segments[: index + 1])
        if index < len(segments) - 1 and facts.get(ancestor, {}).get("is_container"):
            continue
        return True
    return False


def _title_case(value: str) -> str:
    return " ".join(word.capitalize() for word in str(value).replace("-", "_").split("_") if word)


def has_explicit_spec(path: str) -> bool:
    """True when this exact leaf is classified, rather than inheriting."""
    return path in FIELDS or _pattern_spec(path) is not None


def spec_for(path: str) -> FieldSpec:
    """Resolve a dotted path to a fully-populated spec.

    Explicit leaf wins, then pattern, then the section default.
    """
    section = path.split(".", 1)[0]
    section_spec = SECTIONS.get(section)
    resolved = FIELDS.get(path) or _pattern_spec(path) or FieldSpec()

    if resolved.apply_mode is None:
        resolved = replace(
            resolved,
            apply_mode=section_spec.apply_mode if section_spec else "restart",
        )
    if resolved.sensitivity is None:
        # Container shape wins over a credential-shaped container name. A list
        # such as web.api_tokens must expose only configured state, not masquerade
        # as one scalar secret and not serialize its entries.
        if _facts_for(path).get("secret_container"):
            derived: Sensitivity = "secret_container"
        elif _is_sensitive_path(path):
            derived = "sensitive"
        else:
            derived = "public"
        resolved = replace(resolved, sensitivity=derived)
    if resolved.owner is None:
        owner = section_spec.owner if section_spec else None
        if owner is None:
            owner = "config" if resolved.sensitivity == "public" else "secrets"
        resolved = replace(resolved, owner=owner)
    if resolved.description is None and section_spec is not None:
        resolved = replace(resolved, description=section_spec.description)
    if resolved.apply_mode == "restart" and resolved.restart_reason is None:
        reason = section_spec.restart_reason if section_spec else None
        resolved = replace(
            resolved,
            restart_reason=reason or f"{_title_case(section)} is constructed during startup.",
        )
    if (
        resolved.apply_mode in ("activation_required", "dormant")
        and resolved.activation_policy is None
    ):
        policy = section_spec.activation_policy if section_spec else None
        resolved = replace(
            resolved,
            activation_policy=policy
            or "Saving configuration does not enable this feature. Explicit "
            "activation is required.",
        )
    if not resolved.consumers and section_spec is not None:
        resolved = replace(resolved, consumers=section_spec.consumers)
    if resolved.apply_mode == "live_apply" and resolved.apply_handler is None:
        resolved = replace(
            resolved,
            apply_handler=section_spec.apply_handler if section_spec else None,
        )

    # The command executor snapshots the full configuration used by its
    # workspace-overlap fence. Every declared protected path therefore has a
    # restart-bound consumer even when another subsystem reads it live. This
    # inventory is shared with tools.workspace so safety and UI truth cannot
    # silently diverge.
    if path in WORKSPACE_PROTECTED_CONFIG_PATH_NAMES:
        fence_name = "Local command workspace fence"
        if not any(consumer.name == fence_name for consumer in resolved.consumers):
            resolved = replace(
                resolved,
                consumers=resolved.consumers
                + (
                    Consumer(
                        fence_name,
                        "restart",
                        "The running executor protects the path captured when "
                        "it was built; restart adopts the saved path.",
                    ),
                ),
            )
        # Keep explicit deferred/dormant semantics (notably usage.directory),
        # but otherwise make the field badge no stronger than its slowest
        # consumer.
        if resolved.apply_mode in {"live_read", "live_apply", "live_for_new_work"}:
            resolved = replace(
                resolved,
                apply_mode="restart",
                restart_reason="The command executor snapshots this path for "
                "the local-workspace overlap fence when it is built.",
            )
    return resolved


def is_secret(path: str) -> bool:
    """True when this path's VALUE must never leave the process."""
    return spec_for(path).sensitivity in ("sensitive", "secret_container")


# --------------------------------------------------------------------------
# Field records
# --------------------------------------------------------------------------


def flatten(value: Any, prefix: str = "") -> list[tuple[str, Any]]:
    """Config tree to ``(dotted_path, leaf_value)`` pairs.

    An empty mapping is itself a leaf: an empty ``headers`` still needs a
    record, otherwise a credential container disappears from the page the
    moment someone clears it.

    A list of RECORDS is descended into, because its entries carry their own
    leaves — ``web.api_tokens`` and ``outbound_webhooks.targets`` each hold a
    credential per entry, and treating the list as one leaf would serialize
    those secrets whole. A list of plain values stays a single leaf, since it
    is edited as one value.
    """
    out: list[tuple[str, Any]] = []
    if isinstance(value, dict):
        if not value and prefix:
            out.append((prefix, value))
        for key, child in value.items():
            out.extend(flatten(child, f"{prefix}.{key}" if prefix else str(key)))
        return out
    if isinstance(value, list) and any(isinstance(item, dict) for item in value):
        for index, child in enumerate(value):
            out.extend(flatten(child, f"{prefix}.{index}" if prefix else str(index)))
        return out
    if prefix:
        out.append((prefix, value))
    return out


def _annotation_facts(annotation: Any) -> dict[str, Any]:
    """Type and enum for one field annotation, unwrapping Optional."""
    facts: dict[str, Any] = {"type": None, "enum": None}
    origin = typing.get_origin(annotation)
    if origin in (typing.Union, types.UnionType):
        for arg in typing.get_args(annotation):
            if arg is type(None):
                continue
            return _annotation_facts(arg)
        return facts
    if origin is Literal:
        options = [a for a in typing.get_args(annotation) if a is not None]
        facts["enum"] = [str(a) for a in options]
        facts["type"] = "string"
        return facts
    if origin in (list, set, tuple, frozenset):
        facts["type"] = "array"
        return facts
    if origin is dict:
        facts["type"] = "object"
        return facts
    if isinstance(annotation, type):
        if issubclass(annotation, enum.Enum):
            facts["enum"] = [str(member.value) for member in annotation]
            facts["type"] = "string"
        elif issubclass(annotation, bool):
            facts["type"] = "boolean"
        elif issubclass(annotation, int):
            facts["type"] = "integer"
        elif issubclass(annotation, float):
            facts["type"] = "number"
        elif issubclass(annotation, str):
            facts["type"] = "string"
    return facts


def element_model(annotation: Any) -> type[BaseModel] | None:
    """The record type inside a ``list[Model]`` or ``dict[str, Model]``.

    Entries are user data, but their FIELDS are schema — a credential added to
    a webhook target is a new secret leaf, and nothing that stops at the
    container would ever see it.
    """
    origin = typing.get_origin(annotation)
    if origin in (typing.Union, types.UnionType):
        for arg in typing.get_args(annotation):
            if arg is type(None):
                continue
            found = element_model(arg)
            if found is not None:
                return found
        return None
    args = typing.get_args(annotation)
    if origin in (list, set, tuple, frozenset):
        candidates = args[:1]
    elif origin is dict:
        candidates = args[1:2]
    else:
        return None
    for arg in candidates:
        if isinstance(arg, type) and issubclass(arg, BaseModel):
            return arg
    return None


def _constraint_facts(info: Any) -> dict[str, Any]:
    """Bounds Pydantic already enforces, named as the page expects.

    Only field metadata is read. Many bounds live in ``@field_validator``
    bodies instead, and those are deliberately NOT restated here: copying a
    number out of a validator is how the page ends up offering a range the
    schema stopped accepting. Those fields publish no client-side bounds and
    are validated on save, which cannot go stale.
    """
    names = {
        "ge": "minimum",
        "le": "maximum",
        "gt": "exclusive_minimum",
        "lt": "exclusive_maximum",
        "min_length": "min_length",
        "max_length": "max_length",
    }
    out: dict[str, Any] = {}
    for item in getattr(info, "metadata", ()) or ():
        for attr, key in names.items():
            value = getattr(item, attr, None)
            if value is not None:
                out[key] = value
    return out


@functools.lru_cache(maxsize=1)
def schema_facts() -> dict[str, dict[str, Any]]:
    """Per-leaf type, enum, constraints, and default, read from the schema.

    Hand-copying these into the registry is how a bound tightens in the schema
    and the page keeps offering the old range. Pydantic already knows; the
    registry says only what Pydantic cannot — how a field reaches the runtime.
    """
    from .schema import Config

    out: dict[str, dict[str, Any]] = {}

    def walk(model: type[BaseModel], prefix: str) -> None:
        for name, info in model.model_fields.items():
            path = f"{prefix}.{name}" if prefix else name
            annotation = info.annotation
            nested = annotation
            origin = typing.get_origin(nested)
            if origin in (typing.Union, types.UnionType):
                for arg in typing.get_args(nested):
                    if arg is not type(None):
                        nested = arg
                        break
            if isinstance(nested, type) and issubclass(nested, BaseModel):
                walk(nested, path)
                continue
            # A list or dict OF records: the container is a leaf the page can
            # edit, and its record fields are schema too. Both are recorded,
            # keyed without the entry index so `targets.0.secret` resolves.
            element = element_model(annotation)
            if element is not None:
                walk(element, path)
            facts = _annotation_facts(annotation)
            facts["is_container"] = element is not None
            facts["aliases"] = [
                alias
                for alias in (
                    getattr(info, "validation_alias", None),
                    getattr(info, "alias", None),
                    getattr(info, "serialization_alias", None),
                )
                if isinstance(alias, str) and alias != name
            ]
            facts["constraints"] = _constraint_facts(info)
            default = info.default
            facts["default"] = None if repr(default) == "PydanticUndefined" else default
            # Object maps have operator-defined keys, while record containers
            # have a schema per entry but no scalar editor. Plain scalar arrays
            # remain chip-editable and are deliberately not marked read-only.
            facts["structured_container"] = facts.get("type") == "object" or element is not None
            if not isinstance(facts["default"], (str, int, float, bool, type(None))):
                facts["default"] = None
            out[path] = facts

    walk(Config, "")

    # A container whose RECORDS carry credentials is itself a credential
    # container, empty or not. Deciding this from the current value would make
    # an empty api_tokens list a public raw-JSON control — a place to type a
    # token into the generic editor.
    for path, facts in out.items():
        if facts.get("type") not in ("array", "object"):
            continue
        prefix = f"{path}."
        facts["secret_container"] = any(
            key.startswith(prefix)
            and any(is_sensitive_key(segment) for segment in key[len(prefix) :].split("."))
            for key in out
        )
    return out


def _is_structured_container_child(path: str) -> bool:
    """Whether ``path`` is a concrete descendant of a schema container.

    ``flatten`` expands populated maps and record collections into paths such
    as ``tools.hosts.prod.address``. The leaf itself is a string, but editing it
    as an independent scalar would patch the whole container through a fake
    affordance. Container ancestry comes from the Pydantic schema — never a
    duplicated list of paths in the UI.
    """
    facts = schema_facts()
    segments = path.split(".")
    return any(
        facts.get(".".join(segments[:end]), {}).get("structured_container")
        for end in range(1, len(segments))
    )


def _facts_for(path: str) -> dict[str, Any]:
    """Schema facts for a path, with container entry keys normalised away.

    An entry key is arbitrary — ``tools.hosts.prod.ssh_user``,
    ``mcp.servers.foo.transport``, ``web.api_tokens.0.tier``. Dropping only
    digits and ``*`` handled the list case and silently missed every
    dict-keyed one, so those fields fell back to guessing their type and
    default from whatever value happened to be there.
    """
    facts = schema_facts()
    if path in facts:
        return facts[path]

    kept: list[str] = []
    drop_entry_key = False
    for segment in path.split("."):
        # Exactly one segment after a container is that entry's key, and only
        # one: everything below it is schema again.
        if drop_entry_key:
            drop_entry_key = False
            continue
        kept.append(segment)
        drop_entry_key = bool(facts.get(".".join(kept), {}).get("is_container"))
    return facts.get(".".join(kept), {})


def _value_type(value: Any) -> str:
    if isinstance(value, list):
        return "array"
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, int):
        return "integer"
    if isinstance(value, float):
        return "number"
    if isinstance(value, dict):
        return "object"
    return "string"


def _configured(value: Any) -> bool:
    if value is None or value == "":
        return False
    if isinstance(value, (list, dict)):
        return len(value) > 0
    return True


def _public_value(value: Any, sensitivity: Sensitivity) -> Any:
    """A secret's value never leaves; only whether one is set."""
    if sensitivity == "public":
        return value
    if isinstance(value, dict):
        return {}
    if isinstance(value, list):
        return []
    return REDACTED if _configured(value) else ""


#: Modes whose effective value follows from configuration alone.
#:
#: ``live_read`` consumers re-read config, so the next read is the desired
#: value. ``live_for_new_work`` is the same statement scoped to the next spawn
#: or turn; the per-consumer records say what already-running work keeps.
#:
#: Every other mode needs something this module cannot see — whether a named
#: apply handler has run, whether a feature was activated, what a hardcoded
#: constant is. For those, effective is UNKNOWN and says so. Echoing desired
#: back would be the original lie in a more authoritative shape.
_SELF_EVIDENT_MODES: frozenset[str] = frozenset({"live_read", "live_for_new_work"})


def _effective_is_self_evident(spec: FieldSpec, apply_mode: ApplyMode) -> bool:
    """Whether config alone proves what every consumer will use next.

    A broad ``live_for_new_work`` badge is not evidence when even one named
    consumer never adopts the field. Consumer records are therefore part of
    the proof, not merely explanatory text.
    """
    return apply_mode in _SELF_EVIDENT_MODES and all(
        consumer.apply_mode in _SELF_EVIDENT_MODES for consumer in spec.consumers
    )


def _apply_state(
    *,
    apply_mode: ApplyMode,
    pending_restart: bool,
    drift: bool,
    valid: bool,
    effective_known: bool,
) -> str:
    if not valid:
        return "invalid"
    if pending_restart:
        return "pending_restart"
    if drift:
        return "drift"
    if apply_mode in ("activation_required", "dormant"):
        return "dormant"
    if not effective_known:
        # The page exposes Unknown as a first-class filter; uncertainty is
        # visible rather than disappearing from the health total.
        return "unknown"
    return "applied"


def _plain_effects(apply_mode: ApplyMode, spec: FieldSpec) -> tuple[str, str | None]:
    """The two sentences an operator actually needs: what saving does, and
    what the running bot does now.

    The settled copy for the two gated states is exact — implementer-speak
    like "activation required" is what this replaces. Field-specific detail
    (restart reasons, activation policies) rides in runtime_effect so the
    save_effect sentence stays uniform and scannable.
    """
    if apply_mode == "live_read":
        return (
            "Saving updates config.yml and takes effect immediately.",
            "Odin reads this value on its next use.",
        )
    if apply_mode == "live_apply":
        handler = spec.apply_handler or "its dedicated endpoint"
        if handler.startswith("PUT /api/config"):
            return (
                "Saving updates config.yml and reconfigures the running process.",
                f"Applied live through {handler}.",
            )
        return (
            "Saving through Config updates config.yml but does not reload the running provider.",
            f"Apply the saved value through {handler}; the running provider is "
            "unchanged until that endpoint succeeds.",
        )
    if apply_mode == "live_for_new_work":
        return (
            "Saving updates config.yml and applies to the next spawn or turn.",
            "Work already running keeps the values it started with.",
        )
    if apply_mode == "restart":
        return (
            "Saving updates config.yml. Odin keeps its startup value until restarted.",
            spec.restart_reason,
        )
    if apply_mode == "activation_required":
        return (
            "Saving records your choice, but Odin continues using current "
            "behavior until you apply it explicitly.",
            spec.activation_policy,
        )
    # dormant
    return (
        "Saving updates config.yml. This version of Odin does not use this "
        "setting. Restarting will not activate it.",
        spec.activation_policy,
    )


def build_field_record(
    path: str,
    desired_value: Any,
    *,
    boot_value: Any = None,
    has_boot: bool = False,
) -> dict[str, Any]:
    """One field record, in the shape the config page consumes.

    ``effective`` is what the running bot uses: for a restart-mode field that is
    the boot snapshot, which is the only way ``pending_restart`` can be a fact
    rather than a hopeful constant.
    """
    spec = spec_for(path)
    leaf = path.split(".")[-1]
    section = path.split(".", 1)[0]
    sensitivity: Sensitivity = spec.sensitivity or "public"
    apply_mode: ApplyMode = spec.apply_mode or "restart"

    desired = _public_value(desired_value, sensitivity)
    pending_restart = False
    effective_known = True
    has_restart_consumer = any(consumer.apply_mode == "restart" for consumer in spec.consumers)
    if apply_mode == "restart" or has_restart_consumer:
        # A boot snapshot is evidence only when wiring actually passed that
        # schema value to the running component. For consumer-split fields it
        # is the restart-bound consumer's effective value; consumer records
        # state that scope. Per-target webhook safety values are currently
        # dropped, so echoing their boot value would lie.
        if has_boot and spec.boot_snapshot_is_effective:
            effective = _public_value(boot_value, sensitivity)
            pending_restart = boot_value != desired_value
        else:
            effective, effective_known = None, False
    elif _effective_is_self_evident(spec, apply_mode):
        effective = desired
    else:
        effective, effective_known = None, False

    configured = _configured(desired_value)
    save_effect, runtime_effect = _plain_effects(apply_mode, spec)
    facts = _facts_for(path)
    # The schema is the authority on shape; the registry only overrides when it
    # knows something Pydantic cannot express.
    resolved_enum = list(spec.enum) if spec.enum else facts.get("enum")
    if resolved_enum:
        resolved_type = "string"
    else:
        resolved_type = facts.get("type") or _value_type(desired_value)
    resolved_constraints = dict(spec.constraints) or dict(facts.get("constraints") or {})
    record: dict[str, Any] = {
        "path": path,
        "owner": spec.owner,
        "label": spec.label or _title_case(leaf),
        "description": spec.description
        or f"{_title_case(leaf)} setting for {_title_case(section)}.",
        "aliases": list(facts.get("aliases") or []),
        "unit": spec.unit,
        "examples": [],
        "type": resolved_type,
        "structured_container": bool(facts.get("structured_container")),
        "structured_container_child": _is_structured_container_child(path),
        "enum": resolved_enum,
        "constraints": resolved_constraints,
        "default": facts.get("default"),
        "sensitivity": sensitivity,
        # Null until the dedicated set/clear route exists. §4 defines this as
        # THE endpoint for the secret, not a URL it will have one day, and a
        # link that 404s is worse than no link.
        "secret_route": None,
        "apply_mode": apply_mode,
        "apply_handler": spec.apply_handler,
        "consumers": [
            {"name": c.name, "apply_mode": c.apply_mode, "detail": c.detail} for c in spec.consumers
        ],
        "restart_reason": spec.restart_reason,
        "activation_policy": spec.activation_policy,
        "group_description": GROUP_DESCRIPTIONS.get(".".join(path.split(".")[:2])),
        "save_effect": save_effect,
        "runtime_effect": runtime_effect,
        # Honest-buttons-only: a button renders ONLY when a real action
        # exists. None do yet — the F-lanes add them — so the page must show
        # plain words, never a disabled ritual switch.
        "action_available": False,
        "action_label": None,
        "action_endpoint": None,
        "action_method": "POST",
        "action_body": None,
        "desired": desired,
        "effective": effective,
        "configured": configured,
        "provenance": "config_file" if configured else "unset",
        "valid": True,
        "validation_errors": [],
        "pending_restart": pending_restart,
        # Always False, and deliberately so: detecting drift means comparing
        # against live component state (the Codex client's own model, say),
        # which this module cannot reach. A guess here would be the exact
        # failure the page exists to remove, so it reports the state it can
        # prove and leaves this to whoever wires the comparison.
        "drift": False,
        "last_apply": None,
    }
    record["apply_state"] = _apply_state(
        apply_mode=apply_mode,
        pending_restart=pending_restart,
        drift=False,
        valid=True,
        effective_known=effective_known,
    )
    return record


#: Per-process key, so a published revision cannot be recomputed off-box.
#:
#: An unkeyed digest over the resolved configuration is an offline verification
#: oracle for the secrets inside it: with the rest of the config known, a
#: low-entropy secret falls to a few guesses compared against the published
#: value. Odin demonstrated exactly that against the first version of this
#: function. A random per-process key makes the revision opaque while keeping
#: it a faithful change detector, which is all a revision is for.
_REVISION_KEY = secrets_module.token_bytes(32)


def config_revision(config_dump: dict[str, Any]) -> str:
    """Opaque identity for a configuration state.

    Changes whenever any value changes — including a secret, so a
    revision-bound write cannot miss a credential rotation — while revealing
    nothing about the values themselves. Not stable across restarts, which is
    correct: it identifies a state within the life of a process.
    """
    canonical = json.dumps(config_dump, sort_keys=True, default=str)
    return hmac.new(_REVISION_KEY, canonical.encode("utf-8"), hashlib.sha256).hexdigest()[:16]


def build_meta_payload(
    config_dump: dict[str, Any],
    *,
    boot_dump: dict[str, Any] | None = None,
    generated_at: str | None = None,
    persistence_error: str | None = None,
) -> dict[str, Any]:
    """The full ``/api/config/meta`` document."""
    boot_flat = dict(flatten(boot_dump)) if boot_dump is not None else {}
    has_boot = boot_dump is not None

    fields = [
        build_field_record(
            path,
            value,
            boot_value=boot_flat.get(path),
            has_boot=has_boot and path in boot_flat,
        )
        for path, value in flatten(config_dump)
    ]

    counts = dict.fromkeys(HEALTH_STATES, 0)
    for record in fields:
        state = record["apply_state"]
        if state not in counts:
            raise ValueError(f"unsupported config health state: {state!r}")
        counts[state] += 1

    desired_revision = config_revision(config_dump)
    # Deliberately null. A hash of the raw boot dump would disagree with the
    # desired revision after any live change, while every field correctly
    # reported itself applied — a whole-document diff contradicting the
    # per-field truth. A real effective revision needs real effective state
    # for every field, which this module cannot see; per-field
    # `pending_restart` carries what IS known today.
    effective_revision = None

    return {
        "schema_version": SCHEMA_VERSION,
        "revision": desired_revision,
        "generated_at": generated_at,
        "fields": fields,
        "status": {
            "counts": counts,
            "persistence_error": persistence_error,
            "unsafe_overrides": [],
            "desired_revision": desired_revision,
            "effective_revision": effective_revision,
        },
    }
