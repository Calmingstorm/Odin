"""Characterization: two-stage composition (RFC-002 P2).

Pins the build_services → build_components assembly: public component
names and their campaign-era underscore aliases are the SAME objects,
the channel-state registry lives in services, and the R1 rewiring holds
(infra-watcher alert callback and scheduler callbacks bind the
scheduled-events component directly — no bot delegate in the path).
"""

from __future__ import annotations

import inspect

import pytest

from src.discord.wiring import BotComponents, BotServices
from tests.fakes import FakeLLM, make_bot

# (public name, campaign alias, BotComponents field)
COMPONENT_TRIPLES = [
    ("llm_gateway", "_llm_gateway", "llm_gateway"),
    ("prompt_builder", "_prompt_builder", "prompt_builder"),
    ("tool_catalog", "_tool_catalog", "tool_catalog"),
    ("native_tools", "_native_tools", "native_tools"),
    ("scheduling_tools", "_scheduling_tools", "scheduling_tools"),
    ("knowledge_tools", "_knowledge_tools", "knowledge_tools"),
    ("channel_ops_tools", "_channel_ops_tools", "channel_ops_tools"),
    ("media_tools", "_media_tools", "media_tools"),
    ("delivery", "_delivery", "delivery"),
    ("completion_classifier", "_completion_classifier", "completion_classifier"),
    ("tool_loop", "_tool_loop_runner", "tool_loop"),
    ("turn_recorder", "_turn_recorder", "turn_recorder"),
    ("scheduled_events", "_scheduled_events", "scheduled_events"),
    ("agent_task_tools", "_agent_task_tools", "agent_task_tools"),
    ("intake", "_message_intake", "intake"),
    ("pipeline", "_message_pipeline", "pipeline"),
]


@pytest.fixture(autouse=True)
def _isolated_cwd(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)


@pytest.fixture
def bot():
    return make_bot(fake_llm=FakeLLM([]))


class TestTwoStageComposition:
    def test_services_and_components_handles(self, bot):
        assert isinstance(bot.services, BotServices)
        assert isinstance(bot.components, BotComponents)

    def test_public_names_alias_underscore_names_and_component_fields(self, bot):
        for public, alias, fieldname in COMPONENT_TRIPLES:
            pub = getattr(bot, public)
            assert pub is getattr(bot, alias), f"{public} is not {alias}"
            assert pub is getattr(bot.components, fieldname), (
                f"bot.{public} is not components.{fieldname}"
            )

    def test_channel_state_lives_in_services(self, bot):
        assert bot.channel_state is bot.services.channel_state
        assert bot.channel_state is bot._channel_state
        # The six facade dict aliases still point INTO the registry
        assert bot._channel_locks is bot.channel_state.channel_locks
        assert bot._cancel_events is bot.channel_state.cancel_events
        assert bot._pending_files is bot.channel_state.pending_files
        assert bot._recent_actions is bot.channel_state.recent_actions
        assert bot._last_op_details is bot.channel_state.last_op_details
        assert bot._background_tasks is bot.channel_state.background_tasks

    def test_gateway_owns_the_llm_surface(self, bot):
        # The bot property shims read the gateway (unchanged by P2)
        assert bot.codex_client is bot.llm_gateway.codex_client
        assert bot.llm_client is bot.llm_gateway.active_client

    def test_infra_watcher_alert_callback_binds_scheduled_events(self, tmp_path):
        bot = make_bot(
            fake_llm=FakeLLM([]),
            config_overrides={
                "monitoring": {
                    "enabled": True,
                    "checks": [{"name": "disk", "type": "disk", "threshold": 95}],
                }
            },
        )
        assert bot.infra_watcher is not None
        cb = bot.infra_watcher._alert_callback
        assert getattr(cb, "__self__", None) is bot.scheduled_events, (
            "R1: the alert callback must bind the scheduled-events component "
            "directly, not a bot delegate"
        )

    def test_infra_watcher_absent_but_attribute_none_by_default(self, bot):
        assert bot.infra_watcher is None  # attribute exists, None when disabled

    def test_scheduler_start_wires_scheduled_events_methods(self):
        # on_ready is too heavy to drive here (guild sync); pin the spelling.
        from src.discord.client import OdinBot

        src = inspect.getsource(OdinBot.on_ready)
        assert "self.scheduled_events._on_scheduled_task" in src
        assert "self.scheduled_events._on_schedule_failure" in src
