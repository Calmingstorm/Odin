"""Tests for git_ops tool (Round 11).

Tests the git_ops helper (command building, validation, safety) and the
ToolExecutor._handle_git_ops handler (host resolution, execution dispatch,
push freshness check).
"""

from __future__ import annotations

import shlex
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.tools.git_ops import (
    ALLOWED_ACTIONS,
    build_git_command,
)
from src.config.schema import ToolsConfig, ToolHost
from src.tools.executor import ToolExecutor
from src.tools.registry import TOOLS, TOOL_MAP


# ---------------------------------------------------------------------------
# Tool registration
# ---------------------------------------------------------------------------

class TestGitOpsRegistration:
    def test_tool_in_registry(self):
        assert "git_ops" in TOOL_MAP

    def test_tool_has_required_fields(self):
        tool = TOOL_MAP["git_ops"]
        assert "name" in tool
        assert "description" in tool
        assert "input_schema" in tool

    def test_tool_requires_host_and_action(self):
        schema = TOOL_MAP["git_ops"]["input_schema"]
        assert "host" in schema["required"]
        assert "action" in schema["required"]

    def test_action_enum_matches_allowed(self):
        schema = TOOL_MAP["git_ops"]["input_schema"]
        enum_actions = set(schema["properties"]["action"]["enum"])
        assert enum_actions == ALLOWED_ACTIONS


# ---------------------------------------------------------------------------
# ALLOWED_ACTIONS
# ---------------------------------------------------------------------------

class TestAllowedActions:
    def test_all_expected_actions_present(self):
        expected = {"clone", "status", "diff", "branch", "commit", "push",
                    "log", "pull", "checkout", "fetch", "stash"}
        assert expected == ALLOWED_ACTIONS

    def test_unknown_action_raises(self):
        with pytest.raises(ValueError, match="Unknown git action"):
            build_git_command("rebase", {})

    def test_allowed_actions_immutable(self):
        with pytest.raises((TypeError, AttributeError)):
            ALLOWED_ACTIONS.add("rebase")


# ---------------------------------------------------------------------------
# Clone
# ---------------------------------------------------------------------------

class TestBuildClone:
    def test_basic_clone(self):
        cmd = build_git_command("clone", {"url": "https://github.com/user/repo.git"})
        assert cmd.startswith("git clone")
        assert "https://github.com/user/repo.git" in cmd

    def test_clone_with_dest(self):
        cmd = build_git_command("clone", {"url": "https://x.com/r.git", "dest": "/opt/repo"})
        assert "/opt/repo" in cmd

    def test_clone_with_branch(self):
        cmd = build_git_command("clone", {"url": "https://x.com/r.git", "branch": "develop"})
        assert "--branch" in cmd
        assert "develop" in cmd

    def test_clone_with_depth(self):
        cmd = build_git_command("clone", {"url": "https://x.com/r.git", "depth": 1})
        assert "--depth 1" in cmd

    def test_clone_depth_zero_ignored(self):
        cmd = build_git_command("clone", {"url": "https://x.com/r.git", "depth": 0})
        assert "--depth" not in cmd

    def test_clone_depth_negative_ignored(self):
        cmd = build_git_command("clone", {"url": "https://x.com/r.git", "depth": -5})
        assert "--depth" not in cmd

    def test_clone_depth_non_numeric_ignored(self):
        cmd = build_git_command("clone", {"url": "https://x.com/r.git", "depth": "abc"})
        assert "--depth" not in cmd

    def test_clone_requires_url(self):
        with pytest.raises(ValueError, match="clone requires 'url'"):
            build_git_command("clone", {})

    def test_clone_empty_url(self):
        with pytest.raises(ValueError, match="clone requires 'url'"):
            build_git_command("clone", {"url": ""})

    def test_clone_full_options(self):
        cmd = build_git_command("clone", {
            "url": "git@github.com:user/repo.git",
            "dest": "/opt/myrepo",
            "branch": "main",
            "depth": 5,
        })
        assert "--branch" in cmd
        assert "main" in cmd
        assert "--depth 5" in cmd
        assert "git@github.com:user/repo.git" in cmd
        assert "/opt/myrepo" in cmd

    def test_clone_url_with_spaces_quoted(self):
        cmd = build_git_command("clone", {"url": "https://x.com/my repo.git"})
        tokens = shlex.split(cmd)
        assert "https://x.com/my repo.git" in tokens


