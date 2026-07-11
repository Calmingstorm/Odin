"""Knowledge/history/audit-search native tool handlers (RFC-001 Phase 5b).

Verbatim moves from OdinBot. ``_knowledge_store`` is exposed as a property
over a provider callable because the bot's ``knowledge`` setter replaces
the store at runtime (reloads, tests) — a captured reference would go
stale. Other deps are constructed once and captured directly.
"""

from __future__ import annotations

from collections.abc import Callable

from ...llm.secret_scrubber import scrub_output_secrets
from ...odin_log import get_logger

log = get_logger("discord")


class KnowledgeTools:
    def __init__(self, *, sessions, get_knowledge_store: Callable, embedder, audit) -> None:
        self.sessions = sessions
        self.get_knowledge_store = get_knowledge_store
        self._embedder = embedder
        self.audit = audit

    @property
    def _knowledge_store(self):
        return self.get_knowledge_store()

    async def _handle_search_history(self, inp: dict) -> str:
        """Search past conversation history."""
        query = inp.get("query", "")
        limit = min(inp.get("limit", 10), 20)
        if not query:
            return "A search query is required."

        results = await self.sessions.search_history(query, limit=limit)
        if not results:
            return f"No past conversations found matching '{query}'."

        lines = []
        for r in results:
            from datetime import datetime

            ts = datetime.fromtimestamp(r["timestamp"]).strftime("%Y-%m-%d %H:%M")
            role = r["type"]
            content = r["content"].replace("\n", " ")[:300]
            lines.append(f"[{ts}] ({role}): {content}")

        return f"**Found {len(results)} result(s) for '{query}':**\n" + "\n".join(lines)

    async def _handle_search_knowledge(self, inp: dict) -> str:
        """Semantic + FTS search over the knowledge base."""
        if not self._knowledge_store:
            return "Knowledge base is not available (search not enabled or not initialized)."

        query = inp.get("query", "")
        limit = min(inp.get("limit", 5), 10)
        if not query:
            return "A search query is required."

        results = await self._knowledge_store.search_hybrid(query, self._embedder, limit=limit)
        if not results:
            return (
                f"No knowledge base results for '{query}'. "
                "Try web_search for external information."
            )

        lines = []
        for r in results:
            source = r["source"]
            score = r.get("score", r.get("rrf_score", r.get("rank", 0)))
            content = scrub_output_secrets(r["content"].replace("\n", " ")[:500])
            lines.append(f"**[{source}]** (score: {score})\n{content}")

        return f"**Found {len(results)} result(s) for '{query}':**\n\n" + "\n\n".join(lines)

    async def _handle_ingest_document(self, inp: dict, uploader: str) -> str:
        """Ingest a document into the knowledge base."""
        if not self._knowledge_store:
            return "Knowledge base is not available (search not enabled or not initialized)."

        source = inp.get("source", "")
        content = inp.get("content", "")
        if not source or not content:
            return "Both 'source' and 'content' are required."

        count = await self._knowledge_store.ingest(
            content=content,
            source=source,
            embedder=self._embedder,
            uploader=uploader,
        )
        if count == 0:
            return f"Failed to ingest '{source}' — no chunks could be indexed."
        return f"Ingested '{source}' into knowledge base ({count} chunks indexed)."

    async def _handle_bulk_ingest(self, inp: dict, uploader: str) -> str:
        """Bulk-import documents into the knowledge base."""
        if not self._knowledge_store:
            return "Knowledge base is not available."
        items = inp.get("items")
        if not items or not isinstance(items, list):
            return "Error: 'items' (array) is required."
        from ...knowledge.importer import BulkImporter

        importer = BulkImporter(self._knowledge_store, self._embedder)
        batch = await importer.import_batch(items, uploader=uploader)
        lines = [
            f"Bulk import: {batch.succeeded} succeeded, {batch.failed} failed, "
            f"{batch.skipped} skipped"
        ]
        for r in batch.results:
            tag = r["status"].upper()
            detail = f" ({r['chunks']} chunks)" if r["chunks"] else ""
            err = f" — {r['error']}" if r["error"] else ""
            lines.append(f"  [{tag}] {r['source']}{detail}{err}")
        return "\n".join(lines)

    def _handle_list_knowledge(self) -> str:
        """List all documents in the knowledge base."""
        if not self._knowledge_store:
            return "Knowledge base is not available."

        sources = self._knowledge_store.list_sources()
        if not sources:
            return "Knowledge base is empty. Use ingest_document to add documents."

        lines = []
        for s in sources:
            lines.append(
                f"- **{s['source']}** ({s['chunks']} chunks, by {s['uploader']}, "
                f"{s['ingested_at'][:10]})"
            )
        total = sum(s["chunks"] for s in sources)
        return (
            f"**Knowledge base: {len(sources)} document(s), {total} total chunks**\n"
            + "\n".join(lines)
        )

    async def _handle_delete_knowledge(self, inp: dict) -> str:
        """Delete a document from the knowledge base."""
        if not self._knowledge_store:
            return "Knowledge base is not available."

        source = inp.get("source", "")
        if not source:
            return "'source' is required."

        count = await self._knowledge_store.delete_source_async(source)
        if count == 0:
            return f"No document found with source '{source}'."
        return f"Deleted '{source}' from knowledge base ({count} chunks removed)."

    async def _handle_search_audit(self, inp: dict) -> str:
        """Search the audit log."""
        has_error = inp.get("has_error")
        if has_error is not None:
            has_error = bool(has_error)
        min_dur = inp.get("min_duration_ms")
        if min_dur is not None:
            min_dur = int(min_dur)
        results = await self.audit.search(
            tool_name=inp.get("tool_name"),
            user=inp.get("user"),
            host=inp.get("host"),
            keyword=inp.get("keyword"),
            date=inp.get("date"),
            status=inp.get("status"),
            has_error=has_error,
            min_duration_ms=min_dur,
            limit=min(inp.get("limit", 20), 50),
        )
        if not results:
            return "No audit log entries found matching the criteria."

        lines = []
        for entry in results:
            ts = entry.get("timestamp", "?")[:19]
            tool = entry.get("tool_name", "?")
            user = entry.get("user_name", "?")
            approved = "approved" if entry.get("approved") else "denied"
            elapsed = entry.get("execution_time_ms", 0)
            summary = entry.get("result_summary", "")[:200]
            err = entry.get("error")
            status = f"ERROR: {err}" if err else summary
            line = f"[{ts}] **{tool}** by {user} ({approved}, {elapsed}ms)\n  {status}"
            meta = entry.get("audit_metadata")
            if isinstance(meta, dict) and meta:
                # Structured record (e.g. which image backend actually ran).
                rendered = " ".join(f"{k}={v}" for k, v in meta.items())
                line += f"\n  [{rendered}]"
            lines.append(line)
        return f"**Audit log ({len(results)} entries):**\n" + "\n".join(lines)
