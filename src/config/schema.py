from __future__ import annotations

import os
import re
import uuid
from pathlib import Path
from typing import Literal, get_args

import yaml
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

_VALID_LOG_LEVELS = frozenset({"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"})


class DiscordConfig(BaseModel):
    token: str
    allowed_users: list[str] = Field(default_factory=list)
    channels: list[str] = Field(default_factory=list)
    respond_to_bots: bool = False
    require_mention: bool = False
    ignore_bot_ids: list[str] = Field(default_factory=list)  # Bot user IDs to never auto-respond to


class ContextConfig(BaseModel):
    directory: str = "./data/context"


class SessionsConfig(BaseModel):
    max_history: int = 50
    max_age_hours: int = 24
    persist_directory: str = "./data/sessions"
    token_budget: int = 256_000
    adaptive_compaction: bool = True
    # Session archives are retained indefinitely by default; pruned oldest-first
    # only past these caps (restore-on-demand depends on archives surviving).
    archive_max_bytes: int = 2 * 1024**3
    archive_max_files: int = 10_000
    # Max estimated tokens of session history sent per LLM request; hot
    # channels can run larger windows via per-channel overrides.
    context_token_budget: int = 64_000
    context_budget_overrides: dict[str, int] = {}


class ToolHost(BaseModel):
    """One managed execution target.

    The first three fields are the complete legacy shape. Every control-plane
    field therefore has a default: loading an existing config is read-only and
    preserves its pre-control-plane behaviour until an operator deliberately
    edits or enrolls the host.
    """

    address: str
    ssh_user: str = "root"
    os: Literal["linux", "macos"] = "linux"
    port: int = Field(default=22, ge=1, le=65535)
    description: str = ""
    enabled: bool = True
    # Empty on legacy records. HostRegistry derives a deterministic in-memory
    # identity and the dedicated control plane persists it on first mutation;
    # boot never rewrites config.yml.
    host_id: str = ""
    trust_mode: Literal["legacy", "pinned", "ca", "tofu"] = "legacy"
    # Public OpenSSH key material only. Private keys never belong here.
    host_keys: list[str] = Field(default_factory=list)

    @field_validator("address", "ssh_user", "description", "host_id")
    @classmethod
    def _host_text(cls, value: str, info):
        limits = {"address": 253, "ssh_user": 64, "description": 200, "host_id": 64}
        if len(value) > limits[info.field_name]:
            raise ValueError(f"{info.field_name} is too long")
        if any(ord(char) < 32 or ord(char) == 127 for char in value):
            raise ValueError(f"{info.field_name} contains control characters")
        if info.field_name in {"address", "ssh_user"} and (
            not value or value.startswith("-")
        ):
            raise ValueError(f"{info.field_name} is invalid")
        return value

    @field_validator("host_keys")
    @classmethod
    def _public_host_keys_only(cls, values: list[str]) -> list[str]:
        for value in values:
            if len(value) > 24_000 or any(
                ord(char) < 32 or ord(char) == 127 for char in value
            ):
                raise ValueError("host_keys contains malformed key material")
        return values

    @field_validator("host_id")
    @classmethod
    def _valid_host_id(cls, value: str) -> str:
        if value:
            try:
                parsed = uuid.UUID(value)
            except ValueError:
                raise ValueError("host_id must be a UUID") from None
            if str(parsed) != value.lower():
                raise ValueError("host_id must use canonical UUID form")
        return value


class RetryConfig(BaseModel):
    max_retries: int = 3
    base_delay: float = 1.0
    max_delay: float = 30.0

    @field_validator("max_retries")
    @classmethod
    def _retries_positive(cls, v):
        if v < 0:
            raise ValueError("max_retries must be >= 0")
        return v

    @field_validator("base_delay", "max_delay")
    @classmethod
    def _delay_positive(cls, v):
        if v < 0:
            raise ValueError("delay must be >= 0")
        return v


class BulkheadConfig(BaseModel):
    ssh_max_concurrent: int = 10
    subprocess_max_concurrent: int = 20
    browser_max_concurrent: int = 3
    ssh_max_queued: int = 20
    subprocess_max_queued: int = 40
    browser_max_queued: int = 6

    @field_validator("ssh_max_concurrent", "subprocess_max_concurrent", "browser_max_concurrent")
    @classmethod
    def _concurrent_positive(cls, v):
        if v < 1:
            raise ValueError("max_concurrent must be >= 1")
        return v

    @field_validator("ssh_max_queued", "subprocess_max_queued", "browser_max_queued")
    @classmethod
    def _queued_positive(cls, v):
        if v < 0:
            raise ValueError("max_queued must be >= 0")
        return v


class RecoveryConfig(BaseModel):
    enabled: bool = True


class BranchFreshnessConfig(BaseModel):
    enabled: bool = True


class StreamingConfig(BaseModel):
    enabled: bool = False
    tools: list[str] = Field(default_factory=list)
    chunk_interval_seconds: float = 1.0
    max_chunk_chars: int = 2000


class AgentsConfig(BaseModel):
    max_nesting_depth: int = 2
    max_children_per_agent: int = 3
    # Per-channel admission cap for concurrently running agents. Twenty-five
    # matches the immutable lifetime ceiling for one tree, so operators can
    # raise useful parallelism without configuring beyond the runaway backstop.
    max_concurrent_agents: int = Field(default=5, ge=1, le=25)
    max_iterations: int = 120
    scheduled_max_iterations: int = 180
    hard_max_iterations: int = 300
    final_warning_iterations: list[int] = Field(default_factory=lambda: [20, 10, 5, 1])
    # Per-LLM-call backstop. The transport already fails dead streams fast
    # (stream_stall_timeout_seconds); this only bounds a genuinely hung call,
    # so it must exceed a legitimate high-effort generation (5-10+ min).
    iteration_timeout_seconds: int = 900
    # Hard per-agent deadline, snapshotted at spawn (a live config change
    # never shortens an already-running agent's deadline).
    max_lifetime_seconds: int = 14400

    @field_validator(
        "max_nesting_depth",
        "max_children_per_agent",
        "max_iterations",
        "scheduled_max_iterations",
        "hard_max_iterations",
    )
    @classmethod
    def _agents_non_negative(cls, v):
        if v < 1:
            raise ValueError("agent limits must be >= 1")
        return v

    @field_validator("max_children_per_agent")
    @classmethod
    def _children_bounded(cls, v):
        # Direct-child breadth compounds with nesting depth; the tree-lifetime
        # cap in the agent manager is the hard backstop, this keeps a single
        # config value from asking for absurd fan-out in the first place.
        if v > 10:
            raise ValueError("max_children_per_agent must be between 1 and 10")
        return v

    @field_validator("iteration_timeout_seconds", "max_lifetime_seconds")
    @classmethod
    def _agents_timeout_bounds(cls, v, info):
        if not 60 <= v <= 86400:
            raise ValueError(f"{info.field_name} must be between 60 and 86400")
        return v

    @field_validator("final_warning_iterations")
    @classmethod
    def _validate_warnings(cls, v):
        for item in v:
            if item < 1:
                raise ValueError(f"warning threshold must be >= 1, got {item}")
        return v


