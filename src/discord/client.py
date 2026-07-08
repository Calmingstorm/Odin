"""OdinBot — the Discord client: lifecycle, gating entry points, composition.

Since RFC-002 P7 this module holds ONLY what genuinely belongs to the bot:
discord.py lifecycle hooks, the composition sequence (services →
components → watchers), and the handful of real helpers those hooks use.
Everything else lives in the components (``wiring.build_components``) and
is reachable through their PUBLIC names on the bot (``bot.tool_loop``,
``bot.prompt_builder``, ``bot.llm_gateway``, …) plus ``bot.services`` /
``bot.components``. The old delegate/shim facade is retired — the public
surface is pinned by tests/characterization/test_facade_contract.py.
"""

from __future__ import annotations

import os
import time

from discord.ext import commands

import discord

from ..async_utils import fire_and_forget
from ..config.schema import Config
from ..odin_log import get_logger
from ..tools import get_tool_definitions
from .slash_commands import register_commands
from .tool_loop_helpers import init_allowed_webhook_ids as _init_allowed_webhook_ids_impl
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


class OdinBot(commands.Bot):
    def __init__(self, config: Config) -> None:
        intents = discord.Intents.default()
        intents.message_content = True
        intents.reactions = True
        intents.members = True
        super().__init__(
            command_prefix=self._resolve_prefix,
            intents=intents,
            help_command=None,
        )

        self.config = config
        # commands.Bot already initializes self.tree (app_commands.CommandTree); do not overwrite
        self.start_time = time.monotonic()

        # ------------------------------------------------------------------
        # Stage 1: bot-independent services (wiring.build_services).
        # Flat handles are the documented public composition surface.
        # ------------------------------------------------------------------
        services = build_services(config)
        self.services = services

        # Per-channel mutable state — owned by ChannelStateRegistry.
        self.channel_state = services.channel_state

        self.context_loader = services.context_loader
        self.reflector = services.reflector
        self.embedder = services.embedder
        self.sessions = services.sessions
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
        self.loop_reflection_gate = services.loop_reflection_gate
        self.cost_tracker = services.cost_tracker
        self.subsystem_guard = services.subsystem_guard
        self.diff_tracker = services.diff_tracker
        self.model_router = services.model_router
        self.context_compressor = services.context_compressor
        self.prefix_tracker = services.prefix_tracker
        self.auxiliary_llm_client = services.auxiliary_llm_client
        self.outbound_webhook_dispatcher = services.outbound_webhook_dispatcher
        self.stuck_loop_tracker_cls = services.stuck_loop_tracker_cls
        self.classify_command_risk = services.classify_command_risk
        self.classify_tool_risk = services.classify_tool_risk
        # Internal storage (client-owned): search stores + memory path. The
        # knowledge store is swappable at runtime via the `knowledge`
        # property; the others feed the archive backfill below.
        self._embedder = services.embedder
        self._fts_index = services.fts_index
        self._vector_store = services.vector_store
        self._knowledge_store = services.knowledge_store
        self._memory_path = services.memory_path
        self._run_startup_diagnostics = services.run_startup_diagnostics
        # Audit signer — exposed as bot.audit_signer for tests/introspection.
        # The actual chain signing is wired into AuditLogger via the hmac_key
        # constructor arg; signing happens automatically inside log_execution.
        self.audit_signer = self.audit._signer

        # ------------------------------------------------------------------
        # Stage 2: bot-coupled components (wiring.build_components), exposed
        # under their public names — the real successor of the old facade.
        # ------------------------------------------------------------------
        components = build_components(self, services)
        self.components = components
        self.llm_gateway = components.llm_gateway
        self.prompt_builder = components.prompt_builder
        self.tool_catalog = components.tool_catalog
        self.native_tools = components.native_tools
        self.scheduling_tools = components.scheduling_tools
        self.knowledge_tools = components.knowledge_tools
        self.channel_ops_tools = components.channel_ops_tools
        self.media_tools = components.media_tools
        self.delivery = components.delivery
        self.completion_classifier = components.completion_classifier
        self.tool_loop = components.tool_loop
        self.turn_recorder = components.turn_recorder
        self.scheduled_events = components.scheduled_events
        self.agent_task_tools = components.agent_task_tools
        self.intake = components.intake
        self.pipeline = components.pipeline
        self.housekeeping = components.housekeeping

        self.prompt_builder.rebuild_default()
        register_commands(self)
        self._init_allowed_webhook_ids()
        self._log_startup_config()

    # ---------- Runtime-swappable stores ------------------------------------

    @property
    def knowledge(self):
        """The knowledge store — live: reloads and tests swap it at runtime."""
        return self._knowledge_store

    @knowledge.setter
    def knowledge(self, value) -> None:
        self._knowledge_store = value

    # ---------- Startup helpers ----------------------------------------------

    def _init_allowed_webhook_ids(self) -> None:
        """Populate the test-webhook allowlist from the ALLOWED_WEBHOOK_IDS env var."""
        _init_allowed_webhook_ids_impl(os.environ.get("ALLOWED_WEBHOOK_IDS", ""))

    def _log_startup_config(self) -> None:
        """Log configuration summary at startup to help users verify setup."""
        cfg = self.config
        if not cfg.tools.hosts:
            log.warning("No hosts configured — SSH tools will not work until hosts are added to "
                        "config.yml")
        else:
            log.info("Configured hosts: %s", ", ".join(cfg.tools.hosts.keys()))
        if not cfg.tools.claude_code_host:
            log.info("claude_code_host not set — claude -p code generation requires a configured "
                     "host")
        if cfg.openai_codex.enabled and not self.llm_gateway.codex_client:
            log.warning("Codex enabled but not configured — session compaction and learning "
                        "reflection disabled")
        if cfg.discord.respond_to_bots:
            log.info("Bot interaction enabled — will respond to other bots")
        if cfg.discord.require_mention:
            log.info("Mention-only mode — will only respond when @mentioned")

    # ------------------------------------------------------------------
    # commands.Bot lifecycle hooks (cog loading + prefix)
    # ------------------------------------------------------------------

    async def _resolve_prefix(
        self, bot: commands.Bot, message: discord.Message
    ) -> list[str]:
        """Return applicable prefixes; mention also accepted."""
        base = ["!"]  # OdinBot's default prefix; can be made config-driven later
        return commands.when_mentioned_or(*base)(bot, message)

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

    async def on_ready(self) -> None:
        log.info("Logged in as %s (ID: %s)", self.user, self.user.id)  # type: ignore[union-attr]  # on_ready fires post-login
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
        await self.delivery.set_status(None, task_end=True)

    async def _backfill_archives(self) -> None:
        """Backfill semantic search index and FTS5 with existing archive files."""
        try:
            archive_dir = self.sessions.persist_dir / "archive"
            count = await self._vector_store.backfill(archive_dir, self._embedder)  # type: ignore[union-attr, arg-type]  # built together under search.enabled
            if count:
                log.info("Backfilled %d archive sessions into vector store", count)
            else:
                log.info("Vector store up to date")
            # Backfill knowledge FTS from existing data
            if self._knowledge_store and self._fts_index:
                import asyncio

                kb_count = await asyncio.to_thread(self._knowledge_store.backfill_fts)
                if kb_count:
                    log.info("Backfilled %d knowledge chunks into FTS index", kb_count)
        except Exception as e:
            log.error("Archive backfill failed: %s", e)

    async def on_message(self, message: discord.Message) -> None:
        """Intake gating chain — owned by intake_pipeline.MessageIntake."""
        await self.intake.handle(message)
