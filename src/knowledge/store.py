"""Knowledge base store — semantic search over ingested documents.

Uses SQLite + sqlite-vec for vector storage and FTS5 for keyword search.
Documents are chunked into ~500-token segments with overlap for better retrieval.
"""
from __future__ import annotations

import asyncio
import difflib
import hashlib
import re
import sqlite3
from datetime import datetime, timezone
from typing import TYPE_CHECKING

from ..odin_log import get_logger
from ..search.hybrid import reciprocal_rank_fusion
from ..search.sqlite_vec import load_extension, serialize_vector

if TYPE_CHECKING:
    from ..search.embedder import LocalEmbedder
    from ..search.fts import FullTextIndex

log = get_logger("knowledge")

CHUNK_SIZE = 1500  # chars per chunk (~375 tokens)
CHUNK_OVERLAP = 200  # overlap between chunks
VECTOR_DIM = 384  # must match LocalEmbedder.DIMENSIONS
NEAR_DUPE_THRESHOLD = 0.8  # chunk overlap ratio to consider near-duplicate


class KnowledgeStore:
    """Semantic search over ingested documents (runbooks, configs, READMEs, etc.)."""

    def __init__(self, db_path: str, fts_index: FullTextIndex | None = None) -> None:
        self._conn: sqlite3.Connection | None = None
        self._has_vec = False
        self._fts = fts_index
        # Odin's PR #18 self-audit finding #3: the shared SQLite
        # connection with ``check_same_thread=False`` was being hit by
        # concurrent writers from ``asyncio.to_thread`` call sites and
        # threw a stream of "bad parameter or other API misuse" errors
        # under load (proved by live stress test with 40 concurrent
        # ingests). Two-part fix:
        #  1. ``busy_timeout`` lets SQLite wait for contended locks
        #     instead of failing immediately.
        #  2. ``_write_lock`` serializes async writers (ingest, delete)
        #     so only one to_thread-wrapped write runs at a time.
        #     WAL mode still allows concurrent reads, so this doesn't
        #     hurt read latency.
        self._write_lock = asyncio.Lock()
        try:
            conn = sqlite3.connect(db_path, check_same_thread=False)
            conn.execute("PRAGMA journal_mode=WAL")
            # 30 seconds is generous but bounded — prevents indefinite
            # hangs while still absorbing typical contention windows.
            conn.execute("PRAGMA busy_timeout=30000")
            self._has_vec = load_extension(conn)
            if not self._has_vec:
                log.warning("sqlite-vec not available — vector search disabled, FTS-only mode")
            # Metadata table
            conn.execute("""
                CREATE TABLE IF NOT EXISTS knowledge_chunks (
                    chunk_id TEXT PRIMARY KEY,
                    content TEXT NOT NULL,
                    source TEXT NOT NULL,
                    chunk_index INTEGER NOT NULL,
                    total_chunks INTEGER NOT NULL,
                    uploader TEXT NOT NULL DEFAULT 'system',
                    ingested_at TEXT NOT NULL
                )
            """)
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_knowledge_source ON knowledge_chunks(source)"
            )
            # Dedup columns (schema migration for pre-existing DBs)
            for col, typedef in (
                ("content_hash", "TEXT"),
                ("doc_content_hash", "TEXT"),
            ):
                try:
                    conn.execute(
                        f"ALTER TABLE knowledge_chunks ADD COLUMN {col} {typedef}"
                    )
                except sqlite3.OperationalError:
                    pass  # column already exists
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_knowledge_content_hash "
                "ON knowledge_chunks(content_hash)"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_knowledge_doc_hash "
                "ON knowledge_chunks(doc_content_hash)"
            )
            # Version history table
            conn.execute("""
                CREATE TABLE IF NOT EXISTS knowledge_versions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    source TEXT NOT NULL,
                    version INTEGER NOT NULL,
                    content_hash TEXT NOT NULL DEFAULT '',
                    content TEXT,
                    chunk_count INTEGER NOT NULL DEFAULT 0,
                    uploader TEXT NOT NULL DEFAULT 'system',
                    action TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    diff_summary TEXT DEFAULT ''
                )
            """)
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_knowledge_versions_source "
                "ON knowledge_versions(source, version)"
            )
            # Vector table (only if sqlite-vec loaded)
            if self._has_vec:
                conn.execute(f"""
                    CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_vec USING vec0(
                        chunk_id TEXT PRIMARY KEY,
                        embedding float[{VECTOR_DIM}] distance_metric=cosine
                    )
                """)
            conn.commit()
            self._conn = conn
            count = self.count()
            log.info("Knowledge base initialized (%d chunks indexed)", count)
        except Exception as e:
            log.error("Knowledge base init failed: %s", e)

    @property
    def available(self) -> bool:
        return self._conn is not None

    def close(self) -> None:
        """Close the underlying SQLite connection (idempotent)."""
        if self._conn is not None:
            try:
                self._conn.close()
                log.info("Knowledge store connection closed")
            except Exception as exc:
                log.error("Error closing knowledge store: %s", exc)
            finally:
                self._conn = None

    def count(self) -> int:
        if not self._conn:
            return 0
        try:
            row = self._conn.execute("SELECT COUNT(*) FROM knowledge_chunks").fetchone()
            return row[0] if row else 0
        except Exception:
            return 0

    @staticmethod
    def _content_hash(text: str) -> str:
        """SHA-256 hash of normalised text (stripped, lowered)."""
        return hashlib.sha256(text.strip().lower().encode()).hexdigest()

    async def ingest(
        self,
        content: str,
        source: str,
        embedder: LocalEmbedder | None = None,
        *,
        uploader: str = "system",
        dedup: bool = True,
    ) -> int:
        """Ingest a document by chunking and embedding it.

        Returns the number of chunks indexed.  When *dedup* is True (default),
        exact-content duplicates are skipped and near-duplicates (>=80 %
        chunk-hash overlap) are skipped with a log warning.
        """
        if not self.available:
            return 0

        chunks = self._chunk_text(content)
        if not chunks:
            return 0

        doc_hash_id = hashlib.md5(source.encode()).hexdigest()[:8]
        doc_content_hash = self._content_hash(content)
        now = datetime.now().isoformat()

        if dedup:
            # --- exact duplicate check (full document) ---
            existing = await asyncio.to_thread(
                self._find_by_doc_hash, doc_content_hash
            )
            if existing:
                existing_source = existing[0]
                if existing_source == source:
                    log.info(
                        "Skipping ingest of '%s': content unchanged (hash=%s)",
                        source, doc_content_hash[:12],
                    )
                    return existing[1]  # existing chunk count
                log.info(
                    "Skipping ingest of '%s': identical content already "
                    "ingested as '%s' (hash=%s)",
                    source, existing_source, doc_content_hash[:12],
                )
                return 0

            # --- near-duplicate check (chunk-level overlap) ---
            chunk_hashes = [self._content_hash(c) for c in chunks]
            near_dup = await asyncio.to_thread(
                self._find_near_duplicate, chunk_hashes, source
            )
            if near_dup:
                log.warning(
                    "Skipping ingest of '%s': %.0f%% chunk overlap with "
                    "existing source '%s'",
                    source, near_dup[1] * 100, near_dup[0],
                )
                return 0

        # Capture old content for version diff
        old_content = await asyncio.to_thread(self.get_source_content, source)
        is_update = old_content is not None

        # Embed all chunks first (async, non-blocking — no DB state touched).
        vectors: list[list[float] | None] = []
        for chunk in chunks:
            if self._has_vec and embedder:
                vec = await embedder.embed(chunk)
                if vec is None:
                    log.warning("Failed to embed chunk %d of '%s'", len(vectors), source)
                vectors.append(vec)
            else:
                vectors.append(None)

        # Serialize ALL writes (delete + insert + version record) behind
        # the async write lock. Pre-PR #18 this section raced itself under
        # concurrent ingest and produced silent SQLite misuse errors.
        async with self._write_lock:
            # Remove any existing chunks for this source (blocking → offload)
            await asyncio.to_thread(self.delete_source, source, _record_version=False)

            # Batch write metadata + vectors to DB (blocking → offload)
            indexed = await asyncio.to_thread(
                self._write_chunks_sync, chunks, vectors, doc_hash_id, source,
                now, uploader, doc_content_hash,
            )

            # Record version
            action = "update" if is_update else "create"
            diff_summary = self._make_diff_summary(old_content, content)
            await asyncio.to_thread(
                self._record_version, source, doc_content_hash, content,
                indexed, uploader, action, diff_summary,
            )

        log.info("Ingested '%s': %d/%d chunks indexed", source, indexed, len(chunks))
        return indexed

    def _write_chunks_sync(
        self,
        chunks: list[str],
        vectors: list[list[float] | None],
        doc_hash: str,
        source: str,
        now: str,
        uploader: str,
        doc_content_hash: str = "",
    ) -> int:
        """Write chunk metadata, FTS entries, and vectors to database (sync)."""
        indexed = 0
        for i, chunk in enumerate(chunks):
            chunk_id = f"{doc_hash}_{i}"
            chunk_hash = self._content_hash(chunk)
            try:
                self._conn.execute(
                    "INSERT OR REPLACE INTO knowledge_chunks "
                    "(chunk_id, content, source, chunk_index, total_chunks, "
                    "uploader, ingested_at, content_hash, doc_content_hash) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (chunk_id, chunk, source, i, len(chunks), uploader, now,
                     chunk_hash, doc_content_hash),
                )
                if self._fts:
                    self._fts.index_knowledge_chunk(chunk_id, chunk, source, i)
                if vectors[i] is not None:
                    vec_bytes = serialize_vector(vectors[i])
                    self._conn.execute(
                        "INSERT OR REPLACE INTO knowledge_vec (chunk_id, embedding) VALUES (?, ?)",
                        (chunk_id, vec_bytes),
                    )
                indexed += 1
            except Exception as e:
                log.error("Failed to index chunk %d of '%s': %s", i, source, e)
        self._conn.commit()
        return indexed

    async def search(
        self,
        query: str,
        embedder: LocalEmbedder | None = None,
        limit: int = 5,
    ) -> list[dict]:
        """Semantic search across the knowledge base.

        Returns list of dicts with: content, source, score, chunk_index.
        """
        if not self.available or not self._has_vec or not embedder:
            return []

        vector = await embedder.embed(query)
        if vector is None:
            return []

        try:
            vec_bytes = serialize_vector(vector)
            rows = await asyncio.to_thread(self._search_vec_sync, vec_bytes, limit)
        except Exception as e:
            log.warning("Knowledge search failed: %s", e)
            return []

        out = []
        for row in rows:
            distance = row[1]
            # Cosine distance: 0 = identical, higher = more different. Skip poor matches.
            if distance > 0.8:
                continue
            out.append({
                "content": row[2],
                "source": row[3],
                "score": round(1 - distance, 3),  # Convert to similarity
                "chunk_index": row[4],
            })

        return out

    def _search_vec_sync(self, vec_bytes: bytes, limit: int) -> list:
        """Execute vector similarity search (sync, for use with asyncio.to_thread)."""
        return self._conn.execute(
            """
            SELECT v.chunk_id, v.distance, c.content, c.source, c.chunk_index
            FROM knowledge_vec v
            JOIN knowledge_chunks c ON c.chunk_id = v.chunk_id
            WHERE v.embedding MATCH ?
            AND k = ?
            ORDER BY v.distance
            """,
            (vec_bytes, limit),
        ).fetchall()

    def list_sources(self) -> list[dict]:
        """List all ingested document sources with metadata."""
        if not self.available:
            return []

        try:
            rows = self._conn.execute(
                """
                SELECT source, COUNT(*) as chunks, uploader,
                       MAX(ingested_at) as ingested_at,
                       doc_content_hash
                FROM knowledge_chunks
                GROUP BY source
                ORDER BY source
                """
            ).fetchall()
        except Exception:
            return []

        results = []
        for r in rows:
            entry: dict = {
                "source": r[0],
                "chunks": r[1],
                "uploader": r[2],
                "ingested_at": r[3],
                "content_hash": r[4] or "",
            }
            # Add preview from first chunk
            try:
                first = self._conn.execute(
                    "SELECT content FROM knowledge_chunks WHERE source = ? ORDER BY chunk_index LIMIT 1",
                    (r[0],),
                ).fetchone()
                if first and first[0]:
                    text = first[0][:200]
                    if len(first[0]) > 200:
                        text += "..."
                    entry["preview"] = text
            except Exception:
                pass
            results.append(entry)
        return results

    def get_source_chunks(self, source: str) -> list[dict]:
        """Get all chunks for a source with metadata for the chunk browser."""
        if not self.available:
            return []
        try:
            rows = self._conn.execute(
                "SELECT chunk_id, content, chunk_index, total_chunks, ingested_at "
                "FROM knowledge_chunks WHERE source = ? ORDER BY chunk_index",
                (source,),
            ).fetchall()
            return [
                {
                    "chunk_id": r[0],
                    "content": r[1],
                    "chunk_index": r[2],
                    "total_chunks": r[3],
                    "ingested_at": r[4],
                    "char_count": len(r[1]) if r[1] else 0,
                }
                for r in rows
            ]
        except Exception:
            return []

    def get_source_content(self, source: str) -> str | None:
        """Get the full concatenated content of a source (for re-ingest)."""
        if not self.available:
            return None
        try:
            rows = self._conn.execute(
                "SELECT content FROM knowledge_chunks WHERE source = ? ORDER BY chunk_index",
                (source,),
            ).fetchall()
            if not rows:
                return None
            return "\n\n".join(r[0] for r in rows)
        except Exception:
            return None

    def delete_source(self, source: str, *, _record_version: bool = True) -> int:
        """Delete all chunks for a document source. Returns count deleted."""
        if not self.available:
            return 0

        try:
            # Get chunk IDs for this source
            ids = [
                r[0] for r in
                self._conn.execute(
                    "SELECT chunk_id FROM knowledge_chunks WHERE source = ?", (source,)
                ).fetchall()
            ]
            if not ids:
                return 0

            # Record version before deleting content
            if _record_version:
                content = self.get_source_content(source)
                content_hash = self._content_hash(content) if content else ""
                self._record_version(
                    source, content_hash, None, 0, "system", "delete", "deleted",
                )

            # Delete from vector table
            if self._has_vec:
                for chunk_id in ids:
                    self._conn.execute(
                        "DELETE FROM knowledge_vec WHERE chunk_id = ?", (chunk_id,)
                    )
            # Delete from chunks table
            self._conn.execute(
                "DELETE FROM knowledge_chunks WHERE source = ?", (source,)
            )
            self._conn.commit()
            # Delete from FTS
            if self._fts:
                self._fts.delete_knowledge_source(source)
            log.info("Deleted %d chunks for source '%s'", len(ids), source)
            return len(ids)
        except Exception as e:
            log.error("Failed to delete source '%s': %s", source, e)
        return 0

    async def search_hybrid(
        self, query: str, embedder: LocalEmbedder | None = None, limit: int = 5,
    ) -> list[dict]:
        """Combined FTS5 + semantic search with Reciprocal Rank Fusion.

        Works in FTS-only mode when embedder is None or vector search unavailable.
        """
        semantic_results = []
        if embedder:
            semantic_results = await self.search(query, embedder, limit=limit * 2)
        fts_results = []
        if self._fts:
            fts_results = await asyncio.to_thread(
                self._fts.search_knowledge, query, limit * 2,
            )

        if not semantic_results and not fts_results:
            return []

        # Normalize semantic results to use chunk_id
        for r in semantic_results:
            if "chunk_id" not in r:
                r["chunk_id"] = f"{r.get('source', '')}_{r.get('chunk_index', 0)}"

        return reciprocal_rank_fusion(
            semantic_results, fts_results, id_key="chunk_id", limit=limit,
        )

    def backfill_fts(self) -> int:
        """Index existing knowledge chunks into FTS5. Returns count indexed."""
        if not self._fts or not self.available:
            return 0
        try:
            rows = self._conn.execute(
                "SELECT chunk_id, content, source, chunk_index FROM knowledge_chunks"
            ).fetchall()
        except Exception:
            return 0

        count = 0
        for row in rows:
            chunk_id, content, source, chunk_index = row
            if self._fts.has_knowledge_chunk(chunk_id):
                continue
            if content:
                self._fts.index_knowledge_chunk(chunk_id, content, source, chunk_index)
                count += 1
        return count

    # ------------------------------------------------------------------
    # Deduplication helpers
    # ------------------------------------------------------------------

    def _find_by_doc_hash(self, doc_content_hash: str) -> tuple[str, int] | None:
        """Return (source, chunk_count) if *doc_content_hash* already stored."""
        if not self._conn:
            return None
        try:
            row = self._conn.execute(
                "SELECT source, COUNT(*) FROM knowledge_chunks "
                "WHERE doc_content_hash = ? GROUP BY source LIMIT 1",
                (doc_content_hash,),
            ).fetchone()
            return (row[0], row[1]) if row else None
        except Exception:
            return None

    def _find_near_duplicate(
        self,
        chunk_hashes: list[str],
        exclude_source: str,
        threshold: float = NEAR_DUPE_THRESHOLD,
    ) -> tuple[str, float] | None:
        """Return (source, overlap_ratio) if any existing source shares
        >= *threshold* of its chunk hashes with *chunk_hashes*."""
        if not self._conn or not chunk_hashes:
            return None
        try:
            placeholders = ",".join("?" * len(chunk_hashes))
            rows = self._conn.execute(
                f"SELECT source, COUNT(*) FROM knowledge_chunks "
                f"WHERE content_hash IN ({placeholders}) AND source != ? "
                f"GROUP BY source",
                (*chunk_hashes, exclude_source),
            ).fetchall()
            for src, match_count in rows:
                ratio = match_count / len(chunk_hashes)
                if ratio >= threshold:
                    return (src, ratio)
        except Exception:
            pass
        return None

    def find_duplicates(self) -> list[dict]:
        """Scan the store for groups of sources with identical doc_content_hash."""
        if not self.available:
            return []
        try:
            rows = self._conn.execute(
                "SELECT doc_content_hash, GROUP_CONCAT(DISTINCT source) as sources, "
                "COUNT(DISTINCT source) as src_count "
                "FROM knowledge_chunks "
                "WHERE doc_content_hash IS NOT NULL AND doc_content_hash != '' "
                "GROUP BY doc_content_hash HAVING src_count > 1"
            ).fetchall()
            return [
                {
                    "content_hash": r[0],
                    "sources": r[1].split(","),
                    "source_count": r[2],
                }
                for r in rows
            ]
        except Exception:
            return []

    def find_near_duplicates(
        self, threshold: float = 0.5,
    ) -> list[dict]:
        """Find source pairs sharing more than *threshold* of chunk hashes.

        Returns list of dicts with: source_a, source_b, shared_chunks,
        total_a, total_b, overlap_ratio.
        """
        if not self.available:
            return []
        try:
            sources = self._conn.execute(
                "SELECT DISTINCT source FROM knowledge_chunks "
                "WHERE content_hash IS NOT NULL AND content_hash != ''"
            ).fetchall()
            source_list = [r[0] for r in sources]
        except Exception:
            return []

        # Build per-source hash sets
        hash_sets: dict[str, set[str]] = {}
        for src in source_list:
            try:
                rows = self._conn.execute(
                    "SELECT content_hash FROM knowledge_chunks "
                    "WHERE source = ? AND content_hash IS NOT NULL",
                    (src,),
                ).fetchall()
                hash_sets[src] = {r[0] for r in rows}
            except Exception:
                continue

        results: list[dict] = []
        seen: set[tuple[str, str]] = set()
        for i, src_a in enumerate(source_list):
            set_a = hash_sets.get(src_a)
            if not set_a:
                continue
            for src_b in source_list[i + 1:]:
                if (src_a, src_b) in seen:
                    continue
                seen.add((src_a, src_b))
                set_b = hash_sets.get(src_b)
                if not set_b:
                    continue
                shared = len(set_a & set_b)
                if shared == 0:
                    continue
                min_len = min(len(set_a), len(set_b))
                ratio = shared / min_len if min_len else 0
                if ratio >= threshold:
                    results.append({
                        "source_a": src_a,
                        "source_b": src_b,
                        "shared_chunks": shared,
                        "total_a": len(set_a),
                        "total_b": len(set_b),
                        "overlap_ratio": round(ratio, 3),
                    })
        return results

    def merge_sources(self, keep_source: str, remove_source: str) -> int:
        """Merge *remove_source* into *keep_source*: delete remove_source chunks.

        Returns number of chunks removed.
        """
        if not self.available or keep_source == remove_source:
            return 0
        keep_exists = self._conn.execute(
            "SELECT 1 FROM knowledge_chunks WHERE source = ? LIMIT 1",
            (keep_source,),
        ).fetchone()
        if not keep_exists:
            return 0
        return self.delete_source(remove_source)

    # ------------------------------------------------------------------
    # Version history
    # ------------------------------------------------------------------

    def _next_version(self, source: str) -> int:
        """Return the next version number for *source*."""
        row = self._conn.execute(
            "SELECT MAX(version) FROM knowledge_versions WHERE source = ?",
            (source,),
        ).fetchone()
        return (row[0] or 0) + 1

    def _record_version(
        self,
        source: str,
        content_hash: str,
        content: str | None,
        chunk_count: int,
        uploader: str,
        action: str,
        diff_summary: str = "",
    ) -> int:
        """Record a version entry. Returns the version number."""
        if not self._conn:
            return 0
        try:
            version = self._next_version(source)
            now = datetime.now(timezone.utc).isoformat()
            self._conn.execute(
                "INSERT INTO knowledge_versions "
                "(source, version, content_hash, content, chunk_count, "
                "uploader, action, created_at, diff_summary) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (source, version, content_hash, content, chunk_count,
                 uploader, action, now, diff_summary),
            )
            self._conn.commit()
            return version
        except Exception as e:
            log.error("Failed to record version for '%s': %s", source, e)
            return 0

    def _make_diff_summary(self, old_content: str | None, new_content: str | None) -> str:
        """Generate a human-readable diff summary between two content versions."""
        if old_content is None:
            return "initial version"
        if new_content is None:
            return "deleted"
        old_lines = old_content.splitlines(keepends=True)
        new_lines = new_content.splitlines(keepends=True)
        diff = list(difflib.unified_diff(old_lines, new_lines, n=0))
        added = sum(1 for l in diff if l.startswith("+") and not l.startswith("+++"))
        removed = sum(1 for l in diff if l.startswith("-") and not l.startswith("---"))
        if added == 0 and removed == 0:
            return "no content changes"
        parts = []
        if added:
            parts.append(f"+{added} lines")
        if removed:
            parts.append(f"-{removed} lines")
        return ", ".join(parts)

    def get_versions(self, source: str) -> list[dict]:
        """Return version history for *source* (without content)."""
        if not self.available:
            return []
        try:
            rows = self._conn.execute(
                "SELECT id, version, content_hash, chunk_count, uploader, "
                "action, created_at, diff_summary "
                "FROM knowledge_versions WHERE source = ? ORDER BY version DESC",
                (source,),
            ).fetchall()
            return [
                {
                    "id": r[0],
                    "version": r[1],
                    "content_hash": r[2],
                    "chunk_count": r[3],
                    "uploader": r[4],
                    "action": r[5],
                    "created_at": r[6],
                    "diff_summary": r[7] or "",
                }
                for r in rows
            ]
        except Exception:
            return []

    def get_version(self, source: str, version: int) -> dict | None:
        """Return a specific version including content snapshot."""
        if not self.available:
            return None
        try:
            row = self._conn.execute(
                "SELECT id, version, content_hash, content, chunk_count, "
                "uploader, action, created_at, diff_summary "
                "FROM knowledge_versions WHERE source = ? AND version = ?",
                (source, version),
            ).fetchone()
            if not row:
                return None
            return {
                "id": row[0],
                "version": row[1],
                "content_hash": row[2],
                "content": row[3],
                "chunk_count": row[4],
                "uploader": row[5],
                "action": row[6],
                "created_at": row[7],
                "diff_summary": row[8] or "",
            }
        except Exception:
            return None

    def get_version_diff(self, source: str, v1: int, v2: int) -> dict | None:
        """Compute a unified diff between two versions of *source*."""
        ver1 = self.get_version(source, v1)
        ver2 = self.get_version(source, v2)
        if not ver1 or not ver2:
            return None
        old_content = ver1.get("content") or ""
        new_content = ver2.get("content") or ""
        old_lines = old_content.splitlines(keepends=True)
        new_lines = new_content.splitlines(keepends=True)
        diff_lines = list(difflib.unified_diff(
            old_lines, new_lines,
            fromfile=f"v{v1}", tofile=f"v{v2}",
        ))
        added = sum(1 for l in diff_lines if l.startswith("+") and not l.startswith("+++"))
        removed = sum(1 for l in diff_lines if l.startswith("-") and not l.startswith("---"))
        return {
            "source": source,
            "from_version": v1,
            "to_version": v2,
            "diff": "".join(diff_lines),
            "lines_added": added,
            "lines_removed": removed,
            "from_hash": ver1.get("content_hash", ""),
            "to_hash": ver2.get("content_hash", ""),
        }

    async def restore_version(
        self,
        source: str,
        version: int,
        embedder: "LocalEmbedder | None" = None,
    ) -> int:
        """Restore a previous version by re-ingesting its content snapshot.

        Returns chunk count of the restored version, or 0 on failure.
        """
        ver = await asyncio.to_thread(self.get_version, source, version)
        if not ver or not ver.get("content"):
            return 0
        return await self.ingest(
            ver["content"], source, embedder=embedder,
            uploader=f"restore-v{version}", dedup=False,
        )

    @staticmethod
    def _chunk_text(text: str) -> list[str]:
        """Split text into overlapping chunks for embedding."""
        text = text.strip()
        if not text:
            return []

        # If short enough, return as single chunk
        if len(text) <= CHUNK_SIZE:
            return [text]

        chunks = []
        # Try to split on paragraph boundaries first
        paragraphs = re.split(r"\n\n+", text)

        current_chunk = ""
        for para in paragraphs:
            if len(current_chunk) + len(para) + 2 <= CHUNK_SIZE:
                current_chunk = f"{current_chunk}\n\n{para}" if current_chunk else para
            else:
                if current_chunk:
                    chunks.append(current_chunk.strip())
                # If a single paragraph is longer than chunk size, split it
                if len(para) > CHUNK_SIZE:
                    words = para.split()
                    current_chunk = ""
                    for word in words:
                        if len(current_chunk) + len(word) + 1 <= CHUNK_SIZE:
                            current_chunk = f"{current_chunk} {word}" if current_chunk else word
                        else:
                            chunks.append(current_chunk.strip())
                            # Overlap: keep last portion
                            overlap_start = max(0, len(current_chunk) - CHUNK_OVERLAP)
                            current_chunk = current_chunk[overlap_start:] + " " + word
                else:
                    current_chunk = para

        if current_chunk.strip():
            chunks.append(current_chunk.strip())

        return chunks
