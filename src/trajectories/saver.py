"""Trajectory saving — full message turn recording as JSONL.

Each message processed by the bot produces a trajectory: the system prompt,
conversation history, user message, every tool-call iteration (calls + results),
the final LLM response, timing, and estimated token counts.

Trajectories are saved as one JSON object per line in date-partitioned files
under ``data/trajectories/YYYY-MM-DD.jsonl``.
"""
from __future__ import annotations

import json
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path

import aiofiles

from ..llm.cost_tracker import estimate_tokens
from ..odin_log import get_logger

log = get_logger("trajectories")

DEFAULT_TRAJECTORY_DIR = "./data/trajectories"
MAX_TOOL_OUTPUT_CHARS = 12_000


@dataclass(slots=True)
class ToolIteration:
    """One round in the tool loop: LLM returns tool calls, executor returns results."""
    iteration: int
    tool_calls: list[dict] = field(default_factory=list)
    tool_results: list[dict] = field(default_factory=list)
    llm_text: str = ""
    input_tokens: int = 0
    output_tokens: int = 0
    duration_ms: int = 0


@dataclass
class TrajectoryTurn:
    """Complete record of a single message turn through the bot."""
    message_id: str = ""
    channel_id: str = ""
    user_id: str = ""
    user_name: str = ""
    timestamp: str = ""
    source: str = "discord"

    user_content: str = ""
    system_prompt: str = ""
    history: list[dict] = field(default_factory=list)

    iterations: list[ToolIteration] = field(default_factory=list)

    final_response: str = ""
    tools_used: list[str] = field(default_factory=list)
    is_error: bool = False
    handoff: bool = False

    total_input_tokens: int = 0
    total_output_tokens: int = 0
    total_duration_ms: int = 0

    def add_iteration(
        self,
        iteration: int,
        tool_calls: list[dict] | None = None,
        tool_results: list[dict] | None = None,
        llm_text: str = "",
        input_tokens: int = 0,
        output_tokens: int = 0,
        duration_ms: int = 0,
    ) -> ToolIteration:
        it = ToolIteration(
            iteration=iteration,
            tool_calls=tool_calls or [],
            tool_results=tool_results or [],
            llm_text=llm_text,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            duration_ms=duration_ms,
        )
        self.iterations.append(it)
        return it

    def finalize(self, response: str, is_error: bool = False, handoff: bool = False) -> None:
        self.final_response = response
        self.is_error = is_error
        self.handoff = handoff
        self.tools_used = _collect_tools_used(self.iterations)
        self.total_input_tokens = sum(it.input_tokens for it in self.iterations)
        self.total_output_tokens = sum(it.output_tokens for it in self.iterations)
        self.total_duration_ms = sum(it.duration_ms for it in self.iterations)
        if self.total_input_tokens == 0:
            self.total_input_tokens = estimate_tokens(
                self.system_prompt + self.user_content + self.final_response
            )

    def to_dict(self) -> dict:
        d = {
            "message_id": self.message_id,
            "channel_id": self.channel_id,
            "user_id": self.user_id,
            "user_name": self.user_name,
            "timestamp": self.timestamp,
            "source": self.source,
            "user_content": self.user_content,
            "system_prompt_length": len(self.system_prompt),
            "history_length": len(self.history),
            "iterations": [asdict(it) for it in self.iterations],
            "final_response": self.final_response,
            "tools_used": self.tools_used,
            "is_error": self.is_error,
            "handoff": self.handoff,
            "total_input_tokens": self.total_input_tokens,
            "total_output_tokens": self.total_output_tokens,
            "total_duration_ms": self.total_duration_ms,
            "iteration_count": len(self.iterations),
        }
        return d


