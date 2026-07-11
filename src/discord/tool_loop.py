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
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Literal

import discord

from ..llm import CircuitOpenError
from ..llm.secret_scrubber import scrub_output_secrets
from ..observability.correlation import get_turn, set_turn
from ..odin_log import get_logger
from ..tools import ToolResult

if TYPE_CHECKING:
    from ..audit.logger import AuditLogger
    from ..observability.context_trace import ContextTraceCollector
    from ..permissions.manager import PermissionManager
    from ..tools.autonomous_loop import LoopManager
    from ..tools.executor import ToolExecutor
    from ..tools.skill_manager import SkillManager
    from ..trajectories.saver import TrajectoryTurn
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
from .response_guards import (
    _CODE_HEDGING_RETRY_MSG,
    _CONTINUATION_MSG,
    _FABRICATION_RETRY_MSG,
    _FAILURE_RETRY_MSG,
    _HEDGING_RETRY_MSG,
    _PROMISE_RETRY_MSG,
    _TOOL_UNAVAIL_RETRY_MSG,
    detect_code_hedging,
    detect_fabrication,
    detect_hedging,
    detect_premature_failure,
    detect_promise_without_action,
    detect_tool_unavailable,
    truncate_tool_output,
)
from .tool_loop_helpers import (
    _ALLOWED_WEBHOOK_IDS,
    _EMPTY_RESPONSE_FALLBACK,
    _scrub_tool_input_for_storage,
    ensure_failure_visible,  # noqa: F401 — re-export (client, tests)
)

log = get_logger("discord")

_LONG_TIMEOUT_TOOL_SET = frozenset({"claude_code"})


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


CHAT_POLICY = LoopPolicy(
    skill_file_delivery="send",
    trajectory_source="discord",
    audit_event_style="chat",
    iteration_cap_key="chat",
    llm_via_gateway=True,
    response_guards=True,
    completion_classifier=True,
)

