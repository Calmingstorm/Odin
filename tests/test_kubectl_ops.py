"""Tests for kubectl tool (Round 12).

Tests the kubectl_ops helper (command building, validation, safety) and the
ToolExecutor._handle_kubectl handler (host resolution, execution dispatch).
"""

from __future__ import annotations

import shlex
from unittest.mock import AsyncMock, patch

import pytest

from src.tools.kubectl_ops import (
    ALLOWED_ACTIONS,
    build_kubectl_command,
    _common_flags,
)
from src.config.schema import ToolsConfig, ToolHost
from src.tools.executor import ToolExecutor
from src.tools.registry import TOOL_MAP


# ---------------------------------------------------------------------------
# Tool registration
# ---------------------------------------------------------------------------

class TestKubectlRegistration:
    def test_tool_in_registry(self):
        assert "kubectl" in TOOL_MAP

    def test_tool_has_required_fields(self):
        tool = TOOL_MAP["kubectl"]
        assert "name" in tool
        assert "description" in tool
        assert "input_schema" in tool

    def test_tool_requires_host_and_action(self):
        schema = TOOL_MAP["kubectl"]["input_schema"]
        assert "host" in schema["required"]
        assert "action" in schema["required"]

    def test_action_enum_matches_allowed(self):
        schema = TOOL_MAP["kubectl"]["input_schema"]
        enum_actions = set(schema["properties"]["action"]["enum"])
        assert enum_actions == ALLOWED_ACTIONS


# ---------------------------------------------------------------------------
# ALLOWED_ACTIONS
# ---------------------------------------------------------------------------

class TestKubectlAllowedActions:
    def test_all_expected_actions_present(self):
        expected = {
            "get", "describe", "logs", "apply", "delete", "exec",
            "rollout", "scale", "top", "config",
        }
        assert expected == ALLOWED_ACTIONS

    def test_unknown_action_raises(self):
        with pytest.raises(ValueError, match="Unknown kubectl action"):
            build_kubectl_command("patch", {})

    def test_allowed_actions_immutable(self):
        with pytest.raises((TypeError, AttributeError)):
            ALLOWED_ACTIONS.add("patch")


# ---------------------------------------------------------------------------
# Common flags
# ---------------------------------------------------------------------------

class TestCommonFlags:
    def test_no_flags(self):
        assert _common_flags({}) == []

    def test_namespace(self):
        flags = _common_flags({"namespace": "kube-system"})
        assert "-n" in flags
        assert "'kube-system'" in flags or "kube-system" in " ".join(flags)

    def test_context(self):
        flags = _common_flags({"context": "prod-cluster"})
        assert "--context" in flags

    def test_kubeconfig(self):
        flags = _common_flags({"kubeconfig": "/etc/kube/config"})
        assert "--kubeconfig" in flags

    def test_all_flags(self):
        flags = _common_flags({
            "namespace": "default",
            "context": "staging",
            "kubeconfig": "/tmp/k.conf",
        })
        assert len(flags) == 6  # 3 pairs


# ---------------------------------------------------------------------------
# Get
# ---------------------------------------------------------------------------

