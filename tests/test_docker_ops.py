"""Tests for docker_ops tool (Round 13).

Tests the docker_ops helper (command building, validation, safety) and the
ToolExecutor._handle_docker_ops handler (host resolution, execution dispatch).
"""

from __future__ import annotations

import shlex
from unittest.mock import AsyncMock, patch

import pytest

from src.tools.docker_ops import (
    ALLOWED_ACTIONS,
    build_docker_command,
    _compose_file_flags,
)
from src.config.schema import ToolsConfig, ToolHost
from src.tools.executor import ToolExecutor
from src.tools.registry import TOOL_MAP


# ---------------------------------------------------------------------------
# Tool registration
# ---------------------------------------------------------------------------

class TestDockerOpsRegistration:
    def test_tool_in_registry(self):
        assert "docker_ops" in TOOL_MAP

    def test_tool_has_required_fields(self):
        tool = TOOL_MAP["docker_ops"]
        assert "name" in tool
        assert "description" in tool
        assert "input_schema" in tool

    def test_tool_requires_host_and_action(self):
        schema = TOOL_MAP["docker_ops"]["input_schema"]
        assert "host" in schema["required"]
        assert "action" in schema["required"]

    def test_action_enum_matches_allowed(self):
        schema = TOOL_MAP["docker_ops"]["input_schema"]
        enum_actions = set(schema["properties"]["action"]["enum"])
        assert enum_actions == ALLOWED_ACTIONS


# ---------------------------------------------------------------------------
# ALLOWED_ACTIONS
# ---------------------------------------------------------------------------

class TestDockerOpsAllowedActions:
    def test_all_expected_actions_present(self):
        expected = {
            "ps", "run", "exec", "logs", "build", "pull", "stop", "rm",
            "inspect", "stats", "compose_up", "compose_down", "compose_ps",
            "compose_logs",
        }
        assert expected == ALLOWED_ACTIONS

    def test_unknown_action_raises(self):
        with pytest.raises(ValueError, match="Unknown docker action"):
            build_docker_command("restart", {})

    def test_allowed_actions_immutable(self):
        with pytest.raises((TypeError, AttributeError)):
            ALLOWED_ACTIONS.add("restart")


# ---------------------------------------------------------------------------
# Compose file flags
# ---------------------------------------------------------------------------

class TestComposeFileFlags:
    def test_no_file(self):
        assert _compose_file_flags({}) == []

    def test_with_file(self):
        flags = _compose_file_flags({"file": "docker-compose.prod.yml"})
        assert "-f" in flags

    def test_file_quoted(self):
        flags = _compose_file_flags({"file": "path with spaces/compose.yml"})
        joined = " ".join(flags)
        tokens = shlex.split(joined)
        assert tokens[1] == "path with spaces/compose.yml"


# ---------------------------------------------------------------------------
# ps
# ---------------------------------------------------------------------------

class TestBuildPs:
    def test_basic(self):
        cmd = build_docker_command("ps", {})
        assert cmd == "docker ps"

    def test_all(self):
        cmd = build_docker_command("ps", {"all": True})
        assert "-a" in cmd

    def test_filter(self):
        cmd = build_docker_command("ps", {"filter": "status=running"})
        assert "--filter" in cmd
        tokens = shlex.split(cmd)
        idx = tokens.index("--filter")
        assert tokens[idx + 1] == "status=running"

    def test_format(self):
        cmd = build_docker_command("ps", {"format": "table {{.Names}}"})
        assert "--format" in cmd

    def test_all_and_filter(self):
        cmd = build_docker_command("ps", {"all": True, "filter": "name=web"})
        assert "-a" in cmd
        assert "--filter" in cmd


# ---------------------------------------------------------------------------
# run
# ---------------------------------------------------------------------------

