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


class TestNoBarOdinImports:
    """All imports within src/odin/ must use 'src.odin', not bare 'odin'.

    Bare ``from odin.X import ...`` breaks when the package is imported via
    the ``src`` layout because ``odin`` is not a top-level package — it lives
    under ``src.odin``.  This regression test scans every ``.py`` file under
    ``src/odin/`` (and ``src/tools/plan_runner.py``) to ensure no bare
    ``odin.*`` imports sneak back in.
    """

    def _python_files(self):
        from pathlib import Path
        root = Path(__file__).resolve().parent.parent
        yield from (root / "src" / "odin").rglob("*.py")
        plan_runner = root / "src" / "tools" / "plan_runner.py"
        if plan_runner.exists():
            yield plan_runner

    def test_no_bare_odin_import_in_source(self):
        """No file in src/odin/ should use 'from odin.' or 'import odin.'."""
        import re
        bare_import = re.compile(
            r"^\s*(?:from|import)\s+odin\b", re.MULTILINE
        )
        violations = []
        for path in self._python_files():
            text = path.read_text()
            for i, line in enumerate(text.splitlines(), 1):
                if bare_import.match(line):
                    violations.append(f"{path.name}:{i}: {line.strip()}")
        assert not violations, (
            "Bare 'odin.*' imports found (should be 'src.odin.*'):\n"
            + "\n".join(violations)
        )

    def test_src_odin_public_api_importable(self):
        """All public names re-exported by src.odin.__init__ must resolve."""
        mod = importlib.import_module("src.odin")
        for name in mod.__all__:
            assert hasattr(mod, name), f"src.odin.__all__ lists '{name}' but it is not importable"

    def test_src_odin_submodules_importable(self):
        """Key submodules must be importable via the src.odin path."""
        submodules = [
            "src.odin.types",
            "src.odin.planner",
            "src.odin.executor",
            "src.odin.registry",
            "src.odin.context",
            "src.odin.plan_loader",
            "src.odin.reporter",
            "src.odin.cli",
            "src.odin.tools.base",
            "src.odin.tools.shell",
            "src.odin.tools.file_ops",
            "src.odin.tools.http",
            "src.odin.tools.process",
        ]
        for name in submodules:
            mod = importlib.import_module(name)
            assert mod is not None, f"Failed to import {name}"
