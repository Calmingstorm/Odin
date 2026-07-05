from __future__ import annotations

import asyncio
import hashlib
import os
import re
import time
from collections.abc import Callable

import discord
from discord.ext import commands

from ..config.schema import Config
from ..monitoring import InfraWatcher
from ..llm.secret_scrubber import scrub_output_secrets
from ..odin_log import get_logger
from ..tools import ToolResult, get_tool_definitions
from ..async_utils import fire_and_forget
from .completion import CLASSIFIER_SYSTEM_PROMPT, CompletionClassifier
from .tool_loop import ensure_failure_visible
from .tool_loop import _LoopAuthorProxy, _LoopMessageProxy  # noqa: F401 — re-export (tests, proxies)

# Canonical homes moved to tool_loop_helpers (RFC-002 P1) — re-exported here
# until P7 retires the facade spellings. _ALLOWED_WEBHOOK_IDS is the SAME set
# object (mutated in place), so this binding stays live across env re-reads.
from .tool_loop_helpers import (
    _ALLOWED_WEBHOOK_IDS,  # noqa: F401 — re-export
    _EMAIL_BODY_TOOLS,  # noqa: F401 — re-export
    _EMPTY_RESPONSE_FALLBACK,  # noqa: F401 — re-export
    _scrub_tool_input_for_storage,
    init_allowed_webhook_ids as _init_allowed_webhook_ids_impl,
)
from .delivery import DISCORD_MAX_LEN  # noqa: F401 — module re-export contract
from .delivery import SEND_MAX_RETRIES  # noqa: F401 — module re-export contract
from .slash_commands import register_commands
from .native_tools.media import MediaTools
from .voice import VoiceManager, VoiceMessageProxy
from .wiring import build_components, build_services, shutdown_services

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


# Patterns that might indicate a secret was pasted
SECRET_SCRUB_PATTERNS = [
    re.compile(r"sk-[a-zA-Z0-9]{20,}"),
    re.compile(r"(?i)(api[_-]?key|token|secret|password)\s*[:=]\s*\S{8,}"),
    re.compile(r"xox[boaprs]-[a-zA-Z0-9-]+"),
    # Natural language: "my password is ...", "password for gmail is ..."
    re.compile(r"(?i)(?:my\s+)?(?:password|passwd|pwd)\s+(?:\S+\s+){0,4}(?:is|was)\s+\S{6,}"),
]

# Tool-iteration caps are now configurable per path (chat vs loop) via
# config.tools.max_tool_iterations_chat / _loop. Read fresh each request so
# config updates via /api/config PUT take effect on the next message/iteration.
TOOL_OUTPUT_MAX_CHARS = 12000  # ~3000 tokens; cap tool results to prevent context bloat
_LONG_TIMEOUT_TOOL_SET = frozenset({"claude_code"})  # Tools that get extended timeout (3660s vs config default)

