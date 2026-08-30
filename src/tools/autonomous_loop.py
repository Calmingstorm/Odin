"""Autonomous loop system — LLM-intelligent recurring tasks.

Each loop iteration triggers a full LLM reasoning cycle with tool access.
The LLM decides what to check, how to interpret results, and what to report.
"""

from __future__ import annotations

import asyncio
import time
import uuid
from collections import deque
from collections.abc import Awaitable, Callable
from contextvars import ContextVar
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from ..error_presentation import format_user_facing_error
from ..llm.secret_scrubber import scrub_output_secrets
from ..odin_log import get_logger

log = get_logger("autonomous_loop")

# Type for the LLM iteration callback:
# Takes (goal_prompt, channel, iteration_context, cancel_event) -> response text
# The callback should run the full Codex + tool loop internally.
LoopIterationCallback = Callable[
    [str, Any, str | None, asyncio.Event],
    Awaitable[str],
]

MAX_CONCURRENT_LOOPS = 10
MAX_LOOP_LIFETIME_SECONDS = 4 * 3600  # 4 hours
MIN_INTERVAL_SECONDS = 10
DEFAULT_INTERVAL_SECONDS = 60
DEFAULT_MAX_ITERATIONS = 50
MAX_CONTEXT_HISTORY = 3  # Keep last N iteration summaries for context
MAX_CONSECUTIVE_ERRORS = 5  # Stop loop after this many consecutive failures
MAX_BACKOFF_SECONDS = 300  # Cap exponential backoff at 5 minutes
RUNAWAY_THRESHOLD = 3  # Identical outputs before interval increase

LOOP_STOP_SENTINEL = "LOOP_STOP"

# Logical loop ownership follows child tasks created by the iteration pipeline.
# asyncio.current_task() cannot identify self-stop from a gathered tool child: the
# child is not LoopInfo._task, but cancelling/awaiting the parent from that child
# creates a parent/child cancellation cycle. Context propagation is the authority.
_current_loop: ContextVar[tuple[int, str] | None] = ContextVar(
    "odin_current_autonomous_loop", default=None
)


@dataclass
class LoopInfo:
    """Metadata for an active autonomous loop."""

    id: str
    goal: str
    mode: str  # "notify", "act", "silent"
    interval_seconds: int
    stop_condition: str | None
    max_iterations: int
    channel_id: str
    requester_id: str
    requester_name: str
    iteration_count: int = 0
    last_trigger: float | None = None
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())
    status: str = "running"  # running, stopped, completed, error
    _task: asyncio.Task | None = field(default=None, repr=False)
    _cancel_event: asyncio.Event = field(default_factory=asyncio.Event)
    _stop_requested: bool = field(default=False, repr=False)
    _iteration_history: deque[str] = field(
        default_factory=lambda: deque(maxlen=MAX_CONTEXT_HISTORY * 2),
    )


