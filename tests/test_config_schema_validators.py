"""Coverage for src/config/schema.py validators + loader (RFC-006 P15, safe).

Pure Pydantic field validators (the ``raise`` arms fire on out-of-range values),
the ``${VAR}`` env-substitution helper, ``load_config``'s success + every
SystemExit error arm (driven against tmp files), and ``WebConfig`` identity
resolution. SAFE: pure validation + tmp-file reads only; no network, no LLM.
"""
from __future__ import annotations

import pytest
from pydantic import ValidationError

from src.config.schema import (
    AgentsConfig,
    ApiTokenIdentity,
    BrowserConfig,
    BulkheadConfig,
    ConnectionPoolConfig,
    KimiConfig,
    RetryConfig,
    ToolsConfig,
    WebConfig,
    _substitute_env_vars,
    load_config,
)


class TestFieldValidators:
    """Each out-of-range value trips its validator's raise arm."""

    @pytest.mark.parametrize("factory", [
        lambda: RetryConfig(max_retries=-1),
        lambda: RetryConfig(base_delay=-1.0),
        lambda: BulkheadConfig(ssh_max_concurrent=0),
        lambda: BulkheadConfig(ssh_max_queued=-1),
        lambda: AgentsConfig(max_iterations=0),
        lambda: AgentsConfig(final_warning_iterations=[0]),
        lambda: ConnectionPoolConfig(max_connections=0),
        lambda: ConnectionPoolConfig(keepalive_timeout=-1.0),
        lambda: ToolsConfig(command_timeout_seconds=0),
        lambda: ToolsConfig(max_tool_iterations_chat=0),
        lambda: KimiConfig(max_tokens=0),
        lambda: BrowserConfig(default_timeout_ms=500),
        lambda: WebConfig(port=0),
        lambda: WebConfig(port=99999),
    ])
    def test_invalid_value_rejected(self, factory):
        with pytest.raises(ValidationError):
            factory()

    def test_valid_values_accepted(self):
        # the return arms (happy path) — construction succeeds
        assert RetryConfig(max_retries=3, base_delay=0.5).max_retries == 3
        assert ToolsConfig(command_timeout_seconds=30).command_timeout_seconds == 30
        assert WebConfig(port=3002).port == 3002


class TestResolveApiIdentity:
    def test_matches_listed_token(self):
        ident = ApiTokenIdentity(token="tok-listed", user_id="u1", username="U1",
                                 tier="user", label="l1")
        web = WebConfig(api_tokens=[ident])
        assert web.resolve_api_identity("tok-listed") is ident
        assert web.resolve_api_identity("wrong") is None

    def test_falls_back_to_single_api_token(self):
        web = WebConfig(api_token="tok-default")
        got = web.resolve_api_identity("tok-default")
        assert got is not None and got.user_id == "api-admin" and got.tier == "admin"
        assert web.resolve_api_identity("nope") is None


class TestSubstituteEnvVars:
    def test_required_present(self, monkeypatch):
        monkeypatch.setenv("ODIN_TEST_VAR", "resolved")
        assert _substitute_env_vars("x=${ODIN_TEST_VAR}") == "x=resolved"

    def test_optional_default_when_unset(self, monkeypatch):
        monkeypatch.delenv("ODIN_MISSING_VAR", raising=False)
        assert _substitute_env_vars("x=${ODIN_MISSING_VAR:-fallback}") == "x=fallback"

    def test_required_missing_raises(self, monkeypatch):
        monkeypatch.delenv("ODIN_MISSING_VAR", raising=False)
        with pytest.raises(ValueError, match="not set"):
            _substitute_env_vars("x=${ODIN_MISSING_VAR}")


