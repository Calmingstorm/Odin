"""File-entry imports must succeed without launching their guarded main blocks."""

import subprocess
import sys
from pathlib import Path

import pytest


@pytest.mark.parametrize("entry", ["worker.py", "supervisor.py"])
def test_runtime_file_import_without_controller_or_graphics(entry):
    path = Path(__file__).resolve().parents[1] / "src/computer/runtime" / entry
    script = """
import runpy
import sys
runpy.run_path(sys.argv[1], run_name='import_only')
assert 'runtime.backend' not in sys.modules
assert 'gi' not in sys.modules
"""
    result = subprocess.run([sys.executable, "-I", "-c", script, str(path)],
                            capture_output=True, text=True, timeout=5)
    assert result.returncode == 0, result.stderr
