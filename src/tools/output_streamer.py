"""Tool output streaming — ship partial results as tools produce them.

Opt-in per tool via config (``tools.streaming.tools`` list). OFF by default.
Emits ``StreamChunk`` objects to registered async listeners (WebSocket, etc.).
Rate-limited to avoid spamming: at most one chunk per ``chunk_interval``
seconds per active stream. A final chunk (``finished=True``) is attempted on
settlement; a broken listener or cancellation can leave delivery unconfirmed.

Registration happens when the callback is CREATED, so a handler that is
interrupted between setup and completion (tool timeout, cancellation, a
crash inside the handler) has no abandonment path of its own. Three
settlement routes exist, and ordinarily produce the same terminal chunk:

1. ``finish()`` — the handler's own completion path;
2. ``abandon_streams()`` — the executor's ``finally`` for exactly the streams
   the invocation created (tracked in a task-local context variable);
3. ``sweep_stale_streams()`` — the TTL backstop for a stream whose owner
   vanished entirely (process death, cancellation during settlement).
"""

from __future__ import annotations

import contextvars
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, datetime

from ..odin_log import get_logger

log = get_logger("output_streamer")

# TTL for the abandonment sweep. Sized to the process-lifetime ceiling
# (``process_manager.MAX_LIFETIME_SECONDS`` = 1 hour): no legitimate streamed
# tool call outlives its job, so anything older than this has lost its owner.
DEFAULT_STREAM_TTL_SECONDS = 3600.0

# Type alias for async listener callbacks.
StreamListener = Callable[["StreamChunk"], Awaitable[None]]

# The tool_use id of the invocation currently executing, so streamed output can
# be attributed to ONE call. Tool name is not identity: two concurrent
# run_command calls stream under the same name, and a consumer keying by name
# merges their output onto both cards and lets either completion clear both.
current_call_id: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "current_call_id", default=None
)

# Stream ids created by the invocation running in this context. The executor
# seeds this list before dispatch and reclaims exactly those ids afterwards, so
# a handler interrupted between callback creation and ``finish()`` cannot leave
# a stream behind. Ownership is by creation context, not by name or by the
# bound tool-use id: unbound callers (agents, schedules, direct dispatch) have
# no id to match, and two same-name calls must never settle each other's
# streams. Settlement removes the id again, so this list only ever holds
# streams that are still active.
call_stream_ids: contextvars.ContextVar[list[str] | None] = contextvars.ContextVar(
    "call_stream_ids", default=None
)


@dataclass(slots=True)
class StreamChunk:
    """One piece of streaming tool output."""

    tool_name: str
    chunk: str
    sequence: int
    timestamp: str
    channel_id: str
    finished: bool = False
    call_id: str | None = None

    def to_dict(self) -> dict:
        return {
            "tool_name": self.tool_name,
            "chunk": self.chunk,
            "sequence": self.sequence,
            "timestamp": self.timestamp,
            "channel_id": self.channel_id,
            "finished": self.finished,
            "call_id": self.call_id,
        }


@dataclass
class _ActiveStream:
    """Tracks state for one in-flight tool invocation."""

    tool_name: str
    channel_id: str
    started_at: float
    # Wire identity of the invocation (bound model tool-use id when there is
    # one). Stored rather than closed over so settlement paths that do not
    # own the closure — abandonment — can still emit the terminal chunk.
    call_id: str = ""
    sequence: int = 0
    last_emit: float = 0.0
    buffered: str = ""
    total_chars: int = 0
    # Settlement claim. Set SYNCHRONOUSLY by whichever route gets there first
    # -- the handler's finish(), the executor's abandonment, or the TTL sweep
    # -- so the others become no-ops instead of racing an await and emitting a
    # second terminal chunk or a chunk from a stream that is already gone.
    settled: bool = False


