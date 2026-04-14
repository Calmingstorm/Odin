"""Tests for src/version.py."""
from __future__ import annotations

from src.version import get_version


class TestGetVersion:
    def test_get_version_returns_string(self):
        version = get_version()
        assert isinstance(version, str)
        assert len(version) > 0

    def test_get_version_not_dev(self):
        """Version should not be the dev fallback when pyproject.toml exists."""
        version = get_version()
        # pyproject.toml is present alongside src/version.py, so the fallback
        # "0.0.0-dev" should never be returned in this environment.
        assert version != "0.0.0-dev"

    def test_get_version_format(self):
        """Version string should look like a semver or similar version number."""
        version = get_version()
        # Minimal check: contains at least one digit
        assert any(ch.isdigit() for ch in version)