class SSHPoolConfig(BaseModel):
    enabled: bool = True
    control_persist: int = 60
    socket_dir: str = "/tmp/odin_ssh_sockets"


class ConnectionPoolConfig(BaseModel):
    max_connections: int = 10
    keepalive_timeout: int = 30

    @field_validator("max_connections")
    @classmethod
    def _connections_positive(cls, v):
        if v < 1:
            raise ValueError("max_connections must be >= 1")
        return v

    @field_validator("keepalive_timeout")
    @classmethod
    def _keepalive_positive(cls, v):
        if v < 0:
            raise ValueError("keepalive_timeout must be >= 0")
        return v


# The pre-campaign soft-compaction ceiling. For years this was the shipped
# default of ``max_context_chars`` and is materialized verbatim in most
# persisted configs — the legacy-ceiling migration (src/config/migrations.py)
# keys off this exact value.
LEGACY_MAX_CONTEXT_CHARS = 750_000


class ContextCompressionConfig(BaseModel):
    enabled: bool = True
    # None = "auto": the ceiling derives from the active model's input budget.
    # Until the per-model resolver is wired to the runtime surfaces (context-
    # budget campaign phase 3), auto resolves to the legacy constant so
    # behavior is bit-identical to pre-campaign installs. An explicit value
    # can only LOWER the derived target, never raise it (the resolver takes
    # min(explicit, derived)).
    max_context_chars: int | None = None
    keep_recent_iterations: int = 30

    @field_validator("max_context_chars")
    @classmethod
    def _validate_max_context_chars(cls, v: int | None) -> int | None:
        if v is not None and v < 1:
            raise ValueError("max_context_chars must be positive, or null for auto")
        return v

    @property
    def resolved_max_context_chars(self) -> int:
        """The ceiling consumers compare against — legacy value when auto.

        Campaign phase 3 replaces consumer reads with the per-model budget
        resolver; until then this property keeps every consumer total (no
        None comparisons) and byte-identical to pre-campaign behavior.
        """
        if self.max_context_chars is not None:
            return self.max_context_chars
        return LEGACY_MAX_CONTEXT_CHARS


class GovernorConfig(BaseModel):
    block_critical: bool = True
    block_exfil: bool = True
    admin_can_override: bool = True
    host_overrides: dict[str, str] = Field(default_factory=dict)

    @field_validator("host_overrides")
    @classmethod
    def _host_override_aliases(cls, values: dict[str, str]) -> dict[str, str]:
        alias_pattern = re.compile(r"^[A-Za-z][A-Za-z0-9_.-]{0,63}$")
        if any(not alias_pattern.fullmatch(alias) for alias in values):
            raise ValueError("governor.host_overrides contains an invalid host alias")
        return values


# The default local command workspace, spelled ONCE: the field default, the
# blank-value normalizer, the tracked config.yml template and the packaging
# scripts must never drift apart.
DEFAULT_LOCAL_WORKING_DIR = "/var/lib/odin-workspace"


class ToolsConfig(BaseModel):
    enabled: bool = True
    governor: GovernorConfig = GovernorConfig()
    ssh_key_path: str = "/app/.ssh/id_ed25519"
    ssh_known_hosts_path: str = "/app/.ssh/known_hosts"
    hosts: dict[str, ToolHost] = Field(default_factory=dict)
    # Omitted-host execution is never selected by YAML mapping order. Empty
    # means callers must choose a host unless requester policy supplies one.
    default_host: str = ""
    # Break-glass first-use trust must be explicitly enabled by an operator.
    allow_host_tofu: bool = False
    command_timeout_seconds: int = 300
    tool_timeouts: dict[str, int] = Field(default_factory=dict)
    skill_allowed_urls: list[str] = Field(default_factory=list)
    # Operator-disabled built-in tools (config-gated visibility): a disabled
    # tool is absent from the model catalog on every surface and rejected at
    # dispatch. Case-sensitive built-in names; unknown entries are preserved
    # and ignored (never a startup failure) so lists survive catalog drift.
    disabled_tools: list[str] = Field(default_factory=list)

    @field_validator("disabled_tools")
    @classmethod
    def _normalize_disabled_tools(cls, value: list[str]) -> list[str]:
        seen: set[str] = set()
        result: list[str] = []
        for item in value:
            name = item.strip()
            if not name or name in seen:
                continue
            seen.add(name)
            result.append(name)
        return result
    # Odin's PR #18 self-audit caught that these were read via
    # getattr(..., None) with hardcoded defaults in the handlers —
    # Pydantic silently dropped the values when operators set them,
    # so the fields looked configurable but weren't. Declaring them
    # here fixes the silent-drop bug and makes defaults discoverable.
    audit_log_path: str = "./data/audit.jsonl"
    trajectory_path: str = "./data/trajectories"
    ssh_retry: RetryConfig = RetryConfig(max_retries=2, base_delay=0.5, max_delay=10.0)
    bulkhead: BulkheadConfig = BulkheadConfig()
    ssh_pool: SSHPoolConfig = SSHPoolConfig()
    recovery: RecoveryConfig = RecoveryConfig()
    branch_freshness: BranchFreshnessConfig = BranchFreshnessConfig()
    streaming: StreamingConfig = StreamingConfig()
    # Tool-iteration caps per request before the loop force-exits.
    # Chat: normal Discord messages. Loop: autonomous loop iterations.
    # Loops typically need more budget for exploration + execution + verify + commit.
    max_tool_iterations_chat: int = 500
    max_tool_iterations_loop: int = 500
    # Working directory for USER-COMMAND local execution (run_command,
    # run_script, manage_process). Before this existed, those subprocesses
    # inherited systemd's WorkingDirectory=/opt/odin, so a bare relative path
    # in a command resolved against the live install — on 2026-07-27 an AE2 jar
    # whose internal layout is `data/` was extracted and cleaned up with
    # `rm -rf data`, which deleted /opt/odin/data.
    #
    # Deliberately a SIBLING of /var/lib/odin, not a child: packaged installs
    # use /var/lib/odin as the live data directory behind /opt/odin/data.
    # Not /tmp or /var/tmp (tmpfiles policy can age those out) and not $HOME
    # (packaged Odin declares /opt/odin as the service account's home).
    #
    # Stable and persistent BY DESIGN: a fresh directory per command would
    # break two-step workflows that write a relative file in one command and
    # read it in the next, which would cost capability. Restart-required, not
    # hot-reloadable — swapping workspaces at runtime would break exactly the
    # cross-command continuity this preserves.
    local_working_dir: str = DEFAULT_LOCAL_WORKING_DIR

    @field_validator("local_working_dir")
    @classmethod
    def _workspace_blank_means_default(cls, v):
        """Blank or whitespace-only normalizes to the default, here at the
        boundary, so every consumer sees the same value.

        The field accepts free strings and can be blanked through
        PUT /api/config. Left un-normalized, the self-update preflight
        substituted the default and approved, while the restarted process
        loaded the blank value and failed closed on every local command —
        preflight and runtime disagreeing about the very path being validated
        (PR #239 round-7 review, reproduced).

        Normalizing rather than rejecting keeps the update seamless: a blanked
        value costs no capability and cannot brick startup, which a hard
        validation error on a persisted config would.
        """
        if not isinstance(v, str) or not v.strip():
            return DEFAULT_LOCAL_WORKING_DIR
        return v.strip()

    @field_validator("command_timeout_seconds")
    @classmethod
    def _timeout_positive(cls, v):
        if v < 1:
            raise ValueError("command_timeout_seconds must be >= 1")
        return v

    @field_validator("max_tool_iterations_chat", "max_tool_iterations_loop")
    @classmethod
    def _iterations_positive(cls, v):
        if v < 1:
            raise ValueError("tool iteration cap must be >= 1")
        return v

    _BUILTIN_TOOL_TIMEOUTS: dict[str, int] = {
        "run_command": 900,
        "run_script": 900,
    }

    def get_tool_timeout(self, tool_name: str) -> int:
        if tool_name in self.tool_timeouts:
            return self.tool_timeouts[tool_name]
        if tool_name in self._BUILTIN_TOOL_TIMEOUTS:
            return self._BUILTIN_TOOL_TIMEOUTS[tool_name]
        return self.command_timeout_seconds

    @property
    def tool_timeout_seconds(self) -> int:
        """Alias for command_timeout_seconds (Heimdall-compat field name)."""
        return self.command_timeout_seconds


