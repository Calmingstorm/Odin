"""Regression tests for the RFC-005 findings-ledger fixes (TS-0001…TS-0005).

Each test pins the exact failure mode the type checker surfaced and Aaron
ruled FIX — see docs/plans/type-safety-findings.md for the ledger entries.
"""
from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from src.tools.skill_context import SkillContext


class _FakeExecutor:
    """Just enough executor for the two tuple-contract fixes."""

    def __init__(self, raw):
        self._raw = raw
        self.config = MagicMock()

    async def _run_on_host(self, alias, command, use_workspace=False):
        # Recorded, not asserted: skills opt IN (arbitrary command execution),
        # the audit diff tracker deliberately does NOT (PR #239 round 9).
        self.last_use_workspace = use_workspace
        if isinstance(self._raw, Exception):
            raise self._raw
        return self._raw


class TestTS0004SkillRunOnHostContract:
    """TS-0004: the documented `run_on_host -> str` contract was violated by
    forwarding the raw executor tuple for every resolved host."""

    def _ctx(self, raw):
        ctx = SkillContext.__new__(SkillContext)
        ctx._executor = _FakeExecutor(raw)
        return ctx

    @pytest.mark.asyncio
    async def test_skill_commands_opt_into_the_workspace(self):
        """PR #239 round 9: this is arbitrary command execution exposed to
        user-created skills, so it is a raw command route and must land in the
        workspace — omitting it left an alternate path back into the wipe."""
        ctx = self._ctx(("ok", 0))
        await ctx.run_on_host("localhost", "rm -rf data")
        assert ctx._executor.last_use_workspace is True

    @pytest.mark.asyncio
    async def test_resolved_host_returns_output_string(self):
        result = await self._ctx(("uptime output", 0)).run_on_host("server", "uptime")
        assert result == "uptime output"
        assert isinstance(result, str)

    @pytest.mark.asyncio
    async def test_failure_tuple_returns_its_output_string(self):
        result = await self._ctx(("Command failed (exit 7):\nboom", 7)).run_on_host(
            "server", "false")
        assert result == "Command failed (exit 7):\nboom"

    @pytest.mark.asyncio
    async def test_unknown_host_returns_denial_string(self):
        result = await self._ctx("Unknown or disallowed host: nope").run_on_host(
            "nope", "uptime")
        assert result == "Unknown or disallowed host: nope"


class TestTS0005HttpPostJsonShadowing:
    """TS-0005: http_post's `json=` parameter shadowed the stdlib module, so
    any non-JSON-content-type response crashed on `json.loads`.

    aioresponses 0.7.x is incompatible with this aiohttp (see the skip in
    tests/test_tools/test_http.py), so the client session is faked directly.
    """

    class _FakeResp:
        def __init__(self, content_type: str, body: str) -> None:
            self.content_type = content_type
            self._body = body

        async def text(self):
            return self._body

        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

    def _patch_session(self, monkeypatch, resp):
        # http_post now routes through the hardened safe_fetch transport; fake
        # it to return the canned response (content-type drives text vs JSON).
        from src.tools.safe_fetch import SafeFetchResponse

        async def _fake_safe_fetch(url, **kwargs):
            return SafeFetchResponse(200, {}, resp._body.encode(), resp.content_type, url)

        monkeypatch.setattr("src.tools.safe_fetch.safe_fetch", _fake_safe_fetch)

    def _ctx(self):
        ctx = SkillContext.__new__(SkillContext)
        from src.tools.skill_context import ResourceTracker

        ctx._tracker = ResourceTracker()
        return ctx

    @pytest.mark.asyncio
    async def test_text_plain_response_returns_text(self, monkeypatch):
        self._patch_session(monkeypatch, self._FakeResp("text/plain", "plain ok"))
        result = await self._ctx().http_post("https://api.example/hook", json={"a": 1})
        assert result == "plain ok"

    @pytest.mark.asyncio
    async def test_json_body_in_text_content_type_is_parsed(self, monkeypatch):
        self._patch_session(
            monkeypatch, self._FakeResp("text/plain", '{"parsed": true}'))
        result = await self._ctx().http_post("https://api.example/hook")
        assert result == {"parsed": True}
