"""Passive channel logger — writes ALL Discord messages to JSONL files.

Zero LLM tokens. Pure file I/O. One JSON line per message, appended to
``data/channel_logs/{channel_id}.jsonl``.
"""

from __future__ import annotations

import hashlib
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
    # First-pass reconciliation is all-or-nothing, not one committed row batch.
    FTS_RECONCILE_SECONDS = 5.0

    def __init__(self, log_dir: str | Path) -> None:
        self._log_dir = Path(log_dir)
        self._log_dir.mkdir(parents=True, exist_ok=True)
        self._dir_exists = True  # track dir state to avoid per-message stat()
        self._index_lock = threading.Lock()

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

        Restart never clears historical rows. Missing cursors after rotation or
        truncation replay the current file idempotently. Legacy JSONL stays
        untouched; its stable line identity is assigned only to derived rows.
        """
        if not fts or not fts.available:
            return 0
        total = 0
        with self._index_lock:
            for path in self._log_dir.glob("*.jsonl"):
                channel_id = path.stem
                try:
                    cursor = fts.channel_cursor(channel_id)
                    if cursor is None:
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
        batch: list[dict] = []
        found = cursor is None
        with path.open(encoding="utf-8") as stream:
            for number, line in enumerate(stream):
                if not line.endswith("\n"):
                    break  # an in-flight append is not consumed
                record = self._index_record(path, number, line)
                if record is None:
                    continue
                if not found:
                    found = record["log_identity"] == cursor
                    continue
                batch.append(record)
                if len(batch) >= self.FTS_BATCH_LIMIT:
                    break
        if not found:
            return self._index_batch(path, None)
        return batch

    def search(self, query: str, limit: int = 20, channel_id: str | None = None) -> list[dict]:
        """Keyword search on JSONL files (fallback when FTS is unavailable).

        Returns dicts with content, author, channel_id, timestamp, type="channel".
        Reads files in reverse (newest messages first) for better relevance.
        """
        validate_search_query(query)
        results: list[dict] = []
        query_lower = query.lower()
        if not query_lower:
            return results
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
                        content = record.get("content", "")
                        if query_lower in content.lower():
                            results.append({
                                "content": content[:500],
                                "author": record.get("author", "Unknown"),
                                "channel_id": record.get("channel_id", ""),
                                "timestamp": record.get("ts", 0.0),
                                "type": "channel",
                            })
                            if len(results) >= limit:
                                return results
                except Exception:
                    continue
        except Exception:
            log.debug("Channel log keyword search failed", exc_info=True)
        return results
