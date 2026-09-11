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

import asyncio
import contextvars
import os
import time
from typing import TYPE_CHECKING

from discord.ext import commands

import discord

from ..async_utils import fire_and_forget
from ..config.schema import Config
from ..odin_log import get_logger
from ..tools import get_tool_definitions
from .slash_commands import register_commands
from .tool_loop_helpers import init_allowed_webhook_ids as _init_allowed_webhook_ids_impl
from .wiring import build_components, build_services, shutdown_services, start_mcp

if TYPE_CHECKING:  # health.server imports this module at runtime — cycle-free typing only
    from ..health.server import HealthServer
    from ..web.onboarding import OnboardingCoordinator

log = get_logger("discord")

_callback_generation: contextvars.ContextVar[int | None] = contextvars.ContextVar(
    "discord_callback_generation", default=None
)

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
    # Late-bound by HealthServer.set_bot(). ANNOTATION ONLY, deliberately not
    # assigned: this declares the attribute for the type gate while keeping it
    # absent on a fresh bot, which the RFC-002 late-bound contract pins because
    # health-check hasattr semantics depend on it. Assigning None here would
    # make hasattr(bot, "health_server") true from construction.
    health_server: HealthServer | None
    # Assigned by application startup before HealthServer.set_bot(). Like the
    # health backlink, this remains absent on a freshly constructed bot.
    onboarding: OnboardingCoordinator

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
        # What the running components were actually built from. Restart-mode
        # settings keep using this after config.yml changes, so the config page
        # needs it to report "effective" honestly instead of echoing the
        # desired value back and calling it applied.
        self.boot_config_snapshot = config.model_dump()
        # commands.Bot already initializes self.tree (app_commands.CommandTree); do not overwrite
        self.start_time = time.monotonic()
        # Application-command reconciliation bookkeeping: scopes ("global",
        # "guild:<id>") already forced to the exact tree in THIS process. A
        # reconnect's on_ready retries only failed or newly seen scopes.
        self._synced_command_scopes: set[str] = set()
        self._command_snapshot: list | None = None
        # The application outlives any Discord transport generation.
        self._application_started = False
        self._application_shutdown = False
        self._application_start_lock = asyncio.Lock()
        self._application_shutdown_task: asyncio.Task[None] | None = None
        self._gateway_event_tasks: dict[int, set[asyncio.Task[object]]] = {}
        self._delivery_application_id: int | None = None

        # ------------------------------------------------------------------
        # Stage 1: bot-independent services (wiring.build_services).
        # Flat handles are the documented public composition surface.
        # ------------------------------------------------------------------
        services = build_services(config, get_config=lambda: self.config)
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
        self.host_registry = services.host_registry
        self.host_access_manager = services.host_access_manager
        self.permissions = services.permissions
        self.tool_executor = services.tool_executor
        self.skill_manager = services.skill_manager
        self.scheduler = services.scheduler
        self.mcp_manager = services.mcp_manager
        self.audit = services.audit
        self.api_token_manager = services.api_token_manager
        self.agent_manager = services.agent_manager
        self.loop_manager = services.loop_manager
        self.trajectory_saver = services.trajectory_saver
        self.agent_trajectory_saver = services.agent_trajectory_saver
        self.loop_agent_bridge = services.loop_agent_bridge
        self.loop_reflection_gate = services.loop_reflection_gate
        self.cost_tracker = services.cost_tracker
        self.usage_rollup = services.usage_rollup
        self.subsystem_guard = services.subsystem_guard
        self.diff_tracker = services.diff_tracker
        self.context_compressor = services.context_compressor
        self.prefix_tracker = services.prefix_tracker
        # The gateway holds the CANONICAL auxiliary pointer — live reloads
        # swap it there. The flat bot handle is a property over it so it can
        # never drift to a retired generation (see the auxiliary_llm_client
        # property below).
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
        self.builtin_tool_policy = components.builtin_tool_policy
        self.native_tools = components.native_tools
        self.computer = components.computer
        self.computer_set_enabled = self.computer.set_enabled
        self.computer_authorize_context = self.computer.authorize_context
        self.scheduling_tools = components.scheduling_tools
        self.knowledge_tools = components.knowledge_tools
        self.channel_ops_tools = components.channel_ops_tools
        self.media_tools = components.media_tools
        self.delivery = components.delivery
        self.completion_classifier = components.completion_classifier
        self.tool_loop = components.tool_loop
        self.turn_recorder = components.turn_recorder
        self.scheduled_events = components.scheduled_events
        self.scheduled_report_renderers = components.scheduled_report_renderers
        self.scheduled_reports = components.scheduled_reports
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
    def auxiliary_llm_client(self):
        """The live auxiliary wrapper — canonical on the gateway, which swaps
        it on reload. A property (not a stored attr) so the flat handle can
        never point at a retired generation."""
        return self.llm_gateway.auxiliary_llm_client

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

    def bind_connection_supervisor(self, supervisor) -> None:
        """Install the gateway authority and its scheduler admission source."""
        self.connection_supervisor = supervisor
        self.scheduler.set_connection_state_provider(supervisor.connection_availability)

    def _log_startup_config(self) -> None:
        """Log configuration summary at startup to help users verify setup."""
        cfg = self.config
        if not cfg.tools.hosts:
            log.warning(
                "No hosts configured — SSH tools will not work until hosts are added to config.yml"
            )
        else:
            log.info("Configured hosts: %s", ", ".join(cfg.tools.hosts.keys()))
        if cfg.openai_codex.enabled and not self.llm_gateway.codex_client:
            log.warning(
                "Codex enabled but not configured — session compaction and learning "
                "reflection disabled"
            )
        if cfg.discord.respond_to_bots:
            log.info("Bot interaction enabled — will respond to other bots")
        if cfg.discord.require_mention:
            log.info("Mention-only mode — will only respond when @mentioned")

    # ------------------------------------------------------------------
    # commands.Bot lifecycle hooks (cog loading + prefix)
    # ------------------------------------------------------------------

    async def _resolve_prefix(self, bot: commands.Bot, message: discord.Message) -> list[str]:
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
        await self.start_application()

    async def start_application(self) -> None:
        """Initialize process services once, independently of gateway attachment."""
        async with self._application_start_lock:
            if self._application_started:
                return
            if self._application_shutdown:
                raise RuntimeError("cannot start an application after terminal shutdown")
            # Do not publish started until required startup work completes.
            # This keeps a failed initialization retryable.
            if self.loop is discord.utils.MISSING:
                await discord.Client._async_setup_hook(self)
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
                        failed,
                        len(report.results),
                    )
            except Exception:
                log.exception("Startup diagnostics failed unexpectedly (non-fatal)")

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

            try:
                await self.usage_rollup.start()
            except Exception:
                log.exception("Usage backfill startup failed (non-fatal)")

            await start_mcp(self)

            try:
                await self.computer.start()
            except Exception:
                log.exception("Computer startup failed; desktop tools remain unavailable")
            self._application_started = True

    async def close(self) -> None:
        """Close only this Discord transport generation.

        ConnectionSupervisor uses this boundary for a deliberate detach.
        Process services, cogs, command tree, HTTP/state identities and the
        application remain alive until :meth:`shutdown_application`.
        """
        await discord.Client.close(self)

    async def shutdown_application(self) -> None:
        """Terminal process teardown, called exactly once by the entrypoint."""
        self._application_shutdown = True
        if self._application_shutdown_task is None:
            async def shutdown() -> None:
                log.info("Shutting down OdinBot…")
                await shutdown_services(self)
                await commands.Bot.close(self)
                log.info("OdinBot shutdown complete")

            self._application_shutdown_task = asyncio.create_task(
                shutdown(), name="odin-application-shutdown"
            )
        await asyncio.shield(self._application_shutdown_task)

    def dispatch(self, event_name: str, /, *args, **kwargs) -> None:
        """Fence disconnect synchronously, before slow callbacks are queued."""
        if event_name == "disconnect":
            supervisor = getattr(self, "connection_supervisor", None)
            if supervisor is not None:
                supervisor.transport_disconnected(supervisor.callback_generation())
        super().dispatch(event_name, *args, **kwargs)

    def _schedule_event(self, coro, event_name, *args, **kwargs):
        """Bind gateway callbacks to the generation that queued them."""
        supervisor = getattr(self, "connection_supervisor", None)
        if supervisor is None:
            return super()._schedule_event(coro, event_name, *args, **kwargs)
        expected_generation = supervisor.callback_generation()

        async def generation_bound():
            token = _callback_generation.set(expected_generation)
            try:
                await coro(*args, **kwargs)
            finally:
                _callback_generation.reset(token)

        # Preserve discord.py's _run_event/on_error semantics and never alter
        # listener signatures. Cogs may define on_ready without kwargs.
        task = super()._schedule_event(generation_bound, event_name)
        event_tasks = getattr(self, "_gateway_event_tasks", None)
        if event_tasks is None:
            event_tasks = self._gateway_event_tasks = {}
        tasks = event_tasks.setdefault(expected_generation, set())
        tasks.add(task)
        task.add_done_callback(tasks.discard)
        return task

    async def _fence_delivery_application(self) -> None:
        """Clear transport-local staged output on an application identity change."""
        # Test doubles and a pre-login ClientState need not expose the public
        # property backing field yet.
        application_id = getattr(self._connection, "application_id", None)
        if application_id is None or application_id == self._delivery_application_id:
            return
        previous = self._delivery_application_id
        self._delivery_application_id = application_id
        if previous is None:
            return
        pending_files = getattr(self.channel_state, "pending_files", None)
        if pending_files is not None:
            pending_files.clear()
        # Process work remains alive, but it may not inherit presence/delivery
        # bookkeeping from a distinct Discord application.
        self.delivery.active_tasks = 0
        await self.delivery.set_status(None, task_end=True)
        log.warning(
            "Discord application changed from %s to %s; staged deliveries cleared",
            previous,
            application_id,
        )

    def _owns_callback(self, expected_generation: int | None) -> bool:
        supervisor = getattr(self, "connection_supervisor", None)
        return (
            supervisor is None
            or expected_generation is None
            or supervisor.owns(expected_generation)
        )

    async def on_ready(self, *, expected_generation: int | None = None) -> None:
        if expected_generation is None:
            expected_generation = _callback_generation.get()
        if not self._owns_callback(expected_generation):
            return
        supervisor = getattr(self, "connection_supervisor", None)
        log.info("Logged in as %s (ID: %s)", self.user, self.user.id)  # type: ignore[union-attr]  # on_ready fires post-login
        log.info("Tools loaded: %d definitions", len(get_tool_definitions()))
        await self._fence_delivery_application()
        if not self._owns_callback(expected_generation):
            return
        # Prune stale sessions loaded from disk.  load() reads ALL persisted
        # session files regardless of age; pruning here removes expired ones
        # immediately instead of waiting for the first user message.
        pruned = self.sessions.prune()
        if pruned:
            log.info("Startup: pruned %d stale sessions", pruned)
        await self._reconcile_application_commands()
        if not self._owns_callback(expected_generation):
            return
        if supervisor is not None and expected_generation is not None:
            supervisor.transport_ready(expected_generation)
        self.scheduler.start(
            self.scheduled_events._on_scheduled_task,
            self.scheduled_events._on_schedule_failure,
        )
        if self._vector_store:
            fire_and_forget(self._backfill_archives(), name="backfill_archives")
        await self.delivery.set_status(None, task_end=True)

    async def on_guild_join(self, guild: discord.Guild) -> None:
        await self._reconcile_application_commands(guilds=[guild])

    async def on_disconnect(self, *, expected_generation: int | None = None) -> None:
        if expected_generation is None:
            expected_generation = _callback_generation.get()
        supervisor = getattr(self, "connection_supervisor", None)
        if supervisor is not None and expected_generation is not None:
            supervisor.transport_disconnected(expected_generation)

    async def on_resumed(self, *, expected_generation: int | None = None) -> None:
        if expected_generation is None:
            expected_generation = _callback_generation.get()
        if not self._owns_callback(expected_generation):
            return
        await self._reconcile_application_commands()
        if not self._owns_callback(expected_generation):
            return
        supervisor = getattr(self, "connection_supervisor", None)
        if supervisor is not None and expected_generation is not None:
            supervisor.transport_ready(expected_generation)

    async def _reconcile_application_commands(self, guilds=None) -> None:
        """Force Discord's registered commands to match the tree exactly.

        Commands are served as per-guild copies (instant) and the GLOBAL scope
        is reconciled to EMPTY.  The previous per-guild ``copy_global_to`` +
        ``sync(guild=)`` never touched the global scope, and ``copy_global_to``
        is an additive merge, so removed or changed commands lingered for as
        long as their stale global registration lived.  Syncing the tree
        globally instead would register every command twice (Discord shows a
        global and a guild copy side by side), so the desired state is: no
        global commands, and each guild holding exactly the tree.

        Scopes are isolated — one failed guild neither blocks the others nor
        the rest of startup — and remembered per process so a reconnect's
        ``on_ready`` retries only what failed or is new.
        """
        if self._command_snapshot is None:
            # Taken once, before the local global mapping is cleared, and
            # reused for guilds joined later in the process lifetime.
            self._command_snapshot = list(self.tree.get_commands(guild=None))
        commands_ = self._command_snapshot
        names = sorted(cmd.name for cmd in commands_)
        if "global" not in self._synced_command_scopes:
            try:
                self.tree.clear_commands(guild=None)
                await self.tree.sync()
                self._synced_command_scopes.add("global")
                log.info("Slash commands reconciled: global scope cleared")
            except Exception:
                log.exception(
                    "Slash-command sync failed for scope global; guild reconciliation continues"
                )
        for guild in (self.guilds if guilds is None else guilds):
            scope = f"guild:{guild.id}"
            if scope in self._synced_command_scopes:
                continue
            try:
                self.tree.clear_commands(guild=guild)
                for cmd in commands_:
                    self.tree.add_command(cmd, guild=guild)
                await self.tree.sync(guild=guild)
                self._synced_command_scopes.add(scope)
                log.info(
                    "Slash commands reconciled for guild %s (%s): %s",
                    guild.name, guild.id, ", ".join(names),
                )
            except Exception:
                log.exception(
                    "Slash-command sync failed for scope guild %s (%s); "
                    "will retry on a later ready",
                    guild.name, guild.id,
                )

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