class ToolOutputStreamer:
    """Manages opt-in streaming of tool output to listeners."""

    def __init__(
        self,
        *,
        enabled_tools: set[str] | None = None,
        chunk_interval: float = 1.0,
        max_chunk_chars: int = 2000,
        stream_ttl_seconds: float = DEFAULT_STREAM_TTL_SECONDS,
    ) -> None:
        self._enabled_tools: set[str] = enabled_tools or set()
        self._chunk_interval = max(0.1, chunk_interval)
        self._max_chunk_chars = max_chunk_chars
        self._stream_ttl_seconds = max(0.0, float(stream_ttl_seconds))
        self._listeners: list[StreamListener] = []
        self._active_streams: dict[str, _ActiveStream] = {}

    @property
    def enabled_tools(self) -> set[str]:
        return set(self._enabled_tools)

    @property
    def chunk_interval(self) -> float:
        return self._chunk_interval

    @property
    def stream_ttl_seconds(self) -> float:
        return self._stream_ttl_seconds

    @property
    def active_stream_count(self) -> int:
        return len(self._active_streams)

    def is_enabled(self, tool_name: str) -> bool:
        return bool(self._enabled_tools) and tool_name in self._enabled_tools

    def add_listener(self, listener: StreamListener) -> None:
        if listener not in self._listeners:
            self._listeners.append(listener)

    def remove_listener(self, listener: StreamListener) -> None:
        try:
            self._listeners.remove(listener)
        except ValueError:
            pass

    def get_active_streams(self) -> list[dict]:
        now = time.monotonic()
        return [
            {
                "stream_id": sid,
                "tool_name": s.tool_name,
                "channel_id": s.channel_id,
                "total_chars": s.total_chars,
                "chunks_sent": s.sequence,
                "elapsed_seconds": round(now - s.started_at, 1),
            }
            for sid, s in self._active_streams.items()
        ]

    async def _emit(self, chunk: StreamChunk) -> None:
        for listener in list(self._listeners):
            try:
                await listener(chunk)
            except Exception:
                log.debug("Stream listener error", exc_info=True)

    def create_callback(
        self,
        tool_name: str,
        channel_id: str = "",
    ) -> tuple[str, Callable[[str], Awaitable[None]], Callable[[], Awaitable[None]]]:
        """Create a streaming callback for one tool invocation.

        Returns ``(stream_id, on_output, finish)`` where:
        - *stream_id* identifies this stream
        - *on_output(text)* should be called with each line/chunk of output
        - *finish()* must be called when the tool completes (flushes buffer)

        ``finish()`` is idempotent and is not the only settlement route — the
        executor abandons a call's streams when its handler is interrupted
        (tool timeout, cancellation) and the TTL sweep covers a lost owner.
        """
        bound_call_id = current_call_id.get()
        stream_id = bound_call_id or f"{tool_name}-{id(object())}-{time.monotonic_ns()}"
        # Non-chat callers (agents, schedules, direct dispatch) may not have a
        # model tool-use id. The generated stream id is still invocation
        # identity and must ride the wire; emitting None falls back to the tool
        # name in the WebUI and recreates same-name stream collisions.
        call_id = bound_call_id or stream_id
        now = time.monotonic()
        stream = _ActiveStream(
            tool_name=tool_name,
            channel_id=channel_id,
            started_at=now,
            call_id=call_id,
            last_emit=now,
        )
        self._active_streams[stream_id] = stream
        registry = call_stream_ids.get()
        if registry is not None:
            registry.append(stream_id)

        async def on_output(text: str) -> None:
            # A late callback from an interrupted handler must not emit into a
            # stream that is already settled: the terminal chunk has been sent,
            # the WebUI card is closed, and a further chunk would arrive as
            # output from a finished invocation. Output the handler produced
            # before settlement is still delivered — settlement flushes whatever
            # is buffered at the moment it claims the stream.
            if stream.settled:
                return
            stream.total_chars += len(text)
            stream.buffered += text
            now = time.monotonic()
            if now - stream.last_emit >= self._chunk_interval and stream.buffered:
                chunk_text = stream.buffered[: self._max_chunk_chars]
                stream.buffered = stream.buffered[self._max_chunk_chars :]
                ts = datetime.now(UTC).isoformat()
                chunk = StreamChunk(
                    tool_name=tool_name,
                    chunk=chunk_text,
                    sequence=stream.sequence,
                    timestamp=ts,
                    channel_id=channel_id,
                    call_id=call_id,
                )
                stream.sequence += 1
                stream.last_emit = now
                await self._emit(chunk)

        async def finish() -> None:
            await self._settle(stream_id, stream)

        return stream_id, on_output, finish

    async def _settle(self, stream_id: str, stream: _ActiveStream) -> None:
        """Flush the buffered tail and emit the terminal chunk exactly once.

        This is the ONLY place a stream leaves ``_active_streams``, so every
        settlement route (handler completion, executor abandonment, TTL sweep)
        produces the same wire behaviour when delivery succeeds: the remaining
        buffer, then one ``finished=True`` chunk with an empty body. A listener
        fault or cancellation leaves delivery unconfirmed but does not strand
        the registration. A second call for a stream
        already settled is a no-op, which keeps ``finish()`` idempotent and
        makes an abandonment that races a completing handler harmless.

        The terminal chunk is attempted BEFORE the registration is dropped:
        ``get_active_streams`` is polled by the WebUI, and a consumer that sees
        the stream disappear without a terminal chunk cannot distinguish
        success from abandonment.

        The claim is taken SYNCHRONOUSLY, before the first await: settlement
        emits, and every emit is a suspension point, so two routes reaching
        here concurrently (a completing handler racing the executor's
        abandonment, or a sweep) would otherwise both pass a registration
        check and each send a terminal chunk. The loser of the claim returns
        immediately — it does not wait for the winner to finish, because
        nothing it could do afterwards would be correct.
        """
        if stream.settled or self._active_streams.get(stream_id) is not stream:
            return
        stream.settled = True
        try:
            await self._emit_final_chunks(stream)
        finally:
            # A listener fault or cancellation cannot strand a claimed stream
            # forever: the claim excludes other settlement paths, so retire
            # the registration whether or not delivery was confirmed.
            self._active_streams.pop(stream_id, None)
            registry = call_stream_ids.get()
            if registry is not None:
                try:
                    registry.remove(stream_id)
                except ValueError:
                    pass

    async def _emit_final_chunks(self, stream: _ActiveStream) -> None:
        """Emit the buffered tail and terminal marker for one claimed stream."""
        ts = datetime.now(UTC).isoformat()
        while stream.buffered:
            chunk_text = stream.buffered[: self._max_chunk_chars]
            stream.buffered = stream.buffered[self._max_chunk_chars :]
            chunk = StreamChunk(
                tool_name=stream.tool_name,
                chunk=chunk_text,
                sequence=stream.sequence,
                timestamp=ts,
                channel_id=stream.channel_id,
                call_id=stream.call_id,
            )
            stream.sequence += 1
            await self._emit(chunk)
        final = StreamChunk(
            tool_name=stream.tool_name,
            chunk="",
            sequence=stream.sequence,
            timestamp=ts,
            channel_id=stream.channel_id,
            finished=True,
            call_id=stream.call_id,
        )
        await self._emit(final)

    async def abandon_streams(self, stream_ids) -> int:
        """Settle the named streams that are still active; return how many.

        Called from the executor's ``finally`` with the ids this invocation
        created, so a handler interrupted between callback creation and
        ``finish()`` (tool timeout, cancellation) cannot leave a permanent
        active-stream record or an unfinished WebUI activity card. Ids already
        settled by the handler's own ``finish()`` are simply gone, which makes
        this idempotent and safe to call on every path.

        The returned count is streams THIS call settled, not streams it was
        asked about: a handler that already finished its own stream is not an
        abandonment, and reporting it as one would make the executor log a
        warning about a phantom.
        """
        settled = 0
        for stream_id in list(stream_ids):
            stream = self._active_streams.get(stream_id)
            if stream is None or stream.settled:
                continue
            try:
                await self._settle(stream_id, stream)
            except Exception:
                log.debug("Stream abandonment failed", exc_info=True)
                continue
            settled += 1
        return settled

    def has_stale_streams(self, *, now: float | None = None) -> bool:
        """Cheap pre-check so the sweep is only awaited when it can do work."""
        if self._stream_ttl_seconds <= 0 or not self._active_streams:
            return False
        reference = time.monotonic() if now is None else now
        return any(
            reference - stream.started_at >= self._stream_ttl_seconds
            for stream in self._active_streams.values()
        )

    async def sweep_stale_streams(self, *, now: float | None = None) -> int:
        """TTL safety net for streams whose owner never settled them.

        The TTL is how stale a still-registered stream may be before it is
        treated as abandoned; nothing legitimate outlives the job ceiling, so
        the default IS that ceiling. The executor calls it from the per-tool
        ``finally`` BEFORE reclaiming that attempt's own streams, which is the
        only recurring hook this module has. That is a deliberate bound, not a
        timer: it runs at tool cadence, and a process that is idle executes no
        tools and therefore has no live streams to lose. A stream whose owner
        died outright is settled by the next tool call anywhere in the process
        — or, at the latest, by restart.

        Returns the number of streams settled.
        """
        if self._stream_ttl_seconds <= 0:
            return 0
        reference = time.monotonic() if now is None else now
        stale = [
            (stream_id, stream, reference - stream.started_at)
            for stream_id, stream in list(self._active_streams.items())
            if not stream.settled
            and reference - stream.started_at >= self._stream_ttl_seconds
        ]
        settled = 0
        for stream_id, stream, age in stale:
            log.warning(
                "Abandoning stale tool stream %s (%s) after %.0fs",
                stream_id, stream.tool_name, age,
            )
            try:
                await self._settle(stream_id, stream)
            except Exception:
                log.debug("Stale stream settlement failed", exc_info=True)
                continue
            settled += 1
        return settled
