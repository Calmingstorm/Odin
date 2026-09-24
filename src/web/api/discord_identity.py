"""Authenticated, bounded-cache Discord identity lookup by snowflake."""

from __future__ import annotations

import asyncio
import re
import time

from aiohttp import web

from ..api_common import admin_gate

_SNOWFLAKE = re.compile(r"^\d{15,25}$")
_CACHE_TTL = 3600
_CACHE_MAX = 512


def register_discord_identity(routes: web.RouteTableDef, bot) -> None:
    cache: dict[str, tuple[float, dict | None]] = {}
    lock = asyncio.Lock()
    require_admin = admin_gate(bot)

    @routes.get("/api/discord/users/{user_id}")
    async def discord_user(request: web.Request) -> web.Response:
        denied = require_admin(request)
        if denied:
            return denied
        user_id = request.match_info["user_id"]
        if not _SNOWFLAKE.fullmatch(user_id):
            return web.json_response({"error": "invalid Discord user ID"}, status=400)
        now = time.monotonic()
        async with lock:
            cached = cache.get(user_id)
            if cached and now - cached[0] < _CACHE_TTL:
                return web.json_response({"user": cached[1]})
            if len(cache) >= _CACHE_MAX and user_id not in cache:
                oldest = min(cache, key=lambda key: cache[key][0])
                cache.pop(oldest, None)
            try:
                user = await bot.fetch_user(int(user_id))
            except Exception:
                # Negative-cache failed lookups briefly to avoid hammering Discord.
                cache[user_id] = (now, None)
                return web.json_response({"user": None})
            result = {
                "id": str(user.id),
                "username": str(user.name),
                "display_name": str(getattr(user, "global_name", None) or user.name),
                "avatar_url": str(user.display_avatar.url) if user.display_avatar else None,
                "bot": bool(user.bot),
            }
            cache[user_id] = (now, result)
            return web.json_response({"user": result})
