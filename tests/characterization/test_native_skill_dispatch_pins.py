"""RFC-004 P0 — native skill-dispatch pins (R1 blocker #4).

Pins the DISPATCH-LAYER behavior of the skill paths inside
NativeToolDispatcher before P3 extracts them to skills_tools.py:

- handles() truth table (registered natives, skill CRUD + meta, dynamic
  user skills, and False for executor-routed tools)
- skill CRUD side effects: tool_catalog.invalidate(), skills-text cache
  cleared, effects.rebuild_system_prompt=True
- invoke_skill loud failures (missing name / unknown skill / non-dict
  input / missing required fields)
- export_skill ALWAYS stages into channel_state.pending_files
- file-delivery modes: "send" posts to the channel, "stage" appends to
  pending_files

These are dispatch pins, not skill_manager pins — the manager is stubbed.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.discord.native_tools.registry import (
    SKILL_CRUD_TOOLS,
    NativeToolDispatcher,
)

from .test_executor_dispatch_parity import (
    EXECUTOR_ROUTED,
    NATIVE_REGISTERED,
    SKILL_TOOLS,
)


def _dispatcher(**overrides) -> NativeToolDispatcher:
    skill_manager = overrides.pop("skill_manager", None) or MagicMock()
    tool_catalog = overrides.pop("tool_catalog", None) or MagicMock()
    prompt_builder = overrides.pop("prompt_builder", None) or SimpleNamespace(
        cached_skills_text="stale"
    )
    channel_state = overrides.pop("channel_state", None) or SimpleNamespace(
        pending_files={}
    )
    return NativeToolDispatcher(
        owners={},
        skill_manager=skill_manager,
        tool_catalog=tool_catalog,
        prompt_builder=prompt_builder,
        channel_state=channel_state,
    )


def _message(channel_id: int = 123):
    msg = MagicMock()
    msg.channel.id = channel_id
    msg.channel.send = AsyncMock()
    msg.author = "tester#1"
    return msg


class TestHandlesTruthTable:
    def test_skill_names_always_handled(self):
        d = _dispatcher()
        d.skill_manager.has_skill = lambda name: False
        for name in sorted(SKILL_TOOLS):
            assert d.handles(name), f"{name} must be native-handled"

    def test_dynamic_user_skill_names_handled(self):
        d = _dispatcher()
        d.skill_manager.has_skill = lambda name: name == "my_custom_skill"
        assert d.handles("my_custom_skill")
        assert not d.handles("someone_elses_skill")

    def test_executor_routed_tools_not_handled(self):
        d = _dispatcher()
        d.skill_manager.has_skill = lambda name: False
        for name in sorted(EXECUTOR_ROUTED):
            assert not d.handles(name), f"{name} must fall through to ToolExecutor"

    def test_wired_bot_handles_all_native_registrations(self):
        """The fully-wired dispatcher answers True for every registered
        native — the live half of the truth table."""
        from src.config.schema import Config
        from src.discord.client import OdinBot

        bot = OdinBot(
            Config(discord={"token": "pin-test"}, permissions={"default_tier": "admin"})
        )
        bot.native_tools.skill_manager.has_skill = lambda name: False
        for name in sorted(NATIVE_REGISTERED):
            assert bot.native_tools.handles(name), f"{name} missing from native table"
        for name in sorted(EXECUTOR_ROUTED):
            assert not bot.native_tools.handles(name), f"{name} wrongly native"


class TestSkillCrudEffects:
    CRUD_CALLS = {
        "create_skill": ({"name": "s", "code": "c"}, "create_skill"),
        "edit_skill": ({"name": "s", "code": "c"}, "edit_skill"),
        "delete_skill": ({"name": "s"}, "delete_skill"),
        "enable_skill": ({"name": "s"}, "enable_skill"),
        "disable_skill": ({"name": "s"}, "disable_skill"),
        "install_skill": ({"url": "https://example.com/skill.py"}, "install_from_url"),
    }

    @pytest.mark.parametrize("tool_name", sorted(SKILL_CRUD_TOOLS))
    async def test_crud_invalidates_and_signals_rebuild(self, tool_name):
        assert tool_name in self.CRUD_CALLS, "CRUD set drifted — update the pins"
        tool_input, manager_method = self.CRUD_CALLS[tool_name]

        sm = MagicMock()
        sm.install_from_url = AsyncMock(return_value="installed")
        for m in ("create_skill", "edit_skill", "delete_skill", "enable_skill", "disable_skill"):
            setattr(sm, m, MagicMock(return_value=f"{m}-done"))

        d = _dispatcher(skill_manager=sm)
        result, effects = await d.dispatch(
            tool_name, dict(tool_input), message=_message(), user_id="u",
            skill_file_delivery="send",
        )
        assert getattr(sm, manager_method).called
        assert effects.rebuild_system_prompt is True, f"{tool_name} must signal prompt rebuild"
        assert d.tool_catalog.invalidate.called, f"{tool_name} must invalidate the tool catalog"
        assert d.prompt_builder.cached_skills_text is None, f"{tool_name} must clear skills text"
        assert result


class TestInvokeSkillLoudFailures:
    async def test_missing_name(self):
        d = _dispatcher()
        result, effects = await d.dispatch(
            "invoke_skill", {}, message=_message(), user_id="u", skill_file_delivery="send",
        )
        assert result == "Error: invoke_skill requires 'name'."
        assert effects.rebuild_system_prompt is False

    async def test_unknown_skill(self):
        d = _dispatcher()
        d.skill_manager.has_skill = lambda name: False
        result, _ = await d.dispatch(
            "invoke_skill", {"name": "ghost"}, message=_message(), user_id="u",
            skill_file_delivery="send",
        )
        assert "Error: skill 'ghost' not found or disabled" in result

    async def test_non_dict_input(self):
        d = _dispatcher()
        d.skill_manager.has_skill = lambda name: True
        result, _ = await d.dispatch(
            "invoke_skill", {"name": "s", "input": "oops"}, message=_message(),
            user_id="u", skill_file_delivery="send",
        )
        assert result == "Error: invoke_skill 'input' must be an object."

    async def test_missing_required_fields_fail_loudly(self):
        skill = SimpleNamespace(definition={"input_schema": {"required": ["target", "mode"]}})
        sm = MagicMock()
        sm.has_skill = lambda name: True
        sm._skills = {"s": skill}
        d = _dispatcher(skill_manager=sm)
        result, _ = await d.dispatch(
            "invoke_skill", {"name": "s", "input": {"target": "x"}},
            message=_message(), user_id="u", skill_file_delivery="send",
        )
        assert "missing required fields" in result
        assert "'mode'" in result
        assert not sm.execute.called, "skill must NOT run with incomplete input"

    async def test_complete_input_executes_with_callbacks(self):
        skill = SimpleNamespace(definition={"input_schema": {"required": ["target"]}})
        sm = MagicMock()
        sm.has_skill = lambda name: True
        sm._skills = {"s": skill}
        sm.execute = AsyncMock(return_value="skill-ran")
        d = _dispatcher(skill_manager=sm)
        result, _ = await d.dispatch(
            "invoke_skill", {"name": "s", "input": {"target": "x"}},
            message=_message(), user_id="u", skill_file_delivery="stage",
        )
        assert result == "skill-ran"
        kwargs = sm.execute.call_args.kwargs
        assert callable(kwargs["message_callback"]) and callable(kwargs["file_callback"])


class TestFileDelivery:
    async def test_export_skill_always_stages(self):
        sm = MagicMock()
        sm.export_skill = MagicMock(return_value=(b"payload", "skill.py"))
        d = _dispatcher(skill_manager=sm)
        msg = _message(channel_id=777)
        result, _ = await d.dispatch(
            "export_skill", {"name": "s"}, message=msg, user_id="u",
            skill_file_delivery="send",  # even in send mode, export stages
        )
        assert "exported as skill.py" in result
        assert d.channel_state.pending_files["777"] == [(b"payload", "skill.py")]
        assert not msg.channel.send.called

    async def test_file_cb_stage_mode_appends_pending(self):
        # Re-pointed at the skill domain owner (RFC-004 P3) — the callback
        # factories moved verbatim from the dispatcher to SkillTools.
        d = _dispatcher()
        msg = _message(channel_id=42)
        cb = d.skills._skill_file_cb(msg, "stage")
        await cb(b"data", "out.txt")
        assert d.channel_state.pending_files["42"] == [(b"data", "out.txt")]
        assert not msg.channel.send.called

    async def test_file_cb_send_mode_posts_to_channel(self):
        d = _dispatcher()
        msg = _message(channel_id=42)
        cb = d.skills._skill_file_cb(msg, "send")
        await cb(b"data", "out.txt", "caption")
        assert msg.channel.send.called
        assert d.channel_state.pending_files == {}

    async def test_list_skills_empty_message(self):
        sm = MagicMock()
        sm.list_skills = MagicMock(return_value=[])
        d = _dispatcher(skill_manager=sm)
        result, _ = await d.dispatch(
            "list_skills", {}, message=_message(), user_id="u", skill_file_delivery="send",
        )
        assert result == "No user-created skills."
