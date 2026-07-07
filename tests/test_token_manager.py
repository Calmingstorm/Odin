"""Coverage for ApiTokenManager (RFC-006 P1 — security bucket, target ≥90%).

Drives the real manager against tmp_path JSON files: load-validation branches,
HMAC-safe resolve, the async CRUD lifecycle, and the security invariant that
raw token values are never persisted or listed.
"""
from __future__ import annotations

import json

import pytest

from src.permissions.token_manager import ApiTokenManager, _hash_token


def _mgr(tmp_path):
    return ApiTokenManager(path=str(tmp_path / "api_tokens.json"))


class TestResolve:
    @pytest.mark.asyncio
    async def test_valid_token_resolves_to_identity(self, tmp_path):
        mgr = _mgr(tmp_path)
        ident = await mgr.create_token("u1", username="Alice", tier="admin")
        resolved = mgr.resolve(ident.token)
        assert resolved is not None and resolved.user_id == "u1"

    def test_empty_token_returns_none(self, tmp_path):
        assert _mgr(tmp_path).resolve("") is None

    @pytest.mark.asyncio
    async def test_wrong_token_returns_none(self, tmp_path):
        mgr = _mgr(tmp_path)
        await mgr.create_token("u1")
        assert mgr.resolve("not-the-token") is None


class TestCreateAndSecurity:
    @pytest.mark.asyncio
    async def test_create_returns_raw_token_once(self, tmp_path):
        ident = await _mgr(tmp_path).create_token("u1")
        assert ident.token and len(ident.token) > 20

    @pytest.mark.asyncio
    async def test_duplicate_user_id_rejected(self, tmp_path):
        mgr = _mgr(tmp_path)
        await mgr.create_token("u1")
        with pytest.raises(ValueError, match="already exists"):
            await mgr.create_token("u1")

    @pytest.mark.asyncio
    async def test_raw_token_never_persisted(self, tmp_path):
        # The crown-jewel invariant: only the hash + 8-char prefix hit disk.
        path = tmp_path / "api_tokens.json"
        ident = await ApiTokenManager(path=str(path)).create_token("u1")
        on_disk = json.loads(path.read_text())
        assert on_disk[0]["token_hash"] == _hash_token(ident.token)
        assert ident.token not in path.read_text()
        assert "token" not in on_disk[0] or on_disk[0].get("token") == ""

    @pytest.mark.asyncio
    async def test_list_tokens_masks_to_prefix(self, tmp_path):
        mgr = _mgr(tmp_path)
        ident = await mgr.create_token("u1")
        listed = mgr.list_tokens()
        assert listed[0]["token"].endswith("...")
        assert ident.token not in listed[0]["token"]
        assert listed[0]["source"] == "dynamic"


class TestGetUpdateRegenerateDelete:
    @pytest.mark.asyncio
    async def test_get_present_and_absent(self, tmp_path):
        mgr = _mgr(tmp_path)
        await mgr.create_token("u1", tier="user")
        assert mgr.get("u1").tier == "user"
        assert mgr.get("nobody") is None

    @pytest.mark.asyncio
    async def test_update_changes_fields(self, tmp_path):
        mgr = _mgr(tmp_path)
        await mgr.create_token("u1", tier="admin")
        updated = await mgr.update_token("u1", tier="guest", label="lowered")
        assert updated.tier == "guest" and updated.label == "lowered"

    @pytest.mark.asyncio
    async def test_update_absent_user_returns_none(self, tmp_path):
        assert await _mgr(tmp_path).update_token("nobody", tier="guest") is None

    @pytest.mark.asyncio
    async def test_regenerate_changes_token_and_invalidates_old(self, tmp_path):
        mgr = _mgr(tmp_path)
        old = (await mgr.create_token("u1")).token
        new = await mgr.regenerate_token("u1")
        assert new and new != old
        assert mgr.resolve(old) is None
        assert mgr.resolve(new).user_id == "u1"

    @pytest.mark.asyncio
    async def test_regenerate_absent_user_returns_none(self, tmp_path):
        assert await _mgr(tmp_path).regenerate_token("nobody") is None

    @pytest.mark.asyncio
    async def test_delete_present_and_absent(self, tmp_path):
        mgr = _mgr(tmp_path)
        await mgr.create_token("u1")
        assert await mgr.delete_token("u1") is True
        assert await mgr.delete_token("u1") is False