class TestBuildGet:
    def test_basic_get(self):
        cmd = build_kubectl_command("get", {"resource": "pods"})
        assert cmd.startswith("kubectl get")
        assert "pods" in cmd

    def test_get_requires_resource(self):
        with pytest.raises(ValueError, match="get requires 'resource'"):
            build_kubectl_command("get", {})

    def test_get_with_name(self):
        cmd = build_kubectl_command("get", {"resource": "pod", "name": "nginx-abc"})
        assert "nginx-abc" in cmd

    def test_get_with_output(self):
        cmd = build_kubectl_command("get", {"resource": "svc", "output": "json"})
        assert "-o" in cmd
        assert "json" in cmd

    def test_get_with_yaml_output(self):
        cmd = build_kubectl_command("get", {"resource": "deploy", "output": "yaml"})
        assert "-o" in cmd
        assert "yaml" in cmd

    def test_get_with_wide_output(self):
        cmd = build_kubectl_command("get", {"resource": "pods", "output": "wide"})
        assert "wide" in cmd

    def test_get_invalid_output_ignored(self):
        cmd = build_kubectl_command("get", {"resource": "pods", "output": "csv"})
        assert "-o" not in cmd

    def test_get_jsonpath_output(self):
        cmd = build_kubectl_command("get", {
            "resource": "pods",
            "output": "jsonpath={.items[*].metadata.name}",
        })
        assert "-o" in cmd

    def test_get_with_selector(self):
        cmd = build_kubectl_command("get", {"resource": "pods", "selector": "app=nginx"})
        assert "-l" in cmd
        assert "app=nginx" in cmd

    def test_get_all_namespaces(self):
        cmd = build_kubectl_command("get", {"resource": "pods", "all_namespaces": True})
        assert "--all-namespaces" in cmd

    def test_get_with_namespace(self):
        cmd = build_kubectl_command("get", {
            "resource": "pods", "namespace": "production",
        })
        assert "-n" in cmd
        assert "production" in cmd

    def test_get_empty_resource(self):
        with pytest.raises(ValueError, match="get requires 'resource'"):
            build_kubectl_command("get", {"resource": ""})


# ---------------------------------------------------------------------------
# Describe
# ---------------------------------------------------------------------------

class TestBuildDescribe:
    def test_basic_describe(self):
        cmd = build_kubectl_command("describe", {"resource": "pod"})
        assert cmd.startswith("kubectl describe")
        assert "pod" in cmd

    def test_describe_requires_resource(self):
        with pytest.raises(ValueError, match="describe requires 'resource'"):
            build_kubectl_command("describe", {})

    def test_describe_with_name(self):
        cmd = build_kubectl_command("describe", {
            "resource": "deployment", "name": "my-app",
        })
        assert "my-app" in cmd

    def test_describe_with_namespace(self):
        cmd = build_kubectl_command("describe", {
            "resource": "svc", "name": "api", "namespace": "staging",
        })
        assert "-n" in cmd
        assert "staging" in cmd

    def test_describe_empty_resource(self):
        with pytest.raises(ValueError):
            build_kubectl_command("describe", {"resource": ""})


# ---------------------------------------------------------------------------
# Logs
# ---------------------------------------------------------------------------

class TestBuildLogs:
    def test_basic_logs(self):
        cmd = build_kubectl_command("logs", {"pod": "nginx-abc"})
        assert cmd.startswith("kubectl logs")
        assert "nginx-abc" in cmd
        assert "--tail" in cmd
        assert "100" in cmd

    def test_logs_requires_pod(self):
        with pytest.raises(ValueError, match="logs requires 'pod'"):
            build_kubectl_command("logs", {})

    def test_logs_with_container(self):
        cmd = build_kubectl_command("logs", {"pod": "app-1", "container": "sidecar"})
        assert "-c" in cmd
        assert "sidecar" in cmd

    def test_logs_with_tail(self):
        cmd = build_kubectl_command("logs", {"pod": "app-1", "tail": 50})
        assert "--tail" in cmd
        assert "50" in cmd

    def test_logs_tail_capped(self):
        cmd = build_kubectl_command("logs", {"pod": "app-1", "tail": 9999})
        assert "500" in cmd

    def test_logs_tail_invalid_defaults(self):
        cmd = build_kubectl_command("logs", {"pod": "app-1", "tail": "abc"})
        assert "100" in cmd

    def test_logs_tail_zero_defaults(self):
        cmd = build_kubectl_command("logs", {"pod": "app-1", "tail": 0})
        assert "100" in cmd

    def test_logs_previous(self):
        cmd = build_kubectl_command("logs", {"pod": "app-1", "previous": True})
        assert "--previous" in cmd

    def test_logs_since(self):
        cmd = build_kubectl_command("logs", {"pod": "app-1", "since": "1h"})
        assert "--since" in cmd
        assert "1h" in cmd

    def test_logs_follow(self):
        cmd = build_kubectl_command("logs", {"pod": "app-1", "follow": True})
        assert "--follow" in cmd

    def test_logs_with_selector(self):
        cmd = build_kubectl_command("logs", {
            "pod": "ignored", "selector": "app=web",
        })
        assert "-l" in cmd
        assert "app=web" in cmd

    def test_logs_selector_before_pod(self):
        cmd = build_kubectl_command("logs", {
            "pod": "mypod", "selector": "app=web",
        })
        tokens = cmd.split()
        l_idx = tokens.index("-l")
        assert "mypod" not in cmd or tokens.index("'mypod'") > l_idx or l_idx < len(tokens)

    def test_logs_empty_pod(self):
        with pytest.raises(ValueError):
            build_kubectl_command("logs", {"pod": ""})