AUTONOMOUS_POLICY = LoopPolicy(
    skill_file_delivery="stage",
    trajectory_source="loop",
    audit_event_style="loop",
    iteration_cap_key="loop",
    llm_via_gateway=False,
    response_guards=False,
    completion_classifier=False,
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
    pending_image_blocks: list = field(default_factory=list)
    _op_tool_details: list = field(default_factory=list)
    _pending_validations: list = field(default_factory=list)
    _validation_required: bool = False
    _validation_retries: int = 0
    _max_validation_retries: int = 2


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


class ToolLoopRunner:
    def __init__(self, deps: ToolLoopDeps) -> None:
        self._get_config = deps.get_config
        self._get_default_system_prompt = deps.get_default_system_prompt
        self._get_context_compressor = deps.get_context_compressor
        self._llm_gateway = deps.llm_gateway
        self._prompt_builder = deps.prompt_builder
        self._tool_catalog = deps.tool_catalog
        self._channel_state = deps.channel_state
        self._delivery = deps.delivery
        self._turn_recorder = deps.turn_recorder
        self._completion_classifier = deps.completion_classifier
        self._native_tools = deps.native_tools
        self._tool_executor = deps.tool_executor
        self._permissions = deps.permissions
        self._skill_manager = deps.skill_manager
        self._audit = deps.audit
        self._loop_manager = deps.loop_manager
        self._stuck_loop_tracker_cls = deps.stuck_loop_tracker_cls

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
            message, history, system_prompt_override, trace, policy
        )

        for iteration in range(st.chat_cap):
            st.iteration = iteration
            if st._cancel.is_set():
                return self._stopped(st, "iteration_start")

            self._maybe_compress(st)

            kind, val = await self._call_llm(st)
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
                continue  # nudge injected — next iteration

            # Gate on actual parsed tool calls, not is_tool_use (which is also
            # true when stop_reason=="tool_use" with zero calls). The sibling
            # loop already uses this stricter form; matching it prevents an
            # empty-tool_use response from skipping finalization and re-looping.
            if not llm_resp.tool_calls:
                kind, val = await self._finalize_or_retry(st, llm_resp)
                if kind == "done":
                    return val
                continue  # retry/continuation message injected

            # Build internal-format assistant content from LLMResponse
            # (the R5-extracted fragment; the pre-carve chat body inlined
            # the byte-identical block).
            st.messages.append(
                {"role": "assistant", "content": build_assistant_content(llm_resp)}
            )

            tool_calls = llm_resp.tool_calls
            st.tools_used_in_loop.extend(t.name for t in tool_calls)

            tool_results = await self._execute_tool_calls(st, tool_calls)

            outcome = await self._post_iteration(st, tool_calls, tool_results)
            if outcome is not None:
                return outcome[1]

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
    ) -> _ChatTurn:
        """Turn setup: prompt/tools resolution, request preamble, permission
        filtering, trajectory + correlation init, cancellation wiring."""

        system_prompt = system_prompt_override or self._get_default_system_prompt()
        tools = (
            self._tool_catalog.merged_definitions() if self._get_config().tools.enabled else None
        )
        messages = list(history)

        # Insert context separator between history and the current user request
        # so Codex evaluates tools fresh instead of repeating patterns from history
        is_bot_message = (
            getattr(message.author, "bot", False) and self._get_config().discord.respond_to_bots
        )
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

        # Filter tools based on user permission tier (skip for test webhooks)
        is_test_wh = message.webhook_id and str(message.webhook_id) in _ALLOWED_WEBHOOK_IDS
        if tools is not None and not is_test_wh:
            tools = self._permissions.filter_tools(user_id, tools)
            # Apply API token allowed_tools scope if present
            api_allowed = getattr(message, "allowed_tools", None)
            if api_allowed is not None and tools:
                allowed_set = set(api_allowed)
                tools = [t for t in tools if t["name"] in allowed_set]

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
            provider_cfg = getattr(self._get_config(), "llm_provider", None)
            trace.provider(
                name=getattr(provider_cfg, "active_provider", "codex") if provider_cfg else "codex",
                model=getattr(self._llm_gateway.active_client, "model", "") or "",
                reasoning_effort=getattr(
                    self._llm_gateway.active_client, "reasoning_effort", None
                ),
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
        _cancel = self._channel_state.cancel_events.setdefault(_ch_id, asyncio.Event())
        _req_id = req_hash
        self._channel_state.set_active_request(_ch_id, _req_id)

        return _ChatTurn(
            message=message,
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
        )

    def _clear_active(self, st: _ChatTurn) -> None:
        self._channel_state.clear_active_request(st._ch_id, st._req_id)

    def _stopped(self, st: _ChatTurn, where: str) -> tuple[str, bool, bool, list[str], bool]:
        log.info("Task stopped by /stop in channel %s at %s", st._ch_id, where)
        self._clear_active(st)
        suffix = ""
        if st._pending_validations or st._validation_required:
            suffix = " Pending post-action validation was not run."
        tools_note = (
            f" Tools used: {', '.join(st.tools_used_in_loop)}." if st.tools_used_in_loop else ""
        )
        return (
            f"Task stopped by user.{tools_note}{suffix}",
            False,
            False,
            st.tools_used_in_loop,
            False,
        )

    def _maybe_compress(self, st: _ChatTurn) -> None:
        """Context auto-compression — when accumulated tool iterations push
        the message list over the configured budget, summarise older
        iterations into a single text message and keep the most recent N
        iterations intact."""
        if self._get_context_compressor() is not None and st.iteration > 0:
            try:
                from ..llm.context_compressor import (
                    compress_tool_context,
                    estimate_message_chars,
                )

                _cc = self._get_context_compressor()
                if estimate_message_chars(st.messages) > _cc.max_context_chars:
                    st.messages, _saved = compress_tool_context(
                        st.messages,
                        max_context_chars=_cc.max_context_chars,
                        keep_recent=_cc.keep_recent_iterations,
                    )
                    log.info("context_compressor: trimmed %d chars", _saved)
            except Exception:
                log.exception(
                    "context_compressor failed (non-fatal); continuing with full context"
                )

    async def _call_llm(self, st: _ChatTurn):
        """Guarded LLM call with typing indicator and circuit-breaker recovery.

        Returns ("ok", llm_resp) or ("done", <run() return tuple>).
        """
        # Show typing indicator while waiting for LLM response.
        # Typing is best-effort — isolate typing setup failures from
        # LLM call failures so we don't misclassify provider errors.
        typing_cm = None
        try:
            typing_cm = st.message.channel.typing()
            await typing_cm.__aenter__()
        except (discord.HTTPException, ConnectionError, OSError) as typing_err:
            log.warning("Typing indicator failed (non-fatal): %s", typing_err)
            typing_cm = None

        _channel_id = str(st.message.channel.id)
        try:
            llm_resp = await self._llm_gateway.call_with_tools(
                messages=st.messages,
                system=st.system_prompt,
                tools=st.tools or [],
                user_message=getattr(st.message, "content", "") or "",
                user_id=st.user_id,
                channel_id=_channel_id,
                tools_used=st.tools_used_in_loop,
            )
        except CircuitOpenError as coe:
            wait_secs = min(coe.retry_after, 90.0)
            log.info(
                "Circuit breaker open for %s, waiting %.0fs for recovery",
                coe.provider,
                wait_secs,
            )
            await asyncio.sleep(wait_secs)
            try:
                llm_resp = await self._llm_gateway.call_with_tools(
                    messages=st.messages,
                    system=st.system_prompt,
                    tools=st.tools or [],
                    user_id=st.user_id,
                    channel_id=_channel_id,
                    tools_used=st.tools_used_in_loop,
                )
            except Exception as retry_err:
                await self._turn_recorder._save_turn_trajectory(
                    st._trajectory, error=str(retry_err), trace=st.trace
                )
                self._clear_active(st)
                return (
                    "done",
                    (
                        f"LLM API error (circuit breaker recovery failed): {retry_err}",
                        False,
                        True,
                        st.tools_used_in_loop,
                        False,
                    ),
                )
        except Exception as api_err:
            err_msg = str(api_err) or f"{type(api_err).__name__} (no message)"
            log.error("LLM API call failed: %s", err_msg, exc_info=True)
            await self._turn_recorder._save_turn_trajectory(
                st._trajectory, error=err_msg, trace=st.trace
            )
            self._clear_active(st)
            return (
                "done",
                (f"LLM API error: {err_msg}", False, True, st.tools_used_in_loop, False),
            )
        finally:
            if typing_cm is not None:
                try:
                    await typing_cm.__aexit__(None, None, None)
                except Exception:
                    pass

        return ("ok", llm_resp)

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
        st._trajectory.iterations.append(
            ToolIteration(
                iteration=st.iteration,
                tool_calls=iter_tool_calls,
                llm_text=llm_resp.text or "",
                input_tokens=llm_resp.input_tokens,
                output_tokens=llm_resp.output_tokens,
            )
        )
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
                st.messages.append(
                    {
                        "role": "developer",
                        "content": (
                            "You appear to be repeating the same tool-call sequence. "
                            "Try a different approach or summarise progress and stop."
                        ),
                    }
                )
                return ("retry", None)
        return None

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
                "Validation required but model returned text — "
                "forcing continuation (attempt %d)",
                st._validation_retries,
            )
            st.messages.append(
                {
                    "role": "developer",
                    "content": (
                        "[VALIDATION REQUIRED] You have pending post-action validation. "
                        "Call validate_action before responding to the user."
                    ),
                }
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
            st.messages.append(_FABRICATION_RETRY_MSG)
            return ("retry", None)

        if (
            not st.promise_retried
            and not st.tools_used_in_loop
            and detect_promise_without_action(llm_resp.text or "", st.tools_used_in_loop)
        ):
            log.warning("Promise without action detected — retrying")
            st.promise_retried = True
            st.messages.append(_PROMISE_RETRY_MSG)
            return ("retry", None)

        if (
            not st.unavail_retried
            and not st.tools_used_in_loop
            and detect_tool_unavailable(llm_resp.text or "", st.tools_used_in_loop)
        ):
            log.warning("Tool-unavailability fabrication detected — retrying")
            st.unavail_retried = True
            st.messages.append(_TOOL_UNAVAIL_RETRY_MSG)
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
            st.messages.append(_HEDGING_RETRY_MSG)
            return ("retry", None)

        if (
            not st.code_hedging_retried
            and not st.tools_used_in_loop
            and detect_code_hedging(llm_resp.text or "", st.tools_used_in_loop)
        ):
            log.warning("Code-block hedging detected — retrying")
            st.code_hedging_retried = True
            st.messages.append(_CODE_HEDGING_RETRY_MSG)
            return ("retry", None)

        # Premature failure: tools were called but gave up after one error
        if (
            not st.premature_failure_retried
            and st.tools_used_in_loop
            and detect_premature_failure(llm_resp.text or "", st.tools_used_in_loop)
        ):
            log.warning("Premature failure detected — retrying")
            st.premature_failure_retried = True
            st.messages.append(_FAILURE_RETRY_MSG)
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
                    st.messages.append(
                        {
                            "role": "developer",
                            "content": (
                                f"You are not done. {reason}. Continue with tool calls now."
                            ),
                        }
                    )
                else:
                    st.messages.append(_CONTINUATION_MSG)
                st.continuation_count += 1
                return ("retry", None)

        _final = llm_resp.text or _EMPTY_RESPONSE_FALLBACK
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
        log.info("Tool call: %s(%s)", tool_name, tool_input)
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
            return {"type": "tool_result", "tool_use_id": block.id, "content": _rbac_denial}
        await self._delivery.set_status(
            TOOL_STATUS_LABELS.get(tool_name, f"Running: {tool_name}")
        )

        try:
            await self._audit.log_event(
                event_type="tool_start",
                action=tool_name,
                actor=str(st.message.author.id),
                channel_id=str(st.message.channel.id),
                metadata={
                    "tool_input_keys": list((tool_input or {}).keys()),
                    "iteration": st.iteration,
                },
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
            else:
                tool_result = await self._tool_executor.execute(
                    tool_name,
                    tool_input,
                    user_id=st.user_id,
                )
                result = str(tool_result)
        except TimeoutError as e:
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
            st.pending_image_blocks.append(result["__image_block__"])
            result = (
                f"[Image loaded. Analyze it with this instruction: {result['__prompt__']}]"
            )

        # Scrub secrets from tool output
        result = scrub_output_secrets(result)

        # Use structured metadata from ToolResult when available
        if tool_result is not None:
            elapsed_ms = tool_result.duration_ms or elapsed_ms
            if tool_result.error and not error:
                error = tool_result.error
            if not tool_result.ok and not error:
                error = "tool reported failure"
            result = ensure_failure_visible(result, tool_result.ok)

        await self._audit_tool_outcome(
            st, tool_name, tool_input, result, elapsed_ms, error, tool_result
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

        return {
            "type": "tool_result",
            "tool_use_id": block.id,
            "content": tool_content,
        }

    async def _audit_tool_outcome(
        self, st: _ChatTurn, tool_name, tool_input, result, elapsed_ms, error, tool_result
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
                metadata={"elapsed_ms": elapsed_ms, "error": error, "iteration": st.iteration},
            )
        except Exception as audit_err:
            log.warning("Audit log failed for %s: %s", tool_name, audit_err)

    async def _run_one_tool_with_timeout(self, st: _ChatTurn, block, tool_timeout) -> dict:
        """Per-tool timeout wrapper around _run_one_tool (the old
        `_run_tool_with_timeout` closure)."""
        t = 3660 if block.name in _LONG_TIMEOUT_TOOL_SET else tool_timeout
        try:
            return await asyncio.wait_for(
                self._run_one_tool(st, block),
                timeout=t,
            )
        except TimeoutError:
            error_msg = f"Tool '{block.name}' timed out after {t}s"
            try:
                await self._audit.log_execution(
                    user_id=str(st.message.author.id),
                    user_name=str(st.message.author),
                    channel_id=str(st.message.channel.id),
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

    async def _execute_tool_calls(self, st: _ChatTurn, tool_calls) -> list:
        """Run all tool calls concurrently with per-tool timeout; append the
        result block to the message list (gather preserves call order)."""
        tool_timeout = self._get_config().tools.tool_timeout_seconds

        async with st.message.channel.typing():
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
    ) -> str:
        """Run a single loop iteration through Codex with full tool access.

        Simplified version of the chat pipeline for autonomous loops: same
        Codex + tool execution pipeline but without detection retries.
        """
        if not self._llm_gateway.active_client:
            return "LLM provider not available."

        st = self._prepare_loop_turn(prompt, channel, prev_context, user_id, policy)

        for _iteration in range(st.loop_cap):
            kind, val = await self._call_loop_llm(st)
            if kind == "done":
                return val
            response = val

            if self._record_loop_iteration(st, response, _iteration):
                break

            st.tool_calls_made += len(response.tool_calls)

            # Build assistant content with tool_use blocks (matches the chat
            # pipeline's format)
            st.messages.append(
                {"role": "assistant", "content": build_assistant_content(response)}
            )

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
        tools = (
            self._tool_catalog.merged_definitions() if self._get_config().tools.enabled else None
        )

        tool_timeout = self._get_config().tools.tool_timeout_seconds
        channel_id_str = str(getattr(channel, "id", ""))
        loop_cap = self._get_config().tools.max_tool_iterations_loop

        return _LoopTurn(
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

    async def _call_loop_llm(self, st: _LoopTurn):
        """LLM call for one loop iteration. CircuitOpenError re-raises to the
        loop manager (policy asymmetry — the manager owns backoff).

        Returns ("ok", response) or ("done", <run_autonomous() return str>).
        """
        try:
            response = await self._llm_gateway.active_client.chat_with_tools(
                messages=st.messages,
                system=st.system_prompt,
                tools=st.tools or [],
            )
        except CircuitOpenError:
            raise
        except Exception as e:
            log.warning("Loop iteration Codex call failed: %s", e)
            return (
                "done",
                await self._finish_loop(
                    st,
                    f"LLM call failed: {e}",
                    is_error=True,
                    failure_class="provider",
                    error_text=str(e),
                ),
            )
        return ("ok", response)

    def _record_loop_iteration(self, st: _LoopTurn, response, _iteration: int) -> bool:
        """Record the iteration into the trajectory; update final text.
        Returns True when the loop ended naturally (tool-free response)."""
        from ..trajectories.saver import ToolIteration

        if st._trajectory is not None:
            st._trajectory.iterations.append(
                ToolIteration(
                    iteration=_iteration,
                    tool_calls=[
                        {"id": tc.id, "name": tc.name, "input": tc.input}
                        for tc in (response.tool_calls or [])
                    ],
                    llm_text=response.text or "",
                    input_tokens=getattr(response, "input_tokens", 0) or 0,
                    output_tokens=getattr(response, "output_tokens", 0) or 0,
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
        log.info("Loop tool call: %s(%s)", tool_name, tool_input)
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
            _t = 3660 if tool_name in _LONG_TIMEOUT_TOOL_SET else st.tool_timeout
            raw = await asyncio.wait_for(
                self.dispatch_loop_tool(
                    tool_name,
                    tool_input,
                    st.msg_proxy,
                    st.user_id,
                ),
                timeout=_t,
            )
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
            await self._audit.log_event(
                event_type="loop_tool",
                action=tool_name,
                actor=user_id,
                detail=str(result)[:200] if isinstance(result, str) else "",
                channel_id=str(getattr(msg_proxy.channel, "id", "")),
                metadata={
                    "tool_input_keys": list((tool_input or {}).keys()),
                    "elapsed_ms": elapsed_ms,
                },
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
        # --- Executor-routed tools (run_command, run_script, SSH, etc.) ---
        return await self._tool_executor.execute(tool_name, tool_input, user_id=user_id)
