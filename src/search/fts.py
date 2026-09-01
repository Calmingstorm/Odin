"""Full-text search index using SQLite FTS5.

Provides exact-match and keyword search to complement sqlite-vec semantic search.
Two tables: session_fts (archived conversations) and knowledge_fts (ingested docs).
"""
from __future__ import annotations

import sqlite3
import threading

from ..odin_log import get_logger
from .errors import SearchExecutionError, validate_search_query

log = get_logger("search.fts")


class FullTextIndex:
    """SQLite FTS5 index for sessions and knowledge chunks."""

    def __init__(self, db_path: str) -> None:
        self._conn: sqlite3.Connection | None = None
        # The shared connection uses ``check_same_thread=False`` and is
        # written concurrently from ``asyncio.to_thread`` call sites
        # (knowledge ingest, session archival, channel-log indexing).
        # Mirrors the fix already applied to KnowledgeStore:
        #  1. ``busy_timeout`` lets SQLite wait for contended locks
        #     instead of failing immediately.
        #  2. ``_write_lock`` serializes writers. These write methods are
        #     synchronous (callers wrap them in ``asyncio.to_thread``), so
        #     a ``threading.Lock`` is used rather than an ``asyncio.Lock``.
        #     WAL mode still allows concurrent reads, so reads stay unlocked.
        self._write_lock = threading.Lock()
        try:
            conn = sqlite3.connect(db_path, check_same_thread=False)
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA busy_timeout=30000")
            # Verify FTS5 is available
            conn.execute("CREATE VIRTUAL TABLE IF NOT EXISTS _fts5_test USING fts5(x)")
            conn.execute("DROP TABLE _fts5_test")
            # Create tables
            conn.executescript("""
                CREATE VIRTUAL TABLE IF NOT EXISTS session_fts USING fts5(
                    doc_id UNINDEXED,
                    content,
                    channel_id UNINDEXED,
                    last_active UNINDEXED,
                    tokenize='unicode61 remove_diacritics 2'
                );
                CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts USING fts5(
                    chunk_id UNINDEXED,
                    content,
                    source UNINDEXED,
                    chunk_index UNINDEXED,
                    tokenize='unicode61 remove_diacritics 2'
                );
                CREATE VIRTUAL TABLE IF NOT EXISTS channel_log_fts USING fts5(
                    content,
                    author UNINDEXED,
                    channel_id UNINDEXED,
                    timestamp UNINDEXED,
                    tokenize='unicode61 remove_diacritics 2'
                );
            """)
            self._conn = conn
            log.info("FTS5 index initialized at %s", db_path)
        except Exception as e:
            log.error("FTS5 init failed: %s", e)

    @property
    def available(self) -> bool:
        return self._conn is not None

    # --- Session methods ---

    def index_session(
        self, doc_id: str, content: str, channel_id: str, last_active: float,
    ) -> bool:
        if not self._conn:
            return False
        try:
            with self._write_lock:
                # Delete existing then insert (FTS5 doesn't support upsert)
                self._conn.execute(
                    "DELETE FROM session_fts WHERE doc_id = ?", (doc_id,),
                )
                self._conn.execute(
                    "INSERT INTO session_fts (doc_id, content, channel_id, last_active) "
                    "VALUES (?, ?, ?, ?)",
                    (doc_id, content, channel_id, str(last_active)),
                )
                self._conn.commit()
            return True
        except Exception as e:
            log.error("FTS session index failed for %s: %s", doc_id, e)
            return False

    def search_sessions(
        self, query: str, limit: int = 20, channel_id: str | None = None,
    ) -> list[dict]:
        if not self._conn:
            raise SearchExecutionError("full-text search is unavailable")
        fts_query = _prepare_query(query)
        if not fts_query:
            return []
        if channel_id:
            rows = self._conn.execute(
                "SELECT doc_id, snippet(session_fts, 1, '>>>', '<<<', '...', 64), "
                "channel_id, last_active, bm25(session_fts) as rank "
                "FROM session_fts WHERE session_fts MATCH ? "
                "AND channel_id = ? "
                "ORDER BY rank LIMIT ?",
                (fts_query, channel_id, limit),
            ).fetchall()
        else:
            rows = self._conn.execute(
                "SELECT doc_id, snippet(session_fts, 1, '>>>', '<<<', '...', 64), "
                "channel_id, last_active, bm25(session_fts) as rank "
                "FROM session_fts WHERE session_fts MATCH ? "
                "ORDER BY rank LIMIT ?",
                (fts_query, limit),
            ).fetchall()
        return [
            {
                "doc_id": r[0],
                "content": r[1],
                "channel_id": r[2],
                "timestamp": float(r[3]) if r[3] else 0.0,
                "type": "fts",
                "rank": r[4],
            }
            for r in rows
        ]

    def has_session(self, doc_id: str) -> bool:
        if not self._conn:
            return False
        row = self._conn.execute(
            "SELECT 1 FROM session_fts WHERE doc_id = ? LIMIT 1", (doc_id,),
        ).fetchone()
        return row is not None

    # --- Knowledge methods ---

    def index_knowledge_chunk(
        self, chunk_id: str, content: str, source: str, chunk_index: int,
    ) -> bool:
        if not self._conn:
            return False
        try:
            with self._write_lock:
                self._conn.execute(
                    "DELETE FROM knowledge_fts WHERE chunk_id = ?", (chunk_id,),
                )
                self._conn.execute(
                    "INSERT INTO knowledge_fts (chunk_id, content, source, chunk_index) "
                    "VALUES (?, ?, ?, ?)",
                    (chunk_id, content, source, str(chunk_index)),
                )
                self._conn.commit()
            return True
        except Exception as e:
            log.error("FTS knowledge index failed for %s: %s", chunk_id, e)
            return False

    def search_knowledge(self, query: str, limit: int = 20) -> list[dict]:
        if not self._conn:
            raise SearchExecutionError("full-text search is unavailable")
        fts_query = _prepare_query(query)
        if not fts_query:
            return []
        rows = self._conn.execute(
            "SELECT chunk_id, snippet(knowledge_fts, 1, '>>>', '<<<', '...', 64), "
            "source, chunk_index, bm25(knowledge_fts) as rank "
            "FROM knowledge_fts WHERE knowledge_fts MATCH ? "
            "ORDER BY rank LIMIT ?",
            (fts_query, limit),
        ).fetchall()
        return [
            {
                "chunk_id": r[0],
                "content": r[1],
                "source": r[2],
                "chunk_index": int(r[3]) if r[3] else 0,
                "type": "fts",
                "rank": r[4],
            }
            for r in rows
        ]

    def delete_knowledge_source(self, source: str) -> int:
        if not self._conn:
            return 0
        try:
            with self._write_lock:
                cursor = self._conn.execute(
                    "DELETE FROM knowledge_fts WHERE source = ?", (source,),
                )
                self._conn.commit()
                rowcount = cursor.rowcount
            return rowcount
        except Exception as e:
            log.error("FTS knowledge delete failed for '%s': %s", source, e)
            return 0

    def has_knowledge_chunk(self, chunk_id: str) -> bool:
        if not self._conn:
            return False
        row = self._conn.execute(
            "SELECT 1 FROM knowledge_fts WHERE chunk_id = ? LIMIT 1", (chunk_id,),
        ).fetchone()
        return row is not None

    # --- Channel log methods ---

    def clear_channel_logs(self) -> bool:
        """Delete all rows from channel_log_fts.

        Called before a full re-index (e.g. after restart) to prevent duplicates.
        """
        if not self._conn:
            return False
        try:
            with self._write_lock:
                self._conn.execute("DELETE FROM channel_log_fts")
                self._conn.commit()
            return True
        except Exception as e:
            log.error("FTS channel log clear failed: %s", e)
            return False

    def index_channel_messages(self, messages: list[dict]) -> int:
        """Batch-insert channel log messages into the FTS index.

        Each dict should have: content, author, channel_id, timestamp (float).
        Returns the number of rows inserted.
        """
        if not self._conn or not messages:
            return 0
        try:
            rows = [
                (
                    m.get("content", ""),
                    m.get("author", "Unknown"),
                    str(m.get("channel_id", "")),
                    str(m.get("ts", 0.0)),
                )
                for m in messages
                if m.get("content")
            ]
            if not rows:
                return 0
            with self._write_lock:
                self._conn.executemany(
                    "INSERT INTO channel_log_fts (content, author, channel_id, timestamp) "
                    "VALUES (?, ?, ?, ?)",
                    rows,
                )
                self._conn.commit()
            return len(rows)
        except Exception as e:
            log.error("FTS channel log index failed: %s", e)
            return 0

    def search_channel_logs(
        self, query: str, limit: int = 20, channel_id: str | None = None,
    ) -> list[dict]:
        """Search the channel_log_fts table.

        Returns dicts with content, author, channel_id, timestamp, type="channel".
        """
        if not self._conn:
            raise SearchExecutionError("full-text search is unavailable")
        fts_query = _prepare_query(query)
        if not fts_query:
            return []
        if channel_id:
            rows = self._conn.execute(
                "SELECT snippet(channel_log_fts, 0, '>>>', '<<<', '...', 64), "
                "author, channel_id, timestamp, bm25(channel_log_fts) as rank "
                "FROM channel_log_fts WHERE channel_log_fts MATCH ? "
                "AND channel_id = ? "
                "ORDER BY rank LIMIT ?",
                (fts_query, channel_id, limit),
            ).fetchall()
        else:
            rows = self._conn.execute(
                "SELECT snippet(channel_log_fts, 0, '>>>', '<<<', '...', 64), "
                "author, channel_id, timestamp, bm25(channel_log_fts) as rank "
                "FROM channel_log_fts WHERE channel_log_fts MATCH ? "
                "ORDER BY rank LIMIT ?",
                (fts_query, limit),
            ).fetchall()
        return [
            {
                "content": r[0],
                "author": r[1],
                "channel_id": r[2],
                "timestamp": float(r[3]) if r[3] else 0.0,
                "type": "channel",
                "rank": r[4],
            }
            for r in rows
        ]


def _prepare_query(raw: str) -> str:
    """Quote each whitespace-delimited term for literal FTS5 implicit-AND search.

    Advanced FTS5 syntax is deliberately unsupported. Quoting terms separately
    preserves the ordinary multi-term AND semantics without converting the whole
    query into an adjacent phrase.
    """
    validate_search_query(raw)
    raw = raw.strip()
    if not raw:
        return ""
    quoted = []
    for term in raw.split():
        escaped = term.replace('"', '""')
        quoted.append(f'"{escaped}"')
    return " ".join(quoted)
