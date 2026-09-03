"""Agent trajectory saving — full agent execution recording as JSONL.

Each agent execution produces a trajectory: agent metadata, each LLM iteration
(response, tool calls, tool results, timing), and the final outcome.

Trajectories are saved as one JSON object per line in date-partitioned files
under ``data/trajectories/agents/YYYY-MM-DD.jsonl``.
"""
from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
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
    # Spawn policy snapshot (per-agent timeout values the run was bound by)
    iteration_timeout: float | None = None
    max_lifetime: float | None = None
    # Per-spawn LLM overrides the parent explicitly chose for this agent
    # (None = inherited the configured agent defaults). Distinct from the
    # per-iteration execution provenance, which records what ACTUALLY ran.
    model_override: str | None = None
    reasoning_effort_override: str | None = None
    # Context-overflow recovery evidence (empty for the overwhelming majority
    # of agents): each entry carries sizes, retention, trigger, and attempt;
    # the ceiling is the latched survivable size the agent compacted to.
    context_recoveries: list[dict] = field(default_factory=list)
    context_char_ceiling: int | None = None

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
        input_tokens: int = 0,
        output_tokens: int = 0,
        server_input_tokens: int | None = None,
        server_output_tokens: int | None = None,
        estimated_input_tokens: int | None = None,
        input_token_provenance: str = "",
        output_token_provenance: str = "",
        cached_tokens: int | None = None,
        cache_write_tokens: int | None = None,
        provider: str = "",
        model: str = "",
        reasoning_effort: str | None = None,
        context_density_milli: int | None = None,
        context_density_source: str = "",
        context_primary_chars: int | None = None,
    ) -> ToolIteration:
        it = ToolIteration(
            iteration=iteration,
            tool_calls=tool_calls or [],
            tool_results=tool_results or [],
            llm_text=llm_text,
            duration_ms=duration_ms,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            server_input_tokens=server_input_tokens,
            server_output_tokens=server_output_tokens,
            estimated_input_tokens=estimated_input_tokens,
            input_token_provenance=input_token_provenance,
            output_token_provenance=output_token_provenance,
            cached_tokens=cached_tokens,
            cache_write_tokens=cache_write_tokens,
            provider=provider,
            model=model,
            reasoning_effort=reasoning_effort,
            context_density_milli=context_density_milli,
            context_density_source=context_density_source,
            context_primary_chars=context_primary_chars,
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
        context_recoveries: list[dict] | None = None,
        context_char_ceiling: int | None = None,
    ) -> None:
        self.final_state = final_state
        self.result = result
        self.error = error
        self.tools_used = tools_used or []
        self.iteration_count = iteration_count
        self.recovery_attempts = recovery_attempts
        self.state_history = state_history or []
        self.total_duration_ms = total_duration_ms
        self.context_recoveries = list(context_recoveries or [])
        self.context_char_ceiling = context_char_ceiling

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
            "iteration_timeout": self.iteration_timeout,
            "max_lifetime": self.max_lifetime,
            "model_override": self.model_override,
            "reasoning_effort_override": self.reasoning_effort_override,
            **(
                {
                    "context_recoveries": list(self.context_recoveries),
                    "context_char_ceiling": self.context_char_ceiling,
                }
                if self.context_recoveries
                else {}
            ),
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

    def __init__(
        self,
        directory: str = DEFAULT_AGENT_TRAJECTORY_DIR,
        *,
        usage_observer=None,
    ) -> None:
        self.directory = Path(directory)
        self.directory.mkdir(parents=True, exist_ok=True)
        self._count = 0
        self.usage_observer = usage_observer

    def set_usage_observer(self, observer) -> None:
        self.usage_observer = observer

    async def save(self, turn: AgentTrajectoryTurn) -> Path:
        now = datetime.now(UTC)
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
            observer = self.usage_observer
            if observer is not None:
                try:
                    observer.schedule_trajectory(data, "agent")
                except Exception:
                    log.debug("Usage observer scheduling failed (non-fatal)", exc_info=True)
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
            async with aiofiles.open(filepath) as f:
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
                async with aiofiles.open(filepath) as f:
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