# ---------------------------------------------------------------------------
# Status
# ---------------------------------------------------------------------------

class TestBuildStatus:
    def test_default_repo(self):
        cmd = build_git_command("status", {})
        assert "git -C" in cmd
        assert "status --short --branch" in cmd

    def test_custom_repo(self):
        cmd = build_git_command("status", {"repo": "/opt/project"})
        assert "/opt/project" in cmd
        assert "--short --branch" in cmd

    def test_repo_with_spaces_quoted(self):
        cmd = build_git_command("status", {"repo": "/opt/my project"})
        tokens = shlex.split(cmd)
        assert "/opt/my project" in tokens


# ---------------------------------------------------------------------------
# Diff
# ---------------------------------------------------------------------------

class TestBuildDiff:
    def test_default_diff(self):
        cmd = build_git_command("diff", {})
        assert "git -C" in cmd
        assert "diff" in cmd

    def test_staged_diff(self):
        cmd = build_git_command("diff", {"staged": True})
        assert "--cached" in cmd

    def test_diff_with_target(self):
        cmd = build_git_command("diff", {"target": "HEAD~3"})
        assert "HEAD~3" in cmd

    def test_diff_with_context(self):
        cmd = build_git_command("diff", {"context": 5})
        assert "-U5" in cmd

    def test_diff_negative_context_ignored(self):
        cmd = build_git_command("diff", {"context": -1})
        assert "-U" not in cmd

    def test_diff_non_numeric_context_ignored(self):
        cmd = build_git_command("diff", {"context": "abc"})
        assert "-U" not in cmd

    def test_diff_custom_repo(self):
        cmd = build_git_command("diff", {"repo": "/opt/app"})
        assert "/opt/app" in cmd


# ---------------------------------------------------------------------------
# Branch
# ---------------------------------------------------------------------------

class TestBuildBranch:
    def test_list_branches_default(self):
        cmd = build_git_command("branch", {})
        assert "branch -a --no-color" in cmd

    def test_list_branches_explicit(self):
        cmd = build_git_command("branch", {"list": True})
        assert "branch -a --no-color" in cmd

    def test_create_branch(self):
        cmd = build_git_command("branch", {"name": "feature-x"})
        assert "branch" in cmd
        assert "feature-x" in cmd
        assert "-a" not in cmd

    def test_delete_branch(self):
        cmd = build_git_command("branch", {"name": "old-branch", "delete": True})
        assert "-d" in cmd
        assert "old-branch" in cmd

    def test_delete_without_name_lists(self):
        cmd = build_git_command("branch", {"delete": True})
        assert "branch -a --no-color" in cmd


# ---------------------------------------------------------------------------
# Commit
# ---------------------------------------------------------------------------

class TestBuildCommit:
    def test_basic_commit(self):
        cmd = build_git_command("commit", {"message": "fix: typo"})
        assert "commit -m" in cmd
        tokens = shlex.split(cmd)
        assert "fix: typo" in tokens

    def test_commit_requires_message(self):
        with pytest.raises(ValueError, match="commit requires 'message'"):
            build_git_command("commit", {})

    def test_commit_empty_message(self):
        with pytest.raises(ValueError, match="commit requires 'message'"):
            build_git_command("commit", {"message": ""})

    def test_commit_add_all(self):
        cmd = build_git_command("commit", {"message": "update", "add_all": True})
        assert "add -A" in cmd
        assert " && " in cmd

    def test_commit_with_files(self):
        cmd = build_git_command("commit", {
            "message": "add new",
            "files": ["a.py", "b.py"],
        })
        assert "add" in cmd
        assert "a.py" in cmd
        assert "b.py" in cmd

    def test_commit_files_as_string(self):
        cmd = build_git_command("commit", {
            "message": "single",
            "files": "readme.md",
        })
        assert "add" in cmd
        assert "readme.md" in cmd

    def test_commit_custom_repo(self):
        cmd = build_git_command("commit", {
            "message": "init",
            "repo": "/opt/proj",
        })
        assert "/opt/proj" in cmd


