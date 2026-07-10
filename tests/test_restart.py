"""Unit tests for src/restart.py — the in-place restart primitive.

SAFETY: ``os.execve`` is stubbed in every test — a real exec would replace
the test runner's process image. Nothing here executes, signals, or spawns.
"""
from __future__ import annotations

import sys
from unittest.mock import patch

import pytest

from src import restart


class TestRestartFlag:
    def test_default_state(self):
        assert restart.restart_requested() is False
        assert restart.pending_env_overrides() == {}

    def test_request_sets_flag(self):
        restart.request_restart()
        assert restart.restart_requested() is True
        assert restart.pending_env_overrides() == {}

    def test_env_overrides_accumulate_across_requests(self):
        restart.request_restart(env_overrides={"A": "1"})
        restart.request_restart(env_overrides={"B": "2"})
        assert restart.restart_requested() is True
        assert restart.pending_env_overrides() == {"A": "1", "B": "2"}

    def test_reset_clears_everything(self):
        restart.request_restart(env_overrides={"A": "1"})
        restart.reset()
        assert restart.restart_requested() is False
        assert restart.pending_env_overrides() == {}

    def test_pending_env_overrides_returns_a_copy(self):
        restart.request_restart(env_overrides={"A": "1"})
        restart.pending_env_overrides()["A"] = "mutated"
        assert restart.pending_env_overrides() == {"A": "1"}


class TestReexec:
    def test_reconstructs_module_entry_point_with_arg_passthrough(self, monkeypatch):
        # systemd runs `python -m src`; the console script differs only in
        # argv[0] — both must restart identically, positional config path
        # passing through.
        monkeypatch.setattr(sys, "argv", ["/opt/odin/src/__main__.py", "config.yml"])
        with patch("os.execve") as execve:
            restart.reexec()
        execve.assert_called_once()
        path, argv, _env = execve.call_args.args
        assert path == sys.executable
        assert argv == [sys.executable, "-m", "src", "config.yml"]

    def test_env_overrides_win_over_inherited_environment(self, monkeypatch):
        # The wizard's fresh DISCORD_TOKEN must beat the stale inherited one:
        # load_dotenv(override=False) in the new image keeps whatever exec
        # hands it.
        monkeypatch.setenv("DISCORD_TOKEN", "stale")
        monkeypatch.setenv("UNRELATED", "kept")
        restart.request_restart(env_overrides={"DISCORD_TOKEN": "fresh"})
        with patch("os.execve") as execve:
            restart.reexec()
        env = execve.call_args.args[2]
        assert env["DISCORD_TOKEN"] == "fresh"
        assert env["UNRELATED"] == "kept"

    def test_flushes_std_streams_before_exec(self):
        # exec never returns — anything buffered at that point is lost.
        order: list[str] = []
        with patch.object(sys.stdout, "flush", side_effect=lambda: order.append("out")), \
             patch.object(sys.stderr, "flush", side_effect=lambda: order.append("err")), \
             patch("os.execve", side_effect=lambda *a: order.append("exec")):
            restart.reexec()
        assert order == ["out", "err", "exec"]

    def test_exec_failure_propagates_oserror(self):
        with patch("os.execve", side_effect=OSError("bad interpreter")):
            with pytest.raises(OSError):
                restart.reexec()
