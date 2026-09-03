"""Runtime-derived paths shared by prompt and filesystem safety wiring."""

from __future__ import annotations

from pathlib import Path


def runtime_install_root() -> Path:
    """Return the lexical absolute root containing the running ``src`` package."""
    return Path(__file__).absolute().parent.parent
