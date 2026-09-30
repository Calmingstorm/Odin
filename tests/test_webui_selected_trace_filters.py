"""Selected daily files must limit matching traces, not unfiltered rows (#527)."""
import json
from types import SimpleNamespace

import pytest
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from src.trajectories.saver import TrajectorySaver
from src.web.api.sessions_chat import register_trajectories


@pytest.mark.parametrize(
    "filters",
    [
        {"tool_name": "wanted"},
        {"errors_only": True},
        {"channel_id": "channel"},
        {"user_id": "user"},
        {"tool_name": "wanted", "errors_only": True, "channel_id": "channel", "user_id": "user"},
    ],
)
async def test_selected_file_filters_before_limit(tmp_path, filters):
    match = {"message_id": "old-match", "tools_used": ["wanted"], "is_error": True,
             "channel_id": "channel", "user_id": "user"}
    unrelated = {"message_id": "new-unrelated", "tools_used": ["other"], "is_error": False,
                 "channel_id": "other", "user_id": "other"}
    path = tmp_path / "2026-09-29.jsonl"
    path.write_text("\n".join(json.dumps(row) for row in [match] + [unrelated] * 1000) + "\n")
    saver = TrajectorySaver(directory=str(tmp_path))
    assert await saver.read_file(path.name, limit=1, **filters) == [match]
    assert await saver.read_file(path.name, limit=1) == [unrelated]
    assert await saver.read_file(path.name, limit=0, **filters) == []


async def test_selected_file_endpoint_forwards_filters_and_retains_path_guards(tmp_path):
    match = {"message_id": "match", "tools_used": ["wanted"], "is_error": True,
             "channel_id": "channel", "user_id": "user"}
    unrelated = {"message_id": "new", "tools_used": ["other"]}
    (tmp_path / "2026-09-29.jsonl").write_text(
        json.dumps(match) + "\n" + json.dumps(unrelated) + "\n"
    )
    saver = TrajectorySaver(directory=str(tmp_path))
    routes = web.RouteTableDef()
    register_trajectories(routes, SimpleNamespace(trajectory_saver=saver))
    app = web.Application()
    app.add_routes(routes)
    async with TestClient(TestServer(app)) as client:
        response = await client.get("/api/trajectories/2026-09-29.jsonl", params={
            "limit": "1", "tool_name": "wanted", "errors_only": "true",
            "channel_id": "channel", "user_id": "user",
        })
        assert response.status == 200
        assert (await response.json())["entries"] == [match]
        response = await client.get("/api/trajectories/bad..jsonl")
        assert response.status == 400
