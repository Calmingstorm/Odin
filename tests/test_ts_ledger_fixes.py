"""Regression tests for the RFC-005 findings-ledger fixes (TS-0001…TS-0005).

Each test pins the exact failure mode the type checker surfaced and Aaron
ruled FIX — see docs/plans/type-safety-findings.md for the ledger entries.
"""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest

import discord
from src.audit.diff_tracker import DiffTracker
from src.odin.planner import PlanValidationError
from src.tools.skill_context import SkillContext


class _FakeExecutor:
    """Just enough executor for the two tuple-contract fixes."""

    def __init__(self, raw):
        self._raw = raw
        self.config = MagicMock()

    async def _run_on_host(self, alias, command):
        if isinstance(self._raw, Exception):
            raise self._raw
        return self._raw


class TestTS0002DiffTrackerBeforeSnapshot:
    """TS-0002: every overwrite used to snapshot '' because the executor's
    (output, exit_code) tuple hit .startswith() and the AttributeError was
    silently swallowed."""

    async def _capture(self, raw):
        tracker = DiffTracker()
        key = await tracker.capture_before(
            "write_file", {"host": "server", "path": "/tmp/f.txt", "content": "new"},
            _FakeExecutor(raw),
        )
        assert key is not None
        return tracker._snapshots[key]

    @pytest.mark.asyncio
    async def test_success_tuple_records_real_content(self):
        assert await self._capture(("the old file body\n", 0)) == "the old file body\n"

    @pytest.mark.asyncio
    async def test_host_denial_string_records_empty(self):
        assert await self._capture("Unknown or disallowed host: nope") == ""

    @pytest.mark.asyncio
    async def test_transport_failure_tuple_records_empty(self):
        assert await self._capture(("Command failed (exit 255):\nssh: boom", 255)) == ""

    @pytest.mark.asyncio
    async def test_executor_exception_records_empty(self):
        assert await self._capture(RuntimeError("ssh pool down")) == ""


class TestTS0004SkillRunOnHostContract:
    """TS-0004: the documented `run_on_host -> str` contract was violated by
    forwarding the raw executor tuple for every resolved host."""

    def _ctx(self, raw):
        ctx = SkillContext.__new__(SkillContext)
        ctx._executor = _FakeExecutor(raw)
        return ctx

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


class TestTS0003PlanValidationError:
    """TS-0003: `odin run` crashed inside its own error reporter — the
    exception never had the .errors the CLI iterates."""

    def test_carries_error_list(self):
        exc = PlanValidationError(["duplicate step id: a", "unknown tool: x"])
        assert exc.errors == ["duplicate step id: a", "unknown tool: x"]
        assert "duplicate step id: a; unknown tool: x" == str(exc)

    @pytest.mark.asyncio
    async def test_planner_execute_raises_with_errors(self):
        # validate() returns the error list; execute() is the raise site the
        # CLI catches — drive the real path with an invalid plan.
        from src.odin.planner import Planner
        from src.odin.registry import ToolRegistry
        from src.odin.types import PlanSpec, StepSpec

        plan = PlanSpec(
            name="bad", steps=[
                StepSpec(id="a", tool="run_command", params={}),
                StepSpec(id="a", tool="run_command", params={}),
            ],
        )
        planner = Planner(ToolRegistry.with_defaults())
        with pytest.raises(PlanValidationError) as excinfo:
            await planner.execute(plan)
        assert any("duplicate" in e.lower() for e in excinfo.value.errors)


class TestTS0001UserinfoInDMs:
    """TS-0001: `!userinfo` in a DM raised AttributeError — ctx.author is a
    plain discord.User there, with no joined_at and no roles."""

    def _cog_and_ctx(self, author):
        from src.discord.cogs.utility import Utility

        cog = Utility.__new__(Utility)
        ctx = MagicMock()
        ctx.author = author
        ctx.send = AsyncMock()
        return cog, ctx

    @pytest.mark.asyncio
    async def test_dm_user_without_member_arg_does_not_raise(self):
        from src.discord.cogs.utility import Utility

        user = MagicMock(spec=discord.User)  # spec: no .roles / .joined_at
        user.id = 1234
        user.created_at = discord.utils.utcnow()
        user.display_avatar.url = "https://cdn.example/avatar.png"
        user.__str__ = lambda self: "someone"
        cog, ctx = self._cog_and_ctx(user)
        await Utility.userinfo.callback(cog, ctx, member=None)
        ctx.send.assert_awaited()

    @pytest.mark.asyncio
    async def test_guild_member_still_gets_roles_and_joined(self):
        from src.discord.cogs.utility import Utility

        member = MagicMock(spec=discord.Member)
        member.id = 42
        member.joined_at = discord.utils.utcnow()
        member.created_at = discord.utils.utcnow()
        role = MagicMock()
        role.mention = "@role"
        member.roles = [MagicMock(), role]
        member.display_avatar.url = "https://cdn.example/avatar.png"
        member.__str__ = lambda self: "member"
        cog, ctx = self._cog_and_ctx(member)
        await Utility.userinfo.callback(cog, ctx, member=None)
        ctx.send.assert_awaited()


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
        import aiohttp

        class _FakeSession:
            def __init__(self, *args, **kwargs):
                pass

            async def __aenter__(self):
                return self

            async def __aexit__(self, *exc):
                return False

            def post(self, url, **kwargs):
                return resp

        monkeypatch.setattr(aiohttp, "ClientSession", _FakeSession)

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
