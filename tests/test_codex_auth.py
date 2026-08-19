"""Coverage for CodexAuth / CodexAuthPool (RFC-006 P2 — credential paths ≥85%).

This is the multi-account token-rotation subsystem whose single-use-refresh-
token mishandling once killed all accounts on every restart. The tests drive
the real token lifecycle and pool rotation against tmp files, faking only the
aiohttp transport (aioresponses is incompatible with this aiohttp version).
"""
from __future__ import annotations

import base64
import json

import pytest

from src.llm import codex_auth as ca
from src.llm.codex_auth import CodexAuth, CodexAuthPool


def _jwt(payload: dict) -> str:
    def _b64(d: bytes) -> str:
        return base64.urlsafe_b64encode(d).rstrip(b"=").decode()
    body = _b64(json.dumps(payload).encode())
    return f"{_b64(b'{}')}.{body}.{_b64(b'sig')}"


def _creds(access="tok", refresh="ref", expires_at=9_999_999_999, **extra):
    return {"access_token": access, "refresh_token": refresh,
            "expires_at": expires_at, **extra}


class _FakeResp:
    def __init__(self, status=200, body=b""):
        self.status = status
        self._body = body

    async def read(self):
        return self._body

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False


class _FakeSession:
    """Records posts and returns a scripted response; fakes aiohttp.ClientSession."""

    last = None

    def __init__(self, *a, **k):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    def post(self, url, **kwargs):
        _FakeSession.last = (url, kwargs)
        return _FakeSession.response


# ── module-level helpers ─────────────────────────────────────────────

class TestModuleHelpers:
    def test_atomic_write_is_0600(self, tmp_path):
        p = tmp_path / "secret.json"
        ca._atomic_write_secure(p, "data")
        assert p.read_text() == "data"
        assert (p.stat().st_mode & 0o777) == 0o600

    def test_generate_pkce_shapes(self):
        verifier, challenge = ca._generate_pkce()
        assert verifier and challenge and "=" not in verifier and "=" not in challenge

    def test_decode_jwt_flattens_nested_claims(self):
        token = _jwt({
            "https://api.openai.com/auth": {"chatgpt_account_id": "acct-1"},
            "https://api.openai.com/profile": {"email": "a@b.co"},
        })
        payload = ca._decode_jwt_payload(token)
        assert payload["chatgpt_account_id"] == "acct-1" and payload["email"] == "a@b.co"

    def test_decode_jwt_malformed_returns_empty(self):
        assert ca._decode_jwt_payload("not-a-jwt") == {}
        assert ca._decode_jwt_payload(_jwt({}) .split(".")[0]) == {}  # single part


# ── CodexAuth ────────────────────────────────────────────────────────