# Pre-compiled regex for merging adjacent code blocks in combine_bot_messages
_ADJACENT_FENCE_RE = re.compile(r"\n```[ \t]*\n\n```(\w*)[ \t]*\n")





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

        # ------------------------------------------------------------------
        # Subsystem construction lives in the composition root (wiring.py,
        # RFC-001 P1). Attributes are attached flat so the external facade
        # (web/api.py, health checks, tests) is unchanged.
        # ------------------------------------------------------------------
        services = build_services(config)
        self.services = services

        # Per-channel mutable state — owned by ChannelStateRegistry
        # (constructed in build_services since RFC-002 P2). The dict
        # attributes below are facade ALIASES to the registry's dicts (same
        # objects): external readers (web layer, tests) keep working, and
        # mutations through either name stay in sync.
        self.channel_state = self._channel_state = services.channel_state
        self._channel_locks = self._channel_state.channel_locks
        self._cancel_events = self._channel_state.cancel_events
        self._pending_files = self._channel_state.pending_files
        self._recent_actions = self._channel_state.recent_actions
        self._last_op_details = self._channel_state.last_op_details
        self._background_tasks = self._channel_state.background_tasks

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

        # Voice support — VoiceManager takes the live bot, so it stays here
        # (and must exist before build_components: PromptBuilder consumes it).
        self.voice_manager: VoiceManager | None = None
        if config.voice.enabled:
            self.voice_manager = VoiceManager(config.voice, self)
            self.voice_manager.on_transcription = self._on_voice_transcription

        # ------------------------------------------------------------------
        # Bot-coupled component assembly (RFC-002 P2) — construction moved to
        # wiring.build_components. Components carry PUBLIC names; the old
        # underscore spellings remain as aliases to the same objects until P7
        # retires the facade.
        # ------------------------------------------------------------------
        components = build_components(self, services)
        self.components = components
        self.llm_gateway = self._llm_gateway = components.llm_gateway
        self.prompt_builder = self._prompt_builder = components.prompt_builder
        self.tool_catalog = self._tool_catalog = components.tool_catalog
        self.native_tools = self._native_tools = components.native_tools
        self.scheduling_tools = self._scheduling_tools = components.scheduling_tools
        self.knowledge_tools = self._knowledge_tools = components.knowledge_tools
        self.channel_ops_tools = self._channel_ops_tools = components.channel_ops_tools
        self.media_tools = self._media_tools = components.media_tools
        self.delivery = self._delivery = components.delivery
        self.completion_classifier = self._completion_classifier = (
            components.completion_classifier
        )
        self.tool_loop = self._tool_loop_runner = components.tool_loop
        self.turn_recorder = self._turn_recorder = components.turn_recorder
        self.scheduled_events = self._scheduled_events = components.scheduled_events
        self.agent_task_tools = self._agent_task_tools = components.agent_task_tools
        self.intake = self._message_intake = components.intake
        self.pipeline = self._message_pipeline = components.pipeline

        # Proactive infrastructure monitoring — constructed AFTER the
        # components so the alert callback wires directly to the
        # scheduled-events component (RFC-002 R1; no bot delegate).
        self.infra_watcher: InfraWatcher | None = None
        if config.monitoring.enabled and config.monitoring.checks:
            self.infra_watcher = InfraWatcher(
                config=config.monitoring,
                executor=self.tool_executor,
                alert_callback=self.scheduled_events._on_monitor_alert,
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
        """Populate the test-webhook allowlist from the ALLOWED_WEBHOOK_IDS env var."""
        _init_allowed_webhook_ids_impl(os.environ.get("ALLOWED_WEBHOOK_IDS", ""))

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

    # -- turn observability: bodies in turn_recorder.py (P10) --

    def _record_user_content(self, trajectory, content: str) -> None:
        self._turn_recorder._record_user_content(trajectory, content)

    def _new_context_trace(self):
        return self._turn_recorder._new_context_trace()


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
        """Slash commands — owned by slash_commands.register_commands (P10)."""
        register_commands(self)


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


    async def _operational_reflection(
        self, user_request: str, tools_used: list[str], response: str,
        is_error: bool, user_id: str | None, tool_details: list[dict] | None = None,
    ) -> None:
        await self._turn_recorder._operational_reflection(
            user_request, tools_used, response, is_error, user_id, tool_details=tool_details,
        )

    def _should_reflect_on_operation(
        self, user_request: str, tools_used: list[str], is_error: bool, tool_details: list[dict],
    ) -> bool:
        return self._turn_recorder._should_reflect_on_operation(
            user_request, tools_used, is_error, tool_details,
        )

    def _maybe_loop_reflect(self, **kwargs) -> None:
        self._turn_recorder._maybe_loop_reflect(**kwargs)

    async def _save_turn_trajectory(
        self, trajectory, *, error: str = "", final_response: str = "",
        tools_used: list[str] | None = None, trace=None,
    ) -> None:
        await self._turn_recorder._save_turn_trajectory(
            trajectory, error=error, final_response=final_response,
            tools_used=tools_used, trace=trace,
        )

    async def _emit_lifecycle_event(self, event_type: str, payload: dict) -> None:
        await self._turn_recorder._emit_lifecycle_event(event_type, payload)


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
        """Presence updates — owned by ResponseDelivery (P6)."""
        await self._delivery.set_status(text, task_start=task_start, task_end=task_end)


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
        self.scheduler.start(
            self.scheduled_events._on_scheduled_task,
            self.scheduled_events._on_schedule_failure,
        )
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
        """Intake gating chain — owned by intake_pipeline.MessageIntake (P9)."""
        await self._message_intake.handle(message)


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
        """Pipeline orchestration — owned by intake_pipeline.MessagePipeline (P9)."""
        await self._message_pipeline.run(
            message, content, image_blocks=image_blocks, voice_callback=voice_callback,
        )

    async def _handle_message_inner(
        self, message: discord.Message, content: str, channel_id: str,
        *, image_blocks: list[dict] | None = None,
        voice_callback: Callable | None = None,
    ) -> None:
        await self._message_pipeline._run_inner(
            message, content, channel_id,
            image_blocks=image_blocks, voice_callback=voice_callback,
        )


    # Completion classification — owned by completion.CompletionClassifier
    # (P7). The class attr + method delegates keep the facade/test seams.
    _CLASSIFIER_SYSTEM_PROMPT = CLASSIFIER_SYSTEM_PROMPT

    async def _classify_completion(
        self,
        user_message: str,
        response_text: str,
        tools_used: list[str],
    ) -> tuple[bool, str]:
        return await self._completion_classifier.classify(
            user_message, response_text, tools_used,
        )

    @staticmethod
    def _parse_classifier_response(raw: str) -> tuple[bool, str]:
        return CompletionClassifier.parse_response(raw)


    async def _process_with_tools(
        self,
        message: discord.Message,
        history: list[dict],
        system_prompt_override: str | None = None,
        trace=None,
    ) -> tuple[str, bool, bool, list[str], bool]:
        """Chat tool loop — owned by tool_loop.ToolLoopRunner (P7).

        Returns (text, already_sent, is_error, tools_used, handoff).
        """
        return await self._tool_loop_runner.run(
            message, history, system_prompt_override=system_prompt_override, trace=trace,
        )

    _ensure_failure_visible = staticmethod(ensure_failure_visible)


    _detect_image_type = staticmethod(MediaTools._detect_image_type)

    async def _handle_purge(self, message: discord.Message, inp: dict) -> str:
        return await self._channel_ops_tools._handle_purge(message, inp)


    # -- media handlers: bodies in native_tools/media.py (P5b) --

    async def _handle_browser_screenshot(self, message: discord.Message, inp: dict) -> str:
        return await self._media_tools._handle_browser_screenshot(message, inp)

    async def _handle_generate_file(self, message: discord.Message, inp: dict) -> str:
        return await self._media_tools._handle_generate_file(message, inp)

    async def _handle_post_file(self, message: discord.Message, inp: dict) -> str:
        return await self._media_tools._handle_post_file(message, inp)


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


    # -- scheduler/digest/monitor callbacks: bodies in scheduled_events.py (P10) --

    async def _on_scheduled_digest(self, schedule: dict) -> None:
        await self._scheduled_events._on_scheduled_digest(schedule)

    async def _format_digest_raw(self) -> str:
        return await self._scheduled_events._format_digest_raw()

    def _resolve_mentions(self, text: str) -> str:
        return self._scheduled_events._resolve_mentions(text)

    async def _on_monitor_alert(self, message: str) -> None:
        await self._scheduled_events._on_monitor_alert(message)


    # -- agents/tasks/loops handlers: bodies in native_tools/agents_tasks.py (P5c) --

    async def _handle_delegate_task(self, message: discord.Message, inp: dict) -> str:
        return await self._agent_task_tools._handle_delegate_task(message, inp)

    def _handle_list_tasks(self, inp: dict | None = None) -> str:
        return self._agent_task_tools._handle_list_tasks(inp)

    def _handle_cancel_task(self, inp: dict) -> str:
        return self._agent_task_tools._handle_cancel_task(inp)

    def _handle_start_loop(self, message: discord.Message, inp: dict) -> str:
        return self._agent_task_tools._handle_start_loop(message, inp)

    def _handle_stop_loop(self, inp: dict) -> str:
        return self._agent_task_tools._handle_stop_loop(inp)

    def _handle_list_loops(self) -> str:
        return self._agent_task_tools._handle_list_loops()

    async def _handle_spawn_agent(self, message: object, inp: dict) -> str:
        return await self._agent_task_tools._handle_spawn_agent(message, inp)

    async def _collect_agent_result(self, agent_id: str, timeout: float = 3660.0):
        return await self._agent_task_tools._collect_agent_result(agent_id, timeout=timeout)

    def _handle_send_to_agent(self, inp: dict) -> str:
        return self._agent_task_tools._handle_send_to_agent(inp)

    def _handle_list_agents(self, message: object) -> str:
        return self._agent_task_tools._handle_list_agents(message)

    def _handle_kill_agent(self, inp: dict) -> str:
        return self._agent_task_tools._handle_kill_agent(inp)

    def _handle_get_agent_results(self, inp: dict) -> str:
        return self._agent_task_tools._handle_get_agent_results(inp)

    async def _handle_wait_for_agents(self, inp: dict) -> str:
        return await self._agent_task_tools._handle_wait_for_agents(inp)

    async def _handle_spawn_loop_agents(self, message: object, inp: dict) -> str:
        return await self._agent_task_tools._handle_spawn_loop_agents(message, inp)

    async def _handle_collect_loop_agents(self, inp: dict) -> str:
        return await self._agent_task_tools._handle_collect_loop_agents(inp)


    async def _run_loop_iteration(
        self,
        prompt: str,
        channel: object,
        prev_context: str | None,
        user_id: str,
    ) -> str:
        """Autonomous-loop iteration — owned by tool_loop.ToolLoopRunner (P8)."""
        return await self._tool_loop_runner.run_autonomous(prompt, channel, prev_context, user_id)

    async def _dispatch_loop_tool(
        self,
        tool_name: str,
        tool_input: dict,
        msg_proxy: _LoopMessageProxy,
        user_id: str,
    ) -> str | dict:
        """Loop tool dispatch — owned by tool_loop.ToolLoopRunner (P8)."""
        return await self._tool_loop_runner.dispatch_loop_tool(
            tool_name, tool_input, msg_proxy, user_id,
        )

    async def _dispatch_loop_tool_inner(
        self,
        tool_name: str,
        tool_input: dict,
        msg_proxy: _LoopMessageProxy,
        user_id: str,
    ) -> str | dict:
        return await self._tool_loop_runner.dispatch_loop_tool_inner(
            tool_name, tool_input, msg_proxy, user_id,
        )


    # -- channel-ops handlers: bodies in native_tools/channel_ops.py (P5b) --

    async def _handle_read_channel(self, message: discord.Message, inp: dict) -> str:
        return await self._channel_ops_tools._handle_read_channel(message, inp)

    async def _handle_add_reaction(self, message: discord.Message, inp: dict) -> str:
        return await self._channel_ops_tools._handle_add_reaction(message, inp)

    async def _handle_create_poll(self, message: discord.Message, inp: dict) -> str:
        return await self._channel_ops_tools._handle_create_poll(message, inp)


    async def _handle_analyze_image(self, message: discord.Message, inp: dict) -> str | dict:
        return await self._media_tools._handle_analyze_image(message, inp)

    async def _handle_generate_image(self, message: discord.Message, inp: dict) -> str:
        return await self._media_tools._handle_generate_image(message, inp)


    async def _execute_scheduled_tool(
        self, tool_name: str, tool_input: dict, channel: discord.abc.Messageable,
        requester_id: str | None, requester_name: str = "scheduler",
    ) -> ToolResult:
        return await self._scheduled_events._execute_scheduled_tool(
            tool_name, tool_input, channel, requester_id, requester_name,
        )

    async def _run_scheduled_workflow(self, channel: discord.abc.Messageable, schedule: dict) -> bool:
        return await self._scheduled_events._run_scheduled_workflow(channel, schedule)

    async def _on_schedule_failure(self, schedule: dict, consecutive: int) -> None:
        await self._scheduled_events._on_schedule_failure(schedule, consecutive)

    async def _on_scheduled_task(self, schedule: dict) -> None:
        await self._scheduled_events._on_scheduled_task(schedule)


    async def _send_with_retry(
        self,
        message: discord.Message,
        text: str,
        as_reply: bool = True,
        files: list[discord.File] | None = None,
    ) -> discord.Message | None:
        """Send with retry — owned by ResponseDelivery (P6)."""
        return await self._delivery.send_with_retry(message, text, as_reply=as_reply, files=files)

    async def _send_chunked(self, message: discord.Message, text: str) -> None:
        """Chunked send — owned by ResponseDelivery (P6)."""
        await self._delivery.send_chunked(message, text)
