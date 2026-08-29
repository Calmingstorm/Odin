"""Turn-state posture routes (deep-dive W3, read-only v1).

Drives the REAL deployed middleware stack (HealthServer's app) for the
admin-gating pins, a REAL TurnStateStore schema for the snapshot reader, and
a REAL ModelCapacityBreaker for the capacity view. SAFE: tmp files only.
"""
from __future__ import annotations

import json
import sqlite3
import time
from types import SimpleNamespace

import pytest
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from src.config.schema import WebConfig
from src.health.server import HealthServer
from src.llm.model_breaker import ModelBreakerRegistry
from src.turn_state.observer import _connect_read_only, read_turn_snapshot
from src.turn_state.store import TurnStateStore
from src.web.api.turn_state import register_turn_state

FORBIDDEN_FIELDS = {
    "payload", "payload_digest", "session_snapshot", "content_digest",
    "prompt_policy_hash", "tool_catalog_hash", "lease_token",
    "effect_fingerprint", "result",
}


def _walk_keys(obj, out):
    if isinstance(obj, dict):
        for key, value in obj.items():
            out.add(key)
            _walk_keys(value, out)
    elif isinstance(obj, list):
        for item in obj:
            _walk_keys(item, out)


def _seed_turn(db_path, *, message_id, status, created_at, lease_expires_at=None,
               suspended_at=None, payload=None):
    conn = sqlite3.connect(db_path)
    conn.execute(
        """INSERT INTO turns (source, channel_id, message_id, turn_generation,
           revision, lease_token, lease_expires_at, status, last_progress_at,
           created_at, suspended_at, guild_id, user_id, content_digest,
           code_version, schema_version, prompt_policy_hash, tool_catalog_hash,
           session_snapshot, payload, payload_digest)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        ("discord", "chan-1", message_id, "gen-1", 3, "secret-lease-token",
         lease_expires_at, status, created_at, created_at, suspended_at,
         "guild-1", "user-1", "sha256:secret-digest", "3.80.0", 4,
         "policy-hash-secret", "catalog-hash-secret",
         json.dumps({"secret": "session"}), payload,
         "sha256:payload-secret" if payload else None),
    )
    conn.commit()
    conn.close()


def _seed_op(db_path, *, message_id, state, tool_name="run_command", seq=1):
    conn = sqlite3.connect(db_path)
    conn.execute(
        """INSERT INTO operations (source, channel_id, message_id,
           turn_generation, generation_seq, tool_call_id, state, tool_name,
           iteration, effect_fingerprint, result, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        ("discord", "chan-1", message_id, "gen-1", seq, f"call-{seq}", state,
         tool_name, 2, "fingerprint-secret", "result-secret",
         time.time(), time.time()),
    )
    conn.commit()
    conn.close()


def _store(tmp_path):
    return TurnStateStore(tmp_path / "turn_state.db")


def _bot(*, store=None, breakers=None, enabled=None):
    services = SimpleNamespace(turn_store=store, model_breakers=breakers)
    config = SimpleNamespace(
        web=SimpleNamespace(api_token="", api_tokens=None),
        turn_state=SimpleNamespace(enabled=enabled if enabled is not None else bool(store)),
    )
    return SimpleNamespace(config=config, services=services, api_token_manager=None)


def _bare_app(bot):
    routes = web.RouteTableDef()
    register_turn_state(routes, bot)
    app = web.Application()
    app.router.add_routes(routes)
    return app


class TestProductionMiddlewareGating:
    def _client(self, bot):
        config = WebConfig(api_token="configured-admin-token")
        bot.config.web = SimpleNamespace(
            api_token=config.api_token, api_tokens=None,
        )
        server = HealthServer(web_config=config)
        routes = web.RouteTableDef()
        register_turn_state(routes, bot)
        server._app.router.add_routes(routes)
        admin_sid, _ = server._session_manager.create(
            identity=SimpleNamespace(user_id="admin-user", tier="admin"))
        user_sid, _ = server._session_manager.create(
            identity=SimpleNamespace(user_id="plain-user", tier="user"))
        return TestClient(TestServer(server._app)), admin_sid, user_sid

    async def test_non_admin_gets_403_admin_gets_200_through_real_stack(self, tmp_path):
        store = _store(tmp_path)
        client, admin_sid, user_sid = self._client(_bot(store=store))
        async with client:
            for path in ("/api/turn-state/turns", "/api/turn-state/capacity-breakers"):
                denied = await client.get(
                    path, headers={"Authorization": f"Bearer {user_sid}"})
                assert denied.status == 403, path
                anon = await client.get(path)
                assert anon.status == 401, path
            ok = await client.get(
                "/api/turn-state/turns",
                headers={"Authorization": f"Bearer {admin_sid}"})
            assert ok.status == 200
            assert (await ok.json())["availability"] == "available"


class TestTurnsAvailability:
    async def test_not_enabled_when_store_absent(self):
        async with TestClient(TestServer(_bare_app(_bot(store=None, enabled=False)))) as c:
            body = await (await c.get("/api/turn-state/turns")).json()
        assert body["availability"] == "not_enabled"
        assert body["configured_enabled"] is False
        assert body["data"] == {}

    async def test_unavailable_503_when_read_fails(self, tmp_path):
        store = _store(tmp_path)
        store.db_path = str(tmp_path / "missing" / "nope.db")
        async with TestClient(TestServer(_bare_app(_bot(store=store)))) as c:
            resp = await c.get("/api/turn-state/turns")
            assert resp.status == 503
            assert (await resp.json())["availability"] == "unavailable"

    async def test_populated_snapshot_counts_census_and_priority_facts(self, tmp_path):
        store = _store(tmp_path)
        now = time.time()
        _seed_turn(store.db_path, message_id="m-active", status="ACTIVE",
                   created_at=now - 10, lease_expires_at=now + 300,
                   payload=json.dumps({"secret": "checkpoint"}))
        _seed_turn(store.db_path, message_id="m-expired", status="ACTIVE",
                   created_at=now - 20, lease_expires_at=now - 60)
        _seed_turn(store.db_path, message_id="m-susp", status="SUSPENDED",
                   created_at=now - 30, suspended_at=now - 30)
        # Terminal turn kept visible ONLY by its manual-resolution op.
        _seed_turn(store.db_path, message_id="m-term", status="TERMINAL_FAILED",
                   created_at=now - 40)
        _seed_op(store.db_path, message_id="m-term",
                 state="MANUAL_RESOLUTION_REQUIRED")
        _seed_op(store.db_path, message_id="m-active", state="OUTCOME_UNKNOWN", seq=2)
        # A settled op is history, not posture — must not appear.
        _seed_op(store.db_path, message_id="m-active", state="APPLIED", seq=3)
        # Plain terminal turn with no attention ops: invisible.
        _seed_turn(store.db_path, message_id="m-done", status="TERMINAL_COMPLETED",
                   created_at=now - 50)

        async with TestClient(TestServer(_bare_app(_bot(store=store)))) as c:
            body = await (await c.get("/api/turn-state/turns")).json()

        assert body["availability"] == "available"
        counts = body["data"]["counts"]
        assert counts["active"] == 2
        assert counts["suspended"] == 1
        assert counts["attention_required"] == 2
        assert counts["outcome_unknown_operations"] == 1
        assert counts["manual_resolution_operations"] == 1

        turns = {t["message_id"]: t for t in body["data"]["turns"]}
        assert set(turns) == {"m-active", "m-expired", "m-susp", "m-term"}
        # Expired lease renders AS-IS: status untouched, expiry fact carried.
        assert turns["m-expired"]["status"] == "ACTIVE"
        assert turns["m-expired"]["lease_expires_at"] < now
        assert turns["m-active"]["has_checkpoint"] is True
        assert turns["m-expired"]["has_checkpoint"] is False
        op_states = {op["state"] for op in turns["m-active"]["operations"]}
        assert op_states == {"OUTCOME_UNKNOWN"}
        assert turns["m-term"]["operations"][0]["state"] == "MANUAL_RESOLUTION_REQUIRED"

        seen_keys: set = set()
        _walk_keys(body, seen_keys)
        leaked = seen_keys & FORBIDDEN_FIELDS
        assert not leaked, f"sensitive fields leaked: {leaked}"

    async def test_limit_clamped_and_truncation_flagged(self, tmp_path):
        store = _store(tmp_path)
        now = time.time()
        for i in range(5):
            _seed_turn(store.db_path, message_id=f"m-{i}", status="ACTIVE",
                       created_at=now - i)
        async with TestClient(TestServer(_bare_app(_bot(store=store)))) as c:
            body = await (await c.get("/api/turn-state/turns?limit=3")).json()
            assert len(body["data"]["turns"]) == 3
            assert body["data"]["truncated"] is True
            clamped = await (await c.get("/api/turn-state/turns?limit=999")).json()
            assert clamped["limit"] == 200
            bad = await (await c.get("/api/turn-state/turns?limit=junk")).json()
            assert bad["limit"] == 100


class TestReadOnlyIsolation:
    async def test_reader_cannot_write_and_leaves_bytes_untouched(self, tmp_path):
        store = _store(tmp_path)
        _seed_turn(store.db_path, message_id="m-1", status="ACTIVE",
                   created_at=time.time())
        before = open(store.db_path, "rb").read()
        conn = _connect_read_only(store.db_path)
        try:
            with pytest.raises(sqlite3.OperationalError):
                conn.execute("DELETE FROM turns")
            # Even flipping the pragma back cannot escape mode=ro — the
            # connection itself was opened without write capability.
            try:
                conn.execute("PRAGMA query_only=OFF")
            except sqlite3.OperationalError:
                pass
            with pytest.raises(sqlite3.OperationalError):
                conn.execute("DELETE FROM turns")
        finally:
            conn.close()
        read_turn_snapshot(store.db_path, 10)
        assert open(store.db_path, "rb").read() == before

    async def test_reader_never_touches_the_store_write_lock(self, tmp_path):
        store = _store(tmp_path)
        _seed_turn(store.db_path, message_id="m-1", status="ACTIVE",
                   created_at=time.time())
        # A held write lock must not block the observability read.
        with store._write_lock:
            data = read_turn_snapshot(store.db_path, 10)
        assert data["counts"]["active"] == 1


class TestCapacityBreakers:
    def _registry_with_open_breaker(self):
        registry = ModelBreakerRegistry(generation_threshold=2)
        breaker = registry.for_model("codex", "gpt-5.6-sol")
        breaker.record_generation_failure()
        breaker.record_generation_failure()
        return registry, breaker

    async def test_not_enabled_without_registry(self):
        async with TestClient(TestServer(_bare_app(_bot(breakers=None)))) as c:
            body = await (await c.get("/api/turn-state/capacity-breakers")).json()
        assert body["availability"] == "not_enabled"
        assert body["lifetime"] == "process"

    async def test_open_breaker_truthful_and_probing_only_via_acquire(self):
        registry, breaker = self._registry_with_open_breaker()
        async with TestClient(TestServer(_bare_app(_bot(breakers=registry)))) as c:
            body = await (await c.get("/api/turn-state/capacity-breakers")).json()
            row = body["data"]["breakers"][0]
            assert (row["provider"], row["model"]) == ("codex", "gpt-5.6-sol")
            assert row["state"] == "open"
            assert row["cooldown_remaining_seconds"] > 0
            assert row["probe_eligible"] is False

            # Cooldown elapses (rewind the open timestamp rather than
            # patching the process clock): eligible, but a SNAPSHOT never
            # claims the probe slot — state stays "open" until
            # acquire_attempt().
            breaker._opened_at -= 10_000
            body = await (await c.get("/api/turn-state/capacity-breakers")).json()
            row = body["data"]["breakers"][0]
            assert row["state"] == "open"
            assert row["probe_eligible"] is True
            assert row["cooldown_remaining_seconds"] == 0

            token = breaker.acquire_attempt()
            assert not isinstance(token, float)
            body = await (await c.get("/api/turn-state/capacity-breakers")).json()
            assert body["data"]["breakers"][0]["state"] == "probing"

    async def test_colon_model_key_splits_on_first_colon_only(self):
        registry = ModelBreakerRegistry()
        registry.for_model("ollama", "qwen3:14b")
        async with TestClient(TestServer(_bare_app(_bot(breakers=registry)))) as c:
            body = await (await c.get("/api/turn-state/capacity-breakers")).json()
        row = body["data"]["breakers"][0]
        assert (row["provider"], row["model"]) == ("ollama", "qwen3:14b")
