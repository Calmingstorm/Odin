"""Smoke tests: verify package imports work and stdlib logging is not shadowed."""
from __future__ import annotations

import importlib
import logging
import sys


class TestNoLoggingShadow:
    """src/logging used to shadow stdlib logging — ensure it stays fixed."""

    def test_stdlib_logging_not_shadowed(self):
        """Importing logging must resolve to the stdlib, not a local package."""
        assert "cpython" in logging.__file__ or "lib/python" in logging.__file__, (
            f"logging resolved to {logging.__file__}, expected stdlib"
        )

    def test_logging_handlers_importable(self):
        """stdlib logging.handlers must be importable (fails when shadowed)."""
        from logging.handlers import RotatingFileHandler  # noqa: F401

    def test_odin_log_importable(self):
        """The renamed odin_log package must import cleanly."""
        from src.odin_log import setup_logging, get_logger  # noqa: F401

    def test_no_src_logging_package(self):
        """src/logging/ directory must not exist — it shadows stdlib."""
        from pathlib import Path

        src_logging = Path(__file__).resolve().parent.parent / "src" / "logging"
        assert not src_logging.exists(), (
            f"src/logging/ still exists at {src_logging} and will shadow stdlib logging"
        )


class TestTopLevelImport:
    """Ensure the main package entry points import without error."""

    def test_import_src(self):
        mod = importlib.import_module("src")
        assert hasattr(mod, "__version__")

    def test_import_src_odin(self):
        importlib.import_module("src.odin")
