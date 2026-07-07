"""Deterministic coverage for src/config/__init__ (RFC-006 P0 blocker fix).

``_load_env``'s dotenv branch executes only when a repo-root ``.env`` exists,
which differs between dev machines and CI — the exact nondeterminism that made
the committed coverage baseline lie by one line on PR #188. Both branches are
pinned here explicitly so the module's coverage is identical everywhere.
"""
from __future__ import annotations

from pathlib import Path

import pytest

import src.config as config_pkg
from src.config import OdinConfig


class TestLoadEnvBothBranches:
    def test_env_file_present_loads_dotenv(self, monkeypatch):
        calls = []
        monkeypatch.setattr(config_pkg, "load_dotenv", lambda p: calls.append(p))
        monkeypatch.setattr(Path, "exists", lambda self: True)
        config_pkg._load_env()
        assert len(calls) == 1
        assert str(calls[0]).endswith(".env")

    def test_env_file_absent_skips_dotenv(self, monkeypatch):
        calls = []
        monkeypatch.setattr(config_pkg, "load_dotenv", lambda p: calls.append(p))
        monkeypatch.setattr(Path, "exists", lambda self: False)
        config_pkg._load_env()
        assert calls == []


class TestFromEnv:
    def test_reads_discord_token_with_odin_fallback(self, monkeypatch):
        monkeypatch.setattr(config_pkg, "load_dotenv", lambda p: None)
        monkeypatch.delenv("DISCORD_TOKEN", raising=False)
        monkeypatch.setenv("ODIN_TOKEN", "fallback-tok")
        cfg = OdinConfig.from_env()
        assert cfg.token == "fallback-tok"

    def test_validate_flags_missing_token(self):
        errors = OdinConfig(token="").validate()
        assert any("DISCORD_TOKEN" in e for e in errors)
        assert OdinConfig(token="x").validate() == []


class TestLazyGetattr:
    def test_config_and_load_config_resolve(self):
        assert config_pkg.Config is not None
        assert callable(config_pkg.load_config)

    def test_unknown_attribute_raises(self):
        with pytest.raises(AttributeError, match="no attribute 'Nonsense'"):
            config_pkg.Nonsense
