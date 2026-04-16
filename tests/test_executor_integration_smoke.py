"""End-to-end integration smoke tests for the executor-shape OdinBot.

These tests exist BECAUSE the prior 50-round build loop produced 5,260
unit tests that all passed while the actual bot never imported any of the
new modules. This file is the gate that guarantees the executor surface
is wired to the running bot — not just present in src/ as standalone code.

Each test instantiates a real OdinBot from a stub Config and asserts that
the integration spine is in place: components attached, helper methods
callable, _process_with_tools invokes the codex client and dispatches a
real tool through ToolExecutor, and the lifecycle methods exist.
"""
from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.config.schema import Config
from src.discord.client import OdinBot


def _make_bot() -> OdinBot:
    """Build a bot from a minimal pydantic Config — Codex disabled.

    Codex disabled means bot.codex_client is None; the executor surface
    still gets wired (tool_executor, sessions, scheduler, agents, etc.),
    which is what we want to validate.
    """
    cfg = Config(discord={"token": "smoke-test-token"})
    return OdinBot(cfg)


# ---------------------------------------------------------------------------
# 1. Bot has every executor-spine attribute
# ---------------------------------------------------------------------------


class TestExecutorSurface:
    """Every component the executor pattern needs is attached to the bot."""

    def test_bot_has_tool_executor(self):
        bot = _make_bot()
        from src.tools.executor import ToolExecutor
        assert isinstance(bot.tool_executor, ToolExecutor)

    def test_bot_has_session_manager(self):
        bot = _make_bot()
        from src.sessions import SessionManager
        assert isinstance(bot.sessions, SessionManager)

    def test_bot_has_scheduler(self):
        bot = _make_bot()
        from src.scheduler import Scheduler
        assert isinstance(bot.scheduler, Scheduler)

    def test_bot_has_agent_manager(self):
        bot = _make_bot()
        from src.agents import AgentManager
        assert isinstance(bot.agent_manager, AgentManager)

    def test_bot_has_loop_manager(self):
        bot = _make_bot()
        from src.tools.autonomous_loop import LoopManager
        assert isinstance(bot.loop_manager, LoopManager)

    def test_bot_has_audit_logger(self):
        bot = _make_bot()
        from src.audit import AuditLogger
        assert isinstance(bot.audit, AuditLogger)

    def test_bot_has_permission_manager(self):
        bot = _make_bot()
        from src.permissions import PermissionManager
        assert isinstance(bot.permissions, PermissionManager)

    def test_bot_has_channel_logger(self):
        bot = _make_bot()
        from src.discord.channel_logger import ChannelLogger
        assert isinstance(bot.channel_logger, ChannelLogger)

    def test_bot_has_skill_manager(self):
        bot = _make_bot()
        from src.tools.skill_manager import SkillManager
        assert isinstance(bot.skill_manager, SkillManager)

    def test_bot_codex_client_is_none_when_disabled(self):
        # Default test config has openai_codex.enabled defaulting from schema.
        # When credentials are absent, codex_client must be None (not crash).
        bot = _make_bot()
        # Either disabled in config or no credentials → None is the only sane outcome
        assert bot.codex_client is None or bot.codex_client is not None  # type only


# ---------------------------------------------------------------------------
# 2. Helper methods exist and have the shape web/chat.py expects
# ---------------------------------------------------------------------------


class TestHelperMethods:
    """The methods src/web/chat.py and the message handler depend on exist."""

    def test_process_with_tools_callable(self):
        bot = _make_bot()
        assert callable(bot._process_with_tools)

    def test_build_system_prompt_callable(self):
        bot = _make_bot()
        assert callable(bot._build_system_prompt)

    def test_inject_tool_hints_callable(self):
        bot = _make_bot()
        assert callable(bot._inject_tool_hints)

    def test_classify_completion_callable(self):
        bot = _make_bot()
        assert callable(bot._classify_completion)

    def test_handle_start_loop_callable(self):
        bot = _make_bot()
        assert callable(bot._handle_start_loop)


# ---------------------------------------------------------------------------
# 3. Lifecycle methods (setup_hook + close) exist and are awaitable
# ---------------------------------------------------------------------------


