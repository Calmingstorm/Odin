"""Execute shell-smoke assertions without installing anything on the test host."""

import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]


@pytest.mark.parametrize("command, expected", [("true", 1), ("odin-missing-smoke-command", 0)])
def test_unexpected_command_cannot_be_hidden_by_shell_errexit(command, expected):
    script = (ROOT / "packaging/smoke-computer-install.sh").read_text()
    start = script.index("assert_unavailable() {")
    end = script.index("\n}", start) + 2
    result = subprocess.run(
        [
            "bash",
            "-ec",
            script[start:end] + '\nassert_unavailable "$1"\necho reached',
            "smoke",
            command,
        ],
        capture_output=True,
        text=True,
        timeout=5,
        check=False,
    )
    assert result.returncode == expected
    assert ("reached" in result.stdout) is (expected == 0)
    assert ("Unexpected installed desktop command" in result.stderr) is (expected == 1)
