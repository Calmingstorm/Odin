"""Image intent routes use actual temporary YAML and real atomic persistence."""
import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from aiohttp import web
from aiohttp.test_utils import TestClient as BaseTestClient
from aiohttp.test_utils import TestServer

from src.config.schema import Config, active_config_path, set_active_config_path
from src.web.api import config_admin


class TestClient(BaseTestClient):
    __test__ = False

    async def post(self, path, **kwargs):
        body = kwargs.get("json")
        if isinstance(body, dict) and "operations" in body and "expected_revision" not in body:
            metadata = await (await self.get("/api/config/meta")).json()
            kwargs["json"] = {**body, "expected_revision": metadata.get("image_model_revision", "")}
        return await super().post(path, **kwargs)


class FakeRequest(dict):
    def __init__(self, body):
        super().__init__()
        from src.config.image_defaults import read_image_model_metadata
        body["expected_revision"] = config_admin._image_intent_revision(
            read_image_model_metadata(active_config_path(), Config(discord={"token": "fake"},
                                      image={"openai": {"outer_model": "custom-outer"}})))
        self.json = AsyncMock(return_value=body)


@pytest.fixture
def state(tmp_path):
    path = tmp_path / "config.yml"
    path.write_text("discord:\n  token: fake\n# keep this\nimage:\n  openai:\n"
                    "    outer_model: custom-outer\n")
    previous = active_config_path()
    set_active_config_path(path)
    bot = SimpleNamespace(config=Config(discord={"token": "fake"}, image={"openai": {
        "outer_model": "custom-outer"}}), api_token_manager=None, tool_catalog=None)
    routes = web.RouteTableDef()
    config_admin.register_discord_config(routes, bot)
    app = web.Application()
    app.router.add_routes(routes)
    yield app, bot, path
    set_active_config_path(previous)


@pytest.mark.asyncio
async def test_metadata_uses_presence_not_default_equality(state):
    app, bot, path = state
    async with TestClient(TestServer(app)) as client:
        payload = await (await client.get("/api/config/meta")).json()
        metadata = payload["image_model_defaults"]
        assert metadata["image_model"] == {"effective": bot.config.image.openai.image_model,
            "default": Config(discord={"token": "fake"}).image.openai.image_model,
            "status": "follow"}
        assert metadata["outer_model"]["status"] == "pin"
        response = await client.post("/api/config/image-models",
                                     json={"operations": {"image_model": "pin"}})
        assert response.status == 200
        assert (await response.json())["image_model_defaults"]["image_model"]["status"] == "pin"
        assert "image_model:" in path.read_text()
        metadata = (await (await client.get("/api/config/meta")).json())["image_model_defaults"]
        assert metadata["image_model"]["effective"] == metadata["image_model"]["default"]
        assert metadata["image_model"]["status"] == "pin"


@pytest.mark.asyncio
async def test_follow_both_atomic_preserves_other_text_and_runtime(state):
    app, bot, path = state
    async with TestClient(TestServer(app)) as client:
        response = await client.post("/api/config/image-models", json={"operations": {
            "image_model": "follow", "outer_model": "follow"}})
        assert response.status == 200
        payload = await response.json()
        assert all(item["status"] == "follow" for item in payload["image_model_defaults"].values())
        assert (bot.config.image.openai.outer_model
                == payload["image_model_defaults"]["outer_model"]["default"])
        text = path.read_text()
        assert "outer_model:" not in text and "image_model:" not in text
        assert "# keep this" in text and "token: fake" in text
        assert "image_model_defaults" not in text
        assert "fake" not in str(payload)


@pytest.mark.asyncio
async def test_generic_roundtrip_preserves_follow_and_pin(state):
    app, bot, path = state
    async with TestClient(TestServer(app)) as client:
        image = bot.config.image.model_dump()
        response = await client.put("/api/config", json={"image": image, "timezone": "UTC"})
        assert response.status == 200
        assert "image_model:" not in path.read_text()
        assert "outer_model: custom-outer" in path.read_text()
        response = await client.put("/api/config",
                                    json={"image": {"openai": {"image_model": "my-model"}}})
        assert response.status == 200
        assert "image_model: my-model" in path.read_text()
        metadata = (await (await client.get("/api/config/meta")).json())["image_model_defaults"]
        assert metadata["image_model"]["status"] == "pin"


@pytest.mark.asyncio
async def test_failure_does_not_publish(state, monkeypatch):
    app, bot, path = state
    old_config, old_text = bot.config, path.read_text()
    monkeypatch.setattr(config_admin, "persist_config_paths_locked",
                        AsyncMock(return_value=(OSError("disk full"), False)))
    async with TestClient(TestServer(app)) as client:
        response = await client.post("/api/config/image-models",
                                     json={"operations": {"outer_model": "follow"}})
        assert response.status == 500
        assert "not saved" in (await response.json())["error"]
    assert bot.config is old_config and path.read_text() == old_text


