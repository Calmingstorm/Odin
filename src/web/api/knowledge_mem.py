"""Knowledge, memory-notes and learned-context route registrars (RFC-003 P3).

Carved verbatim from api/__init__.

Each ``register_*`` moves one section of the old monolith unchanged; the
composition root calls them at the sections' original positions, so the
route REGISTRATION ORDER (aiohttp path precedence) is exactly what the
parity contract pins.
"""

from __future__ import annotations

import asyncio

from aiohttp import web

from ...json_store import StoreCorruptError
from ...odin_log import get_logger
from ...search.errors import InvalidSearchQuery
from ..api_common import (
    _MAX_CONTENT_LEN,
    _MAX_NAME_LEN,
    _safe_int_param,
    _validate_string,
)

log = get_logger("web.api")

def register_knowledge(routes: web.RouteTableDef, bot) -> None:
    """Knowledge (verbatim from the monolith)."""
    # ------------------------------------------------------------------
    # Knowledge
    # ------------------------------------------------------------------

    @routes.get("/api/knowledge")
    async def list_knowledge(_request: web.Request) -> web.Response:
        store = bot.knowledge
        if not store or not store.available:
            return web.json_response({"error": "knowledge store not available"}, status=503)
        return web.json_response(await asyncio.to_thread(store.list_sources))

    @routes.post("/api/knowledge")
    async def ingest_knowledge(request: web.Request) -> web.Response:
        store = bot.knowledge
        if not store or not store.available:
            return web.json_response({"error": "knowledge store not available"}, status=503)
        data = await request.json()
        source = data.get("source", "").strip()
        content = data.get("content", "").strip()
        if not source or not content:
            return web.json_response(
                {"error": "source and content are required"}, status=400
            )
        for err in (
            _validate_string(source, "source", _MAX_NAME_LEN),
            _validate_string(content, "content", _MAX_CONTENT_LEN),
        ):
            if err:
                return web.json_response({"error": err}, status=400)
        chunks = await store.ingest(content, source, embedder=bot.embedder, uploader="web-api")
        if chunks <= 0:
            return web.json_response(
                {"error": "document was not durably ingested"}, status=500,
            )
        return web.json_response({"source": source, "chunks": chunks}, status=201)

    @routes.delete("/api/knowledge/{source}")
    async def delete_knowledge(request: web.Request) -> web.Response:
        store = bot.knowledge
        if not store or not store.available:
            return web.json_response({"error": "knowledge store not available"}, status=503)
        source = request.match_info["source"]
        deleted = await store.delete_source_async(source)
        if deleted == 0:
            return web.json_response({"error": "source not found"}, status=404)
        return web.json_response({"status": "deleted", "chunks_removed": deleted})

    @routes.post("/api/knowledge/{source}/reingest")
    async def reingest_knowledge(request: web.Request) -> web.Response:
        store = bot.knowledge
        if not store or not store.available:
            return web.json_response({"error": "knowledge store not available"}, status=503)
        source = request.match_info["source"]
        content = await asyncio.to_thread(store.get_source_content, source)
        if content is None:
            return web.json_response({"error": "source not found"}, status=404)
        chunks = await store.ingest(content, source, embedder=bot.embedder, uploader="web-reingest")
        if chunks <= 0:
            return web.json_response(
                {"error": "document was not durably reingested"}, status=500,
            )
        return web.json_response({"source": source, "chunks": chunks})

    @routes.get("/api/knowledge/search")
    async def search_knowledge(request: web.Request) -> web.Response:
        store = bot.knowledge
        if not store or not store.available:
            return web.json_response({"error": "knowledge store not available"}, status=503)
        query = request.query.get("q", "").strip()
        if not query:
            return web.json_response({"error": "q parameter required"}, status=400)
        try:
            limit = _safe_int_param(request, "limit", 10, hi=50)
        except ValueError:
            return web.json_response({"error": "limit must be an integer"}, status=400)
        try:
            results = await store.search_hybrid(query, embedder=bot.embedder, limit=limit)
        except InvalidSearchQuery:
            return web.json_response({"error": "invalid query"}, status=400)
        except Exception:
            log.exception("Knowledge search failed")
            return web.json_response({"error": "search failed"}, status=500)
        return web.json_response(results)

    @routes.get("/api/knowledge/{source}/chunks")
    async def list_knowledge_chunks(request: web.Request) -> web.Response:
        store = bot.knowledge
        if not store or not store.available:
            return web.json_response({"error": "knowledge store not available"}, status=503)
        source = request.match_info["source"]
        chunks = await asyncio.to_thread(store.get_source_chunks, source)
        if not chunks:
            return web.json_response({"error": "source not found or empty"}, status=404)
        return web.json_response(chunks)

    # Knowledge dedup
    # ------------------------------------------------------------------

    @routes.get("/api/knowledge/duplicates")
    async def list_knowledge_duplicates(_request: web.Request) -> web.Response:
        store = bot.knowledge
        if not store or not store.available:
            return web.json_response({"error": "knowledge store not available"}, status=503)
        exact = await asyncio.to_thread(store.find_duplicates)
        threshold = 0.5
        try:
            threshold = float(_request.query.get("threshold", "0.5"))
        except ValueError:
            pass
        near = await asyncio.to_thread(store.find_near_duplicates, threshold)
        return web.json_response({"exact": exact, "near": near})

    @routes.post("/api/knowledge/merge")
    async def merge_knowledge(request: web.Request) -> web.Response:
        store = bot.knowledge
        if not store or not store.available:
            return web.json_response({"error": "knowledge store not available"}, status=503)
        try:
            data = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON"}, status=400)
        keep = data.get("keep_source", "").strip()
        remove = data.get("remove_source", "").strip()
        if not keep or not remove:
            return web.json_response(
                {"error": "keep_source and remove_source are required"}, status=400
            )
        removed = await store.merge_sources_async(keep, remove)
        if removed == 0:
            return web.json_response(
                {"error": "keep_source not found or nothing to merge"}, status=404
            )
        return web.json_response(
            {"status": "merged", "kept": keep, "removed": remove, "chunks_removed": removed}
        )

    # Knowledge versioning
    # ------------------------------------------------------------------

    @routes.get("/api/knowledge/{source}/versions")
    async def list_knowledge_versions(request: web.Request) -> web.Response:
        store = bot.knowledge
        if not store or not store.available:
            return web.json_response({"error": "knowledge store not available"}, status=503)
        source = request.match_info["source"]
        versions = await asyncio.to_thread(store.get_versions, source)
        return web.json_response(versions)

    @routes.get("/api/knowledge/{source}/versions/{version:\\d+}")
    async def get_knowledge_version(request: web.Request) -> web.Response:
        store = bot.knowledge
        if not store or not store.available:
            return web.json_response({"error": "knowledge store not available"}, status=503)
        source = request.match_info["source"]
        version = int(request.match_info["version"])
        ver = await asyncio.to_thread(store.get_version, source, version)
        if not ver:
            return web.json_response({"error": "version not found"}, status=404)
        return web.json_response(ver)

    @routes.post("/api/knowledge/{source}/versions/{version:\\d+}/restore")
    async def restore_knowledge_version(request: web.Request) -> web.Response:
        store = bot.knowledge
        if not store or not store.available:
            return web.json_response({"error": "knowledge store not available"}, status=503)
        source = request.match_info["source"]
        version = int(request.match_info["version"])
        ver = await asyncio.to_thread(store.get_version, source, version)
        if not ver:
            return web.json_response({"error": "version not found"}, status=404)
        if not ver.get("content"):
            return web.json_response(
                {"error": "version has no content snapshot (delete version)"}, status=400
            )
        chunks = await store.restore_version(source, version, embedder=bot.embedder)
        if chunks <= 0:
            return web.json_response(
                {"error": "version was not durably restored"}, status=500,
            )
        return web.json_response(
            {"status": "restored", "source": source, "version": version, "chunks": chunks}
        )

    @routes.get("/api/knowledge/{source}/versions/{v1:\\d+}/diff/{v2:\\d+}")
    async def diff_knowledge_versions(request: web.Request) -> web.Response:
        store = bot.knowledge
        if not store or not store.available:
            return web.json_response({"error": "knowledge store not available"}, status=503)
        source = request.match_info["source"]
        v1 = int(request.match_info["v1"])
        v2 = int(request.match_info["v2"])
        diff = await asyncio.to_thread(store.get_version_diff, source, v1, v2)
        if not diff:
            return web.json_response({"error": "one or both versions not found"}, status=404)
        return web.json_response(diff)

    # Knowledge bulk import
    # ------------------------------------------------------------------

    @routes.post("/api/knowledge/import")
    async def import_knowledge(request: web.Request) -> web.Response:
        store = bot.knowledge
        if not store or not store.available:
            return web.json_response({"error": "knowledge store not available"}, status=503)
        try:
            data = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON"}, status=400)
        items = data.get("items")
        if not items or not isinstance(items, list):
            return web.json_response({"error": "items (array) is required"}, status=400)
        from ...knowledge.importer import BulkImporter
        importer = BulkImporter(store, bot.embedder)
        batch = await importer.import_batch(items, uploader="web-api")
        return web.json_response({
            "total": batch.total,
            "succeeded": batch.succeeded,
            "failed": batch.failed,
            "skipped": batch.skipped,
            "results": batch.results,
        })


