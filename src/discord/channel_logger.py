"""Passive channel logger — writes ALL Discord messages to JSONL files.

Zero LLM tokens. Pure file I/O. One JSON line per message, appended to
``data/channel_logs/{channel_id}.jsonl``.
"""

from __future__ import annotations

import hashlib
import heapq
import json
import threading
import time
import uuid
from collections import deque
from collections.abc import Iterator
from pathlib import Path
from typing import TYPE_CHECKING

from ..credential_redaction import redact_credentials
from ..odin_log import get_logger
from ..search.errors import validate_search_query

if TYPE_CHECKING:
    from ..search.fts import FullTextIndex

log = get_logger("channel_logger")


class ChannelLogger:
    """Append-only JSONL logger for Discord channel messages.

    Parameters
    ----------
    log_dir:
        Directory where per-channel JSONL files are stored.
        Created automatically if it does not exist.
    """

    # Batch size cap for FTS indexing to limit memory on huge JSONL files
    FTS_BATCH_LIMIT = 5000
    # Reconciliation is all-or-nothing, not one committed row batch.
    FTS_RECONCILE_SECONDS = 5.0

    def __init__(self, log_dir: str | Path) -> None:
        self._log_dir = Path(log_dir)
        self._log_dir.mkdir(parents=True, exist_ok=True)
        self._dir_exists = True  # track dir state to avoid per-message stat()
        self._index_lock = threading.Lock()
        # Per log file: (device, inode, line-start offset, line number, identity)
        # of the last record handed to FTS. A pass resumes there once that line
        # still holds that identity, instead of re-parsing the whole old prefix.
        self._index_positions: dict[str, tuple[int, int, int, int, str]] = {}

    def log_message(self, message: object, *, content: str | None = None) -> None:
        """Append a single message to the appropriate channel JSONL file.

        Skips DMs (no guild).  Tolerant of missing attributes so it never
        raises and never blocks the caller.
        """
        try:
            # Skip DMs — no guild means no channel log
            channel = getattr(message, "channel", None)
            if channel is None:
                return
            guild = getattr(channel, "guild", None)
            if guild is None:
                return

            channel_id = str(channel.id)
            author = getattr(message, "author", None)

            record = {
                "ts": (message.created_at.timestamp()
                       if hasattr(message, "created_at") and message.created_at else 0.0),
                "author_id": str(author.id) if author else "0",
                "author": redact_credentials(str(
                    getattr(author, "display_name", getattr(author, "name", "Unknown")),
                )),
                "bot": bool(getattr(author, "bot", False)),
                "content": redact_credentials(
                    (getattr(message, "content", "") or "") if content is None else content,
                ),
                "attachments": [redact_credentials(a.filename)
                                for a in getattr(message, "attachments", [])],
                "message_id": str(getattr(message, "id", "") or ""),
                "log_identity": uuid.uuid4().hex,
                "channel_id": channel_id,
                "guild_id": str(guild.id),
                "channel_name": getattr(channel, "name", None),
            }

            path = self._log_dir / f"{channel_id}.jsonl"
            line = json.dumps(record, separators=(",", ":")) + "\n"
            try:
                with open(path, "a", encoding="utf-8") as f:
                    f.write(line)
            except FileNotFoundError:
                # Directory was deleted while running — recreate and retry once
                self._log_dir.mkdir(parents=True, exist_ok=True)
                self._dir_exists = True
                with open(path, "a", encoding="utf-8") as f:
                    f.write(line)
        except Exception:
            # Never let logging failures propagate — the message handler must not break
            log.debug("Failed to log channel message", exc_info=True)

    def index_to_fts(self, fts: FullTextIndex) -> int:
        """Consume durable identities only with a committed/empty ACK.

        Consistent cursors survive restart/rotation without clearing history.
        Missing or inconsistent derived state is reconciled atomically, even
        after an older indexer rebuilt FTS without updating identities/cursors.
        Legacy JSONL stays untouched; identities are assigned to derived rows.
        """
        if not fts or not fts.available:
            return 0
        total = 0
        with self._index_lock:
            # One untagged-row scan per pass instead of one per channel; the other
            # consistency predicates stay fresh. Unavailable means per-channel checks.
            snapshot = getattr(fts, "untagged_channel_snapshot", None)
            try:
                untagged = snapshot() if callable(snapshot) else None
            except Exception:
                untagged = None
            if not isinstance(untagged, frozenset):
                untagged = None
            for path in self._log_dir.glob("*.jsonl"):
                channel_id = path.stem
                try:
                    cursor = fts.channel_cursor(channel_id)
                    if cursor is None or (
                        fts.channel_needs_reconciliation(channel_id) if untagged is None
                        else fts.channel_needs_reconciliation_cached(channel_id, untagged)
                    ):
                        deadline = time.monotonic() + self.FTS_RECONCILE_SECONDS
                        ack = fts.reconcile_channel_batches(
                            channel_id, self._initial_index_batches(path, deadline),
                            deadline=deadline,
                        )
                        if ack.status != "error":
                            total += ack.count
                        continue
                    batch = self._index_batch(path, cursor)
                    if batch:
                        ack = fts.index_channel_batch(
                            batch, channel_id=channel_id,
                            cursor_identity=batch[-1]["log_identity"],
                        )
                        if ack.status != "error":
                            total += ack.count
                except Exception:
                    log.debug("Channel indexing failed; progress retained for retry", exc_info=True)
        if total:
            log.info("Indexed %d channel log messages into FTS", total)
        return total

    def _initial_index_batches(self, path: Path, deadline: float) -> Iterator[list[dict]]:
        """Stream one time-bounded source snapshot, with bounded batch memory.

        Snapshot EOF prevents a busy channel from extending the upgrade forever.
        A torn final record is left for the next pass, as on incremental reads.
        """
        batch: list[dict] = []
        with path.open(encoding="utf-8") as stream:
            end = path.stat().st_size
            number = 0
            while stream.tell() < end:
                if time.monotonic() >= deadline:
                    raise TimeoutError("Channel reconciliation deadline; old index retained")
                line = stream.readline()
                if not line or not line.endswith("\n") or stream.tell() > end:
                    break
                record = self._index_record(path, number, line)
                number += 1
                if record is None:
                    continue
                batch.append(record)
                if len(batch) >= self.FTS_BATCH_LIMIT:
                    yield batch
                    batch = []
            if batch:
                yield batch

    @staticmethod
    def _index_record(path: Path, number: int, line: str) -> dict | None:
        try:
            record = json.loads(line)
        except json.JSONDecodeError:
            return None
        if not isinstance(record, dict):
            return None
        identity = record.get("log_identity") or "legacy:" + hashlib.sha256(
            f"{path.stem}:{number}:{line}".encode(),
        ).hexdigest()
        record["log_identity"] = identity
        if not record.get("message_id"):
            record["message_id"] = identity
        return record

    def _index_batch(self, path: Path, cursor: str | None) -> list[dict]:
        if cursor is not None:
            resumed = self._resume_index_batch(path, cursor)
            if resumed is not None:
                return resumed
        batch: list[dict] = []
        found = cursor is None
        last: tuple[int, int, str] | None = None
        with path.open(encoding="utf-8") as stream:
            number = 0
            while True:
                start = stream.tell()
                line = stream.readline()
                if not line.endswith("\n"):
                    break  # end of file, or an in-flight append is not consumed
                record = self._index_record(path, number, line)
                number += 1
                if record is None:
                    continue
                if not found:
                    found = record["log_identity"] == cursor
                    if found:  # a pass with no new records still resumes here next time
                        last = (start, number - 1, record["log_identity"])
                    continue
                batch.append(record)
                last = (start, number - 1, record["log_identity"])
                if len(batch) >= self.FTS_BATCH_LIMIT:
                    break
        if not found:
            return self._index_batch(path, None)
        self._remember_index_position(path, last)
        return batch

    def _resume_index_batch(self, path: Path, cursor: str) -> list[dict] | None:
        """Read on from the cursor's remembered line, or None to rescan.

        The remembered line must still hold the cursor's identity in the same
        file (same device and inode), so rotation, truncation or a rewrite fall
        back to the full scan.
        """
        position = self._index_positions.get(str(path))
        if position is None or position[4] != cursor:
            return None
        device, inode, offset, number, _identity = position
        try:
            info = path.stat()
            if (info.st_dev, info.st_ino) != (device, inode) or info.st_size < offset:
                return None
            batch: list[dict] = []
            last: tuple[int, int, str] | None = None
            with path.open(encoding="utf-8") as stream:
                stream.seek(offset)
                line = stream.readline()
                if not line.endswith("\n"):
                    return None
                record = self._index_record(path, number, line)
                if record is None or record["log_identity"] != cursor:
                    return None
                number += 1
                while len(batch) < self.FTS_BATCH_LIMIT:
                    start = stream.tell()
                    line = stream.readline()
                    if not line.endswith("\n"):
                        break  # end of file, or an in-flight append
                    record = self._index_record(path, number, line)
                    number += 1
                    if record is None:
                        continue
                    batch.append(record)
                    last = (start, number - 1, record["log_identity"])
        except (OSError, UnicodeDecodeError, ValueError):
            return None
        self._remember_index_position(path, last)
        return batch

    def _remember_index_position(self, path: Path, last: tuple[int, int, str] | None) -> None:
        if last is None:
            return
        try:
            info = path.stat()
        except OSError:
            self._index_positions.pop(str(path), None)
            return
        start, number, identity = last
        self._index_positions[str(path)] = (info.st_dev, info.st_ino, start, number, identity)

    def search(self, query: str, limit: int = 20, channel_id: str | None = None,
               *, author_id: str | None = None,
               accept=None) -> list[dict]:
        """Keyword search on JSONL files (fallback when FTS is unavailable).

        Returns dicts with content, author, channel_id, timestamp, type="channel".
        Merge matches globally by timestamp before applying the result limit.
        """
        validate_search_query(query)
        results: list[dict] = []
        query_lower = query.lower()
        if not query_lower or limit <= 0:
            return results
        newest: list[tuple[float, int, dict]] = []
        ordinal = 0
        try:
            if not self._log_dir.exists():
                return results
            for path in self._log_dir.glob("*.jsonl"):
                if channel_id and path.stem != channel_id:
                    continue
                try:
                    with open(path, encoding="utf-8") as f:
                        # Use deque to read lines newest-first without loading all into memory
                        lines = deque(f, maxlen=50000)  # cap at 50K most recent lines
                    for line in reversed(lines):
                        line = line.strip()
                        if not line:
                            continue
                        try:
                            record = json.loads(line)
                        except json.JSONDecodeError:
                            continue
                        if author_id and str(record.get("author_id", "")) != author_id:
                            continue
                        if accept is not None and not accept(record):
                            continue
                        content = record.get("content", "")
                        if query_lower in content.lower():
                            match = {
                                "content": content[:500],
                                "author": record.get("author", "Unknown"),
                                "channel_id": record.get("channel_id", ""),
                                "timestamp": record.get("ts", 0.0),
                                "type": "channel",
                                "message_id": record.get("message_id"),
                                "channel_name": record.get("channel_name"),
                            }
                            ordinal += 1
                            entry = (match["timestamp"], ordinal, match)
                            if len(newest) < limit:
                                heapq.heappush(newest, entry)
                            elif entry[:2] > newest[0][:2]:
                                heapq.heapreplace(newest, entry)
                except Exception:
                    continue
        except Exception:
            log.debug("Channel log keyword search failed", exc_info=True)
        return [entry[2] for entry in sorted(newest, reverse=True)]
