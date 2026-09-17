"""Turning automatic learning off is not a learned-store access switch."""

import json
from types import SimpleNamespace

from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from src.learning.reflector import ConversationReflector
from src.web.api.knowledge_mem import register_learned_context


async def test_disabled_learning_retains_entries_and_all_learned_routes(tmp_path):
    path = tmp_path / "learned.json"
    original = json.dumps({
        "version": 2,
        "last_reflection": None,
        "entries": [
            {"key": "keep", "category": "correction", "content": "Retained lesson."},
            {"key": "remove", "category": "operational", "content": "Other lesson."},
        ],
    })
    path.write_text(original)
    reflector = ConversationReflector(str(path), enabled=False)
    routes = web.RouteTableDef()
    register_learned_context(routes, SimpleNamespace(reflector=reflector))
    app = web.Application()
    app.add_routes(routes)

    async with TestClient(TestServer(app)) as client:
        response = await client.get("/api/learned")
        assert response.status == 200
        assert (await response.json())["count"] == 2
        assert reflector.get_prompt_section() == ""
        assert path.read_text() == original

        response = await client.put("/api/learned/keep", json={"content": "Edited lesson."})
        assert response.status == 200
        assert (await response.json())["content"] == "Edited lesson."
        assert (await client.delete("/api/learned/remove")).status == 200
        remaining = await (await client.get("/api/learned")).json()
        assert remaining["count"] == 1
        assert remaining["entries"][0]["key"] == "keep"
        assert reflector.get_prompt_section() == ""
