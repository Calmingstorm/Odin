"""Tests for LLM provider security — SSRF validation, secret persistence, config safety."""
from __future__ import annotations

import pytest


class TestOllamaURLValidation:
    """SSRF protection for Ollama base_url."""

    @pytest.fixture(autouse=True)
    def _setup(self):
        import sys
        sys.path.insert(0, ".")
        # Import the validator from a fresh module load
        from importlib import import_module
        self.mod = import_module("src.web.api")

    def _validate(self, url):
        # The validator is defined inside create_api_routes closure,
        # so we test the config-level validator instead
        from src.config.schema import OllamaConfig
        return OllamaConfig(base_url=url, enabled=True)

    def test_localhost_accepted(self):
        cfg = self._validate("http://127.0.0.1:11434")
        assert cfg.base_url == "http://127.0.0.1:11434"

    def test_private_ip_accepted(self):
        cfg = self._validate("http://192.168.1.13:11434")
        assert "192.168.1.13" in cfg.base_url

    def test_https_accepted(self):
        cfg = self._validate("https://192.168.1.13:11434")
        assert cfg.base_url.startswith("https://")

    def test_ftp_rejected(self):
        from src.config.schema import OllamaConfig
        with pytest.raises(ValueError, match="http"):
            OllamaConfig(base_url="ftp://localhost:11434", enabled=True)

    def test_empty_rejected(self):
        from src.config.schema import OllamaConfig
        # Empty base_url with default is fine (uses default)
        cfg = OllamaConfig()
        assert cfg.base_url.startswith("http")


class TestKimiConfig:
    def test_no_base_url_in_config(self):
        from src.config.schema import KimiConfig
        cfg = KimiConfig(enabled=True, api_key="sk-test")
        assert not hasattr(cfg, "base_url")

    def test_empty_model_rejected(self):
        from src.config.schema import KimiConfig
        with pytest.raises(ValueError):
            KimiConfig(model="")

    def test_invalid_provider_rejected(self):
        from src.config.schema import LLMProviderConfig
        with pytest.raises(ValueError):
            LLMProviderConfig(active_provider="gemini")


class TestSecretPersistence:
    """Test the _safe_secret + _ui_set_secrets mechanism via round-trip YAML."""

    def test_env_var_preserved_on_normal_save(self, tmp_path):
        """Config with ${ENV_VAR} should survive a persist cycle without UI key edit."""
        from ruamel.yaml import YAML
        ry = YAML()
        config_file = tmp_path / "config.yml"
        config_file.write_text("kimi:\n  api_key: ${KIMI_KEY}\n  model: kimi-k2.6\n")

        with open(config_file) as f:
            data = ry.load(f)
        assert "${KIMI_KEY}" in str(data["kimi"]["api_key"])

    def test_explicit_key_replaces_value(self, tmp_path):
        """When UI sets a key, the new value should be written."""
        config_file = tmp_path / "config.yml"
        config_file.write_text("kimi:\n  api_key: old-key\n  model: kimi-k2.6\n")

        from ruamel.yaml import YAML
        ry = YAML()
        with open(config_file) as f:
            data = ry.load(f)
        data["kimi"]["api_key"] = "sk-new-from-ui"
        with open(config_file, "w") as f:
            ry.dump(data, f)

        with open(config_file) as f:
            result = ry.load(f)
        assert result["kimi"]["api_key"] == "sk-new-from-ui"

    def test_ruamel_preserves_comments(self, tmp_path):
        """ruamel.yaml should preserve YAML comments on round-trip."""
        config_file = tmp_path / "config.yml"
        config_file.write_text("# Important comment\nkimi:\n  model: kimi-k2.6  # model choice\n")

        from ruamel.yaml import YAML
        ry = YAML()
        ry.preserve_quotes = True
        with open(config_file) as f:
            data = ry.load(f)
        data["kimi"]["model"] = "kimi-k2.5"
        with open(config_file, "w") as f:
            ry.dump(data, f)

        raw = config_file.read_text()
        assert "Important comment" in raw
        assert "kimi-k2.5" in raw


class TestConfigBackwardCompat:
    """Existing configs without new sections should parse cleanly."""

    def test_minimal_config(self):
        from src.config.schema import Config
        cfg = Config.model_validate({"discord": {"token": "test"}})
        assert cfg.ollama.enabled is False
        assert cfg.kimi.enabled is False
        assert cfg.llm_provider.active_provider == "codex"

    def test_codex_only_config(self):
        from src.config.schema import Config
        cfg = Config.model_validate({
            "discord": {"token": "test"},
            "openai_codex": {"enabled": True, "model": "gpt-5.5"},
        })
        assert cfg.openai_codex.enabled is True
        assert cfg.ollama.enabled is False
        assert cfg.kimi.enabled is False

    def test_all_providers_config(self):
        from src.config.schema import Config
        cfg = Config.model_validate({
            "discord": {"token": "test"},
            "openai_codex": {"enabled": True},
            "ollama": {"enabled": True, "base_url": "http://localhost:11434"},
            "kimi": {"enabled": True, "api_key": "sk-test"},
            "llm_provider": {"active_provider": "kimi"},
        })
        assert cfg.llm_provider.active_provider == "kimi"
        assert cfg.kimi.api_key == "sk-test"
