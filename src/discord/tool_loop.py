"""The chat tool-execution pipeline (RFC-001 Phase 7).

``ToolLoopRunner.run`` is the verbatim body of the old
``OdinBot._process_with_tools`` — the iteration loop with context
compression, the response-guard cascade, stuck-loop tracking, completion
continuations, validation enforcement, parallel tool execution with
timeouts, audit/trajectory recording, vision injection, skill handoff,
and /stop cancellation.

Like the dispatch registry (P5a, approved), the runner takes the bot as
``host`` and the moved body reads dependencies through it — that is the
honest statement of today's coupling. P8 parameterizes the loop with an
explicit policy when the autonomous pipeline folds in; interface
narrowing rides with that phase.
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass

import discord

from ..llm import CircuitOpenError
from ..llm.secret_scrubber import scrub_output_secrets
from ..observability.correlation import get_turn, set_turn
from ..odin_log import get_logger
from ..tools import ToolResult
from ..tools.executor import _ERROR_RESULT_PREFIXES
from .delivery import DISCORD_MAX_LEN
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

log = get_logger("discord")

_LONG_TIMEOUT_TOOL_SET = frozenset({"claude_code"})


def ensure_failure_visible(result_text: str, ok: bool) -> str:
    """Make a structurally-failed tool result visible to the model.

    execute() carries ok=False on ToolResult, but the model only sees
    str(result) — the raw output. When that text lacks an error prefix
    (e.g. run_command_multi's per-host markdown aggregate wrapping a
    denial), the model reads a refused action as success. Prefix it.
    """
    if ok or result_text.lstrip().startswith(_ERROR_RESULT_PREFIXES):
        return result_text
    return f"Error (tool reported failure):\n{result_text}"


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

    skill_file_delivery: str  # "send" (chat) | "stage" (autonomous)
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


class ToolLoopRunner:
    def __init__(self, host) -> None:
        self.host = host

    async def run(
        self,
        message: discord.Message,
        history: list[dict],
        system_prompt_override: str | None = None,
        trace=None,
        policy: LoopPolicy = CHAT_POLICY,
    ) -> tuple[str, bool, bool, list[str], bool]:
        """Process a message with the tool loop — see module docstring.

        Returns (text, already_sent, is_error, tools_used, handoff).
        """
        bot = self.host
        # Late imports from the client module (host of these module-level
        # globals; a top-level import would be circular). _ALLOWED_WEBHOOK_IDS
        # is rebound at startup, so the call-time import sees the live set.
        from .client import (
            _ALLOWED_WEBHOOK_IDS,
            _EMPTY_RESPONSE_FALLBACK,
            _scrub_tool_input_for_storage,
        )

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
        system_prompt = system_prompt_override or bot._system_prompt
        tools = bot._merged_tool_definitions() if bot.config.tools.enabled else None
        messages = list(history)

        # Insert context separator between history and the current user request
        # so Codex evaluates tools fresh instead of repeating patterns from history
        is_bot_message = (
            getattr(message.author, "bot", False) and bot.config.discord.respond_to_bots
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
            tools = bot.permissions.filter_tools(user_id, tools)
            # Apply API token allowed_tools scope if present
            api_allowed = getattr(message, "allowed_tools", None)
            if api_allowed is not None and tools:
                allowed_set = set(api_allowed)
                tools = [t for t in tools if t["name"] in allowed_set]

        # Collect image blocks from analyze_image calls for vision injection
        pending_image_blocks: list[dict] = []

        chat_cap = bot.config.tools.max_tool_iterations_chat
        log.info(
            "Tool loop starting: %d tools available, %d messages in history, cap=%d",
            len(tools) if tools else 0,
            len(messages),
            chat_cap,
        )

        await bot._set_status("Working...", task_start=True)

        # Per-turn StuckLoopTracker — detects repeating tool-call sequences and
        # nudges the LLM out of cycles before the iteration cap forces an exit.
        stuck_tracker = bot.stuck_loop_tracker_cls()

        # Per-turn trajectory accumulator — populated each iteration, saved at end.
        from ..trajectories.saver import ToolIteration, TrajectoryTurn, stored_tool_results

        _result_store_cap = int(
            getattr(
                getattr(bot.config, "observability", None),
                "max_tool_result_chars",
                2000,
            )
            or 2000
        )
        if trace is not None:
            provider_cfg = getattr(bot.config, "llm_provider", None)
            trace.provider(
                name=getattr(provider_cfg, "active_provider", "codex") if provider_cfg else "codex",
                model=getattr(bot.llm_client, "model", "") or "",
            )
        _op_tool_details: list[dict] = []
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
        bot._record_user_content(_trajectory, getattr(message, "content", "") or "")
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
        _max_validation_retries = 2

        # Per-request cancellation via /stop command
        _ch_id = str(message.channel.id)
        _cancel = bot._cancel_events.setdefault(_ch_id, asyncio.Event())
        _req_id = req_hash
        bot._channel_state.set_active_request(_ch_id, _req_id)

        def _clear_active():
            bot._channel_state.clear_active_request(_ch_id, _req_id)

        def _stopped(where: str) -> tuple[str, bool, bool, list[str], bool]:
            log.info("Task stopped by /stop in channel %s at %s", _ch_id, where)
            _clear_active()
            suffix = ""
            if _pending_validations or _validation_required:
                suffix = " Pending post-action validation was not run."
            tools_note = (
                f" Tools used: {', '.join(tools_used_in_loop)}." if tools_used_in_loop else ""
            )
            return (
                f"Task stopped by user.{tools_note}{suffix}",
                False,
                False,
                tools_used_in_loop,
                False,
            )

        for iteration in range(chat_cap):
            if _cancel.is_set():
                return _stopped("iteration_start")
            # Context auto-compression — when accumulated tool iterations push
            # the message list over the configured budget, summarise older
            # iterations into a single text message and keep the most recent N
            # iterations intact.
            if bot.context_compressor is not None and iteration > 0:
                try:
                    from ..llm.context_compressor import (
                        compress_tool_context,
                        estimate_message_chars,
                    )

                    if estimate_message_chars(messages) > bot.context_compressor.max_context_chars:
                        messages, _saved = compress_tool_context(
                            messages,
                            max_context_chars=bot.context_compressor.max_context_chars,
                            keep_recent=bot.context_compressor.keep_recent_iterations,
                        )
                        log.info("context_compressor: trimmed %d chars", _saved)
                except Exception:
                    log.exception(
                        "context_compressor failed (non-fatal); continuing with full context"
                    )

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
                llm_resp = await bot._codex_call(
                    messages=messages,
                    system=system_prompt,
                    tools=tools or [],
                    user_message=getattr(message, "content", "") or "",
                    user_id=user_id,
                    channel_id=_channel_id,
                    tools_used=tools_used_in_loop,
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
                    llm_resp = await bot._codex_call(
                        messages=messages,
                        system=system_prompt,
                        tools=tools or [],
                        user_id=user_id,
                        channel_id=_channel_id,
                        tools_used=tools_used_in_loop,
                    )
                except Exception as retry_err:
                    await bot._save_turn_trajectory(_trajectory, error=str(retry_err), trace=trace)
                    _clear_active()
                    return (
                        f"LLM API error (circuit breaker recovery failed): {retry_err}",
                        False,
                        True,
                        tools_used_in_loop,
                        False,
                    )
            except Exception as api_err:
                err_msg = str(api_err) or f"{type(api_err).__name__} (no message)"
                log.error("LLM API call failed: %s", err_msg, exc_info=True)
                await bot._save_turn_trajectory(_trajectory, error=err_msg, trace=trace)
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
            _trajectory.iterations.append(
                ToolIteration(
                    iteration=iteration,
                    tool_calls=iter_tool_calls,
                    llm_text=llm_resp.text or "",
                    input_tokens=llm_resp.input_tokens,
                    output_tokens=llm_resp.output_tokens,
                )
            )
            stuck_tracker.record(iter_tool_calls)
            if stuck_tracker.check():
                if stuck_tracker.warned:
                    log.warning("Stuck loop confirmed after warning — terminating tool loop")
                    await bot._save_turn_trajectory(_trajectory, trace=trace)
                    await bot._emit_lifecycle_event(
                        "loop.stuck",
                        {
                            "channel_id": str(message.channel.id),
                            "iteration": iteration,
                            "tools_used": tools_used_in_loop,
                        },
                    )
                    _clear_active()
                    return (
                        (
                            f"Detected a stuck tool-call cycle after {iteration + 1} iterations. "
                            f"Stopping to avoid burning the iteration budget on a repeat pattern."
                        ),
                        False,
                        True,
                        tools_used_in_loop,
                        False,
                    )
                else:
                    stuck_tracker.warned = True
                    log.info("Stuck pattern detected — injecting nudge")
                    messages.append(
                        {
                            "role": "developer",
                            "content": (
                                "You appear to be repeating the same tool-call sequence. "
                                "Try a different approach or summarise progress and stop."
                            ),
                        }
                    )
                    continue
            # Gate on actual parsed tool calls, not is_tool_use (which is also
            # true when stop_reason=="tool_use" with zero calls). The sibling
            # loop already uses this stricter form; matching it prevents an
            # empty-tool_use response from skipping finalization and re-looping.
            if not llm_resp.tool_calls:
                if _cancel.is_set():
                    return _stopped("before_validation")
                # Enforce pending validation before allowing final response
                if _validation_required and _validation_retries < _max_validation_retries:
                    _validation_retries += 1
                    log.warning(
                        "Validation required but model returned text — "
                        "forcing continuation (attempt %d)",
                        _validation_retries,
                    )
                    messages.append(
                        {
                            "role": "developer",
                            "content": (
                                "[VALIDATION REQUIRED] You have pending post-action validation. "
                                "Call validate_action before responding to the user."
                            ),
                        }
                    )
                    continue

                # Fabrication detection: if no tools were called and the
                # response looks like it fabricated results, retry once.
                if (
                    not fabrication_retried
                    and not tools_used_in_loop
                    and detect_fabrication(llm_resp.text or "", tools_used_in_loop)
                ):
                    log.warning("Fabrication detected — retrying with correction")
                    fabrication_retried = True
                    messages.append(_FABRICATION_RETRY_MSG)
                    continue

                if (
                    not promise_retried
                    and not tools_used_in_loop
                    and detect_promise_without_action(llm_resp.text or "", tools_used_in_loop)
                ):
                    log.warning("Promise without action detected — retrying")
                    promise_retried = True
                    messages.append(_PROMISE_RETRY_MSG)
                    continue

                if (
                    not unavail_retried
                    and not tools_used_in_loop
                    and detect_tool_unavailable(llm_resp.text or "", tools_used_in_loop)
                ):
                    log.warning("Tool-unavailability fabrication detected — retrying")
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
                    log.warning("Hedging detected — retrying")
                    hedging_retried = True
                    messages.append(_HEDGING_RETRY_MSG)
                    continue

                if (
                    not code_hedging_retried
                    and not tools_used_in_loop
                    and detect_code_hedging(llm_resp.text or "", tools_used_in_loop)
                ):
                    log.warning("Code-block hedging detected — retrying")
                    code_hedging_retried = True
                    messages.append(_CODE_HEDGING_RETRY_MSG)
                    continue

                # Premature failure: tools were called but gave up after one error
                if (
                    not premature_failure_retried
                    and tools_used_in_loop
                    and detect_premature_failure(llm_resp.text or "", tools_used_in_loop)
                ):
                    log.warning("Premature failure detected — retrying")
                    premature_failure_retried = True
                    messages.append(_FAILURE_RETRY_MSG)
                    continue

                # Tier 3: Completion classifier — uses LLM to judge whether
                # the user's request was fully addressed.
                if tools_used_in_loop and continuation_count < max_continuations:
                    is_complete, reason = await bot._classify_completion(
                        message.content,
                        llm_resp.text or "",
                        tools_used_in_loop,
                    )
                    if not is_complete:
                        log.info(
                            "Completion classifier: INCOMPLETE (%d/%d) "
                            "after %d tool calls — injecting continuation",
                            continuation_count + 1,
                            max_continuations,
                            len(tools_used_in_loop),
                        )
                        # Do NOT append the incomplete response as an assistant
                        # message — inject the continuation nudge alone so
                        # the model responds fresh with tool calls.
                        if reason:
                            messages.append(
                                {
                                    "role": "developer",
                                    "content": (
                                        f"You are not done. {reason}. Continue with tool calls now."
                                    ),
                                }
                            )
                        else:
                            messages.append(_CONTINUATION_MSG)
                        continuation_count += 1
                        continue

                _final = llm_resp.text or _EMPTY_RESPONSE_FALLBACK
                await bot._save_turn_trajectory(
                    _trajectory,
                    final_response=_final,
                    tools_used=tools_used_in_loop,
                    trace=trace,
                )
                _clear_active()
                return _final, False, False, tools_used_in_loop, False

            # Build internal-format assistant content from LLMResponse
            assistant_content: list[dict] = []
            if llm_resp.text:
                assistant_content.append({"type": "text", "text": llm_resp.text})
            for tc in llm_resp.tool_calls:
                assistant_content.append(
                    {
                        "type": "tool_use",
                        "id": tc.id,
                        "name": tc.name,
                        "input": tc.input,
                    }
                )
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
                _uid = str(message.author.id)
                _rbac_denial = bot.tool_executor.check_permission(tool_name, _uid)
                if isinstance(_rbac_denial, str) and _rbac_denial:  # str = deny, None = allow
                    log.warning("RBAC gate denied tool %s for user %s", tool_name, _uid)
                    return {"type": "tool_result", "tool_use_id": block.id, "content": _rbac_denial}
                await bot._set_status(
                    bot._TOOL_STATUS_LABELS.get(tool_name, f"Running: {tool_name}")
                )

                try:
                    await bot.audit.log_event(
                        event_type="tool_start",
                        action=tool_name,
                        actor=str(message.author.id),
                        channel_id=str(message.channel.id),
                        metadata={
                            "tool_input_keys": list((tool_input or {}).keys()),
                            "iteration": iteration,
                        },
                    )
                except Exception:
                    pass

                t0 = time.monotonic()
                error = None
                tool_result = None
                # Handle Discord-native tools
                try:
                    if bot._native_tools.handles(tool_name):
                        result, _effects = await bot._native_tools.dispatch(
                            tool_name,
                            tool_input,
                            message=message,
                            user_id=user_id,
                            skill_file_delivery=policy.skill_file_delivery,
                        )
                        if _effects.rebuild_system_prompt:
                            system_prompt = bot._build_system_prompt(
                                channel=message.channel,
                                user_id=user_id,
                            )
                    else:
                        tool_result = await bot.tool_executor.execute(
                            tool_name,
                            tool_input,
                            user_id=user_id,
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
                    pending_image_blocks.append(result["__image_block__"])
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
                    result = bot._ensure_failure_visible(result, tool_result.ok)

                # Audit log — never crash tool execution on audit failure
                try:
                    scrubbed_input = _scrub_tool_input_for_storage(
                        tool_name,
                        {
                            k: scrub_output_secrets(str(v)) if isinstance(v, str) else v
                            for k, v in (tool_input or {}).items()
                        },
                    )
                    await bot.audit.log_execution(
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
                    await bot.audit.log_event(
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
                    bot._track_recent_action(
                        tool_name,
                        tool_input,
                        result[:200],
                        elapsed_ms,
                        channel_id=str(message.channel.id),
                    )
                except Exception:
                    pass  # Non-critical tracking

                # Track mutations requiring post-action validation
                if tool_result is not None and tool_result.requires_validation and tool_result.ok:
                    _pending_validations.append(f"{tool_name}: {tool_result.validation_reason}")

                # Truncate large outputs before sending back to the LLM.
                tool_content = truncate_tool_output(result)

                return {
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": tool_content,
                }

            # Run all tool calls concurrently with per-tool timeout
            tool_timeout = bot.config.tools.tool_timeout_seconds

            async def _run_tool_with_timeout(block):
                t = 3660 if block.name in _LONG_TIMEOUT_TOOL_SET else tool_timeout
                try:
                    return await asyncio.wait_for(
                        _run_tool(block),
                        timeout=t,
                    )
                except TimeoutError:
                    error_msg = f"Tool '{block.name}' timed out after {t}s"
                    try:
                        await bot.audit.log_execution(
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
            _results_by_id = {r.get("tool_use_id"): r for r in tool_results if isinstance(r, dict)}
            for _tc in tool_calls:
                if trace is not None and _tc.id not in _results_by_id:
                    trace.warning(
                        "TOOL_RESULT_CONTINUATION_MISMATCH",
                        "error",
                        f"tool {_tc.name} call has no paired result",
                    )
                _rcontent = str(_results_by_id.get(_tc.id, {}).get("content", ""))
                _op_tool_details.append(
                    {
                        "tool": _tc.name,
                        "input": _scrub_tool_input_for_storage(_tc.name, _tc.input),
                        "result": _rcontent[:300],
                        "error": _rcontent.lstrip()
                        .lower()
                        .startswith(("error", "[error", "failed", "traceback")),
                    }
                )
            bot._last_op_details[str(message.channel.id)] = _op_tool_details

            # Persist results onto the iteration recorded before execution —
            # without this the saved trajectory has calls but no outcomes.
            if _trajectory.iterations:
                _trajectory.iterations[-1].tool_results = stored_tool_results(
                    tool_results,
                    _result_store_cap,
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
                messages.append(
                    {
                        "role": "developer",
                        "content": (
                            f"[AUTO-VALIDATE] Operational mutation(s) detected: {mutation_list}. "
                            "You MUST call validate_action now to confirm the change took effect. "
                            "Infer appropriate checks from the mutation type."
                        ),
                    }
                )
                _pending_validations.clear()

            # Inject pending image blocks as vision content for the next LLM call.
            # This reuses the same base64 image block format as _process_attachments.
            if pending_image_blocks:
                vision_content: list[dict] = list(pending_image_blocks)
                vision_content.append(
                    {
                        "type": "text",
                        "text": (
                            "The image(s) above were fetched by analyze_image. "
                            "Describe and analyze them."
                        ),
                    }
                )
                messages.append({"role": "user", "content": vision_content})
                log.info(
                    "Injected %d image block(s) into tool loop messages", len(pending_image_blocks)
                )
                pending_image_blocks.clear()

            # Check if all tool calls in this iteration are skills that want
            # Codex to handle the response instead of another tool-loop iteration.
            tool_names_this_round = [b.name for b in tool_calls]
            if bot.llm_client and all(
                bot.skill_manager.should_handoff_to_codex(n) is True for n in tool_names_this_round
            ):
                # Collect skill results as context for Codex
                skill_output = "\n".join(r["content"] for r in tool_results if isinstance(r, dict))
                _clear_active()
                return skill_output, False, False, tools_used_in_loop, True  # handoff=True

        _clear_active()
        log.warning(
            "Chat tool-iteration cap hit (%d) after %d tool calls; exiting loop",
            chat_cap,
            len(tools_used_in_loop),
        )
        _cap_msg = (
            f"Hit the chat tool-iteration cap ({chat_cap}) after "
            f"{len(tools_used_in_loop)} tool calls. Task may be partially "
            f"complete. Raise `tools.max_tool_iterations_chat` in config "
            f"(or via the web UI) if this happens often."
        )
        await bot._save_turn_trajectory(
            _trajectory,
            final_response=_cap_msg,
            tools_used=tools_used_in_loop,
            trace=trace,
        )
        return _cap_msg, False, True, tools_used_in_loop, False

    async def run_autonomous(
        self,
        prompt: str,
        channel: object,
        prev_context: str | None,
        user_id: str,
        policy: LoopPolicy = AUTONOMOUS_POLICY,
    ) -> str:
        """Run a single loop iteration through Codex with full tool access.

        Simplified version of _process_with_tools for autonomous loops:
        same Codex + tool execution pipeline but without detection retries.
        """
        bot = self.host
        from .client import _scrub_tool_input_for_storage

        if not bot.llm_client:
            return "LLM provider not available."

        # Resolve requester name for audit logging and message proxy
        requester_name = "loop"
        for loop_info in bot.loop_manager._loops.values():
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

        _obs = getattr(bot.config, "observability", None)
        _loop_trace_on = _obs is None or getattr(_obs, "loop_trace", True)
        _result_store_cap = int(getattr(_obs, "max_tool_result_chars", 2000) or 2000)
        _trace = bot._new_context_trace() if _loop_trace_on else None
        _trajectory = None
        _loop_details: list[dict] = []
        if _loop_trace_on:
            _trajectory = TrajectoryTurn(
                message_id=str(_turn_ctx.get("turn_id", "")),
                channel_id=str(getattr(channel, "id", "")),
                user_id=user_id,
                user_name=requester_name,
                source=policy.trajectory_source,
            )
            bot._record_user_content(_trajectory, prompt)

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
                system_prompt = bot._build_system_prompt(
                    channel=channel,
                    user_id=user_id,
                    trace=_trace,
                )
            _trace.continuity("loop")
            if prev_context:
                _trace.section("loop_prev_context", tokens=len(prev_context) // 4)
        else:
            system_prompt = bot._build_system_prompt(channel=channel, user_id=user_id)
        tools = bot._merged_tool_definitions() if bot.config.tools.enabled else None

        async def _finish(
            outcome_text: str,
            *,
            is_error: bool = False,
            failure_class: str = "",
            error_text: str = "",
        ) -> str:
            """Persist the loop turn and run gated reflection at every exit."""
            if _trajectory is not None:
                await bot._save_turn_trajectory(
                    _trajectory,
                    error=error_text if is_error else "",
                    final_response=outcome_text if not is_error else "",
                    tools_used=[d["tool"] for d in _loop_details],
                    trace=_trace,
                )
            bot._maybe_loop_reflect(
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
        tool_timeout = bot.config.tools.tool_timeout_seconds
        channel_id_str = str(getattr(channel, "id", ""))
        loop_cap = bot.config.tools.max_tool_iterations_loop
        tool_calls_made = 0

        for _iteration in range(loop_cap):
            try:
                response = await bot.llm_client.chat_with_tools(
                    messages=messages,
                    system=system_prompt,
                    tools=tools or [],
                )
            except CircuitOpenError:
                raise
            except Exception as e:
                log.warning("Loop iteration Codex call failed: %s", e)
                return await _finish(
                    f"LLM call failed: {e}",
                    is_error=True,
                    failure_class="provider",
                    error_text=str(e),
                )

            if _trajectory is not None:
                _trajectory.iterations.append(
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
                final_text = response.text

            if not response.tool_calls:
                completed_naturally = True
                break

            tool_calls_made += len(response.tool_calls)

            # Build assistant content with tool_use blocks (matches _process_with_tools format)
            messages.append({"role": "assistant", "content": build_assistant_content(response)})

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
                    _t = 3660 if tool_name in _LONG_TIMEOUT_TOOL_SET else tool_timeout
                    raw = await asyncio.wait_for(
                        bot._dispatch_loop_tool(
                            tool_name,
                            tool_input,
                            msg_proxy,
                            user_id,
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
                        system_prompt = bot._build_system_prompt(
                            channel=channel,
                            user_id=user_id,
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

                # Make structured failure visible (see _ensure_failure_visible)
                # and propagate it into the audit error field.
                if isinstance(raw, ToolResult):
                    if not raw.ok and not error:
                        error = raw.error or "tool reported failure"
                    raw = bot._ensure_failure_visible(str(raw), raw.ok)

                result = truncate_tool_output(scrub_output_secrets(str(raw)))

                # Audit log
                try:
                    await bot.audit.log_execution(
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
                except OSError as audit_err:
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

            _results_by_id = {r.get("tool_use_id"): r for r in tool_results if isinstance(r, dict)}
            for _tc in response.tool_calls:
                if _trace is not None and _tc.id not in _results_by_id:
                    _trace.warning(
                        "TOOL_RESULT_CONTINUATION_MISMATCH",
                        "error",
                        f"loop tool {_tc.name} call has no paired result",
                    )
                _rcontent = str(_results_by_id.get(_tc.id, {}).get("content", ""))
                _loop_details.append(
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
            if _trajectory is not None and _trajectory.iterations:
                _trajectory.iterations[-1].tool_results = stored_tool_results(
                    tool_results,
                    _result_store_cap,
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
                final_text = final_text[: DISCORD_MAX_LEN - 50] + "\n... (truncated)"
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
                "Loop tool-iteration cap hit (%d) after %d tool calls; "
                "no tool-free summary from Codex",
                loop_cap,
                tool_calls_made,
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
                is_error=True,
                failure_class="cancelled",
                error_text=f"loop iteration cap {loop_cap} reached",
            )

        return await _finish("(no response)")

    async def dispatch_loop_tool(
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
        bot = self.host
        t0 = time.monotonic()
        result = await self.dispatch_loop_tool_inner(tool_name, tool_input, msg_proxy, user_id)
        elapsed_ms = int((time.monotonic() - t0) * 1000)
        try:
            await bot.audit.log_event(
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
    ) -> str | dict:
        bot = self.host
        # Central RBAC gate: same enforcement as the message tool loop — these
        # handlers bypass ToolExecutor.execute(), so check permission for EVERY tool.
        _rbac_denial = bot.tool_executor.check_permission(tool_name, user_id)
        if isinstance(_rbac_denial, str) and _rbac_denial:  # str = deny, None = allow
            log.warning("RBAC gate denied loop tool %s for user %s", tool_name, user_id)
            return _rbac_denial
        # One dispatch table for both pipelines (RFC-001 P5a).
        if bot._native_tools.handles(tool_name):
            result, _effects = await bot._native_tools.dispatch(
                tool_name,
                tool_input,
                message=msg_proxy,
                user_id=user_id,
                skill_file_delivery="stage",
            )
            return result
        # --- Executor-routed tools (run_command, run_script, SSH, etc.) ---
        return await bot.tool_executor.execute(tool_name, tool_input, user_id=user_id)