# ---------------------------------------------------------------------------
# Push (with freshness check)
# ---------------------------------------------------------------------------

class TestBuildPush:
    def test_push_returns_two_commands(self):
        cmds = build_git_command("push", {})
        assert isinstance(cmds, list)
        assert len(cmds) == 2

    def test_freshness_check_fetches_first(self):
        cmds = build_git_command("push", {})
        assert "fetch" in cmds[0]

    def test_freshness_check_compares_revisions(self):
        cmds = build_git_command("push", {})
        assert "rev-parse HEAD" in cmds[0]
        assert "merge-base" in cmds[0]

    def test_freshness_outputs_fresh_or_stale(self):
        cmds = build_git_command("push", {})
        assert "FRESH:" in cmds[0]
        assert "STALE:" in cmds[0]

    def test_push_default_remote(self):
        cmds = build_git_command("push", {})
        assert "origin" in cmds[1]

    def test_push_custom_remote(self):
        cmds = build_git_command("push", {"remote": "upstream"})
        assert "upstream" in cmds[1]

    def test_push_with_branch(self):
        cmds = build_git_command("push", {"branch": "main"})
        assert "main" in cmds[1]

    def test_push_force_uses_lease(self):
        cmds = build_git_command("push", {"force": True})
        assert "--force-with-lease" in cmds[1]
        stripped = cmds[1].replace("--force-with-lease", "")
        assert "--force" not in stripped

    def test_push_set_upstream(self):
        cmds = build_git_command("push", {"set_upstream": True})
        assert "--set-upstream" in cmds[1]


# ---------------------------------------------------------------------------
# Log
# ---------------------------------------------------------------------------

class TestBuildLog:
    def test_default_log(self):
        cmd = build_git_command("log", {})
        assert "-20" in cmd
        assert "--oneline" in cmd

    def test_custom_count(self):
        cmd = build_git_command("log", {"count": 10})
        assert "-10" in cmd

    def test_max_count_capped(self):
        cmd = build_git_command("log", {"count": 100})
        assert "-50" in cmd

    def test_zero_count_uses_default(self):
        cmd = build_git_command("log", {"count": 0})
        assert "-20" in cmd

    def test_negative_count_uses_default(self):
        cmd = build_git_command("log", {"count": -5})
        assert "-20" in cmd

    def test_non_numeric_count_uses_default(self):
        cmd = build_git_command("log", {"count": "abc"})
        assert "-20" in cmd

    def test_verbose_format(self):
        cmd = build_git_command("log", {"oneline": False})
        assert "--format=%h %s (%an, %ar)" in cmd
        assert "--oneline" not in cmd

    def test_log_with_branch(self):
        cmd = build_git_command("log", {"branch": "develop"})
        assert "develop" in cmd


# ---------------------------------------------------------------------------
# Pull
# ---------------------------------------------------------------------------

class TestBuildPull:
    def test_default_pull(self):
        cmd = build_git_command("pull", {})
        assert "git -C" in cmd
        assert "pull" in cmd
        assert "origin" in cmd

    def test_pull_with_rebase(self):
        cmd = build_git_command("pull", {"rebase": True})
        assert "--rebase" in cmd

    def test_pull_custom_remote_and_branch(self):
        cmd = build_git_command("pull", {"remote": "upstream", "branch": "main"})
        assert "upstream" in cmd
        assert "main" in cmd


# ---------------------------------------------------------------------------
# Checkout
# ---------------------------------------------------------------------------

class TestBuildCheckout:
    def test_checkout_branch(self):
        cmd = build_git_command("checkout", {"target": "develop"})
        assert "checkout" in cmd
        assert "develop" in cmd

    def test_checkout_create(self):
        cmd = build_git_command("checkout", {"target": "new-feat", "create": True})
        assert "-b" in cmd
        assert "new-feat" in cmd

    def test_checkout_requires_target(self):
        with pytest.raises(ValueError, match="checkout requires 'target'"):
            build_git_command("checkout", {})

    def test_checkout_empty_target(self):
        with pytest.raises(ValueError, match="checkout requires 'target'"):
            build_git_command("checkout", {"target": ""})


# ---------------------------------------------------------------------------
# Fetch
# ---------------------------------------------------------------------------