class LoggingConfig(BaseModel):
    level: str = "INFO"
    directory: str = "./data/logs"

    @field_validator("level")
    @classmethod
    def _validate_level(cls, v: str) -> str:
        upper = v.upper()
        if upper not in _VALID_LOG_LEVELS:
            raise ValueError(
                f"Invalid log level '{v}'. Must be one of: {', '.join(sorted(_VALID_LOG_LEVELS))}"
            )
        return upper


class UsageConfig(BaseModel):
    directory: str = "./data/usage"


class AuxiliaryLLMConfig(BaseModel):
    """A cheaper Codex model for fixed background jobs (compaction, reflection,
    consolidation, background follow-up), with transparent fallback to the
    primary model. It shares the main Codex OAuth credentials; only the MODEL
    differs. When ``enabled`` and a Codex provider is active, those four
    jobs route here; otherwise they use the primary model.

    Default Terra, enabled: the out-of-the-box configuration mirrors the
    reference deployment — background jobs on the mid-tier model while the
    primary handles conversation.
    """

    enabled: bool = True
    model: str = "gpt-5.6-terra"


# "minimal" is deliberately absent: it sits in the Codex API's generic
# parameter enum but every model on the ChatGPT-auth path rejects it at the
# per-model capability layer, which turns a saved value into a deterministic
# per-request 400. "ultra" (catalog-listed on some 5.6 models) is likewise
# absent: it is a Codex-app client feature, not a legal request value — the
# server rejects it outright. "max" is real but per-model (see below).
ReasoningEffort = Literal["none", "low", "medium", "high", "xhigh", "max"]
# Single source of truth for runtime validation (Literal does not validate
# direct attribute assignment — the web admin layer checks against this set).
CODEX_REASONING_EFFORTS: frozenset[str] = frozenset(get_args(ReasoningEffort))

# Per-model capability exceptions at the effort layer. "max" is served only by
# the gpt-5.6 family: the older models accept the value in the generic
# parameter enum but reject it per-model ("Unsupported value: 'max' is not
# supported with the 'gpt-5.5' model"), so a persisted combination would 400
# on every request (the 'minimal' incident class). Known model names only —
# unknown free-string models pass through and the server stays the authority.
# Live-verified 2026-08-01: max serves on sol/terra/luna, 400s on gpt-5.5.
CODEX_MODEL_UNSUPPORTED_EFFORTS: dict[str, frozenset[str]] = {
    "gpt-5.5": frozenset({"max"}),
    "gpt-5.4": frozenset({"max"}),
    "gpt-5.4-mini": frozenset({"max"}),
    # gpt-6-astra (served-but-unlisted; Personal/Pro rollout observed 2026-09-04)
    # accepts low..max but rejects "none" per-request: 400 "Unsupported value:
    # 'none' is not supported with the 'gpt-6-astra' model. Supported values
    # are: 'low', 'medium', 'high', 'xhigh', 'max'".
    "gpt-6-astra": frozenset({"none"}),
}


def allowed_efforts_for_model(model: str | None) -> frozenset[str]:
    """The effort values ``model`` is known to accept (all, for unknown models)."""
    unsupported = CODEX_MODEL_UNSUPPORTED_EFFORTS.get(str(model or "").strip(), frozenset())
    return CODEX_REASONING_EFFORTS - unsupported


def model_rejects_effort(model: str | None, effort: str | None) -> bool:
    """True when ``model`` is KNOWN to reject ``effort`` per-request.

    The shared validator behind every enforcement boundary (config load, admin
    PUT, per-spawn overrides, final request construction) — never scatter
    per-model comparisons. Unknown models and absent values return False.
    """
    if not model or not effort:
        return False
    unsupported = CODEX_MODEL_UNSUPPORTED_EFFORTS.get(str(model).strip(), frozenset())
    return str(effort) in unsupported


def effort_incompatibility_error(model: str | None, effort: str | None) -> str | None:
    """Canonical human-readable rejection for an incompatible model/effort pair.

    Every boundary emits THIS text (naming the pair and the efforts the model
    does accept) so the failure reads identically in config validation, the
    admin API, spawn errors, and request-construction errors. None when the
    pair is fine.
    """
    if not model_rejects_effort(model, effort):
        return None
    allowed = ", ".join(sorted(allowed_efforts_for_model(model)))
    return (
        f"reasoning effort {str(effort)!r} is not supported by model "
        f"{str(model).strip()!r} (allowed for this model: {allowed})"
    )