class TestLoadConfig:
    def _write(self, tmp_path, text):
        p = tmp_path / "config.yml"
        p.write_text(text)
        return p

    def test_valid_config(self, tmp_path):
        p = self._write(tmp_path, "discord:\n  token: abc\n")
        cfg = load_config(p)
        assert cfg.discord.token == "abc"

    @pytest.mark.parametrize("legacy_guard_enabled", [False, True])
    @pytest.mark.parametrize("legacy_grafana_enabled", [False, True])
    def test_removed_settings_are_ignored_without_losing_neighbors(
        self, tmp_path, legacy_guard_enabled, legacy_grafana_enabled
    ):
        """Old config files keep booting and both old boolean values are inert.

        ``false`` was ignored by both runtime construction paths before removal,
        so dropping it now is behaviour-preserving. Pin adjacent supported values
        so a future ``extra=forbid`` change cannot strand an upgrade or discard
        the settings that actually construct the guard and Grafana handler.
        """
        old_guard_bool = str(legacy_guard_enabled).lower()
        old_grafana_bool = str(legacy_grafana_enabled).lower()
        p = self._write(
            tmp_path,
            "discord:\n  token: legacy\n"
            "context:\n  directory: ./legacy-context\n  max_system_prompt_tokens: 12345\n"
            "openai_codex:\n  enabled: true\n  model: gpt-5.6-terra\n"
            "  max_tokens: 98765\n  reasoning_effort: high\n"
            f"graceful_degradation:\n  enabled: {old_guard_bool}\n"
            "  degraded_threshold: 7\n  unavailable_threshold: 19\n"
            f"grafana_alerts:\n  enabled: {old_grafana_bool}\n  auto_remediate: true\n"
            "  cooldown_seconds: 612\n  max_concurrent_remediations: 4\n",
        )

        cfg = load_config(p)

        assert cfg.discord.token == "legacy"
        assert cfg.context.directory == "./legacy-context"
        assert not hasattr(cfg.context, "max_system_prompt_tokens")
        assert cfg.openai_codex.model == "gpt-5.6-terra"
        assert cfg.openai_codex.reasoning_effort == "high"
        assert not hasattr(cfg.openai_codex, "max_tokens")
        assert not hasattr(cfg.graceful_degradation, "enabled")
        assert cfg.graceful_degradation.degraded_threshold == 7
        assert cfg.graceful_degradation.unavailable_threshold == 19
        assert not hasattr(cfg.grafana_alerts, "enabled")
        assert cfg.grafana_alerts.auto_remediate is True
        assert cfg.grafana_alerts.cooldown_seconds == 612
        assert cfg.grafana_alerts.max_concurrent_remediations == 4

    def test_env_substituted(self, tmp_path, monkeypatch):
        monkeypatch.setenv("ODIN_TOKEN_TEST", "from-env")
        p = self._write(tmp_path, "discord:\n  token: ${ODIN_TOKEN_TEST}\n")
        assert load_config(p).discord.token == "from-env"

    def test_missing_env_var_is_systemexit(self, tmp_path, monkeypatch):
        monkeypatch.delenv("ODIN_ABSENT", raising=False)
        p = self._write(tmp_path, "discord:\n  token: ${ODIN_ABSENT}\n")
        with pytest.raises(SystemExit, match="Configuration error"):
            load_config(p)

    def test_bad_yaml_is_systemexit(self, tmp_path):
        p = self._write(tmp_path, "discord: [unterminated\n")
        with pytest.raises(SystemExit, match="Failed to parse"):
            load_config(p)

    def test_non_mapping_is_systemexit(self, tmp_path):
        p = self._write(tmp_path, "- just\n- a\n- list\n")
        with pytest.raises(SystemExit, match="empty or invalid"):
            load_config(p)

    def test_validation_failure_is_systemexit(self, tmp_path):
        # tools.command_timeout_seconds=0 trips ToolsConfig's validator
        p = self._write(tmp_path,
                        "discord:\n  token: abc\ntools:\n  command_timeout_seconds: 0\n")
        with pytest.raises(SystemExit, match="validation failed"):
            load_config(p)


class TestCodexReasoningEffort:
    def test_default_is_xhigh(self):
        # Defaults mirror the reference deployment (defaults ruling).
        from src.config.schema import OpenAICodexConfig
        assert OpenAICodexConfig().reasoning_effort == "xhigh"

    def test_all_enum_values_accepted(self):
        from src.config.schema import CODEX_REASONING_EFFORTS, OpenAICodexConfig
        # "minimal" is deliberately excluded — every Codex model on this auth
        # path rejects it per-request despite it appearing in the API's
        # generic parameter enum. "max" is real but gpt-5.6-family-only (the
        # pair boundaries in test_max_reasoning_effort own that dimension).
        assert CODEX_REASONING_EFFORTS == {"none", "low", "medium", "high", "xhigh", "max"}
        for value in CODEX_REASONING_EFFORTS:
            assert OpenAICodexConfig(reasoning_effort=value).reasoning_effort == value

    def test_legacy_minimal_coerces_to_low(self):
        """A config persisted while v3.58.0 offered "minimal" must not brick
        startup after upgrading — it degrades to "low" with a warning."""
        from src.config.schema import OpenAICodexConfig
        assert OpenAICodexConfig(reasoning_effort="minimal").reasoning_effort == "low"

    def test_invalid_value_rejected_at_load(self):
        import pydantic
        import pytest as _pytest

        from src.config.schema import OpenAICodexConfig
        with _pytest.raises(pydantic.ValidationError):
            OpenAICodexConfig(reasoning_effort="banana")


class TestCodexTransportTimeouts:
    def test_defaults(self):
        from src.config.schema import OpenAICodexConfig
        cfg = OpenAICodexConfig()
        assert cfg.request_timeout_seconds == 3600
        assert cfg.stream_stall_timeout_seconds == 180

    def test_request_timeout_bounds(self):
        from src.config.schema import OpenAICodexConfig
        with pytest.raises(ValidationError):
            OpenAICodexConfig(request_timeout_seconds=59)
        with pytest.raises(ValidationError):
            OpenAICodexConfig(request_timeout_seconds=86401)
        assert OpenAICodexConfig(request_timeout_seconds=60).request_timeout_seconds == 60
        assert (
            OpenAICodexConfig(request_timeout_seconds=86400).request_timeout_seconds == 86400
        )

    def test_stream_stall_timeout_bounds(self):
        from src.config.schema import OpenAICodexConfig
        with pytest.raises(ValidationError):
            OpenAICodexConfig(stream_stall_timeout_seconds=9)
        with pytest.raises(ValidationError):
            OpenAICodexConfig(stream_stall_timeout_seconds=3601)
        assert (
            OpenAICodexConfig(stream_stall_timeout_seconds=10).stream_stall_timeout_seconds
            == 10
        )


