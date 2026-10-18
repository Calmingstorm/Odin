"""Agents, loops and scheduled runs act as their real requester.

Their tools see a loop message proxy. Its author must carry the requester the
explicit dispatch principal names: Discord IDs stay ints, API and WebUI
identities keep their string (as web turns present them), and empty keeps the
legacy zero sentinel. Native handlers that read that author authorize hosts and
own new work by it.
"""

from __future__ import annotations

import asyncio
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.audit.tool_context import _pending_observers
from src.discord.native_tools.media import MediaTools
from src.discord.native_tools.scheduling import SchedulingTools
from src.discord.tool_loop import _LoopMessageProxy
from src.permissions.manager import _request_tier
from src.scheduler.scheduler import Scheduler
from src.tools.hosts import HostRegistry
from src.tools.nested_payload import ValidatedNestedPayload
from src.tools.result_validator import ToolResult
from tests.fakes import (
    FakeAuthor,
    FakeLLM,
    FakeMessage,
    make_bot,
    text_response,
    tool_call_response,
)
from tests.test_native_agents_tasks import _tools
from tests.test_scheduled_events import _channel, _handlers

API_USER = "claude-api-7"


@pytest.fixture(autouse=True)
def _isolated_cwd(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)


def _proxy(user_id: str = API_USER):
    channel = SimpleNamespace(id=42, send=AsyncMock())
    return _LoopMessageProxy(channel, user_id, user_id or "loop")


@pytest.mark.parametrize(
    ("given", "expected"),
    [
        ("123456789012345678", 123456789012345678),  # Discord snowflake
        (API_USER, API_USER),  # API token identity
        ("Admin", "Admin"),  # WebUI login identity
        ("scheduler", "scheduler"),  # system schedules
        ("", 0),  # legacy sentinel
    ],
)
def test_the_proxy_author_matches_the_explicit_principal(given, expected):
    author = _proxy(given).author
    assert author.id == expected
    if given:
        assert str(author.id) == given


class TestHostAuthorization:
    """post_file and host-backed analyze_image lease hosts as the real requester."""

    @staticmethod
    def _media():
        asked: list = []
        # The default identity "0" reaches the host; the real requester may not.
        policy = {"0": {"server"}, API_USER: {"localhost"}}
        executor = MagicMock()

        def acquire(alias, user_id=None):
            asked.append(user_id)
            if alias in policy.get(user_id, set()):
                return HostRegistry.unmanaged_lease(alias, ("192.0.2.10", "odin", "linux"))
            return None

        executor.acquire_host_for_user = MagicMock(side_effect=acquire)
        executor._exec_command = AsyncMock(return_value=(0, ""))
        config = SimpleNamespace(
            tools=SimpleNamespace(ssh_key_path="/k", ssh_known_hosts_path="/kh")
        )
        media = MediaTools(
            get_config=lambda: config,
            browser_manager=None,
            tool_executor=executor,
            image_selector=None,
        )
        return media, executor, asked

    async def test_post_file_is_denied_by_the_requesters_own_policy(self):
        media, executor, asked = self._media()
        proxy = _proxy()
        out = await media._handle_post_file(proxy, {"host": "server", "path": "/srv/report.txt"})
        assert asked == [API_USER]
        assert "Unknown or disallowed host" in out
        executor._exec_command.assert_not_awaited()
        proxy.channel.send.assert_not_awaited()

    async def test_host_analyze_image_is_denied_by_the_requesters_own_policy(self):
        media, executor, asked = self._media()
        out = await media._handle_analyze_image(
            _proxy(), {"host": "server", "path": "/srv/screen.png"}
        )
        assert asked == [API_USER]
        assert "Unknown or disallowed host" in out
        executor._exec_command.assert_not_awaited()


