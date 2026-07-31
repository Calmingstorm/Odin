"""Shared test fixtures for Odin."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest


@pytest.fixture
def mock_bot():
    """A mock OdinBot with common attributes."""
    bot = MagicMock()
    bot.user = MagicMock()
    bot.user.id = 123456789
    bot.user.__str__ = lambda self: "Odin#0001"
    bot.guilds = []
    bot.latency = 0.042
    bot.wait_until_ready = AsyncMock()
    bot.get_channel = MagicMock(return_value=None)
    return bot


@pytest.fixture
def mock_ctx(mock_bot):
    """A mock commands.Context with guild, author, channel."""
    ctx = MagicMock()
    ctx.bot = mock_bot
    ctx.send = AsyncMock()

    # Guild
    ctx.guild = MagicMock()
    ctx.guild.id = 111111111
    ctx.guild.name = "Test Server"
    ctx.guild.member_count = 50
    ctx.guild.roles = []
    ctx.guild.channels = []
    ctx.guild.owner = MagicMock()
    ctx.guild.icon = None
    ctx.guild.me = MagicMock()
    ctx.guild.me.guild_permissions = MagicMock()

    # Author
    ctx.author = MagicMock()
    ctx.author.id = 222222222
    ctx.author.__str__ = lambda self: "TestUser#0001"
    ctx.author.mention = "<@222222222>"
    ctx.author.guild_permissions = MagicMock()
    ctx.author.guild_permissions.administrator = True
    ctx.author.guild_permissions.ban_members = True
    ctx.author.guild_permissions.kick_members = True
    ctx.author.guild_permissions.manage_messages = True
    ctx.author.top_role = MagicMock()
    ctx.author.top_role.position = 10

    # Channel
    ctx.channel = MagicMock()
    ctx.channel.id = 333333333
    ctx.channel.mention = "<#333333333>"
    ctx.channel.purge = AsyncMock(return_value=[MagicMock()] * 5)

    return ctx


@pytest.fixture
def mock_member():
    """A mock Discord member (target of moderation)."""
    member = MagicMock()
    member.id = 444444444
    member.__str__ = lambda self: "TargetUser#0002"
    member.mention = "<@444444444>"
    member.top_role = MagicMock()
    member.top_role.position = 5
    member.ban = AsyncMock()
    member.kick = AsyncMock()
    member.timeout = AsyncMock()
    member.display_avatar = MagicMock()
    member.display_avatar.url = "https://example.com/avatar.png"
    member.joined_at = None
    member.created_at = MagicMock()
    return member


@pytest.fixture
def odin_config():
    """A test pydantic Config (executor-shape).

    OdinBot now uses the full pydantic Config from src.config.schema, not the
    legacy OdinConfig dataclass. Tests that just need a constructable bot
    config should use this fixture. Tests that explicitly want the legacy
    dataclass should import OdinConfig from src.config directly.
    """
    from src.config.schema import Config

    return Config(discord={"token": "test-token-not-real"})

# ── Planner / DAG execution test support ──────────────────────

import asyncio  # noqa: E402 — deliberate import order (env/bootstrap before heavy imports)
import time  # noqa: E402 — deliberate import order (env/bootstrap before heavy imports)
from typing import Any  # noqa: E402 — deliberate import order (env/bootstrap before heavy imports)

from src.odin.context import (  # noqa: E402 — deliberate mid-file import (see block comment)
    ExecutionContext,
)
from src.odin.registry import (  # noqa: E402 — deliberate mid-file import (see block comment)
    ToolRegistry,
)
from src.odin.tools.base import (  # noqa: E402 — deliberate mid-file import (see block comment)
    BaseTool,
)
from src.odin.types import (  # noqa: E402 — deliberate import order (env/bootstrap before heavy imports)
    PlanSpec,
    StepSpec,
)


class TimestampTool(BaseTool):
    """Sleeps for a configured duration and returns start/end timestamps."""

    async def execute(self, params: dict[str, Any], ctx: ExecutionContext) -> Any:
        duration = params.get("sleep", 0.01)
        start = time.time()
        await asyncio.sleep(duration)
        end = time.time()
        return {"start": start, "end": end, "value": params.get("value", "ok")}


class FailingTool(BaseTool):
    """Always raises an exception."""

    async def execute(self, params: dict[str, Any], ctx: ExecutionContext) -> Any:
        raise RuntimeError(params.get("message", "deliberate failure"))


class EchoTool(BaseTool):
    """Echoes the message param or the full params payload."""

    async def execute(self, params: dict[str, Any], ctx: ExecutionContext) -> Any:
        return params.get("message", dict(params))


class SlowTool(BaseTool):
    """Sleeps longer than typical timeouts for timeout testing."""

    async def execute(self, params: dict[str, Any], ctx: ExecutionContext) -> Any:
        await asyncio.sleep(params.get("sleep", 60))
        return "done"


@pytest.fixture
def registry() -> ToolRegistry:
    return ToolRegistry.with_defaults()


@pytest.fixture
def ts_registry() -> ToolRegistry:
    """Registry with timestamp, failing, echo, and slow tools."""
    reg = ToolRegistry()
    reg.register("ts", TimestampTool)
    reg.register("fail", FailingTool)
    reg.register("echo", EchoTool)
    reg.register("slow", SlowTool)
    from src.odin.tools.shell import ShellTool as _ShellTool
    reg.register("shell", _ShellTool)
    return reg


@pytest.fixture
def ctx() -> ExecutionContext:
    return ExecutionContext()


@pytest.fixture
def linear_plan() -> PlanSpec:
    """A -> B -> C linear chain."""
    return PlanSpec(
        name="linear",
        steps=(
            StepSpec(id="a", tool="ts", params={"sleep": 0.01}),
            StepSpec(id="b", tool="ts", params={"sleep": 0.01}, depends_on=("a",)),
            StepSpec(id="c", tool="ts", params={"sleep": 0.01}, depends_on=("b",)),
        ),
    )


@pytest.fixture
def diamond_plan() -> PlanSpec:
    """A -> (B, C) -> D diamond for parallel testing."""
    return PlanSpec(
        name="diamond",
        steps=(
            StepSpec(id="a", tool="ts", params={"sleep": 0.01}),
            StepSpec(id="b", tool="ts", params={"sleep": 0.1}, depends_on=("a",)),
            StepSpec(id="c", tool="ts", params={"sleep": 0.1}, depends_on=("a",)),
            StepSpec(id="d", tool="ts", params={"sleep": 0.01}, depends_on=("b", "c")),
        ),
    )


@pytest.fixture(autouse=True)
def _reset_restart_intent():
    """Restart intent (src/restart.py) is process-global state — never let
    one test's requested restart leak into another (or toward a real exec)."""
    from src import restart

    restart.reset()
    yield
    restart.reset()



