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
from datetime import UTC, datetime
from pathlib import Path

import aiofiles

from ..llm.cost_tracker import estimate_tokens
from ..odin_log import get_logger

log = get_logger("trajectories")

DEFAULT_TRAJECTORY_DIR = "./data/trajectories"
MAX_TOOL_OUTPUT_CHARS = 12_000
# Storage-side cap per stored tool result (model-facing content is already
# capped at TOOL_OUTPUT_MAX_CHARS=12000); keeps heavy turns from bloating
# the daily JSONL files the WebUI reads whole.
TOOL_RESULT_STORE_CAP = 2_000


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
    tool_duration_ms: int = 0
    # Per-iteration execution provenance (chat, loop, AND agent paths),
    # sourced from the LLMResponse provenance fields — the values the
    # provider actually serialized into the successful request. The active
    # provider/model/effort are live-reloadable and the gateway can divert
    # to the auxiliary client, so a single turn-level stamp (context_trace's
    # `provider` block = turn-ENTRY policy context) would misattribute
    # iterations. Empty/None = unknown (records predating the stamp, or a
    # response that carried no provenance) — never a call-site guess.
    provider: str = ""
    model: str = ""
    reasoning_effort: str | None = None
    # Context-budget snapshot that governed this logical generation.  These
    # are request facts, not model-level API summaries; None means genuinely
    # unknown (notably a pre-v5 resumed generation whose density was never
    # persisted).
    context_density_milli: int | None = None
    context_density_source: str = ""
    context_primary_chars: int | None = None
    # Usage & Activity provenance.  These are facts of the accepted physical
    # request; older rows omit them and are classified legacy_estimated.
    server_input_tokens: int | None = None
    server_output_tokens: int | None = None
    estimated_input_tokens: int | None = None
    input_token_provenance: str = ""
    output_token_provenance: str = ""
    # Prompt-cache attribution (subsets of the accepted input; None = the
    # provider reported nothing, which older rows and non-Codex providers
    # share — never zero).
    cached_tokens: int | None = None
    cache_write_tokens: int | None = None


def stored_tool_results(
    tool_results: list | None,
    max_chars: int = TOOL_RESULT_STORE_CAP,
) -> list[dict]:
    """Shape tool_result continuation blocks for trajectory storage.

    Content arriving here is already secret-scrubbed and capped to what the
    model itself saw; this applies the smaller storage cap with truncation
    metadata so replay tooling knows when it is looking at a prefix.
    """
    out: list[dict] = []
    for r in tool_results or []:
        if not isinstance(r, dict):
            continue
        content = str(r.get("content", ""))
        entry: dict = {
            "tool_use_id": str(r.get("tool_use_id", "")),
            "content": content[:max_chars],
        }
        if len(content) > max_chars:
            entry["truncated"] = True
            entry["original_chars"] = len(content)
        out.append(entry)
    return out


