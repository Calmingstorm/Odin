"""The chat + autonomous tool-execution pipelines (RFC-001 P7/P8, RFC-002 P1).

``ToolLoopRunner.run`` is the old ``OdinBot._process_with_tools`` — the
iteration loop with context compression, the response-guard cascade,
stuck-loop tracking, completion continuations, validation enforcement,
parallel tool execution with timeouts, audit/trajectory recording, vision
injection, skill handoff, and /stop cancellation. ``run_autonomous`` is
the loop-iteration pipeline sharing the same dispatch table.

RFC-002 P1 carved both entry points into phase methods around per-turn
state objects (``_ChatTurn`` / ``_LoopTurn``): every statement of the old
bodies lands verbatim in exactly one phase method, with closure locals
renamed to same-named turn-state fields (the mechanical map + AST gate
ship with the P1 PR). Phase methods return ``("done", value)`` when the
turn must return, ``("retry", None)``/None to continue — control flow
stays in the two orchestrators.

Narrow-deps since RFC-002 P4 (``ToolLoopDeps``): live roots come in as
provider callables (``get_config``, the default system prompt, the
compression config), the LLM surface as the gateway, and the rest as the
components/services the two pipelines actually touch. The chat-vs-loop
behavioral asymmetries stay pinned as LoopPolicy data + control flow
(RFC-001 §4.3) — do not unify a documented dimension without a
characterization pin.
"""

from __future__ import annotations

import asyncio
import time
import unicodedata
from collections.abc import Callable
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, Literal

import discord

from ..agents.wait_deadlines import (
    WAIT_FOR_AGENTS_NATIVE_GRACE_SECONDS,
    wait_for_agents_wrapper_timeout,
)
from ..error_presentation import format_user_facing_error
from ..llm import CircuitOpenError
from ..llm.context_budget import (
    DEFAULT_DENSITY_MILLI,
    ContextBudgetSnapshot,
    snapshot_for_codex_config,
)
from ..llm.context_compressor import SurfaceBoundary
from ..llm.errors import LLMCapacityError, LLMRequestError
from ..llm.recovery import generate_with_recovery, preflight_incompatible_effort
from ..llm.secret_scrubber import scrub_output_secrets
from ..observability.correlation import get_turn, set_turn
from ..odin_log import get_logger
from ..tools import ToolResult
from ..tools.effect_classifier import ToolEffectClass, classify_tool_effect
from ..tools.output_streamer import current_call_id as _current_call_id
from ..turn_state import LedgerIntentError
from ..turn_state.durability import TurnDurability

if TYPE_CHECKING:
    from ..audit.logger import AuditLogger
    from ..observability.context_trace import ContextTraceCollector
    from ..permissions.manager import PermissionManager
    from ..tools.autonomous_loop import LoopManager
    from ..tools.executor import ToolExecutor
    from ..tools.mcp import MCPManager
    from ..tools.skill_manager import SkillManager
    from ..trajectories.saver import TrajectoryTurn
    from .channel_config import ChannelConfigManager
    from .channel_state import ChannelStateRegistry
    from .completion import CompletionClassifier
    from .delivery import ResponseDelivery
    from .llm_gateway import LLMGateway
    from .native_tools.registry import NativeToolDispatcher
    from .prompts import PromptBuilder
    from .response_guards import StuckLoopTracker
    from .tool_catalog import ToolCatalog
    from .turn_recorder import TurnRecorder
from .delivery import DISCORD_MAX_LEN, TOOL_STATUS_LABELS
from .llm_gateway import LLMServingIdentity
from .mcp_dispatch import dispatch_mcp_tool, is_mcp_tool
from .mcp_dispatch import uncertain_outcome as _mcp_uncertain
from .response_guards import (
    _CODE_HEDGING_RETRY_MSG,
    _CONTINUATION_MSG,
    _FABRICATION_RETRY_MSG,
    _FAILURE_RETRY_MSG,
    _HEDGING_RETRY_MSG,
    _PROMISE_RETRY_MSG,
    _TOOL_UNAVAIL_RETRY_MSG,
    _WAIT_AGENTS_NUDGE,
    _WAIT_PROCESS_NUDGE,
    detect_code_hedging,
    detect_fabrication,
    detect_hedging,
    detect_premature_failure,
    detect_promise_without_action,
    detect_tool_unavailable,
    is_wait_iteration,
    truncate_tool_output,
    wait_iteration_fingerprint,
    wait_target_alive,
)
from .tool_loop_helpers import (
    _ALLOWED_WEBHOOK_IDS,
    _EMPTY_RESPONSE_FALLBACK,
    _scrub_tool_input_for_storage,
    ensure_failure_visible,  # noqa: F401 — re-export (client, tests)
)

log = get_logger("discord")


def _serving_identity_for(gateway, config=None, fallback_client=None) -> LLMServingIdentity:
    """Capture the serving identity, tolerating narrow test gateways.

    Production gateways expose ``capture_serving_identity`` (one root read);
    fixtures that fake only ``active_client`` get an equivalent identity
    built from that client so the freeze semantics still hold in tests.
    """
    capture = getattr(gateway, "capture_serving_identity", None)
    if capture is not None:
        return capture(config) if config is not None else capture()
    client = fallback_client or getattr(gateway, "active_client", None)
    return LLMServingIdentity(
        provider=(
            "codex"
            if client is None or hasattr(client, "reasoning_effort")
            else getattr(client, "provider_name", "unknown")
        ),
        client=client,
        model=getattr(client, "model", None) if client is not None else None,
        reasoning_effort=(
            getattr(client, "reasoning_effort", None)
            if client is not None and hasattr(client, "reasoning_effort")
            else None
        ),
    )



def _clean_fragment(s: str) -> str:
    """Normalize an exception-derived fragment for logs/trajectory storage:
    category-C strip (C0, DEL, C1, format chars; tab retained) and HTML-page
    fragments dropped. The reason phrase of an HTTP error is upstream-
    controlled text, so it goes through here exactly like str(exc) does.
    """
    s = "".join(ch for ch in s if ch == "\t" or not unicodedata.category(ch).startswith("C"))
    if "<html" in s.lower() or "<!doctype" in s.lower():
        return ""
    return s.strip()


def _error_summary(exc: BaseException, limit: int = 200) -> str:
    """Bounded one-line exception summary for logs and trajectory storage.

    Total and non-throwing. Never includes response bodies: upstream HTTP
    errors (Discord 500s carry whole Cloudflare HTML pages in str(exc))
    are reduced to type + status/reason -- both cleaned -- and a non-int
    status renders as "?". The journal traceback remains the source of
    full diagnostics.
    """
    name = type(exc).__name__
    try:
        status = getattr(exc, "status", None)
        if status is not None:
            status_s = str(status) if isinstance(status, int) else "?"
            reason = _clean_fragment(
                str(getattr(getattr(exc, "response", None), "reason", "") or "")
            )
            detail = f"HTTP {status_s} {reason}".strip()
        else:
            try:
                text = str(exc)
            except Exception:
                text = ""
            first = [ln.strip() for ln in text.strip().splitlines() if ln.strip()]
            detail = _clean_fragment(first[0] if first else "")
        out = f"{name}: {detail}" if detail else name
        return out[:limit]
    except Exception:
        return name


# Per-phase ceiling for typing attempts. A healthy POST is ~100-300ms; a
# dead endpoint used to burn discord.py's internal 5xx retry (~17s) per
# attempt during the 2026-07-16 incident. Deliberately a private constant,
# not config — a knob someone can raise would resurrect the incident.
_TYPING_ATTEMPT_TIMEOUT = 1.0


@asynccontextmanager
async def _best_effort_typing(channel):
    """Discord typing indicator that can never fail or stall the wrapped work.

    The indicator is attempted on every call — no failure memory, so a
    Discord API outage degrades cosmetics, not behavior — but each phase
    (enter/exit) is bounded by ``_TYPING_ATTEMPT_TIMEOUT`` (read at call
    time): wait briefly, then abandon the ornamentation and do the actual
    work. Any ordinary ``Exception`` from typing setup or cleanup is logged
    bounded and swallowed. Cancellation and exceptions raised by the wrapped
    body always propagate; a cleanup failure never replaces a body exception.
    """
    cm = None
    try:
        cm = channel.typing()
        await asyncio.wait_for(cm.__aenter__(), timeout=_TYPING_ATTEMPT_TIMEOUT)
    except asyncio.CancelledError:
        raise
    except TimeoutError:
        log.warning(
            "Typing indicator enter timed out after %.1fs (non-fatal)",
            _TYPING_ATTEMPT_TIMEOUT,
        )
        cm = None
    except Exception as exc:
        log.warning("Typing indicator failed (non-fatal): %s", _error_summary(exc))
        cm = None
    try:
        yield
    finally:
        if cm is not None:
            try:
                await asyncio.wait_for(
                    cm.__aexit__(None, None, None), timeout=_TYPING_ATTEMPT_TIMEOUT
                )
            except asyncio.CancelledError:
                raise
            except TimeoutError:
                log.warning(
                    "Typing indicator exit timed out after %.1fs (non-fatal)",
                    _TYPING_ATTEMPT_TIMEOUT,
                )
            except Exception as exc:
                log.warning("Typing indicator cleanup failed (non-fatal): %s", _error_summary(exc))


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


def _unwrap_native_result(result):
    """A native handler may return a ToolResult (carrying non-model-facing
    audit_metadata) or a plain string/dict. Return ``(tool_result_or_None,
    output)`` so the caller audits the metadata and sends the string."""
    if isinstance(result, ToolResult):
        return result, str(result)
    return None, result


@dataclass(frozen=True)
class LoopPolicy:
    """The chat-vs-autonomous behavioral dimensions (RFC-001 §4.3) as data.

    The load-bearing knobs are consulted by the shared machinery below;
    the remaining fields document divergences that live in the two entry
    points' control flow (guards/classifier/stuck/compression/typing/
    cancellation/validation exist only in run(); CircuitOpenError re-raise,
    prev-context exchange, and the reflection-gated finish only in
    run_autonomous()). Do not "unify" a documented dimension without a
    characterization pin saying so.
    """

    skill_file_delivery: Literal["send", "stage"]  # chat sends, autonomous stages
    trajectory_source: str  # "discord" | "loop"
    audit_event_style: str  # "chat" (tool_start/tool_end) | "loop" (loop_tool)
    iteration_cap_key: str  # config.tools.max_tool_iterations_{chat,loop}
    llm_via_gateway: bool  # chat: call_with_tools; autonomous: raw active client
    response_guards: bool
    completion_classifier: bool
    # Context-budget campaign (phase 4) asymmetries — pinned so a later
    # cleanup cannot "simplify" them into smoke:
    overflow_recovery: bool  # both surfaces rescue in-iteration since phase 4
    durable_recovery_checkpointing: bool  # chat only (v3.67.0 turn store)
    soft_compaction: bool  # chat always had it; loops gained it in phase 4
    latch_scope: str  # "turn" (durable chat turn) | "invocation" (one run_autonomous)


# Loop request shape is fixed: one protected autonomous prompt. Chat's
# protected envelope is dynamic — pre-tool control directives can be appended
# before the first tool cycle — so _ChatTurn carries its current envelope end.
_LOOP_ENVELOPE_LEN = 1


CHAT_POLICY = LoopPolicy(
    skill_file_delivery="send",
    trajectory_source="discord",
    audit_event_style="chat",
    iteration_cap_key="chat",
    llm_via_gateway=True,
    response_guards=True,
    completion_classifier=True,
    overflow_recovery=True,
    durable_recovery_checkpointing=True,
    soft_compaction=True,
    latch_scope="turn",
)

AUTONOMOUS_POLICY = LoopPolicy(
    skill_file_delivery="stage",
    trajectory_source="loop",
    audit_event_style="loop",
    iteration_cap_key="loop",
    llm_via_gateway=False,
    response_guards=False,
    completion_classifier=False,
    overflow_recovery=True,
    durable_recovery_checkpointing=False,
    soft_compaction=True,
    latch_scope="invocation",
)


def build_assistant_content(response) -> list[dict]:
    """Assistant tool_use content blocks — the byte-identical fragment both
    pipelines carried (RFC R5 seam extraction)."""
    assistant_content: list[dict] = []
    if response.text:
        assistant_content.append({"type": "text", "text": response.text})
    for tc in response.tool_calls:
        assistant_content.append(
            {
                "type": "tool_use",
                "id": tc.id,
                "name": tc.name,
                "input": tc.input,
            }
        )
    return assistant_content


@dataclass
class _ChatTurn:
    """Per-turn mutable state of the chat pipeline (RFC-002 P1).

    Field names deliberately match the pre-carve closure locals 1:1 —
    the carve gate normalizes ``st.<name>`` back to ``<name>`` when
    comparing phase bodies against the old inline blocks.
    """

    message: discord.Message
    policy: LoopPolicy
    trace: ContextTraceCollector | None
    system_prompt: str  # rebound on skill-CRUD prompt rebuilds (was `nonlocal`)
    tools: list | None
    messages: list
    user_id: str
    chat_cap: int
    stuck_tracker: StuckLoopTracker
    _trajectory: TrajectoryTurn
    _result_store_cap: int
    _cancel: asyncio.Event
    _ch_id: str
    _req_id: str
    iteration: int = 0
    tools_used_in_loop: list = field(default_factory=list)
    continuation_count: int = 0
    max_continuations: int = 3
    fabrication_retried: bool = False
    promise_retried: bool = False
    unavail_retried: bool = False
    hedging_retried: bool = False
    code_hedging_retried: bool = False
    premature_failure_retried: bool = False
    # True between a wait-class fingerprint's WI-4 (recorded) and its
    # judgment (nudge/kill/clear). Persisted: a crash in that window must
    # resume INTO the judgment — while a nudge already delivered before a
    # later suspension must NOT be re-judged into a zero-generation kill
    # (PR #244 round-3 blocker #1: the phase is explicit, never inferred
    # from historical fingerprints).
    wait_judgment_pending: bool = False
    pending_image_blocks: list = field(default_factory=list)
    _op_tool_details: list = field(default_factory=list)
    _pending_validations: list = field(default_factory=list)
    _validation_required: bool = False
    _validation_retries: int = 0
    _max_validation_retries: int = 2
    # Context-budget campaign (phase 4) — all PERSISTED (codec v3):
    # the surface boundary as plain state (session history before
    # request_start is elidable; the request envelope after it is
    # protected), the durable-turn accepted-size latch, the rescue-ladder
    # phase (a resumed generation continues at the NEXT rung, never
    # re-arms rung 1), and the frozen generation identity FACTS
    # (provider/model/effort/ladder — never process-local objects) so a
    # suspend mid-recovery resumes the same logical generation.
    _boundary_request_start: int = 0
    _boundary_elided_replay: int = 0
    _boundary_envelope_len: int | None = 0
    _char_latch: int | None = None
    _rescue_passes: int = 0
    _gen_identity: dict | None = None
    # Process-local, per-generation cache captured beside serving identity.
    # Rebuilt from durable _gen_identity on resume; never serialized directly.
    _generation_budget_snapshot: ContextBudgetSnapshot | None = None
    # Process-local durability handle (write-invariant driver). Classified
    # RECONSTRUCTED in the checkpoint codec: a resumed turn gets a fresh
    # handle bound to the resume lease, never a deserialized one.
    durability: TurnDurability = field(default_factory=TurnDurability.disabled)


@dataclass
class _LoopTurn:
    """Per-iteration mutable state of the autonomous pipeline (RFC-002 P1)."""

    prompt: str
    channel: object
    user_id: str
    policy: LoopPolicy
    msg_proxy: _LoopMessageProxy
    requester_name: str
    _loop_id: str
    _trace: ContextTraceCollector | None
    _trajectory: TrajectoryTurn | None
    _result_store_cap: int
    messages: list
    system_prompt: str  # rebound on skill-CRUD rebuilds (was `nonlocal`)
    tools: list | None
    tool_timeout: float
    channel_id_str: str
    loop_cap: int
    _loop_details: list = field(default_factory=list)
    final_text: str = ""
    completed_naturally: bool = False  # True only when a tool-free turn ended the loop
    tool_calls_made: int = 0
    # Context-budget campaign (phase 4): the surface boundary for emergency
    # recovery (prev_context replay elidable, current prompt protected), the
    # per-run_autonomous-invocation accepted-size latch (a later scheduled
    # iteration starts fresh — cross-iteration protection is the global
    # clamp's job, not a stale local latch), recovery evidence for the
    # trajectory, and the loop-local iteration index the soft pass guards on.
    _boundary: SurfaceBoundary | None = None
    _char_latch: int | None = None
    context_recoveries: list = field(default_factory=list)
    _iteration_index: int = 0
    _generation_budget_snapshot: ContextBudgetSnapshot | None = None


