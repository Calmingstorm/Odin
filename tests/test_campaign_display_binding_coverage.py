"""Display legacy policy and stale browser grants cannot manufacture authority."""
from types import SimpleNamespace

import pytest

from src.config.schema import ApiTokenIdentity, Config
from src.health.server import SessionManager
from src.web.api._agent_display import _live_effort, agent_display_policy
from src.web.computer_binding import browser_binding


@pytest.mark.parametrize("provider,section", [("kimi", "kimi"), ("compat", "openai_compatible")])
def test_pending_legacy_non_codex_model_is_reported_without_reasoning_effort(provider, section):
    config = SimpleNamespace(llm_provider=SimpleNamespace(active_provider=provider))
    setattr(config, section, SimpleNamespace(model="legacy-test-model"))
    result = agent_display_policy(SimpleNamespace(), SimpleNamespace(config=config))
    assert result["display_model"] == "legacy-test-model"
    assert result["display_model_source"] == "current_inheritance"
    assert result["display_reasoning_effort"] == "N/A"
    assert _live_effort(SimpleNamespace(config=config), provider) == "N/A"


def test_unknown_backing_credential_never_grants_browser_authority():
    identity = ApiTokenIdentity(token="not-in-inventory", user_id="test", tier="admin")
    sessions = SessionManager()
    sid, _ = sessions.create(identity)
    request = SimpleNamespace(_api_identity=identity, _session_id=sid, _session_managed=True,
                              app={"session_manager": sessions}, query={})
    bot = SimpleNamespace(config=Config(discord={"token": "test"}))
    assert browser_binding(bot, request) is None