def _memory_scope_guard(bot):
    """Deny a non-admin identity access to another user's memory scope.

    Memory is not under ADMIN_ONLY_PREFIXES, so before this every route here
    served any scope to any authenticated caller: a user-tier token could read
    (and write) `user_<someone-else>` outright. The per-key route made that
    tedious; a scope route would have made it one request.

    Non-admin callers get the shared `global` scope and their OWN `user_<id>`
    scope. Admin is unrestricted. A missing identity fails closed unless no
    auth is configured at all, matching ``admin_gate``.
    """

    def _auth_configured() -> bool:
        # Defensive throughout: a bot without a web config must not turn an
        # authorization check into a 500. Nothing configured means auth is
        # disabled wholesale, which is the documented dev-mode behaviour.
        web_cfg = getattr(getattr(bot, "config", None), "web", None)
        tm = getattr(bot, "api_token_manager", None)
        return bool(
            getattr(web_cfg, "api_token", "")
            or getattr(web_cfg, "api_tokens", None)
            or (tm and tm.list_tokens())
        )

    def _deny(request: web.Request, scope: str) -> web.Response | None:
        identity = getattr(request, "_api_identity", None)
        if identity is None:
            if _auth_configured():
                return web.json_response({"error": "memory access denied"}, status=403)
            return None  # dev mode: auth disabled wholesale
        if getattr(identity, "tier", "admin") == "admin":
            return None
        user_id = getattr(identity, "user_id", None)
        allowed = {"global"}
        if user_id:
            allowed.add(f"user_{user_id}")
        if scope not in allowed:
            return web.json_response({"error": "memory access denied"}, status=403)
        return None

    return _deny


