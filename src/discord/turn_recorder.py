"""Turn observability + reflection dispatch (RFC-001 Phase 10).

Verbatim host-based moves from OdinBot: trajectory user-content recording,
context-trace creation, turn-trajectory persistence, lifecycle webhook
emission, and the reflection triggers (chat post-operation + gated loop
reflection).
"""

from __future__ import annotations

from datetime import UTC

from ..async_utils import fire_and_forget
from ..llm.secret_scrubber import scrub_output_secrets
from ..odin_log import get_logger

log = get_logger("discord")


class TurnRecorder:
    def __init__(self, host) -> None:
        self.host = host

    def _record_user_content(self, trajectory, content: str) -> None:
        """Store the request on the trajectory turn — capped, secret-scrubbed,
        with explicit truncation metadata. Config-gated; never raises."""
        bot = self.host
        try:
            obs = getattr(bot.config, "observability", None)
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
        bot = self.host
        try:
            obs = getattr(bot.config, "observability", None)
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

    # Successful operations below this tool count are routine — reflection
    # is reserved for failures, corrections, explicit asks, and substantive work.
    _REFLECT_MIN_TOOLS = 5
    _REFLECT_CORRECTION_MARKERS = (
        "remember this",
        "remember that",
        "that's wrong",
        "thats wrong",
        "that is wrong",
        "not what i asked",
        "you should have",
        "incorrect,",
        "no, ",
        "actually,",
    )

    def _should_reflect_on_operation(
        self,
        user_request: str,
        tools_used: list[str],
        is_error: bool,
        tool_details: list[dict],
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
        self,
        *,
        loop_id: str,
        prompt: str,
        outcome: str,
        is_error: bool,
        failure_class: str,
        error_text: str,
        tool_details: list[dict],
        user_id: str | None,
    ) -> None:
        """Gated reflection for loop iterations (fire-and-forget)."""
        bot = self.host
        try:
            if not getattr(bot.config.learning, "loop_reflection_enabled", True):
                return
            # The P10 move kept `hasattr(self, ...)` from the bot-method era;
            # on the recorder that was always False, silently suppressing all
            # loop reflection. The reflector lives on the bot.
            if getattr(bot, "reflector", None) is None or not tool_details:
                return
            if is_error or any(d.get("error") for d in tool_details):
                effective_error = error_text or next(
                    (d["result"] for d in tool_details if d.get("error")),
                    "",
                )
                if not failure_class:
                    from ..observability.failure_classes import classify_failure

                    failure_class = classify_failure(effective_error)["class"]
                should, reason = bot._loop_reflection_gate.evaluate(
                    loop_id,
                    is_error=True,
                    failure_class=failure_class,
                    error_text=effective_error,
                )
            else:
                should, reason = bot._loop_reflection_gate.evaluate(
                    loop_id,
                    is_error=False,
                )
            if not should:
                log.debug("Loop reflection suppressed (%s) for %s", reason, loop_id)
                return
            log.info("Loop reflection triggered (%s) for %s", reason, loop_id)
            fire_and_forget(
                bot.reflector.reflect_on_operation(
                    user_request=f"[autonomous loop {loop_id}] {prompt[:300]}",
                    tools_used=[d["tool"] for d in tool_details][:20],
                    tool_details=tool_details,
                    final_response=outcome,
                    is_error=is_error,
                    user_id=user_id,
                ),
                name="loop_reflection",
            )
        except Exception:  # noqa: BLE001 — reflection must never break a loop
            log.debug("Loop reflection wiring failed (non-fatal)", exc_info=True)

    async def _operational_reflection(
        self,
        user_request: str,
        tools_used: list[str],
        response: str,
        is_error: bool,
        user_id: str | None,
        tool_details: list[dict] | None = None,
    ) -> None:
        """Fire-and-forget post-operation reflection — selective, with real
        tool inputs/results from the operation instead of bare tool names."""
        bot = self.host
        try:
            if not tool_details:
                tool_details = [{"tool": t} for t in tools_used[:20]]
            if not bot._should_reflect_on_operation(
                user_request,
                tools_used,
                is_error,
                tool_details,
            ):
                log.debug(
                    "Skipping reflection for routine operation (%d tools, no errors)",
                    len(tools_used),
                )
                return
            await bot.reflector.reflect_on_operation(
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
        self,
        trajectory,
        *,
        error: str = "",
        final_response: str = "",
        tools_used: list[str] | None = None,
        trace=None,
    ) -> None:
        """Persist the turn trajectory as JSONL. Non-fatal on error."""
        bot = self.host
        if bot.trajectory_saver is None:
            return
        try:
            if trace is not None:
                trajectory.context_trace = trace.finalize()
            from datetime import datetime

            trajectory.timestamp = datetime.now(UTC).isoformat()
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
            await bot.trajectory_saver.save(trajectory)
        except Exception:
            log.exception("TrajectorySaver.save failed (non-fatal)")

    async def _emit_lifecycle_event(self, event_type: str, payload: dict) -> None:
        """Emit a lifecycle event to registered outbound webhooks (no-op if disabled)."""
        bot = self.host
        if bot.outbound_webhook_dispatcher is None:
            return
        try:
            from ..notifications.outbound_webhooks import build_event_payload

            full_payload = build_event_payload(event_type=event_type, data=payload)
            await bot.outbound_webhook_dispatcher.dispatch_fire_and_forget(
                event_type=event_type,
                payload=full_payload,
            )
        except Exception:
            log.exception("Outbound webhook dispatch failed (non-fatal)")
