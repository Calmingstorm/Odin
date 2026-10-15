"""Knowledge/history/audit-search native tool handlers (RFC-001 Phase 5b).

Verbatim moves from OdinBot. ``_knowledge_store`` is exposed as a property
over a provider callable because the bot's ``knowledge`` setter replaces
the store at runtime (reloads, tests) — a captured reference would go
stale. Other deps are constructed once and captured directly.
"""

from __future__ import annotations

import asyncio
from collections.abc import Callable

from ...llm.secret_scrubber import scrub_output_secrets
from ...odin_log import get_logger
from ...search.errors import InvalidSearchQuery
from ...tools.execution_outcome import ToolFailure
from ...tools.output_delivery import RankedOutput

log = get_logger("discord")


class KnowledgeTools:
    def __init__(self, *, sessions, get_knowledge_store: Callable, embedder, audit,
                 get_channel: Callable | None = None) -> None:
        self.sessions = sessions
        self.get_knowledge_store = get_knowledge_store
        self._embedder = embedder
        self.audit = audit
        self.get_channel = get_channel

    @property
    def _knowledge_store(self):
        return self.get_knowledge_store()

    async def _handle_search_history_message(self, message, inp: dict) -> str:
        """Transport adapter keeps request identity out of model-supplied input."""
        return await self._handle_search_history(inp, message=message)

    async def _handle_search_history(self, inp: dict, message=None) -> str:
        """Search past conversation history."""
        query = inp.get("query", "")
        limit = min(inp.get("limit", 10), 20)
        if not query:
            return ToolFailure("A search query is required.")

        try:
            exclusion = {}
            if message is not None:
                exclusion["exclude_message"] = (str(message.channel.id), str(message.id))
            results = await self.sessions.search_history(query, limit=limit, **exclusion)
        except InvalidSearchQuery:
            return ToolFailure("Invalid query: unsupported character.")
        except Exception:
            log.exception("History search failed")
            return ToolFailure("Search failed while searching conversation history.")
        if not results:
            return f"No past conversations found matching '{query}'."

        lines = []
        matches = []
        for r in results:
            from datetime import datetime

            ts = datetime.fromtimestamp(r["timestamp"]).strftime("%Y-%m-%d %H:%M")
            role = r["type"]
            cid = str(r.get("channel_id", "unknown"))
            channel = self.get_channel(int(cid)) if self.get_channel and cid.isdecimal() else None
            name = r.get("channel_name")
            is_dm = r.get("is_dm")
            if channel is not None:
                is_dm = getattr(channel, "guild", None) is None
                if is_dm:
                    recipient = getattr(channel, "recipient", None)
                    name = f"DM with {recipient}" if recipient else getattr(channel, "name", "DM")
                else:
                    name = getattr(channel, "name", name)
            if is_dm and not (name or "").startswith("DM"):
                name = f"DM with {name}" if name else "DM"
            location = f"{name or 'Unknown channel'} (id: {cid})"
            content = r["content"].replace("\n", " ")[:300]
            lines.append(f"[{ts}] [{location}] ({role}): {content}")
            matches.append(f"[{ts}] [{location}] ({role}): {r['content']}")

        formatted = f"**Found {len(results)} result(s) for '{query}':**\n" + "\n".join(lines)
        return RankedOutput(
            formatted, matches=tuple(matches),
            recovery_required=any(len(r["content"]) > 300 for r in results),
        )

    async def _handle_search_knowledge(self, inp: dict) -> str:
        """Semantic + FTS search over the knowledge base."""
        if not self._knowledge_store:
            return ToolFailure(
                "Knowledge base is not available (search not enabled or not initialized)."
            )

        query = inp.get("query", "")
        limit = min(inp.get("limit", 5), 10)
        if not query:
            return ToolFailure("A search query is required.")

        try:
            results = await self._knowledge_store.search_hybrid(
                query, self._embedder, limit=limit
            )
        except InvalidSearchQuery:
            return ToolFailure("Invalid query: unsupported character.")
        except Exception:
            log.exception("Knowledge search failed")
            return ToolFailure("Search failed while searching the knowledge base.")
        if not results:
            return (
                f"No knowledge base results for '{query}'. "
                "Try web_search for external information."
            )

        lines = []
        matches = []
        for r in results:
            source = r["source"]
            score = r.get("score", r.get("rrf_score", r.get("rank", 0)))
            content = scrub_output_secrets(r["content"].replace("\n", " ")[:500])
            lines.append(f"**[{source}]** (score: {score})\n{content}")
            matches.append(f"**[{source}]** (score: {score})\n{r['content']}")

        formatted = f"**Found {len(results)} result(s) for '{query}':**\n\n" + "\n\n".join(lines)
        return RankedOutput(
            formatted, matches=tuple(matches),
            recovery_required=any(len(r["content"]) > 500 for r in results),
        )

    async def _handle_ingest_document(self, inp: dict, uploader: str) -> str:
        """Ingest a document into the knowledge base."""
        if not self._knowledge_store:
            return ToolFailure(
                "Knowledge base is not available (search not enabled or not initialized)."
            )

        source = inp.get("source", "")
        content = inp.get("content", "")
        if not source or not content:
            return ToolFailure("Both 'source' and 'content' are required.")

        count = await self._knowledge_store.ingest(
            content=content,
            source=source,
            embedder=self._embedder,
            uploader=uploader,
        )
        outcome = getattr(count, "status", "")
        if outcome == "unchanged":
            return f"'{source}' already stored, unchanged ({int(count)} chunks)."
        if outcome == "duplicate":
            existing = getattr(count, "duplicate_of", "")
            detail = f" under '{existing}'" if existing else " under another source"
            return (
                f"'{source}' was not ingested: identical content is already stored"
                f"{detail}; no new source was created."
            )
        if outcome == "conflict":
            existing = getattr(count, "duplicate_of", "")
            detail = f" with '{existing}'" if existing else " with existing knowledge"
            return ToolFailure(
                f"'{source}' was not ingested: near-duplicate content conflicts"
                f"{detail}; the new content was not stored."
            )
        if outcome == "failure" or count <= 0:
            return ToolFailure(f"Failed to ingest '{source}' — no chunks could be indexed.")
        return f"Ingested '{source}' into knowledge base ({count} chunks indexed)."

    async def _handle_bulk_ingest(self, inp: dict, uploader: str) -> str:
        """Bulk-import documents into the knowledge base."""
        if not self._knowledge_store:
            return ToolFailure("Knowledge base is not available.")
        items = inp.get("items")
        if not items or not isinstance(items, list):
            return ToolFailure("Error: 'items' (array) is required.")
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
            note = r["error"] or r.get("note", "")
            suffix = f" — {note}" if note else ""
            lines.append(f"  [{tag}] {r['source']}{detail}{suffix}")
        text = "\n".join(lines)
        return ToolFailure(text) if batch.failed else text

    async def _handle_list_knowledge(self) -> str:
        """List all documents in the knowledge base."""
        if not self._knowledge_store:
            return ToolFailure("Knowledge base is not available.")

        # The store's connection lock may be held by a worker thread's write.
        sources = await asyncio.to_thread(self._knowledge_store.list_sources)
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
            return ToolFailure("Knowledge base is not available.")

        source = inp.get("source", "")
        if not source:
            return ToolFailure("'source' is required.")

        count = await self._knowledge_store.delete_source_async(source)
        if count == 0:
            return ToolFailure(f"No document found with source '{source}'.")
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
            include_agent_events=False,
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
            if entry.get("agent_id"):
                import json

                attribution = {
                    key: entry[key] for key in (
                        "agent_id", "agent_label", "parent_agent_id", "root_agent_id",
                        "originating_turn_id", "iteration", "call_id", "status",
                    ) if key in entry
                }
                line += "\n  attribution=" + json.dumps(attribution, ensure_ascii=True)
                line += "\n  tool_input=" + json.dumps(
                    entry.get("tool_input", {}), ensure_ascii=True,
                )
            meta = entry.get("audit_metadata")
            if isinstance(meta, dict) and meta:
                # Structured record (e.g. which image backend actually ran).
                rendered = " ".join(f"{k}={v}" for k, v in meta.items())
                line += f"\n  [{rendered}]"
            lines.append(line)
        return f"**Audit log ({len(results)} entries):**\n" + "\n".join(lines)