class TestBuildRun:
    def test_basic(self):
        cmd = build_docker_command("run", {"image": "nginx"})
        assert cmd.startswith("docker run")
        assert "'nginx'" in cmd or "nginx" in cmd

    def test_requires_image(self):
        with pytest.raises(ValueError, match="run requires 'image'"):
            build_docker_command("run", {})

    def test_empty_image(self):
        with pytest.raises(ValueError, match="run requires 'image'"):
            build_docker_command("run", {"image": ""})

    def test_detach(self):
        cmd = build_docker_command("run", {"image": "nginx", "detach": True})
        assert "-d" in cmd

    def test_rm(self):
        cmd = build_docker_command("run", {"image": "nginx", "rm": True})
        assert "--rm" in cmd

    def test_name(self):
        cmd = build_docker_command("run", {"image": "nginx", "name": "web"})
        assert "--name" in cmd

    def test_network(self):
        cmd = build_docker_command("run", {"image": "nginx", "network": "mynet"})
        assert "--network" in cmd

    def test_env(self):
        cmd = build_docker_command("run", {"image": "nginx", "env": {"FOO": "bar"}})
        assert "-e" in cmd
        tokens = shlex.split(cmd)
        idx = tokens.index("-e")
        assert tokens[idx + 1] == "FOO=bar"

    def test_ports(self):
        cmd = build_docker_command("run", {"image": "nginx", "ports": ["8080:80"]})
        assert "-p" in cmd
        tokens = shlex.split(cmd)
        idx = tokens.index("-p")
        assert tokens[idx + 1] == "8080:80"

    def test_volumes(self):
        cmd = build_docker_command("run", {"image": "nginx", "volumes": ["/data:/data"]})
        assert "-v" in cmd

    def test_command(self):
        cmd = build_docker_command("run", {"image": "nginx", "command": "echo hello"})
        assert "sh" in cmd
        assert "-c" in cmd

    def test_full_options(self):
        cmd = build_docker_command("run", {
            "image": "myapp:latest",
            "name": "app",
            "detach": True,
            "rm": True,
            "env": {"NODE_ENV": "production"},
            "ports": ["3000:3000"],
            "volumes": ["/logs:/app/logs"],
            "network": "backend",
        })
        for flag in ["-d", "--rm", "--name", "--network", "-e", "-p", "-v"]:
            assert flag in cmd

    def test_multiple_env(self):
        cmd = build_docker_command("run", {
            "image": "app",
            "env": {"A": "1", "B": "2"},
        })
        assert cmd.count("-e") == 2

    def test_multiple_ports(self):
        cmd = build_docker_command("run", {
            "image": "app",
            "ports": ["8080:80", "8443:443"],
        })
        assert cmd.count("-p") == 2


# ---------------------------------------------------------------------------
# exec
# ---------------------------------------------------------------------------

class TestBuildExec:
    def test_basic(self):
        cmd = build_docker_command("exec", {"container": "web", "command": "ls"})
        assert cmd.startswith("docker exec")
        assert "sh" in cmd
        assert "-c" in cmd

    def test_requires_container(self):
        with pytest.raises(ValueError, match="exec requires 'container'"):
            build_docker_command("exec", {"command": "ls"})

    def test_requires_command(self):
        with pytest.raises(ValueError, match="exec requires 'command'"):
            build_docker_command("exec", {"container": "web"})

    def test_empty_container(self):
        with pytest.raises(ValueError, match="exec requires 'container'"):
            build_docker_command("exec", {"container": "", "command": "ls"})

    def test_empty_command(self):
        with pytest.raises(ValueError, match="exec requires 'command'"):
            build_docker_command("exec", {"container": "web", "command": ""})

    def test_workdir(self):
        cmd = build_docker_command("exec", {
            "container": "web", "command": "ls", "workdir": "/app",
        })
        assert "-w" in cmd

    def test_user(self):
        cmd = build_docker_command("exec", {
            "container": "web", "command": "ls", "user": "root",
        })
        assert "-u" in cmd

    def test_env(self):
        cmd = build_docker_command("exec", {
            "container": "web", "command": "ls", "env": {"DEBUG": "1"},
        })
        assert "-e" in cmd


# ---------------------------------------------------------------------------
# logs
# ---------------------------------------------------------------------------