class TestBuildFetch:
    def test_default_fetch(self):
        cmd = build_git_command("fetch", {})
        assert "git -C" in cmd
        assert "fetch" in cmd
        assert "origin" in cmd

    def test_fetch_with_prune(self):
        cmd = build_git_command("fetch", {"prune": True})
        assert "--prune" in cmd

    def test_fetch_custom_remote(self):
        cmd = build_git_command("fetch", {"remote": "upstream"})
        assert "upstream" in cmd


# ---------------------------------------------------------------------------
# Stash
# ---------------------------------------------------------------------------

class TestBuildStash:
    def test_default_stash_push(self):
        cmd = build_git_command("stash", {})
        assert "stash push" in cmd

    def test_stash_pop(self):
        cmd = build_git_command("stash", {"subaction": "pop"})
        assert "stash pop" in cmd

    def test_stash_list(self):
        cmd = build_git_command("stash", {"subaction": "list"})
        assert "stash list" in cmd

    def test_stash_apply(self):
        cmd = build_git_command("stash", {"subaction": "apply"})
        assert "stash apply" in cmd

    def test_stash_drop(self):
        cmd = build_git_command("stash", {"subaction": "drop"})
        assert "stash drop" in cmd

    def test_stash_push_with_message(self):
        cmd = build_git_command("stash", {"subaction": "push", "message": "wip"})
        assert "-m" in cmd
        assert "wip" in cmd

    def test_stash_invalid_subaction(self):
        with pytest.raises(ValueError, match="stash subaction"):
            build_git_command("stash", {"subaction": "clear"})


# ---------------------------------------------------------------------------
# Shell injection safety
# ---------------------------------------------------------------------------

class TestShellInjectionSafety:
    def test_clone_url_with_injection_quoted(self):
        cmd = build_git_command("clone", {"url": "https://x.com/r.git; rm -rf /"})
        tokens = shlex.split(cmd)
        assert "https://x.com/r.git; rm -rf /" in tokens

    def test_commit_message_with_injection_quoted(self):
        cmd = build_git_command("commit", {"message": "msg'; drop table users; --"})
        tokens = shlex.split(cmd)
        assert "msg'; drop table users; --" in tokens

    def test_checkout_target_quoted(self):
        cmd = build_git_command("checkout", {"target": "branch; cat /etc/passwd"})
        tokens = shlex.split(cmd)
        assert "branch; cat /etc/passwd" in tokens

    def test_repo_path_with_spaces_quoted(self):
        cmd = build_git_command("status", {"repo": "/opt/my repo with spaces"})
        tokens = shlex.split(cmd)
        assert "/opt/my repo with spaces" in tokens

    def test_branch_name_with_injection_quoted(self):
        cmd = build_git_command("branch", {"name": "feat$(whoami)"})
        tokens = shlex.split(cmd)
        assert "feat$(whoami)" in tokens


# ---------------------------------------------------------------------------
# ToolExecutor handler — _handle_git_ops
# ---------------------------------------------------------------------------

