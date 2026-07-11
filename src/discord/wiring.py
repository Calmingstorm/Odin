"""Composition root for OdinBot (RFC-001 Phase 1).

``build_services(config)`` constructs every bot-independent subsystem in
the exact order ``OdinBot.__init__`` historically did — order matters
(trajectory savers before the loop bridge, permissions/host-access before
the executor, search stores before sessions, scheduler before
``skill_manager.set_services``). Construction that needs the live bot
instance (infra-watcher callback, LLM callback wiring,
slash commands, the first system-prompt build) stays in ``OdinBot.__init__``.

``shutdown_services(bot)`` is the teardown mirror, moved verbatim from
``OdinBot.close()``. It takes the bot rather than a ``BotServices`` because
several torn-down attributes are late-bound on the bot (``health_server``),
lazily created on the executor (``_process_registry``), or reached via
property alias (``knowledge``), and
because teardown must keep working mid-campaign no matter which phase last
moved a subsystem.
"""

from __future__ import annotations

import asyncio
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from ..agents import AgentManager, LoopAgentBridge
from ..agents.trajectory import AgentTrajectorySaver
from ..audit import AuditLogger
from ..audit.diff_tracker import DiffTracker
from ..config.schema import Config
from ..context import ContextLoader
from ..health.subsystem_guard import SubsystemGuard
from ..knowledge import KnowledgeStore
from ..learning import ConversationReflector
from ..learning.loop_reflection import LoopReflectionGate
from ..llm import CodexChatClient, KimiClient, OllamaClient
from ..llm.codex_auth import CodexAuthPool
from ..llm.cost_tracker import CostTracker
from ..odin_log import get_logger
from ..permissions import PermissionManager
from ..permissions.host_access import HostAccessManager
from ..permissions.token_manager import ApiTokenManager
from ..scheduler import Scheduler
from ..search import LocalEmbedder, SessionVectorStore
from ..sessions import SessionManager
from ..tools import SkillManager, ToolExecutor
from ..tools.autonomous_loop import LoopManager
from ..trajectories.saver import TrajectorySaver
from .channel_config import ChannelConfigManager
from .channel_logger import ChannelLogger
from .channel_state import ChannelStateRegistry
from .completion import CompletionClassifier
from .delivery import ResponseDelivery
from .housekeeping import Housekeeping
from .intake_pipeline import (
    MessageIntake,
    MessageIntakeDeps,
    MessagePipeline,
    MessagePipelineDeps,
)
from .llm_gateway import LLMGateway
from .native_tools import NativeToolDispatcher, register_native_handlers
from .native_tools.agents_tasks import AgentTaskDeps, AgentTaskTools
from .native_tools.channel_ops import ChannelOpsTools
from .native_tools.knowledge import KnowledgeTools
from .native_tools.media import MediaTools
from .native_tools.scheduling import SchedulingTools
from .prompts import PromptBuilder
from .scheduled_events import ScheduledEventHandlers, ScheduledEventsDeps
from .tool_catalog import ToolCatalog
from .tool_loop import ToolLoopDeps, ToolLoopRunner
from .turn_recorder import TurnRecorder

log = get_logger("discord")


@dataclass
class BotServices:
    """Every bot-independent subsystem, constructed in dependency order."""

    channel_state: ChannelStateRegistry
    context_loader: ContextLoader
    reflector: ConversationReflector
    embedder: LocalEmbedder | None
    fts_index: object | None
    vector_store: SessionVectorStore | None
    knowledge_store: KnowledgeStore | None
    sessions: SessionManager
    memory_path: str
    channel_config: ChannelConfigManager
    channel_logger: ChannelLogger
    browser_manager: object | None
    host_access_manager: HostAccessManager
    permissions: PermissionManager
    tool_executor: ToolExecutor
    skill_manager: SkillManager
    codex_client: CodexChatClient | None
    ollama_client: OllamaClient | None
    kimi_client: KimiClient | None
    scheduler: Scheduler
    audit: AuditLogger
    api_token_manager: ApiTokenManager
    agent_manager: AgentManager
    loop_manager: LoopManager
    trajectory_saver: TrajectorySaver
    agent_trajectory_saver: AgentTrajectorySaver
    loop_agent_bridge: LoopAgentBridge
    loop_reflection_gate: LoopReflectionGate
    cost_tracker: CostTracker
    subsystem_guard: SubsystemGuard
    diff_tracker: DiffTracker
    model_router: object | None
    context_compressor: object | None
    prefix_tracker: object | None
    auxiliary_llm_client: object | None
    outbound_webhook_dispatcher: object | None
    run_startup_diagnostics: Callable
    stuck_loop_tracker_cls: type
    classify_command_risk: Callable
    classify_tool_risk: Callable