class TestCodexAuthBasics:
    def _auth(self, tmp_path, creds=None):
        p = tmp_path / "creds.json"
        if creds is not None:
            p.write_text(json.dumps(creds))
        return CodexAuth(str(p))

    def test_is_configured_variants(self, tmp_path):
        assert not self._auth(tmp_path).is_configured()
        assert self._auth(tmp_path, _creds()).is_configured()
        bad = tmp_path / "creds.json"
        bad.write_text("{ broken")
        assert not CodexAuth(str(bad)).is_configured()

    def test_load_missing_raises(self, tmp_path):
        with pytest.raises(RuntimeError, match="not found"):
            self._auth(tmp_path)._load()

    def test_save_invokes_on_save_and_swallows_errors(self, tmp_path):
        seen = []
        a = CodexAuth(str(tmp_path / "c.json"), on_save=lambda c: seen.append(c))
        a._save(_creds(access="new"))
        assert seen and seen[0]["access_token"] == "new"
        # on_save that raises must not break _save
        a2 = CodexAuth(str(tmp_path / "c2.json"),
                       on_save=lambda c: (_ for _ in ()).throw(RuntimeError("boom")))
        a2._save(_creds())  # no exception

    def test_get_account_id(self, tmp_path):
        assert self._auth(tmp_path, _creds(account_id="acct")).get_account_id() == "acct"

    @pytest.mark.asyncio
    async def test_get_access_token_fresh_no_refresh(self, tmp_path):
        a = self._auth(tmp_path, _creds(access="fresh"))
        assert await a.get_access_token() == "fresh"

    @pytest.mark.asyncio
    async def test_get_access_token_refreshes_when_expiring(self, tmp_path, monkeypatch):
        a = self._auth(tmp_path, _creds(access="old", expires_at=0))
        called = []

        async def fake_refresh(creds):
            a._credentials = _creds(access="refreshed")
            called.append(True)
        monkeypatch.setattr(a, "_refresh", fake_refresh)
        assert await a.get_access_token() == "refreshed" and called

    @pytest.mark.asyncio
    async def test_invalidate_current_clears_cache(self, tmp_path):
        a = self._auth(tmp_path, _creds())
        a._load()
        await a.invalidate_current()
        assert a._credentials is None

    @pytest.mark.asyncio
    async def test_mark_current_auth_failed_single_is_false(self, tmp_path):
        assert await self._auth(tmp_path, _creds()).mark_current_auth_failed() is False

    def test_rate_limit_window(self, tmp_path):
        a = self._auth(tmp_path, _creds())
        assert not a.is_rate_limited()
        a.mark_rate_limited(60)
        assert a.is_rate_limited()

    def test_build_auth_url(self):
        url, verifier = CodexAuth.build_auth_url()
        assert url.startswith("https://auth.openai.com/oauth/authorize?") and verifier


class TestCodexAuthForceRefresh:
    def _auth(self, tmp_path, creds):
        p = tmp_path / "creds.json"
        p.write_text(json.dumps(creds))
        return CodexAuth(str(p))

    @pytest.mark.asyncio
    async def test_stale_token_mismatch_is_noop_success(self, tmp_path):
        a = self._auth(tmp_path, _creds(access="current"))
        assert await a.force_refresh(stale_token="a-different-old-token") is True

    @pytest.mark.asyncio
    async def test_refresh_success(self, tmp_path, monkeypatch):
        a = self._auth(tmp_path, _creds(access="current"))

        async def ok(creds):
            a._credentials = _creds(access="new")
        monkeypatch.setattr(a, "_refresh", ok)
        assert await a.force_refresh(stale_token="current") is True

    @pytest.mark.asyncio
    async def test_refresh_failure_returns_false(self, tmp_path, monkeypatch):
        a = self._auth(tmp_path, _creds())

        async def boom(creds):
            raise RuntimeError("refresh failed")
        monkeypatch.setattr(a, "_refresh", boom)
        assert await a.force_refresh() is False

    @pytest.mark.asyncio
    async def test_force_refresh_load_failure_false(self, tmp_path):
        a = CodexAuth(str(tmp_path / "missing.json"))  # _load raises
        assert await a.force_refresh() is False