class TestWorkCreation:
    """spawn_agent, delegate_task, start_loop and schedule_task own work as the requester."""

    async def test_spawned_agents_and_their_calls_belong_to_the_requester(self):
        prompts: list[str] = []
        t = _tools(
            prompt_builder=SimpleNamespace(
                build_full_prompt=lambda **k: prompts.append(k["user_id"]) or "SYS",
                refresh_learned_context=lambda prompt, **k: prompt,
            )
        )
        t._agent_manager.spawn.return_value = "child-1"
        t._agent_manager._agents = {}
        t._tool_loop.dispatch_loop_tool = AsyncMock(return_value="ok")
        t._tool_executor._permission_manager = SimpleNamespace(get_tier=lambda _uid: "user")

        out = await t._handle_spawn_agent(_proxy(), {"label": "child", "goal": "look"})
        assert "child-1" in out
        spawned = t._agent_manager.spawn.call_args.kwargs
        assert spawned["requester_id"] == API_USER
        assert prompts == [API_USER]  # host visibility and personal memory follow the requester
        # The child's own tool calls (deferred) carry one principal through the proxy too.
        await spawned["tool_executor_callback"]("read_file", {"path": "notes.md"})
        _name, _inp, child_proxy, principal = t._tool_loop.dispatch_loop_tool.await_args.args
        assert principal == API_USER and child_proxy.author.id == API_USER
        # A non-admin owner reads its new agent's results; another non-admin does not;
        # a legacy zero-owned record stays unreadable to both.
        owned = {"requester_id": spawned["requester_id"], "channel_id": spawned["channel_id"]}
        assert t._can_read_agent_result(owned, API_USER, "42")
        assert not t._can_read_agent_result(owned, "someone-else", "42")
        legacy = {"requester_id": "0", "channel_id": "42"}
        assert not t._can_read_agent_result(legacy, API_USER, "42")

    async def test_delegated_tasks_check_and_own_as_the_requester(self):
        executor = MagicMock()
        executor.check_permission.return_value = ""
        t = _tools(tool_executor=executor)
        with patch(
            "src.discord.native_tools.agents_tasks.run_background_task", new=AsyncMock()
        ) as run:
            await t._handle_delegate_task(
                _proxy(),
                ValidatedNestedPayload(
                    {"steps": [{"tool_name": "web_search", "tool_input": {"query": "q"}}]}
                ),
            )
            await asyncio.sleep(0)
        executor.check_permission.assert_called_once_with("web_search", API_USER)
        (task,) = t._channel_state.background_tasks.values()
        assert task.requester_id == API_USER
        assert run.await_args.args[0] is task  # deferred execution runs this task

    async def test_loops_and_their_iterations_belong_to_the_requester(self):
        t = _tools()
        t._loop_manager.start_loop.return_value = "abc123"
        t._tool_loop.run_autonomous = AsyncMock(return_value="iteration")
        proxy = _proxy()
        assert "abc123" in t._handle_start_loop(proxy, {"goal": "watch the queue"})
        started = t._loop_manager.start_loop.call_args.kwargs
        assert started["requester_id"] == API_USER
        await started["iteration_callback"]("prompt", proxy.channel, None, asyncio.Event())
        assert t._tool_loop.run_autonomous.await_args.args[3] == API_USER

    async def test_schedules_persist_the_requester_as_creator(self, tmp_path):
        path = tmp_path / "schedules.json"
        await SchedulingTools(scheduler=Scheduler(str(path)))._handle_schedule_task(
            _proxy(), {"action": "reminder", "message": "stand-up", "cron": "0 9 * * *"}
        )
        (stored,) = json.loads(path.read_text())
        assert stored["requester_id"] == API_USER


