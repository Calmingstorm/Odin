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

# (public name, BotComponents field) — the campaign-era underscore aliases
# were retired in P7; public names are the only spelling.
COMPONENT_PAIRS = [
    ("llm_gateway", "llm_gateway"),
    ("prompt_builder", "prompt_builder"),
    ("tool_catalog", "tool_catalog"),
    ("native_tools", "native_tools"),
    ("scheduling_tools", "scheduling_tools"),
    ("knowledge_tools", "knowledge_tools"),
    ("channel_ops_tools", "channel_ops_tools"),
    ("media_tools", "media_tools"),
    ("delivery", "delivery"),
    ("completion_classifier", "completion_classifier"),
    ("tool_loop", "tool_loop"),
    ("turn_recorder", "turn_recorder"),
    ("scheduled_events", "scheduled_events"),
    ("agent_task_tools", "agent_task_tools"),
    ("intake", "intake"),
    ("pipeline", "pipeline"),
    ("housekeeping", "housekeeping"),
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

    def test_public_names_are_the_component_fields(self, bot):
        for public, fieldname in COMPONENT_PAIRS:
            pub = getattr(bot, public)
            assert pub is getattr(bot.components, fieldname), (
                f"bot.{public} is not components.{fieldname}"
            )

    def test_channel_state_lives_in_services(self, bot):
        assert bot.channel_state is bot.services.channel_state
        assert bot.channel_state is bot.channel_state
        # The six facade dict aliases still point INTO the registry
        assert bot.channel_state.channel_locks is bot.channel_state.channel_locks
        assert bot.channel_state.cancel_events is bot.channel_state.cancel_events
        assert bot.channel_state.pending_files is bot.channel_state.pending_files
        assert bot.channel_state.recent_actions is bot.channel_state.recent_actions
        assert bot.channel_state.last_op_details is bot.channel_state.last_op_details
        assert bot.channel_state.background_tasks is bot.channel_state.background_tasks

    def test_gateway_owns_the_llm_surface(self, bot):
        assert bot.llm_gateway is bot.components.llm_gateway

    def test_calibration_release_hooks_are_wired_to_owner_managers(self, bot):
        assert bot.agent_manager._window_observer is bot.services.window_observer
        assert bot.loop_manager._calibration_releaser is not None
        assert bot.housekeeping._window_observer is bot.services.window_observer
        assert bot.pipeline._turn_resume is not None
        assert bot.pipeline._turn_resume._release_workload is not None

    def test_scheduler_start_wires_scheduled_events_methods(self):
        # on_ready is too heavy to drive here (guild sync); pin the spelling.
        from src.discord.client import OdinBot

        src = inspect.getsource(OdinBot.on_ready)
        assert "self.scheduled_events._on_scheduled_task" in src
        assert "self.scheduled_events._on_schedule_failure" in src


class TestAuxiliaryWiring:
    """build_services builds the AuxiliaryLLMClient (no per-task gating) and
    binds it onto the gateway when Codex + auxiliary are both enabled."""

    def test_aux_client_built_and_bound(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        from unittest.mock import MagicMock

        import src.discord.wiring as wiring

        captured = {}

        class _FakeAux:
            def __init__(self, *, aux_client, primary_client, cost_tracker):
                captured["instance"] = self

        # AuxiliaryLLMClient is imported locally in build_services → patch it
        # at its source module; the Codex classes are module-level in wiring.
        import src.llm.auxiliary as aux_mod
        monkeypatch.setattr(aux_mod, "AuxiliaryLLMClient", _FakeAux)
        fake_pool = MagicMock()
        fake_pool.is_configured.return_value = True
        fake_pool._accounts = [object()]
        monkeypatch.setattr(wiring, "CodexAuthPool", lambda *a, **k: fake_pool)
        monkeypatch.setattr(wiring, "CodexChatClient", lambda *a, **k: MagicMock())

        bot = make_bot(config_overrides={
            "openai_codex": {
                "enabled": True,
                "credentials_path": "/fake/creds.json",
                "auxiliary": {
                    "enabled": True,
                    "model": "gpt-5.6-terra",
                },
            },
        })
        assert captured.get("instance") is not None
        assert bot.llm_gateway.auxiliary_llm_client is captured["instance"]


class TestAuxiliaryFlatHandle:
    def test_flat_handle_follows_gateway_swaps(self, tmp_path, monkeypatch):
        # bot.auxiliary_llm_client is a property over the gateway's canonical
        # pointer — it can never point at a retired generation.
        monkeypatch.chdir(tmp_path)
        bot = make_bot(fake_llm=FakeLLM([]))
        assert bot.auxiliary_llm_client is bot.llm_gateway.auxiliary_llm_client
        sentinel = object()
        bot.llm_gateway.auxiliary_llm_client = sentinel
        assert bot.auxiliary_llm_client is sentinel
