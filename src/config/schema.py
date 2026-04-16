from __future__ import annotations

import os
import re
from pathlib import Path

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
    token_budget: int = 128_000
    adaptive_compaction: bool = True


class ToolHost(BaseModel):
    address: str
    ssh_user: str = "root"
    os: str = "linux"  # "linux" or "macos"


class RetryConfig(BaseModel):
    max_retries: int = 3
    base_delay: float = 1.0
    max_delay: float = 30.0


class BulkheadConfig(BaseModel):
    ssh_max_concurrent: int = 10
    subprocess_max_concurrent: int = 20
    browser_max_concurrent: int = 3
    ssh_max_queued: int = 20
    subprocess_max_queued: int = 40
    browser_max_queued: int = 6


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


class SSHPoolConfig(BaseModel):
    enabled: bool = True
    control_persist: int = 60
    socket_dir: str = "/tmp/odin_ssh_sockets"


class ConnectionPoolConfig(BaseModel):
    max_connections: int = 10
    keepalive_timeout: int = 30


class ContextCompressionConfig(BaseModel):
    enabled: bool = True
    max_context_chars: int = 48_000
    keep_recent_iterations: int = 3


class ModelRoutingConfig(BaseModel):
    enabled: bool = False
    confidence_threshold: float = 0.6
    max_cheap_length: int = 200
    strong_intents: list[str] = Field(
        default_factory=lambda: ["task", "complex"],
    )


class ToolsConfig(BaseModel):
    enabled: bool = True
    ssh_key_path: str = "/app/.ssh/id_ed25519"
    ssh_known_hosts_path: str = "/app/.ssh/known_hosts"
    hosts: dict[str, ToolHost] = Field(default_factory=dict)
    command_timeout_seconds: int = 300
    tool_timeouts: dict[str, int] = Field(default_factory=dict)
    claude_code_host: str = ""
    claude_code_user: str = ""
    claude_code_dir: str = "/opt/odin"
    skill_allowed_urls: list[str] = Field(default_factory=list)
    ssh_retry: RetryConfig = RetryConfig(max_retries=2, base_delay=0.5, max_delay=10.0)
    bulkhead: BulkheadConfig = BulkheadConfig()
    ssh_pool: SSHPoolConfig = SSHPoolConfig()
    recovery: RecoveryConfig = RecoveryConfig()
    branch_freshness: BranchFreshnessConfig = BranchFreshnessConfig()
    streaming: StreamingConfig = StreamingConfig()
    # Tool-iteration caps per request before the loop force-exits.
    # Chat: normal Discord messages. Loop: autonomous loop iterations.
    # Loops typically need more budget for exploration + execution + verify + commit.
    max_tool_iterations_chat: int = 30
    max_tool_iterations_loop: int = 100

    def get_tool_timeout(self, tool_name: str) -> int:
        return self.tool_timeouts.get(tool_name, self.command_timeout_seconds)

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
        default_factory=lambda: ["compaction", "reflection", "consolidation", "background_followup"],
    )


class OpenAICodexConfig(BaseModel):
    # ``model`` and ``model_routing`` collide with pydantic v2's protected
    # ``model_*`` namespace by default. Disable the guard.
    model_config = ConfigDict(protected_namespaces=())

    enabled: bool = False
    model: str = "gpt-4o"
    max_tokens: int = 4096
    credentials_path: str = "./data/codex_auth.json"
    retry: RetryConfig = RetryConfig()
    connection_pool: ConnectionPoolConfig = ConnectionPoolConfig()
    auxiliary: AuxiliaryLLMConfig = AuxiliaryLLMConfig()
    context_compression: ContextCompressionConfig = ContextCompressionConfig()
    model_routing: ModelRoutingConfig = ModelRoutingConfig()


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
    max_entries: int = 30
    consolidation_target: int = 20


class SearchConfig(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    enabled: bool = True
    # Accepts "chromadb_path" from old configs for backward compat
    search_db_path: str = Field(default="./data/search", validation_alias="chromadb_path")


class VoiceConfig(BaseModel):
    enabled: bool = False
    voice_service_url: str = "ws://odin-voice:3940/ws"
    auto_join: bool = False
    transcript_channel_id: str = ""
    default_voice: str = "en_US-lessac-medium"
    wake_word: str = "odin"


class BrowserConfig(BaseModel):
    enabled: bool = False
    cdp_url: str = ""  # Empty = native Playwright launch; set ws:// URL for remote CDP
    default_timeout_ms: int = 30000
    viewport_width: int = 1280
    viewport_height: int = 720


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


class WebConfig(BaseModel):
    enabled: bool = True
    api_token: str = ""  # Empty = no auth required (dev mode)
    session_timeout_minutes: int = 0  # 0 = no timeout (sessions persist until logout)
    port: int = 3000  # HTTP server port for health checks + web UI


class ComfyUIConfig(BaseModel):
    enabled: bool = False
    url: str = "http://localhost:8188"


class ReactionTriggerConfig(BaseModel):
    enabled: bool = False
    channel_ids: list[str] = Field(default_factory=list)  # Empty = all channels
    allowed_user_ids: list[str] = Field(default_factory=list)  # Empty = all users


class MessageTriggerConfig(BaseModel):
    enabled: bool = False
    channel_ids: list[str] = Field(default_factory=list)  # Empty = all channels
    allowed_user_ids: list[str] = Field(default_factory=list)  # Empty = all users


class MonitorCheck(BaseModel):
    name: str
    type: str  # "disk", "memory", "service", "promql"
    hosts: list[str] = Field(default_factory=list)
    services: list[str] = Field(default_factory=list)  # for type "service"
    threshold: int = 90  # percent, for disk/memory
    query: str = ""  # for type "promql"
    interval_minutes: int = 30


class MonitoringConfig(BaseModel):
    enabled: bool = False
    checks: list[MonitorCheck] = Field(default_factory=list)
    alert_channel_id: str = ""
    cooldown_minutes: int = 60


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
    context: ContextConfig = ContextConfig()
    sessions: SessionsConfig = SessionsConfig()
    tools: ToolsConfig = ToolsConfig()
    logging: LoggingConfig = LoggingConfig()
    usage: UsageConfig = UsageConfig()
    webhook: WebhookConfig = WebhookConfig()
    learning: LearningConfig = LearningConfig()
    search: SearchConfig = SearchConfig()
    voice: VoiceConfig = VoiceConfig()
    monitoring: MonitoringConfig = MonitoringConfig()
    browser: BrowserConfig = BrowserConfig()
    permissions: PermissionsConfig = PermissionsConfig()
    comfyui: ComfyUIConfig = ComfyUIConfig()
    web: WebConfig = WebConfig()
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
    return Config(**data)