class TestBuildLogs:
    def test_basic_default_tail(self):
        cmd = build_docker_command("logs", {"container": "web"})
        assert "--tail" in cmd
        assert "100" in cmd

    def test_requires_container(self):
        with pytest.raises(ValueError, match="logs requires 'container'"):
            build_docker_command("logs", {})

    def test_custom_tail(self):
        cmd = build_docker_command("logs", {"container": "web", "tail": 50})
        assert "--tail" in cmd
        assert "50" in cmd

    def test_tail_capped_at_500(self):
        cmd = build_docker_command("logs", {"container": "web", "tail": 1000})
        assert "500" in cmd

    def test_tail_invalid_defaults(self):
        cmd = build_docker_command("logs", {"container": "web", "tail": "abc"})
        assert "100" in cmd

    def test_tail_zero_defaults(self):
        cmd = build_docker_command("logs", {"container": "web", "tail": 0})
        assert "100" in cmd

    def test_follow(self):
        cmd = build_docker_command("logs", {"container": "web", "follow": True})
        assert "--follow" in cmd

    def test_timestamps(self):
        cmd = build_docker_command("logs", {"container": "web", "timestamps": True})
        assert "--timestamps" in cmd

    def test_since(self):
        cmd = build_docker_command("logs", {"container": "web", "since": "1h"})
        assert "--since" in cmd


# ---------------------------------------------------------------------------
# build
# ---------------------------------------------------------------------------

class TestBuildBuild:
    def test_default_path(self):
        cmd = build_docker_command("build", {})
        assert cmd.startswith("docker build")
        assert cmd.endswith("'.'") or cmd.endswith(".")

    def test_tag(self):
        cmd = build_docker_command("build", {"tag": "myapp:latest"})
        assert "-t" in cmd

    def test_dockerfile(self):
        cmd = build_docker_command("build", {"dockerfile": "Dockerfile.prod"})
        assert "-f" in cmd

    def test_no_cache(self):
        cmd = build_docker_command("build", {"no_cache": True})
        assert "--no-cache" in cmd

    def test_build_args(self):
        cmd = build_docker_command("build", {"build_args": {"VERSION": "1.0"}})
        assert "--build-arg" in cmd
        tokens = shlex.split(cmd)
        idx = tokens.index("--build-arg")
        assert tokens[idx + 1] == "VERSION=1.0"

    def test_target(self):
        cmd = build_docker_command("build", {"target": "builder"})
        assert "--target" in cmd

    def test_custom_path(self):
        cmd = build_docker_command("build", {"path": "/home/user/app"})
        tokens = shlex.split(cmd)
        assert tokens[-1] == "/home/user/app"

    def test_full_options(self):
        cmd = build_docker_command("build", {
            "path": ".",
            "tag": "myapp:v2",
            "dockerfile": "Dockerfile.prod",
            "no_cache": True,
            "build_args": {"NODE_ENV": "production"},
            "target": "runtime",
        })
        for flag in ["-t", "-f", "--no-cache", "--build-arg", "--target"]:
            assert flag in cmd

    def test_multiple_build_args(self):
        cmd = build_docker_command("build", {
            "build_args": {"A": "1", "B": "2"},
        })
        assert cmd.count("--build-arg") == 2


# ---------------------------------------------------------------------------
# pull
# ---------------------------------------------------------------------------

class TestBuildPull:
    def test_basic(self):
        cmd = build_docker_command("pull", {"image": "nginx:latest"})
        assert cmd.startswith("docker pull")

    def test_requires_image(self):
        with pytest.raises(ValueError, match="pull requires 'image'"):
            build_docker_command("pull", {})

    def test_empty_image(self):
        with pytest.raises(ValueError, match="pull requires 'image'"):
            build_docker_command("pull", {"image": ""})


# ---------------------------------------------------------------------------
# stop
# ---------------------------------------------------------------------------

class TestBuildStop:
    def test_basic(self):
        cmd = build_docker_command("stop", {"container": "web"})
        assert cmd.startswith("docker stop")

    def test_requires_container(self):
        with pytest.raises(ValueError, match="stop requires 'container'"):
            build_docker_command("stop", {})

    def test_timeout(self):
        cmd = build_docker_command("stop", {"container": "web", "timeout": 10})
        assert "-t" in cmd
        assert "10" in cmd

    def test_negative_timeout_ignored(self):
        cmd = build_docker_command("stop", {"container": "web", "timeout": -1})
        assert "-t" not in cmd

    def test_invalid_timeout_ignored(self):
        cmd = build_docker_command("stop", {"container": "web", "timeout": "abc"})
        assert "-t" not in cmd

    def test_zero_timeout(self):
        cmd = build_docker_command("stop", {"container": "web", "timeout": 0})
        assert "-t" in cmd
        assert "0" in cmd


# ---------------------------------------------------------------------------
# rm
# ---------------------------------------------------------------------------

