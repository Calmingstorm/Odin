"""Coverage for HostAccessManager (RFC-006 P1 — security bucket, target ≥90%).

This is the live host-authorization boundary (verified live 2026-07-06:
unlisted identities are playground-jailed, not inherit-all). The tests drive
the real enforcement matrix — None=inherit-all vs []=deny-all vs whitelist,
crossed with request-scoped contextvar narrowing — plus persistence and the
default-host resolution rules.
"""
from __future__ import annotations

import json

import pytest

from src.permissions.host_access import HostAccessEntry, HostAccessManager

HOSTS = ["alpha", "beta", "gamma"]


def _mgr(tmp_path, available=HOSTS):
    return HostAccessManager(path=str(tmp_path / "host_access.json"),
                             available_hosts=available)


class TestEntrySemantics:
    def test_from_dict_null_hosts_is_inherit_all(self):
        e = HostAccessEntry.from_dict({"allowed_hosts": None, "default_host": "x"})
        assert e.allowed_hosts is None and e.default_host == "x"

    def test_from_dict_empty_list_is_deny_all(self):
        assert HostAccessEntry.from_dict({"allowed_hosts": []}).allowed_hosts == []

    def test_from_dict_missing_key_is_inherit_all(self):
        assert HostAccessEntry.from_dict({}).allowed_hosts is None

    def test_to_dict_roundtrip(self):
        e = HostAccessEntry(["alpha"], "alpha")
        assert e.to_dict() == {"allowed_hosts": ["alpha"], "default_host": "alpha"}


class TestIsHostAllowed:
    def test_no_entry_inherits_all_available(self, tmp_path):
        # Default policy is inherit-all (None) out of the box.
        mgr = _mgr(tmp_path)
        assert mgr.is_host_allowed("stranger", "alpha") is True
        assert mgr.is_host_allowed("stranger", "not-a-host") is False

    @pytest.mark.asyncio
    async def test_whitelist_entry_allows_only_listed(self, tmp_path):
        mgr = _mgr(tmp_path)
        await mgr.set_user("u1", ["alpha"], "alpha")
        assert mgr.is_host_allowed("u1", "alpha") is True
        assert mgr.is_host_allowed("u1", "beta") is False

    @pytest.mark.asyncio
    async def test_empty_list_entry_denies_all(self, tmp_path):
        mgr = _mgr(tmp_path)
        await mgr.set_user("locked", [], "")
        assert mgr.is_host_allowed("locked", "alpha") is False

    def test_request_scope_narrows_scopeless_user(self, tmp_path):
        mgr = _mgr(tmp_path)
        tok = mgr.set_request_host_scope(["alpha"])
        try:
            assert mgr.is_host_allowed("stranger", "alpha") is True
            assert mgr.is_host_allowed("stranger", "beta") is False
        finally:
            mgr.reset_request_host_scope(tok)

    @pytest.mark.asyncio
    async def test_request_scope_further_narrows_entried_user(self, tmp_path):
        mgr = _mgr(tmp_path)
        await mgr.set_user("u1", ["alpha", "beta"], "alpha")
        tok = mgr.set_request_host_scope(["alpha"])
        try:
            assert mgr.is_host_allowed("u1", "alpha") is True
            assert mgr.is_host_allowed("u1", "beta") is False  # scope removes it
        finally:
            mgr.reset_request_host_scope(tok)


class TestGetAllowedHosts:
    def test_no_entry_returns_all_available(self, tmp_path):
        assert _mgr(tmp_path).get_allowed_hosts("stranger") == HOSTS

    @pytest.mark.asyncio
    async def test_whitelist_intersected_with_available(self, tmp_path):
        mgr = _mgr(tmp_path)
        # "ghost" isn't an available host; set_user filters it at write time,
        # so read-back is only the valid subset.
        await mgr.set_user("u1", ["alpha", "ghost"], "alpha")
        assert mgr.get_allowed_hosts("u1") == ["alpha"]

    def test_scope_only_for_scopeless_user(self, tmp_path):
        mgr = _mgr(tmp_path)
        tok = mgr.set_request_host_scope(["beta", "ghost"])
        try:
            assert mgr.get_allowed_hosts("stranger") == ["beta"]
        finally:
            mgr.reset_request_host_scope(tok)

    @pytest.mark.asyncio
    async def test_scope_narrows_entried_user_allowed_list(self, tmp_path):
        mgr = _mgr(tmp_path)
        await mgr.set_user("u1", ["alpha", "beta"], "alpha")
        tok = mgr.set_request_host_scope(["beta"])
        try:
            assert mgr.get_allowed_hosts("u1") == ["beta"]  # scope trims alpha
        finally:
            mgr.reset_request_host_scope(tok)