class TestScheduledRuns:
    @pytest.mark.parametrize(
        ("creator", "principal", "author_id", "request_tier"),
        [
            (API_USER, API_USER, API_USER, None),
            ("123456789012345678", "123456789012345678", 123456789012345678, None),
            # A system schedule is admin by its trusted path, never by the name.
            (None, "scheduler", "scheduler", "admin"),
        ],
    )
    async def test_one_principal_and_the_inherited_scope_survive(
        self, creator, principal, author_id, request_tier
    ):
        seen = {}

        async def dispatch(name, inp, proxy, execution_id):
            seen.update(proxy=proxy, execution_id=execution_id, tier=_request_tier.get())
            return ToolResult(output="done", ok=True, tool_name=name)

        loop = MagicMock(dispatch_loop_tool_inner=AsyncMock(side_effect=dispatch))
        result = await _handlers(tool_loop=loop)._execute_scheduled_tool(
            "t", {}, _channel(), creator
        )
        assert result.ok
        assert seen["execution_id"] == principal and seen["proxy"].author.id == author_id
        assert seen["tier"] == request_tier


class _NestedLLM(FakeLLM):
    """Main-turn script plus one script per agent, routed by the agent's goal."""

    def __init__(self, main: list, agents: dict[str, list]) -> None:
        super().__init__(main)
        self.agent_scripts = {goal: list(script) for goal, script in agents.items()}

    async def chat_with_tools(self, messages, system="", tools=None, **kwargs):
        if "AGENT CONTEXT" not in (system or ""):
            return await super().chat_with_tools(messages, system, tools, **kwargs)
        text = json.dumps(messages, default=str)
        goal = next(g for g in self.agent_scripts if g in text)
        item = self.agent_scripts[goal].pop(0)
        if callable(item):
            item = item()
        item.provenance_provider = "fake"
        item.provenance_model = kwargs.get("model") or self.model
        return item


async def test_a_nested_agent_under_an_api_identity_runs_and_audits_as_it():
    bot_box: dict = {}

    def agent_ids(label):
        return [a.id for a in bot_box["bot"].agent_manager._agents.values() if a.label == label]

    def wait_for(label, prefix):
        return lambda: tool_call_response(
            ("wait_for_agents", {"agent_ids": agent_ids(label), "timeout": 30}), id_prefix=prefix
        )

    fake = _NestedLLM(
        [],
        {
            "COORDINATE-GOAL": [
                tool_call_response(
                    ("spawn_agent", {"label": "worker", "goal": "WORKER-GOAL"}), id_prefix="co"
                ),
                wait_for("worker", "cw"),
                text_response("coordinator done"),
            ],
            "WORKER-GOAL": [
                tool_call_response(("report_to_parent", {"message": "found it"}), id_prefix="wk"),
                text_response("worker done"),
            ],
        },
    )
    bot = make_bot(fake_llm=fake, config_overrides={"agents": {"model": None}})
    bot_box["bot"] = bot
    bot.agent_manager._completion_classifier = None
    fake.responses[:] = [
        tool_call_response(("spawn_agent", {"label": "coordinator", "goal": "COORDINATE-GOAL"})),
        wait_for("coordinator", "mw"),
        text_response("summary"),
    ]
    message = FakeMessage("coordinate", author=FakeAuthor(id=API_USER, name=API_USER), id=9101)
    from src.discord.tool_loop import CHAT_POLICY

    turn = await bot.tool_loop._prepare_chat_turn(
        message, [{"role": "user", "content": "coordinate"}], None, None, CHAT_POLICY
    )
    result = await asyncio.wait_for(bot.tool_loop._run_with_guards(turn), 20)
    assert result[0] == "summary"

    agents = {a.label: a for a in bot.agent_manager._agents.values()}
    assert agents["coordinator"].requester_id == API_USER
    assert agents["worker"].requester_id == API_USER
    assert agents["worker"].result == "worker done"
    if _pending_observers:
        await asyncio.gather(*list(_pending_observers), return_exceptions=True)
    worker_rows = [
        e
        for e in await bot.audit.search(limit=200)
        if e.get("agent_id") == agents["worker"].id and e.get("tool_name") == "report_to_parent"
    ]
    assert worker_rows and {e.get("user_id") for e in worker_rows} == {API_USER}
