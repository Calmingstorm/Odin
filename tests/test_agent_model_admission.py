"""Model-axis admission and trusted schedule regressions at the real handler."""

from types import SimpleNamespace

import pytest

from src.discord.scheduled_context import scheduled_dispatch
from src.tools.agent_tool_policy import apply_agent_axis_policy, configured_agent_model
from src.tools.defs.agents import TOOLS_SECTION
from tests.test_native_agents_tasks import _cfg, _fake_gateway, _message, _tools


def setup(axis="auto", allowlist=None):
    cfg = _cfg()
    cfg.agents.model = axis
    cfg.agents.auto_model_allowlist = allowlist or []
    cfg.openai_codex = SimpleNamespace(
        enabled=True, model="gpt-5.6-sol", agent_model="gpt-5.6-sol",
        agent_reasoning_effort="auto", reasoning_effort="high",
    )
    cfg.llm_provider = SimpleNamespace(model="gpt-5.6-terra")
    client = SimpleNamespace(model="gpt-5.6-sol", reasoning_effort="high")
    tools = _tools(get_config=lambda: cfg, llm_gateway=_fake_gateway(client))
    tools._agent_manager.spawn.return_value = "admitted"
    tools._agent_manager._agents = {}
    return cfg, tools


@pytest.mark.parametrize("extra", [{}, {"model": None}, {"model": ""},
                                    {"model": "  "}, {"_scheduled": True}])
async def test_auto_omission_cannot_inherit_or_spoof_schedule(extra):
    _, tools = setup(allowlist=["gpt-5.6-luna"])
    result = await tools._handle_spawn_agent(_message(), {"label": "t", "goal": "g", **extra})
    assert "Error" in result
    tools._agent_manager.spawn.assert_not_called()


@pytest.mark.parametrize("axis", [None, "gpt-5.6-sol", "auto"])
@pytest.mark.parametrize("allowlist", [[], ["gpt-5.6-luna"]])
async def test_axis_matrix(axis, allowlist):
    cfg, tools = setup(axis, allowlist)
    inp = {"label": "t", "goal": "g"}
    if axis == "auto":
        inp["model"] = "gpt-5.6-luna"
    result = await tools._handle_spawn_agent(_message(), inp)
    assert "spawned" in result
    schema = next(t for t in apply_agent_axis_policy(TOOLS_SECTION, cfg)
                  if t["name"] == "spawn_agent")["input_schema"]
    assert ("model" in schema["required"]) == (axis == "auto")
    assert ("model" in schema["properties"]) == (axis == "auto")
    if axis != "auto":
        assert configured_agent_model(cfg) == (axis or "gpt-5.6-terra")


async def test_auto_rejects_explicit_unlisted_model():
    _, tools = setup(allowlist=["gpt-5.6-luna"])
    result = await tools._handle_spawn_agent(
        _message(), {"label": "t", "goal": "g", "model": "gpt-5.6-sol"})
    assert "not an eligible" in result
    tools._agent_manager.spawn.assert_not_called()


async def test_trusted_schedule_resolves_eligible_model_and_consumes_authority():
    _, tools = setup(allowlist=["gpt-5.6-luna"])
    token = scheduled_dispatch.set(True)
    try:
        result = await tools._handle_spawn_agent(_message(), {"label": "t", "goal": "g"})
        assert "spawned" in result
        assert scheduled_dispatch.get() is False
    finally:
        scheduled_dispatch.reset(token)
    kwargs = tools._agent_manager.spawn.call_args.kwargs
    assert kwargs["model_override"] == "gpt-5.6-luna"
    assert kwargs["max_iterations"] == 180


async def test_forged_schedule_cannot_raise_iteration_cap():
    _, tools = setup()
    result = await tools._handle_spawn_agent(_message(), {
        "label": "t", "goal": "g", "model": "gpt-5.6-luna", "_scheduled": True,
    })
    assert "spawned" in result
    assert tools._agent_manager.spawn.call_args.kwargs["max_iterations"] == 120


def test_no_candidates_hides_spawn_without_startup_failure(caplog):
    cfg, _ = setup()
    cfg.openai_codex.enabled = False
    assert not any(t["name"] == "spawn_agent" for t in apply_agent_axis_policy(TOOLS_SECTION, cfg))
    assert "no available candidates" in caplog.text


def test_allowlisted_disabled_providers_are_not_candidates():
    from src.config.schema import OpenAICompatibleConfig
    from src.tools.agent_tool_policy import effective_agent_model_choices

    cfg, _ = setup(allowlist=["gpt-5.6-luna", "compat:deepseek-flash", "ollama:qwen3"])
    cfg.openai_codex.enabled = False
    cfg.openai_compatible = OpenAICompatibleConfig(enabled=False)
    cfg.ollama = SimpleNamespace(enabled=False)
    assert effective_agent_model_choices(cfg) == []


def test_empty_allowlist_keeps_default_auto_candidates():
    cfg, _ = setup()
    schema = apply_agent_axis_policy(TOOLS_SECTION, cfg)[0]["input_schema"]
    assert len(schema["properties"]["model"]["enum"]) == 6
    assert "model" in schema["required"]
    assert "Omit" not in schema["properties"]["model"]["description"]


async def test_real_scheduler_dispatch_sets_and_resets_trusted_context():
    from tests.test_scheduled_events import _channel, _handlers

    _, tools = setup(allowlist=["gpt-5.6-luna"])

    async def dispatch(name, inp, message, user_id):
        assert name == "spawn_agent"
        assert "_scheduled" not in inp
        return await tools._handle_spawn_agent(message, inp)

    handlers = _handlers(tool_loop=SimpleNamespace(dispatch_loop_tool_inner=dispatch))
    result = await handlers._execute_scheduled_tool(
        "spawn_agent", {"label": "t", "goal": "g"}, _channel(), "7")
    assert result.ok and "spawned" in result.output
    assert scheduled_dispatch.get() is False
    assert tools._agent_manager.spawn.call_args.kwargs["model_override"] == "gpt-5.6-luna"


def test_allowlist_drift_rejected_before_generation():
    from src.discord.native_tools.agents_tasks import _capture_agent_generation_plan

    cfg, _ = setup(allowlist=["gpt-5.6-terra"])
    with pytest.raises(ValueError, match="not an eligible"):
        _capture_agent_generation_plan(
            lambda: cfg, lambda _: pytest.fail("must reject before selecting client"),
            lambda: None, model_override="gpt-5.6-luna", effort_override=None)