def register_memory_notes(routes: web.RouteTableDef, bot) -> None:
    """Memory (persistent notes — global + per-user scopes) (verbatim from the monolith)."""
    # ------------------------------------------------------------------
    # Memory (persistent notes — global + per-user scopes)
    # ------------------------------------------------------------------

    corrupt_read = {"error": "memory store unavailable (corrupt)"}
    corrupt_write = {
        "error": "memory store is corrupt; refusing to modify (a backup was preserved)"
    }

    _deny_scope = _memory_scope_guard(bot)

    @routes.get("/api/memory")
    async def list_memory(request: web.Request) -> web.Response:
        # Authorize before loading so a missing identity in an authenticated
        # deployment fails closed even when the store has no scopes to filter.
        denied = _deny_scope(request, "global")
        if denied:
            return denied
        try:
            all_mem = await asyncio.to_thread(bot.tool_executor._load_all_memory)
        except StoreCorruptError:
            return web.json_response(corrupt_read, status=503)
        result = {}
        for scope, entries in all_mem.items():
            if _deny_scope(request, scope):
                continue
            result[scope] = {
                "keys": list(entries.keys()),
                "count": len(entries),
            }
        return web.json_response(result)

    @routes.get("/api/memory/{scope}")
    async def get_memory_scope(request: web.Request) -> web.Response:
        """Every key/value in one scope, in ONE request.

        The per-key route below loads the whole memory file to return a single
        value, so a scope with a few hundred keys cost that many requests AND
        that many full loads — enough for the WebUI to trip its own per-IP rate
        limit just by expanding a scope.
        """
        scope = request.match_info["scope"]
        denied = _deny_scope(request, scope)
        if denied:
            return denied
        try:
            all_mem = await asyncio.to_thread(bot.tool_executor._load_all_memory)
        except StoreCorruptError:
            return web.json_response(corrupt_read, status=503)
        if scope not in all_mem:
            return web.json_response({"error": "scope not found"}, status=404)
        return web.json_response({"scope": scope, "entries": all_mem[scope]})

    @routes.get("/api/memory/{scope}/{key}")
    async def get_memory(request: web.Request) -> web.Response:
        scope = request.match_info["scope"]
        key = request.match_info["key"]
        denied = _deny_scope(request, scope)
        if denied:
            return denied
        try:
            all_mem = await asyncio.to_thread(bot.tool_executor._load_all_memory)
        except StoreCorruptError:
            return web.json_response(corrupt_read, status=503)
        section = all_mem.get(scope, {})
        if key not in section:
            return web.json_response({"error": "key not found"}, status=404)
        return web.json_response({"scope": scope, "key": key, "value": section[key]})

    @routes.put("/api/memory/{scope}/{key}")
    async def set_memory(request: web.Request) -> web.Response:
        scope = request.match_info["scope"]
        key = request.match_info["key"]
        denied = _deny_scope(request, scope)
        if denied:
            return denied
        data = await request.json()
        value = data.get("value")
        if value is None:
            return web.json_response({"error": "value is required"}, status=400)
        # Serialize with the executor's memory lock so a WebUI write cannot
        # interleave with a tool-path write; refuse (never overwrite) on corrupt.
        async with bot.tool_executor._memory_lock:
            try:
                all_mem = await asyncio.to_thread(bot.tool_executor._load_all_memory)
            except StoreCorruptError:
                return web.json_response(corrupt_write, status=409)
            if scope not in all_mem:
                all_mem[scope] = {}
            all_mem[scope][key] = str(value)
            await asyncio.to_thread(bot.tool_executor._save_all_memory, all_mem)
        return web.json_response({"status": "saved", "scope": scope, "key": key})

    @routes.delete("/api/memory/{scope}/{key}")
    async def delete_memory(request: web.Request) -> web.Response:
        scope = request.match_info["scope"]
        key = request.match_info["key"]
        denied = _deny_scope(request, scope)
        if denied:
            return denied
        async with bot.tool_executor._memory_lock:
            try:
                all_mem = await asyncio.to_thread(bot.tool_executor._load_all_memory)
            except StoreCorruptError:
                return web.json_response(corrupt_write, status=409)
            section = all_mem.get(scope, {})
            if key not in section:
                return web.json_response({"error": "key not found"}, status=404)
            del all_mem[scope][key]
            await asyncio.to_thread(bot.tool_executor._save_all_memory, all_mem)
        return web.json_response({"status": "deleted", "scope": scope, "key": key})

    @routes.post("/api/memory/bulk-delete")
    async def bulk_delete_memory(request: web.Request) -> web.Response:
        try:
            data = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON"}, status=400)
        entries = data.get("entries", [])
        if not isinstance(entries, list) or not entries:
            return web.json_response(
                {"error": "entries must be a non-empty list of {scope, key}"}, status=400
            )
        validated_entries: list[tuple[str, str]] = []
        for entry in entries:
            if not isinstance(entry, dict):
                return web.json_response(
                    {"error": "each entry must contain a scope and key"}, status=400
                )
            scope = entry.get("scope")
            key = entry.get("key")
            if not isinstance(scope, str) or not scope or not isinstance(key, str) or not key:
                return web.json_response(
                    {"error": "each entry must contain a scope and key"}, status=400
                )
            denied = _deny_scope(request, scope)
            if denied:
                return denied
            validated_entries.append((scope, key))
        async with bot.tool_executor._memory_lock:
            try:
                all_mem = await asyncio.to_thread(bot.tool_executor._load_all_memory)
            except StoreCorruptError:
                return web.json_response(corrupt_write, status=409)
            deleted = 0
            for scope, key in validated_entries:
                if scope in all_mem and key in all_mem[scope]:
                    del all_mem[scope][key]
                    deleted += 1
            if deleted:
                await asyncio.to_thread(bot.tool_executor._save_all_memory, all_mem)
        return web.json_response({"status": "deleted", "count": deleted})