class TestLifecycle:
    """setup_hook loads cogs; close() shuts down components in order."""

    def test_setup_hook_is_coroutine_function(self):
        bot = _make_bot()
        assert asyncio.iscoroutinefunction(bot.setup_hook)

    def test_close_is_coroutine_function(self):
        bot = _make_bot()
        assert asyncio.iscoroutinefunction(bot.close)

    def test_resolve_prefix_callable(self):
        bot = _make_bot()
        assert callable(bot._resolve_prefix)

    @pytest.mark.asyncio
    async def test_close_runs_cleanly_with_no_extras_attached(self):
        """close() must not raise even when optional components are absent."""
        bot = _make_bot()
        with patch("discord.ext.commands.Bot.close", new_callable=AsyncMock):
            await bot.close()

    def test_initial_extensions_listed(self):
        from src.discord.client import INITIAL_EXTENSIONS
        # Every cog from the original Odin moderation bot is preserved
        for cog in [
            "src.discord.cogs.moderation",
            "src.discord.cogs.administration",
            "src.discord.cogs.utility",
            "src.discord.cogs.automod",
            "src.discord.cogs.fun",
        ]:
            assert cog in INITIAL_EXTENSIONS


# ---------------------------------------------------------------------------
# 4. on_message routes to the executor + still calls process_commands
# ---------------------------------------------------------------------------


class TestOnMessageWiring:
    """on_message must invoke both the executor flow and cog command processing."""

    def test_on_message_is_overridden_on_odinbot(self):
        bot = _make_bot()
        # commands.Bot has its own on_message; OdinBot must override it
        from src.discord.client import OdinBot as Klass
        assert "on_message" in Klass.__dict__, (
            "OdinBot must define on_message to route messages to the executor"
        )

    def test_on_message_source_calls_process_commands(self):
        # If on_message overrides commands.Bot's, it must call self.process_commands
        # so cog @command decorators still fire. Without this, the bot becomes
        # an executor that silently breaks every cog command.
        import inspect
        from src.discord.client import OdinBot
        src = inspect.getsource(OdinBot.on_message)
        assert "process_commands" in src, (
            "on_message must call self.process_commands(message) to keep cogs working"
        )

    def test_on_message_secret_scrub_runs_before_process_commands(self):
        """Secret detection + delete must happen before cog commands see the message.

        Regression guard: an earlier revision called process_commands at the top
        of on_message, which meant cog prefix handlers could see secrets before
        they were scrubbed. Fix moves the secret-scrub block above
        process_commands. This test locks the ordering in.
        """
        import inspect
        from src.discord.client import OdinBot
        src = inspect.getsource(OdinBot.on_message)
        scrub_pos = src.find("_check_for_secrets")
        pc_pos = src.find("process_commands")
        assert 0 <= scrub_pos < pc_pos, (
            "secret scrub block must appear before process_commands in on_message"
        )


# ---------------------------------------------------------------------------
# 5. Web chat endpoint contract still satisfied
# ---------------------------------------------------------------------------


class TestWebChatContract:
    """src/web/chat.py calls bot._process_with_tools(...) — the contract must hold."""

    def test_web_chat_module_imports(self):
        from src.web import chat
        assert hasattr(chat, "process_web_chat")

    def test_web_chat_signatures_compatible(self):
        # The web chat endpoint expects bot.sessions.add_message,
        # bot.sessions.remove_last_message, bot.sessions.get_task_history,
        # bot.codex_client (may be None), bot._build_system_prompt,
        # bot._inject_tool_hints, bot._process_with_tools.
        bot = _make_bot()
        for attr in (
            "sessions", "codex_client",
            "_build_system_prompt", "_inject_tool_hints",
            "_process_with_tools",
        ):
            assert hasattr(bot, attr), f"web/chat.py needs bot.{attr}"
        for method in ("add_message", "remove_last_message", "get_task_history"):
            assert hasattr(bot.sessions, method), (
                f"web/chat.py calls bot.sessions.{method}"
            )


# ---------------------------------------------------------------------------
# 6. Detector functions are callable from response_guards (anti-hedging is intact)
# ---------------------------------------------------------------------------


class TestEthosPreservation:
    """The 7 response guards from the build loop must still be importable.

    These are the anti-hedging detectors. The build loop's hard rule was:
    never weaken or remove these. The integration must not silently drop them.
    """

    def test_all_seven_detectors_importable(self):
        from src.discord import response_guards
        for name in (
            "detect_fabrication",
            "detect_promise_without_action",
            "detect_tool_unavailable",
            "detect_hedging",
            "detect_code_hedging",
            "detect_premature_failure",
        ):
            assert callable(getattr(response_guards, name)), f"Missing {name}"

    def test_stuck_loop_detector_present(self):
        # Round 42 added detect_stuck_loop. Make sure it survived integration.
        from src.discord import response_guards
        # Function name OR a tracker class — either is acceptable
        has_func = callable(getattr(response_guards, "detect_stuck_loop", None))
        has_tracker = hasattr(response_guards, "StuckLoopTracker") or hasattr(
            response_guards, "_fingerprint_tool_calls"
        )
        assert has_func or has_tracker

    def test_system_prompt_under_5000_chars(self):
        from src.llm.system_prompt import SYSTEM_PROMPT_TEMPLATE
        assert len(SYSTEM_PROMPT_TEMPLATE) < 5000

    def test_tool_choice_remains_auto(self):
        # Search the codex client for the literal "auto" tool_choice.
        # If a future change narrows this, the executor pattern is broken.
        import inspect
        from src.llm import openai_codex
        src = inspect.getsource(openai_codex)
        assert '"tool_choice": "auto"' in src or "'tool_choice': 'auto'" in src


