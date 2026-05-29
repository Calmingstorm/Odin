"""Tests for /api/chat opt-in, identity-namespaced session ids.

The feature lets a caller pass a logical ``session_id`` for multi-request chat
continuity. Odin namespaces it UNDER the authenticated identity, so it only
controls conversation continuity + lock serialization — never permissions,
memory, or another token's history. Omitting it preserves historical behavior.
"""
from __future__ import annotations

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from src.web.api import create_api_routes

_MOCK_RESULT = {"response": "ok", "tools_used": [], "is_error": False, "files": []}


def _make_bot() -> MagicMock:
    bot = MagicMock()
    bot.config = MagicMock()
    bot.sessions = MagicMock()
    bot.sessions.items_snapshot.return_value = []
    return bot


def _identity(user_id, *, tier="admin", allowed_tools=None, allowed_hosts=None):
    return SimpleNamespace(user_id=user_id, username=user_id, tier=tier,
                           allowed_tools=allowed_tools, allowed_hosts=allowed_hosts)


def _patch_pwc():
    """Patch the chat loop so route tests assert wiring, not LLM behavior."""
    return patch("src.web.api.process_web_chat", new_callable=AsyncMock, return_value=_MOCK_RESULT)


async def _client(bot, identity) -> TestClient:
    @web.middleware
    async def _inject(request, handler):
        request._api_identity = identity
        return await handler(request)

    app = web.Application(middlewares=[_inject])
    app.router.add_routes(create_api_routes(bot))
    return TestClient(TestServer(app))


# --- channel derivation (Odin tests 1-3) ---------------------------------

@pytest.mark.asyncio
async def test_chat_without_session_id_uses_identity_channel():
    bot = _make_bot()
    with _patch_pwc() as pwc:
        async with await _client(bot, _identity("api-user")) as client:
            r = await client.post("/api/chat", json={"content": "hi"})
            assert r.status == 200
            assert pwc.call_args.args[2] == "api-user"   # channel_id == user_id (default unchanged)
            assert "session_id" not in await r.json()


@pytest.mark.asyncio
async def test_chat_with_session_id_namespaces_channel():
    bot = _make_bot()
    with _patch_pwc() as pwc:
        async with await _client(bot, _identity("api-user")) as client:
            r = await client.post("/api/chat", json={"content": "hi", "session_id": "goal-123"})
            assert r.status == 200
            assert pwc.call_args.args[2] == "web:api-user:session:goal-123"
            assert pwc.call_args.kwargs["user_id"] == "api-user"   # identity itself unchanged
            assert (await r.json())["session_id"] == "goal-123"


@pytest.mark.asyncio
async def test_same_session_id_different_identities_do_not_collide():
    bot = _make_bot()
    with _patch_pwc() as pwc:
        async with await _client(bot, _identity("user-a")) as client:
            await client.post("/api/chat", json={"content": "hi", "session_id": "shared"})
        ch_a = pwc.call_args.args[2]
        async with await _client(bot, _identity("user-b")) as client:
            await client.post("/api/chat", json={"content": "hi", "session_id": "shared"})
        ch_b = pwc.call_args.args[2]
    assert ch_a == "web:user-a:session:shared"
    assert ch_b == "web:user-b:session:shared"
    assert ch_a != ch_b                              # no cross-token collision


# --- validation (Odin test 4) --------------------------------------------

@pytest.mark.asyncio
async def test_invalid_session_id_rejected_without_dispatch():
    bot = _make_bot()
    bad_ids = [
        "", "   ", "has space", "path/traversal", "back\\slash",
        "a" * 129, "semi;colon", "new\nline",
    ]
    with _patch_pwc() as pwc:
        async with await _client(bot, _identity("api-user")) as client:
            for bad in bad_ids:
                r = await client.post("/api/chat", json={"content": "hi", "session_id": bad})
                assert r.status == 400, f"expected 400 for {bad!r}"
    assert pwc.call_count == 0                        # never dispatched on invalid input


# --- permissions are identity-keyed, not session-keyed (Odin test 5) -----

@pytest.mark.asyncio
async def test_permissions_come_from_identity_not_session():
    bot = _make_bot()
    idn = _identity("api-user", tier="standard",
                    allowed_tools=["run_command"], allowed_hosts=["server"])
    with _patch_pwc() as pwc:
        async with await _client(bot, idn) as client:
            await client.post("/api/chat", json={"content": "hi", "session_id": "goal-1"})
        kw = pwc.call_args.kwargs
    assert kw["user_id"] == "api-user"
    assert kw["tier"] == "standard"
    assert kw["allowed_tools"] == ["run_command"]
    assert kw["token_allowed_hosts"] == ["server"]


# --- /api/sessions visibility for scoped sessions (Odin test 6) ----------

@pytest.mark.asyncio
async def test_non_admin_sees_own_scoped_sessions_only():
    bot = _make_bot()

    def _sess():
        return SimpleNamespace(messages=[], estimated_tokens=0, last_active=0.0,
                               created_at=0.0, summary="", last_user_id="x")

    bot.sessions.items_snapshot.return_value = [
        ("api-user", _sess()),                    # own default
        ("web:api-user:session:g1", _sess()),     # own scoped
        ("web:other:session:g2", _sess()),        # another identity's scoped
        ("other", _sess()),                       # another identity's default
    ]
    async with await _client(bot, _identity("api-user", tier="standard")) as client:
        r = await client.get("/api/sessions")
        cids = {s["channel_id"] for s in await r.json()}
    assert cids == {"api-user", "web:api-user:session:g1"}   # own + own-scoped only

    async with await _client(bot, _identity("admin-user", tier="admin")) as client:
        rows = await (await client.get("/api/sessions")).json()
    sources = {row["channel_id"]: row["source"] for row in rows}
    assert sources["web:api-user:session:g1"] == "web"       # scoped id classified as web


# --- scoped sessions still serialize on one lock (Odin's required regression) ---

@pytest.mark.asyncio
async def test_same_session_serializes_concurrent_requests():
    """Two concurrent requests for the same scoped session must NOT enter
    _do_process_web_chat concurrently — they share one per-channel lock. Regression
    for the removed cleanup race that could split a session across two lock objects."""
    from src.web.chat import process_web_chat

    bot = _make_bot()
    bot._web_channel_locks = {}          # real dict -> a real asyncio.Lock is used
    state = {"now": 0, "max": 0}

    async def slow_do(*args, **kwargs):
        state["now"] += 1
        state["max"] = max(state["max"], state["now"])
        await asyncio.sleep(0.05)
        state["now"] -= 1
        return dict(_MOCK_RESULT)

    channel = "web:api-user:session:g1"
    with patch("src.web.chat._do_process_web_chat", side_effect=slow_do):
        await asyncio.gather(
            process_web_chat(bot, "a", channel, user_id="api-user"),
            process_web_chat(bot, "b", channel, user_id="api-user"),
        )
    assert state["max"] == 1              # serialized by the shared per-channel lock