def register_learned_context(routes: web.RouteTableDef, bot) -> None:
    """Learned context (reflector) (verbatim from the monolith)."""
    # ------------------------------------------------------------------
    # Learned context (reflector)
    # ------------------------------------------------------------------

    @routes.get("/api/learned")
    async def list_learned(_request: web.Request) -> web.Response:
        entries = bot.reflector.get_all_entries()
        meta = bot.reflector.get_metadata()
        return web.json_response({"entries": entries, **meta})

    @routes.delete("/api/learned/{key}")
    async def delete_learned(request: web.Request) -> web.Response:
        key = request.match_info["key"]
        if await bot.reflector.delete_entry_async(key):
            return web.json_response({"status": "deleted", "key": key})
        return web.json_response({"error": "entry not found"}, status=404)

    @routes.put("/api/learned/{key}")
    async def update_learned(request: web.Request) -> web.Response:
        key = request.match_info["key"]
        try:
            data = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON body"}, status=400)
        if not isinstance(data, dict):
            return web.json_response({"error": "JSON body must be an object"}, status=400)
        supported = {"content", "category"}
        if not supported.intersection(data):
            return web.json_response(
                {"error": "content or category is required"}, status=400
            )
        content = data.get("content")
        category = data.get("category")
        # Presence is authoritative: explicit null is an invalid update, not an
        # omitted field. Refuse it before the reflector can bump updated_at.
        if "content" in data and not isinstance(content, str):
            return web.json_response({"error": "content must be a string"}, status=400)
        if "category" in data and not isinstance(category, str):
            return web.json_response({"error": "category must be a string"}, status=400)
        updated = await bot.reflector.update_entry_async(
            key, content=content, category=category
        )
        if updated:
            return web.json_response(updated)
        return web.json_response({"error": "entry not found"}, status=404)