class TestRefreshTransport:
    def _auth(self, tmp_path, creds):
        p = tmp_path / "creds.json"
        p.write_text(json.dumps(creds))
        return CodexAuth(str(p))

    @pytest.mark.asyncio
    async def test_refresh_success_extracts_jwt_claims(self, tmp_path, monkeypatch):
        token = _jwt({"chatgpt_account_id": "acct-9", "email": "x@y.z",
                      "chatgpt_plan_type": "pro"})
        _FakeSession.response = _FakeResp(
            200, json.dumps({"access_token": token, "refresh_token": "r2",
                             "expires_in": 3600}).encode())
        monkeypatch.setattr(ca.aiohttp, "ClientSession", _FakeSession)
        a = self._auth(tmp_path, _creds(label="acct-label"))
        await a._refresh(a._load())
        saved = json.loads((tmp_path / "creds.json").read_text())
        assert saved["access_token"] == token and saved["account_id"] == "acct-9"
        assert saved["email"] == "x@y.z" and saved["plan_type"] == "pro"
        assert saved["label"] == "acct-label"  # preserved

    @pytest.mark.asyncio
    async def test_refresh_http_error_raises(self, tmp_path, monkeypatch):
        _FakeSession.response = _FakeResp(400, b"bad")
        monkeypatch.setattr(ca.aiohttp, "ClientSession", _FakeSession)
        a = self._auth(tmp_path, _creds())
        with pytest.raises(RuntimeError, match="refresh failed"):
            await a._refresh(a._load())

    @pytest.mark.asyncio
    async def test_refresh_no_token_raises(self, tmp_path):
        a = self._auth(tmp_path, {"access_token": "t", "expires_at": 0})  # no refresh_token
        with pytest.raises(RuntimeError, match="No refresh token"):
            await a._refresh(a._load())

    @pytest.mark.asyncio
    async def test_refresh_falls_back_to_old_claims(self, tmp_path, monkeypatch):
        # New JWT carries no claims → account_id/email/plan_type fall back to
        # the previously-stored creds (lines 239-250).
        _FakeSession.response = _FakeResp(
            200, json.dumps({"access_token": _jwt({}), "expires_in": 3600}).encode())
        monkeypatch.setattr(ca.aiohttp, "ClientSession", _FakeSession)
        a = self._auth(tmp_path, _creds(account_id="old-acct", email="old@e.co",
                                        plan_type="pro"))
        await a._refresh(a._load())
        saved = json.loads((tmp_path / "creds.json").read_text())
        assert saved["account_id"] == "old-acct" and saved["email"] == "old@e.co"
        assert saved["plan_type"] == "pro"


class TestOAuthTransport:
    @pytest.mark.asyncio
    async def test_exchange_code_success_and_error(self, tmp_path, monkeypatch):
        token = _jwt({"chatgpt_account_id": "acct", "email": "e@x.co",
                      "chatgpt_plan_type": "pro"})
        _FakeSession.response = _FakeResp(
            200, json.dumps({"access_token": token, "refresh_token": "r",
                             "expires_in": 3600}).encode())
        monkeypatch.setattr(ca.aiohttp, "ClientSession", _FakeSession)
        creds = await CodexAuth.exchange_code("code", "verifier")
        assert creds["account_id"] == "acct" and creds["refresh_token"] == "r"

        _FakeSession.response = _FakeResp(400, b"denied")
        with pytest.raises(RuntimeError, match="exchange failed"):
            await CodexAuth.exchange_code("code", "verifier")

    @pytest.mark.asyncio
    async def test_request_device_code_success_and_error(self, tmp_path, monkeypatch):
        _FakeSession.response = _FakeResp(
            200, json.dumps({"device_auth_id": "dev-1", "user_code": "AB-CD",
                             "interval": 3}).encode())
        monkeypatch.setattr(ca.aiohttp, "ClientSession", _FakeSession)
        out = await CodexAuth.request_device_code()
        assert out["device_auth_id"] == "dev-1" and out["interval"] == 3

        _FakeSession.response = _FakeResp(500, b"boom")
        with pytest.raises(RuntimeError, match="Device code request failed"):
            await CodexAuth.request_device_code()


# ── CodexAuthPool ────────────────────────────────────────────────────