class TestHandleGitOps:
    def _make_executor(self, hosts=None):
        hosts = hosts or {"myserver": ToolHost(address="10.0.0.1")}
        config = ToolsConfig(hosts=hosts)
        return ToolExecutor(config=config)

    async def test_unknown_host(self):
        exe = self._make_executor()
        result = await exe.execute("git_ops", {
            "host": "nonexistent",
            "action": "status",
        })
        assert "Unknown or disallowed host" in str(result)

    async def test_unknown_action(self):
        exe = self._make_executor()
        result = await exe.execute("git_ops", {
            "host": "myserver",
            "action": "rebase",
        })
        assert "Unknown git action" in str(result)

    async def test_missing_action(self):
        exe = self._make_executor()
        result = await exe.execute("git_ops", {
            "host": "myserver",
            "action": "",
        })
        assert "Unknown git action" in str(result)

    @patch("src.tools.executor.ToolExecutor._exec_command")
    async def test_status_dispatches(self, mock_exec):
        mock_exec.return_value = (0, "## main\n M file.py\n")
        exe = self._make_executor()
        result = await exe.execute("git_ops", {
            "host": "myserver",
            "action": "status",
        })
        mock_exec.assert_called_once()
        cmd = mock_exec.call_args[0][1]
        assert "git" in cmd
        assert "status" in cmd
        assert "## main" in str(result)

    @patch("src.tools.executor.ToolExecutor._exec_command")
    async def test_clone_dispatches(self, mock_exec):
        mock_exec.return_value = (0, "Cloning into 'repo'...\n")
        exe = self._make_executor()
        result = await exe.execute("git_ops", {
            "host": "myserver",
            "action": "clone",
            "params": {"url": "https://github.com/user/repo.git"},
        })
        assert "Cloning" in str(result)

    @patch("src.tools.executor.ToolExecutor._exec_command")
    async def test_diff_dispatches(self, mock_exec):
        mock_exec.return_value = (0, "diff --git a/f.py b/f.py\n")
        exe = self._make_executor()
        result = await exe.execute("git_ops", {
            "host": "myserver",
            "action": "diff",
            "params": {"staged": True},
        })
        assert "diff" in str(result)

    @patch("src.tools.executor.ToolExecutor._exec_command")
    async def test_commit_dispatches(self, mock_exec):
        mock_exec.return_value = (0, "[main abc1234] fix typo\n")
        exe = self._make_executor()
        result = await exe.execute("git_ops", {
            "host": "myserver",
            "action": "commit",
            "params": {"message": "fix typo", "add_all": True},
        })
        assert "abc1234" in str(result)

    @patch("src.tools.executor.ToolExecutor._exec_command")
    async def test_log_dispatches(self, mock_exec):
        mock_exec.return_value = (0, "abc1234 first commit\ndef5678 second\n")
        exe = self._make_executor()
        result = await exe.execute("git_ops", {
            "host": "myserver",
            "action": "log",
            "params": {"count": 5},
        })
        assert "abc1234" in str(result)

    @patch("src.tools.executor.ToolExecutor._exec_command")
    async def test_branch_list_dispatches(self, mock_exec):
        mock_exec.return_value = (0, "* main\n  develop\n")
        exe = self._make_executor()
        result = await exe.execute("git_ops", {
            "host": "myserver",
            "action": "branch",
        })
        assert "main" in str(result)

    @patch("src.tools.executor.ToolExecutor._exec_command")
    async def test_checkout_dispatches(self, mock_exec):
        mock_exec.return_value = (0, "Switched to branch 'develop'\n")
        exe = self._make_executor()
        result = await exe.execute("git_ops", {
            "host": "myserver",
            "action": "checkout",
            "params": {"target": "develop"},
        })
        assert "Switched" in str(result)

    @patch("src.tools.executor.ToolExecutor._exec_command")
    async def test_fetch_dispatches(self, mock_exec):
        mock_exec.return_value = (0, "")
        exe = self._make_executor()
        result = await exe.execute("git_ops", {
            "host": "myserver",
            "action": "fetch",
        })
        assert "completed successfully" in str(result)

    @patch("src.tools.executor.ToolExecutor._exec_command")
    async def test_pull_dispatches(self, mock_exec):
        mock_exec.return_value = (0, "Already up to date.\n")
        exe = self._make_executor()
        result = await exe.execute("git_ops", {
            "host": "myserver",
            "action": "pull",
        })
        assert "Already up to date" in str(result)

    @patch("src.tools.executor.ToolExecutor._exec_command")
    async def test_stash_dispatches(self, mock_exec):
        mock_exec.return_value = (0, "Saved working directory\n")
        exe = self._make_executor()
        result = await exe.execute("git_ops", {
            "host": "myserver",
            "action": "stash",
        })
        assert "Saved" in str(result)

    @patch("src.tools.executor.ToolExecutor._exec_command")
    async def test_command_failure_returns_error(self, mock_exec):
        mock_exec.return_value = (128, "fatal: not a git repository\n")
        exe = self._make_executor()
        result = await exe.execute("git_ops", {
            "host": "myserver",
            "action": "status",
        })
        assert "failed" in str(result)
        assert "128" in str(result)

    async def test_validation_error_returns_message(self):
        exe = self._make_executor()
        result = await exe.execute("git_ops", {
            "host": "myserver",
            "action": "clone",
            "params": {},
        })
        assert "git_ops error" in str(result)
        assert "url" in str(result).lower()

    @patch("src.tools.executor.ToolExecutor._exec_command")
    async def test_empty_output_shows_success(self, mock_exec):
        mock_exec.return_value = (0, "")
        exe = self._make_executor()
        result = await exe.execute("git_ops", {
            "host": "myserver",
            "action": "fetch",
        })
        assert "completed successfully" in str(result)

    @patch("src.tools.executor.ToolExecutor._exec_command")
    async def test_no_params_defaults_to_empty(self, mock_exec):
        mock_exec.return_value = (0, "## main\n")
        exe = self._make_executor()
        result = await exe.execute("git_ops", {
            "host": "myserver",
            "action": "status",
        })
        assert "main" in str(result)