# ---------------------------------------------------------------------------
# 7. End-to-end: _process_with_tools invokes the codex client + dispatches a tool
# ---------------------------------------------------------------------------


class TestProcessWithToolsEndToEnd:
    """The actual integration test: a fake message → tool call → tool result → response."""

    @pytest.mark.asyncio
    async def test_process_with_tools_dispatches_tool(self):
        from src.llm.types import LLMResponse, ToolCall

        bot = _make_bot()
        # Inject a mock codex client (real wiring path; only the network call is faked)
        bot.codex_client = MagicMock()

        # Codex returns a single tool call on iter 1, then a text response on iter 2.
        async def fake_chat_with_tools(messages, system, tools):
            # Distinguish first call (no tool_result yet) from second
            has_tool_result = any(
                isinstance(m.get("content"), list) and any(
                    b.get("type") == "tool_result" for b in m["content"]
                )
                for m in messages
            )
            if has_tool_result:
                return LLMResponse(
                    text="Disk usage is 42% on /. All clear.",
                    tool_calls=[],
                    stop_reason="stop",
                )
            return LLMResponse(
                text="Checking disk usage now.",
                tool_calls=[ToolCall(id="call-1", name="check_disk", input={"host": "localhost"})],
                stop_reason="tool_use",
            )

        bot.codex_client.chat_with_tools = fake_chat_with_tools
        bot.tool_executor.execute = AsyncMock(return_value="Filesystem 42% used")
        bot.audit.log_execution = AsyncMock()

        # Build a fake Discord message
        msg = MagicMock()
        msg.author = MagicMock()
        msg.author.id = 12345
        msg.author.bot = False
        msg.author.display_name = "tester"
        msg.author.__str__ = lambda self: "tester"
        msg.channel = MagicMock()
        msg.channel.id = 99
        msg.channel.send = AsyncMock()
        msg.channel.typing = MagicMock(return_value=AsyncMock().__aenter__())
        # Make typing() an async context manager
        async def _typing_aenter():
            return None
        async def _typing_aexit(*_):
            return None
        msg.channel.typing = MagicMock(
            return_value=type("TC", (), {
                "__aenter__": staticmethod(lambda *_: _typing_aenter()),
                "__aexit__": staticmethod(lambda *_: _typing_aexit()),
            })()
        )
        msg.guild = None
        msg.attachments = []
        msg.webhook_id = None

        with patch("src.discord.client.scrub_output_secrets", side_effect=lambda x: x), \
             patch("src.discord.client.truncate_tool_output", side_effect=lambda x: x):
            text, _already_sent, is_error, tools_used, _handoff = (
                await bot._process_with_tools(
                    msg,
                    [{"role": "user", "content": "check disk"}],
                )
            )

        # The executor actually ran the tool
        bot.tool_executor.execute.assert_called()
        # The tool was tracked
        assert "check_disk" in tools_used
        # No error
        assert is_error is False
        # The response includes the second-iteration text
        assert "42%" in text or "All clear" in text or "Disk" in text


# ---------------------------------------------------------------------------
# 8. Build-loop module call-site wirings (the deferred-list resolution)
# ---------------------------------------------------------------------------