class TestPoolInit:
    def test_missing_file_empty_pool(self, tmp_path):
        assert CodexAuthPool(str(tmp_path / "none.json")).account_count == 0

    def test_corrupt_file_empty_pool(self, tmp_path):
        p = tmp_path / "c.json"
        p.write_text("{ broken")
        assert CodexAuthPool(str(p)).account_count == 0

    def test_single_object_format(self, tmp_path):
        p = tmp_path / "c.json"
        p.write_text(json.dumps(_creds()))
        assert CodexAuthPool(str(p)).account_count == 1

    def test_list_format_creates_shadows(self, tmp_path):
        p = tmp_path / "c.json"
        p.write_text(json.dumps([_creds(access="a0", account_id="0"),
                                 _creds(access="a1", account_id="1")]))
        pool = CodexAuthPool(str(p))
        assert pool.account_count == 2
        assert (tmp_path / "codex_auth_0.json").exists()
        assert (tmp_path / "codex_auth_1.json").exists()

    def test_shadow_newer_wins_over_canonical(self, tmp_path):
        # The outage-fix path: a rotated shadow (newer expires_at) must win, and
        # the canonical file gets pulled up to match — never the reverse.
        p = tmp_path / "c.json"
        p.write_text(json.dumps([_creds(access="stale", account_id="0", expires_at=100)]))
        shadow = tmp_path / "codex_auth_0.json"
        shadow.write_text(json.dumps(_creds(access="rotated", account_id="0",
                                            expires_at=999)))
        pool = CodexAuthPool(str(p))
        assert pool.account_count == 1
        # canonical rewritten to the rotated creds
        assert json.loads(p.read_text())[0]["access_token"] == "rotated"

    def test_skips_invalid_entries(self, tmp_path):
        p = tmp_path / "c.json"
        p.write_text(json.dumps(["nope", {"no_token": 1}, _creds(account_id="ok")]))
        assert CodexAuthPool(str(p)).account_count == 1

    def test_eligible_account_ids_excludes_rate_limited_and_invalid(self, tmp_path):
        p = tmp_path / "c.json"
        p.write_text(json.dumps([
            _creds(account_id="a"),
            _creds(account_id="b"),
            _creds(account_id=""),
        ]))
        pool = CodexAuthPool(str(p))
        pool._accounts[1].mark_rate_limited(60)
        assert pool.eligible_account_ids_snapshot() == frozenset({"a"})

    def test_stale_shadow_files_removed(self, tmp_path):
        p = tmp_path / "c.json"
        p.write_text(json.dumps([_creds(account_id="0")]))
        stale = tmp_path / "codex_auth_1.json"
        stale.write_text("{}")
        CodexAuthPool(str(p))
        assert not stale.exists()