def build_services(config: Config) -> BotServices:  # noqa: PLR0915 — linear composition root
    # Configure timezone for time parser module
    from ..tools.time_parser import set_default_timezone

    set_default_timezone(config.timezone)

    # Per-channel mutable state — bot-independent, so it belongs here
    # (RFC-002 P2; the bot keeps facade aliases to its dicts until P7).
    channel_state = ChannelStateRegistry()

    # Multi-agent orchestration
    agent_manager = AgentManager()
    # Autonomous loop manager (agent-aware)
    loop_manager = LoopManager(agents_enabled=True)
    # Trajectory savers — constructed before the loop bridge, which
    # forwards the agent saver into loop-spawned agents
    trajectory_saver = TrajectorySaver()
    agent_trajectory_saver = AgentTrajectorySaver()
    # Loop-agent bridge for spawning agents from loop iterations
    loop_agent_bridge = LoopAgentBridge(
        agent_manager,
        trajectory_saver=agent_trajectory_saver,
    )
    # Reflection gate for loop iterations — dedup/cooldown so repeated
    # identical failures teach one lesson, not one per minute
    loop_reflection_gate = LoopReflectionGate(
        cooldown_hours=getattr(config.learning, "loop_reflection_cooldown_hours", 12.0),
        max_per_hour=getattr(config.learning, "loop_reflection_max_per_hour", 10),
    )

    context_loader = ContextLoader(config.context.directory)
    context_loader.load()

    reflector = ConversationReflector(
        learned_path="./data/learned.json",
        max_entries=config.learning.max_entries,
        consolidation_target=config.learning.consolidation_target,
        injection_token_budget=config.learning.injection_token_budget,
        enabled=config.learning.enabled,
    )

    # Semantic search + FTS5 components
    vector_store: SessionVectorStore | None = None
    embedder: LocalEmbedder | None = None
    knowledge_store: KnowledgeStore | None = None
    fts_index = None
    if config.search.enabled:
        embedder = LocalEmbedder()
        # Initialize FTS5 index (SQLite, no external deps)
        search_db_path = config.search.search_db_path
        fts_db_path = str(Path(search_db_path).parent / "fts.db")
        from ..search.fts import FullTextIndex

        fts_index = FullTextIndex(fts_db_path)
        if not fts_index.available:
            fts_index = None

        # Always initialize stores — they work in FTS-only mode even without
        # sqlite-vec or embedder. Don't null them out on vec init failure.
        Path(search_db_path).mkdir(parents=True, exist_ok=True)
        session_db = str(Path(search_db_path) / "sessions.db")
        knowledge_db = str(Path(search_db_path) / "knowledge.db")

        vector_store = SessionVectorStore(session_db, fts_index=fts_index)
        if not vector_store.available:
            vector_store = None
        knowledge_store = KnowledgeStore(knowledge_db, fts_index=fts_index)
        if not knowledge_store.available:
            knowledge_store = None

    sessions = SessionManager(
        max_history=config.sessions.max_history,
        max_age_hours=config.sessions.max_age_hours,
        persist_dir=config.sessions.persist_directory,
        reflector=reflector,
        vector_store=vector_store,
        embedder=embedder,
        token_budget=config.sessions.token_budget,
        adaptive_compaction=config.sessions.adaptive_compaction,
        archive_max_bytes=config.sessions.archive_max_bytes,
        archive_max_files=config.sessions.archive_max_files,
        context_token_budget=config.sessions.context_token_budget,
        context_budget_overrides=config.sessions.context_budget_overrides,
    )
    sessions.load()

    memory_path = "./data/memory.json"
    channel_config = ChannelConfigManager("./data/channel_config.json")

    # Passive channel logger — writes ALL guild messages to JSONL (zero LLM tokens)
    channel_logger = ChannelLogger("./data/channel_logs")
    sessions.set_channel_search(channel_logger, fts_index)

    # Browser automation
    browser_manager = None
    if config.browser.enabled:
        from ..tools.browser import BrowserManager

        browser_manager = BrowserManager(
            cdp_url=config.browser.cdp_url,
            default_timeout_ms=config.browser.default_timeout_ms,
            viewport_width=config.browser.viewport_width,
            viewport_height=config.browser.viewport_height,
            allow_private_targets=config.browser.allow_private_targets,
        )

    from ..tools.output_streamer import ToolOutputStreamer

    streaming_cfg = config.tools.streaming
    output_streamer = None
    if streaming_cfg.enabled:
        enabled_tools = (
            set(streaming_cfg.tools)
            if streaming_cfg.tools
            else {"run_command", "run_script", "claude_code"}
        )
        output_streamer = ToolOutputStreamer(
            enabled_tools=enabled_tools,
            chunk_interval=streaming_cfg.chunk_interval_seconds,
            max_chunk_chars=streaming_cfg.max_chunk_chars,
        )

    host_access_manager = HostAccessManager(
        path="./data/host_access.json",
        available_hosts=list(config.tools.hosts.keys()),
    )

    # Built before ToolExecutor so it can be wired in as the RBAC gate.
    permissions = PermissionManager(
        config_tiers=config.permissions.tiers,
        default_tier=config.permissions.default_tier,
        overrides_path=config.permissions.overrides_path,
    )

    tool_executor = ToolExecutor(
        config.tools,
        memory_path=memory_path,
        browser_manager=browser_manager,
        output_streamer=output_streamer,
        host_access_manager=host_access_manager,
        email_config=getattr(config, "email", None),
        permission_manager=permissions,
    )
    skill_manager = SkillManager(
        skills_dir="./data/skills",
        tool_executor=tool_executor,
        memory_path=memory_path,
        tool_timeouts=config.tools.tool_timeouts,
    )

    # Apply skill URL allowlist from config
    if config.tools.skill_allowed_urls:
        from ..tools.skill_context import set_skill_allowed_urls

        set_skill_allowed_urls(config.tools.skill_allowed_urls)

    # Initialize Codex client if configured
    codex_client: CodexChatClient | None = None
    if config.openai_codex.enabled:
        codex_auth = CodexAuthPool(config.openai_codex.credentials_path)
        if codex_auth.is_configured():
            codex_client = CodexChatClient(
                auth=codex_auth,
                model=config.openai_codex.model,
                max_tokens=config.openai_codex.max_tokens,
                reasoning_effort=config.openai_codex.reasoning_effort,
                max_retries=config.openai_codex.retry.max_retries,
                retry_base_delay=config.openai_codex.retry.base_delay,
                retry_max_delay=config.openai_codex.retry.max_delay,
                pool_max_connections=config.openai_codex.connection_pool.max_connections,
                pool_keepalive_timeout=config.openai_codex.connection_pool.keepalive_timeout,
                request_timeout=config.openai_codex.request_timeout_seconds,
                stream_stall_timeout=config.openai_codex.stream_stall_timeout_seconds,
            )
            log.info("Codex backend enabled (model: %s)", config.openai_codex.model)
        else:
            log.warning(
                "Codex enabled in config but no credentials found. Run scripts/codex_login.py"
            )

    # Initialize Ollama client if configured
    ollama_client: OllamaClient | None = None
    ollama_cfg = getattr(config, "ollama", None)
    if ollama_cfg and ollama_cfg.enabled:
        ollama_client = OllamaClient(
            base_url=ollama_cfg.base_url,
            model=ollama_cfg.model,
            max_tokens=ollama_cfg.max_tokens,
            timeout=ollama_cfg.timeout,
            api_key=ollama_cfg.api_key,
        )
        log.info(
            "Ollama backend enabled (model: %s, url: %s)", ollama_cfg.model, ollama_cfg.base_url
        )

    # Initialize Kimi client if configured
    kimi_client: KimiClient | None = None
    kimi_cfg = getattr(config, "kimi", None)
    if kimi_cfg and kimi_cfg.enabled and kimi_cfg.api_key:
        kimi_client = KimiClient(
            api_key=kimi_cfg.api_key,
            model=kimi_cfg.model,
            max_tokens=kimi_cfg.max_tokens,
            timeout=kimi_cfg.timeout,
        )
        log.info("Kimi backend enabled (model: %s)", kimi_cfg.model)
    elif kimi_cfg and kimi_cfg.enabled and not kimi_cfg.api_key:
        log.warning("Kimi enabled in config but no api_key set")

    scheduler = Scheduler(data_path="./data/schedules.json")

    # Audit logger — HMAC chain signing is on iff config.audit.hmac_key is set
    _audit_key = config.audit.hmac_key if getattr(config, "audit", None) else ""
    audit = AuditLogger(
        path="./data/audit.jsonl",
        hmac_key=_audit_key,
        classify_failures=getattr(
            getattr(config, "observability", None),
            "audit_failure_classification",
            True,
        ),
    )
    if getattr(config, "audit", None) is not None and not _audit_key:
        log.warning(
            "Audit HMAC signing is DISABLED (config.audit.hmac_key is empty): "
            "audit.jsonl is NOT tamper-evident and verify_integrity() will fail. "
            "Set audit.hmac_key to enable the integrity chain — enabling later is "
            "safe: pre-enablement history is reported as unsigned_prefix and the "
            "chain is verified from the first signed entry."
        )
    api_token_manager = ApiTokenManager("./data/api_tokens.json")

    # Wire optional services into skill manager for expanded skill context
    skill_manager.set_services(
        knowledge_store=knowledge_store,
        embedder=embedder,
        session_manager=sessions,
        scheduler=scheduler,
    )

    # Cost tracking — always on, near-zero overhead.
    cost_tracker = CostTracker()

    # Stuck-loop tracker — instantiated per-iteration in the tool loop, but
    # store the class for tests and external introspection.
    from .response_guards import StuckLoopTracker

    # Subsystem guard — tracks per-subsystem health. Always on.
    _gd = getattr(config, "graceful_degradation", None)
    if _gd is not None:
        subsystem_guard = SubsystemGuard(
            degraded_threshold=_gd.degraded_threshold,
            unavailable_threshold=_gd.unavailable_threshold,
        )
    else:
        subsystem_guard = SubsystemGuard()
    for _name in (
        "llm_codex",
        "llm_ollama",
        "llm_kimi",
        "codex",
        "ssh",
        "knowledge",
        "browser",
        "comfyui",
    ):
        subsystem_guard.register(_name)

    # Action diff tracker — records before→after diffs. Always on.
    diff_tracker = DiffTracker()

    # Risk classifier — observability only, never blocks.
    from ..tools.risk_classifier import classify_command, classify_tool

    # Model router — heuristic-first, LLM fallback. Off by default.
    model_router = None
    _routing = getattr(config.openai_codex, "model_routing", None)
    if _routing and _routing.enabled:
        from ..llm.model_router import ModelRouter

        model_router = ModelRouter(
            enabled=True,
            confidence_threshold=_routing.confidence_threshold,
            max_cheap_length=_routing.max_cheap_length,
            strong_intents=frozenset(_routing.strong_intents),
        )

    # Context compressor — summarizes prior tool iterations when context grows.
    context_compressor = None
    prefix_tracker = None
    _compress = getattr(config.openai_codex, "context_compression", None)
    if _compress and _compress.enabled:
        from ..llm.context_compressor import PrefixTracker

        prefix_tracker = PrefixTracker()
        context_compressor = _compress  # config object itself acts as the on/off + thresholds

    # Auxiliary LLM client — cheap-model wrapper. Off unless enabled.
    auxiliary_llm_client = None
    _aux = getattr(config.openai_codex, "auxiliary", None)
    if _aux and _aux.enabled and codex_client:
        try:
            from ..llm.auxiliary import AuxiliaryLLMClient

            aux_creds = _aux.credentials_path or config.openai_codex.credentials_path
            aux_auth = CodexAuthPool(aux_creds)
            if aux_auth.is_configured():
                aux_client = CodexChatClient(
                    auth=aux_auth,
                    model=_aux.model,
                    max_tokens=_aux.max_tokens,
                    max_retries=config.openai_codex.retry.max_retries,
                    retry_base_delay=config.openai_codex.retry.base_delay,
                    retry_max_delay=config.openai_codex.retry.max_delay,
                    pool_max_connections=config.openai_codex.connection_pool.max_connections,
                    pool_keepalive_timeout=config.openai_codex.connection_pool.keepalive_timeout,
                    request_timeout=config.openai_codex.request_timeout_seconds,
                    stream_stall_timeout=config.openai_codex.stream_stall_timeout_seconds,
                )
                auxiliary_llm_client = AuxiliaryLLMClient(
                    aux_client=aux_client,
                    primary_client=codex_client,
                    cost_tracker=cost_tracker,
                )
                log.info("Auxiliary LLM client enabled (model: %s)", _aux.model)
        except Exception:
            log.exception("Failed to initialize auxiliary LLM client")

    # Outbound webhook dispatcher — lifecycle event push. Off unless enabled.
    outbound_webhook_dispatcher = None
    if getattr(config, "outbound_webhooks", None) and config.outbound_webhooks.enabled:
        from ..notifications.outbound_webhooks import OutboundWebhookDispatcher

        outbound_webhook_dispatcher = OutboundWebhookDispatcher(
            scrub_secrets=config.outbound_webhooks.scrub_secrets,
            rate_limit_seconds=config.outbound_webhooks.rate_limit_seconds,
        )
        for tgt in getattr(config.outbound_webhooks, "targets", []) or []:
            try:
                outbound_webhook_dispatcher.register(
                    name=tgt.name,
                    url=tgt.url,
                    secret=tgt.secret,
                    events=tgt.events or None,
                    enabled=tgt.enabled,
                )
            except Exception:
                log.exception("Failed to register outbound webhook target")

    # Startup diagnostics — function reference; called from setup_hook.
    from ..health.startup import run_startup_diagnostics

    # Register user-created personality presets from config before first prompt build
    if hasattr(config, "personality") and config.personality.user_presets:
        from src.llm.system_prompt import register_user_presets

        register_user_presets(
            {
                k: {"name": v.name, "identity": v.identity, "voice": v.voice}
                for k, v in config.personality.user_presets.items()
            }
        )

    return BotServices(
        channel_state=channel_state,
        context_loader=context_loader,
        reflector=reflector,
        embedder=embedder,
        fts_index=fts_index,
        vector_store=vector_store,
        knowledge_store=knowledge_store,
        sessions=sessions,
        memory_path=memory_path,
        channel_config=channel_config,
        channel_logger=channel_logger,
        browser_manager=browser_manager,
        host_access_manager=host_access_manager,
        permissions=permissions,
        tool_executor=tool_executor,
        skill_manager=skill_manager,
        codex_client=codex_client,
        ollama_client=ollama_client,
        kimi_client=kimi_client,
        scheduler=scheduler,
        audit=audit,
        api_token_manager=api_token_manager,
        agent_manager=agent_manager,
        loop_manager=loop_manager,
        trajectory_saver=trajectory_saver,
        agent_trajectory_saver=agent_trajectory_saver,
        loop_agent_bridge=loop_agent_bridge,
        loop_reflection_gate=loop_reflection_gate,
        cost_tracker=cost_tracker,
        subsystem_guard=subsystem_guard,
        diff_tracker=diff_tracker,
        model_router=model_router,
        context_compressor=context_compressor,
        prefix_tracker=prefix_tracker,
        auxiliary_llm_client=auxiliary_llm_client,
        outbound_webhook_dispatcher=outbound_webhook_dispatcher,
        run_startup_diagnostics=run_startup_diagnostics,
        stuck_loop_tracker_cls=StuckLoopTracker,
        classify_command_risk=classify_command,
        classify_tool_risk=classify_tool,
    )


