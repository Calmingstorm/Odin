"""Restart proofs using real auth, private stores and WebSocket admission."""
import base64
import hashlib
import json
import os
from types import SimpleNamespace

import pytest
from aiohttp import WSMsgType, web
from aiohttp.test_utils import TestClient, TestServer

from src.config.schema import ApiTokenIdentity, WebConfig
from src.health.server import SessionManager, _make_auth_middleware
from src.permissions.token_manager import ApiTokenManager
from src.web.api.security import register_auth
from src.web.authentication import current_session_identity
from src.web.session_store import LIFETIME, WRITE_INTERVAL
from src.web.websocket import WebSocketManager


def manager(path, config, tokens=None, timeout=0):
    return SessionManager(timeout, store_path=path, config=lambda: config,
                          snapshot=lambda: tokens.auth_snapshot() if tokens else None)


def composition(sessions, config, tokens=None):
    bot = SimpleNamespace(config=SimpleNamespace(web=config), api_token_manager=tokens)
    app = web.Application(middlewares=[_make_auth_middleware(config, sessions)])
    app["session_manager"] = sessions
    app["token_manager"] = tokens
    routes = web.RouteTableDef()
    register_auth(routes, bot)
    app.add_routes(routes)
    return app, bot


async def login(client, credential, persist=True):
    response = await client.post("/api/auth/login", json={"token": credential, "persist": persist})
    assert response.status == 200
    return (await response.json())["session_id"]


async def credential_config(tmp_path, source):
    tokens = ApiTokenManager(str(tmp_path / "tokens.json"))
    credential = "unique-secret-雪"
    config = WebConfig()
    if source == "static":
        config.api_tokens = [ApiTokenIdentity(token=credential, user_id="user", tier="user")]
    elif source == "legacy":
        config.api_token = credential
    else:
        credential = (await tokens.create_token(user_id="user", username="User", tier="user")).token
    return config, tokens, credential


@pytest.mark.parametrize("source", ["static", "legacy", "dynamic"])
async def test_restart_opt_in_and_private_format(tmp_path, source):
    path = tmp_path / "sessions.json"
    config, tokens, credential = await credential_config(tmp_path, source)
    first = manager(path, config, tokens)
    app, _ = composition(first, config, tokens)
    async with TestClient(TestServer(app)) as client:
        sid = await login(client, credential)
        transient = await login(client, credential, False)
    text = path.read_text()
    assert sid not in text and transient not in text and credential not in text
    assert hashlib.sha256(sid.encode()).hexdigest() in json.loads(text)["sessions"]
    assert path.stat().st_mode & 0o777 == 0o600
    assert path.with_suffix(".key").stat().st_mode & 0o777 == 0o600
    for artifact in (path, path.with_suffix(".key")):
        contents = artifact.read_bytes()
        assert credential.encode() not in contents
        assert sid.encode() not in contents and transient.encode() not in contents
    second_tokens = ApiTokenManager(str(tmp_path / "tokens.json"))
    second = manager(path, config, second_tokens)
    assert not second.validate(transient)
    identity = current_session_identity(second, sid, config, second_tokens.auth_snapshot())
    assert identity is not None
    if source == "dynamic":
        assert second_tokens.auth_snapshot().identity_is_current(identity)
    app, _ = composition(second, config, second_tokens)
    async with TestClient(TestServer(app)) as client:
        response = await client.get("/api/auth/session", headers={"Authorization": f"Bearer {sid}"})
        assert response.status == 200
        assert (await response.json())["authenticated"]
    assert second.active_count == 1


@pytest.mark.parametrize("source", ["static", "legacy", "dynamic"])
@pytest.mark.parametrize("operation", ["rotation", "deletion", "logout"])
async def test_revocation_survives_restart(tmp_path, source, operation):
    path = tmp_path / "sessions.json"
    config, tokens, credential = await credential_config(tmp_path, source)
    first = manager(path, config, tokens)
    app, _ = composition(first, config, tokens)
    async with TestClient(TestServer(app)) as client:
        sid = await login(client, credential)
    restored_tokens = ApiTokenManager(str(tmp_path / "tokens.json"))
    restored = manager(path, config, restored_tokens)
    if operation == "logout":
        app, _ = composition(restored, config, restored_tokens)
        async with TestClient(TestServer(app)) as client:
            response = await client.post(
                "/api/auth/logout", headers={"Authorization": f"Bearer {sid}"},
            )
            assert response.status == 200
        assert not json.loads(path.read_text())["sessions"]
    elif source == "static":
        if operation == "deletion":
            config.api_tokens = []
        else:
            config.api_tokens[0].token = "new-secret"
    elif source == "legacy":
        config.api_token = "" if operation == "deletion" else "new-secret"
    else:
        user_id = first.get_identity(sid).user_id
        if operation == "deletion":
            await tokens.delete_token(user_id)
        else:
            await tokens.regenerate_token(user_id)
    assert not restored.validate(sid)
    assert not manager(path, config, tokens).validate(sid)