class TestPoolRotation:
    def _pool(self, tmp_path, n=2):
        p = tmp_path / "c.json"
        p.write_text(json.dumps([
            _creds(access=f"a{i}", account_id=str(i)) for i in range(n)]))
        return CodexAuthPool(str(p))

    @pytest.mark.asyncio
    async def test_acquire_returns_healthy_token(self, tmp_path):
        pool = self._pool(tmp_path)
        token, acct, idx = await pool.acquire()
        assert token == "a0" and idx == 0

    @pytest.mark.asyncio
    async def test_acquire_rotates_past_rate_limited(self, tmp_path):
        pool = self._pool(tmp_path)
        pool._accounts[0].mark_rate_limited(60)
        token, _, idx = await pool.acquire()
        assert token == "a1" and idx == 1

    @pytest.mark.asyncio
    async def test_acquire_all_rate_limited_raises(self, tmp_path):
        pool = self._pool(tmp_path)
        for a in pool._accounts:
            a.mark_rate_limited(60)
        with pytest.raises(RuntimeError, match="rate-limited or"):
            await pool.acquire()

    @pytest.mark.asyncio
    async def test_acquire_all_failed_raises_with_errors(self, tmp_path, monkeypatch):
        pool = self._pool(tmp_path)
        for a in pool._accounts:
            async def boom():
                raise RuntimeError("token boom")
            monkeypatch.setattr(a, "get_access_token", boom)
        with pytest.raises(RuntimeError, match="accounts failed"):
            await pool.acquire()

    @pytest.mark.asyncio
    async def test_get_access_token_delegates(self, tmp_path):
        assert await self._pool(tmp_path).get_access_token() == "a0"

    @pytest.mark.asyncio
    async def test_token_for_index_and_out_of_range(self, tmp_path):
        pool = self._pool(tmp_path)
        tok, acct = await pool.token_for(1)
        assert tok == "a1" and acct == "1"
        with pytest.raises(RuntimeError, match="out of range"):
            await pool.token_for(99)

    @pytest.mark.asyncio
    async def test_mark_limited_rotates_when_current(self, tmp_path):
        pool = self._pool(tmp_path)
        await pool.mark_current_limited()
        assert pool._current_index == 1

    @pytest.mark.asyncio
    async def test_mark_limited_out_of_range_noop(self, tmp_path):
        pool = self._pool(tmp_path)
        await pool.mark_limited(99)  # no raise
        assert pool._current_index == 0

    @pytest.mark.asyncio
    async def test_mark_auth_failed_rotates_and_backs_off(self, tmp_path):
        pool = self._pool(tmp_path)
        assert await pool.mark_current_auth_failed() is True
        assert pool._current_index == 1
        assert pool._accounts[0].is_rate_limited()  # long backoff set

    @pytest.mark.asyncio
    async def test_mark_auth_failed_single_account_false(self, tmp_path):
        pool = self._pool(tmp_path, n=1)
        assert await pool.mark_current_auth_failed() is False

    @pytest.mark.asyncio
    async def test_invalidate_current(self, tmp_path):
        pool = self._pool(tmp_path)
        pool._accounts[0]._load()
        await pool.invalidate_current()
        assert pool._accounts[0]._credentials is None

    @pytest.mark.asyncio
    async def test_force_refresh_delegates(self, tmp_path, monkeypatch):
        pool = self._pool(tmp_path)

        async def ok(stale):
            return True
        monkeypatch.setattr(pool._accounts[0], "force_refresh", ok)
        assert await pool.force_refresh(0) is True
        assert await pool.force_refresh(99) is False

    @pytest.mark.asyncio
    async def test_set_active_and_out_of_range(self, tmp_path):
        pool = self._pool(tmp_path)
        await pool.set_active(1)
        assert pool._current_index == 1
        with pytest.raises(ValueError, match="out of range"):
            await pool.set_active(99)

    def test_current_and_account_id(self, tmp_path):
        pool = self._pool(tmp_path)
        assert pool.current is pool._accounts[0]
        assert pool.get_account_id() == "0"
        assert pool.is_configured()

    def test_current_empty_raises(self, tmp_path):
        pool = CodexAuthPool(str(tmp_path / "none.json"))
        assert pool.get_account_id() is None
        with pytest.raises(RuntimeError, match="No Codex"):
            _ = pool.current

    @pytest.mark.asyncio
    async def test_reload_sync_and_async(self, tmp_path):
        pool = self._pool(tmp_path, n=2)
        pool.reload()
        assert pool.account_count == 2
        assert await pool.reload_async() == 2

    @pytest.mark.asyncio
    async def test_empty_pool_ops_are_safe_noops(self, tmp_path):
        pool = CodexAuthPool(str(tmp_path / "none.json"))
        await pool.mark_current_limited()
        await pool.mark_limited(0)
        await pool.invalidate_current()
        assert await pool.mark_current_auth_failed() is False
        assert await pool.mark_auth_failed(0) is False
        assert await pool.force_refresh(0) is False

    def test_canonical_sync_mirrors_to_canonical_file(self, tmp_path):
        # A per-account _save() must mirror back into the canonical list file
        # (the on_save hook wired at init) — the mechanism that keeps single-use
        # refresh tokens consistent across restarts.
        p = tmp_path / "c.json"
        p.write_text(json.dumps([_creds(access="a0", account_id="0"),
                                 _creds(access="a1", account_id="1")]))
        pool = CodexAuthPool(str(p))
        pool._accounts[1]._save(_creds(access="rotated", account_id="1"))
        assert json.loads(p.read_text())[1]["access_token"] == "rotated"

    def test_canonical_sync_ignores_out_of_range(self, tmp_path):
        # If the canonical file shrank, an index past its end is a safe no-op.
        p = tmp_path / "c.json"
        p.write_text(json.dumps([_creds(account_id="0")]))
        pool = CodexAuthPool(str(p))
        sync = pool._canonical_sync(5)  # index beyond the 1-entry file
        sync(_creds(access="x"))  # no raise, no write
        assert len(json.loads(p.read_text())) == 1
