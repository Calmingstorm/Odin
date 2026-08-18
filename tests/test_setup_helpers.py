"""Targeted coverage for the five live setup helpers (WebUI first-run flow).

These back /api/setup/status and /api/setup/complete plus the config admin's
env writes — pinned here after the dead interactive-wizard layer was removed
around them (housekeeping PR).
"""
from __future__ import annotations

from src.setup_wizard import (
    PLACEHOLDER_TOKEN,
    build_config,
    build_env,
    is_setup_needed,
    validate_token_format,
    write_env_file,
)


class TestValidateTokenFormat:
    def test_realistic_token_shape_passes(self):
        # Assembled at runtime: a single literal shaped like a real Discord
        # token trips GitHub push protection (it did — GH013).
        token = ".".join(["M" + "A" * 25, "G" * 6, "x" * 38])
        assert validate_token_format(token)

    def test_placeholder_rejected(self):
        assert not validate_token_format(PLACEHOLDER_TOKEN)

    def test_empty_and_garbage_rejected(self):
        assert not validate_token_format("")
        assert not validate_token_format("not-a-token")


class TestBuildConfig:
    def test_returns_fresh_dict_with_defaults(self):
        cfg = build_config()
        assert isinstance(cfg, dict)
        assert "discord" in cfg
        # deep copy: mutating the result must not poison the module default
        cfg["discord"]["token"] = "mutated"
        assert build_config()["discord"]["token"] != "mutated"

    def test_generated_codex_defaults_match_reference_deployment(self):
        """The scaffold is the one supported first-boot writer: an explicit
        legacy value here silently overrides the schema defaults, so the
        GENERATED and the PARSED codex default tuple are pinned together."""
        from src.config.schema import OpenAICodexConfig

        generated = build_config()["openai_codex"]
        assert generated["model"] == "gpt-5.6-sol"
        parsed = OpenAICodexConfig(**generated)
        assert (
            parsed.model,
            parsed.reasoning_effort,
            parsed.agent_model,
            parsed.agent_reasoning_effort,
            parsed.auxiliary.enabled,
            parsed.auxiliary.model,
        ) == ("gpt-5.6-sol", "xhigh", "auto", "auto", True, "gpt-5.6-terra")


class TestBuildEnv:
    def test_contains_discord_token_line(self):
        env = build_env("tok-123")
        assert "DISCORD_TOKEN=tok-123" in env

    def test_extra_entries_appended(self):
        env = build_env("tok-123", extra={"FOO": "bar"})
        assert "FOO=bar" in env


class TestIsSetupNeeded:
    def test_missing_config_means_needed(self, tmp_path):
        assert is_setup_needed(config_path=tmp_path / "nope.yml",
                               env_path=tmp_path / "nope.env")


class TestWriteEnvFile:
    def test_writes_content(self, tmp_path):
        p = tmp_path / ".env"
        write_env_file(p, "DISCORD_TOKEN=abc\n")
        assert p.read_text() == "DISCORD_TOKEN=abc\n"