class TestBuildRm:
    def test_basic(self):
        cmd = build_docker_command("rm", {"container": "web"})
        assert cmd.startswith("docker rm")

    def test_requires_container(self):
        with pytest.raises(ValueError, match="rm requires 'container'"):
            build_docker_command("rm", {})

    def test_force(self):
        cmd = build_docker_command("rm", {"container": "web", "force": True})
        assert "-f" in cmd

    def test_volumes(self):
        cmd = build_docker_command("rm", {"container": "web", "volumes": True})
        assert "-v" in cmd

    def test_force_and_volumes(self):
        cmd = build_docker_command("rm", {"container": "web", "force": True, "volumes": True})
        assert "-f" in cmd
        assert "-v" in cmd


# ---------------------------------------------------------------------------
# inspect
# ---------------------------------------------------------------------------

class TestBuildInspect:
    def test_basic(self):
        cmd = build_docker_command("inspect", {"target": "web"})
        assert cmd.startswith("docker inspect")

    def test_requires_target(self):
        with pytest.raises(ValueError, match="inspect requires 'target'"):
            build_docker_command("inspect", {})

    def test_empty_target(self):
        with pytest.raises(ValueError, match="inspect requires 'target'"):
            build_docker_command("inspect", {"target": ""})

    def test_format(self):
        cmd = build_docker_command("inspect", {
            "target": "web", "format": "{{.State.Status}}",
        })
        assert "--format" in cmd


# ---------------------------------------------------------------------------
# stats
# ---------------------------------------------------------------------------

class TestBuildStats:
    def test_basic_no_stream_default(self):
        cmd = build_docker_command("stats", {})
        assert "--no-stream" in cmd

    def test_with_container(self):
        cmd = build_docker_command("stats", {"container": "web"})
        assert "--no-stream" in cmd
        tokens = shlex.split(cmd)
        assert tokens[-1] == "web"

    def test_stream(self):
        cmd = build_docker_command("stats", {"no_stream": False})
        assert "--no-stream" not in cmd

    def test_format(self):
        cmd = build_docker_command("stats", {"format": "table {{.Name}}"})
        assert "--format" in cmd


# ---------------------------------------------------------------------------
# compose_up
# ---------------------------------------------------------------------------

class TestBuildComposeUp:
    def test_basic_detach_default(self):
        cmd = build_docker_command("compose_up", {})
        assert cmd.startswith("docker compose")
        assert "-d" in cmd
        assert "up" in cmd

    def test_no_detach(self):
        cmd = build_docker_command("compose_up", {"detach": False})
        assert "-d" not in cmd

    def test_build(self):
        cmd = build_docker_command("compose_up", {"build": True})
        assert "--build" in cmd

    def test_force_recreate(self):
        cmd = build_docker_command("compose_up", {"force_recreate": True})
        assert "--force-recreate" in cmd

    def test_services(self):
        cmd = build_docker_command("compose_up", {"services": ["web", "db"]})
        tokens = shlex.split(cmd)
        assert "web" in tokens
        assert "db" in tokens

    def test_file(self):
        cmd = build_docker_command("compose_up", {"file": "docker-compose.prod.yml"})
        assert "-f" in cmd

    def test_project(self):
        cmd = build_docker_command("compose_up", {"project": "myproj"})
        assert "-p" in cmd

    def test_full_options(self):
        cmd = build_docker_command("compose_up", {
            "file": "compose.yml",
            "project": "prod",
            "services": ["api"],
            "build": True,
            "force_recreate": True,
        })
        for flag in ["-f", "-p", "--build", "--force-recreate", "-d"]:
            assert flag in cmd


# ---------------------------------------------------------------------------
# compose_down
# ---------------------------------------------------------------------------

class TestBuildComposeDown:
    def test_basic(self):
        cmd = build_docker_command("compose_down", {})
        assert "docker compose" in cmd
        assert "down" in cmd

    def test_remove_volumes(self):
        cmd = build_docker_command("compose_down", {"remove_volumes": True})
        assert "-v" in cmd

    def test_remove_images_all(self):
        cmd = build_docker_command("compose_down", {"remove_images": "all"})
        assert "--rmi" in cmd
        assert "all" in cmd

    def test_remove_images_local(self):
        cmd = build_docker_command("compose_down", {"remove_images": "local"})
        assert "--rmi" in cmd
        assert "local" in cmd

    def test_remove_images_invalid_ignored(self):
        cmd = build_docker_command("compose_down", {"remove_images": "none"})
        assert "--rmi" not in cmd

    def test_file(self):
        cmd = build_docker_command("compose_down", {"file": "compose.yml"})
        assert "-f" in cmd

    def test_project(self):
        cmd = build_docker_command("compose_down", {"project": "myproj"})
        assert "-p" in cmd


