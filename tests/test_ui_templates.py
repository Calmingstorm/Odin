"""Pytest shim for the strict WebUI template validation.

The real check is scripts/check-vue-templates.mjs (Node + @vue/compiler-dom),
run as a required step in the WebUI CI workflow. Locally it runs only when
the JS toolchain is present, so Python-only environments aren't forced to
install Node — set ODIN_REQUIRE_UI_CHECK=1 to make a missing toolchain fail
instead of skip.
"""
from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent
REQUIRE = os.environ.get("ODIN_REQUIRE_UI_CHECK") == "1"


def _toolchain_ready() -> bool:
    return (
        shutil.which("node") is not None
        and (REPO_ROOT / "node_modules" / "@vue" / "compiler-dom").is_dir()
    )


@pytest.mark.skipif(
    not REQUIRE and not _toolchain_ready(),
    reason="JS toolchain not installed — run 'npm ci' (ODIN_REQUIRE_UI_CHECK=1 to require)",
)
def test_all_vue_templates_compile_strict():
    if REQUIRE and not _toolchain_ready():
        pytest.fail("ODIN_REQUIRE_UI_CHECK=1 but the JS toolchain is missing — run 'npm ci'")
    result = subprocess.run(
        ["node", str(REPO_ROOT / "scripts" / "check-vue-templates.mjs")],
        capture_output=True, text=True, timeout=120,
    )
    assert result.returncode == 0, (
        f"Template validation failed:\n{result.stdout}\n{result.stderr}"
    )