# --- Per-model usable input budgets (context-budget campaign, 2026-08-17) ---
# Values are KNOWN-SAFE USABLE INPUT BUDGETS (floors): each model's own
# highest server-accepted input observation (usage-echo bracketing, Pro and
# Team accounts served identically) — NOT vendor context-window claims. They
# already sit below the server's output reservation; never subtract another
# output reserve from them. A floor never exceeds its evidence: only sol
# received the fine-refinement acceptances, which is why sol reads 921_601
# while its window-mates read 917_506. The served models catalog reports
# 272000 for every slug (stale through three regime changes) — never consume
# it. Serving moves silently in both directions; these floors are refreshed
# by manual probes, bounded downward at runtime only by observed clamps.
CODEX_MODEL_INPUT_BUDGETS: dict[str, int] = {
    # gpt-6-astra: probed 2026-09-04 on the Personal/Pro account (descending
    # free-reject ladder, usage-echo bracketing): accepted 917,534 / rejected
    # at the 922,000 rung — the 922K class, lockstep with sol/terra/luna.
    "gpt-6-astra": 917_534,
    "gpt-5.6-sol": 921_601,
    "gpt-5.6-terra": 917_506,
    "gpt-5.6-luna": 917_506,
    "gpt-5.4": 917_506,
    "gpt-5.5": 270_001,
    "gpt-5.4-mini": 262_146,
    "gpt-5.3-codex-spark": 124_001,
}

# Unknown exact slugs assume the pre-campaign uniform window, so a new or
# renamed model degrades to the long-proven conservative math — not a guess.
CODEX_UNKNOWN_MODEL_INPUT_BUDGET = 272_000

# Slugs the backend serves under another model's identity (probed via the
# served_model echo). Canonicalization maps them BEFORE any registry,
# override, or observer lookup — they are never registry rows themselves.
_CODEX_MODEL_ALIASES: dict[str, str] = {
    "codex-auto-review": "gpt-5.6-luna",
}


def canonical_codex_model(model: str | None) -> str:
    """THE Codex model canonicalizer: trim, map aliases, preserve spelling.

    Single authority for budget-registry lookups, override keys, observer
    keys, and UI capability data — the UI consumes canonical keys served by
    the backend and never reimplements this. Unknown models pass through
    with their spelling preserved (no case folding: the server is the
    authority on model names).
    """
    trimmed = str(model or "").strip()
    return _CODEX_MODEL_ALIASES.get(trimmed, trimmed)


def input_budget_floor_for_model(model: str | None) -> int:
    """Known-safe usable input budget for ``model``.

    Callers pass RAW model names; canonicalization happens here so no lookup
    site can forget it. Unknown slugs get the conservative default.
    """
    return CODEX_MODEL_INPUT_BUDGETS.get(
        canonical_codex_model(model), CODEX_UNKNOWN_MODEL_INPUT_BUDGET
    )


# Operator override bounds for per-model input budgets. The floor guarantees
# a positive compactable allowance above the fixed 42K-token request envelope
# (50_192 = 42_000 + 8_192); the ceiling bounds serialization/memory cost of
# derived character targets. Observed clamps (runtime evidence) deliberately
# BYPASS these bounds — evidence stays exact and the budget resolver is a
# total function under any clamp value.
CONTEXT_BUDGET_OVERRIDE_MIN = 50_192
CONTEXT_BUDGET_OVERRIDE_MAX = 2_000_000


# Sentinel for the agent model/effort config axes meaning "let the spawner pick
# per-spawn from the exposed catalogue". Deliberately NOT a member of
# CODEX_REASONING_EFFORTS — that set is the values legal to SEND to Codex; "auto"
# is configuration policy and is never sent to a provider. One constant, one
# classifier — never scatter `== "auto"` comparisons.
AGENT_SETTING_AUTO = "auto"


def agent_axis_mode(value: str | None) -> str:
    """Classify an agent model/effort config value into its policy mode:

    * ``"inherit"`` — ``None``: use the main Codex setting, no per-spawn override.
    * ``"auto"`` — the ``AGENT_SETTING_AUTO`` sentinel: expose the per-spawn
      catalogue so the spawner selects per task.
    * ``"fixed"`` — any other value: a hard-set agent setting, no per-spawn
      override offered.
    """
    if value is None:
        return "inherit"
    if value == AGENT_SETTING_AUTO:
        return "auto"
    return "fixed"