@dataclass(frozen=True)
class ToolLoopDeps:
    """The true dependency surface of both tool pipelines."""

    get_config: Callable  # live root — replaced by config hot-reload
    get_default_system_prompt: Callable  # live — rebuilt on config/context reload
    get_context_compressor: Callable  # live read — tests swap it on the bot
    llm_gateway: LLMGateway  # owns the swappable provider clients + guarded calls
    prompt_builder: PromptBuilder
    tool_catalog: ToolCatalog
    channel_state: ChannelStateRegistry  # cancel events, active requests, op details
    channel_config: ChannelConfigManager  # shared guild/channel response resolution
    delivery: ResponseDelivery  # presence updates
    turn_recorder: TurnRecorder  # trajectories, traces, lifecycle events, reflection
    completion_classifier: CompletionClassifier
    native_tools: NativeToolDispatcher  # the shared dispatch table
    tool_executor: ToolExecutor
    permissions: PermissionManager
    skill_manager: SkillManager
    audit: AuditLogger
    loop_manager: LoopManager
    stuck_loop_tracker_cls: type[StuckLoopTracker]
    get_compression_stats: Callable = lambda: None
    # Durable turn-state store (None = checkpointing off). Default keeps
    # every existing construction working; wiring passes the real store.
    turn_store: object | None = None
    # Called with (TurnKey, generation) when a turn suspends — wiring points
    # it at the resume manager's auto-resume registration.
    on_turn_suspended: Callable | None = None
    # Passive window observer (phase 5): downward clamp source + rescue
    # evidence sink. None = feature-inert (tests, minimal constructions).
    window_observer: object | None = None
    # MCP control plane (mcp_dispatch seam). None keeps MCP branches inert
    # for direct test constructions; wiring always passes the real manager.
    mcp_manager: MCPManager | None = None
    # Exact cleanup target for agents spawned by a cancelled main turn.
    kill_agents_for_turn: Callable[[str], list[str]] = lambda _turn_id: []