@pytest.mark.asyncio
@pytest.mark.parametrize("body", [{}, [], {"operations": {}},
    {"operations": {"image_model": "bad"}},
    {"operations": {"other": "follow"}}, {"operations": {"image_model": "pin"}, "timezone": "UTC"}])
async def test_bad_operation_rejected(state, body):
    app, bot, path = state
    old_text = path.read_text()
    async with TestClient(TestServer(app)) as client:
        assert (await client.post("/api/config/image-models", json=body)).status == 400
    assert path.read_text() == old_text


@pytest.mark.asyncio
async def test_operation_admin_only(state):
    app, bot, path = state
    bot.config.web.api_token = "configured"
    async with TestClient(TestServer(app)) as client:
        response = await client.post("/api/config/image-models",
                                     json={"operations": {"image_model": "pin"}})
        assert response.status == 403


@pytest.mark.asyncio
async def test_unreadable_source_metadata_fails_honestly(state):
    app, bot, path = state
    path.unlink()
    async with TestClient(TestServer(app)) as client:
        assert (await client.get("/api/config/meta")).status == 500


@pytest.mark.asyncio
@pytest.mark.parametrize("failed", [False, True])
async def test_cancellation_publishes_only_durable_commit(state, monkeypatch, failed):
    app, bot, path = state
    original = bot.config
    real_persist = config_admin.persist_config_paths_locked

    async def cancelled_commit(changes, **kwargs):
        if failed:
            return OSError("disk full"), True
        error, _ = await real_persist(changes, **kwargs)
        return error, True

    monkeypatch.setattr(config_admin, "persist_config_paths_locked", cancelled_commit)
    handler = next(route.handler for route in app.router.routes()
                   if route.method == "POST"
                   and route.resource.canonical == "/api/config/image-models")
    request = FakeRequest({"operations": {"outer_model": "follow"}})
    with pytest.raises(asyncio.CancelledError):
        await handler(request)
    if failed:
        assert bot.config is original
        assert "outer_model: custom-outer" in path.read_text()
    else:
        assert bot.config is not original
        assert bot.config.image.openai.outer_model != "custom-outer"
        assert "outer_model:" not in path.read_text()


@pytest.mark.asyncio
async def test_pin_uses_lock_current_state_and_preserves_concurrent_save(state):
    app, bot, path = state
    from src.config.persistence import config_transaction, persist_config_paths_locked

    handler = next(route.handler for route in app.router.routes()
                   if route.method == "POST"
                   and route.resource.canonical == "/api/config/image-models")
    request = FakeRequest({"operations": {"outer_model": "pin"}})
    async with config_transaction():
        pending = asyncio.create_task(handler(request))
        await asyncio.sleep(0)
        assert not pending.done()
        error, cancelled = await persist_config_paths_locked([
            (("image", "openai", "outer_model"), "new-current"),
            (("timezone",), "Europe/London"),
        ])
        assert error is None and not cancelled
        current = bot.config.model_dump()
        current["image"]["openai"]["outer_model"] = "new-current"
        current["timezone"] = "Europe/London"
        bot.config = Config(**current)
    response = await pending
    assert response.status == 409
    assert bot.config.image.openai.outer_model == "new-current"
    assert bot.config.timezone == "Europe/London"
    assert "outer_model: new-current" in path.read_text()
    assert "timezone: Europe/London" in path.read_text()


@pytest.mark.asyncio
async def test_equal_value_pin_invalidates_stale_follow_revision(state):
    app, bot, path = state
    async with TestClient(TestServer(app)) as client:
        metadata = await (await client.get("/api/config/meta")).json()
        revision = metadata["image_model_revision"]
        payload = {"operations": {"image_model": "pin"}, "expected_revision": revision}
        assert (await client.post("/api/config/image-models", json=payload)).status == 200
        payload["operations"]["image_model"] = "follow"
        assert (await client.post("/api/config/image-models", json=payload)).status == 409
        assert "image_model:" in path.read_text()


@pytest.mark.asyncio
async def test_error_branches_and_audit_failure(state, monkeypatch):
    app, bot, path = state
    import src.audit.diff_tracker as tracker

    async with TestClient(TestServer(app)) as client:
        assert (await client.post("/api/config/image-models", data="invalid")).status == 400
        body = {"operations": {"image_model": "pin"}, "expected_revision": "old"}
        path.unlink()
        assert (await client.post("/api/config/image-models", json=body)).status == 500
        path.write_text("discord:\n  token: fake\n")
        monkeypatch.setattr(tracker, "compute_dict_diff", lambda *a, **kw: 1 / 0)
        assert (await client.post("/api/config/image-models",
                                 json={"operations": {"image_model": "pin"}})).status == 200