@dataclass
class BotComponents:
    """Every bot-coupled component, constructed in dependency order (RFC-002 P2)."""

    llm_gateway: LLMGateway
    prompt_builder: PromptBuilder
    tool_catalog: ToolCatalog
    native_tools: NativeToolDispatcher
    scheduling_tools: SchedulingTools
    knowledge_tools: KnowledgeTools
    channel_ops_tools: ChannelOpsTools
    media_tools: MediaTools
    delivery: ResponseDelivery
    completion_classifier: CompletionClassifier
    turn_recorder: TurnRecorder
    tool_loop: ToolLoopRunner
    scheduled_events: ScheduledEventHandlers
    agent_task_tools: AgentTaskTools
    housekeeping: Housekeeping
    pipeline: MessagePipeline
    intake: MessageIntake


def build_components(bot, services: BotServices) -> BotComponents:
    """Bot-coupled component assembly — moved verbatim from ``OdinBot.__init__``
    (RFC-002 P2), in the exact construction order it used.

    "Bot-coupled" means exactly: live hot-reloadable roots read via provider
    callables (``bot.config`` is replaced by config hot-reload, the provider
    clients by live auth reloads), Discord-client operations
    (``change_presence``, ``get_channel``), and — until P3/P4 narrow them —
    the classes that still take the bot as ``host``.
    """
    # LLM provider management (RFC-001 P4) — the gateway owns the provider
    # clients and switch state; codex_client/ollama_client/kimi_client on
    # the bot are property shims over it.
    llm_gateway = LLMGateway(
        get_config=lambda: bot.config,
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
    if llm_gateway.active_client is not None:
        llm_gateway.wire_callbacks()

    # Prompt assembly + tool catalog (RFC-001 P3). Bot-coupled because they
    # must read LIVE hot-reloadable state: bot.config is replaced by the web
    # API's config hot-reload and the codex client by live auth reloads —
    # hence provider callables, not captured references.
    prompt_builder = PromptBuilder(
        get_config=lambda: bot.config,
        context_loader=services.context_loader,
        reflector=services.reflector,
        skill_manager=services.skill_manager,
        tool_executor=services.tool_executor,
        channel_state=services.channel_state,
        get_codex_client=lambda: llm_gateway.codex_client,
    )
    tool_catalog = ToolCatalog(
        get_config=lambda: bot.config,
        skill_manager=services.skill_manager,
    )
    # A live provider switch must rebuild the tool registry so provider-gated
    # tools (native image gen is Codex-only) reappear/disappear immediately.
    llm_gateway.on_provider_switch = tool_catalog.invalidate

    # Domain handler bundles (P5b) — built BEFORE the dispatcher so they can
    # be its owners (RFC-002 P5).
    scheduling_tools = SchedulingTools(scheduler=services.scheduler)
    knowledge_tools = KnowledgeTools(
        sessions=services.sessions,
        # live: swappable at runtime via the bot's `knowledge` property
        get_knowledge_store=lambda: bot.knowledge,
        embedder=services.embedder,
        audit=services.audit,
    )
    channel_ops_tools = ChannelOpsTools(
        sessions=services.sessions,
        permissions=services.permissions,
        get_channel=bot.get_channel,
    )
    # Image-generation backends behind one selector. Native OpenAI rides the
    # SAME CodexAuthPool the codex client uses (no separate auth). It resolves
    # that pool via the gateway at CALL time — a live Codex login/reload replaces
    # the client, so a snapshot would run on stale/absent credentials. Always
    # built; is_configured() reports false until a pool exists.
    from ..tools.image import (
        ComfyUIImageBackend,
        ImageBackendSelector,
        OpenAIImageBackend,
    )

    openai_image_backend = OpenAIImageBackend(
        get_auth=lambda: getattr(llm_gateway.codex_client, "auth", None),
        get_config=lambda: bot.config,
    )
    image_selector = ImageBackendSelector(
        get_config=lambda: bot.config,
        openai_backend=openai_image_backend,
        comfyui_backend=ComfyUIImageBackend(get_config=lambda: bot.config),
    )

    media_tools = MediaTools(
        get_config=lambda: bot.config,
        browser_manager=services.browser_manager,
        tool_executor=services.tool_executor,
        image_selector=image_selector,
    )

    # One Discord-native dispatch table for both pipelines (RFC-001 P5a);
    # handlers bind to the domain OWNERS late (RFC-002 P5). The agents
    # domain is attached below after the tool loop exists (agents ->
    # tool_loop -> dispatcher is the one construction cycle); registration
    # runs after that attach, so it can assert every owner is present.
    native_tools = NativeToolDispatcher(
        owners={
            "scheduling": scheduling_tools,
            "knowledge": knowledge_tools,
            "channel_ops": channel_ops_tools,
            "media": media_tools,
        },
        skill_manager=services.skill_manager,
        tool_catalog=tool_catalog,
        prompt_builder=prompt_builder,
        channel_state=services.channel_state,
    )
    delivery = ResponseDelivery(
        channel_state=services.channel_state,
        change_presence=bot.change_presence,
    )
    completion_classifier = CompletionClassifier(
        get_llm_client=lambda: llm_gateway.active_client,
    )
    # Narrow-deps components (RFC-002 P3/P4). Construction order notes:
    # the turn recorder builds BEFORE the tool loop (its consumer), and the
    # agents/tasks domain BEFORE scheduled events (its consumer) — declared
    # deviations from the old inline order, where all were inert `host`
    # captures.
    turn_recorder = TurnRecorder(
        get_config=lambda: bot.config,
        trajectory_saver=services.trajectory_saver,
        reflector=services.reflector,
        outbound_webhook_dispatcher=services.outbound_webhook_dispatcher,
        loop_reflection_gate=services.loop_reflection_gate,
    )
    tool_loop = ToolLoopRunner(
        ToolLoopDeps(
            get_config=lambda: bot.config,
            # live: the web layer rebuilds it via prompt_builder.rebuild_default()
            get_default_system_prompt=lambda: prompt_builder.default_prompt,
            get_context_compressor=lambda: bot.context_compressor,
            llm_gateway=llm_gateway,
            prompt_builder=prompt_builder,
            tool_catalog=tool_catalog,
            channel_state=services.channel_state,
            delivery=delivery,
            turn_recorder=turn_recorder,
            completion_classifier=completion_classifier,
            native_tools=native_tools,
            tool_executor=services.tool_executor,
            permissions=services.permissions,
            skill_manager=services.skill_manager,
            audit=services.audit,
            loop_manager=services.loop_manager,
            stuck_loop_tracker_cls=services.stuck_loop_tracker_cls,
        )
    )
    agent_task_tools = AgentTaskTools(
        AgentTaskDeps(
            get_config=lambda: bot.config,
            llm_gateway=llm_gateway,
            channel_state=services.channel_state,
            tool_executor=services.tool_executor,
            skill_manager=services.skill_manager,
            # live: swappable at runtime via the bot's `knowledge` property
        get_knowledge_store=lambda: bot.knowledge,
            embedder=services.embedder,
            audit=services.audit,
            agent_manager=services.agent_manager,
            loop_manager=services.loop_manager,
            loop_agent_bridge=services.loop_agent_bridge,
            agent_trajectory_saver=services.agent_trajectory_saver,
            # live read through the bot: never reassigned in production today,
            # but the chat pipeline reads it the same way and tests swap it
            get_context_compressor=lambda: bot.context_compressor,
            tool_loop=tool_loop,
            turn_recorder=turn_recorder,
            prompt_builder=prompt_builder,
            tool_catalog=tool_catalog,
        )
    )
    # Second phase of the P5 owner wiring: the agents domain exists now.
    native_tools.owners["agents"] = agent_task_tools
    register_native_handlers(native_tools)

    scheduled_events = ScheduledEventHandlers(
        ScheduledEventsDeps(
            get_config=lambda: bot.config,
            # late-bound through the bot: tests (and any future hot swap)
            # replace bot.get_channel per-instance — a captured bound method
            # would go stale (caught by characterization when first captured)
            get_channel=lambda cid: bot.get_channel(cid),
            get_guilds=lambda: bot.guilds,
            tool_executor=services.tool_executor,
            audit=services.audit,
            llm_gateway=llm_gateway,
            tool_loop=tool_loop,
            agent_task_tools=agent_task_tools,
        )
    )
    housekeeping = Housekeeping(
        get_config=lambda: bot.config,
        sessions=services.sessions,
        channel_state=services.channel_state,
        prompt_builder=prompt_builder,
        agent_manager=services.agent_manager,
        loop_manager=services.loop_manager,
        loop_agent_bridge=services.loop_agent_bridge,
        channel_logger=services.channel_logger,
        fts_index=services.fts_index,
    )
    pipeline = MessagePipeline(
        MessagePipelineDeps(
            channel_state=services.channel_state,
            sessions=services.sessions,
            permissions=services.permissions,
            llm_gateway=llm_gateway,
            prompt_builder=prompt_builder,
            turn_recorder=turn_recorder,
            tool_loop=tool_loop,
            delivery=delivery,
            housekeeping=housekeeping,
        )
    )
    intake = MessageIntake(
        MessageIntakeDeps(
            get_config=lambda: bot.config,
            get_user=lambda: bot.user,
            process_commands=lambda message: bot.process_commands(message),
            channel_logger=services.channel_logger,
            channel_config=services.channel_config,
            channel_state=services.channel_state,
            sessions=services.sessions,
            pipeline=pipeline,
        )
    )

    return BotComponents(
        llm_gateway=llm_gateway,
        prompt_builder=prompt_builder,
        tool_catalog=tool_catalog,
        native_tools=native_tools,
        scheduling_tools=scheduling_tools,
        knowledge_tools=knowledge_tools,
        channel_ops_tools=channel_ops_tools,
        media_tools=media_tools,
        delivery=delivery,
        completion_classifier=completion_classifier,
        turn_recorder=turn_recorder,
        tool_loop=tool_loop,
        scheduled_events=scheduled_events,
        agent_task_tools=agent_task_tools,
        housekeeping=housekeeping,
        pipeline=pipeline,
        intake=intake,
    )


async def shutdown_services(bot) -> None:
    """Stop services and persist state — moved verbatim from OdinBot.close().

    Component attributes are looked up via getattr because they may not be
    present (some are config-gated, some late-bound). Order matters: stop
    work-producers before consumers, and persist user-visible state
    (sessions) last.
    """
    loop_manager = getattr(bot, "loop_manager", None)
    if loop_manager is not None:
        try:
            # shutdown() cancels AND awaits loop tasks; stop_loop("all")
            # only set cancel events, leaving tasks pending at process
            # exit ("Task was destroyed but it is pending").
            await loop_manager.shutdown()
        except Exception:
            log.exception("Error stopping loop_manager")

    scheduler = getattr(bot, "scheduler", None)
    if scheduler is not None:
        try:
            await scheduler.stop()
        except Exception:
            log.exception("Error stopping scheduler")

    health_server = getattr(bot, "health_server", None)
    if health_server is not None:
        try:
            await health_server.stop()
        except Exception:
            log.exception("Error stopping health_server")

    # The ProcessRegistry is created lazily ON the executor
    # (ToolExecutor._ensure_process_registry); read the private attribute —
    # the same seam the web API uses — so teardown never instantiates a
    # registry that was never used.
    tool_executor = getattr(bot, "tool_executor", None)
    process_registry = getattr(tool_executor, "_process_registry", None)
    if process_registry is not None:
        try:
            await process_registry.shutdown()
        except Exception:
            log.exception("Error shutting down process_registry")

    knowledge = getattr(bot, "knowledge", None)
    if knowledge is not None:
        try:
            knowledge.close()
        except Exception:
            log.exception("Error closing knowledge")

    sessions = getattr(bot, "sessions", None)
    if sessions is not None:
        try:
            sessions.save_all()
        except Exception:
            log.exception("Error saving sessions")

    # Outbound webhook session cleanup (lazily created; only present after first dispatch)
    dispatcher = getattr(bot, "outbound_webhook_dispatcher", None)
    if dispatcher is not None:
        try:
            await dispatcher.close()
        except Exception:
            log.exception("Error closing outbound_webhook_dispatcher")

    # Kill all active agents and clean up
    agent_mgr = getattr(bot, "agent_manager", None)
    if agent_mgr is not None:
        try:
            active = [a for a in agent_mgr._agents.values() if a._sm.is_active]
            agent_tasks = [a._task for a in active if getattr(a, "_task", None) is not None]
            for agent in active:
                agent_mgr.kill(agent.id, cascade=True)
            # Await the cancelled agent tasks so their finally-blocks run
            # (trajectory save) before the process exits, instead of
            # leaving them pending.
            if agent_tasks:
                try:
                    await asyncio.wait_for(
                        asyncio.gather(*agent_tasks, return_exceptions=True),
                        10.0,
                    )
                except TimeoutError:
                    log.warning(
                        "Shutdown: %d agent task(s) did not finish in 10s", len(agent_tasks)
                    )
            await agent_mgr.cleanup()
            log.info("Shutdown: killed %d active agent(s)", len(active))
        except Exception:
            log.exception("Error cleaning up agent_manager")

    # Close SSH connection pool — release ControlMaster sockets
    executor = getattr(bot, "tool_executor", None)
    if executor is not None:
        pool = getattr(executor, "ssh_pool", None)
        if pool is not None:
            try:
                await pool.close_all()
            except Exception:
                log.exception("Error closing SSH pool")

    # Close auxiliary LLM client
    aux = getattr(bot, "auxiliary_llm_client", None)
    if aux is not None:
        try:
            await aux.close()
        except Exception:
            log.exception("Error closing auxiliary LLM client")

    # Close LLM HTTP client sessions — read through the gateway: the
    # per-provider bot properties were retired in RFC-002 P7, and the
    # gateway holds the LIVE clients (reloads replace them there).
    gateway = getattr(bot, "llm_gateway", None)
    codex = getattr(gateway, "codex_client", None)
    if codex is not None:
        try:
            await codex.close()
        except Exception:
            log.exception("Error closing Codex client")

    ollama = getattr(gateway, "ollama_client", None)
    if ollama is not None:
        try:
            await ollama.close()
        except Exception:
            log.exception("Error closing Ollama client")

    kimi = getattr(gateway, "kimi_client", None)
    if kimi is not None:
        try:
            await kimi.close()
        except Exception:
            log.exception("Error closing Kimi client")

    # Close the native image backend's own HTTP session (separate transport
    # from the codex chat client, so it isn't covered by codex.close()).
    _components = getattr(bot, "components", None)
    _media = getattr(_components, "media_tools", None)
    _selector = getattr(_media, "image_selector", None)
    _image_backend = getattr(_selector, "openai", None)
    if _image_backend is not None:
        try:
            await _image_backend.close()
        except Exception:
            log.exception("Error closing image backend")

    # Shut down Playwright browser
    browser = getattr(bot, "browser_manager", None)
    if browser is not None:
        try:
            await browser.shutdown()
        except Exception:
            log.exception("Error shutting down browser_manager")