# ---------------------------------------------------------------------------
# Push freshness check flow
# ---------------------------------------------------------------------------

class TestPushFreshnessCheck:
    def _make_executor(self):
        hosts = {"myserver": ToolHost(address="10.0.0.1")}
        config = ToolsConfig(hosts=hosts)
        return ToolExecutor(config=config)

    @patch("src.tools.executor.ToolExecutor._exec_command")
    async def test_push_fresh_ahead_succeeds(self, mock_exec):
        mock_exec.side_effect = [
            (0, "FRESH:ahead"),
            (0, "Everything up-to-date\n"),
        ]
        exe = self._make_executor()
        result = await exe.execute("git_ops", {
            "host": "myserver",
            "action": "push",
        })
        assert mock_exec.call_count == 2
        assert "blocked" not in str(result).lower()

    @patch("src.tools.executor.ToolExecutor._exec_command")
    async def test_push_fresh_up_to_date_succeeds(self, mock_exec):
        mock_exec.side_effect = [
            (0, "FRESH:up_to_date"),
            (0, "Everything up-to-date\n"),
        ]
        exe = self._make_executor()
        result = await exe.execute("git_ops", {
            "host": "myserver",
            "action": "push",
        })
        assert mock_exec.call_count == 2

    @patch("src.tools.executor.ToolExecutor._exec_command")
    async def test_push_fresh_no_remote_succeeds(self, mock_exec):
        mock_exec.side_effect = [
            (0, "FRESH:no_remote_tracking"),
            (0, "new branch\n"),
        ]
        exe = self._make_executor()
        result = await exe.execute("git_ops", {
            "host": "myserver",
            "action": "push",
            "params": {"set_upstream": True},
        })
        assert mock_exec.call_count == 2

    @patch("src.tools.executor.ToolExecutor._exec_command")
    async def test_push_stale_blocked(self, mock_exec):
        mock_exec.return_value = (0, "STALE:local_behind_remote — pull or rebase first")
        exe = self._make_executor()
        result = await exe.execute("git_ops", {
            "host": "myserver",
            "action": "push",
        })
        assert "blocked" in str(result).lower()
        assert "pull or rebase" in str(result)
        assert mock_exec.call_count == 1

    @patch("src.tools.executor.ToolExecutor._exec_command")
    async def test_push_fetch_fails(self, mock_exec):
        mock_exec.return_value = (128, "fatal: could not read from remote")
        exe = self._make_executor()
        result = await exe.execute("git_ops", {
            "host": "myserver",
            "action": "push",
        })
        assert "freshness check failed" in str(result).lower()
        assert mock_exec.call_count == 1

    @patch("src.tools.executor.ToolExecutor._exec_command")
    async def test_push_command_fails(self, mock_exec):
        mock_exec.side_effect = [
            (0, "FRESH:ahead"),
            (1, "error: failed to push some refs"),
        ]
        exe = self._make_executor()
        result = await exe.execute("git_ops", {
            "host": "myserver",
            "action": "push",
        })
        assert "push failed" in str(result).lower()
        assert mock_exec.call_count == 2

    @patch("src.tools.executor.ToolExecutor._exec_command")
    async def test_push_empty_output_shows_success(self, mock_exec):
        mock_exec.side_effect = [
            (0, "FRESH:ahead"),
            (0, ""),
        ]
        exe = self._make_executor()
        result = await exe.execute("git_ops", {
            "host": "myserver",
            "action": "push",
        })
        assert "completed successfully" in str(result).lower()

    @patch("src.tools.executor.ToolExecutor._exec_command")
    async def test_push_force_still_checks_freshness(self, mock_exec):
        mock_exec.side_effect = [
            (0, "STALE:local_behind_remote — pull or rebase first"),
        ]
        exe = self._make_executor()
        result = await exe.execute("git_ops", {
            "host": "myserver",
            "action": "push",
            "params": {"force": True},
        })
        assert "blocked" in str(result).lower()


