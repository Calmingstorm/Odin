"""Turn-state and capacity-breaker posture routes (deep-dive W3, read-only v1).

Both routes are strictly observational: no resume, resolve, retry, reject,
sweep, or delete surface exists here, and the turn snapshot is produced by a
dedicated ``mode=ro`` reader that can never contend the store's write path
(src/turn_state/observer.py). Admin-only twice over — the central
``ADMIN_ONLY_PREFIXES`` entry plus the route-local gate below.

Availability is honest and per-route: ``not_enabled`` when the subsystem was
never constructed (200 with an empty shape — absence is a configuration
fact, not an error), ``unavailable`` (503) when it exists but the read
failed, ``available`` otherwise.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime

from aiohttp import web

from ...odin_log import get_logger
from ..api_common import admin_gate

log = get_logger("web.turn_state")

_TURNS_DEFAULT_LIMIT = 100
_TURNS_MAX_LIMIT = 200
_SCHEMA_VERSION = 1


def _observed_at() -> str:
    return datetime.now(UTC).isoformat()


def _envelope(availability: str, data: dict | None = None, **extra) -> dict:
    body = {
        "schema_version": _SCHEMA_VERSION,
        "availability": availability,
        "observed_at": _observed_at(),
        "data": data if data is not None else {},
    }
    body.update(extra)
    return body


def register_turn_state(routes: web.RouteTableDef, bot) -> None:
    """Read-only posture over durable turns and model capacity breakers."""

    _require_admin = admin_gate(bot)

    def _services():
        return getattr(bot, "services", None)

    @routes.get("/api/turn-state/turns")
    async def get_turn_state_turns(request: web.Request) -> web.Response:
        denied = _require_admin(request)
        if denied:
            return denied
        configured_enabled = bool(
            getattr(getattr(bot.config, "turn_state", None), "enabled", False)
        )
        store = getattr(_services(), "turn_store", None)
        if store is None:
            return web.json_response(_envelope(
                "not_enabled", configured_enabled=configured_enabled,
            ))
        try:
            limit = int(request.query.get("limit", str(_TURNS_DEFAULT_LIMIT)))
        except ValueError:
            limit = _TURNS_DEFAULT_LIMIT
        limit = max(1, min(limit, _TURNS_MAX_LIMIT))
        from ...turn_state.observer import read_turn_snapshot
        try:
            data = await asyncio.to_thread(read_turn_snapshot, store.db_path, limit)
        except Exception as exc:
            log.error("Turn-state snapshot read failed: %s", exc.__class__.__name__)
            return web.json_response(
                _envelope("unavailable", configured_enabled=configured_enabled),
                status=503,
            )
        return web.json_response(_envelope(
            "available", data, configured_enabled=configured_enabled, limit=limit,
        ))

    @routes.get("/api/turn-state/capacity-breakers")
    async def get_capacity_breakers(request: web.Request) -> web.Response:
        denied = _require_admin(request)
        if denied:
            return denied
        registry = getattr(_services(), "model_breakers", None)
        if registry is None:
            return web.json_response(_envelope("not_enabled", lifetime="process"))
        try:
            snapshot = registry.snapshot()
        except Exception as exc:
            log.error("Breaker snapshot failed: %s", exc.__class__.__name__)
            return web.json_response(
                _envelope("unavailable", lifetime="process"), status=503,
            )
        breakers = []
        for key in sorted(snapshot):
            entry = dict(snapshot[key])
            provider, _, model = key.partition(":")
            entry["provider"] = provider
            entry["model"] = model
            breakers.append(entry)
        return web.json_response(_envelope(
            "available", {"breakers": breakers}, lifetime="process",
        ))
