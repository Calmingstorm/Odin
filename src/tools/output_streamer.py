"""Tool output streaming — ship partial results as tools produce them.

Opt-in per tool via config (``tools.streaming.tools`` list). OFF by default.
Emits ``StreamChunk`` objects to registered async listeners (WebSocket, etc.).
Rate-limited to avoid spamming: at most one chunk per ``chunk_interval``
seconds per active stream.  A final chunk (``finished=True``) is always sent.
"""
from __future__ import annotations

import asyncio
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from datetime import datetime, timezone

from ..odin_log import get_logger

log = get_logger("output_streamer")

# Type alias for async listener callbacks.
StreamListener = Callable[["StreamChunk"], Awaitable[None]]


@dataclass(slots=True)
class StreamChunk:
    """One piece of streaming tool output."""

    tool_name: str
    chunk: str
    sequence: int
    timestamp: str
    channel_id: str
    finished: bool = False

    def to_dict(self) -> dict:
        return {
            "tool_name": self.tool_name,
            "chunk": self.chunk,
            "sequence": self.sequence,
            "timestamp": self.timestamp,
            "channel_id": self.channel_id,
            "finished": self.finished,
        }


@dataclass
class _ActiveStream:
    """Tracks state for one in-flight tool invocation."""

    tool_name: str
    channel_id: str
    started_at: float
    sequence: int = 0
    last_emit: float = 0.0
    buffered: str = ""
    total_chars: int = 0


class ToolOutputStreamer:
    """Manages opt-in streaming of tool output to listeners."""

    def __init__(
        self,
        *,
        enabled_tools: set[str] | None = None,
        chunk_interval: float = 1.0,
        max_chunk_chars: int = 2000,
    ) -> None:
        self._enabled_tools: set[str] = enabled_tools or set()
        self._chunk_interval = max(0.1, chunk_interval)
        self._max_chunk_chars = max_chunk_chars
        self._listeners: list[StreamListener] = []
        self._active_streams: dict[str, _ActiveStream] = {}

    @property
    def enabled_tools(self) -> set[str]:
        return set(self._enabled_tools)

    @property
    def chunk_interval(self) -> float:
        return self._chunk_interval

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
        self, tool_name: str, channel_id: str = "",
    ) -> tuple[str, Callable[[str], Awaitable[None]], Callable[[], Awaitable[None]]]:
        """Create a streaming callback for one tool invocation.

        Returns ``(stream_id, on_output, finish)`` where:
        - *stream_id* identifies this stream
        - *on_output(text)* should be called with each line/chunk of output
        - *finish()* must be called when the tool completes (flushes buffer)
        """
        stream_id = f"{tool_name}-{id(object())}-{time.monotonic_ns()}"
        now = time.monotonic()
        stream = _ActiveStream(
            tool_name=tool_name,
            channel_id=channel_id,
            started_at=now,
            last_emit=now,
        )
        self._active_streams[stream_id] = stream

        async def on_output(text: str) -> None:
            stream.total_chars += len(text)
            stream.buffered += text
            now = time.monotonic()
            if now - stream.last_emit >= self._chunk_interval and stream.buffered:
                chunk_text = stream.buffered[: self._max_chunk_chars]
                stream.buffered = stream.buffered[self._max_chunk_chars :]
                ts = datetime.now(timezone.utc).isoformat()
                chunk = StreamChunk(
                    tool_name=tool_name,
                    chunk=chunk_text,
                    sequence=stream.sequence,
                    timestamp=ts,
                    channel_id=channel_id,
                )
                stream.sequence += 1
                stream.last_emit = now
                await self._emit(chunk)

        async def finish() -> None:
            ts = datetime.now(timezone.utc).isoformat()
            if stream.buffered:
                chunk = StreamChunk(
                    tool_name=tool_name,
                    chunk=stream.buffered[: self._max_chunk_chars],
                    sequence=stream.sequence,
                    timestamp=ts,
                    channel_id=channel_id,
                )
                stream.sequence += 1
                await self._emit(chunk)
            final = StreamChunk(
                tool_name=tool_name,
                chunk="",
                sequence=stream.sequence,
                timestamp=ts,
                channel_id=channel_id,
                finished=True,
            )
            await self._emit(final)
            self._active_streams.pop(stream_id, None)

        return stream_id, on_output, finish
