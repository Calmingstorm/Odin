"""Version management for Odin.

Prefers pyproject.toml from the source tree (the service imports src/
from the checkout, so that file describes the code actually running),
falling back to installed package metadata for site-packages installs.
Installed metadata can go stale after a self-update — a stale
odin_bot.egg-info / dist-info kept reporting the previous version, so
the updater re-offered the release it had already applied.
"""
from __future__ import annotations

import re
from pathlib import Path

_FALLBACK_VERSION = "0.0.0-dev"


def _version_from_pyproject() -> str | None:
    """Version from the pyproject.toml next to the running source tree."""
    try:
        toml_path = Path(__file__).resolve().parent.parent / "pyproject.toml"
        if toml_path.is_file():
            text = toml_path.read_text(encoding="utf-8")
            match = re.search(r'^version\s*=\s*"([^"]+)"', text, re.MULTILINE)
            if match:
                return match.group(1)
    except Exception:
        pass
    return None


def _version_from_metadata() -> str | None:
    """Version from installed package metadata (pip / .deb installs)."""
    try:
        from importlib.metadata import version

        return version("odin-bot")
    except Exception:
        return None


def get_version() -> str:
    """Return the Odin version string.

    Resolution order:
    1. pyproject.toml in the project root — the code actually running
    2. importlib.metadata — installed without a source checkout
    3. Fallback to "0.0.0-dev"
    """
    return _version_from_pyproject() or _version_from_metadata() or _FALLBACK_VERSION