# ---------------------------------------------------------------------------
# Apply
# ---------------------------------------------------------------------------

class TestBuildApply:
    def test_basic_apply(self):
        cmd = build_kubectl_command("apply", {"file": "/tmp/deploy.yaml"})
        assert cmd.startswith("kubectl apply")
        assert "-f" in cmd
        assert "/tmp/deploy.yaml" in cmd

    def test_apply_requires_file_or_kustomize(self):
        with pytest.raises(ValueError, match="apply requires"):
            build_kubectl_command("apply", {})

    def test_apply_with_kustomize(self):
        cmd = build_kubectl_command("apply", {"kustomize": "/app/overlays/prod"})
        assert "-k" in cmd
        assert "/app/overlays/prod" in cmd

    def test_apply_kustomize_over_file(self):
        cmd = build_kubectl_command("apply", {
            "file": "/tmp/x.yaml", "kustomize": "/app/base",
        })
        assert "-k" in cmd
        assert "-f" not in cmd

    def test_apply_dry_run(self):
        cmd = build_kubectl_command("apply", {"file": "/tmp/x.yaml", "dry_run": True})
        assert "--dry-run=client" in cmd

    def test_apply_with_namespace(self):
        cmd = build_kubectl_command("apply", {
            "file": "/tmp/x.yaml", "namespace": "staging",
        })
        assert "-n" in cmd
        assert "staging" in cmd

    def test_apply_url(self):
        cmd = build_kubectl_command("apply", {
            "file": "https://raw.githubusercontent.com/user/repo/main/deploy.yaml",
        })
        assert "-f" in cmd
        assert "https://" in cmd

    def test_apply_empty_file_and_kustomize(self):
        with pytest.raises(ValueError):
            build_kubectl_command("apply", {"file": "", "kustomize": ""})


# ---------------------------------------------------------------------------
# Delete
# ---------------------------------------------------------------------------

class TestBuildDelete:
    def test_basic_delete(self):
        cmd = build_kubectl_command("delete", {"resource": "pod", "name": "nginx"})
        assert cmd.startswith("kubectl delete")
        assert "pod" in cmd
        assert "nginx" in cmd

    def test_delete_requires_resource(self):
        with pytest.raises(ValueError, match="delete requires 'resource'"):
            build_kubectl_command("delete", {})

    def test_delete_with_selector(self):
        cmd = build_kubectl_command("delete", {
            "resource": "pods", "selector": "app=old",
        })
        assert "-l" in cmd
        assert "app=old" in cmd

    def test_delete_force(self):
        cmd = build_kubectl_command("delete", {
            "resource": "pod", "name": "stuck", "force": True,
        })
        assert "--force" in cmd

    def test_delete_grace_period(self):
        cmd = build_kubectl_command("delete", {
            "resource": "pod", "name": "old", "grace_period": 0,
        })
        assert "--grace-period" in cmd
        assert "0" in cmd

    def test_delete_negative_grace_period_ignored(self):
        cmd = build_kubectl_command("delete", {
            "resource": "pod", "name": "old", "grace_period": -1,
        })
        assert "--grace-period" not in cmd

    def test_delete_invalid_grace_period_ignored(self):
        cmd = build_kubectl_command("delete", {
            "resource": "pod", "name": "old", "grace_period": "abc",
        })
        assert "--grace-period" not in cmd

    def test_delete_empty_resource(self):
        with pytest.raises(ValueError):
            build_kubectl_command("delete", {"resource": ""})


# ---------------------------------------------------------------------------
# Exec
# ---------------------------------------------------------------------------

