"""Session archive vector store — semantic search over archived conversations.

Uses SQLite + sqlite-vec for vector storage and FTS5 for keyword search.
Archives are indexed when sessions are compacted, enabling cross-session search.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import sqlite3
import threading
from pathlib import Path
from typing import TYPE_CHECKING

from ..odin_log import get_logger
from .errors import SearchExecutionError, validate_search_query
from .hybrid import reciprocal_rank_fusion
from .sqlite_vec import load_extension, serialize_vector

if TYPE_CHECKING:
    from .embedder import LocalEmbedder
    from .fts import FullTextIndex

log = get_logger("search.vectorstore")

MAX_MESSAGES_PER_DOC = 20
MAX_MSG_CHARS = 500
VECTOR_DIM = 384  # must match LocalEmbedder.DIMENSIONS


def summary_segment_doc_id(channel_id: str, seg: dict) -> str:
    """Stable identity across restored archives containing the same segment."""
    payload = json.dumps([channel_id, seg.get("start_ts"), seg.get("end_ts"),
                          seg.get("summary", "")])
    return "seg:" + hashlib.sha256(payload.encode()).hexdigest()[:24]


class SessionVectorStore:
    """Semantic + FTS search over archived session conversations."""

    def __init__(self, db_path: str, fts_index: FullTextIndex | None = None) -> None:
        self._conn: sqlite3.Connection | None = None
        self._has_vec = False
        self._fts = fts_index
        # The shared connection uses ``check_same_thread=False``, and every
        # archive/backfill write is dispatched independently through
        # ``asyncio.to_thread`` (the default executor), so two writers can
        # otherwise interleave inside one connection's transaction state —
        # producing failed commits or metadata/vector skew. Mirrors the fix
        # already applied to KnowledgeStore and FullTextIndex:
        #  1. ``busy_timeout`` waits for contended locks instead of failing
        #     immediately.
        #  2. ``_write_lock`` serializes the synchronous writers that callers
        #     wrap in ``asyncio.to_thread``. WAL mode still allows concurrent
        #     reads, so reads stay unlocked.
        self._write_lock = threading.Lock()
        self._segment_backfill_lock = asyncio.Lock()
        try:
            conn = sqlite3.connect(db_path, check_same_thread=False)
            conn.execute("PRAGMA journal_mode=WAL")
            # 30 seconds is generous but bounded — prevents indefinite hangs
            # while still absorbing typical contention windows.
            conn.execute("PRAGMA busy_timeout=30000")
            self._has_vec = load_extension(conn)
            if not self._has_vec:
                log.warning("sqlite-vec not available — semantic session search disabled, FTS-only "
                            "mode")
            # Metadata table
            conn.execute("""
                CREATE TABLE IF NOT EXISTS session_archives (
                    doc_id TEXT PRIMARY KEY,
                    content TEXT NOT NULL,
                    channel_id TEXT NOT NULL DEFAULT '',
                    last_active REAL NOT NULL DEFAULT 0,
                    message_count INTEGER NOT NULL DEFAULT 0
                )
            """)
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_session_channel ON session_archives(channel_id)"
            )
            conn.execute("CREATE TABLE IF NOT EXISTS segment_index_state ("
                         "archive_doc_id TEXT PRIMARY KEY, indexed_at REAL NOT NULL)")
            # Vector table (only if sqlite-vec loaded)
            if self._has_vec:
                conn.execute(f"""
                    CREATE VIRTUAL TABLE IF NOT EXISTS session_vec USING vec0(
                        doc_id TEXT PRIMARY KEY,
                        embedding float[{VECTOR_DIM}] distance_metric=cosine
                    )
                """)
            conn.commit()
            self._conn = conn
            log.info("Session vector store initialized at %s (vec=%s)", db_path, self._has_vec)
        except Exception as e:
            log.error("Session vector store init failed: %s", e)

    @property
    def available(self) -> bool:
        return self._conn is not None

    async def index_session(self, archive_path: Path, embedder: LocalEmbedder) -> bool:
        """Index a single archived session JSON. Returns True on success."""
        if not self.available:
            return False
        try:
            data = await asyncio.to_thread(self._read_archive_sync, archive_path)
        except Exception as e:
            log.error("Failed to read archive %s: %s", archive_path, e)
            return False

        doc_id = archive_path.stem  # e.g. "channelid_timestamp"
        doc_text = self._build_document_text(data)
        # A segment-only archive has no legacy document, but still needs its
        # independent, searchable segment documents.
        if not doc_text:
            return await self._index_segments(data, doc_id, embedder)

        channel_id = str(data.get("channel_id", ""))
        last_active = float(data.get("last_active", 0))
        message_count = len(data.get("messages", []))

        # Embed (async, non-blocking)
        vector = None
        if self._has_vec and embedder:
            vector = await embedder.embed(doc_text)
            if vector is None:
                log.warning("Failed to embed archive %s", archive_path.name)

        # Write metadata + vector to DB (blocking → offload)
        try:
            await asyncio.to_thread(
                self._write_session_sync,
                doc_id, doc_text, channel_id, last_active, message_count, vector,
            )
            if not await self._index_segments(data, doc_id, embedder):
                return False
            log.info("Indexed session %s for search", doc_id)
            return True
        except Exception as e:
            log.error("Session index failed for %s: %s", doc_id, e)
            return False

    async def _index_segments(self, data: dict, archive_doc_id: str,
                              embedder: LocalEmbedder | None) -> bool:
        """Write missing segments, then acknowledge the entire archive.

        FTS has its own database: the state row is committed only after each
        FTS write acknowledges. An interrupted run repairs missing FTS rows.
        """
        try:
            channel_id = str(data.get("channel_id", ""))
            missing: list[tuple[str, str, str, float, int, list[float] | None]] = []
            for seg in data.get("summary_segments", []):
                text = seg.get("summary", "")
                if not text:
                    continue
                doc_id = summary_segment_doc_id(channel_id, seg)
                exists = await asyncio.to_thread(self._segment_exists_sync, doc_id)
                indexed = (await asyncio.to_thread(self._fts.has_session, doc_id)
                           if self._fts else True)
                if exists and indexed:
                    continue
                vector = None
                if not exists and self._has_vec and embedder:
                    vector = await embedder.embed(text)
                missing.append((doc_id, text, channel_id, float(seg.get("end_ts", 0)),
                                int(seg.get("source_count", 0)), vector))
            await asyncio.to_thread(self._write_segment_archive_sync, archive_doc_id, missing)
            return True
        except Exception as e:
            log.error("Segment indexing failed for %s: %s", archive_doc_id, e)
            return False

    def _segment_exists_sync(self, doc_id: str) -> bool:
        return self._conn.execute(  # type: ignore[union-attr]
            "SELECT 1 FROM session_archives WHERE doc_id = ?", (doc_id,),
        ).fetchone() is not None

    def _write_segment_archive_sync(
        self, archive_doc_id: str,
        missing: list[tuple[str, str, str, float, int, list[float] | None]],
    ) -> None:
        """Commit all missing metadata, vectors, and completion in one transaction."""
        with self._write_lock:
            try:
                for doc_id, text, channel_id, end_ts, source_count, vector in missing:
                    self._conn.execute(  # type: ignore[union-attr]
                        "INSERT OR REPLACE INTO session_archives "
                        "(doc_id, content, channel_id, last_active, message_count) "
                        "VALUES (?, ?, ?, ?, ?)",
                        (doc_id, text, channel_id, end_ts, source_count),
                    )
                    if self._fts and not self._fts.index_session(
                            doc_id, text, channel_id, end_ts):
                        raise RuntimeError("FTS did not acknowledge segment indexing")
                    if vector is not None:
                        self._conn.execute(  # type: ignore[union-attr]
                            "DELETE FROM session_vec WHERE doc_id = ?", (doc_id,),
                        )
                        self._conn.execute(  # type: ignore[union-attr]
                            "INSERT INTO session_vec (doc_id, embedding) VALUES (?, ?)",
                            (doc_id, serialize_vector(vector)),
                        )
                self._conn.execute(  # type: ignore[union-attr]
                    "INSERT OR REPLACE INTO segment_index_state "
                    "(archive_doc_id, indexed_at) VALUES (?, strftime('%s','now'))",
                    (archive_doc_id,),
                )
                self._conn.commit()  # type: ignore[union-attr]
            except BaseException:
                self._conn.rollback()  # type: ignore[union-attr]
                raise

    @staticmethod
    def _read_archive_sync(archive_path: Path) -> dict:
        """Read and parse archive JSON (sync, for use with asyncio.to_thread)."""
        return json.loads(archive_path.read_text())

    def _write_session_sync(
        self,
        doc_id: str,
        doc_text: str,
        channel_id: str,
        last_active: float,
        message_count: int,
        vector: list[float] | None,
    ) -> None:
        """Write session metadata, FTS, and vector to database (sync).

        Serialized by ``_write_lock`` because callers reach this through the
        default thread pool. Metadata, FTS, and vector are one logical
        replacement: any failure rolls the connection back so a partial write
        can never be committed later by another writer on the shared
        connection.
        """
        # Only dispatched by callers that checked self.available first,
        # which requires _conn (and _fts where used) to be set.
        with self._write_lock:
            try:
                self._conn.execute(  # type: ignore[union-attr]
                    "INSERT OR REPLACE INTO session_archives "
                    "(doc_id, content, channel_id, last_active, message_count) "
                    "VALUES (?, ?, ?, ?, ?)",
                    (doc_id, doc_text, channel_id, last_active, message_count),
                )
                if self._fts:
                    self._fts.index_session(  # type: ignore[union-attr]
                        doc_id, doc_text, channel_id, last_active,
                    )
                if vector is not None:
                    vec_bytes = serialize_vector(vector)
                    # vec0 virtual tables do NOT honor INSERT OR REPLACE conflict
                    # resolution: re-inserting an existing doc_id raises "UNIQUE
                    # constraint failed on session_vec primary key" instead of
                    # replacing. Delete-then-insert makes re-indexing idempotent.
                    # (The backfill existence check is keyed on session_archives,
                    # so a doc_id present only in session_vec would otherwise
                    # error on every startup.)
                    self._conn.execute(  # type: ignore[union-attr]
                        "DELETE FROM session_vec WHERE doc_id = ?", (doc_id,)
                    )
                    self._conn.execute(  # type: ignore[union-attr]
                        "INSERT INTO session_vec (doc_id, embedding) VALUES (?, ?)",
                        (doc_id, vec_bytes),
                    )
                self._conn.commit()  # type: ignore[union-attr]
            except BaseException:
                # The replacement is atomic: do not leave a partially applied
                # write (or a pending DELETE) for a later writer to commit. A
                # rollback that cannot run (broken connection) must not mask
                # the original failure.
                try:
                    self._conn.rollback()  # type: ignore[union-attr]
                except Exception as rollback_exc:
                    log.error(
                        "Rollback failed after session index error for %s: %s",
                        doc_id, rollback_exc,
                    )
                raise

    async def search(self, query: str, embedder: LocalEmbedder, limit: int = 10) -> list[dict]:
        """Semantic search across archived sessions."""
        validate_search_query(query)
        if not self.available:
            raise SearchExecutionError("search failed: session store is unavailable")
        if not self._has_vec:
            raise SearchExecutionError("search failed: semantic session search is unavailable")

        vector = await embedder.embed(query)
        if vector is None:
            raise SearchExecutionError("search failed: query embedding was unavailable")

        vec_bytes = serialize_vector(vector)
        rows = await asyncio.to_thread(self._search_vec_sync, vec_bytes, limit)

        out = []
        for row in rows:
            distance = row[1]
            # Cosine distance: 0 = identical, higher = more different. Skip poor matches.
            if distance > 0.8:
                continue
            out.append({
                "doc_id": str(row[0]),
                "type": "semantic",
                "content": row[2][:500],
                "timestamp": float(row[4]),
                "channel_id": str(row[3]),
            })

        return out

    def _search_vec_sync(self, vec_bytes: bytes, limit: int) -> list:
        """Execute vector similarity search (sync, for use with asyncio.to_thread)."""
        # Caller (search) checks self.available first.
        return self._conn.execute(  # type: ignore[union-attr]
            """
            SELECT v.doc_id, v.distance, a.content, a.channel_id, a.last_active
            FROM session_vec v
            JOIN session_archives a ON a.doc_id = v.doc_id
            WHERE v.embedding MATCH ?
            AND k = ?
            ORDER BY v.distance
            """,
            (vec_bytes, limit),
        ).fetchall()

    async def backfill(self, archive_dir: Path, embedder: LocalEmbedder) -> int:
        """Index all archive JSONs not yet indexed. Returns count of newly indexed."""
        if not self.available:
            return 0
        if not archive_dir.exists():
            return 0

        # Get already-indexed IDs (blocking → offload)
        try:
            existing = await asyncio.to_thread(self._get_indexed_ids_sync)
        except Exception:
            existing = set()

        count = 0
        for path in sorted(archive_dir.glob("*.json")):
            doc_id = path.stem
            if doc_id in existing:
                continue
            if await self.index_session(path, embedder):
                count += 1

        # Backfill FTS5 for any sessions in SQLite but not in FTS (blocking → offload)
        if self._fts:
            await asyncio.to_thread(self._backfill_fts_sync, archive_dir)

        return count

    async def backfill_segments(self, archive_dir: Path, embedder: LocalEmbedder) -> int:
        """Bounded, single-flight legacy segment migration, one archive at a time."""
        if not self.available or not archive_dir.exists():
            return 0
        async with self._segment_backfill_lock:
            # The FTS table lives in another SQLite file. Its rows can go
            # missing even when the metadata/state transaction was committed
            # (e.g. restoring only one of the two databases). Repair from the
            # stored segment text, without rereading every archive on startup.
            await asyncio.to_thread(self._repair_segment_fts_sync)
            existing = await asyncio.to_thread(self._get_segment_state_sync)
            paths = await asyncio.to_thread(lambda: sorted(archive_dir.glob("*.json"))[:10000])
            count = 0
            bytes_read = 0
            for path in paths:
                if path.stem in existing:
                    continue
                try:
                    size = await asyncio.to_thread(lambda: path.stat().st_size)
                    if bytes_read + size > 2_000_000_000:
                        break
                    bytes_read += size
                    data = await asyncio.to_thread(self._read_archive_sync, path)
                    if await self._index_segments(data, path.stem, embedder):
                        count += 1
                except Exception as e:
                    log.warning("Skipping unreadable archive %s: %s", path, e)
                await asyncio.sleep(0)
            return count

    def _get_segment_state_sync(self) -> set[str]:
        return {row[0] for row in self._conn.execute(  # type: ignore[union-attr]
            "SELECT archive_doc_id FROM segment_index_state")}

    def _repair_segment_fts_sync(self) -> None:
        if not self._fts:
            return
        rows = self._conn.execute(  # type: ignore[union-attr]
            "SELECT doc_id, content, channel_id, last_active "
            "FROM session_archives WHERE doc_id LIKE 'seg:%'",
        ).fetchall()
        for doc_id, content, channel_id, end_ts in rows:
            if not self._fts.has_session(doc_id) and not self._fts.index_session(
                    doc_id, content, channel_id, end_ts):
                raise RuntimeError(f"FTS repair did not acknowledge {doc_id}")

    def _get_indexed_ids_sync(self) -> set[str]:
        """Get set of already-indexed doc IDs (sync)."""
        # Caller (backfill) checks self.available first.
        return {
            r[0] for r in
            self._conn.execute(  # type: ignore[union-attr]
                "SELECT doc_id FROM session_archives"
            ).fetchall()
        }

    def _backfill_fts_sync(self, archive_dir: Path) -> None:
        """Backfill FTS5 index from archive JSON files (sync)."""
        for path in sorted(archive_dir.glob("*.json")):
            doc_id = path.stem
            # Caller (backfill) only dispatches this inside "if self._fts:".
            if self._fts.has_session(doc_id):  # type: ignore[union-attr]
                continue
            try:
                data = json.loads(path.read_text())
                doc_text = self._build_document_text(data)
                if doc_text:
                    self._fts.index_session(  # type: ignore[union-attr]
                        doc_id, doc_text,
                        str(data.get("channel_id", "")),
                        float(data.get("last_active", 0)),
                    )
            except Exception:
                continue

    async def search_hybrid(
        self, query: str, embedder: LocalEmbedder | None, limit: int = 10,
    ) -> list[dict]:
        """Combined FTS5 + semantic search with Reciprocal Rank Fusion.

        Works in FTS-only mode when embedder is None or vector search unavailable.
        """
        validate_search_query(query)
        semantic_results = []
        searched = False
        if embedder and self._has_vec:
            semantic_results = await self.search(query, embedder, limit=limit * 2)
            searched = True

        fts_results = []
        if self._fts:
            fts_results = await asyncio.to_thread(
                self._fts.search_sessions, query, limit * 2,
            )
            searched = True

        if not searched:
            raise SearchExecutionError("search failed: no session search backend is available")
        if not semantic_results and not fts_results:
            return []

        return reciprocal_rank_fusion(
            semantic_results, fts_results, id_key="doc_id", limit=limit,
        )

    @staticmethod
    def _build_document_text(data: dict) -> str:
        """Build embeddable text from archive data."""
        parts = []

        summary = data.get("summary", "")
        if summary:
            parts.append(f"Summary: {summary}")

        messages = data.get("messages", [])
        for msg in messages[:MAX_MESSAGES_PER_DOC]:
            role = msg.get("role", "unknown")
            content = msg.get("content", "")[:MAX_MSG_CHARS]
            parts.append(f"{role}: {content}")

        return "\n".join(parts)