class TestAgentsTimeoutConfig:
    def test_defaults(self):
        from src.config.schema import AgentsConfig
        cfg = AgentsConfig()
        assert cfg.iteration_timeout_seconds == 900
        assert cfg.max_lifetime_seconds == 14400

    def test_iteration_timeout_bounds(self):
        from src.config.schema import AgentsConfig
        with pytest.raises(ValidationError):
            AgentsConfig(iteration_timeout_seconds=59)
        with pytest.raises(ValidationError):
            AgentsConfig(iteration_timeout_seconds=86401)
        assert AgentsConfig(iteration_timeout_seconds=60).iteration_timeout_seconds == 60
        assert AgentsConfig(iteration_timeout_seconds=86400).iteration_timeout_seconds == 86400

    def test_max_lifetime_bounds(self):
        from src.config.schema import AgentsConfig
        with pytest.raises(ValidationError):
            AgentsConfig(max_lifetime_seconds=59)
        with pytest.raises(ValidationError):
            AgentsConfig(max_lifetime_seconds=86401)
        assert AgentsConfig(max_lifetime_seconds=3600).max_lifetime_seconds == 3600


class TestAgentReasoningEffortConfig:
    def test_default_is_auto(self):
        # Defaults mirror the reference deployment: per-spawn Auto/Dynamic.
        from src.config.schema import OpenAICodexConfig
        assert OpenAICodexConfig().agent_reasoning_effort == "auto"
        assert OpenAICodexConfig(agent_reasoning_effort=None).agent_reasoning_effort is None

    def test_valid_values_accepted(self):
        from src.config.schema import CODEX_REASONING_EFFORTS, OpenAICodexConfig
        for effort in sorted(CODEX_REASONING_EFFORTS):
            assert OpenAICodexConfig(
                agent_reasoning_effort=effort).agent_reasoning_effort == effort

    def test_invalid_rejected(self):
        from src.config.schema import OpenAICodexConfig
        with pytest.raises(ValidationError):
            OpenAICodexConfig(agent_reasoning_effort="banana")

    def test_legacy_minimal_coerced_to_low(self):
        """A persisted 'minimal' must not brick startup — same degradation
        the main reasoning_effort field gets."""
        from src.config.schema import OpenAICodexConfig
        cfg = OpenAICodexConfig(agent_reasoning_effort="minimal")
        assert cfg.agent_reasoning_effort == "low"
        # and the main field's coercion still works
        assert OpenAICodexConfig(reasoning_effort="minimal").reasoning_effort == "low"


class TestAgentModelConfig:
    def test_default_is_auto(self):
        # Defaults mirror the reference deployment: per-spawn Auto/Dynamic.
        from src.config.schema import OpenAICodexConfig
        assert OpenAICodexConfig().agent_model == "auto"
        assert OpenAICodexConfig(agent_model=None).agent_model is None

    def test_value_round_trips(self):
        from src.config.schema import OpenAICodexConfig
        assert OpenAICodexConfig(agent_model="gpt-5.6-luna").agent_model == "gpt-5.6-luna"

    def test_empty_and_whitespace_mean_inherit(self):
        """""/whitespace normalize to None — a hand-edited config must not
        carry a visually-empty but truthy override."""
        from src.config.schema import OpenAICodexConfig
        assert OpenAICodexConfig(agent_model="").agent_model is None
        assert OpenAICodexConfig(agent_model="   ").agent_model is None

    def test_surrounding_whitespace_stripped(self):
        from src.config.schema import OpenAICodexConfig
        assert OpenAICodexConfig(agent_model=" gpt-5.5 ").agent_model == "gpt-5.5"


def test_max_children_per_agent_upper_bound():
    """1-10: breadth compounds with depth, so a single config value must not
    ask for absurd fan-out; the manager's tree cap is the backstop."""
    import pytest

    from src.config.schema import Config

    with pytest.raises(ValueError, match="between 1 and 10"):
        Config(discord={"token": "x"}, agents={"max_children_per_agent": 11})
    cfg = Config(discord={"token": "x"}, agents={"max_children_per_agent": 10})
    assert cfg.agents.max_children_per_agent == 10


def test_max_concurrent_agents_default_and_bounds():
    """1-25 permits useful parallelism without exceeding the immutable
    per-tree lifetime backstop; an absent key preserves the historical cap 5.
    """
    from src.config.schema import Config

    assert AgentsConfig().max_concurrent_agents == 5
    assert Config(discord={"token": "x"}, agents={}).agents.max_concurrent_agents == 5
    assert AgentsConfig(max_concurrent_agents=1).max_concurrent_agents == 1
    assert AgentsConfig(max_concurrent_agents=25).max_concurrent_agents == 25
    with pytest.raises(ValidationError):
        AgentsConfig(max_concurrent_agents=0)
    with pytest.raises(ValidationError):
        AgentsConfig(max_concurrent_agents=26)