class OpenAICodexConfig(BaseModel):
    # ``model`` and ``model_routing`` collide with pydantic v2's protected
    # ``model_*`` namespace by default. Disable the guard.
    model_config = ConfigDict(protected_namespaces=())

    enabled: bool = False
    model: str = "gpt-5.6-sol"
    reasoning_effort: ReasoningEffort = "xhigh"
    # Effort for SPAWNED-AGENT iterations only. None = inherit
    # reasoning_effort (the string "none" is a real effort level, not
    # inherit); "auto" = expose per-spawn effort selection to the spawner
    # ("auto" is policy, never sent to a provider). Read at call time, so
    # live changes reach in-flight agents on their next iteration.
    agent_reasoning_effort: ReasoningEffort | Literal["auto"] | None = "auto"
    # Model for SPAWNED-AGENT iterations only. None = inherit ``model``;
    # "auto" = expose per-spawn model selection to the spawner. Free string
    # like ``model`` otherwise (the WebUI dropdown is the constraint; an
    # unsupported value fails per-request). Read at call time.
    agent_model: str | None = "auto"
    credentials_path: str = "./data/codex_auth.json"
    # Streaming transport timeouts: a generous whole-request backstop (long
    # high-effort reasoning turns stream well past 10 minutes) plus a stall
    # bound that fails a silent stream fast instead of waiting out the
    # backstop. Both are read per request, so live reload picks them up.
    request_timeout_seconds: int = 3600
    stream_stall_timeout_seconds: int = 180

    @field_validator("reasoning_effort", "agent_reasoning_effort", mode="before")
    @classmethod
    def _coerce_legacy_reasoning_effort(cls, v, info):
        # v3.58.0 briefly offered "minimal"; a config persisted with it must
        # not brick startup after upgrading — degrade to the nearest value.
        if v == "minimal":
            import logging

            logging.getLogger("odin.config").warning(
                "%s 'minimal' is not supported by any Codex "
                "model on this auth path; using 'low' instead",
                info.field_name,
            )
            return "low"
        return v

    @field_validator("agent_model", mode="before")
    @classmethod
    def _normalize_agent_model(cls, v):
        # ""/whitespace-only mean INHERIT (same contract as the admin API);
        # normalizing here keeps hand-edited configs from carrying a value
        # that is visually empty but truthy.
        if v is None:
            return None
        v = str(v).strip()
        return v or None

    @field_validator("request_timeout_seconds")
    @classmethod
    def _request_timeout_bounds(cls, v):
        if not 60 <= v <= 86400:
            raise ValueError("request_timeout_seconds must be between 60 and 86400")
        return v

    @field_validator("stream_stall_timeout_seconds")
    @classmethod
    def _stream_stall_timeout_bounds(cls, v):
        if not 10 <= v <= 3600:
            raise ValueError("stream_stall_timeout_seconds must be between 10 and 3600")
        return v

    retry: RetryConfig = RetryConfig()
    connection_pool: ConnectionPoolConfig = ConnectionPoolConfig()
    auxiliary: AuxiliaryLLMConfig = AuxiliaryLLMConfig()
    context_compression: ContextCompressionConfig = ContextCompressionConfig()
    # Per-model usable-input-budget overrides (tokens), keyed by canonical
    # model name. Empty = built-in floors (CODEX_MODEL_INPUT_BUDGETS). An
    # override may exceed the known-safe floor — overflow recovery is what
    # makes that experimentation tolerable — but stays inside process-safety
    # bounds. Consumed from campaign phase 3 (budget resolver).
    context_budget_overrides: dict[str, int] = Field(default_factory=dict)
    # Working-set policy: percent of the effective budget compaction actually
    # targets (quality/latency/cost posture — NOT a capability claim). The
    # resolver never lets utilization reduce budgets at or below 272K, so
    # changing this may have no effect on smaller models by design.
    context_utilization: int = 60

    @field_validator("context_utilization")
    @classmethod
    def _validate_context_utilization(cls, v: int) -> int:
        if isinstance(v, bool) or not 30 <= v <= 100:
            raise ValueError("context_utilization must be an integer percent between 30 and 100")
        return v

    @field_validator("context_budget_overrides")
    @classmethod
    def _validate_context_budget_overrides(cls, v: dict[str, int]) -> dict[str, int]:
        canonical: dict[str, int] = {}
        for raw_key, value in v.items():
            key = canonical_codex_model(raw_key)
            if not key:
                raise ValueError(
                    "context_budget_overrides keys must be non-empty model names"
                )
            if key in canonical:
                raise ValueError(
                    f"context_budget_overrides: {raw_key!r} duplicates "
                    f"{key!r} after canonicalization"
                )
            if isinstance(value, bool) or not (
                CONTEXT_BUDGET_OVERRIDE_MIN <= value <= CONTEXT_BUDGET_OVERRIDE_MAX
            ):
                raise ValueError(
                    f"context_budget_overrides[{key!r}] must be an integer between "
                    f"{CONTEXT_BUDGET_OVERRIDE_MIN} and {CONTEXT_BUDGET_OVERRIDE_MAX} tokens"
                )
            canonical[key] = value
        return canonical

    @model_validator(mode="after")
    def _validate_effort_model_pairs(self):
        # Load boundary (1 of 4): a persisted incompatible model/effort pair
        # fails loudly at startup, exactly like any other invalid config
        # value — never boot into deterministic per-request 400s. No clamp.
        err = effort_incompatibility_error(self.model, self.reasoning_effort)
        if err:
            raise ValueError(f"openai_codex: {err}")
        # The agent axes resolve to a concrete pair here only when neither
        # axis is "auto" (per-spawn selection defers to the spawn-time and
        # request-construction boundaries). None inherits the main setting.
        if AGENT_SETTING_AUTO not in (self.agent_model, self.agent_reasoning_effort):
            eff_model = self.agent_model if self.agent_model else self.model
            eff_effort = (
                self.agent_reasoning_effort
                if self.agent_reasoning_effort
                else self.reasoning_effort
            )
            err = effort_incompatibility_error(eff_model, eff_effort)
            if err:
                raise ValueError(f"openai_codex agent settings: {err}")
        return self