@pytest.fixture(autouse=True, scope="session")
def _test_local_workspace(tmp_path_factory):
    """Provision a valid local command workspace for the whole test session.

    ToolExecutor resolves ``tools.local_working_dir`` fail-closed before running
    any local command — there is deliberately no fallback to the inherited cwd,
    since that inheritance is what let a bare `rm -rf data` delete the live
    install on 2026-07-27. Production provisions the directory at deploy time;
    tests provision this one, so executor construction never depends on the
    host having been deployed to.
    """
    from src.config.schema import ToolsConfig

    workspace = tmp_path_factory.mktemp("odin-test-workspace")
    workspace.chmod(0o700)
    field = ToolsConfig.model_fields["local_working_dir"]
    original = field.default
    field.default = str(workspace)
    ToolsConfig.model_rebuild(force=True)
    yield workspace
    field.default = original
    ToolsConfig.model_rebuild(force=True)

@pytest.fixture(scope="session", autouse=True)
def _process_containment():
    """Run the suite as a child subreaper, exactly like production.

    ``src/__main__`` enables this at startup so escaped background
    descendants stay attributable (PR #244). Without it here, cleanup
    correctly refuses to claim success and every shutdown path raises —
    tests would be exercising a mode production never runs in.
    """
    import os
    import secrets

    from src.tools.process_manager import PROC_TOKEN_ENV, set_child_subreaper

    previous = set_child_subreaper(True)
    os.environ.setdefault(PROC_TOKEN_ENV, secrets.token_hex(8))
    yield
    set_child_subreaper(previous)
