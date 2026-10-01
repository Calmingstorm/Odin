"""Payload transport regressions; no remote connection or live install required."""
import base64
import json
import random
import shlex
import string
from pathlib import Path
from unittest.mock import AsyncMock

import pytest

from src.config.schema import ToolHost, ToolsConfig
from src.tools.apply_patch import parse_patch
from src.tools.executor import ToolExecutor
from src.tools.handlers import files_docs


def patch(text):
    return f"*** Begin Patch\n*** Add File: added.txt\n+{text}\n*** End Patch\n"


def executor(host="local"):
    return ToolExecutor(config=ToolsConfig(hosts={host: ToolHost(
        address="127.0.0.1" if host == "local" else "192.0.2.1", ssh_user="root"
    )}))


def master_command(root, text):
    # Frozen builder from origin/master at round-two entry. Intentionally do not
    # reuse the production builder: exact whitespace/quoting is the contract.
    runner = Path(files_docs.__file__).resolve().parents[1] / "apply_patch.py"
    wrapper = (
        runner.read_text(encoding="utf-8")
        + "\nimport json\nimport sys as _sys\n"
        + "try:\n"
        + "    _plan = json.loads(_sys.stdin.read())\n"
        + "    _changed = apply_plan(_sys.argv[1], _plan)\n"
        + "    _result = {'ok': True, 'changed': _changed}\n"
        + "except PatchRollbackError as _exc:\n"
        + "    _result = {'ok': False, 'error': str(_exc), 'rollback_failed': True, "
        + "'rollback_failures': _exc.failures, "
        + "'recovery_artifacts': _exc.recovery_artifacts}\n"
        + "except BaseException as _exc:\n"
        + "    _result = {'ok': False, 'error': f'{type(_exc).__name__}: {_exc}', "
        + "'rollback_failed': False}\n"
        + "print(json.dumps(_result, ensure_ascii=True, separators=(',', ':')))\n"
    )
    plan_json = json.dumps(parse_patch(text), ensure_ascii=True, separators=(",", ":"))
    runner_b64 = base64.b64encode(wrapper.encode("utf-8")).decode("ascii")
    plan_b64 = base64.b64encode(plan_json.encode("utf-8")).decode("ascii")
    return (
        "runner=$(mktemp) || exit 1; "
        'plan=$(mktemp) || { rm -f -- "$runner"; exit 1; }; '
        'trap \'rm -f -- "$runner" "$plan"\' EXIT; '
        'chmod 600 -- "$runner" "$plan" || exit 1; '
        f'printf %s {shlex.quote(runner_b64)} | base64 -d > "$runner" || exit 1; '
        f'printf %s {shlex.quote(plan_b64)} | base64 -d > "$plan" || exit 1; '
        f'python3 "$runner" {shlex.quote(root)} < "$plan"'
    )


@pytest.mark.asyncio
@pytest.mark.parametrize("host", ["local", "remote"])
async def test_small_command_identical_to_master(host):
    ex = executor(host)
    ex._run_on_host = AsyncMock(return_value=('{"ok":true,"changed":[]}', 0))
    text = patch("hello 'quoted' λ")
    root = "/tmp/root 'with spaces' λ"
    await files_docs.FilesDocsTools._handle_apply_patch(
        ex, dict(host=host, root=root, patch_text=text)
    )
    ex._run_on_host.assert_awaited_once_with(host, master_command(root, text))


@pytest.mark.asyncio
async def test_large_compressible_real_engine(tmp_path):
    ex = executor()
    text = patch("large λ payload " * 2800)
    assert len(master_command(str(tmp_path), text).encode()) > 131072
    result = await ex.execute(
        "apply_patch", dict(host="local", root=str(tmp_path), patch_text=text)
    )
    assert result.ok, result.output
    assert (tmp_path / "added.txt").read_text() == "large λ payload " * 2800 + "\n"
    assert sorted(p.name for p in tmp_path.iterdir()) == ["added.txt"]


@pytest.mark.asyncio
async def test_incompressible_refused_before_dispatch(tmp_path, monkeypatch):
    ex = executor()
    ex._run_on_host = AsyncMock()
    rng = random.Random(636)
    text = patch("".join(rng.choices(string.ascii_letters + string.digits, k=48000)))
    # The unchanged 48 KiB grammar cap makes ordinary compressed plans smaller
    # than today's transport ceiling. Exercise refusal with a reduced budget.
    monkeypatch.setattr(files_docs, "_APPLY_PATCH_COMMAND_MAX_BYTES", 32000)
    result, code = await files_docs.FilesDocsTools._handle_apply_patch(
        ex, dict(host="local", root=str(tmp_path), patch_text=text)
    )
    assert code == 1
    assert "compressed apply_patch command is" in result
    assert f"limit is {files_docs._APPLY_PATCH_COMMAND_MAX_BYTES} bytes" in result
    assert "Split the patch" in result
    ex._run_on_host.assert_not_awaited()
    assert list(tmp_path.iterdir()) == []


@pytest.mark.asyncio
@pytest.mark.parametrize("offset", [0, -1])
async def test_margin_boundary_and_remote_compressed_construction(monkeypatch, offset):
    ex = executor("remote")
    ex._run_on_host = AsyncMock(return_value=('{"ok":true,"changed":[]}', 0))
    text = patch("x" * 40000)
    root = "/tmp/λ 'root'"
    original = master_command(root, text)
    monkeypatch.setattr(
        files_docs, "_APPLY_PATCH_COMMAND_MAX_BYTES", len(original.encode()) + offset
    )
    await files_docs.FilesDocsTools._handle_apply_patch(
        ex, dict(host="remote", root=root, patch_text=text)
    )
    host, command = ex._run_on_host.call_args.args
    assert host == "remote"
    if offset == 0:
        assert command == original
    else:
        assert "zlib.decompress" in command
        assert len(command.encode()) < len(original.encode())
        assert command.endswith(f'python3 "$runner" {shlex.quote(root)} < "$plan"')


def test_safety_margin():
    assert files_docs._APPLY_PATCH_COMMAND_MAX_BYTES == 131072 - 8192


@pytest.mark.asyncio
async def test_compressed_budget_equality_and_one_byte_over(monkeypatch, tmp_path):
    ex = executor()
    ex._run_on_host = AsyncMock(return_value=('{"ok":true,"changed":[]}', 0))
    text = patch("x" * 48000)
    inp = dict(host="local", root=str(tmp_path), patch_text=text)
    await files_docs.FilesDocsTools._handle_apply_patch(ex, inp)
    command = ex._run_on_host.call_args.args[1]
    assert "zlib.decompress" in command
    size = len(command.encode())
    monkeypatch.setattr(files_docs, "_APPLY_PATCH_COMMAND_MAX_BYTES", size)
    ex._run_on_host.reset_mock()
    _, code = await files_docs.FilesDocsTools._handle_apply_patch(ex, inp)
    assert code == 0
    ex._run_on_host.assert_awaited_once_with("local", command)
    monkeypatch.setattr(files_docs, "_APPLY_PATCH_COMMAND_MAX_BYTES", size - 1)
    ex._run_on_host.reset_mock()
    result, code = await files_docs.FilesDocsTools._handle_apply_patch(ex, inp)
    assert code == 1
    assert f"is {size} bytes; limit is {size - 1} bytes" in result
    ex._run_on_host.assert_not_awaited()
    assert list(tmp_path.iterdir()) == []