# ---------------------------------------------------------------------------
# Force push safety
# ---------------------------------------------------------------------------

class TestForcePushSafety:
    def test_force_uses_lease_not_bare(self):
        cmds = build_git_command("push", {"force": True})
        push_cmd = cmds[1]
        assert "--force-with-lease" in push_cmd
        stripped = push_cmd.replace("--force-with-lease", "")
        assert "--force" not in stripped

    def test_no_force_no_flag(self):
        cmds = build_git_command("push", {})
        assert "--force" not in cmds[1]


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------

class TestEdgeCases:
    def test_all_actions_have_builders(self):
        for action in ALLOWED_ACTIONS:
            try:
                build_git_command(action, {"url": "https://x.com/r.git",
                                           "message": "test",
                                           "target": "main"})
            except ValueError:
                pass

    def test_clone_dest_with_spaces(self):
        cmd = build_git_command("clone", {"url": "https://x.com/r.git", "dest": "/opt/my project"})
        tokens = shlex.split(cmd)
        assert "/opt/my project" in tokens

    def test_commit_message_with_quotes(self):
        cmd = build_git_command("commit", {"message": "fix: can't stop won't stop"})
        assert "commit -m" in cmd
        tokens = shlex.split(cmd)
        assert "fix: can't stop won't stop" in tokens

    @patch("src.tools.executor.ToolExecutor._exec_command")
    async def test_handler_uses_correct_ssh_user(self, mock_exec):
        mock_exec.return_value = (0, "ok")
        hosts = {"myserver": ToolHost(address="10.0.0.1", ssh_user="deploy")}
        config = ToolsConfig(hosts=hosts)
        exe = ToolExecutor(config=config)
        await exe.execute("git_ops", {
            "host": "myserver",
            "action": "status",
        })
        args = mock_exec.call_args[0]
        assert args[0] == "10.0.0.1"
        assert args[2] == "deploy"

    @patch("src.tools.executor.ToolExecutor._exec_command")
    async def test_handler_passes_repo_param(self, mock_exec):
        mock_exec.return_value = (0, "## main\n")
        hosts = {"myserver": ToolHost(address="10.0.0.1")}
        config = ToolsConfig(hosts=hosts)
        exe = ToolExecutor(config=config)
        await exe.execute("git_ops", {
            "host": "myserver",
            "action": "status",
            "params": {"repo": "/opt/myrepo"},
        })
        cmd = mock_exec.call_args[0][1]
        assert "/opt/myrepo" in cmd

    @patch("src.tools.executor.ToolExecutor._exec_command")
    async def test_metrics_tracked(self, mock_exec):
        mock_exec.return_value = (0, "ok")
        exe = self._make_executor()
        await exe.execute("git_ops", {
            "host": "myserver",
            "action": "status",
        })
        metrics = exe.get_metrics()
        assert "git_ops" in metrics
        assert metrics["git_ops"]["calls"] == 1

    @patch("src.tools.executor.ToolExecutor._exec_command")
    async def test_timeout_tracked(self, mock_exec):
        async def slow(*a, **kw):
            import asyncio
            await asyncio.sleep(999)
        mock_exec.side_effect = slow
        hosts = {"myserver": ToolHost(address="10.0.0.1")}
        config = ToolsConfig(hosts=hosts, command_timeout_seconds=1,
                             tool_timeouts={"git_ops": 1})
        exe = ToolExecutor(config=config)
        result = await exe.execute("git_ops", {
            "host": "myserver",
            "action": "status",
        })
        assert "timed out" in str(result)
        metrics = exe.get_metrics()
        assert metrics["git_ops"]["timeouts"] == 1

    def _make_executor(self):
        hosts = {"myserver": ToolHost(address="10.0.0.1")}
        config = ToolsConfig(hosts=hosts)
        return ToolExecutor(config=config)