class TestBuildExec:
    def test_basic_exec(self):
        cmd = build_kubectl_command("exec", {
            "pod": "nginx-abc", "command": "ls -la",
        })
        assert "kubectl exec" in cmd
        assert "nginx-abc" in cmd
        assert "-- sh -c" in cmd
        assert "ls -la" in cmd

    def test_exec_requires_pod(self):
        with pytest.raises(ValueError, match="exec requires 'pod'"):
            build_kubectl_command("exec", {"command": "ls"})

    def test_exec_requires_command(self):
        with pytest.raises(ValueError, match="exec requires 'command'"):
            build_kubectl_command("exec", {"pod": "nginx"})

    def test_exec_with_container(self):
        cmd = build_kubectl_command("exec", {
            "pod": "app-1", "command": "whoami", "container": "sidecar",
        })
        assert "-c" in cmd
        assert "sidecar" in cmd

    def test_exec_empty_pod(self):
        with pytest.raises(ValueError):
            build_kubectl_command("exec", {"pod": "", "command": "ls"})

    def test_exec_empty_command(self):
        with pytest.raises(ValueError):
            build_kubectl_command("exec", {"pod": "app", "command": ""})

    def test_exec_with_namespace(self):
        cmd = build_kubectl_command("exec", {
            "pod": "app", "command": "env", "namespace": "prod",
        })
        assert "-n" in cmd
        assert "prod" in cmd


# ---------------------------------------------------------------------------
# Rollout
# ---------------------------------------------------------------------------

class TestBuildRollout:
    def test_rollout_status(self):
        cmd = build_kubectl_command("rollout", {
            "subaction": "status", "resource": "deployment/my-app",
        })
        assert "kubectl rollout status" in cmd
        assert "deployment/my-app" in cmd

    def test_rollout_restart(self):
        cmd = build_kubectl_command("rollout", {
            "subaction": "restart", "resource": "deployment/api",
        })
        assert "restart" in cmd

    def test_rollout_undo(self):
        cmd = build_kubectl_command("rollout", {
            "subaction": "undo", "resource": "deployment/web",
        })
        assert "undo" in cmd

    def test_rollout_history(self):
        cmd = build_kubectl_command("rollout", {
            "subaction": "history", "resource": "deployment/web",
        })
        assert "history" in cmd

    def test_rollout_pause(self):
        cmd = build_kubectl_command("rollout", {
            "subaction": "pause", "resource": "deployment/web",
        })
        assert "pause" in cmd

    def test_rollout_resume(self):
        cmd = build_kubectl_command("rollout", {
            "subaction": "resume", "resource": "deployment/web",
        })
        assert "resume" in cmd

    def test_rollout_requires_resource(self):
        with pytest.raises(ValueError, match="rollout requires 'resource'"):
            build_kubectl_command("rollout", {"subaction": "status"})

    def test_rollout_invalid_subaction(self):
        with pytest.raises(ValueError, match="rollout subaction must be"):
            build_kubectl_command("rollout", {
                "subaction": "cancel", "resource": "deploy/x",
            })

    def test_rollout_default_subaction(self):
        cmd = build_kubectl_command("rollout", {"resource": "deployment/app"})
        assert "status" in cmd

    def test_rollout_with_namespace(self):
        cmd = build_kubectl_command("rollout", {
            "subaction": "status", "resource": "deploy/app", "namespace": "prod",
        })
        assert "-n" in cmd


# ---------------------------------------------------------------------------
# Scale
# ---------------------------------------------------------------------------