class TestGetDefaultHost:
    @pytest.mark.asyncio
    async def test_entry_default_host_used_when_valid(self, tmp_path):
        mgr = _mgr(tmp_path)
        await mgr.set_user("u1", ["alpha", "beta"], "beta")
        assert mgr.get_default_host("u1") == "beta"

    def test_request_default_wins_when_in_effective(self, tmp_path):
        mgr = _mgr(tmp_path)
        tok = mgr.set_request_default_host("gamma")
        try:
            assert mgr.get_default_host("stranger") == "gamma"
        finally:
            mgr.reset_request_default_host(tok)

    def test_request_default_ignored_when_not_available(self, tmp_path):
        mgr = _mgr(tmp_path)
        tok = mgr.set_request_default_host("nonexistent")
        try:
            # falls through to first allowed
            assert mgr.get_default_host("stranger") == "alpha"
        finally:
            mgr.reset_request_default_host(tok)

    def test_scopeless_user_falls_back_to_first_allowed(self, tmp_path):
        assert _mgr(tmp_path).get_default_host("stranger") == "alpha"

    def test_scope_no_entry_returns_first_of_scope(self, tmp_path):
        mgr = _mgr(tmp_path)
        tok = mgr.set_request_host_scope(["beta", "gamma"])
        try:
            assert mgr.get_default_host("stranger") == "beta"
        finally:
            mgr.reset_request_host_scope(tok)

    @pytest.mark.asyncio
    async def test_deny_all_user_has_empty_default(self, tmp_path):
        mgr = _mgr(tmp_path)
        await mgr.set_user("locked", [], "")
        assert mgr.get_default_host("locked") == ""


class TestSetUserNormalization:
    @pytest.mark.asyncio
    async def test_default_host_snapped_to_first_valid(self, tmp_path):
        mgr = _mgr(tmp_path)
        # default 'beta' not in the whitelist -> snapped to first valid (alpha)
        await mgr.set_user("u1", ["alpha"], "beta")
        assert mgr.get_entry("u1").default_host == "alpha"

    @pytest.mark.asyncio
    async def test_default_host_cleared_when_no_valid_hosts(self, tmp_path):
        mgr = _mgr(tmp_path)
        await mgr.set_user("u1", ["ghost"], "ghost")  # all invalid
        entry = mgr.get_entry("u1")
        assert entry.allowed_hosts == [] and entry.default_host == ""

    @pytest.mark.asyncio
    async def test_inherit_all_allows_any_real_default(self, tmp_path):
        mgr = _mgr(tmp_path)
        await mgr.set_user("u1", None, "gamma")
        assert mgr.get_entry("u1").allowed_hosts is None
        assert mgr.get_entry("u1").default_host == "gamma"

    @pytest.mark.asyncio
    async def test_bogus_default_cleared_under_inherit_all(self, tmp_path):
        mgr = _mgr(tmp_path)
        await mgr.set_user("u1", None, "ghost")
        assert mgr.get_entry("u1").default_host == ""


class TestDefaultPolicyAndCrud:
    @pytest.mark.asyncio
    async def test_set_default_policy_applies_to_strangers(self, tmp_path):
        mgr = _mgr(tmp_path)
        await mgr.set_default_policy(["alpha"], "alpha")
        assert mgr.is_host_allowed("stranger", "beta") is False
        assert mgr.is_host_allowed("stranger", "alpha") is True

    @pytest.mark.asyncio
    async def test_set_default_policy_snaps_default(self, tmp_path):
        mgr = _mgr(tmp_path)
        await mgr.set_default_policy(["alpha"], "beta")
        assert mgr.default_policy.default_host == "alpha"

    @pytest.mark.asyncio
    async def test_set_default_policy_filters_invalid_hosts(self, tmp_path):
        mgr = _mgr(tmp_path)
        await mgr.set_default_policy(["alpha", "ghost"], "alpha")
        assert mgr.default_policy.allowed_hosts == ["alpha"]

    @pytest.mark.asyncio
    async def test_set_default_policy_clears_unavailable_default(self, tmp_path):
        mgr = _mgr(tmp_path)
        await mgr.set_default_policy(None, "ghost")
        assert mgr.default_policy.default_host == ""

    @pytest.mark.asyncio
    async def test_delete_user_present_and_absent(self, tmp_path):
        mgr = _mgr(tmp_path)
        await mgr.set_user("u1", ["alpha"], "alpha")
        assert await mgr.delete_user("u1") is True
        assert await mgr.delete_user("u1") is False

    @pytest.mark.asyncio
    async def test_has_user_entry_and_list(self, tmp_path):
        mgr = _mgr(tmp_path)
        await mgr.set_user("u1", ["alpha"], "alpha")
        assert mgr.has_user_entry("u1") and not mgr.has_user_entry("nobody")
        assert "u1" in mgr.list_users()

    def test_available_hosts_property_and_setter(self, tmp_path):
        mgr = _mgr(tmp_path)
        assert mgr.available_hosts == HOSTS
        mgr.set_available_hosts(["only"])
        assert mgr.available_hosts == ["only"]


class TestPersistence:
    @pytest.mark.asyncio
    async def test_entries_and_policy_survive_reload(self, tmp_path):
        path = str(tmp_path / "host_access.json")
        mgr = HostAccessManager(path=path, available_hosts=HOSTS)
        await mgr.set_user("u1", ["alpha"], "alpha")
        await mgr.set_default_policy(["beta"], "beta")
        reloaded = HostAccessManager(path=path, available_hosts=HOSTS)
        assert reloaded.get_entry("u1").allowed_hosts == ["alpha"]
        assert reloaded.default_policy.allowed_hosts == ["beta"]

    def test_non_dict_root_ignored(self, tmp_path):
        p = tmp_path / "host_access.json"
        p.write_text(json.dumps(["not", "a", "dict"]))
        mgr = HostAccessManager(path=str(p), available_hosts=HOSTS)
        assert mgr.list_users() == {}

    def test_invalid_json_ignored(self, tmp_path):
        p = tmp_path / "host_access.json"
        p.write_text("{ broken")
        assert HostAccessManager(path=str(p), available_hosts=HOSTS).list_users() == {}
