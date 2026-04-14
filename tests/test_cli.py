"""Tests for the CLI entry point."""

from __future__ import annotations

import json
import textwrap
from pathlib import Path

import pytest

from src.odin.cli import build_parser, _dispatch


@pytest.fixture
def plan_file(tmp_path) -> Path:
    f = tmp_path / "plan.yml"
    f.write_text(
        textwrap.dedent("""\
        name: cli-test
        steps:
          - id: greet
            tool: shell
            params:
              command: echo hello
        """)
    )
    return f


@pytest.mark.asyncio
async def test_run_text_output(plan_file, capsys):
    parser = build_parser()
    args = parser.parse_args(["run", str(plan_file)])
    code = await _dispatch(args)
    assert code == 0
    out = capsys.readouterr().out
    assert "cli-test" in out
    assert "OK" in out


@pytest.mark.asyncio
async def test_run_json_output(plan_file, capsys):
    parser = build_parser()
    args = parser.parse_args(["run", str(plan_file), "--json"])
    code = await _dispatch(args)
    assert code == 0
    data = json.loads(capsys.readouterr().out)
    assert data["success"] is True


@pytest.mark.asyncio
async def test_validate_good_plan(plan_file, capsys):
    parser = build_parser()
    args = parser.parse_args(["validate", str(plan_file)])
    code = await _dispatch(args)
    assert code == 0
    assert "valid" in capsys.readouterr().out.lower()


@pytest.mark.asyncio
async def test_validate_bad_plan(tmp_path, capsys):
    f = tmp_path / "bad.yml"
    f.write_text(
        textwrap.dedent("""\
        name: bad
        steps:
          - id: a
            tool: shell
            depends_on: [ghost]
        """)
    )
    parser = build_parser()
    args = parser.parse_args(["validate", str(f)])
    code = await _dispatch(args)
    assert code == 2


@pytest.mark.asyncio
async def test_list_tools(capsys):
    parser = build_parser()
    args = parser.parse_args(["list-tools"])
    code = await _dispatch(args)
    assert code == 0
    out = capsys.readouterr().out
    assert "shell" in out