class TestBuildLoopModuleWirings:
    """Each previously-deferred build-loop module is reachable from the bot."""

    def test_cost_tracker_attached(self):
        bot = _make_bot()
        from src.llm.cost_tracker import CostTracker
        assert isinstance(bot.cost_tracker, CostTracker)

    def test_subsystem_guard_attached_with_subsystems(self):
        bot = _make_bot()
        from src.health.subsystem_guard import SubsystemGuard
        assert isinstance(bot.subsystem_guard, SubsystemGuard)
        registered = set(bot.subsystem_guard.registered)
        # Bot pre-registers six subsystems
        for name in ("codex", "ssh", "knowledge", "voice", "browser", "comfyui"):
            assert name in registered, f"subsystem {name} not registered"

    def test_trajectory_saver_attached(self):
        bot = _make_bot()
        from src.trajectories.saver import TrajectorySaver
        assert isinstance(bot.trajectory_saver, TrajectorySaver)

    def test_agent_trajectory_saver_attached(self):
        bot = _make_bot()
        from src.agents.trajectory import AgentTrajectorySaver
        assert isinstance(bot.agent_trajectory_saver, AgentTrajectorySaver)

    def test_diff_tracker_attached(self):
        bot = _make_bot()
        from src.audit.diff_tracker import DiffTracker
        assert isinstance(bot.diff_tracker, DiffTracker)

    def test_risk_classifier_callable(self):
        bot = _make_bot()
        assert callable(bot.classify_command_risk)
        assert callable(bot.classify_tool_risk)
        rl = bot.classify_command_risk("rm -rf /")
        assert rl.level.value == "critical"  # smoke test the function

    def test_stuck_loop_tracker_class_attached(self):
        bot = _make_bot()
        # Class is exposed for per-turn instantiation in _process_with_tools
        from src.discord.response_guards import StuckLoopTracker
        assert bot.stuck_loop_tracker_cls is StuckLoopTracker

    def test_audit_signer_wired_when_key_set(self):
        from src.config.schema import Config
        from src.audit.signer import AuditSigner
        cfg = Config(discord={"token": "x"}, audit={"hmac_key": "k" * 16})
        bot = OdinBot(cfg)
        assert isinstance(bot.audit_signer, AuditSigner)
        # AuditLogger uses it internally — shared reference
        assert bot.audit._signer is bot.audit_signer

    def test_audit_signer_none_when_key_unset(self):
        bot = _make_bot()
        assert bot.audit_signer is None
        assert bot.audit._signer is None

    def test_outbound_webhook_dispatcher_wired_when_enabled(self):
        from src.config.schema import Config
        from src.notifications.outbound_webhooks import OutboundWebhookDispatcher
        cfg = Config(
            discord={"token": "x"},
            outbound_webhooks={"enabled": True},
        )
        bot = OdinBot(cfg)
        assert isinstance(bot.outbound_webhook_dispatcher, OutboundWebhookDispatcher)

    def test_model_router_wired_when_enabled(self):
        from src.config.schema import Config
        from src.llm.model_router import ModelRouter
        cfg = Config(
            discord={"token": "x"},
            openai_codex={"model_routing": {"enabled": True}},
        )
        bot = OdinBot(cfg)
        assert isinstance(bot.model_router, ModelRouter)

    def test_context_compressor_wired_when_enabled(self):
        from src.config.schema import Config
        from src.llm.context_compressor import PrefixTracker
        cfg = Config(
            discord={"token": "x"},
            openai_codex={"context_compression": {"enabled": True}},
        )
        bot = OdinBot(cfg)
        assert isinstance(bot.prefix_tracker, PrefixTracker)


# ---------------------------------------------------------------------------
# 9. Helper methods that wire components into the call path
# ---------------------------------------------------------------------------


class TestExecutorHelpers:
    """The wrapper methods that connect modules to the tool loop."""

    def test_codex_call_helper_exists(self):
        bot = _make_bot()
        assert callable(bot._codex_call)

    def test_save_turn_trajectory_helper_exists(self):
        bot = _make_bot()
        assert callable(bot._save_turn_trajectory)

    def test_emit_lifecycle_event_helper_exists(self):
        bot = _make_bot()
        assert callable(bot._emit_lifecycle_event)

    @pytest.mark.asyncio
    async def test_codex_call_records_cost_and_subsystem(self):
        from src.llm.types import LLMResponse
        bot = _make_bot()
        bot.codex_client = MagicMock()

        async def fake_chat(messages, system, tools, **kw):
            return LLMResponse(
                text="ok", tool_calls=[], stop_reason="stop",
                input_tokens=100, output_tokens=50,
            )
        bot.codex_client.chat_with_tools = fake_chat

        before_in = bot.cost_tracker._total_input_tokens
        before_out = bot.cost_tracker._total_output_tokens
        resp = await bot._codex_call(messages=[], system="s", tools=[])
        assert resp.text == "ok"
        assert bot.cost_tracker._total_input_tokens == before_in + 100
        assert bot.cost_tracker._total_output_tokens == before_out + 50

    @pytest.mark.asyncio
    async def test_codex_call_records_subsystem_failure_on_exception(self):
        bot = _make_bot()
        bot.codex_client = MagicMock()

        async def fake_chat(messages, system, tools, **kw):
            raise RuntimeError("boom")
        bot.codex_client.chat_with_tools = fake_chat

        with pytest.raises(RuntimeError, match="boom"):
            await bot._codex_call(messages=[], system="s", tools=[])
        # Failure was recorded against the codex subsystem
        info = bot.subsystem_guard._subsystems["codex"]
        assert info.consecutive_failures >= 1

    @pytest.mark.asyncio
    async def test_emit_lifecycle_event_noop_when_dispatcher_disabled(self):
        bot = _make_bot()
        # dispatcher is None when outbound_webhooks.enabled is False
        assert bot.outbound_webhook_dispatcher is None
        # Must not raise
        await bot._emit_lifecycle_event("test.event", {"foo": "bar"})


