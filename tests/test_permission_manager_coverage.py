"""Extra coverage for PermissionManager (RFC-006 P1 — manager.py 81→95).

Complements test_permissions.py: the request-scoped tier contextvar, the
async CRUD lock paths, invalid-tier rejection, overrides persistence, and the
guest/user tool-filtering branches.
"""
from __future__ import annotations

import pytest

from src.permissions.manager import USER_TIER_TOOLS, PermissionManager


def _mgr(tmp_path, config_tiers=None, default="user"):
    return PermissionManager(
        config_tiers=config_tiers or {},
        default_tier=default,
        overrides_path=str(tmp_path / "permissions.json"),
    )


class TestGetTierPrecedence:
    def test_request_scope_beats_override_and_config(self, tmp_path):
        mgr = _mgr(tmp_path, {"u1": "admin"})
        mgr.set_tier("u1", "guest")
        tok = mgr.set_request_tier("user")
        try:
            assert mgr.get_tier("u1") == "user"
        finally:
            mgr.reset_request_tier(tok)
        # after reset, override wins over config
        assert mgr.get_tier("u1") == "guest"

    def test_invalid_request_tier_is_ignored(self, tmp_path):
        mgr = _mgr(tmp_path, default="user")
        tok = mgr.set_request_tier("wizard")  # not a valid tier -> None
        try:
            assert mgr.get_tier("anyone") == "user"
        finally:
            mgr.reset_request_tier(tok)

    def test_config_then_default(self, tmp_path):
        mgr = _mgr(tmp_path, {"u1": "admin"}, default="guest")
        assert mgr.get_tier("u1") == "admin"
        assert mgr.get_tier("stranger") == "guest"


class TestSetTier:
    def test_invalid_tier_raises(self, tmp_path):
        with pytest.raises(ValueError, match="Invalid tier"):
            _mgr(tmp_path).set_tier("u1", "wizard")

    @pytest.mark.asyncio
    async def test_async_set_and_delete(self, tmp_path):
        mgr = _mgr(tmp_path)
        await mgr.async_set_tier("u1", "admin")
        assert mgr.get_tier("u1") == "admin"
        assert await mgr.async_delete_tier("u1") is True
        assert await mgr.async_delete_tier("u1") is False

    def test_overrides_persist_across_reload(self, tmp_path):
        path = str(tmp_path / "permissions.json")
        PermissionManager({}, "user", path).set_tier("u1", "admin")
        assert PermissionManager({}, "user", path).get_tier("u1") == "admin"

    def test_corrupt_overrides_file_ignored(self, tmp_path):
        path = tmp_path / "permissions.json"
        path.write_text("{ not valid json")
        mgr = PermissionManager({}, "user", str(path))
        assert mgr.get_tier("anyone") == "user"  # falls back cleanly


class TestToolFiltering:
    _TOOLS = [{"name": n} for n in ("web_search", "run_command", "apply_patch")]

    def test_admin_gets_everything(self, tmp_path):
        mgr = _mgr(tmp_path, {"a": "admin"})
        assert mgr.filter_tools("a", self._TOOLS) == self._TOOLS
        assert mgr.allowed_tool_names("a") is None

    def test_guest_gets_nothing(self, tmp_path):
        mgr = _mgr(tmp_path, {"g": "guest"})
        assert mgr.filter_tools("g", self._TOOLS) is None
        assert mgr.allowed_tool_names("g") == set()

    def test_user_gets_readonly_allowlist(self, tmp_path):
        mgr = _mgr(tmp_path, {"u": "user"})
        names = {t["name"] for t in mgr.filter_tools("u", self._TOOLS)}
        assert names == {"web_search"}  # only the allowlisted read-only tool
        assert mgr.allowed_tool_names("u") == set(USER_TIER_TOOLS)

    def test_is_admin_and_is_guest(self, tmp_path):
        mgr = _mgr(tmp_path, {"a": "admin", "g": "guest"})
        assert mgr.is_admin("a") and not mgr.is_admin("g")
        assert mgr.is_guest("g") and not mgr.is_guest("a")
