from __future__ import annotations

import asyncio
import base64
import hashlib
import io
import os
import re
import time
from collections.abc import Callable

import discord
from discord import app_commands
from discord.ext import commands

from ..config.schema import Config
from ..monitoring import InfraWatcher
from .background_task import (
    BackgroundTask, run_background_task, create_task_id, MAX_STEPS,
)
from ..agents.manager import AGENT_BLOCKED_TOOLS, filter_agent_tools
from ..llm import CircuitOpenError
from ..llm.secret_scrubber import scrub_output_secrets
from ..observability.correlation import get_turn, set_turn
from ..odin_log import get_logger
from ..sessions.manager import CHAT_RESPONSE_MAX_CHARS, summarize_tool_response
from ..tools import ToolResult, get_tool_definitions
from ..tools.executor import _ERROR_RESULT_PREFIXES
from ..async_utils import fire_and_forget
from .channel_state import ChannelStateRegistry
from .llm_gateway import LLMGateway
from .native_tools import NativeToolDispatcher, register_native_handlers
from .native_tools.channel_ops import ChannelOpsTools
from .native_tools.knowledge import KnowledgeTools
from .native_tools.scheduling import SchedulingTools
from .prompts import PromptBuilder
from .tool_catalog import ToolCatalog
from .voice import VoiceManager, VoiceMessageProxy
from .wiring import build_services, shutdown_services

log = get_logger("discord")

# Cog extensions to load on startup (carried over from the prior moderation-bot OdinBot).
INITIAL_EXTENSIONS: tuple[str, ...] = (
    "src.discord.cogs.moderation",
    "src.discord.cogs.administration",
    "src.discord.cogs.utility",
    "src.discord.cogs.automod",
    "src.discord.cogs.logging_cog",
    "src.discord.cogs.reminders",
    "src.discord.cogs.fun",
    "src.discord.cogs.reaction_triggers",
    "src.discord.cogs.message_triggers",
)


# Friendly fallback when Codex returns an empty response after retries
_EMPTY_RESPONSE_FALLBACK = "I couldn't generate a response. Please try again."

# Webhook IDs allowed to bypass the bot-author check.
# Populated from ALLOWED_WEBHOOK_IDS env var (comma-separated) at startup.
_ALLOWED_WEBHOOK_IDS: set[str] = set()

# Patterns that might indicate a secret was pasted
SECRET_SCRUB_PATTERNS = [
    re.compile(r"sk-[a-zA-Z0-9]{20,}"),
    re.compile(r"(?i)(api[_-]?key|token|secret|password)\s*[:=]\s*\S{8,}"),
    re.compile(r"xox[boaprs]-[a-zA-Z0-9-]+"),
    # Natural language: "my password is ...", "password for gmail is ..."
    re.compile(r"(?i)(?:my\s+)?(?:password|passwd|pwd)\s+(?:\S+\s+){0,4}(?:is|was)\s+\S{6,}"),
]

DISCORD_MAX_LEN = 2000
# Tool-iteration caps are now configurable per path (chat vs loop) via
# config.tools.max_tool_iterations_chat / _loop. Read fresh each request so
# config updates via /api/config PUT take effect on the next message/iteration.
TOOL_OUTPUT_MAX_CHARS = 12000  # ~3000 tokens; cap tool results to prevent context bloat
_LONG_TIMEOUT_TOOL_SET = frozenset({"claude_code"})  # Tools that get extended timeout (3660s vs config default)
SEND_MAX_RETRIES = 3

# Pre-compiled regex for merging adjacent code blocks in combine_bot_messages
_ADJACENT_FENCE_RE = re.compile(r"\n```[ \t]*\n\n```(\w*)[ \t]*\n")

_EMAIL_BODY_TOOLS = frozenset({"email_send"})


def _scrub_tool_input_for_storage(tool_name: str, tool_input: dict) -> dict:
    """Redact privacy-sensitive fields from tool input before any storage path."""
    if tool_name not in _EMAIL_BODY_TOOLS or not isinstance(tool_input, dict):
        return tool_input
    cleaned = dict(tool_input)
    body = cleaned.get("body", "")
    cleaned["body"] = f"[redacted email body: {len(body)} chars]"
    if "attachments" in cleaned and cleaned["attachments"]:
        from pathlib import Path
        cleaned["attachments"] = [Path(p).name for p in cleaned["attachments"]]
    return cleaned


class _LoopMessageProxy:
    """Lightweight proxy providing a discord.Message-like interface for loop iterations.

    Allows Discord-native tool handlers to be called from autonomous loop
    iterations without a real Discord message object.
    """

    def __init__(self, channel: object, user_id: str, user_name: str = "loop") -> None:
        self.channel = channel
        self.id = 0  # No triggering message
        self.webhook_id = None
        self.author = _LoopAuthorProxy(user_id, user_name)


class _LoopAuthorProxy:
    """Lightweight proxy for message.author in loop context."""

    def __init__(self, user_id: str, name: str) -> None:
        self.id = int(user_id) if user_id.isdigit() else 0
        self.bot = False
        self._name = name

    def __str__(self) -> str:
        return self._name


# Additional patterns for scrubbing LLM responses before Discord delivery.
# These extend OUTPUT_SECRET_PATTERNS (applied via scrub_output_secrets) with
# patterns more likely to appear in natural-language LLM output.
_RESPONSE_EXTRA_PATTERNS = [
    re.compile(r"xox[boaprs]-[a-zA-Z0-9-]+"),  # Slack tokens
    # Natural language: "the password is ...", "my password is hunter2"
    re.compile(r"(?i)(?:my\s+)?(?:password|passwd|pwd)\s+(?:\S+\s+){0,4}(?:is|was)\s+\S{6,}"),
]


def scrub_response_secrets(text: str) -> str:
    """Scrub potential secrets from LLM responses before sending to Discord.

    Applies the tool-output patterns (passwords, API keys, private keys,
    database URLs) plus additional patterns for secrets that LLMs might
    express in natural language.
    """
    text = scrub_output_secrets(text)
    for pattern in _RESPONSE_EXTRA_PATTERNS:
        text = pattern.sub("[REDACTED]", text)
    return text


# Response guard detectors — single source of truth in response_guards.py.
from .response_guards import (
    detect_fabrication,
    detect_promise_without_action,
    detect_tool_unavailable,
    detect_hedging,
    detect_code_hedging,
    detect_premature_failure,
    _FABRICATION_RETRY_MSG,
    _PROMISE_RETRY_MSG,
    _TOOL_UNAVAIL_RETRY_MSG,
    _HEDGING_RETRY_MSG,
    _CODE_HEDGING_RETRY_MSG,
    _FAILURE_RETRY_MSG,
    _CONTINUATION_MSG,
)


def truncate_tool_output(text: str, max_chars: int = TOOL_OUTPUT_MAX_CHARS) -> str:
    """Truncate large tool output, preserving the start and end for context.

    Tool results stay in the messages list and are re-sent as input tokens
    on every subsequent iteration of the tool loop.  Capping output prevents
    a single large result (Prometheus JSON, file contents, long command output)
    from ballooning costs across iterations.
    """
    if len(text) <= max_chars:
        return text
    half = max_chars // 2
    omitted = len(text) - max_chars
    return (
        text[:half]
        + f"\n\n[... {omitted} characters omitted ...]\n\n"
        + text[-half:]
    )


def combine_bot_messages(parts: list[str]) -> str:
    """Combine buffered bot messages, intelligently merging code blocks.

    Handles:
    - Split code blocks (open in one message, close in later one) — joined
      with a single newline so no extra blank lines appear inside the block.
    - Adjacent code blocks (close fence then immediately open fence) — merged
      into one continuous block by removing the redundant fence pair.
    - Regular text between code blocks — joined with double newline as usual.
    """
    if len(parts) <= 1:
        return parts[0] if parts else ""

    # Join parts, using \n (not \n\n) when the previous part has an unclosed
    # code block — meaning the next part is a continuation of the same block.
    # Track fence count incrementally to avoid O(n²) rescanning.
    result = parts[0]
    fence_count = result.count("```")
    for i in range(1, len(parts)):
        if fence_count % 2 == 1:
            # Inside an unclosed code block — continuation, single newline
            result += "\n" + parts[i]
        else:
            result += "\n\n" + parts[i]
        fence_count += parts[i].count("```")

    # Merge adjacent code blocks: \n```<ws>\n\n```<lang>\n → \n
    # This collapses e.g. "\n```\n\n```bash\n" into a single block.
    result = _ADJACENT_FENCE_RE.sub("\n", result)

    return result


