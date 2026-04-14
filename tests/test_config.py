"""Tests for src.config."""

from src.config import OdinConfig


class TestOdinConfig:
    def test_defaults(self):
        config = OdinConfig()
        assert config.prefix == "!"
        assert config.web_port == 8080
        assert config.token == ""

    def test_from_env(self, monkeypatch):
        monkeypatch.setenv("ODIN_TOKEN", "fake-token")
        monkeypatch.setenv("ODIN_PREFIX", "?")
        monkeypatch.setenv("ODIN_WEB_PORT", "9090")
        config = OdinConfig.from_env()
        assert config.token == "fake-token"
        assert config.prefix == "?"
        assert config.web_port == 9090

    def test_validate_missing_token(self):
        config = OdinConfig()
        errors = config.validate()
        assert "ODIN_TOKEN is required" in errors

    def test_validate_default_secret(self):
        config = OdinConfig(token="x")
        errors = config.validate()
        assert any("ODIN_WEB_SECRET" in e for e in errors)

    def test_validate_ok(self):
        config = OdinConfig(token="x", web_secret="good-secret")
        errors = config.validate()
        assert len(errors) == 0

    def test_frozen(self):
        config = OdinConfig()
        try:
            config.prefix = "?"  # type: ignore[misc]
            assert False, "Should be frozen"
        except AttributeError:
            pass
