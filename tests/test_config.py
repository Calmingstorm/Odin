"""Tests for src.config."""

import pytest

from src.config import OdinConfig
from src.config.schema import LoggingConfig, SearchConfig


class TestOdinConfig:
    def test_defaults(self):
        config = OdinConfig()
        assert config.token == ""
        assert config.log_level == "INFO"

    def test_from_env(self, monkeypatch):
        monkeypatch.setenv("DISCORD_TOKEN", "fake-token")
        monkeypatch.setenv("ODIN_LOG_LEVEL", "DEBUG")
        config = OdinConfig.from_env()
        assert config.token == "fake-token"
        assert config.log_level == "DEBUG"

    def test_validate_missing_token(self):
        config = OdinConfig()
        errors = config.validate()
        assert "DISCORD_TOKEN is required" in errors[0]

    def test_validate_ok(self):
        config = OdinConfig(token="x")
        errors = config.validate()
        assert len(errors) == 0

    def test_frozen(self):
        config = OdinConfig()
        try:
            config.token = "?"  # type: ignore[misc]
            assert False, "Should be frozen"
        except AttributeError:
            pass


class TestLoggingConfig:
    def test_valid_levels(self):
        for level in ("DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"):
            cfg = LoggingConfig(level=level)
            assert cfg.level == level

    def test_case_insensitive(self):
        cfg = LoggingConfig(level="debug")
        assert cfg.level == "DEBUG"

    def test_invalid_level_rejected(self):
        with pytest.raises(ValueError, match="Invalid log level"):
            LoggingConfig(level="TRACE")


class TestSearchConfig:
    def test_default_path(self):
        cfg = SearchConfig()
        assert cfg.search_db_path == "./data/search"

    def test_backward_compat_alias(self):
        cfg = SearchConfig(chromadb_path="./data/old_chromadb")
        assert cfg.search_db_path == "./data/old_chromadb"