class OdinBot(commands.Bot):
    def __init__(self, config: Config) -> None:
        intents = discord.Intents.default()
        intents.message_content = True
        intents.reactions = True
        intents.members = True
        intents.voice_states = True
        super().__init__(
            command_prefix=self._resolve_prefix,
            intents=intents,
            help_command=None,
        )

        self.config = config
        # commands.Bot already initializes self.tree (app_commands.CommandTree); do not overwrite
        self._start_time = time.monotonic()

        # Per-channel mutable state — owned by ChannelStateRegistry (RFC-001
        # P2). The dict attributes below are facade ALIASES to the registry's
        # dicts (same objects): external readers (web layer, tests) keep
        # working, and mutations through either name stay in sync.
        self._channel_state = ChannelStateRegistry()
        self._channel_locks = self._channel_state.channel_locks
        self._cancel_events = self._channel_state.cancel_events
        self._pending_files = self._channel_state.pending_files
        self._recent_actions = self._channel_state.recent_actions
        self._last_op_details = self._channel_state.last_op_details
        self._background_tasks = self._channel_state.background_tasks

        # ------------------------------------------------------------------
        # Subsystem construction lives in the composition root (wiring.py,
        # RFC-001 P1). Attributes are attached flat so the external facade
        # (web/api.py, health checks, tests) is unchanged.
        # ------------------------------------------------------------------
        services = build_services(config)
        self.context_loader = services.context_loader
        self.reflector = services.reflector
        self._embedder = services.embedder
        self._fts_index = services.fts_index
        self._vector_store = services.vector_store
        self._knowledge_store = services.knowledge_store
        self.sessions = services.sessions
        self._memory_path = services.memory_path
        self.channel_config = services.channel_config
        self.channel_logger = services.channel_logger
        self.browser_manager = services.browser_manager
        self.host_access_manager = services.host_access_manager
        self.permissions = services.permissions
        self.tool_executor = services.tool_executor
        self.skill_manager = services.skill_manager
        self.scheduler = services.scheduler
        self.audit = services.audit
        self.api_token_manager = services.api_token_manager
        self.agent_manager = services.agent_manager
        self.loop_manager = services.loop_manager
        self.trajectory_saver = services.trajectory_saver
        self.agent_trajectory_saver = services.agent_trajectory_saver
        self.loop_agent_bridge = services.loop_agent_bridge
        self._loop_reflection_gate = services.loop_reflection_gate
        self.cost_tracker = services.cost_tracker
        self.subsystem_guard = services.subsystem_guard
        self.diff_tracker = services.diff_tracker
        self.model_router = services.model_router
        self.context_compressor = services.context_compressor
        self.prefix_tracker = services.prefix_tracker
        self.auxiliary_llm_client = services.auxiliary_llm_client
        self.outbound_webhook_dispatcher = services.outbound_webhook_dispatcher
        self._run_startup_diagnostics = services.run_startup_diagnostics
        self.stuck_loop_tracker_cls = services.stuck_loop_tracker_cls
        self.classify_command_risk = services.classify_command_risk
        self.classify_tool_risk = services.classify_tool_risk
        # Audit signer — exposed as bot.audit_signer for tests/introspection.
        # The actual chain signing is wired into AuditLogger via the hmac_key
        # constructor arg; signing happens automatically inside log_execution.
        self.audit_signer = self.audit._signer

        # LLM provider management (RFC-001 P4) — the gateway owns the
        # provider clients and switch state; codex_client/ollama_client/
        # kimi_client on the bot are property shims over it.
        self._llm_gateway = LLMGateway(
            get_config=lambda: self.config,
            codex_client=services.codex_client,
            ollama_client=services.ollama_client,
            kimi_client=services.kimi_client,
            subsystem_guard=services.subsystem_guard,
            model_router=services.model_router,
            auxiliary_llm_client=services.auxiliary_llm_client,
            cost_tracker=services.cost_tracker,
            sessions=services.sessions,
            reflector=services.reflector,
        )

        # Wire LLM callbacks to whichever provider is active
        if self.llm_client is not None:
            self._wire_llm_callbacks()

        # Voice support — VoiceManager takes the live bot, so it stays here
        self.voice_manager: VoiceManager | None = None
        if config.voice.enabled:
            self.voice_manager = VoiceManager(config.voice, self)
            self.voice_manager.on_transcription = self._on_voice_transcription

        # Proactive infrastructure monitoring — alert callback needs the bot
        self.infra_watcher: InfraWatcher | None = None
        if config.monitoring.enabled and config.monitoring.checks:
            self.infra_watcher = InfraWatcher(
                config=config.monitoring,
                executor=self.tool_executor,
                alert_callback=self._on_monitor_alert,
            )

        # Prompt assembly + tool catalog (RFC-001 P3). Bot-coupled because
        # they must read LIVE hot-reloadable state: bot.config is replaced by
        # the web API's config hot-reload and bot.codex_client by live auth
        # reloads — hence provider callables, not captured references.
        self._prompt_builder = PromptBuilder(
            get_config=lambda: self.config,
            context_loader=self.context_loader,
            reflector=self.reflector,
            skill_manager=self.skill_manager,
            tool_executor=self.tool_executor,
            channel_state=self._channel_state,
            voice_manager=self.voice_manager,
            get_codex_client=lambda: self.codex_client,
        )
        self._tool_catalog = ToolCatalog(
            get_config=lambda: self.config,
            skill_manager=self.skill_manager,
        )

        # One Discord-native dispatch table for both pipelines (RFC-001 P5a);
        # handler bodies stay as bot methods until P5b moves them to domain
        # modules. Constructed after the catalog/builder it invalidates.
        self._native_tools = NativeToolDispatcher(
            handler_host=self,
            skill_manager=self.skill_manager,
            tool_catalog=self._tool_catalog,
            prompt_builder=self._prompt_builder,
            channel_state=self._channel_state,
            invoke_skill_missing_required=self._invoke_skill_missing_required,
        )
        register_native_handlers(self._native_tools)

        # Domain handler bundles (P5b) — bodies moved out of the bot; the
        # delegate methods below keep the dispatch host + test seam stable.
        self._scheduling_tools = SchedulingTools(scheduler=self.scheduler)
        self._knowledge_tools = KnowledgeTools(
            sessions=self.sessions,
            get_knowledge_store=lambda: self._knowledge_store,
            embedder=self._embedder,
            audit=self.audit,
        )
        self._channel_ops_tools = ChannelOpsTools(
            sessions=self.sessions,
            permissions=self.permissions,
            get_channel=self.get_channel,
        )


        # Public `codex` / `knowledge` attributes are exposed as dynamic
        # properties defined below on the class — see the @property blocks.
        # Using properties (instead of one-time aliases) means the web UI /
        # health checker always reads the live value, even if the underlying
        # attribute gets reassigned during a reload or reinit.

        self._system_prompt = self._build_system_prompt()
        self._register_commands()
        self._init_allowed_webhook_ids()
        self._log_startup_config()

    # ---------- LLM provider abstraction ------------------------------------

    @property
    def llm_client(self):
        """Return whichever LLM provider is currently active (gateway-owned)."""
        return self._llm_gateway.active_client

    def _wire_llm_callbacks(self) -> None:
        """Attach LLM-backed compaction/reflection callbacks (gateway-owned)."""
        self._llm_gateway.wire_callbacks()

    def _wire_codex_callbacks(self) -> None:
        """Legacy alias — routes through provider abstraction."""
        self._llm_gateway.wire_callbacks()

    # ---------- Live provider reloads (gateway-owned, facade retained) ------

    async def _reload_codex_inner(self) -> dict:
        """Inner reload — caller must hold _llm_provider_lock."""
        return await self._llm_gateway.reload_codex_inner()

    async def reload_codex_auth(self) -> dict:
        """Reload Codex credentials and create the client if it was missing at boot."""
        return await self._llm_gateway.reload_codex()

    async def _reload_ollama_inner(self) -> dict:
        """Inner reload — caller must hold _llm_provider_lock."""
        return await self._llm_gateway.reload_ollama_inner()

    async def reload_ollama(self) -> dict:
        """Reload Ollama client from current config."""
        return await self._llm_gateway.reload_ollama()

    async def _reload_kimi_inner(self) -> dict:
        """Inner reload — caller must hold _llm_provider_lock."""
        return await self._llm_gateway.reload_kimi_inner()

    async def reload_kimi(self) -> dict:
        """Reload Kimi client from current config."""
        return await self._llm_gateway.reload_kimi()

    async def switch_llm_provider(self, provider: str) -> dict:
        """Switch the active LLM provider at runtime."""
        return await self._llm_gateway.switch_provider(provider)


    @property
    def codex(self):
        return self.codex_client

    @codex.setter
    def codex(self, value) -> None:
        """Allow tests and reloads to swap the Codex client via the public name."""
        self.codex_client = value

    @property
    def knowledge(self):
        return self._knowledge_store

    @knowledge.setter
    def knowledge(self, value) -> None:
        """Allow tests and reloads to swap the knowledge store via the public name."""
        self._knowledge_store = value

    # LLM provider client shims — storage moved to LLMGateway (P4); the
    # attribute spellings stay because the web layer reads them, live
    # reloads replace them, and tests inject fakes via bot.codex_client.
    @property
    def codex_client(self):
        return self._llm_gateway.codex_client

    @codex_client.setter
    def codex_client(self, value) -> None:
        self._llm_gateway.codex_client = value

    @property
    def ollama_client(self):
        return self._llm_gateway.ollama_client

    @ollama_client.setter
    def ollama_client(self, value) -> None:
        self._llm_gateway.ollama_client = value

    @property
    def kimi_client(self):
        return self._llm_gateway.kimi_client

    @kimi_client.setter
    def kimi_client(self, value) -> None:
        self._llm_gateway.kimi_client = value

    @property
    def _llm_provider_lock(self):
        return self._llm_gateway.provider_lock


    # Prompt/catalog cache shims — web/api.py reads AND writes these names
    # (Appendix B starred entries); storage moved to PromptBuilder/ToolCatalog
    # in P3, the facade spelling stays.
    @property
    def _cached_merged_tools(self):
        return self._tool_catalog.cached

    @_cached_merged_tools.setter
    def _cached_merged_tools(self, value) -> None:
        self._tool_catalog.cached = value

    @property
    def _cached_skills_text(self):
        return self._prompt_builder.cached_skills_text

    @_cached_skills_text.setter
    def _cached_skills_text(self, value) -> None:
        self._prompt_builder.cached_skills_text = value

    def _init_allowed_webhook_ids(self) -> None:
        """Populate _ALLOWED_WEBHOOK_IDS from ALLOWED_WEBHOOK_IDS env var."""
        global _ALLOWED_WEBHOOK_IDS
        raw = os.environ.get("ALLOWED_WEBHOOK_IDS", "")
        if raw:
            _ALLOWED_WEBHOOK_IDS = {wid.strip() for wid in raw.split(",") if wid.strip()}

    def _log_startup_config(self) -> None:
        """Log configuration summary at startup to help users verify setup."""
        cfg = self.config
        if not cfg.tools.hosts:
            log.warning("No hosts configured — SSH tools will not work until hosts are added to config.yml")
        else:
            log.info("Configured hosts: %s", ", ".join(cfg.tools.hosts.keys()))
        if not cfg.tools.claude_code_host:
            log.info("claude_code_host not set — claude -p code generation requires a configured host")
        if cfg.openai_codex.enabled and not self.codex_client:
            log.warning("Codex enabled but not configured — session compaction and learning reflection disabled")
        if cfg.discord.respond_to_bots:
            log.info("Bot interaction enabled — will respond to other bots")
        if cfg.discord.require_mention:
            log.info("Mention-only mode — will only respond when @mentioned")

    def _record_user_content(self, trajectory, content: str) -> None:
        """Store the request on the trajectory turn — capped, secret-scrubbed,
        with explicit truncation metadata. Config-gated; never raises."""
        try:
            obs = getattr(self.config, "observability", None)
            if obs is not None and not obs.trajectory_user_content:
                return
            cap = getattr(obs, "max_user_content_chars", 4000) if obs else 4000
            scrubbed = scrub_output_secrets(content)
            if len(scrubbed) > cap:
                trajectory.user_content_truncated = True
                trajectory.user_content_original_chars = len(scrubbed)
                scrubbed = scrubbed[:cap]
            trajectory.user_content = scrubbed
        except Exception:  # noqa: BLE001 — recording must never break the turn
            log.debug("user_content recording failed (non-fatal)", exc_info=True)

    def _new_context_trace(self):
        """Create a context-trace collector when observability is enabled.

        Returns None when disabled — every consumer treats None as
        "record nothing", leaving the request path byte-identical.
        """
        try:
            obs = getattr(self.config, "observability", None)
            ct = getattr(obs, "context_trace", None)
            if ct is None or not ct.enabled:
                return None
            from ..observability import ContextTraceCollector
            return ContextTraceCollector(
                memory_key_mode=ct.memory_key_mode,
                include_segment_ids=ct.include_segment_ids,
                max_trace_bytes=ct.max_trace_bytes,
            )
        except Exception:  # noqa: BLE001 — tracing must never block a turn
            return None

    def _invalidate_prompt_caches(self) -> None:
        """Invalidate all prompt-related caches. Called on config/context reload."""
        self._prompt_builder.invalidate()
        self._tool_catalog.invalidate()


    def _invoke_skill_missing_required(self, name: str, payload: dict) -> list[str]:
        """Return required input fields the payload omits, or [] if complete.

        Used by invoke_skill to fail loudly when the LLM omits the input
        object — otherwise the skill silently runs with empty params and
        returns a degenerate result that looks like a tool bug.
        """
        try:
            skill = self.skill_manager._skills.get(name)
            if skill is None:
                return []
            schema = skill.definition.get("input_schema") or {}
            required = schema.get("required") or []
            return [f for f in required if f not in payload]
        except Exception:
            return []

    def _build_system_prompt(
        self, channel: discord.abc.GuildChannel | None = None,
        user_id: str | None = None,
        query: str | None = None,
        trace=None,
    ) -> str:
        """Full system prompt — owned by PromptBuilder (P3)."""
        return self._prompt_builder.build_full_prompt(
            channel=channel, user_id=user_id, query=query, trace=trace,
        )


    def _build_chat_system_prompt(
        self, channel: discord.abc.GuildChannel | None = None,
        user_id: str | None = None,
        query: str | None = None,
    ) -> str:
        """Lightweight chat prompt — owned by PromptBuilder (P3)."""
        return self._prompt_builder.build_chat_prompt(
            channel=channel, user_id=user_id, query=query,
        )


    def _merged_tool_definitions(self) -> list[dict]:
        """Merged builtin+skill tool definitions — owned by ToolCatalog (P3)."""
        return self._tool_catalog.merged_definitions()


    def _cleanup_stale_caches(self) -> None:
        """Remove stale entries from per-channel caches to prevent memory leaks.

        Called periodically (throttled by the channel-state registry's
        cleanup_interval) after session prune. Removes expired per-channel
        state for channels that no longer have active sessions.
        """
        now = time.time()
        # Per-channel state (recent actions, locks, pending files, cancel
        # events, active requests) — delegated to the registry.
        active_channels = set(self.sessions.ids())
        self._channel_state.cleanup(active_channels=active_channels)

        # Prompt-layer memory cache pruning — owned by PromptBuilder (P3)
        self._prompt_builder.prune_expired_memory(now)

        # Agent lifecycle: kill stuck agents, log stale ones
        if hasattr(self, "agent_manager"):
            self.agent_manager.check_health()

        # Clean up old attachment workspaces
        try:
            from .attachments import AttachmentProcessor
            cfg = self.config.attachments if hasattr(self.config, "attachments") else None
            proc = AttachmentProcessor(**({"temp_dir": cfg.temp_directory, "retention_hours": cfg.retention_hours} if cfg else {}))
            proc.cleanup_old_workspaces()
        except Exception:
            pass

        # Clean up loop-agent bridge records for finished loops
        if hasattr(self, "loop_agent_bridge"):
            for loop_id in list(self.loop_agent_bridge._loop_agents):
                loop_info = self.loop_manager._loops.get(loop_id)
                if not loop_info or loop_info.status != "running":
                    self.loop_agent_bridge.cleanup_loop(loop_id)

        # Batch-index channel logs into FTS (runs every ~5 min with cache cleanup)
        if self._fts_index and hasattr(self, "channel_logger"):
            try:
                self.channel_logger.index_to_fts(self._fts_index)
            except Exception:
                pass

    def _maybe_cleanup_caches(self) -> None:
        """Run cache cleanup if enough time has passed since the last run."""
        try:
            now = time.time()
            cs = self._channel_state
            if now - cs.last_cleanup > cs.cleanup_interval:
                self._cleanup_stale_caches()
                cs.last_cleanup = now
        except Exception:
            pass  # Non-critical — don't break message processing

    def _track_recent_action(
        self, tool_name: str, tool_input: dict, result_preview: str,
        elapsed_ms: int, channel_id: str | None = None,
    ) -> None:
        """Record a tool execution for conversational context injection.

        Actions are stored per-channel so that channel A's tool results
        don't leak into channel B's system prompt.  Each entry carries a
        real timestamp for time-based expiry (1 hour).
        """
        if not channel_id:
            return  # No channel context — nothing to inject later

        from datetime import datetime
        ts = datetime.now().strftime("%H:%M")
        safe_input = _scrub_tool_input_for_storage(tool_name, tool_input)
        inp_summary = ", ".join(f"{k}={v}" for k, v in safe_input.items() if isinstance(v, str))
        if len(inp_summary) > 100:
            inp_summary = inp_summary[:100] + "..."
        status = "OK" if "error" not in result_preview.lower()[:50] else "ERROR"
        entry = f"- [{ts}] `{tool_name}`({inp_summary}) → {status} ({elapsed_ms}ms)"

        self._channel_state.track_recent_action(channel_id, entry)

    def _register_commands(self) -> None:
        @self.tree.command(name="status", description="Show Odin bot status")
        async def cmd_status(interaction: discord.Interaction) -> None:
            if not self._is_allowed_user(interaction.user):
                await interaction.response.send_message("Access denied.", ephemeral=True)
                return
            voice_status = ""
            if self.voice_manager:
                if self.voice_manager.is_connected:
                    ch = self.voice_manager.current_channel
                    voice_status = f"\nVoice: Connected to **{ch.name}**" if ch else "\nVoice: Connected"
                else:
                    voice_status = "\nVoice: Not connected"
            provider_cfg = getattr(self.config, "llm_provider", None)
            active = provider_cfg.active_provider if provider_cfg else "codex"
            client = self.llm_client
            if client:
                model = getattr(client, "model", "unknown")
                llm_status = f"LLM: **{active}** ({model})"
            else:
                llm_status = "LLM: not configured"
            codex_configured = "yes" if self.codex_client else "no"
            ollama_configured = "yes" if self.ollama_client else "no"
            kimi_configured = "yes" if self.kimi_client else "no"
            await interaction.response.send_message(
                f"**Odin Status**\n"
                f"{llm_status}\n"
                f"Codex: {codex_configured} | Ollama: {ollama_configured} | Kimi: {kimi_configured}\n"
                f"{voice_status}"
            )

        @self.tree.command(name="reset", description="Reset conversation history")
        async def cmd_reset(interaction: discord.Interaction) -> None:
            if not self._is_allowed_user(interaction.user):
                await interaction.response.send_message("Access denied.", ephemeral=True)
                return
            self.sessions.reset(str(interaction.channel_id))
            await interaction.response.send_message("Conversation history cleared.")

        @self.tree.command(name="reload", description="Reload context files")
        async def cmd_reload(interaction: discord.Interaction) -> None:
            if not self._is_allowed_user(interaction.user):
                await interaction.response.send_message("Access denied.", ephemeral=True)
                return
            self.context_loader.reload()
            self._invalidate_prompt_caches()
            self._system_prompt = self._build_system_prompt()
            await interaction.response.send_message("Context files reloaded.")

        @self.tree.command(name="purge", description="Delete recent messages in this channel")
        @app_commands.describe(count="Number of messages to delete (default 100, max 500)")
        async def cmd_purge(interaction: discord.Interaction, count: int = 100) -> None:
            if not self._is_allowed_user(interaction.user):
                await interaction.response.send_message("Access denied.", ephemeral=True)
                return
            count = min(count, 500)
            await interaction.response.defer(ephemeral=True)
            deleted = await interaction.channel.purge(limit=count)
            self.sessions.reset(str(interaction.channel_id))
            await interaction.followup.send(
                f"Deleted {len(deleted)} messages and reset conversation history.",
                ephemeral=True,
            )

        @self.tree.command(name="usage", description="Show token usage details")
        async def cmd_usage(interaction: discord.Interaction) -> None:
            if not self._is_allowed_user(interaction.user):
                await interaction.response.send_message("Access denied.", ephemeral=True)
                return
            await interaction.response.send_message(
                "**Usage**\n"
                "All backends are subscription-based (free).\n"
                "Codex: ChatGPT subscription\n"
                "Claude Code: Max subscription"
            )


        @self.tree.command(name="stop", description="Stop Odin's current task in this channel")
        async def cmd_stop(interaction: discord.Interaction) -> None:
            if not self._is_allowed_user(interaction.user):
                await interaction.response.send_message("Access denied.", ephemeral=True)
                return
            channel_id = str(interaction.channel_id)
            event = self._cancel_events.setdefault(channel_id, asyncio.Event())
            active = self._channel_state.active_requests.get(channel_id)
            if active:
                event.set()
                await interaction.response.send_message("Stopping current task...", ephemeral=True)
            else:
                await interaction.response.send_message("No active task in this channel.", ephemeral=True)

    def _is_cancelled(self, channel_id: str) -> bool:
        ev = self._cancel_events.get(channel_id)
        return bool(ev and ev.is_set())

    def _is_allowed_user(self, user: discord.User | discord.Member) -> bool:
        if not self.config.discord.allowed_users:
            return True
        return str(user.id) in self.config.discord.allowed_users

    def _is_allowed_channel(self, channel_id: int) -> bool:
        if not self.config.discord.channels:
            return True
        return str(channel_id) in self.config.discord.channels

    def _check_for_secrets(self, content: str) -> bool:
        return any(p.search(content) for p in SECRET_SCRUB_PATTERNS)

    # ------------------------------------------------------------------
    # commands.Bot lifecycle hooks (cog loading + prefix)
    # ------------------------------------------------------------------

    async def _resolve_prefix(
        self, bot: commands.Bot, message: discord.Message
    ) -> list[str]:
        """Return applicable prefixes; mention also accepted."""
        base = ["!"]  # OdinBot's default prefix; can be made config-driven later
        return commands.when_mentioned_or(*base)(bot, message)

    async def _codex_call(
        self, *, messages: list, system: str, tools: list,
        user_message: str = "",
        user_id: str = "", channel_id: str = "", tools_used: list[str] | None = None,
        **kwargs,
    ):
        """Guarded LLM call — owned by LLMGateway (P4)."""
        return await self._llm_gateway.call_with_tools(
            messages=messages, system=system, tools=tools,
            user_message=user_message, user_id=user_id, channel_id=channel_id,
            tools_used=tools_used, **kwargs,
        )


    # Successful operations below this tool count are routine — reflection
    # is reserved for failures, corrections, explicit asks, and substantive work.
    _REFLECT_MIN_TOOLS = 5
    _REFLECT_CORRECTION_MARKERS = (
        "remember this", "remember that", "that's wrong", "thats wrong",
        "that is wrong", "not what i asked", "you should have", "incorrect,",
        "no, ", "actually,",
    )

    def _should_reflect_on_operation(
        self, user_request: str, tools_used: list[str],
        is_error: bool, tool_details: list[dict],
    ) -> bool:
        """Reflection triggers: failure, mid-operation tool errors (recovery),
        user corrections, explicit remember-this, or substantive operations.
        Routine successes (ls/git-status class) skip reflection entirely."""
        if is_error:
            return True
        if any(d.get("error") for d in tool_details):
            return True
        req = user_request.lower()
        if any(marker in req for marker in self._REFLECT_CORRECTION_MARKERS):
            return True
        return len(tools_used) >= self._REFLECT_MIN_TOOLS

    def _maybe_loop_reflect(
        self, *, loop_id: str, prompt: str, outcome: str, is_error: bool,
        failure_class: str, error_text: str, tool_details: list[dict],
        user_id: str | None,
    ) -> None:
        """Gated reflection for loop iterations (fire-and-forget)."""
        try:
            if not getattr(self.config.learning, "loop_reflection_enabled", True):
                return
            if not hasattr(self, "reflector") or not tool_details:
                return
            if is_error or any(d.get("error") for d in tool_details):
                effective_error = error_text or next(
                    (d["result"] for d in tool_details if d.get("error")), "",
                )
                if not failure_class:
                    from ..observability.failure_classes import classify_failure
                    failure_class = classify_failure(effective_error)["class"]
                should, reason = self._loop_reflection_gate.evaluate(
                    loop_id, is_error=True,
                    failure_class=failure_class, error_text=effective_error,
                )
            else:
                should, reason = self._loop_reflection_gate.evaluate(
                    loop_id, is_error=False,
                )
            if not should:
                log.debug("Loop reflection suppressed (%s) for %s", reason, loop_id)
                return
            log.info("Loop reflection triggered (%s) for %s", reason, loop_id)
            fire_and_forget(self.reflector.reflect_on_operation(
                user_request=f"[autonomous loop {loop_id}] {prompt[:300]}",
                tools_used=[d["tool"] for d in tool_details][:20],
                tool_details=tool_details,
                final_response=outcome,
                is_error=is_error,
                user_id=user_id,
            ), name="loop_reflection")
        except Exception:  # noqa: BLE001 — reflection must never break a loop
            log.debug("Loop reflection wiring failed (non-fatal)", exc_info=True)

    async def _operational_reflection(
        self, user_request: str, tools_used: list[str],
        response: str, is_error: bool, user_id: str | None,
        tool_details: list[dict] | None = None,
    ) -> None:
        """Fire-and-forget post-operation reflection — selective, with real
        tool inputs/results from the operation instead of bare tool names."""
        try:
            if not tool_details:
                tool_details = [{"tool": t} for t in tools_used[:20]]
            if not self._should_reflect_on_operation(
                user_request, tools_used, is_error, tool_details,
            ):
                log.debug(
                    "Skipping reflection for routine operation (%d tools, no errors)",
                    len(tools_used),
                )
                return
            await self.reflector.reflect_on_operation(
                user_request=user_request,
                tools_used=tools_used,
                tool_details=tool_details,
                final_response=response,
                is_error=is_error,
                user_id=user_id,
            )
        except Exception as e:
            log.debug("Operational reflection failed (non-fatal): %s", e)

    async def _save_turn_trajectory(
        self, trajectory, *, error: str = "", final_response: str = "",
        tools_used: list[str] | None = None, trace=None,
    ) -> None:
        """Persist the turn trajectory as JSONL. Non-fatal on error."""
        if self.trajectory_saver is None:
            return
        try:
            if trace is not None:
                trajectory.context_trace = trace.finalize()
            from datetime import datetime, timezone
            trajectory.timestamp = datetime.now(timezone.utc).isoformat()
            if error:
                trajectory.is_error = True
                trajectory.final_response = error
            elif final_response:
                trajectory.final_response = final_response
            if tools_used is not None:
                trajectory.tools_used = list(tools_used)
            # Aggregate token counts from iterations
            trajectory.total_input_tokens = sum(it.input_tokens for it in trajectory.iterations)
            trajectory.total_output_tokens = sum(it.output_tokens for it in trajectory.iterations)
            await self.trajectory_saver.save(trajectory)
        except Exception:
            log.exception("TrajectorySaver.save failed (non-fatal)")

    async def _emit_lifecycle_event(self, event_type: str, payload: dict) -> None:
        """Emit a lifecycle event to registered outbound webhooks (no-op if disabled)."""
        if self.outbound_webhook_dispatcher is None:
            return
        try:
            from ..notifications.outbound_webhooks import build_event_payload
            full_payload = build_event_payload(event_type=event_type, data=payload)
            await self.outbound_webhook_dispatcher.dispatch_fire_and_forget(
                event_type=event_type, payload=full_payload,
            )
        except Exception:
            log.exception("Outbound webhook dispatch failed (non-fatal)")

    async def setup_hook(self) -> None:
        """Called once before connecting to the gateway.

        Runs startup diagnostics first so any critical config error surfaces
        BEFORE we try to connect, then loads moderation cogs, then resumes
        the audit log HMAC chain (if signing is enabled), then sets the bot
        ready bit on the dispatcher (if registered).
        """
        # Startup diagnostics — never blocks startup, just logs what we found.
        try:
            report = self._run_startup_diagnostics(yaml_config=self.config)
            self.startup_report = report
            for r in report.results:
                level = log.warning if not r.passed else log.info
                msg = f"startup diagnostic [{r.name}]: {r.detail}"
                if r.recommendation:
                    msg += f" → {r.recommendation}"
                level(msg)
            failed = sum(1 for r in report.results if not r.passed)
            if failed:
                log.warning(
                    "%d/%d startup diagnostic(s) failed — see preceding lines",
                    failed, len(report.results),
                )
        except Exception:
            log.exception("Startup diagnostics failed unexpectedly (non-fatal)")

        # Resume HMAC chain so signing picks up after a restart
        if self.audit_signer is not None:
            try:
                await self.audit.initialize_chain()
            except Exception:
                log.exception("Failed to initialize audit HMAC chain")

        for ext in INITIAL_EXTENSIONS:
            try:
                await self.load_extension(ext)
                log.info("Loaded extension %s", ext)
            except commands.ExtensionError:
                log.exception("Failed to load extension %s", ext)

    async def close(self) -> None:
        """Graceful shutdown: stop services, persist state, then disconnect.

        Teardown order and the getattr guards live in
        wiring.shutdown_services — the mirror of wiring.build_services.
        """
        log.info("Shutting down OdinBot…")
        await shutdown_services(self)
        await super().close()
        log.info("OdinBot shutdown complete")

    _active_tasks: int = 0
    _last_status_update: float = 0.0
    _STATUS_DEBOUNCE: float = 5.0
    _TOOL_STATUS_LABELS: dict[str, str] = {
        "run_command": "Running a command",
        "run_script": "Executing a script",
        "run_command_multi": "Commanding multiple hosts",
        "read_file": "Reading a file",
        "write_file": "Writing to disk",
        "generate_file": "Forging an artifact",
        "post_file": "Delivering a file",
        "claude_code": "Thinking expensively",
        "analyze_image": "Staring at a picture",
        "analyze_pdf": "Suffering through a PDF",
        "web_search": "Googling it like a mortal",
        "fetch_url": "Fetching a URL",
        "http_probe": "Checking a pulse",
        "browser_read_page": "Reading a webpage",
        "browser_screenshot": "Screenshotting a page",
        "browser_read_table": "Parsing a table",
        "browser_click": "Clicking things",
        "browser_fill": "Filling out a form",
        "browser_evaluate": "Running browser JS",
        "docker_ops": "Wrangling containers",
        "kubectl": "Talking to Kubernetes",
        "terraform_ops": "Terraforming",
        "git_ops": "Doing git things",
        "manage_process": "Babysitting a process",
        "validate_action": "Checking if it's still alive",
        "schedule_task": "Scheduling a future problem",
        "list_schedules": "Reviewing pending regrets",
        "update_schedule": "Adjusting the timeline",
        "delete_schedule": "Cancelling a fate",
        "start_loop": "Starting a watch",
        "stop_loop": "Ending a watch",
        "list_loops": "Checking active watches",
        "parse_time": "Deciphering mortal time",
        "spawn_agent": "Delegating the suffering",
        "wait_for_agents": "Waiting on subordinates",
        "get_agent_results": "Collecting the findings",
        "list_agents": "Checking on the crew",
        "kill_agent": "Terminating a subordinate",
        "delegate_task": "Handing off work",
        "list_tasks": "Reviewing the queue",
        "cancel_task": "Killing a task",
        "send_to_agent": "Messaging a subordinate",
        "spawn_loop_agents": "Deploying a patrol",
        "collect_loop_agents": "Recalling the patrol",
        "memory_manage": "Remembering, reluctantly",
        "search_audit": "Reviewing the audit log",
        "search_history": "Digging through history",
        "search_knowledge": "Consulting the knowledge base",
        "ingest_document": "Ingesting a document",
        "bulk_ingest_knowledge": "Bulk ingesting documents",
        "list_knowledge": "Listing known documents",
        "delete_knowledge": "Forgetting on purpose",
        "create_skill": "Teaching myself a new trick",
        "edit_skill": "Refining a skill",
        "delete_skill": "Unlearning",
        "list_skills": "Listing skills",
        "enable_skill": "Enabling a skill",
        "disable_skill": "Shelving a skill",
        "invoke_skill": "Running a skill",
        "install_skill": "Installing a skill",
        "export_skill": "Exporting a skill",
        "skill_status": "Checking a skill",
        "read_channel": "Reading the channel",
        "add_reaction": "Reacting",
        "create_poll": "Creating a poll",
        "purge_messages": "Purging messages",
        "generate_image": "Bothering the GPU",
        "manage_list": "Managing a list",
        "set_permission": "Adjusting permissions",
        "issue_tracker": "Filing paperwork",
    }

    async def _set_status(self, text: str | None = None, task_start: bool = False, task_end: bool = False) -> None:
        """Set Discord presence. Tracks active task count to avoid clearing while work remains."""
        if task_start:
            self._active_tasks += 1
        if task_end:
            self._active_tasks = max(0, self._active_tasks - 1)
        now = time.monotonic()
        is_finish = task_end and self._active_tasks == 0
        if not is_finish and now - self._last_status_update < self._STATUS_DEBOUNCE:
            return
        try:
            if self._active_tasks > 0 and text:
                activity = discord.Activity(type=discord.ActivityType.watching, name=text)
                await self.change_presence(activity=activity, status=discord.Status.online)
            elif self._active_tasks == 0:
                await self.change_presence(activity=None, status=discord.Status.online)
            self._last_status_update = now
        except Exception:
            log.debug("Presence update failed (non-fatal)", exc_info=True)

    async def on_ready(self) -> None:
        log.info("Logged in as %s (ID: %s)", self.user, self.user.id)
        log.info("Tools loaded: %d definitions", len(get_tool_definitions()))
        # Prune stale sessions loaded from disk.  load() reads ALL persisted
        # session files regardless of age; pruning here removes expired ones
        # immediately instead of waiting for the first user message.
        pruned = self.sessions.prune()
        if pruned:
            log.info("Startup: pruned %d stale sessions", pruned)
        # Sync commands to each guild (instant) instead of global (up to 1hr)
        for guild in self.guilds:
            self.tree.copy_global_to(guild=guild)
            await self.tree.sync(guild=guild)
            log.info("Slash commands synced to guild: %s", guild.name)
        self.scheduler.start(self._on_scheduled_task, self._on_schedule_failure)
        if self._vector_store:
            fire_and_forget(self._backfill_archives(), name="backfill_archives")
        # Start proactive monitoring if configured
        if hasattr(self, "infra_watcher") and self.infra_watcher:
            self.infra_watcher.start()
        await self._set_status(None, task_end=True)

    async def _backfill_archives(self) -> None:
        """Backfill semantic search index and FTS5 with existing archive files."""
        try:
            archive_dir = self.sessions.persist_dir / "archive"
            count = await self._vector_store.backfill(archive_dir, self._embedder)
            if count:
                log.info("Backfilled %d archive sessions into vector store", count)
            else:
                log.info("Vector store up to date")
            # Backfill knowledge FTS from existing data
            if self._knowledge_store and self._fts_index:
                kb_count = await asyncio.to_thread(self._knowledge_store.backfill_fts)
                if kb_count:
                    log.info("Backfilled %d knowledge chunks into FTS index", kb_count)
        except Exception as e:
            log.error("Archive backfill failed: %s", e)

    async def on_voice_state_update(
        self,
        member: discord.Member,
        before: discord.VoiceState,
        after: discord.VoiceState,
    ) -> None:
        """Auto-join voice channel when an allowed user joins."""
        if not self.voice_manager or not self.config.voice.auto_join:
            return
        if member.bot:
            return
        if not self._is_allowed_user(member):
            return
        # User joined a voice channel (was not in one before)
        if before.channel is None and after.channel is not None:
            if not self.voice_manager.is_connected:
                log.info("Auto-joining voice channel %s (user: %s)", after.channel.name, member)
                await self.voice_manager.join_channel(after.channel)
        # User left — if we're in that channel and it's now empty (minus bot), leave
        elif before.channel is not None and after.channel is None:
            if self.voice_manager.is_connected and self.voice_manager.current_channel == before.channel:
                humans = [m for m in before.channel.members if not m.bot]
                if not humans:
                    log.info("All users left voice channel, disconnecting")
                    await self.voice_manager.leave_channel()

    async def on_message(self, message: discord.Message) -> None:
        # Passive channel log — every guild message, including our own, before any filtering
        self.channel_logger.log_message(message)

        # Never respond to our own messages
        if message.author == self.user:
            return

        # Secret scrubbing runs BEFORE anything that inspects the message
        # content (cog prefix commands, executor flow). If a user posts a
        # credential, we delete + scrub first so nothing else sees it.
        pre_content = (message.content or "").strip()
        if pre_content and self._check_for_secrets(pre_content):
            try:
                self.sessions.scrub_secrets(str(message.channel.id), pre_content)
            except Exception:
                log.exception("scrub_secrets failed in early pre-filter")
            try:
                await message.delete()
                deleted = True
            except discord.NotFound:
                # Message already gone (user deleted it, auto-mod beat us, …).
                # Not a failure — just skip the delete and still warn the author.
                deleted = True
            except discord.Forbidden:
                deleted = False
            except discord.HTTPException:
                # Rate limits, network glitches — treat as "could not delete"
                # so the user sees the fallback notice and we don't crash
                # on_message and skip the notification.
                deleted = False
            try:
                if deleted:
                    await message.channel.send(
                        f"{message.author.mention} I detected a secret/credential in "
                        "your message. I've deleted it and scrubbed it from my history."
                    )
                else:
                    await message.channel.send(
                        f"{message.author.mention} I detected a secret/credential in "
                        "your message. I've scrubbed it from my history. "
                        "I couldn't delete the message — please delete it manually."
                    )
            except Exception:
                log.exception("Failed to send secret-scrub notice (non-fatal)")
            return

        # Cog-registered prefix commands (moderation, fun, utility, etc.) handle
        # their own auth via cog decorators (is_moderator, is_admin, …) and are
        # orthogonal to the executor's allowed_users / channels gates. Running
        # process_commands here (after secret scrubbing, before executor gates)
        # lets cogs work regardless of executor allowlist without exposing
        # secrets to command handlers.
        await self.process_commands(message)

        if message.author.bot:
            # Ignore specific bot IDs unless they explicitly @mention us in message text
            if str(message.author.id) in self.config.discord.ignore_bot_ids:
                mention_str = f"<@{self.user.id}>" if self.user else ""
                if mention_str not in (message.content or ""):
                    return
            # Allow specific webhooks (via ALLOWED_WEBHOOK_IDS env var)
            is_allowed_webhook = message.webhook_id and str(message.webhook_id) in _ALLOWED_WEBHOOK_IDS
            _bot_gid = str(message.guild.id) if message.guild else None
            _bot_cid = str(message.channel.id)
            _respond_bots = self.channel_config.should_respond_to_bots(
                _bot_gid, _bot_cid, self.config.discord.respond_to_bots,
            )
            if not is_allowed_webhook and not _respond_bots:
                return

        is_test_webhook = message.webhook_id and str(message.webhook_id) in _ALLOWED_WEBHOOK_IDS
        if not is_test_webhook and not self._is_allowed_user(message.author):
            return
        if not self._is_allowed_channel(message.channel.id):
            return

        # Per-channel enabled check (channel override > guild default > global)
        guild_id = str(message.guild.id) if message.guild else None
        channel_id_str = str(message.channel.id)
        if not self.channel_config.is_enabled(guild_id, channel_id_str):
            return

        # Per-channel require_mention check (channel override > guild default > global)
        # Bot messages skip this gate — they go into the buffer and the mention
        # check happens after all segments are collected.
        _require_mention = self.channel_config.should_require_mention(
            guild_id, channel_id_str, self.config.discord.require_mention,
        )
        if _require_mention:
            is_dm = not hasattr(message.channel, "guild") or message.channel.guild is None
            is_bot_buffered = message.author.bot and self.channel_config.should_respond_to_bots(
                guild_id, channel_id_str, self.config.discord.respond_to_bots,
            )
            if not is_dm and not is_bot_buffered:
                is_mentioned = self.user and (
                    self.user.mentioned_in(message)
                    or f"<@{self.user.id}>" in (message.content or "")
                )
                if not is_mentioned:
                    return

        log.info(
            "on_message fired: msg_id=%s channel=%s content=%r",
            message.id, message.channel.id, message.content[:80],
        )

        # Dedup: skip if we've already processed this exact message
        if self._channel_state.seen_message(message.id):
            log.warning("Duplicate on_message for msg_id=%s, skipping", message.id)
            return

        # Buffer rapid-fire bot messages (e.g. code blocks split across messages)
        # Wait 2s after each bot message to see if more follow, then process all
        # at once. Use the per-channel override (not the raw global flag) so this
        # agrees with the mention gate above — otherwise a channel that opts out
        # of bot replies still gets its bot messages buffered and answered.
        if message.author.bot and self.channel_config.should_respond_to_bots(
            guild_id, channel_id_str, self.config.discord.respond_to_bots,
        ):
            buf_key = (str(message.channel.id), str(message.author.id))
            if buf_key not in self._channel_state.bot_msg_buffer:
                self._channel_state.bot_msg_buffer[buf_key] = []
            buf = self._channel_state.bot_msg_buffer[buf_key]
            if len(buf) >= self._channel_state.bot_msg_buffer_max:
                log.warning("Bot buffer full (%d msgs) for %s, dropping oldest", len(buf), buf_key)
                buf.pop(0)
            buf.append(scrub_output_secrets(message.content))

            # Cancel previous timer for this bot+channel
            if buf_key in self._channel_state.bot_msg_tasks:
                self._channel_state.bot_msg_tasks[buf_key].cancel()

            # Set new timer — process after delay of silence
            async def _flush_bot_buffer(key, orig_msg):
                await asyncio.sleep(self._channel_state.bot_msg_buffer_delay)
                parts = self._channel_state.bot_msg_buffer.pop(key, [])
                self._channel_state.bot_msg_tasks.pop(key, None)
                if not parts:
                    return
                combined = combine_bot_messages(parts)
                log.info("Bot buffer flushed: %d messages from %s combined", len(parts), orig_msg.author)
                # require_mention for bots: check if ANY buffered part mentions us
                _bot_guild_id = str(orig_msg.guild.id) if orig_msg.guild else None
                _bot_channel_id = str(orig_msg.channel.id)
                _bot_require = self.channel_config.should_require_mention(
                    _bot_guild_id, _bot_channel_id, self.config.discord.require_mention,
                )
                if _bot_require and self.user:
                    mention_str = f"<@{self.user.id}>"
                    mention_nick = f"<@!{self.user.id}>"
                    if not any(mention_str in p or mention_nick in p for p in parts):
                        log.info("Bot buffer discarded: no mention found in %d messages from %s", len(parts), orig_msg.author)
                        return
                # Strip mention from combined content
                if self.user:
                    combined = combined.replace(f"<@{self.user.id}>", "").strip()
                    combined = combined.replace(f"<@!{self.user.id}>", "").strip()
                if combined:
                    await self._handle_message(orig_msg, combined, image_blocks=[])

            self._channel_state.bot_msg_tasks[buf_key] = asyncio.create_task(
                _flush_bot_buffer(buf_key, message)
            )
            return

        content = message.content
        # Strip the bot mention from the message if present
        if self.user and self.user.mentioned_in(message):
            content = content.replace(f"<@{self.user.id}>", "").strip()
            content = content.replace(f"<@!{self.user.id}>", "").strip()

        # Handle file attachments — append file contents to the message
        attachment_text, image_blocks = await self._process_attachments(message, content)
        if attachment_text:
            attachment_text = scrub_output_secrets(attachment_text)
            content = f"{content}\n\n{attachment_text}" if content else attachment_text

        if not content and not image_blocks:
            return

        if not content:
            content = "(see attached image)"

        # Check for secrets, scrub from history and delete the message.
        if self._check_for_secrets(content):
            self.sessions.scrub_secrets(str(message.channel.id), content)
            # Deletion can fail for more than just Forbidden — the message may
            # already be gone (NotFound) or we may be rate-limited
            # (HTTPException). Catching only Forbidden let those propagate out
            # of on_message, so the user never even got the scrub notice.
            deleted = False
            try:
                await message.delete()
                deleted = True
            except discord.NotFound:
                deleted = True  # already gone — treat as deleted
            except (discord.Forbidden, discord.HTTPException) as e:
                log.warning("Could not delete secret-bearing message: %s", e)
            note = (
                "I've deleted it and scrubbed it from my history." if deleted else
                "I've scrubbed it from my history. I couldn't delete the "
                "message — please delete it manually."
            )
            try:
                await message.channel.send(
                    f"{message.author.mention} I detected a secret/credential "
                    f"in your message. {note}"
                )
            except discord.HTTPException:
                pass  # best-effort notice; the scrub already happened
            return

        # Voice commands via natural language (short, direct commands only)
        if self.voice_manager:
            _voice_lower = content.lower().strip()
            _voice_words = _voice_lower.split()
            # Only treat short messages (≤8 words) as voice commands to avoid
            # false positives on pasted changelogs or longer messages
            if len(_voice_words) <= 8:
                _join_words = {"join", "hop", "get in", "come to", "connect", "enter", "hop in", "come in"}
                _leave_words = {"leave", "disconnect", "get out", "exit", "go away", "hop out"}
                _voice_context = {"voice", "vc", "channel", "call", "chat"}
                _has_voice_context = any(w in _voice_lower for w in _voice_context)

                if _has_voice_context and any(w in _voice_lower for w in _join_words):
                    if isinstance(message.author, discord.Member) and message.author.voice:
                        result = await self.voice_manager.join_channel(message.author.voice.channel)
                        await message.reply(result)
                    else:
                        await message.reply("You need to be in a voice channel first.")
                    return
                if _has_voice_context and any(w in _voice_lower for w in _leave_words):
                    result = await self.voice_manager.leave_channel()
                    await message.reply(result)
                    return

        # If bot is in a voice channel, auto-attach voice callback for TTS
        vc_callback = None
        if self.voice_manager and self.voice_manager.is_connected:
            async def vc_callback(response: str) -> None:
                await self.voice_manager.speak(response)

        await self._handle_message(message, content, image_blocks=image_blocks, voice_callback=vc_callback)

    async def _process_attachments(self, message: discord.Message, content: str = "") -> tuple[str, list[dict]]:
        """Process attachments via AttachmentProcessor.

        Returns (inline_text, image_blocks).
        """
        if not message.attachments:
            return "", []

        from .attachments import AttachmentProcessor, infer_attachment_intent

        cfg = self.config.attachments if hasattr(self.config, "attachments") else None
        processor = AttachmentProcessor(
            **({"temp_dir": cfg.temp_directory,
                "inline_max_bytes": cfg.inline_text_max_bytes,
                "preview_max_chars": cfg.preview_max_chars,
                "large_preview_chars": cfg.large_preview_chars,
                "archive_max_bytes": cfg.archive_max_bytes,
                "archive_max_files": cfg.archive_max_files,
                "archive_extract_max_bytes": cfg.archive_extract_max_bytes,
                "archive_preview_total_chars": cfg.archive_preview_total_chars,
                "archive_preview_file_max_bytes": cfg.archive_preview_file_max_bytes,
                "image_max_bytes": cfg.image_max_bytes,
                "pdf_max_bytes": cfg.pdf_max_bytes,
                "retention_hours": cfg.retention_hours,
                } if cfg else {})
        )

        recent_assistant = None
        session = self.sessions.get(str(message.channel.id))
        if session and session.messages:
            for m in reversed(session.messages):
                if m.role == "assistant":
                    recent_assistant = m.content
                    break

        intent = infer_attachment_intent(content, recent_assistant)

        result = await processor.process(
            message.attachments,
            channel_id=str(message.channel.id),
            message_id=str(message.id),
            intent=intent,
        )

        if result.warnings:
            for w in result.warnings:
                log.warning("Attachment warning: %s", w)

        return result.inline_text, result.image_blocks

    async def _on_voice_transcription(
        self, text: str, member: discord.Member, transcript_channel: discord.TextChannel,
    ) -> None:
        """Handle transcribed voice input — route through message pipeline."""
        log.info("Voice transcription from %s: %r", member, text[:80])

        # Post the transcription to the transcript channel
        await transcript_channel.send(f"**{member.display_name}** (voice): {text}")

        # Create a proxy message for the pipeline
        proxy = VoiceMessageProxy(
            author=member,
            channel=transcript_channel,
            id=int(time.time() * 1000),
            guild=member.guild,
        )

        # Define voice callback for dual output (speak + text)
        async def voice_callback(response: str) -> None:
            if self.voice_manager:
                await self.voice_manager.speak(response)

        await self._handle_message(
            proxy, text,
            voice_callback=voice_callback,
        )

    async def _handle_message(
        self, message: discord.Message, content: str, *, image_blocks: list[dict] | None = None,
        voice_callback: Callable | None = None,
    ) -> None:
        channel_id = str(message.channel.id)

        # Acquire per-channel lock — messages queue naturally via the lock
        lock = self._channel_locks.setdefault(channel_id, asyncio.Lock())

        async with lock:
            # Thread context inheritance: if this is a thread with no session yet,
            # seed it with the parent channel's summary so context carries over.
            # Must be inside the lock to prevent two concurrent messages from
            # both seeding the thread and to safely access parent session state.
            if isinstance(message.channel, discord.Thread) and message.channel.parent:
                parent_id = str(message.channel.parent.id)
                parent_name = getattr(message.channel.parent, "name", parent_id)
                thread_session = self.sessions.get_or_create(channel_id)
                if not thread_session.messages:
                    parent_session = self.sessions.get_or_create(parent_id)
                    if parent_session.messages or parent_session.summary:
                        # Copy the parent's summary and last few messages for context
                        # Mark as inherited so the LLM distinguishes thread-native
                        # context from parent-channel context
                        _inherited_tag = f"[INHERITED FROM #{parent_name}]"
                        if parent_session.summary:
                            thread_session.summary = f"{_inherited_tag} {parent_session.summary}"
                        else:
                            thread_session.summary = ""
                        # Include recent parent messages as additional context
                        recent = parent_session.messages[-6:]
                        if recent:
                            parent_context = "\n".join(
                                f"{m.role}: {m.content[:300]}" for m in recent
                            )
                            _ctx_block = f"{_inherited_tag} Parent channel context:\n{parent_context}"
                            if thread_session.summary:
                                thread_session.summary += f"\n{_ctx_block}"
                            else:
                                thread_session.summary = _ctx_block
                        log.info("Thread %s inherited context from parent #%s (%s)", channel_id, parent_name, parent_id)

            await self._handle_message_inner(
                message, content, channel_id,
                image_blocks=image_blocks or [],
                voice_callback=voice_callback,
            )

    async def _handle_message_inner(
        self, message: discord.Message, content: str, channel_id: str,
        *, image_blocks: list[dict] | None = None,
        voice_callback: Callable | None = None,
    ) -> None:
        user_id = str(message.author.id)
        # Prefix with display name so the LLM knows who's talking
        display_name = message.author.display_name or message.author.name
        tagged_content = f"[{display_name}]: {content}"
        self.sessions.add_message(channel_id, "user", tagged_content, user_id=user_id)

        try:
            is_guest = self.permissions.is_guest(str(message.author.id))
            already_sent = False
            is_error = False
            tools_used: list[str] = []
            handoff = False

            if is_guest:
                # Guest tier: chat only, no tools
                log.info("Guest tier user %s, chat route (no tools)", message.author.id)
                # Guests use full history (with compaction)
                history = await self.sessions.get_history_with_compaction(channel_id)
                if image_blocks:
                    history = list(history)
                    if history and history[-1]["role"] == "user":
                        last_msg = history[-1]
                        text_content = last_msg["content"] if isinstance(last_msg["content"], str) else str(last_msg["content"])
                        history[-1] = {
                            "role": "user",
                            "content": image_blocks + [{"type": "text", "text": text_content}],
                        }
                    log.info("Attached %d image(s) to message for Claude vision", len(image_blocks))
                if self.llm_client:
                    chat_prompt = self._build_chat_system_prompt(
                        channel=message.channel, user_id=user_id, query=content,
                    )
                    try:
                        response = await self.llm_client.chat(
                            messages=history,
                            system=chat_prompt,
                        )
                        if not response:
                            response = _EMPTY_RESPONSE_FALLBACK
                        log.info("LLM response: %r", response[:200])
                    except Exception as e:
                        log.warning("LLM chat failed: %s", e)
                        response = "Chat is temporarily unavailable. Please try again in a moment."
                        is_error = True
                else:
                    log.info("No chat backend configured for guest user")
                    response = "Chat backend is not configured."
                    is_error = True
            else:
                # Everyone else: Codex with ALL tools
                if not self.llm_client:
                    await self._send_with_retry(
                        message,
                        "No LLM provider available. Please try again later.",
                    )
                    self.sessions.remove_last_message(channel_id, "user")
                    return
                _trace = self._new_context_trace()
                if _trace is not None:
                    with _trace.phase("system_prompt"):
                        _sp = self._build_system_prompt(
                            channel=message.channel, user_id=user_id,
                            query=content, trace=_trace,
                        )
                else:
                    _sp = self._build_system_prompt(
                        channel=message.channel, user_id=user_id, query=content,
                    )
                log.info("Routing to Codex with tools")
                # Use abbreviated history to reduce poisoning from stale responses
                # (get_task_history handles compaction internally)
                # Pass current message content for relevance scoring —
                # older messages unrelated to the current query are dropped
                if _trace is not None:
                    with _trace.phase("history"):
                        task_history = await self.sessions.get_task_history(
                            channel_id, max_messages=160, current_query=content,
                            trace=_trace,
                        )
                else:
                    task_history = await self.sessions.get_task_history(
                        channel_id, max_messages=160, current_query=content,
                    )
                if image_blocks and task_history and task_history[-1]["role"] == "user":
                    last = task_history[-1]
                    text = last["content"] if isinstance(last["content"], str) else str(last["content"])
                    task_history[-1] = {
                        "role": "user",
                        "content": image_blocks + [{"type": "text", "text": text}],
                    }
                    log.info("Attached %d image(s) to message for Claude vision", len(image_blocks))
                try:
                    response, already_sent, is_error, tools_used, handoff = await self._process_with_tools(
                        message, task_history, system_prompt_override=_sp, trace=_trace,
                    )
                except asyncio.TimeoutError as codex_err:
                    log.warning("Codex tool loop timed out: %s", codex_err)
                    response = f"Tool execution timed out: {codex_err}"
                    is_error = True
                except Exception as codex_err:
                    log.error("Codex tool loop unexpected error: %s", codex_err, exc_info=True)
                    response = f"Tool execution failed: {codex_err}"
                    is_error = True
                    handoff = False
                # Skill requested Codex handoff — route skill result to Codex for response
                if handoff and self.llm_client and not is_error:
                    log.info("Skill handoff to Codex for response")
                    _skill_response = response  # Save before overwriting
                    chat_prompt = self._build_chat_system_prompt(
                        channel=message.channel, user_id=user_id, query=content,
                    )
                    # Fetch full history for handoff (compaction already ran in get_task_history)
                    history = self.sessions.get_history(channel_id)
                    codex_messages = list(history) + [
                        {"role": "assistant", "content": f"[Tool result: {response}]"},
                        {"role": "user", "content": "Respond to the user based on the tool result above. Be conversational and helpful."},
                    ]
                    try:
                        response = await self.llm_client.chat(
                            messages=codex_messages,
                            system=chat_prompt,
                        )
                        if not response:
                            log.warning("Codex handoff returned empty, using skill result directly")
                            response = _skill_response
                        already_sent = False
                    except Exception as e:
                        log.warning("Codex handoff failed, using skill result directly: %s", e)
                        response = _skill_response
                        already_sent = False
        except (discord.HTTPException, discord.Forbidden, asyncio.TimeoutError) as e:
            await self._set_status(None, task_end=True)
            log.error("Discord/network error processing message: %s", e, exc_info=True)
            leaked = self._pending_files.pop(channel_id, None)
            if leaked:
                log.warning("Cleaned %d leaked pending file(s) for channel %s", len(leaked), channel_id)
            await self._send_with_retry(message, scrub_response_secrets(f"Something went wrong: {e}"))
            self.sessions.remove_last_message(channel_id, "user")
            return
        except asyncio.CancelledError:
            # CancelledError is a BaseException, so it bypasses the Exception
            # handlers here — without this the just-appended user turn is left
            # orphaned in history (no assistant reply). Clean up synchronously
            # (no awaits, which could re-raise mid-cancellation) and re-raise so
            # the cancellation still propagates.
            self._pending_files.pop(channel_id, None)
            self.sessions.remove_last_message(channel_id, "user")
            raise
        except Exception as e:
            await self._set_status(None, task_end=True)
            log.error("Unexpected error processing message: %s", e, exc_info=True)
            leaked = self._pending_files.pop(channel_id, None)
            if leaked:
                log.warning("Cleaned %d leaked pending file(s) for channel %s", len(leaked), channel_id)
            await self._send_with_retry(message, scrub_response_secrets(f"Something went wrong: {e}"))
            self.sessions.remove_last_message(channel_id, "user")
            return

        await self._set_status(None, task_end=True)

        # Scrub secrets from LLM response before logging, saving, or sending.
        # Tool output is already scrubbed (scrub_output_secrets in _run_tool),
        # but the LLM may echo, reconstruct, or hallucinate secrets in its
        # natural-language response text.
        response = scrub_response_secrets(response)

        log.info("Final response to send: %r", response[:200])
        if not is_error:
            if tools_used:
                # Summarize verbose tool-loop responses before persisting
                # to prevent long multi-tool outputs from dominating history
                history_response = summarize_tool_response(response, tools_used)
            else:
                # Save text-only (chat) responses too — the LLM needs to
                # remember what it said.  Truncate to keep history lean.
                history_response = response[:CHAT_RESPONSE_MAX_CHARS] if len(response) > CHAT_RESPONSE_MAX_CHARS else response
            self.sessions.add_message(channel_id, "assistant", history_response)
            self.sessions.prune()
            self._maybe_cleanup_caches()
            try:
                await asyncio.to_thread(self.sessions.save)
            except Exception as save_err:
                log.warning("Session save failed: %s", save_err)
        else:
            # Save a sanitized error marker instead of the full error response.
            # The user sees the full error on Discord, but raw refusals and
            # fabrications are NOT persisted to prevent context poisoning.
            if tools_used:
                sanitized = (
                    f"[Previous request used tools ({', '.join(tools_used[:5])}) "
                    f"but encountered an error. The user may ask to retry.]"
                )
            else:
                sanitized = "[Previous request encountered an error before tool execution.]"
            self.sessions.add_message(channel_id, "assistant", sanitized)
            self.sessions.prune()
            try:
                await asyncio.to_thread(self.sessions.save)
            except Exception as save_err:
                log.warning("Session save failed: %s", save_err)

        # Post-operation reflection — learn from what actually happened, including
        # failures. Must run for both the success and error paths (previously this
        # was nested under the success branch, so is_error was never observed).
        if tools_used:
            # Pop synchronously inside the channel-locked request body so a
            # fast follow-up request can never swap details under the
            # fire-and-forget reflection task.
            op_details = self._last_op_details.pop(channel_id, None)
            fire_and_forget(self._operational_reflection(
                content, tools_used, response, is_error, user_id,
                tool_details=op_details,
            ), name="operational_reflection")

        if voice_callback:
            await voice_callback(response)
        if not already_sent:
            # _send_chunked picks up pending files and attaches them to the
            # first message — text + file arrive as one Discord message.
            await self._send_chunked(message, response)
        else:
            # Streamed response already on Discord — post pending files separately
            pending = self._pending_files.pop(channel_id, [])
            if pending:
                discord_files = [
                    discord.File(io.BytesIO(data), filename=fname)
                    for data, fname in pending
                ]
                try:
                    await message.channel.send(files=discord_files)
                except Exception as e:
                    log.warning("Failed to send pending skill files: %s", e)

    _CLASSIFIER_SYSTEM_PROMPT = (
        "You are a completion judge. A user asked an AI assistant to do something. "
        "The assistant called some tools, then wrote a response. Your job: decide "
        "if the user's requested outcome was actually achieved.\n\n"
        "COMPLETE means:\n"
        "- The user's full request was addressed (not just part of it)\n"
        "- The exact artifact asked for was produced, not a plausible-shaped substitute\n"
        "- The assistant is not promising to do more work\n"
        "- A failure report after genuinely trying counts as COMPLETE\n\n"
        "INCOMPLETE means:\n"
        "- The assistant only did part of what was asked (e.g., built but didn't deploy)\n"
        "- The assistant is describing work it still plans to do\n"
        "- The assistant is reporting partial progress with more steps remaining\n"
        "- The response is shaped like an answer but doesn't contain the specific "
        "  artifact requested (e.g., asked for the generated code; got a description of it)\n"
        "- The assistant closes by offering MORE work ('I could also…', 'would you like…') "
        "  instead of finishing the requested work\n\n"
        'If INCOMPLETE, briefly state what\'s missing after a colon.\n'
        'Examples: "INCOMPLETE: deployment not performed", "INCOMPLETE: verification step missing", '
        '"INCOMPLETE: described the synthesized runbook but did not include its source"\n'
        'If COMPLETE, just say: "COMPLETE"'
    )

    async def _classify_completion(
        self,
        user_message: str,
        response_text: str,
        tools_used: list[str],
    ) -> tuple[bool, str]:
        """Judge whether the assistant's response fully addresses the user's request.

        Uses the same CodexClient (same OAuth, same API) to make a lightweight
        classifier call.  Fail-open: any error/timeout/ambiguity → COMPLETE.

        Short-circuit: if ``start_loop`` was called, the user's request was to
        *schedule* recurring work, not to complete it now.  The loop runs
        asynchronously in the background, so treat the scheduling itself as
        completion.  Without this, the classifier reads the user's goal (e.g.
        "run 50 iterations") and keeps flagging the response INCOMPLETE,
        forcing redundant in-band execution of the loop's body.

        Returns (is_complete, reason).  reason is non-empty only for INCOMPLETE.
        """
        if not self.llm_client:
            return True, ""

        if "start_loop" in tools_used:
            log.info(
                "Completion classifier: start_loop called — loop runs in "
                "background, treating as COMPLETE"
            )
            return True, ""

        classifier_user_msg = (
            f"User's task: {user_message}\n\n"
            f"Tools called: {', '.join(tools_used)}\n\n"
            f"Assistant's response: {response_text}"
        )

        try:
            raw = await asyncio.wait_for(
                self.llm_client.chat(
                    messages=[{"role": "user", "content": classifier_user_msg}],
                    system=self._CLASSIFIER_SYSTEM_PROMPT,
                ),
                timeout=10,
            )
        except Exception as e:
            log.warning("Completion classifier: error/timeout (%s) — fail-open to COMPLETE", e)
            return True, ""

        return self._parse_classifier_response(raw)

    @staticmethod
    def _parse_classifier_response(raw: str) -> tuple[bool, str]:
        """Parse the classifier's raw text into (is_complete, reason).

        Checks INCOMPLETE first (more specific), then COMPLETE, else fail-open.
        """
        stripped = (raw or "").strip()
        upper = stripped.upper()

        if upper.startswith("INCOMPLETE"):
            # Extract reason after first colon, dash, or em-dash
            reason = ""
            for sep in (":", " - ", " — ", "—"):
                idx = stripped.find(sep)
                if idx != -1:
                    reason = stripped[idx + len(sep):].strip()
                    break
            log.info(
                "Completion classifier: INCOMPLETE reason=%r (raw: %r)",
                reason, stripped[:80],
            )
            return False, reason

        if upper.startswith("COMPLETE"):
            log.info("Completion classifier: COMPLETE (raw: %r)", stripped[:80])
            return True, ""

        # Ambiguous / gibberish → fail-open
        log.info(
            "Completion classifier: ambiguous response, treating as COMPLETE (raw: %r)",
            stripped[:80],
        )
        return True, ""

    async def _process_with_tools(
        self,
        message: discord.Message,
        history: list[dict],
        system_prompt_override: str | None = None,
        trace=None,
    ) -> tuple[str, bool, bool, list[str], bool]:
        """Process a message with Codex tool loop.

        Returns (text, already_sent, is_error, tools_used, handoff):
        - text: the response text
        - already_sent: True if the response was streamed to Discord already
        - is_error: True if an error occurred (API failed, max iterations,
          circuit breaker). Error responses are saved to history for
          continuation ("keep going"). Tool memory is not recorded.
        - tools_used: list of tool names called during this loop
        - handoff: True if the response should be handed off to another handler
        """
        system_prompt = system_prompt_override or self._system_prompt
        tools = self._merged_tool_definitions() if self.config.tools.enabled else None
        messages = list(history)

        # Insert context separator between history and the current user request
        # so Codex evaluates tools fresh instead of repeating patterns from history
        is_bot_message = getattr(message.author, "bot", False) and self.config.discord.respond_to_bots
        from .tool_loop_helpers import (
            build_request_preamble,
            compute_request_id,
            current_request_time,
        )
        req_hash = compute_request_id(message.content if isinstance(message.content, str) else str(message.id))
        req_time = current_request_time()
        user_display = getattr(message.author, "display_name", str(message.author))
        # Build channel context line for spatial awareness
        _ch = message.channel
        _ch_name = getattr(_ch, "name", None) or str(_ch.id)
        _is_thread = isinstance(_ch, discord.Thread)
        if _is_thread and getattr(_ch, "parent", None):
            channel_ctx = f"Channel: #{_ch.parent.name} → thread: {_ch_name}"
        else:
            channel_ctx = f"Channel: #{_ch_name}"
        preamble = build_request_preamble(
            request_id=req_hash,
            request_time=req_time,
            user_display=user_display,
            user_id=message.author.id,
            message_id=message.id,
            channel_description=channel_ctx,
            has_history=len(messages) > 1,
            from_another_bot=is_bot_message,
        )
        if len(messages) > 1:
            messages.insert(-1, preamble)
        else:
            # No history — still provide message ID + channel context
            messages.insert(0, preamble)

        # Track which tools are used during this loop for tool memory
        # Local variable (not instance attr) to avoid cross-channel contamination
        tools_used_in_loop: list[str] = []

        # Continuation tracking: how many times we've injected continuation prompts
        # Allow up to 3 continuations to support multi-step tasks
        continuation_count = 0
        max_continuations = 3

        # Each first-response detector gets one retry via a flag.
        # Using flags instead of iteration==0 allows cascading detection:
        # if fabrication fires on iter 0 and hedging fires on iter 1,
        # both get caught.  The `not tools_used_in_loop` guard already
        # ensures these only fire before any tools have been called.
        fabrication_retried = False
        promise_retried = False
        unavail_retried = False
        hedging_retried = False
        code_hedging_retried = False
        premature_failure_retried = False

        user_id = str(message.author.id)

        # Filter tools based on user permission tier (skip for test webhooks)
        is_test_wh = message.webhook_id and str(message.webhook_id) in _ALLOWED_WEBHOOK_IDS
        if tools is not None and not is_test_wh:
            tools = self.permissions.filter_tools(user_id, tools)
            # Apply API token allowed_tools scope if present
            api_allowed = getattr(message, "allowed_tools", None)
            if api_allowed is not None and tools:
                allowed_set = set(api_allowed)
                tools = [t for t in tools if t["name"] in allowed_set]

        # Collect image blocks from analyze_image calls for vision injection
        pending_image_blocks: list[dict] = []

        chat_cap = self.config.tools.max_tool_iterations_chat
        log.info("Tool loop starting: %d tools available, %d messages in history, cap=%d",
                 len(tools) if tools else 0, len(messages), chat_cap)

        await self._set_status("Working...", task_start=True)

        # Per-turn StuckLoopTracker — detects repeating tool-call sequences and
        # nudges the LLM out of cycles before the iteration cap forces an exit.
        stuck_tracker = self.stuck_loop_tracker_cls()

        # Per-turn trajectory accumulator — populated each iteration, saved at end.
        from ..trajectories.saver import TrajectoryTurn, ToolIteration, stored_tool_results
        _result_store_cap = int(getattr(
            getattr(self.config, "observability", None), "max_tool_result_chars", 2000,
        ) or 2000)
        if trace is not None:
            provider_cfg = getattr(self.config, "llm_provider", None)
            trace.provider(
                name=getattr(provider_cfg, "active_provider", "codex") if provider_cfg else "codex",
                model=getattr(self.llm_client, "model", "") or "",
            )
        _op_tool_details: list[dict] = []
        _turn_ctx = get_turn() or {}
        _trajectory = TrajectoryTurn(
            message_id=str(getattr(message, "id", "")),
            channel_id=str(getattr(message.channel, "id", "")),
            user_id=user_id,
            user_name=str(getattr(message.author, "display_name", "")),
            source=str(_turn_ctx.get("source") or getattr(message, "_odin_source", "discord")),
        )
        self._record_user_content(_trajectory, getattr(message, "content", "") or "")
        # No explicit reset — each message handler runs in its own asyncio
        # task, so the context var dies with the task. (The loop manager
        # resets its own stamp explicitly around each iteration callback.)
        set_turn(
            turn_id=_trajectory.message_id or None,
            source=_trajectory.source,
            channel_id=_trajectory.channel_id,
            **{k: v for k, v in _turn_ctx.items() if k in ("loop_id", "loop_iteration")},
        )

        # Post-mutation validation state — persists across iterations
        _pending_validations: list[str] = []
        _validation_required: bool = False
        _validation_retries: int = 0
        _MAX_VALIDATION_RETRIES = 2

        # Per-request cancellation via /stop command
        _ch_id = str(message.channel.id)
        _cancel = self._cancel_events.setdefault(_ch_id, asyncio.Event())
        _req_id = req_hash
        self._channel_state.set_active_request(_ch_id, _req_id)

        def _clear_active():
            self._channel_state.clear_active_request(_ch_id, _req_id)

        def _stopped(where: str) -> tuple[str, bool, bool, list[str], bool]:
            log.info("Task stopped by /stop in channel %s at %s", _ch_id, where)
            _clear_active()
            suffix = ""
            if _pending_validations or _validation_required:
                suffix = " Pending post-action validation was not run."
            tools_note = f" Tools used: {', '.join(tools_used_in_loop)}." if tools_used_in_loop else ""
            return f"Task stopped by user.{tools_note}{suffix}", False, False, tools_used_in_loop, False

        for iteration in range(chat_cap):
            if _cancel.is_set():
                return _stopped("iteration_start")
            # Context auto-compression — when accumulated tool iterations push
            # the message list over the configured budget, summarise older
            # iterations into a single text message and keep the most recent N
            # iterations intact.
            if self.context_compressor is not None and iteration > 0:
                try:
                    from ..llm.context_compressor import compress_tool_context, estimate_message_chars
                    if estimate_message_chars(messages) > self.context_compressor.max_context_chars:
                        messages, _saved = compress_tool_context(
                            messages,
                            max_context_chars=self.context_compressor.max_context_chars,
                            keep_recent=self.context_compressor.keep_recent_iterations,
                        )
                        log.info("context_compressor: trimmed %d chars", _saved)
                except Exception:
                    log.exception("context_compressor failed (non-fatal); continuing with full context")

            # Show typing indicator while waiting for LLM response.
            # Typing is best-effort — isolate typing setup failures from
            # LLM call failures so we don't misclassify provider errors.
            typing_cm = None
            try:
                typing_cm = message.channel.typing()
                await typing_cm.__aenter__()
            except (discord.HTTPException, ConnectionError, OSError) as typing_err:
                log.warning("Typing indicator failed (non-fatal): %s", typing_err)
                typing_cm = None

            _channel_id = str(message.channel.id)
            try:
                llm_resp = await self._codex_call(
                    messages=messages, system=system_prompt, tools=tools or [],
                    user_message=getattr(message, "content", "") or "",
                    user_id=user_id, channel_id=_channel_id, tools_used=tools_used_in_loop,
                )
            except CircuitOpenError as coe:
                wait_secs = min(coe.retry_after, 90.0)
                log.info("Circuit breaker open for %s, waiting %.0fs for recovery", coe.provider, wait_secs)
                await asyncio.sleep(wait_secs)
                try:
                    llm_resp = await self._codex_call(
                        messages=messages, system=system_prompt, tools=tools or [],
                        user_id=user_id, channel_id=_channel_id, tools_used=tools_used_in_loop,
                    )
                except Exception as retry_err:
                    await self._save_turn_trajectory(_trajectory, error=str(retry_err), trace=trace)
                    _clear_active()
                    return f"LLM API error (circuit breaker recovery failed): {retry_err}", False, True, tools_used_in_loop, False
            except Exception as api_err:
                err_msg = str(api_err) or f"{type(api_err).__name__} (no message)"
                log.error("LLM API call failed: %s", err_msg, exc_info=True)
                await self._save_turn_trajectory(_trajectory, error=err_msg, trace=trace)
                _clear_active()
                return f"LLM API error: {err_msg}", False, True, tools_used_in_loop, False
            finally:
                if typing_cm is not None:
                    try:
                        await typing_cm.__aexit__(None, None, None)
                    except Exception:
                        pass

            if _cancel.is_set():
                return _stopped("after_llm")

            # Record this iteration's tool calls + LLM text into the trajectory and stuck tracker
            iter_tool_calls = [
                {"id": tc.id, "name": tc.name, "input": tc.input}
                for tc in (llm_resp.tool_calls or [])
            ]
            _trajectory.iterations.append(ToolIteration(
                iteration=iteration,
                tool_calls=iter_tool_calls,
                llm_text=llm_resp.text or "",
                input_tokens=llm_resp.input_tokens,
                output_tokens=llm_resp.output_tokens,
            ))
            stuck_tracker.record(iter_tool_calls)
            if stuck_tracker.check():
                if stuck_tracker.warned:
                    log.warning("Stuck loop confirmed after warning — terminating tool loop")
                    await self._save_turn_trajectory(_trajectory, trace=trace)
                    await self._emit_lifecycle_event("loop.stuck", {
                        "channel_id": str(message.channel.id),
                        "iteration": iteration,
                        "tools_used": tools_used_in_loop,
                    })
                    _clear_active()
                    return (
                        f"Detected a stuck tool-call cycle after {iteration + 1} iterations. "
                        f"Stopping to avoid burning the iteration budget on a repeat pattern."
                    ), False, True, tools_used_in_loop, False
                else:
                    stuck_tracker.warned = True
                    log.info("Stuck pattern detected — injecting nudge")
                    messages.append({
                        "role": "developer",
                        "content": (
                            "You appear to be repeating the same tool-call sequence. "
                            "Try a different approach or summarise progress and stop."
                        ),
                    })
                    continue
            # Gate on actual parsed tool calls, not is_tool_use (which is also
            # true when stop_reason=="tool_use" with zero calls). The sibling
            # loop already uses this stricter form; matching it prevents an
            # empty-tool_use response from skipping finalization and re-looping.
            if not llm_resp.tool_calls:
                if _cancel.is_set():
                    return _stopped("before_validation")
                # Enforce pending validation before allowing final response
                if _validation_required and _validation_retries < _MAX_VALIDATION_RETRIES:
                    _validation_retries += 1
                    log.warning("Validation required but model returned text — forcing continuation (attempt %d)", _validation_retries)
                    messages.append({
                        "role": "developer",
                        "content": (
                            "[VALIDATION REQUIRED] You have pending post-action validation. "
                            "Call validate_action before responding to the user."
                        ),
                    })
                    continue

                # Fabrication detection: if no tools were called and the
                # response looks like it fabricated results, retry once.
                if (
                    not fabrication_retried
                    and not tools_used_in_loop
                    and detect_fabrication(llm_resp.text or "", tools_used_in_loop)
                ):
                    log.warning(
                        "Fabrication detected — retrying with correction"
                    )
                    fabrication_retried = True
                    messages.append(_FABRICATION_RETRY_MSG)
                    continue

                if (
                    not promise_retried
                    and not tools_used_in_loop
                    and detect_promise_without_action(llm_resp.text or "", tools_used_in_loop)
                ):
                    log.warning(
                        "Promise without action detected — retrying"
                    )
                    promise_retried = True
                    messages.append(_PROMISE_RETRY_MSG)
                    continue

                if (
                    not unavail_retried
                    and not tools_used_in_loop
                    and detect_tool_unavailable(llm_resp.text or "", tools_used_in_loop)
                ):
                    log.warning(
                        "Tool-unavailability fabrication detected — retrying"
                    )
                    unavail_retried = True
                    messages.append(_TOOL_UNAVAIL_RETRY_MSG)
                    continue

                # Hedging detection: fires for ALL messages — Odin is an
                # executor, not a menu system.
                if (
                    not hedging_retried
                    and not tools_used_in_loop
                    and detect_hedging(llm_resp.text or "", tools_used_in_loop)
                ):
                    log.warning(
                        "Hedging detected — retrying"
                    )
                    hedging_retried = True
                    messages.append(_HEDGING_RETRY_MSG)
                    continue

                if (
                    not code_hedging_retried
                    and not tools_used_in_loop
                    and detect_code_hedging(llm_resp.text or "", tools_used_in_loop)
                ):
                    log.warning(
                        "Code-block hedging detected — retrying"
                    )
                    code_hedging_retried = True
                    messages.append(_CODE_HEDGING_RETRY_MSG)
                    continue

                # Premature failure: tools were called but gave up after one error
                if (
                    not premature_failure_retried
                    and tools_used_in_loop
                    and detect_premature_failure(llm_resp.text or "", tools_used_in_loop)
                ):
                    log.warning(
                        "Premature failure detected — retrying"
                    )
                    premature_failure_retried = True
                    messages.append(_FAILURE_RETRY_MSG)
                    continue

                # Tier 3: Completion classifier — uses LLM to judge whether
                # the user's request was fully addressed.
                if (
                    tools_used_in_loop
                    and continuation_count < max_continuations
                ):
                    is_complete, reason = await self._classify_completion(
                        message.content, llm_resp.text or "", tools_used_in_loop,
                    )
                    if not is_complete:
                        log.info(
                            "Completion classifier: INCOMPLETE (%d/%d) "
                            "after %d tool calls — injecting continuation",
                            continuation_count + 1, max_continuations,
                            len(tools_used_in_loop),
                        )
                        # Do NOT append the incomplete response as an assistant
                        # message — inject the continuation nudge alone so
                        # the model responds fresh with tool calls.
                        if reason:
                            messages.append({
                                "role": "developer",
                                "content": f"You are not done. {reason}. Continue with tool calls now.",
                            })
                        else:
                            messages.append(_CONTINUATION_MSG)
                        continuation_count += 1
                        continue

                _final = llm_resp.text or _EMPTY_RESPONSE_FALLBACK
                await self._save_turn_trajectory(
                    _trajectory, final_response=_final, tools_used=tools_used_in_loop,
                    trace=trace,
                )
                _clear_active()
                return _final, False, False, tools_used_in_loop, False

            # Build internal-format assistant content from LLMResponse
            assistant_content: list[dict] = []
            if llm_resp.text:
                assistant_content.append({"type": "text", "text": llm_resp.text})
            for tc in llm_resp.tool_calls:
                assistant_content.append({
                    "type": "tool_use", "id": tc.id,
                    "name": tc.name, "input": tc.input,
                })
            messages.append({"role": "assistant", "content": assistant_content})

            tool_calls = llm_resp.tool_calls
            tools_used_in_loop.extend(t.name for t in tool_calls)

            # Execute tools in parallel
            async def _run_tool(block):
                nonlocal system_prompt, pending_image_blocks
                tool_name = block.name
                tool_input = block.input
                log.info("Tool call: %s(%s)", tool_name, tool_input)
                # The provider could not parse the model's arguments — do NOT
                # run the tool with a silently-empty input; bounce the error
                # back so the model retries with valid arguments.
                if getattr(block, "parse_error", None):
                    log.warning("Tool call %s not executed: %s", tool_name, block.parse_error)
                    return {
                        "type": "tool_result", "tool_use_id": block.id,
                        "content": (
                            f"Error: {block.parse_error}. The tool was NOT executed — "
                            "re-issue the call with valid JSON arguments."
                        ),
                    }
                # Central RBAC gate: Discord-native tools, skills, and MCP tools are
                # dispatched below WITHOUT going through ToolExecutor.execute() (the only
                # place check_permission runs). permissions.filter_tools is advisory
                # (offer-time) only, so enforce permission here for EVERY tool.
                _uid = str(message.author.id)
                _rbac_denial = self.tool_executor.check_permission(tool_name, _uid)
                if isinstance(_rbac_denial, str) and _rbac_denial:  # str = deny, None = allow
                    log.warning("RBAC gate denied tool %s for user %s", tool_name, _uid)
                    return {"type": "tool_result", "tool_use_id": block.id, "content": _rbac_denial}
                await self._set_status(self._TOOL_STATUS_LABELS.get(tool_name, f"Running: {tool_name}"))

                try:
                    await self.audit.log_event(
                        event_type="tool_start",
                        action=tool_name,
                        actor=str(message.author.id),
                        channel_id=str(message.channel.id),
                        metadata={"tool_input_keys": list((tool_input or {}).keys()), "iteration": iteration},
                    )
                except Exception:
                    pass

                t0 = time.monotonic()
                error = None
                tool_result = None
                # Handle Discord-native tools
                try:
                    if self._native_tools.handles(tool_name):
                        result, _effects = await self._native_tools.dispatch(
                            tool_name, tool_input,
                            message=message, user_id=user_id,
                            skill_file_delivery="send",
                        )
                        if _effects.rebuild_system_prompt:
                            system_prompt = self._build_system_prompt(
                                channel=message.channel, user_id=user_id,
                            )
                    else:
                        tool_result = await self.tool_executor.execute(
                            tool_name, tool_input, user_id=user_id,
                        )
                        result = str(tool_result)
                except asyncio.TimeoutError as e:
                    error = str(e)
                    result = f"Tool {tool_name} timed out: {e}"
                    tool_result = None
                    log.warning("Tool %s timed out after %.1fs", tool_name, time.monotonic() - t0)
                except (ValueError, KeyError, TypeError) as e:
                    error = str(e)
                    result = f"Tool {tool_name} input error: {e}"
                    tool_result = None
                except Exception as e:
                    error = str(e)
                    result = f"Error executing {tool_name}: {e}"
                    tool_result = None
                    log.warning("Unexpected tool error for %s: %s", tool_name, e)

                elapsed_ms = int((time.monotonic() - t0) * 1000)

                # Handle special image block return from analyze_image
                if isinstance(result, dict) and "__image_block__" in result:
                    pending_image_blocks.append(result["__image_block__"])
                    result = f"[Image loaded. Analyze it with this instruction: {result['__prompt__']}]"

                # Scrub secrets from tool output
                result = scrub_output_secrets(result)

                # Use structured metadata from ToolResult when available
                if tool_result is not None:
                    elapsed_ms = tool_result.duration_ms or elapsed_ms
                    if tool_result.error and not error:
                        error = tool_result.error
                    if not tool_result.ok and not error:
                        error = "tool reported failure"
                    result = self._ensure_failure_visible(result, tool_result.ok)

                # Audit log — never crash tool execution on audit failure
                try:
                    scrubbed_input = _scrub_tool_input_for_storage(tool_name, {
                        k: scrub_output_secrets(str(v)) if isinstance(v, str) else v
                        for k, v in (tool_input or {}).items()
                    })
                    await self.audit.log_execution(
                        user_id=str(message.author.id),
                        user_name=str(message.author),
                        channel_id=str(message.channel.id),
                        tool_name=tool_name,
                        tool_input=scrubbed_input,
                        approved=True,
                        result_summary=result,
                        execution_time_ms=elapsed_ms,
                        error=error,
                        risk_level=tool_result.risk_level if tool_result else None,
                        risk_reason=tool_result.risk_reason if tool_result else None,
                    )
                    await self.audit.log_event(
                        event_type="tool_end",
                        action=tool_name,
                        actor=str(message.author.id),
                        channel_id=str(message.channel.id),
                        detail=result[:150],
                        metadata={"elapsed_ms": elapsed_ms, "error": error, "iteration": iteration},
                    )
                except Exception as audit_err:
                    log.warning("Audit log failed for %s: %s", tool_name, audit_err)

                # Track for conversational context
                try:
                    self._track_recent_action(
                        tool_name, tool_input, result[:200], elapsed_ms,
                        channel_id=str(message.channel.id),
                    )
                except Exception:
                    pass  # Non-critical tracking

                # Track mutations requiring post-action validation
                if tool_result is not None and tool_result.requires_validation and tool_result.ok:
                    _pending_validations.append(
                        f"{tool_name}: {tool_result.validation_reason}"
                    )

                # Truncate large outputs before sending back to the LLM.
                tool_content = truncate_tool_output(result)

                return {
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": tool_content,
                }

            # Run all tool calls concurrently with per-tool timeout
            tool_timeout = self.config.tools.tool_timeout_seconds

            async def _run_tool_with_timeout(block):
                t = 3660 if block.name in _LONG_TIMEOUT_TOOL_SET else tool_timeout
                try:
                    return await asyncio.wait_for(
                        _run_tool(block), timeout=t,
                    )
                except asyncio.TimeoutError:
                    error_msg = (
                        f"Tool '{block.name}' timed out after {t}s"
                    )
                    try:
                        await self.audit.log_execution(
                            user_id=str(message.author.id),
                            user_name=str(message.author),
                            channel_id=str(message.channel.id),
                            tool_name=block.name,
                            tool_input=_scrub_tool_input_for_storage(block.name, block.input),
                            approved=True,
                            result_summary=error_msg,
                            execution_time_ms=int(tool_timeout * 1000),
                            error=error_msg,
                        )
                    except Exception:
                        pass
                    return {
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": error_msg,
                    }

            async with message.channel.typing():
                tool_results = await asyncio.gather(
                    *[_run_tool_with_timeout(b) for b in tool_calls],
                )
            messages.append({"role": "user", "content": list(tool_results)})

            # Pair calls with results for post-operation reflection. Stashed
            # per iteration so every loop exit path leaves the latest state.
            _results_by_id = {
                r.get("tool_use_id"): r for r in tool_results if isinstance(r, dict)
            }
            for _tc in tool_calls:
                if trace is not None and _tc.id not in _results_by_id:
                    trace.warning(
                        "TOOL_RESULT_CONTINUATION_MISMATCH", "error",
                        f"tool {_tc.name} call has no paired result",
                    )
                _rcontent = str(_results_by_id.get(_tc.id, {}).get("content", ""))
                _op_tool_details.append({
                    "tool": _tc.name,
                    "input": _scrub_tool_input_for_storage(_tc.name, _tc.input),
                    "result": _rcontent[:300],
                    "error": _rcontent.lstrip().lower().startswith(
                        ("error", "[error", "failed", "traceback")),
                })
            self._last_op_details[str(message.channel.id)] = _op_tool_details

            # Persist results onto the iteration recorded before execution —
            # without this the saved trajectory has calls but no outcomes.
            if _trajectory.iterations:
                _trajectory.iterations[-1].tool_results = stored_tool_results(
                    tool_results, _result_store_cap,
                )

            if _cancel.is_set():
                return _stopped("after_tools")

            # Clear validation requirement if validate_action was called this iteration
            if _validation_required and "validate_action" in [t.name for t in tool_calls]:
                _validation_required = False
                _validation_retries = 0

            # Auto-inject validation instruction when mutations were detected
            if _pending_validations:
                mutation_list = "; ".join(_pending_validations)
                _validation_required = True
                messages.append({
                    "role": "developer",
                    "content": (
                        f"[AUTO-VALIDATE] Operational mutation(s) detected: {mutation_list}. "
                        "You MUST call validate_action now to confirm the change took effect. "
                        "Infer appropriate checks from the mutation type."
                    ),
                })
                _pending_validations.clear()

            # Inject pending image blocks as vision content for the next LLM call.
            # This reuses the same base64 image block format as _process_attachments.
            if pending_image_blocks:
                vision_content: list[dict] = list(pending_image_blocks)
                vision_content.append({
                    "type": "text",
                    "text": "The image(s) above were fetched by analyze_image. Describe and analyze them.",
                })
                messages.append({"role": "user", "content": vision_content})
                log.info("Injected %d image block(s) into tool loop messages", len(pending_image_blocks))
                pending_image_blocks.clear()

            # Check if all tool calls in this iteration are skills that want
            # Codex to handle the response instead of another tool-loop iteration.
            tool_names_this_round = [b.name for b in tool_calls]
            if (
                self.llm_client
                and all(self.skill_manager.should_handoff_to_codex(n) is True for n in tool_names_this_round)
            ):
                # Collect skill results as context for Codex
                skill_output = "\n".join(
                    r["content"] for r in tool_results if isinstance(r, dict)
                )
                _clear_active()
                return skill_output, False, False, tools_used_in_loop, True  # handoff=True

        _clear_active()
        log.warning(
            "Chat tool-iteration cap hit (%d) after %d tool calls; exiting loop",
            chat_cap, len(tools_used_in_loop),
        )
        _cap_msg = (
            f"Hit the chat tool-iteration cap ({chat_cap}) after "
            f"{len(tools_used_in_loop)} tool calls. Task may be partially "
            f"complete. Raise `tools.max_tool_iterations_chat` in config "
            f"(or via the web UI) if this happens often."
        )
        await self._save_turn_trajectory(
            _trajectory, final_response=_cap_msg, tools_used=tools_used_in_loop,
            trace=trace,
        )
        return _cap_msg, False, True, tools_used_in_loop, False

    @staticmethod
    def _ensure_failure_visible(result_text: str, ok: bool) -> str:
        """Make a structurally-failed tool result visible to the model.

        execute() carries ok=False on ToolResult, but the model only sees
        str(result) — the raw output. When that text lacks an error prefix
        (e.g. run_command_multi's per-host markdown aggregate wrapping a
        denial), the model reads a refused action as success. Prefix it.
        """
        if ok or result_text.lstrip().startswith(_ERROR_RESULT_PREFIXES):
            return result_text
        return f"Error (tool reported failure):\n{result_text}"

    @staticmethod
    def _detect_image_type(data: bytes) -> str | None:
        """Detect image media type from file magic bytes."""
        if data[:8] == b"\x89PNG\r\n\x1a\n":
            return "image/png"
        if data[:2] == b"\xff\xd8":
            return "image/jpeg"
        if data[:4] == b"GIF8":
            return "image/gif"
        if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
            return "image/webp"
        return None

    async def _handle_purge(self, message: discord.Message, inp: dict) -> str:
        return await self._channel_ops_tools._handle_purge(message, inp)


    async def _handle_browser_screenshot(self, message: discord.Message, inp: dict) -> str:
        """Take a browser screenshot and post it as a Discord image."""
        if not self.browser_manager:
            return "Browser automation is not enabled. Set browser.enabled=true in config."
        from ..tools.browser import handle_browser_screenshot
        try:
            text, screenshot_bytes = await handle_browser_screenshot(self.browser_manager, inp)
            if screenshot_bytes:
                discord_file = discord.File(io.BytesIO(screenshot_bytes), filename="screenshot.png")
                await message.channel.send(file=discord_file)
            return text
        except Exception as e:
            return f"Browser screenshot failed: {e}"

    async def _handle_generate_file(self, message: discord.Message, inp: dict) -> str:
        """Generate a file from content and post it as a Discord attachment."""
        filename = inp.get("filename", "output.txt")
        content = inp.get("content", "")
        caption = inp.get("caption", "")

        file_bytes = content.encode("utf-8")
        discord_file = discord.File(io.BytesIO(file_bytes), filename=filename)
        try:
            await message.channel.send(content=caption or None, file=discord_file)
            return f"File `{filename}` ({len(file_bytes)} bytes) attached to channel."
        except Exception as e:
            return f"Failed to post file: {e}"

    async def _handle_post_file(self, message: discord.Message, inp: dict) -> str:
        """Fetch a file from a host and post it to Discord.

        For localhost this reads directly from the local filesystem; for any
        other host it falls back to SSH + base64 stream (handles binary safely).
        Bypassing SSH for localhost avoids the host-key / ssh_key_path gauntlet
        when Odin wants to post its own files.
        """
        host_alias = inp.get("host")
        path = inp.get("path")
        caption = inp.get("caption", "")

        if not host_alias or not path:
            return "Both 'host' and 'path' are required."

        resolved = self.tool_executor._resolve_host(host_alias)
        if not resolved:
            return f"Unknown or disallowed host: {host_alias}"
        address, ssh_user, _os = resolved

        # Local fast path — no SSH gymnastics needed.
        from ..tools.ssh import is_local_address
        if is_local_address(address):
            try:
                with open(path, "rb") as f:
                    file_bytes = f.read()
            except FileNotFoundError:
                return f"File not found: {path}"
            except PermissionError:
                return f"Permission denied reading file: {path}"
            except OSError as exc:
                return f"Failed to read file: {exc}"
        else:
            # Fetch file as base64 via SSH (handles binary safely)
            import shlex
            safe_path = shlex.quote(path)
            ssh_args = [
                "ssh",
                "-i", self.config.tools.ssh_key_path,
                "-o", f"UserKnownHostsFile={self.config.tools.ssh_known_hosts_path}",
                "-o", "StrictHostKeyChecking=yes",
                "-o", "ConnectTimeout=10",
                "-o", "BatchMode=yes",
                f"{ssh_user}@{address}",
                f"base64 {safe_path}",
            ]
            try:
                proc = await asyncio.create_subprocess_exec(
                    *ssh_args,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )
                stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=30)
                if proc.returncode != 0:
                    return f"Failed to fetch file: {stderr.decode('utf-8', errors='replace').strip()}"
                file_bytes = base64.b64decode(stdout)
            except asyncio.TimeoutError:
                return "File fetch timed out (30s)."
            except Exception as e:
                return f"Failed to fetch file: {e}"

        if not file_bytes:
            return f"File not found or empty: {path}"

        # Size check (Discord limit: 25MB for non-boosted servers)
        if len(file_bytes) > 25 * 1024 * 1024:
            return f"File too large to post ({len(file_bytes) / 1024 / 1024:.1f} MB). Discord limit is 25 MB."

        filename = os.path.basename(path)
        try:
            file = discord.File(io.BytesIO(file_bytes), filename=filename)
            await message.channel.send(content=caption or None, file=file)
            return f"Posted `{filename}` ({len(file_bytes) / 1024:.1f} KB) to channel."
        except discord.HTTPException as e:
            return f"Failed to upload to Discord: {e}"

    # -- scheduling handlers: bodies live in native_tools/scheduling.py (P5b) --

    def _validate_schedule_payload(self, inp: dict) -> str | None:
        return self._scheduling_tools._validate_schedule_payload(inp)

    async def _handle_schedule_task(self, message: discord.Message, inp: dict) -> str:
        return await self._scheduling_tools._handle_schedule_task(message, inp)

    def _handle_list_schedules(self) -> str:
        return self._scheduling_tools._handle_list_schedules()

    async def _handle_update_schedule(self, inp: dict) -> str:
        return await self._scheduling_tools._handle_update_schedule(inp)

    async def _handle_delete_schedule(self, inp: dict) -> str:
        return await self._scheduling_tools._handle_delete_schedule(inp)

    def _handle_parse_time(self, inp: dict) -> str:
        return self._scheduling_tools._handle_parse_time(inp)


    # -- knowledge/history handlers: bodies in native_tools/knowledge.py (P5b) --

    async def _handle_search_history(self, inp: dict) -> str:
        return await self._knowledge_tools._handle_search_history(inp)

    async def _handle_search_knowledge(self, inp: dict) -> str:
        return await self._knowledge_tools._handle_search_knowledge(inp)

    async def _handle_ingest_document(self, inp: dict, uploader: str) -> str:
        return await self._knowledge_tools._handle_ingest_document(inp, uploader)

    async def _handle_bulk_ingest(self, inp: dict, uploader: str) -> str:
        return await self._knowledge_tools._handle_bulk_ingest(inp, uploader)

    def _handle_list_knowledge(self) -> str:
        return self._knowledge_tools._handle_list_knowledge()

    async def _handle_delete_knowledge(self, inp: dict) -> str:
        return await self._knowledge_tools._handle_delete_knowledge(inp)


    async def _handle_set_permission(self, caller_id: str, inp: dict) -> str:
        return await self._channel_ops_tools._handle_set_permission(caller_id, inp)


    async def _handle_search_audit(self, inp: dict) -> str:
        return await self._knowledge_tools._handle_search_audit(inp)


    async def _on_scheduled_digest(self, schedule: dict) -> None:
        """Run the daily infrastructure digest and post results."""
        channel_id = schedule.get("channel_id")
        if not channel_id:
            log.warning("Digest has no channel_id: %s", schedule["id"])
            return

        channel = self.get_channel(int(channel_id))
        if not channel:
            log.warning("Digest channel %s not found", channel_id)
            return

        log.info("Running daily digest for channel %s", channel_id)
        try:
            raw = await self._format_digest_raw()
        except Exception as e:
            log.error("Digest data collection failed: %s", e)
            await channel.send(scrub_response_secrets(f"**Daily Infrastructure Digest**\n\nFailed to collect data: {e}"))
            return

        # Summarize the digest — prefer Codex (free), fall back to raw truncation
        digest_messages = [{"role": "user", "content": f"Summarize this infrastructure status report concisely. Highlight any issues, warnings, or anomalies. If everything looks healthy, say so briefly.\n\n{raw}"}]
        digest_system = "You are a concise infrastructure report summarizer. Output a short summary with key findings."
        try:
            if self.llm_client:
                summary = await self.llm_client.chat(
                    messages=digest_messages, system=digest_system, max_tokens=500,
                )
            else:
                log.warning("No Codex client for digest summary, using raw")
                summary = raw[:3000]
        except Exception as e:
            log.warning("Digest summary failed, using raw: %s", e)
            summary = raw[:3000]

        await channel.send(scrub_response_secrets(f"**Daily Infrastructure Digest**\n\n{summary}"))

        # Audit log the digest
        await self.audit.log_execution(
            user_id="system",
            user_name="scheduler",
            channel_id=channel_id,
            tool_name="digest",
            tool_input={"schedule_id": schedule.get("id")},
            approved=True,
            result_summary=summary,
            execution_time_ms=0,
        )

    async def _format_digest_raw(self) -> str:
        """Collect raw infrastructure data for the digest."""
        tasks = []
        labels = []

        # Disk + memory checks on all hosts via run_command
        for host_alias in self.config.tools.hosts:
            tasks.append(self.tool_executor.execute(
                "run_command", {"host": host_alias, "command": "df -h --exclude-type=tmpfs --exclude-type=devtmpfs"},
            ))
            labels.append(f"Disk ({host_alias})")
            tasks.append(self.tool_executor.execute(
                "run_command", {"host": host_alias, "command": "free -h"},
            ))
            labels.append(f"Memory ({host_alias})")

        results = await asyncio.gather(*tasks, return_exceptions=True)

        sections = []
        for label, result in zip(labels, results):
            if isinstance(result, Exception):
                sections.append(f"### {label}\nERROR: {result}")
            else:
                sections.append(f"### {label}\n{str(result)[:800]}")

        return "\n\n".join(sections)

    def _resolve_mentions(self, text: str) -> str:
        """Replace @username with proper Discord <@ID> mentions."""
        def _replace(match: re.Match) -> str:
            name = match.group(1).lower()
            for guild in self.guilds:
                for member in guild.members:
                    if member.name.lower() == name or (member.nick and member.nick.lower() == name):
                        return f"<@{member.id}>"
            return match.group(0)  # leave unchanged if not found
        return re.sub(r"@(\w+)", _replace, text)

    async def _on_monitor_alert(self, message: str) -> None:
        """Callback fired by the infrastructure watcher when a threshold is crossed."""
        channel_id = self.config.monitoring.alert_channel_id
        if not channel_id:
            # Fall back to first configured channel
            if self.config.discord.channels:
                channel_id = self.config.discord.channels[0]
            else:
                log.warning("Monitor alert has no channel to send to: %s", message[:100])
                return

        channel = self.get_channel(int(channel_id))
        if not channel:
            log.warning("Monitor alert channel %s not found", channel_id)
            return

        try:
            await channel.send(scrub_response_secrets(message))
            log.info("Sent monitor alert to channel %s", channel_id)
        except Exception as e:
            log.error("Failed to send monitor alert: %s", e)

    # --- Background task delegation ---

    async def _handle_delegate_task(self, message: discord.Message, inp: dict) -> str:
        """Create and start a background task."""
        description = inp.get("description", "Background task")
        steps = inp.get("steps", [])

        if not steps or not isinstance(steps, list):
            return "No steps provided."
        if len(steps) > MAX_STEPS:
            return f"Too many steps ({len(steps)}). Maximum is {MAX_STEPS}."

        # Validate all steps have tool_name and required tool_input fields
        _REQUIRED_FIELDS = {
            "run_command": "command",
            "run_script": "script",
        }
        for i, step in enumerate(steps):
            if not isinstance(step, dict) or "tool_name" not in step:
                return f"Step {i}: must have 'tool_name'."
            tn = step["tool_name"]
            req = _REQUIRED_FIELDS.get(tn)
            if req:
                tool_input = step.get("tool_input", {})
                if req not in tool_input:
                    return (
                        f"Step {i + 1} ({tn}): missing '{req}' in tool_input. "
                        f"Each {tn} step MUST include tool_input with "
                        f"'{req}': 'your_shell_command'. "
                        f"Rebuild the steps with proper tool_input and retry."
                    )

        task = BackgroundTask(
            task_id=create_task_id(),
            description=description,
            steps=steps,
            channel=message.channel,
            requester=str(message.author),
            requester_id=str(message.author.id),
        )

        # Prune old completed tasks
        completed = [
            tid for tid, t in self._background_tasks.items()
            if t.status in ("completed", "failed", "cancelled")
        ]
        while len(completed) > self._channel_state.background_tasks_max:
            old = completed.pop(0)
            del self._background_tasks[old]

        self._background_tasks[task.task_id] = task

        # Build Codex callback for conversational follow-up
        codex_cb = None
        if self.llm_client:
            async def _codex_followup(messages: list[dict], system: str, max_tokens: int) -> str:
                return await self.llm_client.chat(
                    messages=messages, system=system, max_tokens=max_tokens,
                )
            codex_cb = _codex_followup

        # Launch in background
        async def _run():
            try:
                await run_background_task(
                    task, self.tool_executor, self.skill_manager,
                    knowledge_store=self._knowledge_store,
                    embedder=self._embedder,
                    audit_logger=self.audit,
                    codex_callback=codex_cb,
                )
            except Exception as e:
                log.error("Background task %s crashed: %s", task.task_id, e, exc_info=True)
                task.status = "failed"

        task._asyncio_task = asyncio.create_task(_run())

        return (
            f"Background task started (ID: `{task.task_id}`): **{description}** "
            f"({len(steps)} steps). Progress will be posted to this channel."
        )

    def _handle_list_tasks(self, inp: dict | None = None) -> str:
        """List background tasks, or get detailed results for a specific task."""
        if not self._background_tasks:
            return "No background tasks."

        task_id = (inp or {}).get("task_id")

        # Detailed view for a specific task
        if task_id:
            task = self._background_tasks.get(task_id)
            if not task:
                return f"No task found with ID `{task_id}`."
            lines = [
                f"**{task.description}** [{task.status}]",
                f"ID: `{task.task_id}` | {len(task.results)}/{len(task.steps)} steps",
                "",
            ]
            for r in task.results:
                icon = {"ok": "+", "error": "!", "skipped": "-", "cancelled": "x"}.get(r.status, "?")
                lines.append(f"[{icon}] **Step {r.index + 1} ({r.description})** ({r.elapsed_ms}ms):")
                lines.append(r.output if r.output else "(no output)")
                lines.append("")
            text = "\n".join(lines)
            if len(text) > 3800:
                text = text[:3800] + "\n... (truncated, full results were posted in the progress message)"
            return text

        # Overview of all tasks
        lines = []
        for tid, t in self._background_tasks.items():
            done = len(t.results)
            total = len(t.steps)
            ok = sum(1 for r in t.results if r.status == "ok")
            errors = sum(1 for r in t.results if r.status == "error")
            lines.append(
                f"- `{tid}` [{t.status}] **{t.description}** "
                f"({done}/{total} steps, {ok} ok, {errors} errors)"
            )
        return "\n".join(lines)

    def _handle_cancel_task(self, inp: dict) -> str:
        """Cancel a running background task."""
        task_id = inp.get("task_id", "")
        task = self._background_tasks.get(task_id)
        if not task:
            return f"No task found with ID `{task_id}`."
        if task.status != "running":
            return f"Task `{task_id}` is not running (status: {task.status})."
        task.cancel()
        return f"Cancellation requested for task `{task_id}`."

    def _handle_start_loop(self, message: discord.Message, inp: dict) -> str:
        """Start an autonomous loop."""
        goal = inp.get("goal", "")
        if not goal:
            return "A 'goal' is required to start a loop."

        interval = inp.get("interval_seconds", 60)
        mode = inp.get("mode", "notify")
        stop_condition = inp.get("stop_condition")
        max_iterations = inp.get("max_iterations", 50)

        # Build iteration callback that runs through Codex with tools
        async def _iteration_cb(
            prompt: str, channel: object, prev_context: str | None,
        ) -> str:
            return await self._run_loop_iteration(
                prompt, channel, prev_context, str(message.author.id),
            )

        result = self.loop_manager.start_loop(
            goal=goal,
            channel=message.channel,
            requester_id=str(message.author.id),
            requester_name=str(message.author),
            iteration_callback=_iteration_cb,
            interval_seconds=interval,
            mode=mode,
            stop_condition=stop_condition,
            max_iterations=max_iterations,
        )

        # If result is a loop ID (short hex), format success message
        if result.startswith("Error"):
            return result
        # Lifecycle webhook: loop.started
        fire_and_forget(self._emit_lifecycle_event("loop.started", {
            "loop_id": result, "goal": goal[:200], "interval_seconds": interval,
            "mode": mode, "max_iterations": max_iterations,
            "channel_id": str(getattr(message.channel, "id", "")),
            "requester_id": str(message.author.id),
        }), name="lifecycle:loop.started")
        return (
            f"Loop started (ID: `{result}`): **{goal[:100]}** "
            f"(every {max(10, interval)}s, mode={mode}, max {max_iterations} iterations)"
        )

    def _handle_stop_loop(self, inp: dict) -> str:
        """Stop an autonomous loop."""
        loop_id = inp.get("loop_id", "")
        if not loop_id:
            return "A 'loop_id' is required."
        result = self.loop_manager.stop_loop(loop_id)
        # Lifecycle webhook: loop.stopped
        fire_and_forget(self._emit_lifecycle_event("loop.stopped", {
            "loop_id": loop_id, "result": result,
        }), name="lifecycle:loop.stopped")
        return result

    def _handle_list_loops(self) -> str:
        """List all autonomous loops."""
        return self.loop_manager.list_loops()

    # --- Agent tool handlers ---

    async def _handle_spawn_agent(self, message: object, inp: dict) -> str:
        """Spawn an autonomous agent for a sub-task.

        Supports nested spawning up to ``AgentsConfig.max_nesting_depth``
        (default 2). The caller can pass ``parent_id`` in ``inp`` to nest
        under a parent; child agents inherit an elevated depth via
        AgentManager.spawn(). Each spawned agent's tool_executor_callback
        captures the agent's own id, so if the child itself calls spawn_agent
        the grandchild is correctly nested.
        """
        label = inp.get("label", "")
        goal = inp.get("goal", "")
        parent_id_arg = inp.get("parent_id")
        if not label or not goal:
            return "Both 'label' and 'goal' are required."

        if not self.llm_client:
            return "Error: LLM provider not available."

        channel = getattr(message, "channel", message)
        channel_id = str(getattr(channel, "id", "0"))
        author = getattr(message, "author", None)
        user_id = str(getattr(author, "id", "0"))
        user_name = str(author) if author else "agent"

        system_prompt = self._build_system_prompt(channel=channel, user_id=user_id)
        all_tools = self._merged_tool_definitions() if self.config.tools.enabled else []
        # Depth-aware filter: root spawn uses depth 0; nested spawns compute
        # the expected child depth from the parent so terminal children don't
        # even see spawn_agent in their tool list.
        parent_depth = 0
        if parent_id_arg:
            parent = self.agent_manager._agents.get(parent_id_arg)
            if parent is not None:
                parent_depth = parent.depth + 1
        max_depth = getattr(
            getattr(self.config, "agents", None), "max_nesting_depth", 2,
        )
        tools = filter_agent_tools(all_tools, depth=parent_depth, max_depth=max_depth)

        # Iteration callback — wraps Codex chat_with_tools, returns dict
        async def _iteration_cb(
            messages: list[dict], sys_prompt: str, tool_defs: list[dict],
        ) -> dict:
            resp = await self.llm_client.chat_with_tools(
                messages=messages, system=sys_prompt, tools=tool_defs,
            )
            return {
                "text": resp.text,
                "tool_calls": [
                    {"name": tc.name, "input": tc.input}
                    for tc in resp.tool_calls
                ],
                "stop_reason": resp.stop_reason,
            }

        msg_proxy = _LoopMessageProxy(channel, user_id, user_name)

        # Mutable container so the callback can learn its own agent_id
        # AFTER agent_manager.spawn() returns and use it as parent_id when
        # this agent itself calls spawn_agent.
        _self_id: dict[str, str | None] = {"id": None}

        async def _tool_exec_cb(tool_name: str, tool_input: dict) -> str:
            if tool_name == "spawn_agent":
                # Nested spawn — forward this agent's id so AgentManager.spawn
                # enforces max_nesting_depth and children linkage.
                if _self_id["id"] and not tool_input.get("parent_id"):
                    tool_input = {**tool_input, "parent_id": _self_id["id"]}
            elif tool_name in AGENT_BLOCKED_TOOLS:
                # Other agent-management tools (kill/send_to/wait_for/get_results/
                # list) remain available from within a parent, because they
                # operate on already-spawned agents and aren't the same as
                # spawning new ones.
                pass
            result = await self._dispatch_loop_tool(
                tool_name, tool_input, msg_proxy, user_id,
            )
            return str(result) if result is not None else ""

        # Determine iteration cap from config — scheduled spawns get a higher budget
        agents_cfg = getattr(self.config, "agents", None)
        hard_max = getattr(agents_cfg, "hard_max_iterations", 300) if agents_cfg else 300
        if inp.get("_scheduled"):
            iter_cap = min(getattr(agents_cfg, "scheduled_max_iterations", 180) if agents_cfg else 180, hard_max)
        else:
            iter_cap = min(getattr(agents_cfg, "max_iterations", 120) if agents_cfg else 120, hard_max)
        warnings = list(getattr(agents_cfg, "final_warning_iterations", [20, 10, 5, 1])) if agents_cfg else [20, 10, 5, 1]

        agent_id = self.agent_manager.spawn(
            label=label,
            goal=goal,
            channel_id=str(getattr(channel, "id", "0")),
            requester_id=user_id,
            requester_name=user_name,
            iteration_callback=_iteration_cb,
            tool_executor_callback=_tool_exec_cb,
            tools=tools,
            system_prompt=system_prompt,
            parent_id=parent_id_arg,
            max_depth=max_depth,
            tool_timeouts=self.config.tools.tool_timeouts,
            trajectory_saver=self.agent_trajectory_saver,
            max_iterations=iter_cap,
            budget_warnings=warnings,
            context_compression_enabled=bool(self.context_compressor),
            max_context_chars=self.context_compressor.max_context_chars if self.context_compressor else 750000,
            keep_recent_iterations=self.context_compressor.keep_recent_iterations if self.context_compressor else 30,
        )

        if agent_id.startswith("Error"):
            return agent_id
        _self_id["id"] = agent_id
        depth_note = f" (depth {parent_depth})" if parent_id_arg else ""
        return (
            f"Agent '{label}' spawned (ID: `{agent_id}`){depth_note}. "
            f"Working on: {goal[:100]}"
        )

    async def _collect_agent_result(
        self, agent_id: str, timeout: float = 3660,
    ) -> tuple[str, dict]:
        """Wait for an agent to complete and return (formatted_text, raw_data).

        The raw_data dict contains status, error, result, and empty_result
        so callers can make ok/fail decisions based on structured state
        rather than parsing markdown.
        """
        results = await self.agent_manager.wait_for_agents([agent_id], timeout=timeout)
        r = results.get(agent_id, {})
        status = r.get("status", "unknown")
        label = r.get("label", agent_id)
        runtime = r.get("runtime_seconds", 0)
        iterations = r.get("iteration_count", 0)
        tools_used = r.get("tools_used", [])
        result_text = r.get("result", "")
        error_text = r.get("error", "")

        parts = [f"**Agent: {label}** ({status})", f"Runtime: {runtime}s, Iterations: {iterations}"]
        if tools_used:
            parts.append(f"Tools: {', '.join(tools_used[:15])}")
        if result_text:
            if len(result_text) > 1500:
                result_text = result_text[:1500] + "..."
            parts.append(f"Result:\n{result_text}")
        if error_text:
            parts.append(f"Error: {error_text}")

        raw = {
            "status": status,
            "error": error_text,
            "result": r.get("result", ""),
            "empty_result": not r.get("result"),
        }
        return "\n".join(parts), raw

    def _handle_send_to_agent(self, inp: dict) -> str:
        """Send a message to a running agent."""
        agent_id = inp.get("agent_id", "")
        message = inp.get("message", "")
        if not agent_id:
            return "'agent_id' is required."
        if not message:
            return "'message' is required."
        return self.agent_manager.send(agent_id, message)

    def _handle_list_agents(self, message: object) -> str:
        """List all agents, optionally filtered by channel."""
        channel = getattr(message, "channel", message)
        channel_id = str(getattr(channel, "id", "0"))
        agents = self.agent_manager.list(channel_id)
        if not agents:
            return "No agents running."
        lines = []
        for a in agents:
            lines.append(
                f"`{a['id']}` | **{a['label']}** | {a['status']} | "
                f"{a['iteration_count']} iters | {a['runtime_seconds']}s"
            )
        return f"**Agents ({len(agents)}):**\n" + "\n".join(lines)

    def _handle_kill_agent(self, inp: dict) -> str:
        """Kill a running agent."""
        agent_id = inp.get("agent_id", "")
        if not agent_id:
            return "'agent_id' is required."
        return self.agent_manager.kill(agent_id)

    def _handle_get_agent_results(self, inp: dict) -> str:
        """Get results of a completed agent."""
        agent_id = inp.get("agent_id", "")
        if not agent_id:
            return "'agent_id' is required."
        results = self.agent_manager.get_results(agent_id)
        if results is None:
            return f"Agent '{agent_id}' not found."
        if results["status"] == "running":
            return (
                f"Agent '{results['label']}' is still running "
                f"({results['iteration_count']} iterations, "
                f"{results['runtime_seconds']}s elapsed)."
            )
        parts = [
            f"**Agent: {results['label']}** ({results['status']})",
            f"Runtime: {results['runtime_seconds']}s, "
            f"Iterations: {results['iteration_count']}",
        ]
        if results["tools_used"]:
            parts.append(f"Tools: {', '.join(results['tools_used'])}")
        if results["result"]:
            result_text = results["result"]
            if len(result_text) > 1500:
                result_text = result_text[:1500] + "..."
            parts.append(f"Result:\n{result_text}")
        if results["error"]:
            parts.append(f"Error: {results['error']}")
        return "\n".join(parts)

    async def _handle_wait_for_agents(self, inp: dict) -> str:
        """Wait for agents to complete and return collected results."""
        agent_ids = inp.get("agent_ids", [])
        timeout = inp.get("timeout", 300)
        if not agent_ids:
            return "'agent_ids' list is required."
        if not isinstance(agent_ids, list):
            return "'agent_ids' must be a list of agent ID strings."

        results = await self.agent_manager.wait_for_agents(
            agent_ids, timeout=float(timeout),
        )

        lines: list[str] = []
        for aid in agent_ids:
            r = results.get(aid, {})
            status = r.get("status", "unknown")
            label = r.get("label", aid)
            result_text = r.get("result", "")
            error_text = r.get("error", "")
            content = result_text or error_text or "(no output)"
            if len(content) > 800:
                content = content[:800] + "..."
            lines.append(f"**{label}** (`{aid}`): {status}\n{content}")

        return "\n\n".join(lines) if lines else "No results."

    # --- Loop-Agent bridge tool handlers ---

    async def _handle_spawn_loop_agents(self, message: object, inp: dict) -> str:
        """Spawn agents from within a loop iteration via the loop-agent bridge."""
        loop_id = inp.get("loop_id", "")
        tasks = inp.get("tasks", [])
        if not loop_id:
            return "A 'loop_id' is required."
        if not tasks:
            return "A 'tasks' list is required."

        # Validate the loop exists
        loop_info = self.loop_manager._loops.get(loop_id)
        if not loop_info:
            return f"Error: Loop '{loop_id}' not found."
        if loop_info.status != "running":
            return f"Error: Loop '{loop_id}' is not running (status: {loop_info.status})."

        if not self.llm_client:
            return "Error: LLM provider not available."

        channel = getattr(message, "channel", message)
        channel_id = str(getattr(channel, "id", "0"))

        # Build system prompt and tools for the agents (no agent tools — prevents nesting)
        system_prompt = self._build_system_prompt(
            channel=channel, user_id=loop_info.requester_id,
        )
        all_tools = self._merged_tool_definitions() if self.config.tools.enabled else []
        tools = filter_agent_tools(all_tools)

        # Build iteration/tool callbacks (same pattern as _handle_spawn_agent)
        async def _iteration_cb(messages, sys, tool_defs):
            resp = await self.llm_client.chat_with_tools(
                messages=messages, system=sys, tools=tool_defs,
            )
            return {
                "text": resp.text or "",
                "tool_calls": [
                    {"name": tc.name, "input": tc.input}
                    for tc in (resp.tool_calls or [])
                ],
                "stop_reason": resp.stop_reason or "end_turn",
            }

        async def _tool_cb(tool_name, tool_input):
            return await self._dispatch_loop_tool(
                tool_name, tool_input,
                _LoopMessageProxy(channel, loop_info.requester_id, loop_info.requester_name),
                loop_info.requester_id,
            )

        cc = self.config.context_compression
        agent_ids = self.loop_agent_bridge.spawn_agents_for_loop(
            loop_id=loop_id,
            iteration=loop_info.iteration_count,
            loop_goal=loop_info.goal,
            tasks=tasks,
            channel_id=channel_id,
            requester_id=loop_info.requester_id,
            requester_name=loop_info.requester_name,
            iteration_callback=_iteration_cb,
            tool_executor_callback=_tool_cb,
            tools=tools,
            system_prompt=system_prompt,
            tool_timeouts=self.config.tools.tool_timeouts,
            # Honor the configured agent iteration cap; without this the
            # bridge passed None and agents fell back to the module default,
            # ignoring agents.max_iterations.
            max_iterations=self.config.agents.max_iterations,
            context_compression_enabled=cc.enabled,
            max_context_chars=cc.max_context_chars,
            keep_recent_iterations=cc.keep_recent_iterations,
        )

        # Format response
        errors = [a for a in agent_ids if a.startswith("Error")]
        successes = [a for a in agent_ids if not a.startswith("Error")]

        parts = []
        if successes:
            parts.append(f"Spawned {len(successes)} agent(s): {', '.join(successes)}")
        if errors:
            parts.append(f"Errors: {'; '.join(errors)}")
        return "\n".join(parts) or "No agents spawned."

    async def _handle_collect_loop_agents(self, inp: dict) -> str:
        """Collect results from agents spawned by a loop."""
        loop_id = inp.get("loop_id", "")
        agent_ids = inp.get("agent_ids", None)
        timeout = inp.get("timeout", 300)
        if not loop_id:
            return "A 'loop_id' is required."

        # Validate the loop exists
        if loop_id not in self.loop_manager._loops:
            return f"Error: Loop '{loop_id}' not found."

        results = await self.loop_agent_bridge.wait_and_collect(
            loop_id=loop_id,
            agent_ids=agent_ids if isinstance(agent_ids, list) else None,
            timeout=float(timeout),
        )

        if not results:
            return "No agents to collect for this loop."

        return self.loop_agent_bridge.format_agent_results_for_context(results)

    async def _run_loop_iteration(
        self,
        prompt: str,
        channel: object,
        prev_context: str | None,
        user_id: str,
    ) -> str:
        """Run a single loop iteration through Codex with full tool access.

        Simplified version of _process_with_tools for autonomous loops:
        same Codex + tool execution pipeline but without detection retries.
        """
        if not self.llm_client:
            return "LLM provider not available."

        # Resolve requester name for audit logging and message proxy
        requester_name = "loop"
        for loop_info in self.loop_manager._loops.values():
            if loop_info.requester_id == user_id:
                requester_name = loop_info.requester_name
                break
        msg_proxy = _LoopMessageProxy(channel, user_id, requester_name)

        # Observability: loop iterations get the same trajectory + context
        # trace coverage as chat turns (they were previously invisible —
        # 10% of all tool executions had no recorded narrative).
        _turn_ctx = get_turn() or {}
        _loop_id = str(_turn_ctx.get("loop_id", ""))
        _loop_iter = int(_turn_ctx.get("loop_iteration", 0) or 0)
        from ..trajectories.saver import ToolIteration, TrajectoryTurn, stored_tool_results
        _obs = getattr(self.config, "observability", None)
        _loop_trace_on = _obs is None or getattr(_obs, "loop_trace", True)
        _result_store_cap = int(getattr(_obs, "max_tool_result_chars", 2000) or 2000)
        _trace = self._new_context_trace() if _loop_trace_on else None
        _trajectory = None
        _loop_details: list[dict] = []
        if _loop_trace_on:
            _trajectory = TrajectoryTurn(
                message_id=str(_turn_ctx.get("turn_id", "")),
                channel_id=str(getattr(channel, "id", "")),
                user_id=user_id,
                user_name=requester_name,
                source="loop",
            )
            self._record_user_content(_trajectory, prompt)

        # Build messages for the iteration
        messages: list[dict] = []
        if prev_context:
            messages.append({
                "role": "user",
                "content": f"Previous iteration results:\n{prev_context}",
            })
            messages.append({
                "role": "assistant",
                "content": "Understood, I have the context from previous iterations.",
            })
        messages.append({"role": "user", "content": prompt})

        # Build system prompt and tool definitions
        if _trace is not None:
            with _trace.phase("system_prompt"):
                system_prompt = self._build_system_prompt(
                    channel=channel, user_id=user_id, trace=_trace,
                )
            _trace.continuity("loop")
            if prev_context:
                _trace.section("loop_prev_context", tokens=len(prev_context) // 4)
        else:
            system_prompt = self._build_system_prompt(channel=channel, user_id=user_id)
        tools = self._merged_tool_definitions() if self.config.tools.enabled else None

        async def _finish(outcome_text: str, *, is_error: bool = False,
                          failure_class: str = "", error_text: str = "") -> str:
            """Persist the loop turn and run gated reflection at every exit."""
            if _trajectory is not None:
                await self._save_turn_trajectory(
                    _trajectory,
                    error=error_text if is_error else "",
                    final_response=outcome_text if not is_error else "",
                    tools_used=[d["tool"] for d in _loop_details],
                    trace=_trace,
                )
            self._maybe_loop_reflect(
                loop_id=_loop_id or channel_id_str,
                prompt=prompt,
                outcome=outcome_text,
                is_error=is_error,
                failure_class=failure_class,
                error_text=error_text,
                tool_details=_loop_details,
                user_id=user_id,
            )
            return outcome_text

        final_text = ""
        completed_naturally = False  # True only when a tool-free turn ended the loop
        tool_timeout = self.config.tools.tool_timeout_seconds
        channel_id_str = str(getattr(channel, "id", ""))
        loop_cap = self.config.tools.max_tool_iterations_loop
        tool_calls_made = 0

        for _iteration in range(loop_cap):
            try:
                response = await self.llm_client.chat_with_tools(
                    messages=messages, system=system_prompt, tools=tools or [],
                )
            except CircuitOpenError:
                raise
            except Exception as e:
                log.warning("Loop iteration Codex call failed: %s", e)
                return await _finish(
                    f"LLM call failed: {e}", is_error=True,
                    failure_class="provider", error_text=str(e),
                )

            if _trajectory is not None:
                _trajectory.iterations.append(ToolIteration(
                    iteration=_iteration,
                    tool_calls=[
                        {"id": tc.id, "name": tc.name, "input": tc.input}
                        for tc in (response.tool_calls or [])
                    ],
                    llm_text=response.text or "",
                    input_tokens=getattr(response, "input_tokens", 0) or 0,
                    output_tokens=getattr(response, "output_tokens", 0) or 0,
                ))

            if response.text:
                final_text = response.text

            if not response.tool_calls:
                completed_naturally = True
                break

            tool_calls_made += len(response.tool_calls)

            # Build assistant content with tool_use blocks (matches _process_with_tools format)
            assistant_content: list[dict] = []
            if response.text:
                assistant_content.append({"type": "text", "text": response.text})
            for tc in response.tool_calls:
                assistant_content.append({
                    "type": "tool_use", "id": tc.id,
                    "name": tc.name, "input": tc.input,
                })
            messages.append({"role": "assistant", "content": assistant_content})

            # Execute tools concurrently with per-tool timeout
            async def _run_loop_tool(block):
                nonlocal system_prompt
                tool_name = block.name
                tool_input = block.input
                log.info("Loop tool call: %s(%s)", tool_name, tool_input)
                # Provider couldn't parse the model's arguments — don't run
                # the tool on a silently-empty input (see _run_tool).
                if getattr(block, "parse_error", None):
                    log.warning("Loop tool call %s not executed: %s", tool_name, block.parse_error)
                    return {
                        "type": "tool_result", "tool_use_id": block.id,
                        "content": (
                            f"Error: {block.parse_error}. The tool was NOT executed — "
                            "re-issue the call with valid JSON arguments."
                        ),
                    }

                t0 = time.monotonic()
                error = None
                try:
                    _t = 3660 if tool_name in _LONG_TIMEOUT_TOOL_SET else tool_timeout
                    raw = await asyncio.wait_for(
                        self._dispatch_loop_tool(
                            tool_name, tool_input, msg_proxy, user_id,
                        ),
                        timeout=_t,
                    )
                    # Skill CRUD invalidates caches
                    if tool_name in ("create_skill", "edit_skill", "delete_skill", "enable_skill", "disable_skill", "install_skill"):
                        system_prompt = self._build_system_prompt(
                            channel=channel, user_id=user_id,
                        )
                except asyncio.TimeoutError:
                    error = f"Tool '{tool_name}' timed out after {_t}s"
                    raw = error
                except (ValueError, KeyError, TypeError) as e:
                    error = str(e)
                    raw = f"Tool {tool_name} input error: {e}"
                except Exception as e:
                    error = str(e)
                    raw = f"Error executing {tool_name}: {e}"
                    log.warning("Unexpected loop tool error for %s: %s", tool_name, e)

                elapsed_ms = int((time.monotonic() - t0) * 1000)

                # Handle image block returns from analyze_image
                if isinstance(raw, dict) and "__image_block__" in raw:
                    raw = f"[Image loaded: {raw.get('__prompt__', '')}]"

                # Make structured failure visible (see _ensure_failure_visible)
                # and propagate it into the audit error field.
                if isinstance(raw, ToolResult):
                    if not raw.ok and not error:
                        error = raw.error or "tool reported failure"
                    raw = self._ensure_failure_visible(str(raw), raw.ok)

                result = truncate_tool_output(scrub_output_secrets(str(raw)))

                # Audit log
                try:
                    await self.audit.log_execution(
                        user_id=user_id,
                        user_name=requester_name,
                        channel_id=channel_id_str,
                        tool_name=tool_name,
                        tool_input=_scrub_tool_input_for_storage(tool_name, tool_input),
                        approved=True,
                        result_summary=result,
                        execution_time_ms=elapsed_ms,
                        error=error,
                    )
                except (OSError, IOError) as audit_err:
                    log.warning("Audit write failed (I/O): %s", audit_err)
                except Exception as audit_err:
                    log.warning("Audit write failed: %s", audit_err)

                return {
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": result,
                }

            tool_results = await asyncio.gather(
                *[_run_loop_tool(tc) for tc in response.tool_calls],
            )
            messages.append({"role": "user", "content": list(tool_results)})

            _results_by_id = {
                r.get("tool_use_id"): r for r in tool_results if isinstance(r, dict)
            }
            for _tc in response.tool_calls:
                if _trace is not None and _tc.id not in _results_by_id:
                    _trace.warning(
                        "TOOL_RESULT_CONTINUATION_MISMATCH", "error",
                        f"loop tool {_tc.name} call has no paired result",
                    )
                _rcontent = str(_results_by_id.get(_tc.id, {}).get("content", ""))
                _loop_details.append({
                    "tool": _tc.name,
                    "input": _scrub_tool_input_for_storage(_tc.name, _tc.input),
                    "result": _rcontent[:300],
                    "error": _rcontent.lstrip().lower().startswith(
                        ("error", "[error", "failed", "traceback",
                         "script failed", "command failed")),
                })

            # Persist results onto the iteration recorded before execution —
            # without this the saved trajectory has calls but no outcomes.
            if _trajectory is not None and _trajectory.iterations:
                _trajectory.iterations[-1].tool_results = stored_tool_results(
                    tool_results, _result_store_cap,
                )

        # Scrub final text; posting is handled by _post_response in LoopManager.
        # Only treat final_text as a clean success when the loop ended NATURALLY
        # (a tool-free response). If we fell out by exhausting the cap, any
        # final_text is stale pre-tool text from some earlier iteration —
        # returning it as is_error=False would silently hide the cap hit (the
        # cap-warning path below was unreachable whenever any iteration produced
        # text).
        if final_text and completed_naturally:
            final_text = scrub_output_secrets(final_text)
            if len(final_text) > DISCORD_MAX_LEN:
                final_text = final_text[:DISCORD_MAX_LEN - 50] + "\n... (truncated)"
            _had_tool_errors = any(d.get("error") for d in _loop_details)
            _first_err = next((d for d in _loop_details if d.get("error")), None)
            # Iteration succeeded after a mid-flight tool error: the turn is
            # saved as a success (is_error=False), but the failure detail is
            # passed through so the reflection gate can learn from recovered
            # errors without marking the trajectory failed.
            return await _finish(
                final_text,
                is_error=False,
                failure_class="command_failed" if _had_tool_errors else "",
                error_text=_first_err["result"] if _first_err else "",
            )

        # Cap exhausted without a tool-free response. Surface it (optionally with
        # the stale partial text) instead of hiding the truncation.
        if tool_calls_made >= loop_cap or not completed_naturally:
            log.warning(
                "Loop tool-iteration cap hit (%d) after %d tool calls; no tool-free summary from Codex",
                loop_cap, tool_calls_made,
            )
            _partial = ""
            if final_text:
                _partial = "\n\nLast partial output before the cap:\n" + scrub_output_secrets(
                    final_text[:1000],
                )
            return await _finish(
                f"Iteration hit the loop tool-iteration cap ({loop_cap}) "
                f"after {tool_calls_made} tool calls without a final summary. "
                f"Raise `tools.max_tool_iterations_loop` in config (or via the "
                f"web UI) if this happens repeatedly." + _partial,
                is_error=True, failure_class="cancelled",
                error_text=f"loop iteration cap {loop_cap} reached",
            )

        return await _finish("(no response)")

    async def _dispatch_loop_tool(
        self,
        tool_name: str,
        tool_input: dict,
        msg_proxy: _LoopMessageProxy,
        user_id: str,
    ) -> str | dict:
        """Dispatch a tool call to the correct handler within a loop iteration.

        Mirrors the Discord-native tool dispatch in _process_with_tools, using
        a lightweight message proxy instead of a real Discord message.
        """
        t0 = time.monotonic()
        result = await self._dispatch_loop_tool_inner(tool_name, tool_input, msg_proxy, user_id)
        elapsed_ms = int((time.monotonic() - t0) * 1000)
        try:
            await self.audit.log_event(
                event_type="loop_tool",
                action=tool_name,
                actor=user_id,
                detail=str(result)[:200] if isinstance(result, str) else "",
                channel_id=str(getattr(msg_proxy.channel, "id", "")),
                metadata={"tool_input_keys": list((tool_input or {}).keys()), "elapsed_ms": elapsed_ms},
            )
        except Exception:
            pass
        return result

    async def _dispatch_loop_tool_inner(
        self,
        tool_name: str,
        tool_input: dict,
        msg_proxy: _LoopMessageProxy,
        user_id: str,
    ) -> str | dict:
        # Central RBAC gate: same enforcement as the message tool loop — these
        # handlers bypass ToolExecutor.execute(), so check permission for EVERY tool.
        _rbac_denial = self.tool_executor.check_permission(tool_name, user_id)
        if isinstance(_rbac_denial, str) and _rbac_denial:  # str = deny, None = allow
            log.warning("RBAC gate denied loop tool %s for user %s", tool_name, user_id)
            return _rbac_denial
        # One dispatch table for both pipelines (RFC-001 P5a).
        if self._native_tools.handles(tool_name):
            result, _effects = await self._native_tools.dispatch(
                tool_name, tool_input, message=msg_proxy, user_id=user_id,
                skill_file_delivery="stage",
            )
            return result
        # --- Executor-routed tools (run_command, run_script, SSH, etc.) ---
        return await self.tool_executor.execute(tool_name, tool_input, user_id=user_id)

    # -- channel-ops handlers: bodies in native_tools/channel_ops.py (P5b) --

    async def _handle_read_channel(self, message: discord.Message, inp: dict) -> str:
        return await self._channel_ops_tools._handle_read_channel(message, inp)

    async def _handle_add_reaction(self, message: discord.Message, inp: dict) -> str:
        return await self._channel_ops_tools._handle_add_reaction(message, inp)

    async def _handle_create_poll(self, message: discord.Message, inp: dict) -> str:
        return await self._channel_ops_tools._handle_create_poll(message, inp)


    async def _handle_analyze_image(self, message: discord.Message, inp: dict) -> str | dict:
        """Fetch an image and return a vision block for the LLM to analyze.

        Returns either an error string or a dict with ``__image_block__`` key
        that the tool loop injects as a vision content block.
        """
        import aiohttp

        url = inp.get("url")
        host = inp.get("host")
        path = inp.get("path")
        prompt = inp.get("prompt", "Describe this image in detail.")

        image_bytes: bytes | None = None

        if url:
            # Validate URL scheme to prevent SSRF via file://, ftp://, etc.
            if not url.startswith(("http://", "https://")):
                return "Only http:// and https:// URLs are supported."
            # DNS-rebind-aware SSRF guard — scheme-only validation let this
            # reach 169.254.169.254 / internal hosts.
            from ..tools.url_safety import is_url_blocked
            if is_url_blocked(url):
                return ("URL blocked: targets a private, loopback, link-local, "
                        "or cloud-metadata address (SSRF protection).")
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.get(url, timeout=aiohttp.ClientTimeout(total=30), allow_redirects=False) as resp:
                        if resp.status != 200:
                            return f"Failed to fetch image from URL (HTTP {resp.status})"
                        ct = resp.headers.get("Content-Type", "")
                        if not ct.startswith("image/"):
                            return f"URL does not point to an image (Content-Type: {ct})"
                        image_bytes = await resp.read()
            except Exception as e:
                return f"Failed to fetch image from URL: {e}"
        elif host and path:
            # Use executor to fetch from host via base64
            import shlex
            resolved = self.tool_executor._resolve_host(host)
            if not resolved:
                return f"Unknown or disallowed host: {host}"
            address, ssh_user, _os = resolved
            safe_path = shlex.quote(path)
            code, output = await self.tool_executor._exec_command(
                address, f"base64 -w0 {safe_path}", ssh_user,
            )
            if code != 0:
                return f"Failed to read image from host: {output}"
            try:
                image_bytes = base64.b64decode(output.strip())
            except Exception as e:
                return f"Failed to decode image data: {e}"
        else:
            return "Provide either 'url' or both 'host' and 'path'."

        if not image_bytes:
            return "No image data retrieved."

        # Enforce 5MB limit (same as Discord attachment limit)
        if len(image_bytes) > 5 * 1024 * 1024:
            return "Image exceeds 5MB size limit."

        media_type = self._detect_image_type(image_bytes)
        if not media_type:
            return "Unsupported image format. Supported: PNG, JPEG, GIF, WEBP."

        b64 = base64.b64encode(image_bytes).decode("ascii")

        # Return a special marker dict that the tool loop will inject as a
        # vision content block.  The tool result text sent to the LLM will be
        # the prompt, while the image block gets appended to the next user
        # message so Codex can see it.
        return {
            "__image_block__": {
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": media_type,
                    "data": b64,
                },
            },
            "__prompt__": prompt,
        }

    async def _handle_generate_image(self, message: discord.Message, inp: dict) -> str:
        """Generate an image via ComfyUI and post as Discord attachment."""
        if not self.config.comfyui.enabled:
            return "Image generation is disabled. Enable ComfyUI in config to use this tool."

        prompt_text = inp.get("prompt", "")
        if not prompt_text:
            return "A 'prompt' describing the image is required."

        negative = inp.get("negative", "")
        width = inp.get("width", 1024)
        height = inp.get("height", 1024)
        model = inp.get("model", "")

        # Clamp dimensions to reasonable range
        width = max(64, min(2048, width))
        height = max(64, min(2048, height))

        from ..tools.comfyui import ComfyUIClient

        client = ComfyUIClient(self.config.comfyui.url, default_checkpoint=self.config.comfyui.default_checkpoint)
        image_bytes = await client.generate(
            prompt=prompt_text,
            negative=negative,
            width=width,
            height=height,
            model=model,
        )

        if not image_bytes:
            return "Image generation failed. ComfyUI may be unavailable or the request timed out."

        try:
            file = discord.File(io.BytesIO(image_bytes), filename="generated.png")
            await message.channel.send(file=file)
            return f"Image generated and posted ({len(image_bytes) / 1024:.1f} KB)."
        except discord.HTTPException as e:
            return f"Failed to upload generated image to Discord: {e}"

    async def _execute_scheduled_tool(
        self,
        tool_name: str,
        tool_input: dict,
        channel: discord.abc.Messageable,
        requester_id: str | None,
        requester_name: str = "scheduler",
    ) -> ToolResult:
        """Unified dispatch for scheduled task tool execution.

        Routes through the same client-level dispatch as live messages and
        autonomous loops, so scheduled tasks have full tool parity.
        """
        # Pre-check RBAC so we can return a structured failure — the dispatch
        # also checks, but returns a plain denial string we'd have to guess at.
        if requester_id:
            denial = self.tool_executor.check_permission(tool_name, requester_id)
            if isinstance(denial, str) and denial:
                return ToolResult(output=denial, ok=False, error="permission_denied", tool_name=tool_name)

        msg_proxy = _LoopMessageProxy(channel, requester_id or "0", requester_name)
        try:
            result = await self._dispatch_loop_tool_inner(
                tool_name, tool_input, msg_proxy, requester_id or "",
            )
        except Exception as e:
            return ToolResult(output=f"Error executing {tool_name}: {e}", ok=False, error="execution_error", tool_name=tool_name)

        if isinstance(result, ToolResult):
            return result
        return ToolResult(output=str(result), ok=True, tool_name=tool_name)

    async def _run_scheduled_workflow(
        self, channel: discord.abc.Messageable, schedule: dict,
    ) -> bool:
        """Execute a multi-step workflow from a scheduled task.

        Returns True if all steps succeeded, False if any step failed.
        """
        steps = schedule.get("steps", [])
        desc = schedule.get("description", "Workflow")
        results: list[str] = []
        prev_output = ""
        workflow_ok = True
        # Scheduled work runs under the identity of whoever created the schedule, so
        # host-access scoping / tier limits apply (None = unrestricted system task).
        req_id = schedule.get("requester_id") or None

        for i, step in enumerate(steps):
            tool_name = step["tool_name"]
            tool_input = step.get("tool_input", {})
            condition = step.get("condition")
            step_desc = step.get("description", tool_name)

            # Evaluate condition against previous step's output
            if condition and prev_output:
                if condition.startswith("!"):
                    # Negated condition: skip if substring IS present
                    if condition[1:].lower() in prev_output.lower():
                        results.append(f"**Step {i+1}** (`{step_desc}`): skipped (condition `{condition}` met)")
                        continue
                else:
                    # Normal condition: skip if substring is NOT present
                    if condition.lower() not in prev_output.lower():
                        results.append(f"**Step {i+1}** (`{step_desc}`): skipped (condition `{condition}` not met)")
                        continue

            try:
                req_name = schedule.get("requester") or schedule.get("created_by") or "scheduler"
                # Signal to spawn_agent handler that this is a scheduled context
                if tool_name == "spawn_agent":
                    tool_input = {**tool_input, "_scheduled": True}

                result = await self._execute_scheduled_tool(
                    tool_name, tool_input, channel, req_id, req_name,
                )

                # Auto-collect agent results for spawn_agent steps in scheduled workflows.
                # Extract agent_id from spawn confirmation and wait for completion so the
                # workflow reports what the agent did, not just that it was spawned.
                render_markdown = False
                if tool_name == "spawn_agent" and isinstance(result, ToolResult) and result.ok:
                    result_str = str(result)
                    id_match = re.search(r"\(ID:\s*`([^`]+)`\)", result_str)
                    if id_match:
                        agent_id = id_match.group(1)
                        timeout = float(step.get("timeout", 3660))
                        agent_text, agent_data = await self._collect_agent_result(
                            agent_id, timeout=min(timeout, 3660),
                        )
                        agent_ok = agent_data["status"] == "completed"
                        result = ToolResult(output=agent_text, ok=agent_ok, tool_name="spawn_agent")
                        if agent_ok and agent_data["empty_result"]:
                            result = ToolResult(
                                output=agent_text + "\n\n⚠️ Agent completed but produced no output.",
                                ok=True, tool_name="spawn_agent",
                            )
                        render_markdown = True

                prev_output = str(result)

                if isinstance(result, ToolResult) and not result.ok:
                    results.append(f"**Step {i+1}** (`{step_desc}`): FAILED\n```\n{str(result)[:1600]}\n```")
                    on_failure = step.get("on_failure", "abort")
                    if on_failure == "abort":
                        workflow_ok = False
                        results.append("Workflow aborted due to step failure.")
                        break
                elif render_markdown:
                    results.append(f"**Step {i+1}** (`{step_desc}`): OK\n\n{str(result)[:1600]}")
                else:
                    results.append(f"**Step {i+1}** (`{step_desc}`): OK\n```\n{str(result)[:1600]}\n```")
            except Exception as e:
                results.append(f"**Step {i+1}** (`{step_desc}`): FAILED — {e}")
                on_failure = step.get("on_failure", "abort")
                if on_failure == "abort":
                    workflow_ok = False
                    results.append("Workflow aborted due to step failure.")
                    break

        summary = "\n".join(results)
        text = f"**Workflow: {desc}**\n{summary}"
        if len(text) > 1900:
            text = text[:1900] + "\n... (truncated)"

        try:
            await channel.send(scrub_response_secrets(text))
        except Exception as e:
            log.error("Failed to post workflow results: %s", e)

        return workflow_ok

    async def _on_schedule_failure(self, schedule: dict, consecutive: int) -> None:
        """Alert callback fired when a schedule crosses the consecutive-failure
        threshold. Previously never wired, so the alerting path was dead."""
        channel_id = schedule.get("channel_id")
        last_error = schedule.get("last_error", "unknown error")
        text = (
            f"⚠️ **Scheduled task failing:** {schedule.get('description', schedule.get('id', '?'))}\n"
            f"{consecutive} consecutive failures. Last error:\n"
            f"```\n{str(last_error)[:1000]}\n```"
        )
        try:
            channel = self.get_channel(int(channel_id)) if channel_id else None
            if channel:
                await channel.send(scrub_response_secrets(text))
            else:
                log.warning(
                    "Schedule %s failed %d times but channel %s is unavailable for alert",
                    schedule.get("id"), consecutive, channel_id,
                )
        except Exception as e:
            log.warning("Failed to send schedule failure alert for %s: %s", schedule.get("id"), e)

    async def _on_scheduled_task(self, schedule: dict) -> None:
        """Callback fired by the scheduler when a task is due."""
        try:
            await self.audit.log_event(
                event_type="schedule_execution",
                action=schedule.get("action", "unknown"),
                actor="scheduler",
                detail=f"Schedule {schedule.get('id', '?')}: {schedule.get('description', '')[:100]}",
                channel_id=schedule.get("channel_id", ""),
                metadata={"schedule_id": schedule.get("id"), "action": schedule.get("action")},
            )
        except Exception:
            pass
        channel_id = schedule.get("channel_id")
        if not channel_id:
            log.warning("Scheduled task has no channel_id: %s", schedule["id"])
            return

        channel = self.get_channel(int(channel_id))
        if not channel:
            log.warning("Scheduled task channel %s not found", channel_id)
            return

        if schedule["action"] == "digest":
            await self._on_scheduled_digest(schedule)
            return

        if schedule["action"] == "reminder":
            msg = schedule.get("message", schedule["description"])
            # Resolve @username mentions to proper Discord <@ID> mentions
            msg = self._resolve_mentions(msg)
            try:
                await channel.send(f"**Scheduled reminder:** {msg}")
            except Exception as e:
                log.warning("Failed to send scheduled reminder: %s", e)

        elif schedule["action"] == "check":
            tool_name = schedule.get("tool_name")
            tool_input = schedule.get("tool_input", {})
            req_id = schedule.get("requester_id") or None
            req_name = schedule.get("requester") or schedule.get("created_by") or "scheduler"
            try:
                result = await self._execute_scheduled_tool(
                    tool_name, tool_input, channel, req_id, req_name,
                )
                if isinstance(result, ToolResult) and not result.ok:
                    text = f"**Scheduled check failed:** {schedule['description']}\n```\n{str(result)[:1800]}\n```"
                    try:
                        await channel.send(scrub_response_secrets(text))
                    except Exception:
                        pass
                    raise RuntimeError(f"Scheduled check failed: {str(result)[:200]}")
                else:
                    text = f"**Scheduled: {schedule['description']}**\n```\n{str(result)[:1800]}\n```"
                    await channel.send(scrub_response_secrets(text))
            except RuntimeError:
                raise
            except Exception as e:
                log.error("Scheduled task error: %s", e, exc_info=True)
                try:
                    await channel.send(
                        scrub_response_secrets(f"**Scheduled task failed:** {schedule['description']}\nError: {e}")
                    )
                except Exception:
                    pass
                raise

        elif schedule["action"] == "workflow":
            ok = await self._run_scheduled_workflow(channel, schedule)
            if not ok:
                raise RuntimeError(f"Scheduled workflow failed: {schedule.get('description', '')[:200]}")

        else:
            log.warning("Unknown scheduled action type: %s (schedule %s)", schedule["action"], schedule.get("id"))

    async def _send_with_retry(
        self,
        message: discord.Message,
        text: str,
        as_reply: bool = True,
        files: list[discord.File] | None = None,
    ) -> discord.Message | None:
        """Send a message with retry on failure. Optionally attach files."""
        for attempt in range(SEND_MAX_RETRIES):
            try:
                log.info("Sending message (attempt %d, reply=%s): %r", attempt + 1, as_reply, text[:100])
                kwargs: dict = {}
                if files:
                    kwargs["files"] = files
                if as_reply:
                    sent = await message.reply(text, **kwargs)
                else:
                    sent = await message.channel.send(text, **kwargs)
                log.info("Message sent successfully: msg_id=%s", sent.id if sent else "None")
                return sent
            except (discord.HTTPException, ConnectionError, OSError) as e:
                if attempt < SEND_MAX_RETRIES - 1:
                    log.warning("Discord send failed (attempt %d): %s", attempt + 1, e)
                    await asyncio.sleep(1 + attempt)
                else:
                    log.error("Discord send failed after %d retries: %s", SEND_MAX_RETRIES, e)
        return None

    async def _send_chunked(self, message: discord.Message, text: str) -> None:
        """Send a response, splitting into chunks if it exceeds Discord's limit.
        If the response is very long, send as a file attachment instead.
        Attaches any pending skill files to the first message."""
        # Collect pending file attachments from skills (per-channel)
        pending = self._pending_files.pop(str(message.channel.id), [])

        discord_files = [
            discord.File(io.BytesIO(data), filename=fname)
            for data, fname in pending
        ]

        # If the response is extremely long, send as file
        if len(text) > DISCORD_MAX_LEN * 4:
            text_file = discord.File(
                io.BytesIO(text.encode("utf-8")),
                filename="response.md",
            )
            discord_files.append(text_file)
            await self._send_with_retry(message, "Response too long for chat, attached as file:", files=discord_files)
            return

        if len(text) <= DISCORD_MAX_LEN:
            if discord_files:
                await self._send_with_retry(message, text, files=discord_files)
            else:
                await self._send_with_retry(message, text)
            return

        chunks: list[str] = []
        current = ""
        in_code_block = False
        code_block_lang = ""

        # Pre-split any lines longer than the chunk limit so the chunker
        # never encounters a single line that can't fit in one chunk.
        max_line_len = DISCORD_MAX_LEN - 20
        lines: list[str] = []
        for raw_line in text.split("\n"):
            while len(raw_line) > max_line_len:
                lines.append(raw_line[:max_line_len])
                raw_line = raw_line[max_line_len:]
            lines.append(raw_line)

        for line in lines:
            # Track code block state (toggle on ``` lines)
            if line.startswith("```"):
                if in_code_block:
                    in_code_block = False
                    code_block_lang = ""
                else:
                    in_code_block = True
                    code_block_lang = line[3:].strip()

            if len(current) + len(line) + 1 > DISCORD_MAX_LEN - 10:
                if in_code_block:
                    current += "\n```"
                if current.strip():
                    chunks.append(current)
                current = ""
                if in_code_block:
                    current = f"```{code_block_lang}\n"
            current += line + "\n"

        if current.strip():
            chunks.append(current)

        for i, chunk in enumerate(chunks):
            if i == 0 and discord_files:
                await self._send_with_retry(message, chunk, files=discord_files)
            elif i == 0:
                await self._send_with_retry(message, chunk)
            else:
                await self._send_with_retry(message, chunk, as_reply=False)