class OllamaConfig(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    enabled: bool = False
    base_url: str = "http://127.0.0.1:11434"
    model: str = "llama3.1:8b"
    max_tokens: int = 4096
    timeout: int = 300
    api_key: str = ""  # Optional bearer token for remote instances

    @field_validator("base_url")
    @classmethod
    def _validate_url(cls, v):
        if not v.startswith(("http://", "https://")):
            raise ValueError("base_url must start with http:// or https://")
        return v

    @field_validator("timeout")
    @classmethod
    def _timeout_positive(cls, v):
        if v < 10:
            raise ValueError("timeout must be >= 10")
        return v

    @field_validator("max_tokens")
    @classmethod
    def _max_tokens_range(cls, v):
        if v < 1 or v > 128000:
            raise ValueError("max_tokens must be between 1 and 128000")
        return v

    @field_validator("model")
    @classmethod
    def _model_nonempty(cls, v):
        if not v or not v.strip():
            raise ValueError("model must not be empty")
        return v


class KimiConfig(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    enabled: bool = False
    api_key: str = ""
    model: str = "kimi-k2.6"
    max_tokens: int = 4096
    timeout: int = 300

    @field_validator("max_tokens")
    @classmethod
    def _max_tokens_range(cls, v):
        if v < 1 or v > 262000:
            raise ValueError("max_tokens must be between 1 and 262000")
        return v

    @field_validator("model")
    @classmethod
    def _model_nonempty(cls, v):
        if not v or not v.strip():
            raise ValueError("model must not be empty")
        return v


class LLMProviderConfig(BaseModel):
    active_provider: Literal["codex", "ollama", "kimi"] = "codex"


class WebhookConfig(BaseModel):
    enabled: bool = False
    secret: str = ""
    channel_id: str = ""
    gitea_channel_id: str = ""
    grafana_channel_id: str = ""
    github_channel_id: str = ""
    gitlab_channel_id: str = ""


class LearningConfig(BaseModel):
    enabled: bool = True
    max_entries: int = 150
    consolidation_target: int = 120
    # Learned Context injection budget (tokens). When the scoped corpus fits,
    # ALL of it is injected; relevance gating engages only beyond this.
    injection_token_budget: int = 4000
    # Reflection on autonomous loop iterations — gated by signature dedup so
    # a loop failing identically all night produces ONE lesson, not sixty.
    loop_reflection_enabled: bool = True
    loop_reflection_cooldown_hours: float = 12.0
    loop_reflection_max_per_hour: int = 10


class SearchConfig(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    enabled: bool = True
    # Accepts "chromadb_path" from old configs for backward compat
    search_db_path: str = Field(default="./data/search", validation_alias="chromadb_path")


class BrowserConfig(BaseModel):
    enabled: bool = False
    cdp_url: str = ""  # Empty = native Playwright launch; set ws:// URL for remote CDP
    default_timeout_ms: int = 30000
    viewport_width: int = 1920
    viewport_height: int = 1080
    allow_private_targets: list[str] = Field(default_factory=list)

    @field_validator("default_timeout_ms")
    @classmethod
    def _timeout_positive(cls, v):
        if v < 1000:
            raise ValueError("default_timeout_ms must be >= 1000")
        return v


class PermissionsConfig(BaseModel):
    tiers: dict[str, str] = Field(default_factory=dict)
    default_tier: str = "user"
    overrides_path: str = "./data/permissions.json"


class OutboundWebhookTarget(BaseModel):
    name: str = ""
    url: str = ""
    secret: str = ""  # HMAC-SHA256 signing key; empty = unsigned
    events: list[str] = Field(default_factory=list)  # empty = all events
    enabled: bool = True
    scrub_secrets: bool = True
    verify_ssl: bool = True


class OutboundWebhooksConfig(BaseModel):
    enabled: bool = False
    scrub_secrets: bool = True
    rate_limit_seconds: float = 0.5
    targets: list[OutboundWebhookTarget] = Field(default_factory=list)


class GracefulDegradationConfig(BaseModel):
    degraded_threshold: int = 3  # consecutive failures before DEGRADED
    unavailable_threshold: int = 10  # consecutive failures before UNAVAILABLE


class LLMRecoveryConfig(BaseModel):
    """Deadline-based recovery for logical LLM generations (all three call
    paths: chat, agents, autonomous loops) plus the model-scoped capacity
    breaker. The deadline bounds WAITING between attempts, never the
    attempt itself; capacity never rotates accounts (429 rotation is the
    provider client's job and is untouched)."""

    generation_deadline_seconds: float = Field(default=300.0, ge=10.0, le=3600.0)
    backoff_cap_seconds: float = Field(default=45.0, ge=1.0, le=300.0)
    breaker_generation_threshold: int = Field(default=1, ge=1, le=10)
    breaker_cooldown_base_seconds: float = Field(default=30.0, ge=1.0, le=600.0)
    breaker_cooldown_cap_seconds: float = Field(default=300.0, ge=30.0, le=3600.0)


class TurnStateConfig(BaseModel):
    """Durable chat-turn checkpoints, side-effect ledger, and resume.

    Discord chat turns only (v1). Disabled => turns run exactly as before
    (capacity exhaustion discards work instead of suspending)."""

    enabled: bool = True
    db_path: str = "./data/turn_state/turns.sqlite3"
    auto_resume: bool = True
    resume_ttl_hours: float = Field(default=24.0, ge=1.0, le=24.0 * 14)
    payload_retention_days: float = Field(default=7.0, ge=1.0, le=90.0)
    ledger_retention_days: float = Field(default=90.0, ge=30.0, le=365.0)


class AuditConfig(BaseModel):
    hmac_key: str = ""  # Empty = signing disabled


class ApiTokenIdentity(BaseModel):
    token: str = ""
    user_id: str = "api-user"
    username: str = "API"
    tier: str = "admin"
    allowed_tools: list[str] = Field(default_factory=list)
    allowed_hosts: list[str] | None = None
    default_host: str = ""
    label: str = ""


class WebConfig(BaseModel):
    enabled: bool = True
    api_token: str = ""
    api_tokens: list[ApiTokenIdentity] = Field(default_factory=list)
    # Sessions expire after this many minutes of the token's lifetime. 0 meant
    # "never expire", so a leaked WebUI session id was valid forever; default to
    # a bounded lifetime (set to 0 explicitly to opt back into no-expiry).
    session_timeout_minutes: int = 720  # 12 hours
    port: int = 3000
    # Bind address. Historically hardcoded 0.0.0.0 (exposed on LAN/Tailscale);
    # now configurable so a deployment can bind localhost and front it with a
    # reverse proxy.
    host: str = "0.0.0.0"
    # Trusted reverse-proxy IPs. When the request's peer is one of these, the
    # left-most X-Forwarded-For entry is used as the client IP for rate-limiting
    # and audit — otherwise all clients behind the proxy collapse to one IP.
    trusted_proxies: list[str] = Field(default_factory=list)

    @field_validator("port")
    @classmethod
    def _port_range(cls, v):
        if v < 1 or v > 65535:
            raise ValueError("port must be between 1 and 65535")
        return v


    def resolve_api_identity(self, token: str) -> ApiTokenIdentity | None:
        """Look up identity for an API token. Falls back to default if single token configured."""
        import hmac
        for t in self.api_tokens:
            if t.token and hmac.compare_digest(t.token, token):
                return t
        if self.api_token and hmac.compare_digest(self.api_token, token):
            return ApiTokenIdentity(
                token=self.api_token, user_id="api-admin",
                username="Admin", tier="admin", label="default",
            )
        return None


class PersonalityPreset(BaseModel):
    name: str = ""
    identity: str = ""
    voice: str = ""


class PersonalityConfig(BaseModel):
    preset: str = "odin"
    custom_name: str = ""
    custom_identity: str = ""
    custom_voice: str = ""
    user_presets: dict[str, PersonalityPreset] = Field(default_factory=dict)


class AttachmentsConfig(BaseModel):
    temp_directory: str = "/tmp/odin-attachments"
    inline_text_max_bytes: int = 100_000
    preview_max_chars: int = 12_000
    large_preview_chars: int = 4_000
    archive_max_bytes: int = 50 * 1024 * 1024
    archive_max_files: int = 500
    archive_extract_max_bytes: int = 200 * 1024 * 1024
    archive_preview_total_chars: int = 20_000
    image_max_bytes: int = 5 * 1024 * 1024
    pdf_max_bytes: int = 25 * 1024 * 1024
    archive_preview_file_max_bytes: int = 64_000
    retention_hours: int = 24


class ComfyUIConfig(BaseModel):
    enabled: bool = False
    url: str = "http://localhost:8188"
    default_checkpoint: str = ""


class ImageOpenAIConfig(BaseModel):
    """Native OpenAI image generation over the Codex ChatGPT OAuth backend.

    Rides the SAME CodexAuthPool / current account Odin uses for chat — no
    separate auth, no per-token API billing (subscription-quota-backed). The
    outer model is pinned here rather than inherited from the chat model so a
    Sol/Terra/UI change can't silently alter image generation. Both models are
    config-only allowlisted, never arbitrary strings from the tool call.
    """

    enabled: bool = True  # kill switch for the native wire implementation
    outer_model: str = "gpt-5.5"  # Responses model that hosts the image tool
    image_model: str = "gpt-image-2"  # the image_generation tool's model
    # NOTE: this route IGNORES the requested size and always returns a
    # backend-selected SQUARE image, so there is no size allowlist — the
    # selector sends non-square requests to ComfyUI instead.
    # Image-specific deadline (separate from chat). Progress events keep the
    # read timer alive but must not defeat the total.
    request_timeout_seconds: int = 180
    connect_timeout_seconds: int = 30
    stream_stall_timeout_seconds: int = 120
    max_image_bytes: int = 16 * 1024 * 1024  # decoded-size safety cap


class ImageConfig(BaseModel):
    """Image-generation backend selection.

    ``auto`` follows the active chat provider: on ``codex`` native OpenAI is the
    default (ComfyUI is the toggle/pre-generation fallback), on any other
    provider ComfyUI is the only option. ``openai`` / ``comfyui`` force one
    backend. Availability is structural (selected backend configured), so a
    cooling-down account or an offline ComfyUI does not make the tool appear or
    disappear — only the provider/config selection does.
    """

    backend: Literal["auto", "openai", "comfyui"] = "auto"
    openai: ImageOpenAIConfig = ImageOpenAIConfig()


class ReactionTriggerConfig(BaseModel):
    enabled: bool = False
    channel_ids: list[str] = Field(default_factory=list)  # Empty = all channels
    allowed_user_ids: list[str] = Field(default_factory=list)  # Empty = all users


class MessageTriggerConfig(BaseModel):
    enabled: bool = False
    channel_ids: list[str] = Field(default_factory=list)  # Empty = all channels
    allowed_user_ids: list[str] = Field(default_factory=list)  # Empty = all users


class SlackConfig(BaseModel):
    enabled: bool = False
    webhook_urls: dict[str, str] = Field(default_factory=dict)
    default_webhook_url: str = ""
    scrub_secrets: bool = True
    rate_limit_seconds: int = 1
    forward_alerts: bool = True
    forward_webhooks: bool = False


class IssueTrackerConfig(BaseModel):
    enabled: bool = False
    provider: str = "linear"  # "linear" or "jira"
    api_token: str = ""
    base_url: str = ""  # Required for Jira (e.g. https://yourorg.atlassian.net)
    project_key: str = ""  # Default Jira project key
    default_team_id: str = ""  # Default Linear team ID
    scrub_secrets: bool = True

    @field_validator("provider")
    @classmethod
    def _validate_provider(cls, v: str) -> str:
        if v.lower() not in ("linear", "jira"):
            raise ValueError(f"Invalid provider '{v}'. Must be 'linear' or 'jira'.")
        return v.lower()


class GrafanaRemediationRuleConfig(BaseModel):
    id: str = ""
    name_pattern: str = "*"  # fnmatch pattern for alertname
    label_matchers: dict[str, str] = Field(default_factory=dict)
    severity_filter: list[str] = Field(default_factory=list)  # empty = match all
    remediation_goal: str = ""
    mode: str = "notify"  # "notify", "act", "silent"
    interval_seconds: int = 30
    max_iterations: int = 10
    cooldown_seconds: int = 300

    @field_validator("mode")
    @classmethod
    def _validate_mode(cls, v: str) -> str:
        if v not in ("notify", "act", "silent"):
            raise ValueError(f"Invalid mode '{v}'. Must be 'notify', 'act', or 'silent'.")
        return v


class GrafanaAlertConfig(BaseModel):
    auto_remediate: bool = False
    rules: list[GrafanaRemediationRuleConfig] = Field(default_factory=list)
    cooldown_seconds: int = 300
    max_concurrent_remediations: int = 5


class MCPServerConfig(BaseModel):
    enabled: bool = True
    transport: str = "stdio"  # "stdio" or "http"
    command: str = ""  # for stdio: executable path
    args: list[str] = Field(default_factory=list)  # for stdio: command arguments
    url: str = ""  # for http: endpoint URL
    headers: dict[str, str] = Field(default_factory=dict)  # for http: extra headers
    env: dict[str, str] = Field(default_factory=dict)  # extra env vars for stdio
    cwd: str = ""  # optional working directory for stdio
    tool_allowlist: list[str] = Field(default_factory=list)
    timeout_seconds: int = 120

    @field_validator("transport")
    @classmethod
    def _validate_transport(cls, v: str) -> str:
        if v not in ("stdio", "http"):
            raise ValueError(f"Invalid transport '{v}'. Must be 'stdio' or 'http'.")
        return v


class ContextTraceConfig(BaseModel):
    enabled: bool = True
    # raw | hash | redacted — how learned/memory keys appear in traces
    memory_key_mode: Literal["raw", "hash", "redacted"] = "hash"
    include_segment_ids: bool = True
    max_trace_bytes: int = 16384


class ObservabilityConfig(BaseModel):
    """Pure instrumentation — records prompt assembly and failure metadata,
    never influences behavior. Each piece has its own kill-switch."""
    context_trace: ContextTraceConfig = ContextTraceConfig()
    audit_failure_classification: bool = True
    prompt_budget_accounting: bool = True
    # Record the user request on trajectory turns (capped + secret-scrubbed)
    trajectory_user_content: bool = True
    max_user_content_chars: int = 4000
    # Trajectory + context trace coverage for autonomous loop iterations
    loop_trace: bool = True
    # Storage cap per tool result persisted into trajectory iterations
    # (model-facing content is separately capped at 12000)
    max_tool_result_chars: int = 2000


class EmailSmtpConfig(BaseModel):
    host: str = "smtp.gmail.com"
    port: int = 587
    username: str = ""
    password: str = ""
    from_address: str = ""


class EmailImapConfig(BaseModel):
    host: str = "imap.gmail.com"
    port: int = 993
    username: str = ""
    password: str = ""


class EmailConfig(BaseModel):
    enabled: bool = False
    smtp: EmailSmtpConfig = EmailSmtpConfig()
    imap: EmailImapConfig = EmailImapConfig()
    max_body_chars: int = 50_000
    max_results: int = 50
    max_attachment_bytes: int = 10 * 1024 * 1024
    connect_timeout_seconds: int = 30
    allowed_attachment_dirs: list[str] = Field(default_factory=list)


class MCPConfig(BaseModel):
    enabled: bool = False
    servers: dict[str, MCPServerConfig] = Field(default_factory=dict)


class Config(BaseModel):
    # ``model``/``agent_model`` and other ``model_*`` fields would otherwise
    # collide with pydantic v2's protected ``model_*`` namespace. Disable it.
    model_config = ConfigDict(protected_namespaces=())

    timezone: str = "UTC"
    discord: DiscordConfig
    openai_codex: OpenAICodexConfig = OpenAICodexConfig()
    ollama: OllamaConfig = OllamaConfig()
    kimi: KimiConfig = KimiConfig()
    llm_provider: LLMProviderConfig = LLMProviderConfig()
    context: ContextConfig = ContextConfig()
    sessions: SessionsConfig = SessionsConfig()
    tools: ToolsConfig = ToolsConfig()
    logging: LoggingConfig = LoggingConfig()
    usage: UsageConfig = UsageConfig()
    webhook: WebhookConfig = WebhookConfig()
    learning: LearningConfig = LearningConfig()
    observability: ObservabilityConfig = ObservabilityConfig()
    email: EmailConfig = EmailConfig()
    search: SearchConfig = SearchConfig()
    browser: BrowserConfig = BrowserConfig()
    permissions: PermissionsConfig = PermissionsConfig()
    comfyui: ComfyUIConfig = ComfyUIConfig()
    image: ImageConfig = ImageConfig()
    web: WebConfig = WebConfig()
    attachments: AttachmentsConfig = AttachmentsConfig()
    personality: PersonalityConfig = PersonalityConfig()
    reaction_triggers: ReactionTriggerConfig = ReactionTriggerConfig()
    message_triggers: MessageTriggerConfig = MessageTriggerConfig()
    mcp: MCPConfig = MCPConfig()
    slack: SlackConfig = SlackConfig()
    issue_tracker: IssueTrackerConfig = IssueTrackerConfig()
    audit: AuditConfig = AuditConfig()
    agents: AgentsConfig = AgentsConfig()
    grafana_alerts: GrafanaAlertConfig = GrafanaAlertConfig()
    outbound_webhooks: OutboundWebhooksConfig = OutboundWebhooksConfig()
    graceful_degradation: GracefulDegradationConfig = GracefulDegradationConfig()
    llm_recovery: LLMRecoveryConfig = LLMRecoveryConfig()
    turn_state: TurnStateConfig = TurnStateConfig()

    @model_validator(mode="after")
    def _validate_host_inventory(self):
        alias_pattern = re.compile(r"^[A-Za-z][A-Za-z0-9_.-]{0,63}$")
        for alias, host in self.tools.hosts.items():
            if not alias_pattern.fullmatch(alias):
                raise ValueError(f"invalid tools.hosts alias: {alias!r}")
            if host.trust_mode in {"pinned", "tofu", "ca"} and not host.host_keys:
                raise ValueError(f"tools.hosts.{alias} requires public host_keys")
        dangling_overrides = set(self.tools.governor.host_overrides) - set(self.tools.hosts)
        if dangling_overrides:
            raise ValueError(
                "tools.governor.host_overrides names unknown host(s): "
                + ", ".join(sorted(dangling_overrides))
            )
        if self.tools.default_host and self.tools.default_host not in self.tools.hosts:
            raise ValueError("tools.default_host must name a configured host")
        return self


def _substitute_env_vars(text: str) -> str:
    """Replace ${VAR} and ${VAR:-default} patterns with environment variable values.

    ${VAR} — required, raises ValueError if not set.
    ${VAR:-default} — optional, uses *default* when VAR is unset.
    """
    def replacer(match: re.Match) -> str:
        var_name = match.group(1)
        default = match.group(2)  # None when no :- syntax used
        value = os.environ.get(var_name)
        if value is None:
            if default is not None:
                return default
            raise ValueError(f"Environment variable {var_name} is not set")
        return value
    return re.sub(r"\$\{(\w+)(?::-([^}]*))?\}", replacer, text)


# The absolute path the live config was loaded from. LLM-config persistence
# writes THIS path — never a CWD-relative "config.yml" — so a fabricated Config
# (a test or one-off script that never called load_config) cannot silently
# overwrite a real deployment's config.yml from the wrong working directory.
_ACTIVE_CONFIG_PATH: Path | None = None
# The path AS GIVEN (absolutized, symlinks intact). restart.reexec() replays
# sys.argv, so an alias like /etc/odin/config.yml -> /srv/real/odin.yml is what
# the restarted process opens — protecting only the canonical target would let
# a relative command delete the alias and break the next restart (PR #239
# round-10 review, reproduced).
_LAUNCH_CONFIG_PATH: Path | None = None


def active_config_launch_path() -> Path | None:
    """The config path as given on the command line, absolutized but with
    symlinks intact — what ``restart.reexec()`` will hand the next process."""
    return _LAUNCH_CONFIG_PATH


def active_config_path() -> Path | None:
    """Absolute path the live config was loaded from, or None if this process
    never loaded one (in which case persistence must refuse, not guess a path)."""
    return _ACTIVE_CONFIG_PATH


def set_active_config_path(path: str | Path | None) -> None:
    """Record (or clear) the active config path. ``load_config`` calls this on a
    successful load; tests/tools that persist a hand-built Config point it at
    their own file."""
    global _ACTIVE_CONFIG_PATH, _LAUNCH_CONFIG_PATH
    _ACTIVE_CONFIG_PATH = Path(path).resolve() if path is not None else None
    _LAUNCH_CONFIG_PATH = Path(os.path.abspath(path)) if path is not None else None


def load_config(path: str | Path = "config.yml") -> Config:
    path = Path(path)
    original_raw = path.read_text()
    try:
        raw = _substitute_env_vars(original_raw)
    except ValueError as exc:
        raise SystemExit(
            f"Configuration error: {exc}\n"
            "Set the variable in your .env file or shell environment.\n"
            "See .env.example for required variables."
        ) from exc
    try:
        data = yaml.safe_load(raw)
    except yaml.YAMLError as exc:
        raise SystemExit(
            f"Failed to parse {path}: {exc}\n"
            "Check your YAML syntax (indentation, colons, quotes)."
        ) from exc
    if not isinstance(data, dict):
        raise SystemExit(
            f"Config file {path} is empty or invalid.\n"
            "It must contain a YAML mapping with at least a 'discord' section.\n"
            "See config.yml comments for examples."
        )
    # Warn on unknown top-level keys. Pydantic silently drops unknown fields by
    # default, so a typo like "sesions:" or "web_ui:" is ignored with no signal
    # and the intended setting never applies. We warn rather than error
    # (extra="forbid") so a slightly-ahead config can't hard-fail boot.
    _warn_unknown_config_keys(data)
    # One-time legacy-ceiling migration gate (see src/config/migrations.py).
    # Runs on the raw dict so pydantic validates what will actually apply;
    # the unsubstituted text distinguishes a literal legacy default from a
    # deliberate ${VAR} placeholder.
    from .migrations import MigrationCompletionError, apply_legacy_ceiling_migration

    try:
        apply_legacy_ceiling_migration(data, path, original_raw)
    except MigrationCompletionError as exc:
        raise SystemExit(
            f"Configuration migration failed for {path}: {exc}\n"
            "Inspect the ceiling-migration record and retry; Odin will not "
            "guess at operator provenance."
        ) from exc
    try:
        cfg = Config(**data)
    except Exception as exc:
        raise SystemExit(
            f"Config validation failed: {exc}\n"
            "Check config.yml values — numeric fields must be within valid ranges."
        ) from exc
    # Record where this live config came from so persistence targets THIS file,
    # never a CWD-relative guess.
    set_active_config_path(path)
    return cfg


def _warn_unknown_config_keys(data: dict) -> None:
    """Log a warning for top-level config keys the schema doesn't define."""
    from ..odin_log import get_logger
    known = set(Config.model_fields)
    # Also accept field aliases if any are defined.
    for f in Config.model_fields.values():
        if getattr(f, "alias", None):
            # The getattr probe above guarantees a truthy (str) alias, but
            # mypy can't connect it to the direct attribute read.
            known.add(f.alias)  # type: ignore[arg-type]
    unknown = [k for k in data if k not in known]
    if unknown:
        get_logger("config").warning(
            "Ignoring unknown config key(s): %s — check for typos "
            "(known top-level sections: %s)",
            ", ".join(sorted(unknown)), ", ".join(sorted(known)),
        )
