"""Tests for src/version.py."""
from __future__ import annotations

import src.version as version_mod
from src.version import _version_from_pyproject, get_version


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

    def test_pyproject_helper_parses_real_file(self):
        v = _version_from_pyproject()
        assert v is not None and any(ch.isdigit() for ch in v)


class TestResolutionOrder:
    """Self-update regression: stale installed metadata (odin_bot.egg-info /
    dist-info left at the previous version) must not mask the version of the
    code actually running from the source checkout — the updater re-offered
    the release it had already applied."""

    def test_pyproject_wins_over_stale_metadata(self, monkeypatch):
        monkeypatch.setattr(version_mod, "_version_from_metadata", lambda: "0.0.1-stale")
        assert get_version() == version_mod._version_from_pyproject()
        assert get_version() != "0.0.1-stale"

    def test_metadata_fallback_when_no_pyproject(self, monkeypatch):
        monkeypatch.setattr(version_mod, "_version_from_pyproject", lambda: None)
        monkeypatch.setattr(version_mod, "_version_from_metadata", lambda: "9.9.9")
        assert get_version() == "9.9.9"

    def test_dev_fallback_when_nothing_available(self, monkeypatch):
        monkeypatch.setattr(version_mod, "_version_from_pyproject", lambda: None)
        monkeypatch.setattr(version_mod, "_version_from_metadata", lambda: None)
        assert get_version() == "0.0.0-dev"