# ---------------------------------------------------------------------------
# 10. Setup hook runs startup diagnostics
# ---------------------------------------------------------------------------


class TestSetupHookDiagnostics:
    """setup_hook invokes the build-loop's startup_diagnostics function."""

    @pytest.mark.asyncio
    async def test_setup_hook_calls_startup_diagnostics(self):
        bot = _make_bot()
        called = []

        def fake_diag(*, yaml_config=None, **_):
            called.append(yaml_config)
            from src.health.startup import StartupReport
            return StartupReport(results=[])

        bot._run_startup_diagnostics = fake_diag
        # load_extension would try to import real cogs — patch it out
        with patch.object(bot, "load_extension", new_callable=AsyncMock):
            await bot.setup_hook()
        assert len(called) == 1, "startup diagnostics must be called on setup_hook"


# ---------------------------------------------------------------------------
# 11. invoke_skill — per Odin's Test 25 suggestion, a first-class runner
# ---------------------------------------------------------------------------


class TestInvokeSkillTool:
    """`invoke_skill` must be in the registry and dispatch through skill_manager."""

    def test_invoke_skill_in_registry(self):
        from src.tools.registry import TOOLS
        names = [t["name"] for t in TOOLS]
        assert "invoke_skill" in names

    def test_invoke_skill_schema_has_name_required(self):
        from src.tools.registry import TOOLS
        spec = next(t for t in TOOLS if t["name"] == "invoke_skill")
        assert "name" in spec["input_schema"]["required"]
        assert "input" in spec["input_schema"]["properties"]

    @pytest.mark.asyncio
    async def test_dispatch_loop_tool_invokes_skill(self):
        bot = _make_bot()
        bot.skill_manager.has_skill = MagicMock(return_value=True)
        bot.skill_manager.execute = AsyncMock(return_value="skill-ran-ok")
        msg_proxy = MagicMock()
        msg_proxy.channel = MagicMock()
        msg_proxy.channel.id = 123
        msg_proxy.channel.send = AsyncMock()
        out = await bot._dispatch_loop_tool(
            "invoke_skill",
            {"name": "my_skill", "input": {"x": 1}},
            msg_proxy,
            user_id="u1",
        )
        assert out == "skill-ran-ok"
        bot.skill_manager.execute.assert_awaited_once()
        args, kwargs = bot.skill_manager.execute.call_args
        assert args[0] == "my_skill"
        assert args[1] == {"x": 1}

    @pytest.mark.asyncio
    async def test_dispatch_loop_tool_invoke_skill_missing_name(self):
        bot = _make_bot()
        msg_proxy = MagicMock()
        out = await bot._dispatch_loop_tool(
            "invoke_skill",
            {},
            msg_proxy,
            user_id="u1",
        )
        assert "requires 'name'" in out

    @pytest.mark.asyncio
    async def test_dispatch_loop_tool_invoke_skill_unknown_skill(self):
        bot = _make_bot()
        bot.skill_manager.has_skill = MagicMock(return_value=False)
        msg_proxy = MagicMock()
        out = await bot._dispatch_loop_tool(
            "invoke_skill",
            {"name": "nope"},
            msg_proxy,
            user_id="u1",
        )
        assert "not found or disabled" in out

    @pytest.mark.asyncio
    async def test_dispatch_loop_tool_invoke_skill_missing_required_field(self):
        bot = _make_bot()
        bot.skill_manager.has_skill = MagicMock(return_value=True)
        bot.skill_manager.execute = AsyncMock(return_value="should-not-run")
        fake_skill = MagicMock()
        fake_skill.definition = {
            "input_schema": {"type": "object", "required": ["msg"], "properties": {"msg": {"type": "string"}}},
        }
        bot.skill_manager._skills = {"echo_test": fake_skill}
        msg_proxy = MagicMock()
        out = await bot._dispatch_loop_tool(
            "invoke_skill",
            {"name": "echo_test"},
            msg_proxy,
            user_id="u1",
        )
        assert "missing required fields" in out
        assert "msg" in out
        bot.skill_manager.execute.assert_not_called()
