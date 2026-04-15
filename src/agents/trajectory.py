"""Agent trajectory saving — full agent execution recording as JSONL.

Each agent execution produces a trajectory: agent metadata, each LLM iteration
(response, tool calls, tool results, timing), and the final outcome.

Trajectories are saved as one JSON object per line in date-partitioned files
under ``data/trajectories/agents/YYYY-MM-DD.jsonl``.
"""
from __future__ import annotations

import json
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path

import aiofiles

from ..odin_log import get_logger
from ..trajectories.saver import ToolIteration

log = get_logger("agent_trajectories")

DEFAULT_AGENT_TRAJECTORY_DIR = "./data/trajectories/agents"


@dataclass
class AgentTrajectoryTurn:
    """Complete trajectory of a single agent execution."""
    agent_id: str = ""
    label: str = ""
    goal: str = ""
    channel_id: str = ""
    requester_id: str = ""
    requester_name: str = ""
    timestamp: str = ""
    source: str = "agent"

    depth: int = 0
    parent_id: str | None = None
    system_prompt_length: int = 0

    iterations: list[ToolIteration] = field(default_factory=list)

    final_state: str = ""
    result: str = ""
    error: str = ""
    tools_used: list[str] = field(default_factory=list)
    iteration_count: int = 0
    total_duration_ms: int = 0
    recovery_attempts: int = 0
    state_history: list[dict] = field(default_factory=list)

    def add_iteration(
        self,
        iteration: int,
        tool_calls: list[dict] | None = None,
        tool_results: list[dict] | None = None,
        llm_text: str = "",
        duration_ms: int = 0,
    ) -> ToolIteration:
        it = ToolIteration(
            iteration=iteration,
            tool_calls=tool_calls or [],
            tool_results=tool_results or [],
            llm_text=llm_text,
            duration_ms=duration_ms,
        )
        self.iterations.append(it)
        return it

    def finalize(
        self,
        *,
        final_state: str,
        result: str = "",
        error: str = "",
        tools_used: list[str] | None = None,
        iteration_count: int = 0,
        recovery_attempts: int = 0,
        state_history: list[dict] | None = None,
        total_duration_ms: int = 0,
    ) -> None:
        self.final_state = final_state
        self.result = result
        self.error = error
        self.tools_used = tools_used or []
        self.iteration_count = iteration_count
        self.recovery_attempts = recovery_attempts
        self.state_history = state_history or []
        self.total_duration_ms = total_duration_ms

    def to_dict(self) -> dict:
        return {
            "agent_id": self.agent_id,
            "label": self.label,
            "goal": self.goal,
            "channel_id": self.channel_id,
            "requester_id": self.requester_id,
            "requester_name": self.requester_name,
            "timestamp": self.timestamp,
            "source": self.source,
            "depth": self.depth,
            "parent_id": self.parent_id,
            "system_prompt_length": self.system_prompt_length,
            "iterations": [asdict(it) for it in self.iterations],
            "final_state": self.final_state,
            "result": self.result,
            "error": self.error,
            "tools_used": self.tools_used,
            "iteration_count": self.iteration_count,
            "total_duration_ms": self.total_duration_ms,
            "recovery_attempts": self.recovery_attempts,
            "state_history": self.state_history,
        }


class AgentTrajectorySaver:
    """Writes agent trajectories as JSONL to date-partitioned files.

    Each day gets its own file: ``data/trajectories/agents/2026-04-15.jsonl``.
    Writes are async via aiofiles to avoid blocking the event loop.
    """

    def __init__(self, directory: str = DEFAULT_AGENT_TRAJECTORY_DIR) -> None:
        self.directory = Path(directory)
        self.directory.mkdir(parents=True, exist_ok=True)
        self._count = 0

    async def save(self, turn: AgentTrajectoryTurn) -> Path:
        now = datetime.now(timezone.utc)
        if not turn.timestamp:
            turn.timestamp = now.isoformat()

        filename = now.strftime("%Y-%m-%d") + ".jsonl"
        filepath = self.directory / filename
        data = turn.to_dict()
        line = json.dumps(data, default=str, ensure_ascii=False) + "\n"

        try:
            async with aiofiles.open(filepath, "a") as f:
                await f.write(line)
            self._count += 1
            log.debug(
                "Agent trajectory saved: agent=%s label=%s state=%s",
                turn.agent_id, turn.label, turn.final_state,
            )
        except Exception as e:
            log.error("Failed to save agent trajectory: %s", e)
            raise

        return filepath

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
        filepath = self.directory / filename
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
            log.error("Failed to read agent trajectory file %s: %s", filename, e)
        return results

    async def find_by_agent_id(self, agent_id: str) -> dict | None:
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
                    if entry.get("agent_id") == agent_id:
                        return entry
            except Exception as e:
                log.error("Error reading %s for agent lookup: %s", filename, e)
        return None

    async def search(
        self,
        *,
        channel_id: str | None = None,
        requester_id: str | None = None,
        tool_name: str | None = None,
        state: str | None = None,
        limit: int = 50,
    ) -> list[dict]:
        results: list[dict] = []
        files = await self.list_files()
        for filename in reversed(files):
            entries = await self.read_file(filename, limit=limit * 2)
            for entry in entries:
                if channel_id and entry.get("channel_id") != channel_id:
                    continue
                if requester_id and entry.get("requester_id") != requester_id:
                    continue
                if tool_name and tool_name not in entry.get("tools_used", []):
                    continue
                if state and entry.get("final_state") != state:
                    continue
                results.append(entry)
                if len(results) >= limit:
                    return results
        return results

    def get_prometheus_metrics(self) -> dict:
        return {"agent_trajectories_saved_total": self._count}