def issue(sessions, config):
    sid, _ = sessions.create(config.api_tokens[0].model_copy(deep=True))
    sessions.set_auth_source(sid, "static")
    sessions.persist(sid)
    return sid


@pytest.mark.parametrize("timeout,elapsed", [(1, 60), (0, LIFETIME)])
def test_wall_clock_expiry_load_and_use(tmp_path, monkeypatch, timeout, elapsed):
    clock = [10000000.0]
    monkeypatch.setattr("src.health.server._wall_time", lambda: clock[0])
    config = WebConfig(api_tokens=[ApiTokenIdentity(token="secret", user_id="user")])
    path = tmp_path / "sessions.json"
    first = manager(path, config, timeout=timeout)
    sid = issue(first, config)
    clock[0] += elapsed - 1
    second = manager(path, config, timeout=timeout)
    assert second.validate(sid, touch=False)
    assert second.seconds_until_expiry(sid) == 1
    clock[0] += 1
    assert not second.validate(sid, touch=False)
    assert not manager(path, config, timeout=timeout).validate(sid)


def test_activity_writes_coalesced_and_static_policy_current(tmp_path, monkeypatch):
    clock = [10000000.0]
    monkeypatch.setattr("src.health.server._wall_time", lambda: clock[0])
    config = WebConfig(api_tokens=[ApiTokenIdentity(token="secret", user_id="user", tier="admin")])
    path = tmp_path / "sessions.json"
    sessions = manager(path, config)
    sid = issue(sessions, config)
    initial = path.read_bytes()
    for _ in range(10):
        clock[0] += 1
        assert sessions.validate(sid)
        assert path.read_bytes() == initial
    clock[0] += WRITE_INTERVAL
    assert sessions.validate(sid)
    assert path.read_bytes() != initial
    config.api_tokens[0].tier = "guest"
    config.api_tokens[0].allowed_hosts = ["restricted"]
    identity = current_session_identity(manager(path, config), sid, config, None)
    assert identity.tier == "guest" and identity.allowed_hosts == ["restricted"]


@pytest.mark.parametrize("field", ["created_at", "last_activity"])
def test_clock_rollback_discards_only_future_record_across_restart(tmp_path, monkeypatch, field):
    clock = [10000000.0]
    monkeypatch.setattr("src.health.server._wall_time", lambda: clock[0])
    config = WebConfig(api_tokens=[ApiTokenIdentity(token="secret", user_id="user")])
    path = tmp_path / "sessions.json"
    first = manager(path, config)
    valid = issue(first, config)
    clock[0] += 100
    future = issue(first, config)
    data = json.loads(path.read_text())
    past_field = "created_at" if field == "last_activity" else "last_activity"
    data["sessions"][hashlib.sha256(future.encode()).hexdigest()][past_field] -= 100
    path.write_text(json.dumps(data))
    clock[0] -= 50
    restored = manager(path, config)
    assert restored.validate(valid, touch=False)
    assert not restored.validate(future)
    new = issue(restored, config)
    again = manager(path, config)
    assert again.validate(valid, touch=False)
    assert again.validate(new, touch=False)
    assert not again.validate(future)


@pytest.mark.parametrize("corruption", ["json", "record", "mode", "key", "symlink",
                                       "huge", "nesting", "bool-version"])
def test_corrupt_store_fails_closed(tmp_path, corruption, caplog):
    path = tmp_path / "sessions.json"
    config = WebConfig(api_tokens=[ApiTokenIdentity(token="secret", user_id="user")])
    first = manager(path, config)
    sid = issue(first, config)
    if corruption == "json":
        path.write_text("not-json")
    elif corruption == "record":
        content = json.loads(path.read_text())
        content["sessions"]["bad"] = {}
        path.write_text(json.dumps(content))
    elif corruption == "mode":
        path.chmod(0o644)
    elif corruption == "key":
        path.with_suffix(".key").write_text("bad-key")
    elif corruption == "huge":
        content = json.loads(path.read_text())
        next(iter(content["sessions"].values()))["created_at"] = 10 ** 1000
        path.write_text(json.dumps(content))
    elif corruption == "nesting":
        path.write_text("[" * 2000 + "0" + "]" * 2000)
    elif corruption == "bool-version":
        content = json.loads(path.read_text())
        content["version"] = True
        path.write_text(json.dumps(content))
    else:
        target = tmp_path / "copy.json"
        path.rename(target)
        path.symlink_to(target)
    second = manager(path, config)
    assert not second.validate(sid) and second.active_count == 0
    assert "no sessions restored" in caplog.text


