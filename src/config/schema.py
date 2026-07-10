from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Literal, get_args

import yaml
from pydantic import BaseModel, ConfigDict, Field, field_validator

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
    max_system_prompt_tokens: int = 32000


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
    address: str
    ssh_user: str = "root"
    os: str = "linux"  # "linux" or "macos"


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


class ContextCompressionConfig(BaseModel):
    enabled: bool = True
    max_context_chars: int = 750_000
    keep_recent_iterations: int = 30


class ModelRoutingConfig(BaseModel):
    enabled: bool = False
    confidence_threshold: float = 0.6
    max_cheap_length: int = 200
    strong_intents: list[str] = Field(
        default_factory=lambda: ["task", "complex"],
    )


class GovernorConfig(BaseModel):
    block_critical: bool = True
    block_exfil: bool = True
    admin_can_override: bool = True
    host_overrides: dict[str, str] = Field(default_factory=dict)


class ToolsConfig(BaseModel):
    enabled: bool = True
    governor: GovernorConfig = GovernorConfig()
    ssh_key_path: str = "/app/.ssh/id_ed25519"
    ssh_known_hosts_path: str = "/app/.ssh/known_hosts"
    hosts: dict[str, ToolHost] = Field(default_factory=dict)
    command_timeout_seconds: int = 300
    tool_timeouts: dict[str, int] = Field(default_factory=dict)
    claude_code_host: str = ""
    claude_code_user: str = ""
    claude_code_dir: str = "/opt/odin"
    skill_allowed_urls: list[str] = Field(default_factory=list)
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
    enabled: bool = False
    model: str = "gpt-4o-mini"
    max_tokens: int = 2048
    credentials_path: str = ""  # Empty = share main codex credentials
    tasks: list[str] = Field(
        default_factory=lambda: [
            "compaction",
            "reflection",
            "consolidation",
            "background_followup",
        ],
    )


# "minimal" is deliberately absent: it sits in the Codex API's generic
# parameter enum but every model on the ChatGPT-auth path rejects it at the
# per-model capability layer ("Unsupported value ... Supported values are:
# 'none', 'low', 'medium', 'high', and 'xhigh'"), which turns a saved value
# into a deterministic per-request 400.
ReasoningEffort = Literal["none", "low", "medium", "high", "xhigh"]
# Single source of truth for runtime validation (Literal does not validate
# direct attribute assignment — the web admin layer checks against this set).
CODEX_REASONING_EFFORTS: frozenset[str] = frozenset(get_args(ReasoningEffort))


class OpenAICodexConfig(BaseModel):
    # ``model`` and ``model_routing`` collide with pydantic v2's protected
    # ``model_*`` namespace by default. Disable the guard.
    model_config = ConfigDict(protected_namespaces=())

    enabled: bool = False
    model: str = "gpt-4o"
    max_tokens: int = 4096
    reasoning_effort: ReasoningEffort = "medium"
    credentials_path: str = "./data/codex_auth.json"
    # Streaming transport timeouts: a generous whole-request backstop (long
    # high-effort reasoning turns stream well past 10 minutes) plus a stall
    # bound that fails a silent stream fast instead of waiting out the
    # backstop. Both are read per request, so live reload picks them up.
    request_timeout_seconds: int = 3600
    stream_stall_timeout_seconds: int = 180

    @field_validator("reasoning_effort", mode="before")
    @classmethod
    def _coerce_legacy_reasoning_effort(cls, v):
        # v3.58.0 briefly offered "minimal"; a config persisted with it must
        # not brick startup after upgrading — degrade to the nearest value.
        if v == "minimal":
            import logging

            logging.getLogger("odin.config").warning(
                "reasoning_effort 'minimal' is not supported by any Codex "
                "model on this auth path; using 'low' instead"
            )
            return "low"
        return v

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
    model_routing: ModelRoutingConfig = ModelRoutingConfig()


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
    enabled: bool = True
    degraded_threshold: int = 3  # consecutive failures before DEGRADED
    unavailable_threshold: int = 10  # consecutive failures before UNAVAILABLE


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
    enabled: bool = False
    auto_remediate: bool = False
    rules: list[GrafanaRemediationRuleConfig] = Field(default_factory=list)
    cooldown_seconds: int = 300
    max_concurrent_remediations: int = 5


class MCPServerConfig(BaseModel):
    transport: str = "stdio"  # "stdio" or "http"
    command: str = ""  # for stdio: executable path
    args: list[str] = Field(default_factory=list)  # for stdio: command arguments
    url: str = ""  # for http: endpoint URL
    headers: dict[str, str] = Field(default_factory=dict)  # for http: extra headers
    env: dict[str, str] = Field(default_factory=dict)  # extra env vars for stdio
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
    # ``model_routing`` and ``model_router`` would otherwise collide with
    # pydantic v2's protected ``model_*`` namespace. Disable the guard.
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


def load_config(path: str | Path = "config.yml") -> Config:
    path = Path(path)
    raw = path.read_text()
    try:
        raw = _substitute_env_vars(raw)
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
    try:
        return Config(**data)
    except Exception as exc:
        raise SystemExit(
            f"Config validation failed: {exc}\n"
            "Check config.yml values — numeric fields must be within valid ranges."
        ) from exc


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
