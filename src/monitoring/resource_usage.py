"""Resource usage stats — session count, knowledge DB size, trajectory volume.

Gathers memory/storage metrics from bot subsystems into a single snapshot
for the web UI resource-usage widget.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import TYPE_CHECKING, Any

from ..odin_log import get_logger

if TYPE_CHECKING:
    pass  # bot type only used in function signatures

log = get_logger("monitoring.resource_usage")

DEFAULT_TRAJECTORY_DIR = "./data/trajectories"
DEFAULT_AGENT_TRAJECTORY_DIR = "./data/trajectories/agents"
DEFAULT_SESSION_DIR = "./data/sessions"


@dataclass(slots=True)
class DirStats:
    """Size and file count for a directory."""
    path: str = ""
    file_count: int = 0
    total_bytes: int = 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "path": self.path,
            "file_count": self.file_count,
            "total_bytes": self.total_bytes,
            "total_mb": round(self.total_bytes / (1024 * 1024), 2) if self.total_bytes else 0.0,
        }


@dataclass(slots=True)
class SessionStats:
    """Aggregate session metrics."""
    active_count: int = 0
    total_tokens: int = 0
    total_messages: int = 0
    over_budget_count: int = 0
    token_budget: int = 0
    persist_dir: DirStats = field(default_factory=DirStats)
    per_session: list[dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "active_count": self.active_count,
            "total_tokens": self.total_tokens,
            "total_messages": self.total_messages,
            "over_budget_count": self.over_budget_count,
            "token_budget": self.token_budget,
            "persist_dir": self.persist_dir.to_dict(),
            "per_session": self.per_session,
        }


@dataclass(slots=True)
class KnowledgeStats:
    """Knowledge store size metrics."""
    available: bool = False
    chunk_count: int = 0
    source_count: int = 0
    vector_search: bool = False
    db_file: DirStats = field(default_factory=DirStats)
    sources: list[dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "available": self.available,
            "chunk_count": self.chunk_count,
            "source_count": self.source_count,
            "vector_search": self.vector_search,
            "db_file": self.db_file.to_dict(),
            "sources": self.sources,
        }


@dataclass(slots=True)
class TrajectoryStats:
    """Trajectory storage metrics (message + agent trajectories)."""
    message_count: int = 0
    agent_count: int = 0
    message_dir: DirStats = field(default_factory=DirStats)
    agent_dir: DirStats = field(default_factory=DirStats)
    message_files: list[str] = field(default_factory=list)
    agent_files: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "message_count": self.message_count,
            "agent_count": self.agent_count,
            "total_count": self.message_count + self.agent_count,
            "message_dir": self.message_dir.to_dict(),
            "agent_dir": self.agent_dir.to_dict(),
            "combined_bytes": self.message_dir.total_bytes + self.agent_dir.total_bytes,
            "combined_mb": round(
                (self.message_dir.total_bytes + self.agent_dir.total_bytes) / (1024 * 1024), 2
            ),
            "message_files": self.message_files,
            "agent_files": self.agent_files,
        }


def scan_directory(path: str | Path) -> DirStats:
    """Scan a directory for file count and total size."""
    p = Path(path)
    stats = DirStats(path=str(p))
    if not p.exists() or not p.is_dir():
        return stats
    try:
        for entry in p.iterdir():
            if entry.is_file():
                try:
                    stats.file_count += 1
                    stats.total_bytes += entry.stat().st_size
                except OSError:
                    pass
    except OSError:
        pass
    return stats


def scan_file(path: str | Path) -> DirStats:
    """Get size info for a single file."""
    p = Path(path)
    stats = DirStats(path=str(p))
    if not p.exists() or not p.is_file():
        return stats
    try:
        st = p.stat()
        stats.file_count = 1
        stats.total_bytes = st.st_size
    except OSError:
        pass
    return stats


def collect_session_stats(bot: Any) -> SessionStats:
    """Gather session metrics from the bot's session manager."""
    stats = SessionStats()
    try:
        sm = getattr(bot, "sessions", None)
        if sm is None:
            return stats

        stats.active_count = sm.count() if hasattr(sm, "count") else 0
        stats.token_budget = getattr(sm, "token_budget", 0)

        for cid, session in (sm.items_snapshot() if hasattr(sm, "items_snapshot") else []):
            tokens = getattr(session, "estimated_tokens", 0)
            msg_count = len(getattr(session, "messages", []))
            stats.total_tokens += tokens
            stats.total_messages += msg_count
            if stats.token_budget > 0 and tokens > stats.token_budget:
                stats.over_budget_count += 1
            stats.per_session.append({
                "channel_id": cid,
                "tokens": tokens,
                "messages": msg_count,
                "has_summary": bool(getattr(session, "summary", "")),
            })

        persist_dir = getattr(sm, "persist_directory", DEFAULT_SESSION_DIR)
        stats.persist_dir = scan_directory(persist_dir)
    except Exception as exc:
        log.debug("Error collecting session stats: %s", exc)
    return stats