class LoopManager:
    """Manages autonomous loops — LLM-driven recurring tasks."""

    def __init__(self, agents_enabled: bool = False) -> None:
        self._loops: dict[str, LoopInfo] = {}
        self._agents_enabled = agents_enabled
        # Installed by the composition root after WindowObserver construction.
        # The loop owner invokes it exactly when the loop task settles, not an
        # hour later when the historical LoopInfo row is pruned.
        self._calibration_releaser: Callable[[str], None] | None = None

    def set_calibration_releaser(self, releaser: Callable[[str], None] | None) -> None:
        self._calibration_releaser = releaser

    def _release_calibration(self, loop_id: str) -> None:
        try:
            if self._calibration_releaser is not None:
                self._calibration_releaser(loop_id)
        except Exception:
            log.exception("loop calibration release failed (non-fatal)")

    @property
    def active_count(self) -> int:
        return sum(1 for loop in self._loops.values() if loop.status == "running")

    def start_loop(
        self,
        goal: str,
        channel: Any,  # discord.abc.Messageable
        requester_id: str,
        requester_name: str,
        iteration_callback: LoopIterationCallback,
        interval_seconds: int = DEFAULT_INTERVAL_SECONDS,
        mode: str = "notify",
        stop_condition: str | None = None,
        max_iterations: int = DEFAULT_MAX_ITERATIONS,
    ) -> str:
        """Start a new autonomous loop. Returns the loop ID or an error string."""
        if self.active_count >= MAX_CONCURRENT_LOOPS:
            return (
                f"Error: Maximum concurrent loops ({MAX_CONCURRENT_LOOPS}) reached. "
                "Stop a loop first."
            )

        if mode not in ("notify", "act", "silent"):
            mode = "notify"
        interval_seconds = max(MIN_INTERVAL_SECONDS, interval_seconds)
        max_iterations = max(1, min(max_iterations, 1000))

        # Opportunistic cleanup — records only accumulate via start_loop, so
        # sweeping here keeps the map bounded without a dedicated timer task.
        self.cleanup_finished()

        loop_id = uuid.uuid4().hex[:8]
        info = LoopInfo(
            id=loop_id,
            goal=goal,
            mode=mode,
            interval_seconds=interval_seconds,
            stop_condition=stop_condition,
            max_iterations=max_iterations,
            channel_id=str(getattr(channel, "id", "")),
            requester_id=requester_id,
            requester_name=requester_name,
        )
        self._loops[loop_id] = info

        info._task = asyncio.create_task(self._run_loop(info, channel, iteration_callback))

        log.info(
            "Loop %s started: goal=%r interval=%ds mode=%s max=%d",
            loop_id,
            goal,
            interval_seconds,
            mode,
            max_iterations,
        )
        return loop_id

    async def stop_loop(self, loop_id: str) -> str:
        """Cancel loop work and report stopped only after it has settled.

        The cooperative event reaches the tool loop and recovery layer; task
        cancellation is the final authority that interrupts an admitted LLM
        stream or an in-flight tool await. Awaiting the task closes the crucial
        contract: once this method says ``stopped``, no retry or tool side
        effect from that loop can begin afterward.
        """
        logical_current = _current_loop.get()
        current_loop_id = (
            logical_current[1]
            if logical_current is not None and logical_current[0] == id(self)
            else None
        )
        if loop_id == "all":
            running = [info for info in self._loops.values() if info.status == "running"]
            if not running:
                return "No active loops to stop."
            for running_info in running:
                if running_info.id == current_loop_id:
                    # The real tool path runs in an asyncio.gather() child. It
                    # must stop its logical parent cooperatively, never cancel
                    # and await that parent from below it.
                    running_info._stop_requested = True
                    running_info._cancel_event.set()
                else:
                    self._request_stop(running_info)
            await asyncio.gather(
                *(
                    running_info._task
                    for running_info in running
                    if running_info.id != current_loop_id
                    and running_info._task is not None
                ),
                return_exceptions=True,
            )
            ids = ", ".join(running_info.id for running_info in running)
            if current_loop_id is not None:
                return f"Stop requested for {len(running)} loop(s): {ids}"
            return f"Stopped {len(running)} loop(s): {ids}"

        info = self._loops.get(loop_id)
        if not info:
            return f"No loop found with ID `{loop_id}`."
        if info.status != "running":
            return f"Loop `{loop_id}` is not running (status: {info.status})."
        if info.id == current_loop_id:
            info._stop_requested = True
            info._cancel_event.set()
            # ContextVar ownership reaches gathered tool children. The tool is
            # allowed to return, then run_autonomous observes the event and the
            # manager task settles without any parent/child cancellation cycle.
            return f"Loop `{loop_id}` stop requested."
        self._request_stop(info)
        if info._task is not None:
            await asyncio.gather(info._task, return_exceptions=True)
        if info.status == "running":
            info.status = "stopped"
        return f"Loop `{loop_id}` stopped."

    @staticmethod
    def _request_stop(info: LoopInfo) -> None:
        info._stop_requested = True
        info._cancel_event.set()
        task = info._task
        if task is not None and task is not asyncio.current_task() and not task.done():
            task.cancel()

    def list_loops(self) -> str:
        """Return a formatted list of all loops."""
        if not self._loops:
            return "No autonomous loops."

        lines = []
        for lid, info in self._loops.items():
            elapsed = ""
            if info.last_trigger:
                ago = int(time.monotonic() - info.last_trigger)
                elapsed = f", last ran {ago}s ago"
            lines.append(
                f"- `{lid}` [{info.status}] **{info.goal[:80]}** "
                f"(every {info.interval_seconds}s, mode={info.mode}, "
                f"iter {info.iteration_count}/{info.max_iterations}{elapsed})"
            )
        return "\n".join(lines)

    def cleanup_finished(self) -> None:
        """Remove loops that have been finished for a while."""
        now = time.monotonic()
        to_remove = []
        for lid, info in self._loops.items():
            if info.status != "running":
                # A loop stopped before its first iteration has no
                # last_trigger — treat it as immediately stale. (An `or 0`
                # sentinel on the monotonic clock only looked stale on
                # machines up longer than an hour; on a freshly booted host
                # such loops lingered.)
                if info.last_trigger is None or now - info.last_trigger > 3600:
                    to_remove.append(lid)  # 1 hour after finish
        for lid in to_remove:
            del self._loops[lid]

    async def shutdown(self, timeout: float = 10.0) -> None:
        """Stop all loops and await their tasks.

        Setting the cancel event alone leaves a loop mid-iteration until its
        next wait; on process shutdown that means "Task was destroyed but it
        is pending" and a skipped trajectory save. Cancel and await instead.
        """
        tasks = []
        for info in self._loops.values():
            if info.status == "running":
                info._cancel_event.set()
                info.status = "stopped"
            if info._task and not info._task.done():
                info._task.cancel()
                tasks.append(info._task)
        if tasks:
            try:
                await asyncio.wait_for(
                    asyncio.gather(*tasks, return_exceptions=True),
                    timeout,
                )
            except TimeoutError:
                log.warning(
                    "LoopManager shutdown: %d task(s) did not finish within %.0fs",
                    len(tasks),
                    timeout,
                )

    async def _run_loop(
        self,
        info: LoopInfo,
        channel: Any,
        iteration_callback: LoopIterationCallback,
    ) -> None:
        """Main loop coroutine — runs iterations until stopped."""
        start_time = time.monotonic()
        consecutive_identical = 0
        consecutive_errors = 0
        last_output = ""

        try:
            while info.iteration_count < info.max_iterations:
                # Check cancellation
                if info._cancel_event.is_set():
                    break

                # Check lifetime limit
                if time.monotonic() - start_time > MAX_LOOP_LIFETIME_SECONDS:
                    info.status = "completed"
                    try:
                        await channel.send(
                            f"Loop `{info.id}` reached maximum lifetime (4 hours). Stopped."
                        )
                    except Exception:
                        pass
                    break

                info.iteration_count += 1
                info.last_trigger = time.monotonic()

                # Build iteration prompt
                prompt = self._build_iteration_prompt(info)

                # Build previous context from iteration history
                prev_context = None
                if info._iteration_history:
                    prev_context = "\n---\n".join(
                        list(info._iteration_history)[-MAX_CONTEXT_HISTORY:]
                    )

                # Run the LLM iteration. The correlation context lets the
                # iteration runner, audit logger, and trajectory saver stamp
                # which loop+iteration the work belongs to without threading
                # parameters through the callback signature. iteration_count
                # was already incremented above, so it IS the 1-based number
                # of the iteration about to run.
                try:
                    from ..observability.correlation import reset_turn, set_turn

                    _turn_token = set_turn(
                        source="loop",
                        loop_id=info.id,
                        loop_iteration=info.iteration_count,
                        turn_id=f"loop:{info.id}:{info.iteration_count}",
                        channel_id=info.channel_id,
                    )
                    _loop_token = _current_loop.set((id(self), info.id))
                    try:
                        response = await iteration_callback(
                            prompt, channel, prev_context, info._cancel_event
                        )
                    finally:
                        _current_loop.reset(_loop_token)
                        reset_turn(_turn_token)
                    response = scrub_output_secrets(response.strip()) if response else ""
                    if info._cancel_event.is_set():
                        break
                    consecutive_errors = 0  # Reset on success
                except Exception as e:
                    consecutive_errors += 1
                    if hasattr(e, "retry_after"):
                        circuit_wait = min(e.retry_after, MAX_BACKOFF_SECONDS)
                        info.interval_seconds = max(info.interval_seconds, int(circuit_wait))
                        log.info(
                            "Loop %s: circuit breaker open, wait %.0fs",
                            info.id,
                            circuit_wait,
                        )
                    log.warning(
                        "Loop %s iteration %d failed (%d consecutive): %s",
                        info.id,
                        info.iteration_count,
                        consecutive_errors,
                        e,
                    )
                    # Store error in history but don't crash the loop. The
                    # history deque is next-iteration model context AND the
                    # WebUI loop detail, and the channel post is user-facing
                    # — both get the bounded formatter summary, never raw
                    # exception text (which can carry upstream HTML pages).
                    err_msg = format_user_facing_error(e)
                    info._iteration_history.append(
                        f"Iteration {info.iteration_count}: ERROR - {err_msg}"
                    )
                    # Stop loop after too many consecutive errors
                    if consecutive_errors >= MAX_CONSECUTIVE_ERRORS:
                        info.status = "error"
                        try:
                            await channel.send(
                                f"Loop `{info.id}` stopped after {MAX_CONSECUTIVE_ERRORS} "
                                f"consecutive errors. Last error: {err_msg}"
                            )
                        except Exception:
                            pass
                        break
                    # Back off before retrying — a bare `continue` here used to
                    # skip the interval wait entirely, so a fast-failing
                    # callback hammered the failing endpoint at full speed.
                    backoff = min(
                        info.interval_seconds * (2**consecutive_errors),
                        MAX_BACKOFF_SECONDS,
                    )
                    log.info(
                        "Loop %s: backing off %ds after %d consecutive error(s)",
                        info.id,
                        backoff,
                        consecutive_errors,
                    )
                    if await self._interruptible_wait(info, backoff):
                        break
                    continue

                # Store iteration result (truncated) in history
                summary = response[:500] if response else "(no output)"
                info._iteration_history.append(f"Iteration {info.iteration_count}: {summary}")

                # Check for LOOP_STOP sentinel
                if LOOP_STOP_SENTINEL in response:
                    info.status = "completed"
                    log.info("Loop %s stopped by LLM (LOOP_STOP)", info.id)
                    break

                # Runaway detection: identical consecutive outputs
                if response == last_output and response:
                    consecutive_identical += 1
                    if consecutive_identical >= RUNAWAY_THRESHOLD:
                        old_interval = info.interval_seconds
                        info.interval_seconds = min(
                            info.interval_seconds * 2,
                            3600,
                        )
                        log.warning(
                            "Loop %s: %d identical outputs, interval %ds -> %ds",
                            info.id,
                            RUNAWAY_THRESHOLD,
                            old_interval,
                            info.interval_seconds,
                        )
                        try:
                            await channel.send(
                                f"Loop `{info.id}`: {RUNAWAY_THRESHOLD} identical "
                                f"outputs detected — increasing interval from "
                                f"{old_interval}s to {info.interval_seconds}s."
                            )
                        except Exception:
                            pass
                        consecutive_identical = 0
                else:
                    consecutive_identical = 0
                last_output = response

                # Post response to channel based on mode
                if response and info.status == "running":
                    await self._post_response(info, channel, response)

                # Wait for interval before next iteration (interruptible by cancel).
                # Placed AFTER iteration so the first run executes immediately.
                # (Error iterations back off and `continue` above, so
                # consecutive_errors is always 0 here.)
                if await self._interruptible_wait(info, info.interval_seconds):
                    break  # Cancel was set during the wait

            # Distinguish cooperative cancellation from natural exhaustion.
            # A self-stop tool sets the event from a gathered child and cannot
            # mark its logical parent settled; only this owner task publishes
            # the terminal status after the callback/tool pipeline has unwound.
            if info.status == "running":
                if info._stop_requested:
                    info.status = "stopped"
                else:
                    info.status = "completed"
                    try:
                        await channel.send(
                            f"Loop `{info.id}` completed after {info.iteration_count} iterations."
                        )
                    except Exception:
                        pass

        except asyncio.CancelledError:
            info.status = "stopped"
        except Exception as e:
            info.status = "error"
            log.error("Loop %s crashed: %s", info.id, e, exc_info=True)
            try:
                await channel.send(
                    f"Loop `{info.id}` encountered an error and stopped: "
                    f"{format_user_facing_error(e)}"
                )
            except Exception:
                pass
        finally:
            self._release_calibration(info.id)

    def _build_iteration_prompt(self, info: LoopInfo) -> str:
        """Build the prompt for a single loop iteration."""
        parts = [
            f"AUTONOMOUS LOOP (iteration {info.iteration_count} of {info.max_iterations})",
            f"Goal: {info.goal}",
            f"Mode: {info.mode}",
        ]
        if info.stop_condition:
            parts.append(f"Stop condition: {info.stop_condition}")

        parts.append("")
        parts.append(
            "You are in an autonomous loop. Execute the goal above using tools. When done:"
        )
        if info.mode in ("notify", "act"):
            parts.append("- Post a concise update to the channel.")
        elif info.mode == "silent":
            parts.append(
                "- Only respond if something notable or urgent happened. "
                "If you need to report something, include [NOTIFY] at the start "
                "of your response. For critical issues, use [ALERT] instead. "
                "Responses without these markers will be suppressed."
            )

        if info.stop_condition:
            parts.append(
                f'- If the stop condition is met ("{info.stop_condition}"), '
                f'include the exact text "LOOP_STOP" in your response.'
            )

        # Agent awareness: tell the LLM it can spawn agents for parallel sub-tasks
        if self._agents_enabled:
            parts.append("")
            parts.append(
                "AGENTS: You can spawn agents (spawn_agent) for parallel sub-tasks. "
                "Use wait_for_agents to collect results. Good for: investigating "
                "multiple hosts, running parallel checks, delegating fixes."
            )

        return "\n".join(parts)

    @staticmethod
    async def _interruptible_wait(info: LoopInfo, seconds: float) -> bool:
        """Wait up to *seconds*; return True if the loop was cancelled."""
        try:
            await asyncio.wait_for(info._cancel_event.wait(), timeout=seconds)
            return True
        except TimeoutError:
            return False

    async def _post_response(
        self,
        info: LoopInfo,
        channel: Any,
        response: str,
    ) -> None:
        """Post the loop iteration response to the channel, respecting mode.

        - notify/act: always post the response.
        - silent: only post if the response contains [NOTIFY] or [ALERT].
        """
        if info.mode == "silent":
            if "[NOTIFY]" not in response and "[ALERT]" not in response:
                log.debug(
                    "Loop %s: silent mode suppressed output (%d chars)",
                    info.id,
                    len(response),
                )
                return

        # Post to channel (truncate for Discord limit)
        try:
            text = response
            if len(text) > 2000:
                text = text[:1950] + "\n... (truncated)"
            await channel.send(text)
        except Exception as e:
            log.warning("Loop %s: failed to post response: %s", info.id, e)