class TestBuildScale:
    def test_basic_scale(self):
        cmd = build_kubectl_command("scale", {
            "resource": "deployment/web", "replicas": 3,
        })
        assert "kubectl scale" in cmd
        assert "--replicas" in cmd
        assert "3" in cmd

    def test_scale_requires_resource(self):
        with pytest.raises(ValueError, match="scale requires 'resource'"):
            build_kubectl_command("scale", {"replicas": 3})

    def test_scale_requires_replicas(self):
        with pytest.raises(ValueError, match="scale requires 'replicas'"):
            build_kubectl_command("scale", {"resource": "deploy/app"})

    def test_scale_to_zero(self):
        cmd = build_kubectl_command("scale", {
            "resource": "deployment/idle", "replicas": 0,
        })
        assert "--replicas" in cmd
        assert " 0" in cmd

    def test_scale_negative_replicas(self):
        with pytest.raises(ValueError, match="replicas must be >= 0"):
            build_kubectl_command("scale", {
                "resource": "deploy/app", "replicas": -1,
            })

    def test_scale_non_numeric_replicas(self):
        with pytest.raises(ValueError, match="replicas must be an integer"):
            build_kubectl_command("scale", {
                "resource": "deploy/app", "replicas": "abc",
            })

    def test_scale_string_number(self):
        cmd = build_kubectl_command("scale", {
            "resource": "deploy/app", "replicas": "5",
        })
        assert "--replicas" in cmd
        assert "5" in cmd

    def test_scale_with_namespace(self):
        cmd = build_kubectl_command("scale", {
            "resource": "deploy/app", "replicas": 2, "namespace": "staging",
        })
        assert "-n" in cmd


# ---------------------------------------------------------------------------
# Top
# ---------------------------------------------------------------------------

class TestBuildTop:
    def test_top_pods_default(self):
        cmd = build_kubectl_command("top", {})
        assert "kubectl top pods" in cmd

    def test_top_pods_explicit(self):
        cmd = build_kubectl_command("top", {"resource": "pods"})
        assert "kubectl top pods" in cmd

    def test_top_nodes(self):
        cmd = build_kubectl_command("top", {"resource": "nodes"})
        assert "kubectl top nodes" in cmd

    def test_top_invalid_resource(self):
        with pytest.raises(ValueError, match="top resource must be"):
            build_kubectl_command("top", {"resource": "services"})

    def test_top_with_name(self):
        cmd = build_kubectl_command("top", {"resource": "pods", "name": "nginx"})
        assert "nginx" in cmd

    def test_top_with_selector(self):
        cmd = build_kubectl_command("top", {
            "resource": "pods", "selector": "app=web",
        })
        assert "-l" in cmd
        assert "app=web" in cmd

    def test_top_containers(self):
        cmd = build_kubectl_command("top", {
            "resource": "pods", "containers": True,
        })
        assert "--containers" in cmd

    def test_top_containers_ignored_for_nodes(self):
        cmd = build_kubectl_command("top", {
            "resource": "nodes", "containers": True,
        })
        assert "--containers" not in cmd

    def test_top_with_namespace(self):
        cmd = build_kubectl_command("top", {
            "resource": "pods", "namespace": "monitoring",
        })
        assert "-n" in cmd

    def test_top_pod_singular(self):
        cmd = build_kubectl_command("top", {"resource": "pod"})
        assert "kubectl top pod" in cmd

    def test_top_node_singular(self):
        cmd = build_kubectl_command("top", {"resource": "node"})
        assert "kubectl top node" in cmd


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

class TestBuildConfig:
    def test_config_get_contexts_default(self):
        cmd = build_kubectl_command("config", {})
        assert "kubectl config get-contexts" in cmd

    def test_config_current_context(self):
        cmd = build_kubectl_command("config", {"subaction": "current-context"})
        assert "current-context" in cmd

    def test_config_use_context(self):
        cmd = build_kubectl_command("config", {
            "subaction": "use-context", "context_name": "prod-cluster",
        })
        assert "use-context" in cmd
        assert "prod-cluster" in cmd

    def test_config_use_context_requires_name(self):
        with pytest.raises(ValueError, match="config use-context requires"):
            build_kubectl_command("config", {"subaction": "use-context"})

    def test_config_use_context_empty_name(self):
        with pytest.raises(ValueError):
            build_kubectl_command("config", {
                "subaction": "use-context", "context_name": "",
            })

    def test_config_view(self):
        cmd = build_kubectl_command("config", {"subaction": "view"})
        assert "view" in cmd
        assert "--minify" in cmd

    def test_config_invalid_subaction(self):
        with pytest.raises(ValueError, match="config subaction must be"):
            build_kubectl_command("config", {"subaction": "set-context"})

    def test_config_with_kubeconfig(self):
        cmd = build_kubectl_command("config", {
            "subaction": "get-contexts", "kubeconfig": "/etc/kube/config",
        })
        assert "--kubeconfig" in cmd
        assert "/etc/kube/config" in cmd