def collect_knowledge_stats(bot: Any) -> KnowledgeStats:
    """Gather knowledge store metrics."""
    stats = KnowledgeStats()
    try:
        ks = getattr(bot, "knowledge", None)
        if ks is None:
            return stats

        stats.available = getattr(ks, "available", False)
        if not stats.available:
            return stats

        stats.chunk_count = ks.count()
        stats.vector_search = getattr(ks, "_has_vec", False)

        try:
            sources = ks.list_sources()
            stats.source_count = len(sources)
            stats.sources = [
                {
                    "source": s.get("source", ""),
                    "chunks": s.get("chunks", 0),
                    "uploader": s.get("uploader", ""),
                }
                for s in sources
            ]
        except Exception:
            pass

        db_path = getattr(ks, "_db_path", None)
        if db_path:
            stats.db_file = scan_file(db_path)
        else:
            conn = getattr(ks, "_conn", None)
            if conn is not None:
                try:
                    row = conn.execute("PRAGMA database_list").fetchone()
                    if row and row[2]:
                        stats.db_file = scan_file(row[2])
                except Exception:
                    pass
    except Exception as exc:
        log.debug("Error collecting knowledge stats: %s", exc)
    return stats


def collect_trajectory_stats(bot: Any) -> TrajectoryStats:
    """Gather trajectory volume metrics."""
    stats = TrajectoryStats()

    try:
        ts = getattr(bot, "trajectory_saver", None)
        if ts is not None:
            stats.message_count = getattr(ts, "count", 0)
            if callable(stats.message_count):
                stats.message_count = stats.message_count()
            directory = getattr(ts, "directory", Path(DEFAULT_TRAJECTORY_DIR))
            stats.message_dir = scan_directory(directory)
            try:
                stats.message_files = sorted(
                    f.name for f in Path(directory).iterdir()
                    if f.suffix == ".jsonl" and f.is_file()
                )
            except (OSError, TypeError):
                pass
    except Exception as exc:
        log.debug("Error collecting message trajectory stats: %s", exc)

    try:
        ats = getattr(bot, "agent_trajectory_saver", None)
        if ats is not None:
            stats.agent_count = getattr(ats, "count", 0)
            if callable(stats.agent_count):
                stats.agent_count = stats.agent_count()
            directory = getattr(ats, "directory", Path(DEFAULT_AGENT_TRAJECTORY_DIR))
            stats.agent_dir = scan_directory(directory)
            try:
                stats.agent_files = sorted(
                    f.name for f in Path(directory).iterdir()
                    if f.suffix == ".jsonl" and f.is_file()
                )
            except (OSError, TypeError):
                pass
    except Exception as exc:
        log.debug("Error collecting agent trajectory stats: %s", exc)

    return stats


def collect_all(bot: Any) -> dict[str, Any]:
    """Collect all resource usage stats into a single dict."""
    sessions = collect_session_stats(bot)
    knowledge = collect_knowledge_stats(bot)
    trajectories = collect_trajectory_stats(bot)

    total_storage_bytes = (
        sessions.persist_dir.total_bytes
        + knowledge.db_file.total_bytes
        + trajectories.message_dir.total_bytes
        + trajectories.agent_dir.total_bytes
    )

    return {
        "sessions": sessions.to_dict(),
        "knowledge": knowledge.to_dict(),
        "trajectories": trajectories.to_dict(),
        "storage_total_bytes": total_storage_bytes,
        "storage_total_mb": round(total_storage_bytes / (1024 * 1024), 2) if total_storage_bytes else 0.0,
        "collected_at": datetime.now(timezone.utc).isoformat(),
    }