class ToolLoopRunner:
    def __init__(self, deps: ToolLoopDeps) -> None:
        self._get_config = deps.get_config
        self._get_default_system_prompt = deps.get_default_system_prompt
        self._get_context_compressor = deps.get_context_compressor
        self._get_compression_stats = deps.get_compression_stats
        self._llm_gateway = deps.llm_gateway
        self._prompt_builder = deps.prompt_builder
        self._tool_catalog = deps.tool_catalog
        self._channel_state = deps.channel_state
        self._channel_config = deps.channel_config
        self._delivery = deps.delivery
        self._turn_recorder = deps.turn_recorder
        self._completion_classifier = deps.completion_classifier
        self._native_tools = deps.native_tools
        self._mcp_manager = deps.mcp_manager
        self._kill_agents_for_turn = deps.kill_agents_for_turn
        self._tool_executor = deps.tool_executor
        self._permissions = deps.permissions
        self._skill_manager = deps.skill_manager
        self._audit = deps.audit
        self._loop_manager = deps.loop_manager
        self._stuck_loop_tracker_cls = deps.stuck_loop_tracker_cls
        self._turn_store = deps.turn_store
        self._window_observer = deps.window_observer
        self._on_turn_suspended = deps.on_turn_suspended

    def _scoped_tools_for_request(
        self,
        *,
        user_id: str,
        api_allowed: list[str] | None = None,
        bypass_rbac: bool = False,
        current_tools: list[dict] | None = None,
        cache_result: bool = True,
        request_config=None,
    ) -> list[dict] | None:
        """Re-pull the live catalog at request assembly, then scope it.

        Publication can change between generations in one turn. A list
        captured at turn entry is therefore not an assembled-request
        boundary. Execution retains its independent RBAC/publication fences.
        """
        config = request_config if request_config is not None else self._get_config()
        tools_config = getattr(config, "tools", None)
        if tools_config is None or not hasattr(self, "_tool_catalog"):
            # Narrow direct-call unit seams construct the runner with only the
            # LLM dependencies. Preserve their supplied catalog; production
            # construction always has both dependencies.
            return current_tools
        if not tools_config.enabled:
            return None
        if cache_result:
            merged = self._tool_catalog.merged_definitions()
        else:
            try:
                merged = self._tool_catalog.merged_definitions(cache_result=False)
            except TypeError:
                # Narrow test/minimal catalog doubles may expose only the
                # historical no-argument seam; production ToolCatalog accepts
                # the non-caching request-assembly mode.
                merged = self._tool_catalog.merged_definitions()
        tools: list[dict] | None = merged
        filter_tools = getattr(self._permissions, "filter_tools", None)
        if not bypass_rbac and filter_tools is not None:
            tools = filter_tools(user_id, merged)
        if api_allowed is not None and tools:
            allowed_set = set(api_allowed)
            tools = [tool for tool in tools if tool["name"] in allowed_set]
        return tools

    # ------------------------------------------------------------------
    # Chat pipeline (old _process_with_tools) — orchestrator + phases
    # ------------------------------------------------------------------

    async def run(
        self,
        message: discord.Message,
        history: list[dict],
        system_prompt_override: str | None = None,
        trace=None,
        policy: LoopPolicy = CHAT_POLICY,
        from_another_bot: bool | None = None,
    ) -> tuple[str, bool, bool, list[str], bool]:
        """Process a message with the tool loop — see module docstring.

        Returns (text, already_sent, is_error, tools_used, handoff):
        - text: the response text
        - already_sent: True if the response was streamed to Discord already
        - is_error: True if an error occurred (API failed, max iterations,
          circuit breaker). Error responses are saved to history for
          continuation ("keep going"). Tool memory is not recorded.
        - tools_used: list of tool names called during this loop
        - handoff: True if the response should be handed off to another handler
        """
        st = await self._prepare_chat_turn(
            message,
            history,
            system_prompt_override,
            trace,
            policy,
            from_another_bot=from_another_bot,
        )
        # Admission refusal: this message identity already has durable state
        # (terminal / in-flight / suspended). A redelivered or duplicate
        # message must never re-run its effects unledgered.
        if st.durability.blocked is not None:
            self._clear_active(st)
            notices = {
                "already_processed": (
                    "This exact request was already processed — refusing to "
                    "run it again. Send it as a new message if you want a "
                    "fresh run."
                ),
                "in_progress": ("This exact request is already being processed elsewhere."),
                "resumable": (
                    "This request has preserved, resumable work — say "
                    "`resume` to continue it instead of starting over."
                ),
                "admission_error": (
                    "The durability ledger is unreachable, so I can't verify "
                    "whether this exact request already ran. Refusing to "
                    "execute it blind — try again shortly."
                ),
            }
            text = notices.get(st.durability.blocked, "This request cannot be re-run.")
            log.warning(
                "Turn admission refused (%s) for message %s in channel %s",
                st.durability.blocked,
                st._trajectory.message_id,
                st._ch_id,
            )
            return (text, False, False, [], False)
        return await self._run_with_guards(st)

    async def run_resumed(self, st: _ChatTurn) -> tuple[str, bool, bool, list[str], bool]:
        """Continue a restored turn (built by TurnResumeManager) through the
        same guard envelope as a fresh one. The iteration loop starts from
        ``st.iteration`` — the restored transcript already contains every
        earlier generation."""
        st._cancel = self._channel_state.set_active_request(
            st._ch_id, st._req_id, st._cancel
        )
        set_turn(
            turn_id=st._trajectory.message_id or None,
            source=st._trajectory.source,
            channel_id=st._trajectory.channel_id,
        )
        await self._delivery.set_status("Resuming preserved work...", task_start=True)
        return await self._run_with_guards(st)

    async def _run_with_guards(self, st: _ChatTurn) -> tuple[str, bool, bool, list[str], bool]:
        try:
            result = await self._run_chat_iterations(st)
            # Terminal bookkeeping (best-effort; a suspension already settled
            # itself and this no-ops). Cancellation is terminal by design —
            # a cancelled turn never becomes resumable.
            cancelled = bool(getattr(st.durability, "cancelled", False)) or st._cancel.is_set()
            terminal_confirmed = await st.durability.settle_terminal(
                cancelled=cancelled, is_error=bool(result[2])
            )
            if cancelled:
                # _stopped computes the result and cancels this turn's agents,
                # but the slash waiter must remain asleep until the durable
                # TERMINAL_CANCELLED write has completed. On a write failure,
                # report that failure instead of publishing a false success.
                stop_result = result[0] if terminal_confirmed else (
                    "The task stopped, but its durable cancellation record "
                    "could not be confirmed."
                )
                if terminal_confirmed:
                    self._channel_state.finish_stop(st._ch_id, st._req_id, stop_result)
                self._channel_state.clear_active_request(
                    st._ch_id,
                    st._req_id,
                    resolve_stop_waiter=terminal_confirmed,
                )
                if not terminal_confirmed:
                    result = (stop_result, *result[1:])
            return result
        except asyncio.CancelledError:
            # Cancellation is not an error turn: release channel ownership
            # and let it propagate untouched (no error trajectory). The
            # durable cancel mark is bounded + best-effort so propagation
            # stays prompt.
            self._clear_active(st)
            try:
                await asyncio.wait_for(
                    st.durability.settle_terminal(cancelled=True, is_error=False),
                    timeout=5.0,
                )
            except BaseException:  # noqa: BLE001 — never delay cancellation
                log.warning("Durable cancel mark failed (non-fatal)")
            raise
        except Exception as exc:
            # An escaping exception used to skip BOTH the trajectory record
            # and active-request cleanup (found 2026-07-16: Discord's typing
            # endpoint 500s left six dead turns with no trajectory at all).
            # Record bounded, clean up, re-raise — the user-facing message
            # is intake_pipeline's job, not ours.
            try:
                await self._turn_recorder._save_turn_trajectory(
                    st._trajectory, error=_error_summary(exc), trace=st.trace
                )
            except Exception:
                log.exception("Trajectory record failed while handling tool-loop escape")
            finally:
                self._clear_active(st)
            # Fail-closed epilogue: a durability failure (or any escape)
            # marks the turn FAILED so a half-written checkpoint can never
            # present itself as resumable. Best-effort — a fence loss here
            # just means someone else owns the row now, and even a
            # cancellation delivered inside the settle must not replace the
            # original escaping error.
            try:
                await st.durability.settle_terminal(cancelled=False, is_error=True)
            except BaseException:  # noqa: BLE001 — the original error must win
                log.warning("Durable failure mark failed (non-fatal)")
            raise
        finally:
            # A suspended durable turn still owns its lineage and may resume.
            # Every other exit is terminal for this process-local owner.
            if getattr(st.durability, "settled", False) and not getattr(
                st.durability, "suspended", False
            ):
                self._release_workload(st)

    async def _run_chat_iterations(self, st: _ChatTurn) -> tuple[str, bool, bool, list[str], bool]:
        """The chat iteration loop — every phase-method exit returns through
        here; unexpected escapes are handled by run()'s guard above.

        Starts from ``st.iteration``: 0 for a fresh turn (unchanged), the
        interrupted generation's index for a resumed one — the restored
        transcript already carries everything before it."""
        entry_outcome = await self._judge_entry_stuck(st)
        if entry_outcome is not None:
            kind, val = entry_outcome
            if kind == "done":
                return val
            # WI-5: the entry nudge + consumed warned flag go durable
            # before the first generation consumes them.
            await st.durability.on_guard_injection(st)
        for iteration in range(st.iteration, st.chat_cap):
            st.iteration = iteration
            if st._cancel.is_set():
                return self._stopped(st, "iteration_start")

            # ONE capture of this uninterrupted generation's serving
            # identity: soft compaction, preflight, breaker admission, and
            # every physical retry all describe this exact client/model/effort.
            # Durable suspend/resume persistence remains phase 4. Capture the
            # serving identity and ONE budget snapshot together; soft policy
            # and rescue must never observe different clamp generations.
            config = self._get_config()
            serving = self._llm_gateway.capture_serving_identity(config)
            if st._gen_identity:
                budget_snapshot = self._snapshot_from_generation_facts(st._gen_identity)
            else:
                budget_snapshot = self._capture_budget_snapshot(serving, config, st)
            st._generation_budget_snapshot = budget_snapshot
            trace = st.trace
            if trace is not None:
                density, source, primary = self._context_budget_observation(budget_snapshot)
                trace.context_budget(
                    generation=iteration,
                    density_milli=density,
                    density_source=source,
                    primary_chars=primary,
                )
            if not self._maybe_compress(st, serving.client, config):
                return await self._llm_error_done(
                    st,
                    LLMRequestError(
                        "protected request envelope exceeds the accepted context latch",
                        provider=serving.provider,
                        model=serving.model,
                        code="context_length_exceeded",
                    ),
                )

            kind, val = await self._call_llm(
                st,
                serving_identity=serving,
                request_config=config,
                budget_snapshot=budget_snapshot,
            )
            if kind == "done":
                return val
            llm_resp = val

            if st._cancel.is_set():
                return self._stopped(st, "after_llm")

            outcome = await self._check_stuck_and_record(st, llm_resp)
            if outcome is not None:
                kind, val = outcome
                if kind == "done":
                    return val
                # WI-5: the stuck nudge + warned flag go durable before the
                # retry generation consumes them.
                await st.durability.on_guard_injection(st)
                continue  # nudge injected — next iteration

            # Gate on actual parsed tool calls, not is_tool_use (which is also
            # true when stop_reason=="tool_use" with zero calls). The sibling
            # loop already uses this stricter form; matching it prevents an
            # empty-tool_use response from skipping finalization and re-looping.
            if not llm_resp.tool_calls:
                kind, val = await self._finalize_or_retry(st, llm_resp)
                if kind == "done":
                    return val
                # WI-5: consumed one-shot guard flag / continuation budget +
                # the injected retry message go durable before the LLM retry.
                await st.durability.on_guard_injection(st)
                continue  # retry/continuation message injected

            # Build internal-format assistant content from LLMResponse
            # (the R5-extracted fragment; the pre-carve chat body inlined
            # the byte-identical block).
            st.messages.append({"role": "assistant", "content": build_assistant_content(llm_resp)})

            tool_calls = llm_resp.tool_calls
            st.tools_used_in_loop.extend(t.name for t in tool_calls)

            tool_results = await self._execute_tool_calls(st, tool_calls)

            # Wait-class fingerprints record BEFORE WI-4 so the checkpoint
            # carries the stuck observation with the result it observed;
            # judgment (nudge/kill) runs only AFTER WI-4 succeeded — a
            # confirmed-frozen kill never discards the result that proved
            # the freeze, and a crash never forgets it (PR #244 round-1).
            wait_iteration = self._record_wait_fingerprint(st, tool_calls, tool_results)

            outcome = await self._post_iteration(st, tool_calls, tool_results)
            if outcome is not None:
                return outcome[1]

            if wait_iteration:
                outcome = await self._judge_wait_stuck(st, tool_calls, tool_results)
                if outcome is not None:
                    kind, val = outcome
                    if kind == "done":
                        return val
                    # WI-5: the wait-aware nudge + consumed warned flag go
                    # durable before the retry generation.
                    await st.durability.on_guard_injection(st)
                    continue

            handoff = self._check_skill_handoff(st, tool_calls, tool_results)
            if handoff is not None:
                return handoff[1]

        return await self._finalize_cap_hit(st)

    async def _prepare_chat_turn(
        self,
        message: discord.Message,
        history: list[dict],
        system_prompt_override: str | None,
        trace,
        policy: LoopPolicy,
        *,
        from_another_bot: bool | None = None,
    ) -> _ChatTurn:
        """Turn setup: prompt/tools resolution, request preamble, permission
        filtering, trajectory + correlation init, cancellation wiring."""

        system_prompt = system_prompt_override or self._get_default_system_prompt()
        messages = list(history)

        # Insert context separator between history and the current user request
        # so Codex evaluates tools fresh instead of repeating patterns from history
        if from_another_bot is None:
            # Direct callers have no intake snapshot, so resolve through the
            # exact same channel > guild > global ladder as MessageIntake.
            _guild = getattr(message, "guild", None)
            _guild_id = str(_guild.id) if _guild is not None else None
            _channel_id = str(message.channel.id)
            _respond_to_bots = self._channel_config.should_respond_to_bots(
                _guild_id,
                _channel_id,
                self._get_config().discord.respond_to_bots,
            )
            is_allowed_webhook = (
                message.webhook_id and str(message.webhook_id) in _ALLOWED_WEBHOOK_IDS
            )
            is_bot_message = bool(
                getattr(message.author, "bot", False) and (_respond_to_bots or is_allowed_webhook)
            )
        else:
            # Intake already made the admission decision. Do not re-resolve a
            # live setting after buffering/queueing and mislabel admitted work.
            is_bot_message = from_another_bot
        from .tool_loop_helpers import (
            build_request_preamble,
            compute_request_id,
            current_request_time,
        )

        req_hash = compute_request_id(
            message.content if isinstance(message.content, str) else str(message.id)
        )
        req_time = current_request_time()
        user_display = getattr(message.author, "display_name", str(message.author))
        # Build channel context line for spatial awareness
        _ch = message.channel
        _ch_name = getattr(_ch, "name", None) or str(_ch.id)
        _is_thread = isinstance(_ch, discord.Thread)
        if _is_thread and getattr(_ch, "parent", None):
            # Guarded: _is_thread + the getattr probe exclude every
            # parent-less/None case; mypy cannot narrow via the bool var.
            channel_ctx = f"Channel: #{_ch.parent.name} → thread: {_ch_name}"  # type: ignore[union-attr]
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

        user_id = str(message.author.id)

        # Snapshot only the caller scope; the catalog itself is re-pulled at
        # each physical request assembly so same-turn publication changes land.
        is_test_wh = bool(
            message.webhook_id and str(message.webhook_id) in _ALLOWED_WEBHOOK_IDS
        )
        api_allowed = getattr(message, "allowed_tools", None)
        tools = self._scoped_tools_for_request(
            user_id=user_id,
            api_allowed=api_allowed,
            bypass_rbac=is_test_wh,
        )

        chat_cap = self._get_config().tools.max_tool_iterations_chat
        log.info(
            "Tool loop starting: %d tools available, %d messages in history, cap=%d",
            len(tools) if tools else 0,
            len(messages),
            chat_cap,
        )

        await self._delivery.set_status("Working...", task_start=True)

        # Per-turn StuckLoopTracker — detects repeating tool-call sequences and
        # nudges the LLM out of cycles before the iteration cap forces an exit.
        stuck_tracker = self._stuck_loop_tracker_cls()

        # Per-turn trajectory accumulator — populated each iteration, saved at end.
        from ..trajectories.saver import TrajectoryTurn

        _result_store_cap = int(
            getattr(
                getattr(self._get_config(), "observability", None),
                "max_tool_result_chars",
                2000,
            )
            or 2000
        )
        if trace is not None:
            # Turn-ENTRY policy context only — which provider/model the turn
            # started under. Per-iteration ToolIteration fields carry the
            # authoritative execution provenance (routing/reloads can change
            # what actually serves each iteration).
            provider_cfg = getattr(self._get_config(), "llm_provider", None)
            trace.provider(
                name=getattr(provider_cfg, "active_provider", "codex") if provider_cfg else "codex",
                model=getattr(self._llm_gateway.active_client, "model", "") or "",
                reasoning_effort=getattr(self._llm_gateway.active_client, "reasoning_effort", None),
            )
        _turn_ctx = get_turn() or {}
        _trajectory = TrajectoryTurn(
            message_id=str(getattr(message, "id", "")),
            channel_id=str(getattr(message.channel, "id", "")),
            user_id=user_id,
            user_name=str(getattr(message.author, "display_name", "")),
            source=str(
                _turn_ctx.get("source")
                or getattr(message, "_odin_source", policy.trajectory_source)
            ),
        )
        self._turn_recorder._record_user_content(_trajectory, getattr(message, "content", "") or "")
        # No explicit reset — each message handler runs in its own asyncio
        # task, so the context var dies with the task. (The loop manager
        # resets its own stamp explicitly around each iteration callback.)
        set_turn(
            turn_id=_trajectory.message_id or None,
            source=_trajectory.source,
            channel_id=_trajectory.channel_id,
            **{k: v for k, v in _turn_ctx.items() if k in ("loop_id", "loop_iteration")},
        )

        # Per-request cancellation via /stop command
        _ch_id = str(message.channel.id)
        # Active ownership must be unique per turn. ``req_hash`` is only
        # content-derived debug provenance and collides for repeated messages.
        _req_id = str(_trajectory.message_id or req_hash)
        _cancel = self._channel_state.set_active_request(
            _ch_id, _req_id, asyncio.Event()
        )

        # Durable-turn admission: Discord chat turns only, resolved the same
        # way the trajectory source is (web/API turns share this runner via
        # message shims carrying _odin_source="web" and have no
        # re-fetchable Discord message — v1 checkpoint fence). Any refusal →
        # a disabled handle and the turn runs exactly as before.
        durability = TurnDurability.disabled()
        if (
            policy is CHAT_POLICY
            and self._turn_store is not None
            and _trajectory.source == "discord"
        ):
            durability = await TurnDurability.admit(
                self._turn_store,  # type: ignore[arg-type]
                message=message,
                system_prompt=system_prompt,
                tools=tools,
                session_snapshot={"history_len": len(history)},
            )

        return _ChatTurn(
            message=message,
            # The request envelope is always the final two messages here
            # (preamble + current user request); everything before them is
            # replayed session history — the elidable side of the boundary.
            _boundary_request_start=max(0, len(messages) - 2),
            _boundary_envelope_len=2,
            policy=policy,
            trace=trace,
            system_prompt=system_prompt,
            tools=tools,
            messages=messages,
            user_id=user_id,
            chat_cap=chat_cap,
            stuck_tracker=stuck_tracker,
            _trajectory=_trajectory,
            _result_store_cap=_result_store_cap,
            _cancel=_cancel,
            _ch_id=_ch_id,
            _req_id=_req_id,
            durability=durability,
        )

    def _observed_clamp(self, model: object) -> int | None:
        """The window observer's active clamp for ``model`` (phase 5)."""
        observer = getattr(self, "_window_observer", None)
        if observer is None:
            return None
        try:
            return observer.active_clamp(model)
        except Exception:
            log.exception("active_clamp failed (non-fatal); treating as unclamped")
            return None

    @staticmethod
    def _workload_scope(st: object) -> object | None:
        """This turn's independent prompt lineage.

        Chat uses the durable top-level request id and the loop uses its
        loop id. Deliberately NOT the channel: a channel holds several users
        and unrelated jobs, so channel-scoped calibration would recreate the
        cross-workload defect at a smaller radius.
        """
        from ..llm.context_budget import WorkloadScope

        loop_id = getattr(st, "_loop_id", None)
        if loop_id:
            return WorkloadScope("loop", str(loop_id))
        from ..llm.context_budget import chat_workload_scope

        trajectory = getattr(st, "_trajectory", None)
        if trajectory is None:
            return None
        scope = chat_workload_scope(
            str(getattr(trajectory, "source", "") or ""),
            str(getattr(trajectory, "channel_id", "") or ""),
            str(getattr(trajectory, "message_id", "") or ""),
        )
        if scope is not None:
            return scope
        # Narrow compatibility for tests/extensions that construct a
        # trajectory-shaped object without identity. Production and restored
        # turns always have the durable fields above. `_req_id` must never be
        # consulted: it is a hash of message content.
        return None

    def _observed_density(self, scope: object, model: object) -> int | None:
        """The observer's calibrated density for the NEXT generation.

        Total like clamp lookup: calibration is runtime evidence, never a
        reason to fail a request whose uncalibrated path remains usable.
        """
        observer = getattr(self, "_window_observer", None)
        if observer is None or scope is None:
            # No workload identity means no honest owner for a calibrated
            # value; the fixed prior is correct, borrowing is not.
            return None
        try:
            return observer.density_for(scope, model)
        except Exception:
            log.exception("density_for failed (non-fatal); treating as uncalibrated")
            return None

    def _release_workload(self, st: object) -> None:
        """Release a terminal chat/loop owner from ephemeral calibration."""
        observer = getattr(self, "_window_observer", None)
        if observer is None:
            return
        try:
            scope = self._workload_scope(st)
            if scope is not None:
                observer.release_workload(scope)
        except Exception:
            log.exception("workload calibration release failed (non-fatal)")

    async def _record_window_evidence(
        self,
        overflow: object,
        response: object,
        rejected_attempt: object = None,
        accepted_chars: object = None,
        accepted_images: object = None,
        workload_scope: object = None,
    ) -> None:
        """Feed one rescue's overflow→acceptance pair to the observer.

        Total: evidence is never worth failing the request that just
        succeeded (plan §11 invariant). ``believed_within`` is the REJECTED
        attempt's belief and is what qualifies a clamp — a rejection we
        already predicted says nothing about the served window."""
        observer = getattr(self, "_window_observer", None)
        if observer is None or overflow is None:
            return
        try:
            await observer.record_rescue(
                overflow=overflow,
                response=response,
                rejected_attempt=rejected_attempt,
                accepted_chars=accepted_chars,
                accepted_images=accepted_images,
                workload_scope=workload_scope,
            )
        except Exception:
            log.exception("window-evidence recording failed (non-fatal)")

    @staticmethod
    def _measure_payload(messages: list[dict]) -> tuple[int, int]:
        """(chars, wire-real images) for the payload about to be sent."""
        try:
            from ..llm.context_compressor import (
                estimate_message_chars,
                estimate_message_images,
            )

            return estimate_message_chars(messages), estimate_message_images(messages)
        except Exception:
            log.exception("payload measurement failed")
            return 0, 0

    def _record_density(
        self,
        st: object,
        response: object,
        chars_sent: int,
        images_sent: int,
        serving_identity: object,
    ) -> None:
        """Fold one accepted request into the model's density calibration.

        Codex-only: no other provider returns the server-authoritative
        accepted-token echo this calibration is built on. Total — calibration
        never disturbs a request that already succeeded."""
        observer = getattr(self, "_window_observer", None)
        if observer is None or not getattr(serving_identity, "is_codex", False):
            return
        try:
            observer.record_density(
                scope=self._workload_scope(st),
                model=getattr(response, "provenance_model", None)
                or getattr(serving_identity, "model", None),
                chars_sent=chars_sent,
                images_sent=images_sent,
                server_input_tokens=getattr(response, "server_input_tokens", None),
            )
        except Exception:
            log.exception("density calibration failed (non-fatal)")

    @staticmethod
    def _attempt_facts(
        messages: list[dict], snapshot: object, serving_identity: object, workload_scope: object
    ) -> object | None:
        """Freeze everything this attempt's fit verdict rests on, or None.

        One structured unit rather than a loose bool beside loose numbers, so
        the verdict and the evidence behind it cannot drift apart between
        capture and clamp qualification.
        """
        from ..llm.context_budget import WorkloadScope

        if (
            snapshot is None
            or not getattr(serving_identity, "is_codex", False)
            or type(workload_scope) is not WorkloadScope
            or not workload_scope.is_valid()
        ):
            return None
        if getattr(snapshot, "base_source", None) == "persisted":
            return None
        effective = getattr(snapshot, "effective_budget", 0)
        if not isinstance(effective, int) or effective <= 0:
            return None
        try:
            from ..llm.context_budget import RejectedAttemptFacts, estimate_request_tokens
            from ..llm.context_compressor import (
                estimate_message_chars,
                estimate_message_images,
            )

            density = getattr(snapshot, "density_milli", DEFAULT_DENSITY_MILLI)
            chars = estimate_message_chars(messages)
            images = estimate_message_images(messages)
            estimated = estimate_request_tokens(chars, images, density_milli=density)
            return RejectedAttemptFacts(
                chars=chars,
                images=images,
                density_milli=density,
                estimated_tokens=estimated,
                effective_budget=effective,
                believed_within=estimated <= effective,
                workload_scope=workload_scope,
            )
        except Exception:
            log.exception("attempt fact capture failed; recording belief as unknown")
            return None

    @staticmethod
    def _believed_within_effective_budget(
        messages: list[dict], snapshot: object, serving_identity: object
    ) -> bool | None:
        """Whether this payload is believed to fit the believed WINDOW.

        None means no honest belief exists (non-Codex serving, no snapshot, or
        a persisted reconstruction whose budget fields are placeholders) and
        can never qualify a clamp. Compares against ``effective_budget``, not
        the utilization-derived working target: utilization is quality POLICY
        and overflow is PHYSICS.
        """
        if snapshot is None or not getattr(serving_identity, "is_codex", False):
            return None
        if getattr(snapshot, "base_source", None) == "persisted":
            return None
        effective = getattr(snapshot, "effective_budget", 0)
        if not isinstance(effective, int) or effective <= 0:
            return None
        try:
            from ..llm.context_budget import estimate_request_tokens
            from ..llm.context_compressor import (
                estimate_message_chars,
                estimate_message_images,
            )

            estimated = estimate_request_tokens(
                estimate_message_chars(messages),
                estimate_message_images(messages),
                density_milli=getattr(snapshot, "density_milli", 2500),
            )
            return estimated <= effective
        except Exception:
            log.exception("belief estimation failed; recording belief as unknown")
            return None

    def _predictive_presend_descent(
        self, st: Any, snapshot: object, serving_identity: object
    ) -> int:
        """Descend rescue rungs BEFORE sending a payload believed not to fit.

        Returns the count of rungs consumed; the caller passes only the
        REMAINING ladder to the physical-attempt loop, so pre-send and
        post-rejection rescue share one total ladder.

        Fail-OPEN by contract: any estimator or compactor failure leaves the
        payload untouched and lets the provider decide. Accepted-latch
        enforcement stays fail-closed elsewhere; this is prediction, not
        proof. Skipped entirely for resumed generations, whose persisted
        remaining ladder already governs further rejection.
        """
        consumed = 0
        ladder = tuple(getattr(snapshot, "ladder", ()) or ())
        if not ladder or not getattr(serving_identity, "is_codex", False):
            return 0
        if getattr(snapshot, "base_source", None) == "persisted":
            return 0
        try:
            from ..llm.context_compressor import emergency_compress_for_window

            while consumed < len(ladder):
                if (
                    self._believed_within_effective_budget(
                        st.messages, snapshot, serving_identity
                    )
                    is not False
                ):
                    break
                surface_boundary = getattr(st, "_boundary", None)
                if surface_boundary is None:
                    surface_boundary = SurfaceBoundary(
                        request_start=getattr(st, "_boundary_request_start", 0),
                        elided_replay=getattr(st, "_boundary_elided_replay", 0),
                        envelope_len=getattr(st, "_boundary_envelope_len", None),
                    )
                compressed, report = emergency_compress_for_window(
                    st.messages,
                    target_chars=ladder[consumed],
                    boundary=surface_boundary,
                )
                consumed += 1
                report["attempt"] = 0
                report["trigger"] = "predictive"
                trajectory = getattr(st, "_trajectory", None)
                if trajectory is not None:
                    trajectory.context_recoveries.append(report)
                # A no-op character rung is not a terminator: image
                # surcharge can leave the request over its token window even
                # when target_chars exceeds the current character count, so a
                # lower rung may still be useful. An enlarging result remains
                # a hard non-adoption guard.
                if report["compressed_chars"] > report["original_chars"]:
                    break
                if report["compressed_chars"] == report["original_chars"]:
                    continue
                st.messages = compressed
                if report.get("boundary_request_start") is not None:
                    if getattr(st, "_boundary", None) is not None:
                        st._boundary = SurfaceBoundary(
                            request_start=report["boundary_request_start"],
                            elided_replay=report["boundary_elided_replay"],
                            envelope_len=surface_boundary.envelope_len,
                        )
                    else:
                        st._boundary_request_start = report["boundary_request_start"]
                        st._boundary_elided_replay = report["boundary_elided_replay"]
                log.info(
                    "predictive pre-send: rung %d compacted %d -> %d chars",
                    consumed,
                    report["original_chars"],
                    report["compressed_chars"],
                )
        except Exception:
            log.exception("predictive pre-send failed (non-fatal); sending as-is")
        return consumed

    def _clear_active(self, st: _ChatTurn) -> None:
        self._channel_state.clear_active_request(st._ch_id, st._req_id)

    def _stopped(self, st: _ChatTurn, where: str) -> tuple[str, bool, bool, list[str], bool]:
        log.info("Task stopped by /stop in channel %s at %s", st._ch_id, where)
        # Carry the cancellation fact past _clear_active (which clears the
        # shared event) so terminal settlement records TERMINAL_CANCELLED —
        # a cancelled turn must never look resumable or completed.
        st.durability.mark_cancelled()
        killed = self._kill_agents_for_turn(st._trajectory.message_id)
        suffix = ""
        if st._pending_validations or st._validation_required:
            suffix = " Pending post-action validation was not run."
        tools_note = (
            f" Tools used: {', '.join(st.tools_used_in_loop)}." if st.tools_used_in_loop else ""
        )
        agents_note = (
            f" Sent cancellation to {len(killed)} agent(s) spawned by this turn."
            if killed
            else ""
        )
        text = f"Task stopped by user.{tools_note}{agents_note}{suffix}"
        return (
            text,
            False,
            False,
            st.tools_used_in_loop,
            False,
        )

    @staticmethod
    def _snapshot_from_generation_facts(facts: dict) -> ContextBudgetSnapshot:
        payload = facts.get("budget") or {}
        primary = payload.get("primary_chars", 0)
        return ContextBudgetSnapshot(
            canonical_model=facts.get("model", ""),
            base_budget=0,
            base_source="persisted",
            effective_budget=0,
            clamp_applied=False,
            working_budget=0,
            compactable_tokens=0,
            derived_chars=primary,
            primary_chars=primary,
            ceiling_applied=False,
            ladder=tuple(facts.get("ladder") or ()),
            # A resumed generation's belief cannot be reconstructed: the
            # density in force at capture was never persisted. Placeholder
            # budget fields plus this source marker make predictive descent
            # and clamp qualification skip the generation honestly rather
            # than splice CURRENT evidence into a FROZEN one.
            density_milli=DEFAULT_DENSITY_MILLI,
            density_source="default",
        )

    @staticmethod
    def _context_budget_observation(snapshot: object) -> tuple[int | None, str, int | None]:
        """Trajectory-safe frozen budget facts; persisted reconstructions stay unknown."""
        if snapshot is None or getattr(snapshot, "base_source", None) == "persisted":
            return None, "unknown", getattr(snapshot, "primary_chars", None)
        density = getattr(snapshot, "density_milli", None)
        primary = getattr(snapshot, "primary_chars", None)
        return (
            density if type(density) is int else None,
            str(getattr(snapshot, "density_source", "") or "unknown"),
            primary if type(primary) is int else None,
        )

    def _capture_budget_snapshot(self, serving, config, st=None) -> ContextBudgetSnapshot:
        """Capture one budget snapshot beside one serving identity.

        ``st`` supplies the workload scope. Without it there is no honest
        owner for a calibrated density, so the snapshot uses the fixed prior
        rather than borrowing another workload's measurement.
        """
        compressor = self._get_context_compressor()
        model_for_budget = serving.model if serving.is_codex else None
        return snapshot_for_codex_config(
            model_for_budget,
            getattr(config, "openai_codex", None),
            max_context_chars=(compressor.max_context_chars if compressor is not None else None),
            observed_clamp=self._observed_clamp(model_for_budget),
            density_milli=self._observed_density(self._workload_scope(st), model_for_budget),
        )

    def _maybe_compress(
        self,
        st: _ChatTurn,
        request_client: object = None,
        request_config: object = None,
        *,
        budget_snapshot=None,
    ) -> bool:
        """Apply optional soft compaction and the mandatory accepted-size latch.

        Latch enforcement is recovery state: it runs even when soft
        compression is disabled and on restored iteration zero. Both passes
        use the surface-declared boundary, never content heuristics. Ordinary
        soft-compaction failures remain non-fatal; latch failures fail closed
        because resending a size already refused by the server is forbidden.
        """
        latch = getattr(st, "_char_latch", None)
        if budget_snapshot is None:
            budget_snapshot = getattr(st, "_generation_budget_snapshot", None)
        try:
            from ..llm.context_compressor import (
                SurfaceBoundary,
                compress_tool_context,
                emergency_compress_for_window,
                estimate_message_chars,
            )

            compressor = self._get_context_compressor()
            if budget_snapshot is None:
                if request_client is None and request_config is None:
                    request_client = self._llm_gateway.active_client
                model_for_budget = (
                    getattr(request_client, "model", None)
                    if hasattr(request_client, "reasoning_effort")
                    else None
                )
                from ..llm import context_budget

                budget_snapshot = context_budget.snapshot_for_codex_config(
                    model_for_budget,
                    getattr(
                        request_config if request_config is not None else self._get_config(),
                        "openai_codex",
                        None,
                    ),
                    max_context_chars=(
                        compressor.max_context_chars if compressor is not None else None
                    ),
                    observed_clamp=self._observed_clamp(model_for_budget),
                    density_milli=self._observed_density(
                        self._workload_scope(st), model_for_budget
                    ),
                )
            snapshot = budget_snapshot
            boundary = SurfaceBoundary(
                request_start=getattr(st, "_boundary_request_start", 0),
                elided_replay=getattr(st, "_boundary_elided_replay", 0),
                envelope_len=getattr(st, "_boundary_envelope_len", None),
            )
        except Exception:
            log.exception("context policy resolution failed")
            return latch is None

        if (
            compressor is not None
            and st.iteration > 0
            and estimate_message_chars(st.messages) > snapshot.primary_chars
        ):
            try:
                st.messages, saved = compress_tool_context(
                    st.messages,
                    max_context_chars=snapshot.primary_chars,
                    keep_recent=compressor.keep_recent_iterations,
                    stats=self._get_compression_stats(),
                    boundary=boundary,
                )
                log.info("context_compressor: trimmed %d chars", saved)
            except Exception:
                log.exception("context_compressor failed (non-fatal); continuing with full context")

        if latch is None:
            return True
        try:
            latch_target = min(latch, snapshot.primary_chars)
            if estimate_message_chars(st.messages) <= latch_target:
                return True
            st.messages, latch_report = emergency_compress_for_window(
                st.messages,
                target_chars=latch_target,
                boundary=boundary,
            )
            if latch_report.get("boundary_request_start") is not None:
                st._boundary_request_start = latch_report["boundary_request_start"]
                st._boundary_elided_replay = latch_report["boundary_elided_replay"]
            latch_report["attempt"] = 0
            latch_report["trigger"] = "latch"
            if st._trajectory is not None:
                st._trajectory.context_recoveries.append(latch_report)
            if not latch_report.get("fits"):
                # The protected request itself exceeds a size already known
                # to be survivable. Never resend the known-doomed payload.
                return False
            return True
        except Exception:
            log.exception("mandatory context latch enforcement failed; refusing request")
            return False

    async def _call_llm(
        self,
        st: _ChatTurn,
        request_client: object = None,
        *,
        serving_identity=None,
        request_config: object = None,
        budget_snapshot=None,
    ):
        """Guarded LLM call with typing indicator and deadline-based recovery.

        Returns ("ok", llm_resp) or ("done", <run() return tuple>).

        Transient failures — capacity (SSE overload inside a 200), transport,
        and an open client breaker — are retried by the shared recovery
        policy for up to the configured generation deadline (default 5 min),
        waiting through breakers and honouring retry_after. Auth failures,
        malformed requests, and quota exhaustion (429 after the client's own
        account rotation) still fail fast, exactly as before. /stop
        interrupts any recovery wait immediately.
        """
        _channel_id = str(st.message.channel.id)
        if st._gen_identity:
            # A turn resumed MID-RECOVERY continues the SAME logical
            # generation: the persisted identity FACTS select the provider,
            # client, breaker key, and both request axes. The live serving
            # identity is never spliced in — a live client wearing frozen
            # axes is neither the frozen generation nor a coherent new one.
            # If the frozen provider's client no longer exists, the
            # generation ends honestly instead of switching providers.
            _facts = st._gen_identity
            _fact_provider = str(_facts.get("provider") or "")
            _fact_client = {
                "codex": getattr(self._llm_gateway, "codex_client", None),
                "ollama": getattr(self._llm_gateway, "ollama_client", None),
                "kimi": getattr(self._llm_gateway, "kimi_client", None),
            }.get(_fact_provider)
            if _fact_client is None:
                return (
                    "done",
                    await self._llm_error_done(
                        st,
                        LLMRequestError(
                            "resumed generation's provider "
                            f"'{_fact_provider or 'unknown'}' is no longer configured"
                        ),
                    ),
                )
            serving_identity = LLMServingIdentity(
                provider=_fact_provider,
                client=_fact_client,
                model=_facts.get("model"),
                reasoning_effort=_facts.get("effort"),
            )
        elif serving_identity is None:
            serving_identity = _serving_identity_for(
                self._llm_gateway, fallback_client=request_client
            )
        request_client = serving_identity.client
        # Pre-admission and breaker identity are frozen beside the client that
        # every physical attempt will invoke.
        preflight_incompatible_effort(
            request_client,
            model=serving_identity.model,
            effort=serving_identity.reasoning_effort,
        )
        breaker = self._llm_gateway.capacity_breaker_for(
            serving_identity.model, provider=serving_identity.provider
        )
        policy = self._llm_gateway.recovery_policy()

        def _on_wait(wait: float, remaining: float, error: BaseException) -> None:
            log.info(
                "LLM recovery (%s): waiting %.1fs, %.0fs of generation budget left",
                type(error).__name__,
                wait,
                remaining,
            )

        # Pin both Codex request axes. The client object's attributes are
        # live-reloadable in place, so merely retaining the object is not an
        # identity freeze.
        pin_kwargs = {}
        if serving_identity.is_codex:
            if serving_identity.model:
                pin_kwargs["model"] = serving_identity.model
            if serving_identity.reasoning_effort is not None:
                pin_kwargs["reasoning_effort"] = serving_identity.reasoning_effort

        async def _attempt():
            webhook_id = getattr(st.message, "webhook_id", None)
            st.tools = self._scoped_tools_for_request(
                user_id=st.user_id,
                api_allowed=getattr(st.message, "allowed_tools", None),
                bypass_rbac=bool(
                    webhook_id and str(webhook_id) in _ALLOWED_WEBHOOK_IDS
                ),
                current_tools=st.tools,
                cache_result=False,
                request_config=request_config,
            )
            return await self._llm_gateway.call_with_tools(
                messages=st.messages,
                system=st.system_prompt,
                tools=st.tools or [],
                **pin_kwargs,
                user_id=st.user_id,
                channel_id=_channel_id,
                tools_used=st.tools_used_in_loop,
                serving_identity=serving_identity,
            )

        # A resumed generation carries only its REMAINING budget (persisted
        # UTC deadline): the generation that already spent its five minutes
        # gets one attempt, not a fresh window. Later generations budget
        # normally.
        resume_budget = st.durability.pop_resume_budget()
        deadline_seconds = policy.deadline_seconds if resume_budget is None else resume_budget

        # Persist the absolute recovery deadline BEFORE the call: a restart
        # mid-recovery reconstructs only the remaining budget, never a fresh
        # five minutes.
        await st.durability.on_generation_start(st, deadline_seconds)

        # Rescue ladder for this logical generation. A turn resumed
        # MID-RECOVERY reuses its persisted identity FACTS (provider/model/
        # effort/ladder) so the continued generation stays the same
        # generation — and continues at the NEXT rung via the persisted
        # st._rescue_passes, never re-arming rung one.
        from ..llm.context_compressor import estimate_message_chars

        if st._gen_identity:
            # The durable generation owns its exact budget snapshot; current
            # observer/config state is irrelevant until the next generation.
            _snapshot = self._snapshot_from_generation_facts(st._gen_identity)
        elif budget_snapshot is not None:
            _snapshot = budget_snapshot
        else:
            _root_config = request_config if request_config is not None else self._get_config()
            _snapshot = self._capture_budget_snapshot(serving_identity, _root_config, st)
        # Predictive pre-send descent consumes a PREFIX of the frozen ladder
        # locally, and only the remaining subset governs physical attempts.
        # This keeps ONE total ladder without inventing fake provider
        # attempts: st._rescue_passes and the codec's attempt records keep
        # meaning "rejected by the provider", and a resumed generation
        # continues its persisted remaining ladder rather than re-arming
        # rungs pre-send already spent.
        _presend_consumed = self._predictive_presend_descent(st, _snapshot, serving_identity)
        _ladder: tuple[int, ...] = _snapshot.ladder[_presend_consumed:]
        _generation_deadline = time.monotonic() + deadline_seconds
        _pending_latch: int | None = None
        _rescued_this_call = False
        _last_overflow: BaseException | None = None
        # Frozen facts for the attempt the provider actually REJECTED,
        # captured before that attempt and paired with its own overflow.
        _last_overflow_facts: object | None = None
        if st._gen_identity and st._rescue_passes:
            # Resume reconstructs the pending rejection from durable attempt
            # facts. The already-compressed payload is the acceptance
            # candidate; on success it publishes both the latch and evidence.
            _pending_latch = estimate_message_chars(st.messages)
            prior_attempts = st._gen_identity.get("attempts") or []
            prior = prior_attempts[-1] if prior_attempts else {}
            _last_overflow = LLMRequestError(
                "resumed structural context overflow",
                provider=serving_identity.provider,
                model=serving_identity.model,
                code="context_length_exceeded",
                account_key=prior.get("account_key"),
                server_input_tokens=prior.get("server_input_tokens"),
            )

        # Typing is best-effort (shared helper): a typing failure — setup or
        # cleanup — must never fail the call or misclassify provider errors.
        async with _best_effort_typing(st.message.channel):
            try:
                while True:
                    # Captured from the exact payload this attempt sends, and
                    # recomputed after every compaction, so a rescued retry
                    # never inherits the rejected attempt's belief.
                    _attempt_chars, _attempt_images = self._measure_payload(st.messages)
                    _attempt_facts = self._attempt_facts(
                        st.messages, _snapshot, serving_identity, self._workload_scope(st)
                    )
                    try:
                        llm_resp = await generate_with_recovery(
                            _attempt,
                            policy=policy,
                            breaker=breaker,
                            deadline_seconds=(
                                deadline_seconds
                                if not _rescued_this_call
                                else _generation_deadline - time.monotonic()
                            ),
                            cancel_event=st._cancel,
                            on_wait=_on_wait,
                        )
                        from ..usage.provenance import apply_accepted_usage

                        apply_accepted_usage(
                            llm_resp,
                            chars_sent=_attempt_chars,
                            images_sent=_attempt_images,
                            snapshot=_snapshot,
                        )
                        self._record_density(
                            st, llm_resp, _attempt_chars, _attempt_images, serving_identity
                        )
                        if _pending_latch is not None:
                            # Server-accepted evidence (the settled latch
                            # rule); the generation is settled, so its frozen
                            # facts and rung phase reset for the next one.
                            st._char_latch = _pending_latch
                            await self._record_window_evidence(
                                _last_overflow,
                                llm_resp,
                                _last_overflow_facts,
                                accepted_chars=_attempt_chars,
                                accepted_images=_attempt_images,
                                workload_scope=self._workload_scope(st),
                            )
                        if st._gen_identity is not None or st._rescue_passes:
                            st._gen_identity = None
                            st._rescue_passes = 0
                        break
                    except LLMRequestError as overflow_exc:
                        if (
                            getattr(overflow_exc, "code", None) != "context_length_exceeded"
                            or st._rescue_passes >= len(_ladder)
                            or _generation_deadline - time.monotonic() <= 0
                        ):
                            raise
                        from ..llm.context_compressor import (
                            emergency_compress_for_window,
                        )

                        target = _ladder[st._rescue_passes]
                        compressed, report = emergency_compress_for_window(
                            st.messages,
                            target_chars=target,
                            boundary=SurfaceBoundary(
                                request_start=st._boundary_request_start,
                                elided_replay=st._boundary_elided_replay,
                                envelope_len=getattr(st, "_boundary_envelope_len", None),
                            ),
                        )
                        report["attempt"] = st._rescue_passes + 1
                        report["trigger"] = "overflow"
                        if st._trajectory is not None:
                            st._trajectory.context_recoveries.append(report)
                        if not report.get("fits"):
                            raise
                        st.messages = compressed
                        st._rescue_passes += 1
                        _rescued_this_call = True
                        _last_overflow = overflow_exc
                        _last_overflow_facts = _attempt_facts
                        if report.get("boundary_request_start") is not None:
                            st._boundary_request_start = report["boundary_request_start"]
                            st._boundary_elided_replay = report["boundary_elided_replay"]
                        if st._gen_identity is None:
                            st._gen_identity = {
                                "provider": serving_identity.provider,
                                "model": serving_identity.model,
                                "effort": serving_identity.reasoning_effort,
                                "ladder": list(_ladder),
                                "budget": (
                                    {"primary_chars": _snapshot.primary_chars}
                                    if _snapshot is not None
                                    else None
                                ),
                                "attempts": [],
                            }
                        st._gen_identity.setdefault("attempts", []).append(
                            {
                                "attempt": st._rescue_passes,
                                "account_key": getattr(overflow_exc, "account_key", None),
                                "server_input_tokens": getattr(
                                    overflow_exc, "server_input_tokens", None
                                ),
                            }
                        )
                        _pending_latch = report["compressed_chars"]
                        # Durable BEFORE the resend (contract §7): mutated
                        # transcript + boundary + rung phase checkpoint with
                        # progressed=False and the stored deadline untouched.
                        # A write failure PROPAGATES — the retry never runs
                        # ahead of what resume can reconstruct.
                        await st.durability.on_context_recovery(st)
                        if _generation_deadline - time.monotonic() <= 0:
                            # The deadline expired during compression or the
                            # durability write. generate_with_recovery admits
                            # one attempt regardless of budget (it bounds
                            # WAITING), so refusal must happen HERE — never
                            # start a physical request after expiry.
                            raise
                        log.warning(
                            "Chat context overflow: rescue pass %d compressed "
                            "%d -> %d chars; retrying generation",
                            st._rescue_passes,
                            report["original_chars"],
                            report["compressed_chars"],
                        )
            except asyncio.CancelledError:
                if st._cancel.is_set():
                    # /stop fired during a recovery wait — the graceful stop
                    # path, not an error turn (same contract as the
                    # loop-head cancel checks).
                    return ("done", self._stopped(st, "llm_recovery"))
                raise
            except LLMCapacityError as cap_err:
                # The whole recovery budget expired on capacity. With
                # durability on, the work is preserved and the turn SUSPENDS
                # instead of discarding twenty tool calls because the
                # twenty-first couldn't reach the model.
                if st.durability.enabled:
                    return ("done", await self._suspend_turn(st, cap_err))
                return ("done", await self._llm_error_done(st, cap_err))
            except Exception as api_err:
                return ("done", await self._llm_error_done(st, api_err))

        return ("ok", llm_resp)

    async def _llm_error_done(self, st: _ChatTurn, api_err: BaseException):
        """Terminal LLM-failure path.

        Every operator/user-visible copy of the failure — the chat reply,
        the WebUI ``response`` field (same tuple), and the trajectory
        ``final_response`` the Traces page renders — carries the bounded
        formatter summary, never raw exception text (the 2026-08-14 edge
        incident posted a whole HTML error page into Discord through this
        line). Full diagnostics stay in the journal via ``exc_info``.
        """
        err_msg = format_user_facing_error(api_err)
        log.error("LLM API call failed: %s", err_msg, exc_info=api_err)
        await self._turn_recorder._save_turn_trajectory(
            st._trajectory, error=err_msg, trace=st.trace
        )
        self._clear_active(st)
        return (f"LLM API error: {err_msg}", False, True, st.tools_used_in_loop, False)

    async def _suspend_turn(self, st: _ChatTurn, cap_err: LLMCapacityError):
        """Suspend with preserved work; falls back to the plain error when
        suspension persistence itself fails (no false preservation claims)."""
        reason = str(cap_err) or "capacity exhausted"
        preserved = await st.durability.suspend(st, reason)
        if not preserved:
            return await self._llm_error_done(st, cap_err)

        minutes = max(1, round(self._llm_gateway.recovery_policy().deadline_seconds / 60.0))
        model = cap_err.model or "The model"
        n_tools = len(st.tools_used_in_loop)
        text = (
            f"{model} is out of capacity — I retried for ~{minutes} minute(s) "
            f"without getting through. I've preserved everything done so far "
            f"({n_tools} tool call(s)) and will pick this up automatically when "
            "capacity returns, as long as nothing else happens in this channel. "
            "You can also reply `resume` within 24h to continue manually."
        )
        await self._turn_recorder._save_turn_trajectory(
            st._trajectory,
            final_response=text,
            tools_used=st.tools_used_in_loop,
            trace=st.trace,
            observe_usage=False,
        )
        self._clear_active(st)
        if self._on_turn_suspended is not None and st.durability.lease is not None:
            try:
                self._on_turn_suspended(st.durability.lease.key, st.durability.lease.generation)
            except Exception:
                log.exception("Auto-resume registration failed (non-fatal)")
        return (text, False, True, st.tools_used_in_loop, False)

    @staticmethod
    def _append_pre_tool_control(st: _ChatTurn, message: dict) -> None:
        """Append a pre-tool directive and extend the protected envelope."""
        if st._boundary_envelope_len is None:
            from ..llm.context_compressor import _structural_envelope_end

            rest = st.messages[st._boundary_request_start :]
            st._boundary_envelope_len = _structural_envelope_end(rest)
        st.messages.append(message)
        envelope_end = st._boundary_request_start + st._boundary_envelope_len
        if not st.tools_used_in_loop and len(st.messages) == envelope_end + 1:
            st._boundary_envelope_len += 1

    async def _check_stuck_and_record(self, st: _ChatTurn, llm_resp):
        """Record this iteration's tool calls + LLM text into the trajectory
        and stuck tracker; terminate or nudge on a confirmed repeat cycle.

        Returns None to proceed, ("retry", None) after injecting the nudge,
        or ("done", <run() return tuple>) on confirmed-stuck termination.
        """
        from ..trajectories.saver import ToolIteration

        iter_tool_calls = [
            {"id": tc.id, "name": tc.name, "input": tc.input}
            for tc in (llm_resp.tool_calls or [])
        ]
        stored_tool_calls = [
            {
                **call,
                "input": _scrub_tool_input_for_storage(call["name"], call["input"]),
            }
            for call in iter_tool_calls
        ]
        density, density_source, primary_chars = self._context_budget_observation(
            getattr(st, "_generation_budget_snapshot", None)
        )
        st._trajectory.iterations.append(
            ToolIteration(
                iteration=st.iteration,
                tool_calls=stored_tool_calls,
                llm_text=llm_resp.text or "",
                input_tokens=llm_resp.input_tokens,
                output_tokens=llm_resp.output_tokens,
                server_input_tokens=getattr(llm_resp, "server_input_tokens", None),
                server_output_tokens=getattr(llm_resp, "server_output_tokens", None),
                estimated_input_tokens=getattr(llm_resp, "estimated_input_tokens", None),
                input_token_provenance=getattr(llm_resp, "input_token_provenance", "") or "",
                output_token_provenance=getattr(llm_resp, "output_token_provenance", "") or "",
                cached_tokens=getattr(llm_resp, "cached_tokens", None),
                cache_write_tokens=getattr(llm_resp, "cache_write_tokens", None),
                # Execution provenance from the response — the only source
                # that survives gateway routing, retries, and live reloads.
                # Missing provenance stays empty (unknown), never guessed.
                provider=getattr(llm_resp, "provenance_provider", "") or "",
                model=getattr(llm_resp, "provenance_model", "") or "",
                reasoning_effort=getattr(llm_resp, "provenance_reasoning_effort", None),
                context_density_milli=density,
                context_density_source=density_source,
                context_primary_chars=primary_chars,
            )
        )
        if is_wait_iteration(iter_tool_calls):
            # Deferred judgment (design settled with Odin, 2026-07-31):
            # identical wait-polls are the CORRECT shape while the target
            # progresses, and results do not exist yet at this point.
            # _check_wait_stuck records a result-aware fingerprint for this
            # iteration AFTER execution — exactly one record per iteration,
            # same window, same order. Mixed batches never take this path.
            return None
        st.stuck_tracker.record(iter_tool_calls)
        if st.stuck_tracker.check():
            if st.stuck_tracker.warned:
                log.warning("Stuck loop confirmed after warning — terminating tool loop")
                await self._turn_recorder._save_turn_trajectory(st._trajectory, trace=st.trace)
                await self._turn_recorder._emit_lifecycle_event(
                    "loop.stuck",
                    {
                        "channel_id": str(st.message.channel.id),
                        "iteration": st.iteration,
                        "tools_used": st.tools_used_in_loop,
                    },
                )
                self._clear_active(st)
                return (
                    "done",
                    (
                        (
                            f"Detected a stuck tool-call cycle after {st.iteration + 1} "
                            f"iterations. "
                            f"Stopping to avoid burning the iteration budget on a repeat pattern."
                        ),
                        False,
                        True,
                        st.tools_used_in_loop,
                        False,
                    ),
                )
            else:
                st.stuck_tracker.warned = True
                log.info("Stuck pattern detected — injecting nudge")
                self._append_pre_tool_control(
                    st,
                    {
                        "role": "developer",
                        "content": (
                            "You appear to be repeating the same tool-call sequence. "
                            "Try a different approach or summarise progress and stop."
                        ),
                    },
                )
                return ("retry", None)
        return None

    async def _judge_entry_stuck(self, st: _ChatTurn):
        """Complete a PENDING wait judgment at loop entry.

        The wait fingerprint is recorded before WI-4 but judged after it —
        a crash in that window restores a tripped tracker whose judgment
        never ran (round-2 blocker #2). The pending phase is EXPLICIT
        persisted state, never inferred from historical fingerprints
        (round-3 blocker #1): a nudge already delivered before a later
        suspension resumes with the phase clear and gets its post-nudge
        generation — only a genuinely undelivered judgment is completed
        here. ``warned`` semantics are identical to in-turn judgment:
        consumed flag → terminate with zero generations; unconsumed →
        nudge before the first generation.
        """
        if not st.wait_judgment_pending:
            return None
        st.wait_judgment_pending = False
        if not st.stuck_tracker.check():
            return None
        last_fp = st.stuck_tracker.last_fingerprint
        if st.stuck_tracker.warned:
            log.warning("Restored tracker already confirmed-stuck — terminating before generation")
            await self._turn_recorder._save_turn_trajectory(st._trajectory, trace=st.trace)
            await self._turn_recorder._emit_lifecycle_event(
                "loop.stuck",
                {
                    "channel_id": str(st.message.channel.id),
                    "iteration": st.iteration,
                    "tools_used": st.tools_used_in_loop,
                },
            )
            self._clear_active(st)
            return (
                "done",
                (
                    (
                        "Stopped on resume: the preserved iterations were already "
                        "repeating with no observable progress and the warning was "
                        "already consumed. The background work itself was not touched."
                    ),
                    False,
                    True,
                    st.tools_used_in_loop,
                    False,
                ),
            )
        st.stuck_tracker.warned = True
        if last_fp.startswith("wait:mp"):
            # Alive-ness rides IN the fingerprint (wait:mp:<pid>:<status>:…).
            parts = last_fp.split(":")
            alive = len(parts) > 3 and parts[3] == "running"
            nudge = (
                dict(_WAIT_PROCESS_NUDGE)
                if alive
                else {
                    "role": "developer",
                    "content": (
                        "You are repeating the same call against a finished or "
                        "missing target and getting the same result. Act on the "
                        "result you already have, or report and stop."
                    ),
                }
            )
        else:
            # Pending is set only by wait iterations, so the last
            # fingerprint is always wait:* — mp handled above, agents here.
            nudge = dict(_WAIT_AGENTS_NUDGE)
        log.info("Pending wait judgment tripped at entry — injecting nudge before generation")
        self._append_pre_tool_control(st, nudge)
        return ("retry", None)

    @staticmethod
    def _wait_result_text(tool_calls, tool_results) -> str:
        tc = tool_calls[0]
        for r in tool_results:
            if isinstance(r, dict) and r.get("tool_use_id") == tc.id:
                return str(r.get("content", ""))
        return ""

    def _record_wait_fingerprint(self, st: _ChatTurn, tool_calls, tool_results) -> bool:
        """Record (ONLY record) the result-aware fingerprint for a
        wait-class iteration. Runs BEFORE WI-4 so the checkpoint carries
        the stuck observation — a crash after the settled batch must not
        restore the result while forgetting what it proved (PR #244
        round-1 blocker #1). Judgment and termination are deferred to
        ``_judge_wait_stuck``, which runs only after WI-4 succeeded.

        Returns True iff this was a wait-class iteration.
        """
        iter_tool_calls = [
            {"id": tc.id, "name": tc.name, "input": tc.input} for tc in tool_calls
        ]
        if not is_wait_iteration(iter_tool_calls):
            return False
        tc = tool_calls[0]
        st.stuck_tracker.record_fingerprint(
            wait_iteration_fingerprint(
                tc.name, tc.input or {}, self._wait_result_text(tool_calls, tool_results)
            )
        )
        # Explicit pending-judgment phase (round-3 blocker #1): rides the
        # same WI-4 as the fingerprint; cleared by the judgment itself.
        st.wait_judgment_pending = True
        return True

    async def _judge_wait_stuck(self, st: _ChatTurn, tool_calls, tool_results):
        """Post-checkpoint stuck judgment for a wait-class iteration whose
        fingerprint ``_record_wait_fingerprint`` already recorded.

        Status transitions and output-byte growth are progress; a frozen
        signature walks the same warn-once-then-terminate ladder.
        ``warned`` stays one-shot: later progress never re-arms it.

        Returns None to proceed, ("retry", None) after the wait-aware
        nudge, or ("done", <run() return tuple>) on confirmed frozen
        repetition.
        """
        tc = tool_calls[0]
        result_text = self._wait_result_text(tool_calls, tool_results)
        # Judgment is happening NOW — the pending phase ends whatever the
        # outcome (the retry path persists this via WI-5; the no-trip path
        # via the next WI-4; the kill is terminal).
        st.wait_judgment_pending = False
        if not st.stuck_tracker.check():
            return None
        if st.stuck_tracker.warned:
            log.warning("Frozen wait repetition confirmed after warning — terminating tool loop")
            await self._turn_recorder._save_turn_trajectory(st._trajectory, trace=st.trace)
            await self._turn_recorder._emit_lifecycle_event(
                "loop.stuck",
                {
                    "channel_id": str(st.message.channel.id),
                    "iteration": st.iteration,
                    "tools_used": st.tools_used_in_loop,
                },
            )
            self._clear_active(st)
            return (
                "done",
                (
                    (
                        f"Stopped after {st.iteration + 1} iterations: repeated "
                        f"waiting on {tc.name} with no observable progress "
                        f"(no status change, no new output). The background "
                        f"work itself was not touched."
                    ),
                    False,
                    True,
                    st.tools_used_in_loop,
                    False,
                ),
            )
        st.stuck_tracker.warned = True
        if wait_target_alive(tc.name, result_text):
            nudge = _WAIT_PROCESS_NUDGE if tc.name == "manage_process" else _WAIT_AGENTS_NUDGE
            log.info("Frozen wait pattern detected (target alive) — injecting wait nudge")
        else:
            # Terminal/error results repeating: the target is NOT alive, so
            # the wait-specific advice would be a lie — ordinary guidance.
            nudge = {
                "role": "developer",
                "content": (
                    "You are repeating the same call against a finished or "
                    "missing target and getting the same result. Act on the "
                    "result you already have, or report and stop."
                ),
            }
            log.info("Frozen wait pattern detected (target not alive) — injecting nudge")
        self._append_pre_tool_control(st, dict(nudge))
        return ("retry", None)

    async def _finalize_or_retry(self, st: _ChatTurn, llm_resp):
        """The text-only-response branch: validation enforcement, the
        response-guard cascade (order pinned by characterization), the
        completion classifier, and final trajectory persistence.

        Returns ("done", <run() return tuple>) or ("retry", None) after
        injecting a retry/continuation message.
        """
        if st._cancel.is_set():
            return ("done", self._stopped(st, "before_validation"))
        # Enforce pending validation before allowing final response
        if st._validation_required and st._validation_retries < st._max_validation_retries:
            st._validation_retries += 1
            log.warning(
                "Validation required but model returned text — forcing continuation (attempt %d)",
                st._validation_retries,
            )
            self._append_pre_tool_control(
                st,
                {
                    "role": "developer",
                    "content": (
                        "[VALIDATION REQUIRED] You have pending post-action validation. "
                        "Call validate_action before responding to the user."
                    ),
                },
            )
            return ("retry", None)

        # Fabrication detection: if no tools were called and the
        # response looks like it fabricated results, retry once.
        if (
            not st.fabrication_retried
            and not st.tools_used_in_loop
            and detect_fabrication(llm_resp.text or "", st.tools_used_in_loop)
        ):
            log.warning("Fabrication detected — retrying with correction")
            st.fabrication_retried = True
            self._append_pre_tool_control(st, _FABRICATION_RETRY_MSG)
            return ("retry", None)

        if (
            not st.promise_retried
            and not st.tools_used_in_loop
            and detect_promise_without_action(llm_resp.text or "", st.tools_used_in_loop)
        ):
            log.warning("Promise without action detected — retrying")
            st.promise_retried = True
            self._append_pre_tool_control(st, _PROMISE_RETRY_MSG)
            return ("retry", None)

        if (
            not st.unavail_retried
            and not st.tools_used_in_loop
            and detect_tool_unavailable(llm_resp.text or "", st.tools_used_in_loop)
        ):
            log.warning("Tool-unavailability fabrication detected — retrying")
            st.unavail_retried = True
            self._append_pre_tool_control(st, _TOOL_UNAVAIL_RETRY_MSG)
            return ("retry", None)

        # Hedging detection: fires for ALL messages — Odin is an
        # executor, not a menu system.
        if (
            not st.hedging_retried
            and not st.tools_used_in_loop
            and detect_hedging(llm_resp.text or "", st.tools_used_in_loop)
        ):
            log.warning("Hedging detected — retrying")
            st.hedging_retried = True
            self._append_pre_tool_control(st, _HEDGING_RETRY_MSG)
            return ("retry", None)

        if (
            not st.code_hedging_retried
            and not st.tools_used_in_loop
            and detect_code_hedging(llm_resp.text or "", st.tools_used_in_loop)
        ):
            log.warning("Code-block hedging detected — retrying")
            st.code_hedging_retried = True
            self._append_pre_tool_control(st, _CODE_HEDGING_RETRY_MSG)
            return ("retry", None)

        # Premature failure: tools were called but gave up after one error
        if (
            not st.premature_failure_retried
            and st.tools_used_in_loop
            and detect_premature_failure(llm_resp.text or "", st.tools_used_in_loop)
        ):
            log.warning("Premature failure detected — retrying")
            st.premature_failure_retried = True
            self._append_pre_tool_control(st, _FAILURE_RETRY_MSG)
            return ("retry", None)

        # Tier 3: Completion classifier — uses LLM to judge whether
        # the user's request was fully addressed.
        if st.tools_used_in_loop and st.continuation_count < st.max_continuations:
            is_complete, reason = await self._completion_classifier.classify(
                st.message.content,
                llm_resp.text or "",
                st.tools_used_in_loop,
            )
            if not is_complete:
                log.info(
                    "Completion classifier: INCOMPLETE (%d/%d) "
                    "after %d tool calls — injecting continuation",
                    st.continuation_count + 1,
                    st.max_continuations,
                    len(st.tools_used_in_loop),
                )
                # Do NOT append the incomplete response as an assistant
                # message — inject the continuation nudge alone so
                # the model responds fresh with tool calls.
                if reason:
                    self._append_pre_tool_control(
                        st,
                        {
                            "role": "developer",
                            "content": (
                                f"You are not done. {reason}. Continue with tool calls now."
                            ),
                        },
                    )
                else:
                    self._append_pre_tool_control(st, _CONTINUATION_MSG)
                st.continuation_count += 1
                return ("retry", None)

        # Empty final text after a turn that DID its work is a choice, not a
        # failure: the completion classifier has already judged the turn
        # complete, and every anti-fabrication guard runs upstream of here.
        # Converting that silence into "I couldn't generate a response" was
        # itself the fabricated failure (thumbs-up reaction lands, apology
        # follows; video posts with its commentary, apology follows). With no
        # tools used, the fallback stands — a bare empty generation IS a
        # failure worth reporting.
        if llm_resp.text:
            _final = llm_resp.text
        elif st.tools_used_in_loop:
            _final = ""
        else:
            _final = _EMPTY_RESPONSE_FALLBACK
        await self._turn_recorder._save_turn_trajectory(
            st._trajectory,
            final_response=_final,
            tools_used=st.tools_used_in_loop,
            trace=st.trace,
        )
        self._clear_active(st)
        return ("done", (_final, False, False, st.tools_used_in_loop, False))

    async def _run_one_tool(self, st: _ChatTurn, block) -> dict:
        """Execute a single tool call: RBAC gate, native/executor dispatch,
        failure visibility, audit, recent-action tracking, validation
        bookkeeping. (The old `_run_tool` closure.)"""
        tool_name = block.name
        tool_input = block.input
        log.info(
            "Tool call: %s(%s)",
            tool_name,
            _scrub_tool_input_for_storage(tool_name, tool_input),
        )
        # The provider could not parse the model's arguments — do NOT
        # run the tool with a silently-empty input; bounce the error
        # back so the model retries with valid arguments.
        if getattr(block, "parse_error", None):
            log.warning("Tool call %s not executed: %s", tool_name, block.parse_error)
            return {
                "type": "tool_result",
                "tool_use_id": block.id,
                "content": (
                    f"Error: {block.parse_error}. The tool was NOT executed — "
                    "re-issue the call with valid JSON arguments."
                ),
            }
        # Central RBAC gate: Discord-native tools, skills, and MCP tools are
        # dispatched below WITHOUT going through ToolExecutor.execute() (the only
        # place check_permission runs). permissions.filter_tools is advisory
        # (offer-time) only, so enforce permission here for EVERY tool.
        _uid = str(st.message.author.id)
        _rbac_denial = self._tool_executor.check_permission(tool_name, _uid)
        if isinstance(_rbac_denial, str) and _rbac_denial:  # str = deny, None = allow
            log.warning("RBAC gate denied tool %s for user %s", tool_name, _uid)
            # Denied before any effect: settle the PREPARED intent as
            # definitely-not-applied so it can never look interrupted.
            await st.durability.after_tool(
                block, ok=False, uncertain=False, result_text=_rbac_denial
            )
            return {"type": "tool_result", "tool_use_id": block.id, "content": _rbac_denial}
        await self._delivery.set_status(TOOL_STATUS_LABELS.get(tool_name, f"Running: {tool_name}"))

        try:
            await self._audit.log_event(
                event_type="tool_start",
                action=tool_name,
                actor=str(st.message.author.id),
                channel_id=str(st.message.channel.id),
                metadata={
                    "tool_input_keys": list((tool_input or {}).keys()),
                    "iteration": st.iteration,
                    # The model's tool_use id. Consumers pair start with end by
                    # THIS, not by tool name: concurrent same-name calls cannot
                    # be told apart by name, and neither LIFO nor FIFO ordering
                    # is correct when a later call finishes first.
                    "call_id": block.id,
                },
            )
        except Exception:
            pass

        # WI-2: PREPARED→RUNNING BEFORE the external effect. A durability
        # failure here raises and blocks the effect (fail-closed) — the run()
        # escape guard turns it into a bounded error turn.
        await st.durability.before_tool(block)

        t0 = time.monotonic()
        error = None
        uncertain_outcome = False
        tool_result = None
        # Handle Discord-native tools
        try:
            if self._native_tools.handles(tool_name):
                result, _effects = await self._native_tools.dispatch(
                    tool_name,
                    tool_input,
                    message=st.message,
                    user_id=st.user_id,
                    skill_file_delivery=st.policy.skill_file_delivery,
                )
                if _effects.rebuild_system_prompt:
                    st.system_prompt = self._prompt_builder.build_full_prompt(
                        channel=st.message.channel,
                        user_id=st.user_id,
                    )
                # A native handler may return a ToolResult (e.g. generate_image
                # carries non-model-facing audit_metadata) — unwrap it so the
                # audit record picks up the metadata like the executor path.
                tool_result, result = _unwrap_native_result(result)
            elif is_mcp_tool(self._mcp_manager, tool_name):
                # MCP seam (P3): typed outcome → ToolResult. Uncertain
                # outcomes (request written, effect unknowable) flow into the
                # same OUTCOME_UNKNOWN ledger path as timeouts — never
                # confidently failed, never replayed.
                tool_result = await dispatch_mcp_tool(self._mcp_manager, tool_name, tool_input)
                result = str(tool_result)
                if not tool_result.ok:
                    error = tool_result.error or f"MCP tool {tool_name} failed"
                if _mcp_uncertain(tool_result):
                    uncertain_outcome = True
            else:
                # Bind this invocation's identity so streamed output can be
                # attributed to ONE call rather than merged by tool name.
                _call_token = _current_call_id.set(block.id)
                try:
                    tool_result = await self._tool_executor.execute(
                        tool_name,
                        tool_input,
                        user_id=st.user_id,
                    )
                finally:
                    _current_call_id.reset(_call_token)
                result = str(tool_result)
        except TimeoutError as e:
            error = str(e)
            result = f"Tool {tool_name} timed out: {e}"
            tool_result = None
            # An execution that started and died mid-flight may have applied
            # its effect — the ledger records OUTCOME_UNKNOWN, never a
            # confident failure (replay must not rerun it).
            uncertain_outcome = True
            log.warning("Tool %s timed out after %.1fs", tool_name, time.monotonic() - t0)
        except (ValueError, KeyError, TypeError) as e:
            error = str(e)
            result = f"Tool {tool_name} input error: {e}"
            tool_result = None
            uncertain_outcome = True
        except Exception as e:
            error = str(e)
            result = f"Error executing {tool_name}: {e}"
            tool_result = None
            uncertain_outcome = True
            log.warning("Unexpected tool error for %s: %s", tool_name, e)

        elapsed_ms = int((time.monotonic() - t0) * 1000)

        # Handle special image block return from analyze_image
        if isinstance(result, dict) and "__image_block__" in result:
            st.pending_image_blocks.append(result["__image_block__"])
            result = f"[Image loaded. Analyze it with this instruction: {result['__prompt__']}]"

        # Scrub secrets from tool output
        result = scrub_output_secrets(result)

        # Use structured metadata from ToolResult when available
        if tool_result is not None:
            elapsed_ms = tool_result.duration_ms or elapsed_ms
            if tool_result.error and not error:
                error = tool_result.error
            if tool_result.uncertain_outcome:
                uncertain_outcome = True
            if not tool_result.ok and not error:
                error = "tool reported failure"
            result = ensure_failure_visible(result, tool_result.ok)

        await self._audit_tool_outcome(
            st,
            tool_name,
            tool_input,
            result,
            elapsed_ms,
            error,
            tool_result,
            call_id=block.id,
        )

        # Track for conversational context
        try:
            self._channel_state.track_action(
                tool_name,
                tool_input,
                result[:200],
                elapsed_ms,
                channel_id=str(st.message.channel.id),
            )
        except Exception:
            pass  # Non-critical tracking

        # Track mutations requiring post-action validation
        if tool_result is not None and tool_result.requires_validation and tool_result.ok:
            st._pending_validations.append(f"{tool_name}: {tool_result.validation_reason}")

        # Truncate large outputs before sending back to the LLM.
        tool_content = truncate_tool_output(result)

        # WI-3: settle the op right after completion. ok → APPLIED;
        # a tool-reported failure → DEFINITELY_FAILED; an exception mid-
        # execution → OUTCOME_UNKNOWN (the effect may have applied).
        await st.durability.after_tool(
            block,
            ok=(tool_result.ok if tool_result is not None else error is None),
            uncertain=uncertain_outcome,
            result_text=tool_content,
        )

        return {
            "type": "tool_result",
            "tool_use_id": block.id,
            "content": tool_content,
        }

    async def _audit_tool_outcome(
        self,
        st: _ChatTurn,
        tool_name,
        tool_input,
        result,
        elapsed_ms,
        error,
        tool_result,
        *,
        call_id: str | None = None,
    ) -> None:
        """Write execution + tool_end audit records — never crash tool
        execution on audit failure. (Inline block of the old `_run_tool`.)"""
        # Audit log — never crash tool execution on audit failure
        try:
            scrubbed_input = _scrub_tool_input_for_storage(
                tool_name,
                {
                    k: scrub_output_secrets(str(v)) if isinstance(v, str) else v
                    for k, v in (tool_input or {}).items()
                },
            )
            await self._audit.log_execution(
                user_id=str(st.message.author.id),
                user_name=str(st.message.author),
                channel_id=str(st.message.channel.id),
                tool_name=tool_name,
                tool_input=scrubbed_input,
                approved=True,
                result_summary=result,
                execution_time_ms=elapsed_ms,
                error=error,
                risk_level=tool_result.risk_level if tool_result else None,
                risk_reason=tool_result.risk_reason if tool_result else None,
                audit_metadata=tool_result.audit_metadata if tool_result else None,
            )
            await self._audit.log_event(
                event_type="tool_end",
                action=tool_name,
                actor=str(st.message.author.id),
                channel_id=str(st.message.channel.id),
                detail=result[:150],
                metadata={
                    "elapsed_ms": elapsed_ms,
                    "error": error,
                    "iteration": st.iteration,
                    "call_id": call_id,
                },
            )
        except Exception as audit_err:
            log.warning("Audit log failed for %s: %s", tool_name, audit_err)

    async def _run_one_tool_with_timeout(self, st: _ChatTurn, block, tool_timeout) -> dict:
        """Run one tool with timeout and safe in-flight /stop preemption."""
        t = tool_timeout
        t = wait_for_agents_wrapper_timeout(
            block.name,
            block.input,
            t,
            grace_seconds=WAIT_FOR_AGENTS_NATIVE_GRACE_SECONDS,
        )
        tool_task = asyncio.create_task(self._run_one_tool(st, block))
        cancel_task: asyncio.Task | None = None
        effect_free = classify_tool_effect(block.name, block.input) == (
            ToolEffectClass.EFFECT_FREE_OBSERVATION
        )
        try:
            if effect_free:
                cancel_task = asyncio.create_task(st._cancel.wait())
                done, _pending = await asyncio.wait(
                    {tool_task, cancel_task},
                    timeout=t,
                    return_when=asyncio.FIRST_COMPLETED,
                )
                if tool_task in done:
                    # Completion wins a simultaneous race: the tool's own WI-3
                    # settlement is authoritative and must not be rewritten as
                    # an interruption merely because /stop arrived in the same
                    # event-loop turn.
                    return await tool_task
                if cancel_task in done and st._cancel.is_set():
                    tool_task.cancel()
                    await asyncio.gather(tool_task, return_exceptions=True)
                    error_msg = f"Tool '{block.name}' cancelled by /stop before any effect."
                    try:
                        await st.durability.after_tool_interrupted(block, error_msg)
                    except Exception:
                        # The same fail-closed rule as ordinary WI-3: never
                        # finish a cancelled turn while its op remains RUNNING.
                        log.exception("Ledger settle failed for cancelled %s", block.name)
                        raise
                    return {
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": error_msg,
                    }
                tool_task.cancel()
                await asyncio.gather(tool_task, return_exceptions=True)
                raise TimeoutError
            return await asyncio.wait_for(tool_task, timeout=t)
        except asyncio.CancelledError:
            # asyncio.wait() does not cancel its children when this wrapper is
            # cancelled. The old wait_for-only path did; preserve that
            # cleanup guarantee for shutdown and outer task cancellation.
            tool_task.cancel()
            await asyncio.gather(tool_task, return_exceptions=True)
            raise
        except TimeoutError:
            error_msg = f"Tool '{block.name}' timed out after {t}s"
            # WI-3 (interrupted): wait_for cancelled _run_one_tool before its
            # own settle. The persisted effect class decides whether this is a
            # definite non-effect failure or an unknown external outcome.
            try:
                await st.durability.after_tool_interrupted(block, error_msg)
            except Exception:
                log.exception("Ledger settle failed for timed-out %s", block.name)
            try:
                await self._audit.log_execution(
                    user_id=str(st.message.author.id),
                    user_name=str(st.message.author),
                    channel_id=str(st.message.channel.id),
                    tool_name=block.name,
                    tool_input=_scrub_tool_input_for_storage(block.name, block.input),
                    approved=True,
                    result_summary=error_msg,
                    execution_time_ms=int(t * 1000),
                    error=error_msg,
                )
            except Exception:
                pass
            return {
                "type": "tool_result",
                "tool_use_id": block.id,
                "content": error_msg,
            }
        finally:
            if cancel_task is not None:
                cancel_task.cancel()
                await asyncio.gather(cancel_task, return_exceptions=True)

    async def _execute_tool_calls(self, st: _ChatTurn, tool_calls) -> list:
        """Run all tool calls concurrently with per-tool timeout; append the
        result block to the message list (gather preserves call order)."""
        tool_timeout = self._get_config().tools.tool_timeout_seconds

        # WI-1: the LLM response transcript + PREPARED intents are durable
        # BEFORE any execution. Malformed intents (empty/duplicate call ids)
        # fail here and are bounced back as matched error results without
        # executing anything (Odin's rule: fail before execution).
        try:
            await st.durability.on_llm_response(st, tool_calls)
        except LedgerIntentError as intent_err:
            log.warning("Tool batch rejected before execution: %s", intent_err)
            tool_results = [
                {
                    "type": "tool_result",
                    "tool_use_id": b.id,
                    "content": (
                        f"Error: malformed tool-call batch ({intent_err}). "
                        "NOT executed — re-issue the calls with unique ids."
                    ),
                }
                for b in tool_calls
            ]
            st.messages.append({"role": "user", "content": list(tool_results)})
            return tool_results

        # Best-effort typing: the 2026-07-16 Discord incident (typing
        # endpoint returning HTML 500s) aborted whole turns at exactly this
        # line and dumped raw DiscordServerError HTML into chat.
        async with _best_effort_typing(st.message.channel):
            tool_results = await asyncio.gather(
                *[self._run_one_tool_with_timeout(st, b, tool_timeout) for b in tool_calls],
            )
        st.messages.append({"role": "user", "content": list(tool_results)})
        return tool_results

    async def _post_iteration(self, st: _ChatTurn, tool_calls, tool_results):
        """Post-execution bookkeeping: op-details pairing for reflection,
        trajectory result persistence, cancellation, validation state, and
        vision injection. Returns ("done", <tuple>) on /stop, else None."""
        from ..trajectories.saver import stored_tool_results

        # Pair calls with results for post-operation reflection. Stashed
        # per iteration so every loop exit path leaves the latest state.
        _results_by_id = {r.get("tool_use_id"): r for r in tool_results if isinstance(r, dict)}
        for _tc in tool_calls:
            if st.trace is not None and _tc.id not in _results_by_id:
                st.trace.warning(
                    "TOOL_RESULT_CONTINUATION_MISMATCH",
                    "error",
                    f"tool {_tc.name} call has no paired result",
                )
            _rcontent = str(_results_by_id.get(_tc.id, {}).get("content", ""))
            st._op_tool_details.append(
                {
                    "tool": _tc.name,
                    "input": _scrub_tool_input_for_storage(_tc.name, _tc.input),
                    "result": _rcontent[:300],
                    "error": _rcontent.lstrip()
                    .lower()
                    .startswith(("error", "[error", "failed", "traceback")),
                }
            )
        self._channel_state.last_op_details[str(st.message.channel.id)] = st._op_tool_details

        # Persist results onto the iteration recorded before execution —
        # without this the saved trajectory has calls but no outcomes.
        if st._trajectory.iterations:
            st._trajectory.iterations[-1].tool_results = stored_tool_results(
                tool_results,
                st._result_store_cap,
            )

        if st._cancel.is_set():
            return ("done", self._stopped(st, "after_tools"))

        # Clear validation requirement if validate_action was called this iteration
        if st._validation_required and "validate_action" in [t.name for t in tool_calls]:
            st._validation_required = False
            st._validation_retries = 0

        # Auto-inject validation instruction when mutations were detected
        if st._pending_validations:
            mutation_list = "; ".join(st._pending_validations)
            st._validation_required = True
            st.messages.append(
                {
                    "role": "developer",
                    "content": (
                        f"[AUTO-VALIDATE] Operational mutation(s) detected: {mutation_list}. "
                        "You MUST call validate_action now to confirm the change took effect. "
                        "Infer appropriate checks from the mutation type."
                    ),
                }
            )
            st._pending_validations.clear()

        # Inject pending image blocks as vision content for the next LLM call.
        # This reuses the same base64 image block format as _process_attachments.
        if st.pending_image_blocks:
            vision_content: list[dict] = list(st.pending_image_blocks)
            vision_content.append(
                {
                    "type": "text",
                    "text": (
                        "The image(s) above were fetched by analyze_image. "
                        "Describe and analyze them."
                    ),
                }
            )
            st.messages.append({"role": "user", "content": vision_content})
            log.info(
                "Injected %d image block(s) into tool loop messages",
                len(st.pending_image_blocks),
            )
            st.pending_image_blocks.clear()

        # WI-4: the batch is fully settled — tool-result continuation,
        # trajectory results, validation/vision state, and the advanced
        # iteration go durable in one fenced checkpoint (real progress).
        await st.durability.on_batch_settled(st)

        return None

    def _check_skill_handoff(self, st: _ChatTurn, tool_calls, tool_results):
        """Check if all tool calls in this iteration are skills that want
        Codex to handle the response instead of another tool-loop iteration.
        Returns ("done", <tuple with handoff=True>) or None."""
        tool_names_this_round = [b.name for b in tool_calls]
        if self._llm_gateway.active_client and all(
            self._skill_manager.should_handoff_to_codex(n) is True for n in tool_names_this_round
        ):
            # Collect skill results as context for Codex
            skill_output = "\n".join(r["content"] for r in tool_results if isinstance(r, dict))
            self._clear_active(st)
            return ("done", (skill_output, False, False, st.tools_used_in_loop, True))
        return None

    async def _finalize_cap_hit(self, st: _ChatTurn) -> tuple[str, bool, bool, list[str], bool]:
        """The for-loop fell through: iteration cap exhausted."""
        self._clear_active(st)
        log.warning(
            "Chat tool-iteration cap hit (%d) after %d tool calls; exiting loop",
            st.chat_cap,
            len(st.tools_used_in_loop),
        )
        _cap_msg = (
            f"Hit the chat tool-iteration cap ({st.chat_cap}) after "
            f"{len(st.tools_used_in_loop)} tool calls. Task may be partially "
            f"complete. Raise `tools.max_tool_iterations_chat` in config "
            f"(or via the web UI) if this happens often."
        )
        await self._turn_recorder._save_turn_trajectory(
            st._trajectory,
            final_response=_cap_msg,
            tools_used=st.tools_used_in_loop,
            trace=st.trace,
        )
        return (_cap_msg, False, True, st.tools_used_in_loop, False)

    # ------------------------------------------------------------------
    # Autonomous pipeline (old _run_loop_iteration) — orchestrator + phases
    # ------------------------------------------------------------------

    async def run_autonomous(
        self,
        prompt: str,
        channel: object,
        prev_context: str | None,
        user_id: str,
        policy: LoopPolicy = AUTONOMOUS_POLICY,
        *,
        cancel_event: asyncio.Event | None = None,
    ) -> str:
        """Run a single loop iteration through Codex with full tool access.

        Simplified version of the chat pipeline for autonomous loops: same
        Codex + tool execution pipeline but without detection retries.
        """
        if not self._llm_gateway.active_client:
            return "LLM provider not available."

        st = self._prepare_loop_turn(prompt, channel, prev_context, user_id, policy)

        for _iteration in range(st.loop_cap):
            if cancel_event is not None and cancel_event.is_set():
                raise asyncio.CancelledError
            st._iteration_index = _iteration
            # ONE capture per uninterrupted loop generation (same contract as
            # chat): compaction thresholds, preflight, breaker admission, and
            # every physical retry describe this exact client/model/effort.
            _config = self._get_config()
            _serving = _serving_identity_for(self._llm_gateway, _config)
            _budget_snapshot = self._capture_budget_snapshot(_serving, _config, st)
            st._generation_budget_snapshot = _budget_snapshot
            loop_trace = getattr(st, "_trace", None)
            if loop_trace is not None:
                density, source, primary = self._context_budget_observation(_budget_snapshot)
                loop_trace.context_budget(
                    generation=_iteration,
                    density_milli=density,
                    density_source=source,
                    primary_chars=primary,
                )
            self._maybe_compress_loop(st, _serving, _config, budget_snapshot=_budget_snapshot)
            kind, val = await self._call_loop_llm(
                st,
                serving_identity=_serving,
                request_config=_config,
                budget_snapshot=_budget_snapshot,
                cancel_event=cancel_event,
            )
            if kind == "done":
                return val
            response = val

            if self._record_loop_iteration(st, response, _iteration):
                break

            st.tool_calls_made += len(response.tool_calls)

            # Build assistant content with tool_use blocks (matches the chat
            # pipeline's format)
            st.messages.append({"role": "assistant", "content": build_assistant_content(response)})

            if cancel_event is not None and cancel_event.is_set():
                raise asyncio.CancelledError
            await self._execute_loop_tools(st, response)

        return await self._finalize_loop(st)

    def _prepare_loop_turn(
        self,
        prompt: str,
        channel: object,
        prev_context: str | None,
        user_id: str,
        policy: LoopPolicy,
    ) -> _LoopTurn:
        """Iteration setup: requester resolution, trajectory/trace init,
        message + system prompt + tool-definition assembly."""

        # Resolve requester name for audit logging and message proxy
        requester_name = "loop"
        for loop_info in self._loop_manager._loops.values():
            if loop_info.requester_id == user_id:
                requester_name = loop_info.requester_name
                break
        msg_proxy = _LoopMessageProxy(channel, user_id, requester_name)

        # Observability: loop iterations get the same trajectory + context
        # trace coverage as chat turns (they were previously invisible —
        # 10% of all tool executions had no recorded narrative).
        _turn_ctx = get_turn() or {}
        _loop_id = str(_turn_ctx.get("loop_id", ""))
        _loop_iter = int(_turn_ctx.get("loop_iteration", 0) or 0)  # noqa: F841 — kept from the pre-carve body
        from ..trajectories.saver import TrajectoryTurn

        _obs = getattr(self._get_config(), "observability", None)
        _loop_trace_on = _obs is None or getattr(_obs, "loop_trace", True)
        _result_store_cap = int(getattr(_obs, "max_tool_result_chars", 2000) or 2000)
        _trace = self._turn_recorder._new_context_trace() if _loop_trace_on else None
        _trajectory = None
        if _loop_trace_on:
            _trajectory = TrajectoryTurn(
                message_id=str(_turn_ctx.get("turn_id", "")),
                channel_id=str(getattr(channel, "id", "")),
                user_id=user_id,
                user_name=requester_name,
                source=policy.trajectory_source,
                loop_id=_loop_id,
                loop_iteration=_loop_iter,
            )
            self._turn_recorder._record_user_content(_trajectory, prompt)

        # Build messages for the iteration
        messages: list[dict] = []
        if prev_context:
            messages.append(
                {
                    "role": "user",
                    "content": f"Previous iteration results:\n{prev_context}",
                }
            )
            messages.append(
                {
                    "role": "assistant",
                    "content": "Understood, I have the context from previous iterations.",
                }
            )
        messages.append({"role": "user", "content": prompt})
        # Surface boundary: the prev-context exchange (two messages when
        # present) is replayable context; the current autonomous prompt and
        # everything after it is protected/iteration territory.
        loop_boundary = SurfaceBoundary(
            request_start=2 if prev_context else 0,
            envelope_len=_LOOP_ENVELOPE_LEN,
        )

        # Build system prompt and tool definitions
        if _trace is not None:
            with _trace.phase("system_prompt"):
                system_prompt = self._prompt_builder.build_full_prompt(
                    channel=channel,
                    user_id=user_id,
                    trace=_trace,
                )
            _trace.continuity("loop")
            if prev_context:
                _trace.section("loop_prev_context", tokens=len(prev_context) // 4)
        else:
            system_prompt = self._prompt_builder.build_full_prompt(channel=channel, user_id=user_id)
        tools = self._scoped_tools_for_request(user_id=user_id)

        tool_timeout = self._get_config().tools.tool_timeout_seconds
        channel_id_str = str(getattr(channel, "id", ""))
        loop_cap = self._get_config().tools.max_tool_iterations_loop

        return _LoopTurn(
            _boundary=loop_boundary,
            prompt=prompt,
            channel=channel,
            user_id=user_id,
            policy=policy,
            msg_proxy=msg_proxy,
            requester_name=requester_name,
            _loop_id=_loop_id,
            _trace=_trace,
            _trajectory=_trajectory,
            _result_store_cap=_result_store_cap,
            messages=messages,
            system_prompt=system_prompt,
            tools=tools,
            tool_timeout=tool_timeout,
            channel_id_str=channel_id_str,
            loop_cap=loop_cap,
        )

    async def _finish_loop(
        self,
        st: _LoopTurn,
        outcome_text: str,
        *,
        is_error: bool = False,
        failure_class: str = "",
        error_text: str = "",
    ) -> str:
        """Persist the loop turn and run gated reflection at every exit.
        (The old `_finish` closure.)"""
        if st._trajectory is not None:
            if st.context_recoveries:
                # Evidence rides the SAVED artifact, not a working list that
                # dies with the turn object (review round-1 blocker #3).
                st._trajectory.context_recoveries = list(st.context_recoveries)
            await self._turn_recorder._save_turn_trajectory(
                st._trajectory,
                error=error_text if is_error else "",
                final_response=outcome_text if not is_error else "",
                tools_used=[d["tool"] for d in st._loop_details],
                trace=st._trace,
            )
        self._turn_recorder._maybe_loop_reflect(
            loop_id=st._loop_id or st.channel_id_str,
            prompt=st.prompt,
            outcome=outcome_text,
            is_error=is_error,
            failure_class=failure_class,
            error_text=error_text,
            tool_details=st._loop_details,
            user_id=st.user_id,
        )
        return outcome_text

    def _maybe_compress_loop(self, st: _LoopTurn, serving, config, *, budget_snapshot=None) -> None:
        """Loop pre-send compaction (campaign phase 4 — loops previously had
        NO soft path at all): the shared soft pass at the serving model's
        derived target once tool iterations exist, plus the invocation-local
        accepted-size latch compaction with the loop's surface boundary.
        Non-fatal like every compaction guard."""
        compressor = self._get_context_compressor()
        try:
            from ..llm.context_compressor import (
                compress_tool_context,
                emergency_compress_for_window,
                estimate_message_chars,
            )

            snapshot = (
                budget_snapshot
                if budget_snapshot is not None
                else self._capture_budget_snapshot(serving, config, st)
            )
            if (
                compressor is not None
                and st._iteration_index > 0
                and estimate_message_chars(st.messages) > snapshot.primary_chars
            ):
                st.messages, _saved = compress_tool_context(
                    st.messages,
                    max_context_chars=snapshot.primary_chars,
                    keep_recent=compressor.keep_recent_iterations,
                    stats=self._get_compression_stats(),
                    boundary=st._boundary,
                )
                log.info(
                    "loop context_compressor: compressed %d older tool iterations",
                    _saved,
                )
            if st._char_latch is not None:
                latch_target = min(st._char_latch, snapshot.primary_chars)
                if estimate_message_chars(st.messages) > latch_target:
                    st.messages, latch_report = emergency_compress_for_window(
                        st.messages,
                        target_chars=latch_target,
                        boundary=st._boundary,
                    )
                    if latch_report.get("boundary_request_start") is not None:
                        st._boundary = SurfaceBoundary(
                            request_start=latch_report["boundary_request_start"],
                            elided_replay=latch_report["boundary_elided_replay"],
                            envelope_len=_LOOP_ENVELOPE_LEN,
                        )
                    latch_report["attempt"] = 0
                    latch_report["trigger"] = "latch"
                    st.context_recoveries.append(latch_report)
        except Exception:
            log.exception("loop compaction failed (non-fatal); continuing with full context")

    async def _call_loop_llm(
        self,
        st: _LoopTurn,
        *,
        serving_identity=None,
        request_config=None,
        budget_snapshot=None,
        cancel_event: asyncio.Event | None = None,
    ):
        """LLM call for one loop iteration with deadline-based recovery.

        Typed capacity/transport failures are retried in-iteration by the
        shared recovery policy; CircuitOpenError still re-raises to the loop
        manager (policy asymmetry — the manager owns backoff between
        iterations). The gateway bypass itself is unchanged (RFC-001 §4.3).
        Since phase 4, a structural context overflow rescues in-iteration:
        boundary-aware emergency compression, then a retry of the SAME frozen
        serving identity under the SAME monotonic deadline — rescue rungs
        never mint fresh budget, and an exhausted ladder finalizes exactly
        once through the existing failure path.

        Returns ("ok", response) or ("done", <run_autonomous() return str>).
        """
        if serving_identity is None:
            serving_identity = _serving_identity_for(self._llm_gateway, request_config)
        if request_config is None:
            request_config = self._get_config()
        breaker = self._llm_gateway.capacity_breaker_for(
            serving_identity.model, provider=serving_identity.provider
        )
        policy = self._llm_gateway.recovery_policy()

        pin_kwargs = {}
        if serving_identity.is_codex:
            if serving_identity.model:
                pin_kwargs["model"] = serving_identity.model
            if serving_identity.reasoning_effort is not None:
                pin_kwargs["reasoning_effort"] = serving_identity.reasoning_effort

        async def _attempt():
            if cancel_event is not None and cancel_event.is_set():
                raise asyncio.CancelledError
            st.tools = self._scoped_tools_for_request(
                user_id=getattr(st, "user_id", ""),
                current_tools=st.tools,
                cache_result=False,
                request_config=request_config,
            )
            return await serving_identity.client.chat_with_tools(
                messages=st.messages,
                system=st.system_prompt,
                tools=st.tools or [],
                **pin_kwargs,
            )

        _snapshot = (
            budget_snapshot
            if budget_snapshot is not None
            else self._capture_budget_snapshot(serving_identity, request_config, st)
        )
        # Predictive descent consumes a ladder PREFIX before any physical
        # attempt; only the remainder governs post-rejection rescue.
        _presend_consumed = self._predictive_presend_descent(st, _snapshot, serving_identity)
        _remaining_ladder: tuple[int, ...] = _snapshot.ladder[_presend_consumed:]
        # ONE monotonic deadline for the whole logical generation: the first
        # attempt runs on the policy's own budget; rescue retries pay for the
        # time already burned instead of minting a fresh window.
        generation_deadline = time.monotonic() + policy.deadline_seconds
        rescue_passes = 0
        pending_latch: int | None = None
        last_overflow: BaseException | None = None
        last_overflow_facts: object | None = None

        try:
            # Pre-admission fast-fail, same contract as the chat path — and
            # INSIDE the try, so LLMRequestError completes the loop through
            # _finish_loop (trajectory + reflection finalization) exactly
            # like any other failed generation instead of escaping
            # run_autonomous(). Frozen: the captured client, not live state.
            while True:
                attempt_chars, attempt_images = self._measure_payload(st.messages)
                attempt_facts = self._attempt_facts(
                    st.messages, _snapshot, serving_identity, self._workload_scope(st)
                )
                try:
                    preflight_incompatible_effort(
                        serving_identity.client,
                        model=serving_identity.model,
                        effort=serving_identity.reasoning_effort,
                    )
                    response = await generate_with_recovery(
                        _attempt,
                        policy=policy,
                        breaker=breaker,
                        retry_circuit_open=False,
                        deadline_seconds=(
                            None if rescue_passes == 0 else generation_deadline - time.monotonic()
                        ),
                    )
                    if cancel_event is not None and cancel_event.is_set():
                        raise asyncio.CancelledError
                    from ..usage.provenance import apply_accepted_usage

                    apply_accepted_usage(
                        response,
                        chars_sent=attempt_chars,
                        images_sent=attempt_images,
                        snapshot=_snapshot,
                    )
                    self._record_density(
                        st, response, attempt_chars, attempt_images, serving_identity
                    )
                    if pending_latch is not None:
                        # Server-accepted evidence, per the settled latch rule.
                        st._char_latch = pending_latch
                        await self._record_window_evidence(
                            last_overflow,
                            response,
                            last_overflow_facts,
                            accepted_chars=attempt_chars,
                            accepted_images=attempt_images,
                            workload_scope=self._workload_scope(st),
                        )
                    break
                except Exception as overflow_exc:
                    from ..llm.errors import LLMRequestError

                    is_overflow = (
                        isinstance(overflow_exc, LLMRequestError)
                        and getattr(overflow_exc, "code", None) == "context_length_exceeded"
                    )
                    ladder = _remaining_ladder
                    if (
                        not is_overflow
                        or rescue_passes >= len(ladder)
                        or generation_deadline - time.monotonic() <= 0
                    ):
                        raise
                    from ..llm.context_compressor import (
                        SurfaceBoundary,
                        emergency_compress_for_window,
                    )

                    target = ladder[rescue_passes]
                    rescue_passes += 1
                    compressed, report = emergency_compress_for_window(
                        st.messages,
                        target_chars=target,
                        boundary=st._boundary,
                    )
                    report["attempt"] = rescue_passes
                    report["trigger"] = "overflow"
                    st.context_recoveries.append(report)
                    if not report.get("fits"):
                        raise
                    st.messages = compressed
                    if report.get("boundary_request_start") is not None:
                        st._boundary = SurfaceBoundary(
                            request_start=report["boundary_request_start"],
                            elided_replay=report["boundary_elided_replay"],
                            envelope_len=_LOOP_ENVELOPE_LEN,
                        )
                    pending_latch = report["compressed_chars"]
                    last_overflow = overflow_exc
                    last_overflow_facts = attempt_facts
                    if generation_deadline - time.monotonic() <= 0:
                        # Same rule as chat: recovery deadlines bound waiting,
                        # not an admitted stream — never start a request
                        # after expiry.
                        raise
                    log.warning(
                        "Loop context overflow: rescue pass %d compressed "
                        "%d -> %d chars; retrying iteration",
                        rescue_passes,
                        report["original_chars"],
                        report["compressed_chars"],
                    )
        except CircuitOpenError:
            raise
        except Exception as e:
            # Loop outcome text, trajectory final_response, AND the
            # reflection error_text are all operator/user-visible — one
            # formatted summary feeds all three; the journal keeps the
            # full exception.
            err_msg = format_user_facing_error(e)
            log.warning("Loop iteration Codex call failed: %s", err_msg, exc_info=e)
            return (
                "done",
                await self._finish_loop(
                    st,
                    f"LLM call failed: {err_msg}",
                    is_error=True,
                    failure_class="provider",
                    error_text=err_msg,
                ),
            )
        # Bypass-path success: clear a latched llm_* guard key using the
        # response's immutable provenance (never the post-await active
        # provider) — the production mark_available wiring.
        self._llm_gateway.notify_generation_success(getattr(response, "provenance_provider", None))
        return ("ok", response)

    def _record_loop_iteration(self, st: _LoopTurn, response, _iteration: int) -> bool:
        """Record the iteration into the trajectory; update final text.
        Returns True when the loop ended naturally (tool-free response)."""
        from ..trajectories.saver import ToolIteration

        if st._trajectory is not None:
            density, density_source, primary_chars = self._context_budget_observation(
                getattr(st, "_generation_budget_snapshot", None)
            )
            st._trajectory.iterations.append(
                ToolIteration(
                    iteration=_iteration,
                    tool_calls=[
                        {
                            "id": tc.id,
                            "name": tc.name,
                            "input": _scrub_tool_input_for_storage(tc.name, tc.input),
                        }
                        for tc in (response.tool_calls or [])
                    ],
                    llm_text=response.text or "",
                    input_tokens=getattr(response, "input_tokens", 0) or 0,
                    output_tokens=getattr(response, "output_tokens", 0) or 0,
                    server_input_tokens=getattr(response, "server_input_tokens", None),
                    server_output_tokens=getattr(response, "server_output_tokens", None),
                    estimated_input_tokens=getattr(response, "estimated_input_tokens", None),
                    input_token_provenance=(
                        getattr(response, "input_token_provenance", "") or ""
                    ),
                    output_token_provenance=(
                        getattr(response, "output_token_provenance", "") or ""
                    ),
                    cached_tokens=getattr(response, "cached_tokens", None),
                    cache_write_tokens=getattr(response, "cache_write_tokens", None),
                    # Execution provenance from the response — the only source
                    # that survives gateway routing, retries, and live reloads.
                    # Missing provenance stays empty (unknown), never guessed.
                    provider=getattr(response, "provenance_provider", "") or "",
                    model=getattr(response, "provenance_model", "") or "",
                    reasoning_effort=getattr(response, "provenance_reasoning_effort", None),
                    context_density_milli=density,
                    context_density_source=density_source,
                    context_primary_chars=primary_chars,
                )
            )

        if response.text:
            st.final_text = response.text

        if not response.tool_calls:
            st.completed_naturally = True
            return True
        return False

    async def _run_one_loop_tool(self, st: _LoopTurn, block) -> dict:
        """Execute a single loop tool call through the shared dispatch path,
        with failure visibility and audit. (The old `_run_loop_tool` closure.)"""
        tool_name = block.name
        tool_input = block.input
        log.info(
            "Loop tool call: %s(%s)",
            tool_name,
            _scrub_tool_input_for_storage(tool_name, tool_input),
        )
        # Provider couldn't parse the model's arguments — don't run
        # the tool on a silently-empty input (see _run_one_tool).
        if getattr(block, "parse_error", None):
            log.warning("Loop tool call %s not executed: %s", tool_name, block.parse_error)
            return {
                "type": "tool_result",
                "tool_use_id": block.id,
                "content": (
                    f"Error: {block.parse_error}. The tool was NOT executed — "
                    "re-issue the call with valid JSON arguments."
                ),
            }

        t0 = time.monotonic()
        error = None
        try:
            _t = st.tool_timeout
            _t = wait_for_agents_wrapper_timeout(
                tool_name,
                tool_input,
                _t,
                grace_seconds=WAIT_FOR_AGENTS_NATIVE_GRACE_SECONDS,
            )
            dispatch = self.dispatch_loop_tool(
                tool_name,
                tool_input,
                st.msg_proxy,
                st.user_id,
            )
            if self._native_tools.handles(tool_name):
                # Do not bind across native tools such as spawn_agent: child
                # tasks copy ContextVars at creation and would inherit the
                # parent's call id for their whole lifetime.
                raw = await asyncio.wait_for(dispatch, timeout=_t)
            else:
                # Autonomous-loop executor calls use the same streamer as
                # chat. Bind their model tool-use id too, or concurrent
                # same-name calls cross streams in the WebUI.
                _call_token = _current_call_id.set(block.id)
                try:
                    raw = await asyncio.wait_for(dispatch, timeout=_t)
                finally:
                    _current_call_id.reset(_call_token)
            # Skill CRUD invalidates caches
            if tool_name in (
                "create_skill",
                "edit_skill",
                "delete_skill",
                "enable_skill",
                "disable_skill",
                "install_skill",
            ):
                st.system_prompt = self._prompt_builder.build_full_prompt(
                    channel=st.channel,
                    user_id=st.user_id,
                )
        except TimeoutError:
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

        # Make structured failure visible (see ensure_failure_visible)
        # and propagate it into the audit error field.
        _audit_meta = None
        if isinstance(raw, ToolResult):
            _audit_meta = raw.audit_metadata
            if not raw.ok and not error:
                error = raw.error or "tool reported failure"
            raw = ensure_failure_visible(str(raw), raw.ok)

        result = truncate_tool_output(scrub_output_secrets(str(raw)))

        # Audit log
        try:
            await self._audit.log_execution(
                user_id=st.user_id,
                user_name=st.requester_name,
                channel_id=st.channel_id_str,
                tool_name=tool_name,
                tool_input=_scrub_tool_input_for_storage(tool_name, tool_input),
                approved=True,
                result_summary=result,
                execution_time_ms=elapsed_ms,
                error=error,
                audit_metadata=_audit_meta,
            )
        except OSError as audit_err:
            log.warning("Audit write failed (I/O): %s", audit_err)
        except Exception as audit_err:
            log.warning("Audit write failed: %s", audit_err)

        return {
            "type": "tool_result",
            "tool_use_id": block.id,
            "content": result,
        }

    async def _execute_loop_tools(self, st: _LoopTurn, response) -> list:
        """Execute tools concurrently with per-tool timeout; append results
        and pair them into loop-details + the trajectory iteration."""
        tool_results = await asyncio.gather(
            *[self._run_one_loop_tool(st, tc) for tc in response.tool_calls],
        )
        st.messages.append({"role": "user", "content": list(tool_results)})

        _results_by_id = {r.get("tool_use_id"): r for r in tool_results if isinstance(r, dict)}
        for _tc in response.tool_calls:
            if st._trace is not None and _tc.id not in _results_by_id:
                st._trace.warning(
                    "TOOL_RESULT_CONTINUATION_MISMATCH",
                    "error",
                    f"loop tool {_tc.name} call has no paired result",
                )
            _rcontent = str(_results_by_id.get(_tc.id, {}).get("content", ""))
            st._loop_details.append(
                {
                    "tool": _tc.name,
                    "input": _scrub_tool_input_for_storage(_tc.name, _tc.input),
                    "result": _rcontent[:300],
                    "error": _rcontent.lstrip()
                    .lower()
                    .startswith(
                        (
                            "error",
                            "[error",
                            "failed",
                            "traceback",
                            "script failed",
                            "command failed",
                        )
                    ),
                }
            )

        # Persist results onto the iteration recorded before execution —
        # without this the saved trajectory has calls but no outcomes.
        if st._trajectory is not None and st._trajectory.iterations:
            from ..trajectories.saver import stored_tool_results

            st._trajectory.iterations[-1].tool_results = stored_tool_results(
                tool_results,
                st._result_store_cap,
            )
        return tool_results

    async def _finalize_loop(self, st: _LoopTurn) -> str:
        """Loop exits: natural completion, cap exhaustion, or no response.
        Scrub final text; posting is handled by _post_response in LoopManager."""
        # Only treat final_text as a clean success when the loop ended NATURALLY
        # (a tool-free response). If we fell out by exhausting the cap, any
        # final_text is stale pre-tool text from some earlier iteration —
        # returning it as is_error=False would silently hide the cap hit (the
        # cap-warning path below was unreachable whenever any iteration produced
        # text).
        if st.final_text and st.completed_naturally:
            final_text = scrub_output_secrets(st.final_text)
            if len(final_text) > DISCORD_MAX_LEN:
                final_text = final_text[: DISCORD_MAX_LEN - 50] + "\n... (truncated)"
            _had_tool_errors = any(d.get("error") for d in st._loop_details)
            _first_err = next((d for d in st._loop_details if d.get("error")), None)
            # Iteration succeeded after a mid-flight tool error: the turn is
            # saved as a success (is_error=False), but the failure detail is
            # passed through so the reflection gate can learn from recovered
            # errors without marking the trajectory failed.
            return await self._finish_loop(
                st,
                final_text,
                is_error=False,
                failure_class="command_failed" if _had_tool_errors else "",
                error_text=_first_err["result"] if _first_err else "",
            )

        # Cap exhausted without a tool-free response. Surface it (optionally with
        # the stale partial text) instead of hiding the truncation.
        if st.tool_calls_made >= st.loop_cap or not st.completed_naturally:
            log.warning(
                "Loop tool-iteration cap hit (%d) after %d tool calls; "
                "no tool-free summary from Codex",
                st.loop_cap,
                st.tool_calls_made,
            )
            _partial = ""
            if st.final_text:
                _partial = "\n\nLast partial output before the cap:\n" + scrub_output_secrets(
                    st.final_text[:1000],
                )
            return await self._finish_loop(
                st,
                f"Iteration hit the loop tool-iteration cap ({st.loop_cap}) "
                f"after {st.tool_calls_made} tool calls without a final summary. "
                f"Raise `tools.max_tool_iterations_loop` in config (or via the "
                f"web UI) if this happens repeatedly." + _partial,
                is_error=True,
                failure_class="cancelled",
                error_text=f"loop iteration cap {st.loop_cap} reached",
            )

        return await self._finish_loop(st, "(no response)")

    # ------------------------------------------------------------------
    # Loop tool dispatch (unchanged by the P1 carve)
    # ------------------------------------------------------------------

    async def dispatch_loop_tool(
        self,
        tool_name: str,
        tool_input: dict,
        msg_proxy: _LoopMessageProxy,
        user_id: str,
    ) -> str | dict | ToolResult:
        """Dispatch a tool call to the correct handler within a loop iteration.

        Mirrors the Discord-native tool dispatch in the chat pipeline, using
        a lightweight message proxy instead of a real Discord message.
        """
        t0 = time.monotonic()
        result = await self.dispatch_loop_tool_inner(tool_name, tool_input, msg_proxy, user_id)
        elapsed_ms = int((time.monotonic() - t0) * 1000)
        try:
            metadata = {
                "tool_input_keys": list((tool_input or {}).keys()),
                "elapsed_ms": elapsed_ms,
            }
            if isinstance(result, ToolResult) and result.audit_metadata:
                metadata.update(result.audit_metadata)
            await self._audit.log_event(
                event_type="loop_tool",
                action=tool_name,
                actor=user_id,
                detail=str(result)[:200] if isinstance(result, str) else "",
                channel_id=str(getattr(msg_proxy.channel, "id", "")),
                metadata=metadata,
            )
        except Exception:
            pass
        return result

    async def dispatch_loop_tool_inner(
        self,
        tool_name: str,
        tool_input: dict,
        msg_proxy: _LoopMessageProxy,
        user_id: str,
    ) -> str | dict | ToolResult:
        # Central RBAC gate: same enforcement as the message tool loop — these
        # handlers bypass ToolExecutor.execute(), so check permission for EVERY tool.
        _rbac_denial = self._tool_executor.check_permission(tool_name, user_id)
        if isinstance(_rbac_denial, str) and _rbac_denial:  # str = deny, None = allow
            log.warning("RBAC gate denied loop tool %s for user %s", tool_name, user_id)
            return _rbac_denial
        # One dispatch table for both pipelines (RFC-001 P5a).
        if self._native_tools.handles(tool_name):
            result, _effects = await self._native_tools.dispatch(
                tool_name,
                tool_input,
                message=msg_proxy,
                user_id=user_id,
                skill_file_delivery="stage",
            )
            return result
        # MCP seam (P3): same live-publication predicate as the chat path;
        # returns the structured ToolResult (callers consume .ok).
        if is_mcp_tool(self._mcp_manager, tool_name):
            return await dispatch_mcp_tool(self._mcp_manager, tool_name, tool_input)
        # --- Executor-routed tools (run_command, run_script, SSH, etc.) ---
        return await self._tool_executor.execute(tool_name, tool_input, user_id=user_id)