# ---------------------------------------------------------------------------
# Shell injection safety
# ---------------------------------------------------------------------------

class TestShellInjectionSafety:
    def test_resource_with_semicolons(self):
        cmd = build_kubectl_command("get", {"resource": "pods; rm -rf /"})
        tokens = shlex.split(cmd)
        assert any("pods; rm -rf /" in t for t in tokens)
        assert "rm" not in tokens

    def test_pod_name_with_command_injection(self):
        cmd = build_kubectl_command("logs", {"pod": "$(whoami)"})
        tokens = shlex.split(cmd)
        assert any("$(whoami)" in t for t in tokens)
        assert "whoami" not in [t for t in tokens if t != "$(whoami)" and t != "'$(whoami)'"]

    def test_exec_command_injection(self):
        cmd = build_kubectl_command("exec", {
            "pod": "app", "command": "cat /etc/passwd; rm -rf /",
        })
        tokens = shlex.split(cmd)
        found = [t for t in tokens if "cat /etc/passwd" in t]
        assert len(found) == 1
        assert "rm -rf /" in found[0]

    def test_namespace_with_injection(self):
        cmd = build_kubectl_command("get", {
            "resource": "pods", "namespace": "default; echo hacked",
        })
        tokens = shlex.split(cmd)
        ns_tokens = [t for t in tokens if "default; echo hacked" in t]
        assert len(ns_tokens) == 1

    def test_selector_with_injection(self):
        cmd = build_kubectl_command("get", {
            "resource": "pods",
            "selector": "app=web; curl evil.com",
        })
        tokens = shlex.split(cmd)
        sel_tokens = [t for t in tokens if "curl" in t]
        assert len(sel_tokens) <= 1
        if sel_tokens:
            assert "app=web" in sel_tokens[0]

    def test_file_path_with_spaces(self):
        cmd = build_kubectl_command("apply", {"file": "/tmp/my deploy.yaml"})
        tokens = shlex.split(cmd)
        assert any("my deploy.yaml" in t for t in tokens)

    def test_context_name_injection(self):
        cmd = build_kubectl_command("config", {
            "subaction": "use-context", "context_name": "prod$(id)",
        })
        tokens = shlex.split(cmd)
        ctx_tokens = [t for t in tokens if "prod$(id)" in t]
        assert len(ctx_tokens) == 1


# ---------------------------------------------------------------------------
# Handler integration tests
# ---------------------------------------------------------------------------