class TestPersistenceAndReload:
    @pytest.mark.asyncio
    async def test_tokens_survive_reload(self, tmp_path):
        path = str(tmp_path / "api_tokens.json")
        ident = await ApiTokenManager(path=path).create_token(
            "u1", tier="user", allowed_tools=["web_search"], allowed_hosts=["h1"])
        reloaded = ApiTokenManager(path=path)
        assert reloaded.resolve(ident.token).user_id == "u1"
        got = reloaded.get("u1")
        assert got.tier == "user" and got.allowed_tools == ["web_search"]
        assert got.allowed_hosts == ["h1"]


class TestLoadValidation:
    def _write(self, tmp_path, data):
        p = tmp_path / "api_tokens.json"
        p.write_text(json.dumps(data) if not isinstance(data, str) else data)
        return ApiTokenManager(path=str(p))

    def test_missing_file_is_empty(self, tmp_path):
        assert _mgr(tmp_path).list_tokens() == []

    def test_non_list_root_ignored(self, tmp_path):
        assert self._write(tmp_path, {"not": "a list"}).list_tokens() == []

    def test_invalid_json_ignored(self, tmp_path):
        assert self._write(tmp_path, "{ broken json").list_tokens() == []

    def test_entry_missing_user_id_skipped(self, tmp_path):
        mgr = self._write(tmp_path, [{"token_hash": "abc"}])
        assert mgr.list_tokens() == []

    def test_entry_missing_hash_skipped(self, tmp_path):
        mgr = self._write(tmp_path, [{"user_id": "u1"}])
        assert mgr.list_tokens() == []

    def test_invalid_tier_skipped(self, tmp_path):
        mgr = self._write(tmp_path, [{"user_id": "u1", "token_hash": "h", "tier": "wizard"}])
        assert mgr.list_tokens() == []

    def test_bad_allowed_tools_skipped(self, tmp_path):
        mgr = self._write(tmp_path, [
            {"user_id": "u1", "token_hash": "h", "allowed_tools": [1, 2]}])
        assert mgr.list_tokens() == []

    def test_bad_allowed_hosts_skipped(self, tmp_path):
        mgr = self._write(tmp_path, [
            {"user_id": "u1", "token_hash": "h", "allowed_hosts": "not-a-list"}])
        assert mgr.list_tokens() == []

    def test_null_allowed_hosts_becomes_none(self, tmp_path):
        mgr = self._write(tmp_path, [
            {"user_id": "u1", "token_hash": "h", "allowed_hosts": None}])
        assert mgr.get("u1").allowed_hosts is None

    def test_non_dict_entry_caught_per_entry(self, tmp_path):
        # A non-dict list item makes entry.get() raise — the per-entry
        # except swallows it and keeps loading the rest.
        mgr = self._write(tmp_path, [
            "i am not a dict",
            {"user_id": "u2", "token_hash": "h2"},
        ])
        assert [t["user_id"] for t in mgr.list_tokens()] == ["u2"]

    def test_valid_entry_loads(self, tmp_path):
        mgr = self._write(tmp_path, [{
            "user_id": "u1", "token_hash": "h", "token_prefix": "pre",
            "tier": "user", "allowed_tools": ["web_search"], "allowed_hosts": ["h1"],
            "default_host": "h1", "username": "Bob", "label": "svc",
        }])
        got = mgr.get("u1")
        assert got.tier == "user" and got.username == "Bob" and got.default_host == "h1"