# ---------------------------------------------------------------------------
# compose_ps
# ---------------------------------------------------------------------------

class TestBuildComposePs:
    def test_basic(self):
        cmd = build_docker_command("compose_ps", {})
        assert "docker compose" in cmd
        assert "ps" in cmd

    def test_services(self):
        cmd = build_docker_command("compose_ps", {"services": ["web"]})
        tokens = shlex.split(cmd)
        assert "web" in tokens

    def test_format(self):
        cmd = build_docker_command("compose_ps", {"format": "json"})
        assert "--format" in cmd

    def test_file_and_project(self):
        cmd = build_docker_command("compose_ps", {
            "file": "compose.yml", "project": "myproj",
        })
        assert "-f" in cmd
        assert "-p" in cmd


# ---------------------------------------------------------------------------
# compose_logs
# ---------------------------------------------------------------------------

class TestBuildComposeLogs:
    def test_basic_default_tail(self):
        cmd = build_docker_command("compose_logs", {})
        assert "docker compose" in cmd
        assert "logs" in cmd
        assert "--tail" in cmd
        assert "100" in cmd

    def test_services(self):
        cmd = build_docker_command("compose_logs", {"services": ["web", "api"]})
        tokens = shlex.split(cmd)
        assert "web" in tokens
        assert "api" in tokens

    def test_custom_tail(self):
        cmd = build_docker_command("compose_logs", {"tail": 50})
        assert "50" in cmd

    def test_tail_capped(self):
        cmd = build_docker_command("compose_logs", {"tail": 1000})
        assert "500" in cmd

    def test_tail_invalid_defaults(self):
        cmd = build_docker_command("compose_logs", {"tail": "abc"})
        assert "100" in cmd

    def test_follow(self):
        cmd = build_docker_command("compose_logs", {"follow": True})
        assert "--follow" in cmd

    def test_timestamps(self):
        cmd = build_docker_command("compose_logs", {"timestamps": True})
        assert "--timestamps" in cmd

    def test_file_and_project(self):
        cmd = build_docker_command("compose_logs", {
            "file": "compose.yml", "project": "myproj",
        })
        assert "-f" in cmd
        assert "-p" in cmd


# ---------------------------------------------------------------------------
# Shell injection safety
# ---------------------------------------------------------------------------

class TestShellInjectionSafety:
    def test_image_with_semicolons(self):
        cmd = build_docker_command("run", {"image": "nginx; rm -rf /"})
        tokens = shlex.split(cmd)
        img_tokens = [t for t in tokens if "nginx" in t]
        assert len(img_tokens) == 1
        assert "rm" not in img_tokens[0].replace("nginx; rm -rf /", "SAFE")

    def test_container_with_command_injection(self):
        cmd = build_docker_command("exec", {
            "container": "web$(whoami)",
            "command": "ls",
        })
        tokens = shlex.split(cmd)
        container_tokens = [t for t in tokens if "web" in t]
        assert any("$(whoami)" in t for t in container_tokens)

    def test_exec_command_injection(self):
        cmd = build_docker_command("exec", {
            "container": "web",
            "command": "ls; cat /etc/passwd",
        })
        tokens = shlex.split(cmd)
        sh_idx = tokens.index("sh")
        c_idx = tokens.index("-c")
        cmd_val = tokens[c_idx + 1]
        assert cmd_val == "ls; cat /etc/passwd"

    def test_volume_path_with_spaces(self):
        cmd = build_docker_command("run", {
            "image": "app",
            "volumes": ["/my data:/app data"],
        })
        tokens = shlex.split(cmd)
        v_idx = tokens.index("-v")
        assert tokens[v_idx + 1] == "/my data:/app data"

    def test_build_arg_injection(self):
        cmd = build_docker_command("build", {
            "build_args": {"VER": "1.0; rm -rf /"},
        })
        tokens = shlex.split(cmd)
        ba_idx = tokens.index("--build-arg")
        assert tokens[ba_idx + 1] == "VER=1.0; rm -rf /"

    def test_compose_file_injection(self):
        cmd = build_docker_command("compose_up", {
            "file": "compose.yml; rm -rf /",
        })
        tokens = shlex.split(cmd)
        f_idx = tokens.index("-f")
        assert tokens[f_idx + 1] == "compose.yml; rm -rf /"

    def test_inspect_target_injection(self):
        cmd = build_docker_command("inspect", {
            "target": "web$(id)",
        })
        tokens = shlex.split(cmd)
        target_tokens = [t for t in tokens if "web" in t]
        assert any("$(id)" in t for t in target_tokens)