def _collect_tools_used(iterations: list[ToolIteration]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for it in iterations:
        for tc in it.tool_calls:
            name = tc.get("name", "")
            if name and name not in seen:
                seen.add(name)
                result.append(name)
    return result


def _trajectory_filename(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%d") + ".jsonl"


class TrajectorySaver:
    """Writes trajectory turns as JSONL to date-partitioned files.

    Each day gets its own file: ``data/trajectories/2026-04-15.jsonl``.
    Writes are async via aiofiles to avoid blocking the event loop.
    """

    def __init__(self, directory: str = DEFAULT_TRAJECTORY_DIR) -> None:
        self.directory = Path(directory)
        self.directory.mkdir(parents=True, exist_ok=True)
        self._count = 0

    async def save(self, turn: TrajectoryTurn) -> Path:
        now = datetime.now(timezone.utc)
        if not turn.timestamp:
            turn.timestamp = now.isoformat()

        filename = _trajectory_filename(now)
        filepath = self.directory / filename
        data = turn.to_dict()
        line = json.dumps(data, default=str, ensure_ascii=False) + "\n"

        try:
            async with aiofiles.open(filepath, "a") as f:
                await f.write(line)
            self._count += 1
            log.debug("Trajectory saved: msg=%s channel=%s", turn.message_id, turn.channel_id)
        except Exception as e:
            log.error("Failed to save trajectory: %s", e)
            raise

        return filepath

    async def save_from_data(
        self,
        *,
        message_id: str,
        channel_id: str,
        user_id: str,
        user_name: str,
        user_content: str,
        system_prompt: str,
        history: list[dict],
        iterations: list[ToolIteration],
        final_response: str,
        tools_used: list[str],
        is_error: bool = False,
        handoff: bool = False,
        source: str = "discord",
    ) -> Path:
        turn = TrajectoryTurn(
            message_id=message_id,
            channel_id=channel_id,
            user_id=user_id,
            user_name=user_name,
            user_content=user_content,
            system_prompt=system_prompt,
            history=history,
            iterations=iterations,
            final_response=final_response,
            source=source,
        )
        turn.finalize(final_response, is_error=is_error, handoff=handoff)
        turn.tools_used = tools_used
        return await self.save(turn)

    @property
    def count(self) -> int:
        return self._count

    async def list_files(self) -> list[str]:
        if not self.directory.exists():
            return []
        return sorted(
            f.name for f in self.directory.iterdir()
            if f.suffix == ".jsonl" and f.is_file()
        )

    async def read_file(self, filename: str, limit: int = 100) -> list[dict]:
        # Reject absolute paths and path-traversal components
        if filename != Path(filename).name or ".." in filename:
            log.warning("Rejected path-traversal attempt in trajectory read: %s", filename)
            return []
        filepath = (self.directory / filename).resolve()
        if not filepath.is_relative_to(self.directory.resolve()):
            log.warning("Rejected path-traversal attempt in trajectory read: %s", filename)
            return []
        if not filepath.exists():
            return []
        results: list[dict] = []
        try:
            async with aiofiles.open(filepath, "r") as f:
                lines = await f.readlines()
            for line in reversed(lines):
                line = line.strip()
                if not line:
                    continue
                try:
                    results.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
                if len(results) >= limit:
                    break
        except Exception as e:
            log.error("Failed to read trajectory file %s: %s", filename, e)
        return results

    async def search(
        self,
        *,
        channel_id: str | None = None,
        user_id: str | None = None,
        tool_name: str | None = None,
        errors_only: bool = False,
        limit: int = 50,
    ) -> list[dict]:
        results: list[dict] = []
        files = await self.list_files()
        for filename in reversed(files):
            entries = await self.read_file(filename, limit=limit * 2)
            for entry in entries:
                if channel_id and entry.get("channel_id") != channel_id:
                    continue
                if user_id and entry.get("user_id") != user_id:
                    continue
                if tool_name and tool_name not in entry.get("tools_used", []):
                    continue
                if errors_only and not entry.get("is_error"):
                    continue
                results.append(entry)
                if len(results) >= limit:
                    return results
        return results

    async def find_by_message_id(self, message_id: str) -> dict | None:
        """Find a single trajectory entry by message_id (most recent files first)."""
        files = await self.list_files()
        for filename in reversed(files):
            filepath = self.directory / filename
            if not filepath.exists():
                continue
            try:
                async with aiofiles.open(filepath, "r") as f:
                    lines = await f.readlines()
                for line in reversed(lines):
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        entry = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    if entry.get("message_id") == message_id:
                        return entry
            except Exception as e:
                log.error("Error reading %s for message lookup: %s", filename, e)
        return None

    def get_prometheus_metrics(self) -> dict:
        return {"trajectories_saved_total": self._count}