async def test_anonymous_never_persisted_and_persist_requires_boolean(tmp_path):
    path = tmp_path / "sessions.json"
    config = WebConfig()
    app, _ = composition(manager(path, config), config)
    async with TestClient(TestServer(app)) as client:
        await login(client, "development")
        assert not path.exists() and not path.with_suffix(".key").exists()
        response = await client.post("/api/auth/login", json={"token": "dev", "persist": "true"})
        assert response.status == 400


@pytest.mark.parametrize("source", ["static", "legacy", "dynamic"])
async def test_restored_websocket_admission(tmp_path, source):
    path = tmp_path / "sessions.json"
    config, tokens, credential = await credential_config(tmp_path, source)
    app, _ = composition(manager(path, config, tokens), config, tokens)
    async with TestClient(TestServer(app)) as client:
        sid = await login(client, credential)
    tokens = ApiTokenManager(str(tmp_path / "tokens.json"))
    sessions = manager(path, config, tokens)
    app, bot = composition(sessions, config, tokens)
    ws = WebSocketManager(bot, session_manager=sessions, web_config=config)
    app.router.add_get("/api/ws", ws.handle)
    async with TestClient(TestServer(app)) as client:
        protocol = "odin.bearer." + base64.urlsafe_b64encode(sid.encode()).decode().rstrip("=")
        socket = await client.ws_connect("/api/ws", protocols=[protocol])
        await socket.send_json({"type": "ping"})
        message = await socket.receive(timeout=2)
        assert message.type == WSMsgType.TEXT
        assert json.loads(message.data)["type"] == "pong"
        await socket.close()


def test_load_pruning_cannot_resurrect_after_credential_revert(tmp_path):
    path = tmp_path / "sessions.json"
    config = WebConfig(api_tokens=[ApiTokenIdentity(token="secret", user_id="user")])
    sid = issue(manager(path, config), config)
    config.api_tokens[0].token = "rotated"
    assert not manager(path, config).contains(sid)
    assert not json.loads(path.read_text())["sessions"]
    config.api_tokens[0].token = "secret"
    assert not manager(path, config).validate(sid)


def test_touch_false_and_absolute_lifetime_never_extended(tmp_path, monkeypatch):
    clock = [10000000.0]
    monkeypatch.setattr("src.health.server._wall_time", lambda: clock[0])
    path = tmp_path / "sessions.json"
    config = WebConfig(api_tokens=[ApiTokenIdentity(token="secret", user_id="user")])
    sessions = manager(path, config)
    sid = issue(sessions, config)
    initial = path.read_bytes()
    clock[0] += WRITE_INTERVAL
    assert sessions.validate(sid, touch=False)
    assert path.read_bytes() == initial
    clock[0] += LIFETIME - WRITE_INTERVAL - 1
    assert sessions.validate(sid)
    assert sessions.seconds_until_expiry(sid) == 1
    clock[0] += 1
    assert not sessions.validate(sid)


def test_write_failure_revokes_materialized_sessions_and_logout_callback(tmp_path, monkeypatch):
    path = tmp_path / "sessions.json"
    config = WebConfig(api_tokens=[ApiTokenIdentity(token="secret", user_id="user")])
    first = manager(path, config)
    sid = issue(first, config)
    other = issue(first, config)
    restored = manager(path, config)
    assert restored.validate(sid) and restored.validate(other)
    closed = []
    restored.set_destroy_callback(closed.append)

    def fail(*args):
        raise OSError("test storage outage")

    monkeypatch.setattr("src.web.session_store.write_private_atomic", fail)
    with pytest.raises(OSError):
        restored.destroy(sid)
    assert set(closed) == {sid, other}
    assert not restored.validate(sid) and not restored.validate(other)
    assert not manager(path, config).validate(sid)
    assert not manager(path, config).validate(other)


async def test_dynamic_live_issuer_fence_and_policy_change(tmp_path):
    path = tmp_path / "sessions.json"
    config, tokens, credential = await credential_config(tmp_path, "dynamic")
    first = manager(path, config, tokens)
    app, _ = composition(first, config, tokens)
    async with TestClient(TestServer(app)) as client:
        sid = await login(client, credential)
    second = manager(path, config, tokens)
    assert second.validate(sid)
    token_path = tmp_path / "tokens.json"
    token_path.write_bytes(token_path.read_bytes() + b"\n")
    assert not second.validate(sid)
    assert not manager(path, config, tokens).validate(sid)