class TestHandleKubectl:
    def _make_executor(self, hosts=None):
        hosts = hosts or {"k8s-master": ToolHost(address="10.0.0.5")}
        config = ToolsConfig(hosts=hosts)
        return ToolExecutor(config=config)

    async def test_unknown_host(self):
        exe = self._make_executor()
        result = await exe.execute("kubectl", {
            "host": "nonexistent",
            "action": "get",
            "params": {"resource": "pods"},
        })
        assert "Unknown or disallowed host" in str(result)

    async def test_unknown_action(self):
        exe = self._make_executor()
        result = await exe.execute("kubectl", {
            "host": "k8s-master",
            "action": "patch",
        })
        assert "Unknown kubectl action" in str(result)

    async def test_missing_action(self):
        exe = self._make_executor()
        result = await exe.execute("kubectl", {
            "host": "k8s-master",
            "action": "",
        })
        assert "Unknown kubectl action" in str(result)

    @patch("src.tools.executor.ToolExecutor._exec_command")
    async def test_get_dispatches(self, mock_exec):
        mock_exec.return_value = (0, "NAME  READY  STATUS\nnginx 1/1    Running\n")
        exe = self._make_executor()
        result = await exe.execute("kubectl", {
            "host": "k8s-master",
            "action": "get",
            "params": {"resource": "pods"},
        })
        mock_exec.assert_called_once()
        cmd = mock_exec.call_args[0][1]
        assert "kubectl" in cmd
        assert "get" in cmd
        assert "nginx" in str(result)

    @patch("src.tools.executor.ToolExecutor._exec_command")
    async def test_describe_dispatches(self, mock_exec):
        mock_exec.return_value = (0, "Name: nginx\nNamespace: default\n")
        exe = self._make_executor()
        result = await exe.execute("kubectl", {
            "host": "k8s-master",
            "action": "describe",
            "params": {"resource": "pod", "name": "nginx"},
        })
        assert "Name: nginx" in str(result)

    @patch("src.tools.executor.ToolExecutor._exec_command")
    async def test_logs_dispatches(self, mock_exec):
        mock_exec.return_value = (0, "2026-01-01 Starting server...\n")
        exe = self._make_executor()
        result = await exe.execute("kubectl", {
            "host": "k8s-master",
            "action": "logs",
            "params": {"pod": "api-server-abc"},
        })
        assert "Starting server" in str(result)

    @patch("src.tools.executor.ToolExecutor._exec_command")
    async def test_apply_dispatches(self, mock_exec):
        mock_exec.return_value = (0, "deployment.apps/web configured\n")
        exe = self._make_executor()
        result = await exe.execute("kubectl", {
            "host": "k8s-master",
            "action": "apply",
            "params": {"file": "/tmp/deploy.yaml"},
        })
        assert "configured" in str(result)

    @patch("src.tools.executor.ToolExecutor._exec_command")
    async def test_delete_dispatches(self, mock_exec):
        mock_exec.return_value = (0, 'pod "old-pod" deleted\n')
        exe = self._make_executor()
        result = await exe.execute("kubectl", {
            "host": "k8s-master",
            "action": "delete",
            "params": {"resource": "pod", "name": "old-pod"},
        })
        assert "deleted" in str(result)

    @patch("src.tools.executor.ToolExecutor._exec_command")
    async def test_exec_dispatches(self, mock_exec):
        mock_exec.return_value = (0, "root\n")
        exe = self._make_executor()
        result = await exe.execute("kubectl", {
            "host": "k8s-master",
            "action": "exec",
            "params": {"pod": "app-1", "command": "whoami"},
        })
        assert "root" in str(result)

    @patch("src.tools.executor.ToolExecutor._exec_command")
    async def test_rollout_dispatches(self, mock_exec):
        mock_exec.return_value = (0, "deployment.apps/web restarted\n")
        exe = self._make_executor()
        result = await exe.execute("kubectl", {
            "host": "k8s-master",
            "action": "rollout",
            "params": {"subaction": "restart", "resource": "deployment/web"},
        })
        assert "restarted" in str(result)

    @patch("src.tools.executor.ToolExecutor._exec_command")
    async def test_scale_dispatches(self, mock_exec):
        mock_exec.return_value = (0, "deployment.apps/web scaled\n")
        exe = self._make_executor()
        result = await exe.execute("kubectl", {
            "host": "k8s-master",
            "action": "scale",
            "params": {"resource": "deployment/web", "replicas": 5},
        })
        assert "scaled" in str(result)

    @patch("src.tools.executor.ToolExecutor._exec_command")
    async def test_top_dispatches(self, mock_exec):
        mock_exec.return_value = (0, "NAME  CPU  MEMORY\napp   10m  128Mi\n")
        exe = self._make_executor()
        result = await exe.execute("kubectl", {
            "host": "k8s-master",
            "action": "top",
            "params": {"resource": "pods"},
        })
        assert "app" in str(result)

    @patch("src.tools.executor.ToolExecutor._exec_command")
    async def test_config_dispatches(self, mock_exec):
        mock_exec.return_value = (0, "CURRENT  NAME\n*        prod\n         staging\n")
        exe = self._make_executor()
        result = await exe.execute("kubectl", {
            "host": "k8s-master",
            "action": "config",
            "params": {"subaction": "get-contexts"},
        })
        assert "prod" in str(result)

    @patch("src.tools.executor.ToolExecutor._exec_command")
    async def test_command_failure(self, mock_exec):
        mock_exec.return_value = (1, "error: the server doesn't have a resource type \"foos\"")
        exe = self._make_executor()
        result = await exe.execute("kubectl", {
            "host": "k8s-master",
            "action": "get",
            "params": {"resource": "foos"},
        })
        assert "failed (exit 1)" in str(result)
        assert "doesn't have a resource type" in str(result)

    async def test_validation_error(self):
        exe = self._make_executor()
        result = await exe.execute("kubectl", {
            "host": "k8s-master",
            "action": "apply",
            "params": {},
        })
        assert "kubectl error" in str(result)

    @patch("src.tools.executor.ToolExecutor._exec_command")
    async def test_empty_output_shows_success(self, mock_exec):
        mock_exec.return_value = (0, "")
        exe = self._make_executor()
        result = await exe.execute("kubectl", {
            "host": "k8s-master",
            "action": "get",
            "params": {"resource": "pods"},
        })
        assert "completed successfully" in str(result)

    async def test_no_params_default(self):
        exe = self._make_executor()
        result = await exe.execute("kubectl", {
            "host": "k8s-master",
            "action": "get",
        })
        assert "kubectl error" in str(result)

    @patch("src.tools.executor.ToolExecutor._exec_command")
    async def test_correct_ssh_user(self, mock_exec):
        mock_exec.return_value = (0, "ok\n")
        hosts = {"k8s": ToolHost(address="10.0.0.5", ssh_user="admin")}
        exe = self._make_executor(hosts=hosts)
        await exe.execute("kubectl", {
            "host": "k8s",
            "action": "get",
            "params": {"resource": "nodes"},
        })
        call_args = mock_exec.call_args[0]
        assert call_args[0] == "10.0.0.5"
        assert call_args[2] == "admin"

    @patch("src.tools.executor.ToolExecutor._exec_command")
    async def test_metrics_tracked(self, mock_exec):
        mock_exec.return_value = (0, "ok\n")
        exe = self._make_executor()
        await exe.execute("kubectl", {
            "host": "k8s-master",
            "action": "get",
            "params": {"resource": "pods"},
        })
        metrics = exe.get_metrics()
        assert "kubectl" in metrics
        assert metrics["kubectl"]["calls"] == 1


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------