# ---------------------------------------------------------------------------
# Handler integration tests (ToolExecutor._handle_docker_ops)
# ---------------------------------------------------------------------------

def _make_executor(hosts=None):
    """Build a ToolExecutor with canned hosts config."""
    if hosts is None:
        hosts = {
            "prod": ToolHost(address="10.0.0.1", ssh_user="deploy", os="linux"),
        }
    cfg = ToolsConfig(hosts=hosts)
    return ToolExecutor(cfg)


class TestHandleDockerOps:
    @pytest.mark.asyncio
    async def test_unknown_host(self):
        ex = _make_executor()
        result = await ex._handle_docker_ops({"host": "nope", "action": "ps"})
        assert "Unknown or disallowed host" in result

    @pytest.mark.asyncio
    async def test_unknown_action(self):
        ex = _make_executor()
        result = await ex._handle_docker_ops({"host": "prod", "action": "nope"})
        assert "Unknown docker action" in result

    @pytest.mark.asyncio
    async def test_missing_action(self):
        ex = _make_executor()
        result = await ex._handle_docker_ops({"host": "prod"})
        assert "Unknown docker action" in result

    @pytest.mark.asyncio
    async def test_ps_dispatch(self):
        ex = _make_executor()
        with patch.object(ex, "_exec_command", new_callable=AsyncMock) as mock_exec:
            mock_exec.return_value = (0, "CONTAINER ID  IMAGE  STATUS\nabc  nginx  Up")
            result = await ex._handle_docker_ops({"host": "prod", "action": "ps"})
        assert "nginx" in result
        mock_exec.assert_awaited_once()
        cmd_arg = mock_exec.call_args[0][1]
        assert cmd_arg.startswith("docker ps")

    @pytest.mark.asyncio
    async def test_run_dispatch(self):
        ex = _make_executor()
        with patch.object(ex, "_exec_command", new_callable=AsyncMock) as mock_exec:
            mock_exec.return_value = (0, "abc123")
            result = await ex._handle_docker_ops({
                "host": "prod", "action": "run",
                "params": {"image": "nginx", "detach": True},
            })
        assert "abc123" in result

    @pytest.mark.asyncio
    async def test_exec_dispatch(self):
        ex = _make_executor()
        with patch.object(ex, "_exec_command", new_callable=AsyncMock) as mock_exec:
            mock_exec.return_value = (0, "file.txt")
            result = await ex._handle_docker_ops({
                "host": "prod", "action": "exec",
                "params": {"container": "web", "command": "ls"},
            })
        assert "file.txt" in result

    @pytest.mark.asyncio
    async def test_logs_dispatch(self):
        ex = _make_executor()
        with patch.object(ex, "_exec_command", new_callable=AsyncMock) as mock_exec:
            mock_exec.return_value = (0, "log line 1\nlog line 2")
            result = await ex._handle_docker_ops({
                "host": "prod", "action": "logs",
                "params": {"container": "web"},
            })
        assert "log line" in result

    @pytest.mark.asyncio
    async def test_build_dispatch(self):
        ex = _make_executor()
        with patch.object(ex, "_exec_command", new_callable=AsyncMock) as mock_exec:
            mock_exec.return_value = (0, "Successfully built abc123")
            result = await ex._handle_docker_ops({
                "host": "prod", "action": "build",
                "params": {"tag": "myapp:latest"},
            })
        assert "Successfully built" in result

    @pytest.mark.asyncio
    async def test_pull_dispatch(self):
        ex = _make_executor()
        with patch.object(ex, "_exec_command", new_callable=AsyncMock) as mock_exec:
            mock_exec.return_value = (0, "Status: Downloaded newer image")
            result = await ex._handle_docker_ops({
                "host": "prod", "action": "pull",
                "params": {"image": "nginx:latest"},
            })
        assert "Downloaded" in result

    @pytest.mark.asyncio
    async def test_stop_dispatch(self):
        ex = _make_executor()
        with patch.object(ex, "_exec_command", new_callable=AsyncMock) as mock_exec:
            mock_exec.return_value = (0, "web")
            result = await ex._handle_docker_ops({
                "host": "prod", "action": "stop",
                "params": {"container": "web"},
            })
        assert "web" in result

    @pytest.mark.asyncio
    async def test_rm_dispatch(self):
        ex = _make_executor()
        with patch.object(ex, "_exec_command", new_callable=AsyncMock) as mock_exec:
            mock_exec.return_value = (0, "web")
            result = await ex._handle_docker_ops({
                "host": "prod", "action": "rm",
                "params": {"container": "web"},
            })
        assert "web" in result

    @pytest.mark.asyncio
    async def test_inspect_dispatch(self):
        ex = _make_executor()
        with patch.object(ex, "_exec_command", new_callable=AsyncMock) as mock_exec:
            mock_exec.return_value = (0, '{"State": {"Status": "running"}}')
            result = await ex._handle_docker_ops({
                "host": "prod", "action": "inspect",
                "params": {"target": "web"},
            })
        assert "running" in result

    @pytest.mark.asyncio
    async def test_stats_dispatch(self):
        ex = _make_executor()
        with patch.object(ex, "_exec_command", new_callable=AsyncMock) as mock_exec:
            mock_exec.return_value = (0, "CONTAINER  CPU%  MEM%")
            result = await ex._handle_docker_ops({
                "host": "prod", "action": "stats",
                "params": {},
            })
        assert "CPU%" in result

    @pytest.mark.asyncio
    async def test_compose_up_dispatch(self):
        ex = _make_executor()
        with patch.object(ex, "_exec_command", new_callable=AsyncMock) as mock_exec:
            mock_exec.return_value = (0, "Creating web_1 ... done")
            result = await ex._handle_docker_ops({
                "host": "prod", "action": "compose_up",
                "params": {},
            })
        assert "Creating" in result

    @pytest.mark.asyncio
    async def test_compose_down_dispatch(self):
        ex = _make_executor()
        with patch.object(ex, "_exec_command", new_callable=AsyncMock) as mock_exec:
            mock_exec.return_value = (0, "Stopping web_1 ... done")
            result = await ex._handle_docker_ops({
                "host": "prod", "action": "compose_down",
                "params": {},
            })
        assert "Stopping" in result

    @pytest.mark.asyncio
    async def test_compose_ps_dispatch(self):
        ex = _make_executor()
        with patch.object(ex, "_exec_command", new_callable=AsyncMock) as mock_exec:
            mock_exec.return_value = (0, "NAME  STATUS\nweb  running")
            result = await ex._handle_docker_ops({
                "host": "prod", "action": "compose_ps",
                "params": {},
            })
        assert "running" in result

    @pytest.mark.asyncio
    async def test_compose_logs_dispatch(self):
        ex = _make_executor()
        with patch.object(ex, "_exec_command", new_callable=AsyncMock) as mock_exec:
            mock_exec.return_value = (0, "web_1  | Starting server")
            result = await ex._handle_docker_ops({
                "host": "prod", "action": "compose_logs",
                "params": {},
            })
        assert "Starting" in result

    @pytest.mark.asyncio
    async def test_command_failure(self):
        ex = _make_executor()
        with patch.object(ex, "_exec_command", new_callable=AsyncMock) as mock_exec:
            mock_exec.return_value = (1, "Error: No such container: web")
            result = await ex._handle_docker_ops({
                "host": "prod", "action": "logs",
                "params": {"container": "web"},
            })
        assert "failed" in result
        assert "exit 1" in result

    @pytest.mark.asyncio
    async def test_validation_error(self):
        ex = _make_executor()
        result = await ex._handle_docker_ops({
            "host": "prod", "action": "run", "params": {},
        })
        assert "docker_ops error" in result

    @pytest.mark.asyncio
    async def test_empty_output(self):
        ex = _make_executor()
        with patch.object(ex, "_exec_command", new_callable=AsyncMock) as mock_exec:
            mock_exec.return_value = (0, "")
            result = await ex._handle_docker_ops({
                "host": "prod", "action": "ps", "params": {},
            })
        assert "completed successfully" in result

    @pytest.mark.asyncio
    async def test_no_params_default(self):
        ex = _make_executor()
        with patch.object(ex, "_exec_command", new_callable=AsyncMock) as mock_exec:
            mock_exec.return_value = (0, "docker ps output")
            result = await ex._handle_docker_ops({
                "host": "prod", "action": "ps",
            })
        assert "docker ps output" in result

    @pytest.mark.asyncio
    async def test_correct_ssh_user(self):
        ex = _make_executor()
        with patch.object(ex, "_exec_command", new_callable=AsyncMock) as mock_exec:
            mock_exec.return_value = (0, "ok")
            await ex._handle_docker_ops({
                "host": "prod", "action": "ps", "params": {},
            })
        _, kwargs = mock_exec.call_args if mock_exec.call_args.kwargs else (mock_exec.call_args[0], {})
        args = mock_exec.call_args[0]
        assert args[0] == "10.0.0.1"
        assert args[2] == "deploy"

    @pytest.mark.asyncio
    async def test_uses_exec_command(self):
        ex = _make_executor()
        with patch.object(ex, "_exec_command", new_callable=AsyncMock) as mock_exec:
            mock_exec.return_value = (0, "ok")
            await ex._handle_docker_ops({
                "host": "prod", "action": "ps", "params": {},
            })
        mock_exec.assert_awaited_once()
        cmd = mock_exec.call_args[0][1]
        assert "docker" in cmd


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------

