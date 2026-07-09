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
    def test_default_is_medium(self):
        from src.config.schema import OpenAICodexConfig
        assert OpenAICodexConfig().reasoning_effort == "medium"

    def test_all_enum_values_accepted(self):
        from src.config.schema import CODEX_REASONING_EFFORTS, OpenAICodexConfig
        # "minimal" is deliberately excluded — every Codex model on this auth
        # path rejects it per-request despite it appearing in the API's
        # generic parameter enum.
        assert CODEX_REASONING_EFFORTS == {"none", "low", "medium", "high", "xhigh"}
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