@dataclass
class TrajectoryTurn:
    """Complete record of a single message turn through the bot."""
    message_id: str = ""
    channel_id: str = ""
    user_id: str = ""
    user_name: str = ""
    timestamp: str = ""
    source: str = "discord"

    # Autonomous-loop identity. A loop iteration is already a complete turn,
    # but older records carried only ``source="loop"`` and could not be joined
    # back to the loop that produced them. These fields are optional so the
    # on-disk schema stays backward compatible for chat and pre-v3.72 records.
    loop_id: str = ""
    loop_iteration: int = 0

    user_content: str = ""
    system_prompt: str = ""
    history: list[dict] = field(default_factory=list)

    iterations: list[ToolIteration] = field(default_factory=list)

    final_response: str = ""
    tools_used: list[str] = field(default_factory=list)
    is_error: bool = False
    handoff: bool = False
    # Observability: prompt-assembly decision metadata (PR #104) — counters,
    # reasons, hashed keys; never content. None when tracing is disabled.
    context_trace: dict | None = None
    # user_content truncation metadata (set when the request exceeded the cap)
    user_content_truncated: bool = False
    user_content_original_chars: int = 0

    total_input_tokens: int = 0
    total_output_tokens: int = 0
    total_duration_ms: int = 0
    end_to_end_duration_ms: int = 0
    _started_ns: int = field(default_factory=time.monotonic_ns, repr=False)

    # Context-overflow recovery evidence (campaign phase 4): one report per
    # rescue/latch pass, same shape agents already persist. Optional and
    # serialized only when non-empty — chat and pre-campaign records keep
    # their exact on-disk schema.
    context_recoveries: list[dict] = field(default_factory=list)

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
        from ..llm.timing import elapsed_ms
        self.end_to_end_duration_ms = elapsed_ms(self._started_ns)
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
            "end_to_end_duration_ms": self.end_to_end_duration_ms,
            "iteration_count": len(self.iterations),
        }
        if self.loop_id:
            d["loop_id"] = self.loop_id
        if self.loop_iteration:
            d["loop_iteration"] = self.loop_iteration
        if self.context_trace is not None:
            d["context_trace"] = self.context_trace
        if self.user_content_truncated:
            d["user_content_truncated"] = True
            d["user_content_original_chars"] = self.user_content_original_chars
        if self.context_recoveries:
            d["context_recoveries"] = self.context_recoveries
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

    def __init__(
        self,
        directory: str = DEFAULT_TRAJECTORY_DIR,
        *,
        usage_observer=None,
    ) -> None:
        self.directory = Path(directory)
        self.directory.mkdir(parents=True, exist_ok=True)
        self._count = 0
        self.usage_observer = usage_observer

    def set_usage_observer(self, observer) -> None:
        self.usage_observer = observer

    async def save(self, turn: TrajectoryTurn, *, observe_usage: bool = True) -> Path:
        now = datetime.now(UTC)
        if not turn.timestamp:
            turn.timestamp = now.isoformat()

        filename = _trajectory_filename(now)
        filepath = self.directory / filename
        data = turn.to_dict()
        # Backfill must distinguish a suspended/checkpoint snapshot from a
        # settled work unit. This additive marker does not alter the turn codec.
        data["usage_settled"] = bool(observe_usage)
        line = json.dumps(data, default=str, ensure_ascii=False) + "\n"

        try:
            async with aiofiles.open(filepath, "a") as f:
                await f.write(line)
            self._count += 1
            log.debug("Trajectory saved: msg=%s channel=%s", turn.message_id, turn.channel_id)
            # Additive observer AFTER the source artifact is durable.  It never
            # delays settlement; the resumable backfill repairs a missed task.
            observer = self.usage_observer
            if observer is not None and observe_usage:
                try:
                    observer.schedule_trajectory(data, "turn")
                except Exception:
                    log.debug("Usage observer scheduling failed (non-fatal)", exc_info=True)
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
                    if entry.get("message_id") == message_id:
                        return entry
            except Exception as e:
                log.error("Error reading %s for message lookup: %s", filename, e)
        return None

    async def find_by_loop_id(self, loop_id: str, limit: int = 1000) -> list[dict]:
        """Return durable turns for one autonomous loop, newest first.

        Loop records are date-partitioned with every other trajectory. Scan
        newest files first and stop at *limit*; exact ``loop_id`` plus
        ``source=loop`` matching prevents a coincidental field on another turn
        type from being attributed to the loop.
        """
        if not loop_id or limit <= 0:
            return []
        results: list[dict] = []
        files = await self.list_files()
        for filename in reversed(files):
            # Do not infer a date from the opaque loop ID. Scan the complete
            # partition: limiting generic read_file() before filtering would
            # hide an older loop behind unrelated newer chat/agent traffic.
            filepath = self.directory / filename
            try:
                async with aiofiles.open(filepath) as f:
                    lines = await f.readlines()
            except Exception as e:
                log.error("Error reading %s for loop lookup: %s", filename, e)
                continue
            for line in reversed(lines):
                line = line.strip()
                if not line:
                    continue
                try:
                    entry = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if entry.get("source") != "loop":
                    continue
                if entry.get("loop_id") != loop_id:
                    continue
                results.append(entry)
                if len(results) >= limit:
                    return results
        return results

    def get_prometheus_metrics(self) -> dict:
        return {"trajectories_saved_total": self._count}
