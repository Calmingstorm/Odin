"""read_file transports run in the remote user's login shell; keep them portable.

macOS defaults to zsh, where ``status`` is a read-only parameter, so a transport
that assigned it failed on every Mac host ("read-only variable: status").
"""
from __future__ import annotations

import json
import shutil
import subprocess

import pytest

from src.config.schema import ToolHost, ToolsConfig
from src.tools.executor import ToolExecutor

_RAW_HEADER = "<<<ODIN_READ_FILE_RAW_V1 "
_RAW_SEPARATOR = ">>>\n<<<ODIN_READ_FILE_RAW_CONTENT_V1>>>\n"
_RAW_END = "<<<ODIN_READ_FILE_RAW_END_V1>>>"

_SHELLS = [
    pytest.param(name, marks=pytest.mark.skipif(
        shutil.which(name) is None, reason=f"{name} is not installed"))
    for name in ("sh", "bash", "zsh")
]


def _executor_in(shell: str) -> ToolExecutor:
    executor = ToolExecutor(
        config=ToolsConfig(hosts={"localhost": ToolHost(address="127.0.0.1")})
    )

    async def run_in_login_shell(host, command):
        proc = subprocess.run(
            [shell, "-c", command], capture_output=True, text=True, timeout=30,
        )
        return proc.stdout + proc.stderr, proc.returncode

    executor.files_docs_tools._run_on_host = run_in_login_shell
    return executor


def _split_raw(output: str) -> tuple[dict, bytes]:
    assert output.startswith(_RAW_HEADER), output
    header, framed = output[len(_RAW_HEADER):].split(_RAW_SEPARATOR, 1)
    metadata = json.loads(header)
    encoded = framed.encode("utf-8")
    content = encoded[:metadata["content_bytes"]]
    assert encoded[metadata["content_bytes"]:] == _RAW_END.encode("ascii")
    return metadata, content


@pytest.mark.parametrize("shell", _SHELLS)
async def test_raw_transport_runs_in_login_shell(shell, tmp_path):
    target = tmp_path / "raw.txt"
    source = "first ✓ line\nsecond line\nthird without newline".encode()
    target.write_bytes(source)

    result = await _executor_in(shell).execute(
        "read_file", {"host": "localhost", "path": str(target), "raw": True},
    )

    assert result.ok, result.output
    metadata, content = _split_raw(result.output)
    assert content == source
    assert metadata["content_bytes"] == len(source)
    assert metadata["truncated"] is False


@pytest.mark.parametrize("shell", _SHELLS)
async def test_raw_transport_failure_keeps_exit_status_in_login_shell(shell, tmp_path):
    target = tmp_path / "missing.txt"

    result = await _executor_in(shell).execute(
        "read_file", {"host": "localhost", "path": str(target), "raw": True},
    )

    assert not result.ok
    assert "read-only variable" not in result.output


@pytest.mark.parametrize("shell", _SHELLS)
async def test_numbered_transport_runs_in_login_shell(shell, tmp_path):
    target = tmp_path / "numbered.txt"
    target.write_text("alpha\nbeta\n", encoding="utf-8")

    result = await _executor_in(shell).execute(
        "read_file", {"host": "localhost", "path": str(target)},
    )

    assert result.ok, result.output
    assert result.output.startswith("1: alpha\n2: beta\n")