class TestEdgeCases:
    def test_all_actions_have_builders(self):
        from src.tools.docker_ops import _BUILDERS
        for action in ALLOWED_ACTIONS:
            assert action in _BUILDERS

    def test_run_extra_args_passthrough(self):
        cmd = build_docker_command("run", {
            "image": "app", "extra_args": "--memory 512m",
        })
        assert "--memory 512m" in cmd

    def test_logs_container_at_end(self):
        cmd = build_docker_command("logs", {"container": "web", "follow": True})
        tokens = shlex.split(cmd)
        assert tokens[-1] == "web"

    def test_compose_up_services_at_end(self):
        cmd = build_docker_command("compose_up", {"services": ["web"]})
        tokens = shlex.split(cmd)
        assert tokens[-1] == "web"

    def test_compose_down_removes_both(self):
        cmd = build_docker_command("compose_down", {
            "remove_volumes": True, "remove_images": "all",
        })
        assert "-v" in cmd
        assert "--rmi" in cmd

    def test_stats_no_container_no_stream(self):
        cmd = build_docker_command("stats", {})
        tokens = shlex.split(cmd)
        assert tokens == ["docker", "stats", "--no-stream"]

    def test_build_defaults_to_dot(self):
        cmd = build_docker_command("build", {})
        tokens = shlex.split(cmd)
        assert tokens[-1] == "."

    def test_rm_empty_container_raises(self):
        with pytest.raises(ValueError, match="rm requires 'container'"):
            build_docker_command("rm", {"container": ""})

    def test_stop_empty_container_raises(self):
        with pytest.raises(ValueError, match="stop requires 'container'"):
            build_docker_command("stop", {"container": ""})

    def test_inspect_with_format_quoted(self):
        cmd = build_docker_command("inspect", {
            "target": "web",
            "format": "{{.NetworkSettings.IPAddress}}",
        })
        tokens = shlex.split(cmd)
        fmt_idx = tokens.index("--format")
        assert tokens[fmt_idx + 1] == "{{.NetworkSettings.IPAddress}}"

    def test_compose_logs_tail_zero_defaults(self):
        cmd = build_docker_command("compose_logs", {"tail": 0})
        assert "100" in cmd

    def test_run_env_not_dict_skipped(self):
        cmd = build_docker_command("run", {"image": "app", "env": "not_a_dict"})
        assert "-e" not in cmd

    def test_run_ports_not_list_skipped(self):
        cmd = build_docker_command("run", {"image": "app", "ports": "8080:80"})
        assert "-p" not in cmd

    def test_run_volumes_not_list_skipped(self):
        cmd = build_docker_command("run", {"image": "app", "volumes": "/data:/data"})
        assert "-v" not in cmd
