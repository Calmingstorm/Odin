"""Event-controlled single-use rotation across disposable pool reloads."""
import asyncio
import json
import time

import pytest

from src.llm import codex_auth as ca
from tests.test_codex_account_mutation_regressions import creds, setup


class SingleUseOAuth:
    def __init__(self):
        self.entered = asyncio.Event()
        self.release = asyncio.Event()
        self.consumed = []

    def session(self, **kwargs):
        transport = self

        class Response:
            def __init__(self, token):
                self.token = token
                self.status = 200

            async def __aenter__(self):
                self.status = 400 if self.token in transport.consumed else 200
                transport.consumed.append(self.token)
                transport.entered.set()
                await transport.release.wait()
                return self

            async def __aexit__(self, *args):
                pass

            async def read(self):
                if self.status != 200:
                    return b'{"error":"refresh_token_reused"}'
                return json.dumps({"access_token": "synthetic-successor",
                                   "refresh_token": "synthetic-next",
                                   "expires_in": 3600}).encode()

        class Session:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *args):
                pass

            def post(self, url, **kwargs):
                assert url == ca.TOKEN_URL
                return Response(kwargs["data"]["refresh_token"])

        return Session()


@pytest.fixture(autouse=True)
def isolated_keys(tmp_path, monkeypatch):
    monkeypatch.setattr("src.llm.account_key.DEFAULT_KEY_PATH", tmp_path / "key.secret")


@pytest.mark.asyncio
@pytest.mark.parametrize("source", ["shadow", "canonical", "single", "reorder", "pure_reorder"])
@pytest.mark.parametrize("revision", [False, True])
@pytest.mark.parametrize("sync", [False, True])
async def test_same_chain_reload_hands_off_inflight_rotation(
    tmp_path, monkeypatch, source, revision, sync,
):
    original = creds("A")
    if revision:
        original = ca.mark_authorized_account(original)
    path, pool, *_ = setup(tmp_path, original if source == "single" else [original, creds("B")])
    transport = SingleUseOAuth()
    monkeypatch.setattr(ca.aiohttp, "ClientSession", transport.session)
    auth = pool._accounts[0]
    refreshing = asyncio.create_task(pool.force_refresh(0, original["access_token"]))
    auth.mark_rate_limited(3600)
    acquisition = None
    try:
        await asyncio.wait_for(transport.entered.wait(), 5)
        replacement = original if source == "pure_reorder" else {
            **original, "access_token": "synthetic-edited-bearer",
            "expires_at": int(time.time()) + ca.REFRESH_MARGIN // 2,
        }
        index = 1 if source in {"reorder", "pure_reorder"} else 0
        if source == "shadow":
            (tmp_path / "codex_auth_0.json").write_text(json.dumps(replacement))
        else:
            rows = replacement if source == "single" else (
                [creds("B"), replacement] if index == 1 else [replacement, creds("B")]
            )
            path.write_text(json.dumps(rows))
        if sync:
            pool.reload()
        else:
            await pool.reload_async()
        # Observe actual ordinary acquisition, not a second force-refresh probe.
        admitted = asyncio.Event()
        load = ca.CodexAuth._load

        def observe_load(current):
            if asyncio.current_task() is acquisition:
                admitted.set()
            return load(current)

        monkeypatch.setattr(ca.CodexAuth, "_load", observe_load)
        if source == "pure_reorder":
            # A still-valid bearer can be served while force-refresh runs;
            # acquire after it settles to verify the successor follows A.
            transport.release.set()
            assert await asyncio.wait_for(refreshing, 5)
        acquisition = asyncio.create_task(pool.token_for(index))
        await asyncio.wait_for(admitted.wait(), 5)
        await asyncio.sleep(0)  # allow a wrongly independent OAuth task to enter
    finally:
        transport.release.set()
        tasks = [refreshing] + ([acquisition] if acquisition is not None else [])
        results = await asyncio.wait_for(asyncio.gather(*tasks, return_exceptions=True), 5)
    assert results == [True, ("synthetic-successor", "A")]
    assert transport.consumed == [original["refresh_token"]]
    assert pool._accounts[index] is auth
    assert auth.is_rate_limited() is (source == "pure_reorder")
    raw = json.loads(path.read_text())
    current = raw if source == "single" else raw[index]
    assert current["refresh_token"] == "synthetic-next"
    assert current.get("_authorization_revision") == original.get("_authorization_revision")
    assert auth._load() == current
    if source != "single":
        assert json.loads((tmp_path / f"codex_auth_{index}.json").read_text()) == current
        assert raw[1 - index] == creds("B")
    await pool.reload_async()
    assert await pool.token_for(index) == ("synthetic-successor", "A")
    assert transport.consumed == [original["refresh_token"]]


@pytest.mark.asyncio
@pytest.mark.parametrize("mutation", [
    "shadow_revision", "canonical_revision", "refresh_token", "account", "remove", "remove_readd",
])
async def test_changed_authorization_does_not_inherit_inflight_publication(
    tmp_path, monkeypatch, mutation,
):
    original = ca.mark_authorized_account(creds("A"))
    path, pool, *_ = setup(tmp_path, [original, creds("B")])
    transport = SingleUseOAuth()
    monkeypatch.setattr(ca.aiohttp, "ClientSession", transport.session)
    auth = pool._accounts[0]
    refreshing = asyncio.create_task(pool.force_refresh(0))
    try:
        await asyncio.wait_for(transport.entered.wait(), 5)
        replacement = {**original, "access_token": "synthetic-replacement"}
        if mutation.endswith("revision"):
            replacement = ca.mark_authorized_account(replacement)
        elif mutation == "refresh_token":
            replacement["refresh_token"] = "synthetic-unrelated-chain"
        elif mutation == "account":
            replacement["account_id"] = "C"
        if mutation == "shadow_revision":
            (tmp_path / "codex_auth_0.json").write_text(json.dumps(replacement))
        else:
            path.write_text(json.dumps([creds("B")] if mutation.startswith("remove")
                                       else [replacement, creds("B")]))
        await pool.reload_async()
        if mutation == "remove_readd":
            path.write_text(json.dumps([original, creds("B")]))
            await pool.reload_async()
        assert pool._accounts[0] is not auth
        canonical_before = path.read_text()
        shadows_before = {p.name: p.read_text() for p in tmp_path.glob("codex_auth_*.json")}
    finally:
        transport.release.set()
        result = await asyncio.wait_for(refreshing, 5)
    assert result is False
    assert path.read_text() == canonical_before
    assert {p.name: p.read_text() for p in tmp_path.glob("codex_auth_*.json")} == shadows_before
    assert transport.consumed == [original["refresh_token"]]