@pytest.mark.parametrize("target", ["store", "secret"])
@pytest.mark.parametrize("kind", ["missing", "mode", "symlink", "fifo", "directory", "oversize"])
def test_unsafe_files_fail_closed(tmp_path, target, kind, caplog):
    path = tmp_path / "sessions.json"
    config = WebConfig(api_tokens=[ApiTokenIdentity(token="secret", user_id="user")])
    sid = issue(manager(path, config), config)
    file = path if target == "store" else path.with_suffix(".key")
    original = file.with_name(file.name + ".original")
    file.rename(original)
    if kind == "mode":
        file.write_bytes(original.read_bytes())
        file.chmod(0o644)
    elif kind == "symlink":
        file.symlink_to(original)
    elif kind == "fifo":
        os.mkfifo(file, mode=0o600)
    elif kind == "directory":
        file.mkdir(mode=0o600)
    elif kind == "oversize":
        file.write_text("0" * (8 * 1024 * 1024 + 1 if target == "store" else 129))
        file.chmod(0o600)
    restored = manager(path, config)
    assert not restored.validate(sid)
    assert restored.active_count == 0
    if not (target == "store" and kind == "missing"):
        assert "no sessions restored" in caplog.text


async def test_dynamic_policy_change_and_deleted_id_reuse_cannot_restore(tmp_path):
    path = tmp_path / "sessions.json"
    config, tokens, credential = await credential_config(tmp_path, "dynamic")
    first = manager(path, config, tokens)
    app, _ = composition(first, config, tokens)
    async with TestClient(TestServer(app)) as client:
        sid = await login(client, credential)
    user_id = first.get_identity(sid).user_id
    await tokens.update_token(user_id, tier="guest", allowed_hosts=["restricted"])
    assert not manager(path, config, tokens).validate(sid)
    await tokens.delete_token(user_id)
    await tokens.create_token(user_id="user", username="User", tier="user")
    assert not manager(path, config, tokens).validate(sid)


def test_atomic_failure_preserves_old_store_but_invalidates_key(tmp_path, monkeypatch):
    path = tmp_path / "sessions.json"
    config = WebConfig(api_tokens=[ApiTokenIdentity(token="secret", user_id="user")])
    sessions = manager(path, config)
    sid = issue(sessions, config)
    original = path.read_bytes()

    def reject_replace(self, target):
        raise OSError("test atomic publication failure")

    monkeypatch.setattr("pathlib.Path.replace", reject_replace)
    with pytest.raises(OSError):
        sessions.destroy(sid)
    assert path.read_bytes() == original
    assert path.with_suffix(".key").read_bytes() == b""
    assert not list(tmp_path.glob("*.tmp"))
    assert not manager(path, config).validate(sid)


def test_load_prune_failure_fences_restart_after_credential_revert(tmp_path, monkeypatch):
    path = tmp_path / "sessions.json"
    config = WebConfig(api_tokens=[ApiTokenIdentity(token="secret", user_id="user")])
    sid = issue(manager(path, config), config)
    config.api_tokens[0].token = "changed"

    def fail(*args):
        raise OSError("test write failure")

    monkeypatch.setattr("src.web.session_store.write_private_atomic", fail)
    assert not manager(path, config).validate(sid)
    config.api_tokens[0].token = "secret"
    assert not manager(path, config).validate(sid)


def test_failed_key_fence_reports_storage_repair(tmp_path, monkeypatch, caplog):
    path = tmp_path / "sessions.json"
    config = WebConfig(api_tokens=[ApiTokenIdentity(token="secret", user_id="user")])
    sessions = manager(path, config)
    sid = issue(sessions, config)

    def fail(*args):
        raise OSError("private error must not be logged")

    monkeypatch.setattr("src.web.session_store.write_private_atomic", fail)
    monkeypatch.setattr("src.web.session_store.SessionStore.invalidate", fail)
    with pytest.raises(OSError):
        sessions.destroy(sid)
    assert not sessions.validate(sid)
    assert "storage repair required" in caplog.text
    assert "private error must not be logged" not in caplog.text


@pytest.mark.parametrize("target", ["store", "secret"])
def test_wrong_file_owner_fail_closed(tmp_path, target):
    if os.geteuid() != 0:
        pytest.skip("setting a different real owner requires root")
    path = tmp_path / "sessions.json"
    config = WebConfig(api_tokens=[ApiTokenIdentity(token="secret", user_id="user")])
    sid = issue(manager(path, config), config)
    file = path if target == "store" else path.with_suffix(".key")
    os.chown(file, 65534, 65534)
    assert not manager(path, config).validate(sid)


def test_directory_fsync_degradation_is_reported(tmp_path, monkeypatch, caplog):
    path = tmp_path / "sessions.json"
    config = WebConfig(api_tokens=[ApiTokenIdentity(token="secret", user_id="user")])
    sessions = manager(path, config)
    sid = issue(sessions, config)
    original = os.fsync

    def fsync(fd):
        import stat
        if stat.S_ISDIR(os.fstat(fd).st_mode):
            raise OSError("test directory durability outage")
        return original(fd)

    monkeypatch.setattr("src.permissions.persistence.os.fsync", fsync)
    assert sessions.destroy(sid)
    assert "durability degraded" in caplog.text
    assert not manager(path, config).validate(sid)