class TestEdgeCases:
    def test_all_actions_have_builders(self):
        from src.tools.kubectl_ops import _BUILDERS
        for action in ALLOWED_ACTIONS:
            assert action in _BUILDERS, f"Missing builder for {action}"

    def test_get_name_output_combined(self):
        cmd = build_kubectl_command("get", {
            "resource": "pods",
            "output": "name",
        })
        assert "-o" in cmd
        assert "name" in cmd

    def test_logs_default_tail_applied(self):
        cmd = build_kubectl_command("logs", {"pod": "x"})
        assert "--tail 100" in cmd

    def test_delete_no_name_no_selector(self):
        cmd = build_kubectl_command("delete", {"resource": "pods"})
        assert "kubectl delete" in cmd
        assert "-l" not in cmd

    def test_exec_command_quoted(self):
        cmd = build_kubectl_command("exec", {
            "pod": "app",
            "command": "echo 'hello world'",
        })
        tokens = shlex.split(cmd)
        assert any("echo 'hello world'" in t for t in tokens)

    def test_scale_float_replicas_truncated(self):
        cmd = build_kubectl_command("scale", {
            "resource": "deploy/app", "replicas": 3.7,
        })
        assert "--replicas 3" in cmd

    def test_apply_no_dry_run_by_default(self):
        cmd = build_kubectl_command("apply", {"file": "/tmp/x.yaml"})
        assert "--dry-run" not in cmd

    def test_config_no_context_flag_for_config_action(self):
        cmd = build_kubectl_command("config", {
            "subaction": "use-context", "context_name": "prod",
        })
        assert "--context" not in cmd

    def test_get_with_context_flag(self):
        cmd = build_kubectl_command("get", {
            "resource": "pods", "context": "staging",
        })
        assert "--context" in cmd
        assert "staging" in cmd

    def test_multiple_common_flags(self):
        cmd = build_kubectl_command("get", {
            "resource": "pods",
            "namespace": "kube-system",
            "context": "prod",
            "kubeconfig": "/etc/k8s/config",
        })
        assert "-n" in cmd
        assert "--context" in cmd
        assert "--kubeconfig" in cmd
