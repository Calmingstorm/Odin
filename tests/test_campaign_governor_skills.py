"""Campaign regressions using real managers/executors and inert transports."""
from __future__ import annotations

import inspect
import json
from email.message import Message
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from src.config.schema import ToolsConfig
from src.tools.executor import ToolExecutor
from src.tools.output_authorization import request_scope_authorizer, request_tool_scope
from src.tools.risk_classifier import CommandGovernor, RiskLevel, classify_command
from src.tools.skill_context import SKILL_SAFE_TOOLS, SkillContext
from src.tools.skill_manager import SkillManager, SkillStatus


class Permissions:
    def __init__(self, tier="admin"):
        self.tier = tier

    def get_tier(self, user):
        return self.tier

    def allowed_tool_names(self, user):
        return None if self.tier == "admin" else set()


def executor(tmp_path, permissions=None):
    config = ToolsConfig(hosts={"lab": {"address": "127.0.0.1", "ssh_user": "root"}},
                         default_host="lab", audit_log_path=str(tmp_path / "audit.jsonl"))
    ex = ToolExecutor(config, permission_manager=permissions)
    ex._exec_command = AsyncMock(return_value=(0, "transport output"))
    return ex


def skill_code(name="demo", result="ok"):
    definition = {"name": name, "description": "demo", "input_schema": {
        "type": "object", "properties": {}}}
    return (f"SKILL_DEFINITION = {definition!r}\n"
            f"async def execute(inp, context):\n    return {result!r}\n")


def manager(tmp_path):
    return SkillManager(str(tmp_path / "skills"), AsyncMock())


async def test_disabled_edit_keeps_ledger_catalog_and_dispatch(tmp_path):
    mgr = manager(tmp_path)
    mgr.create_skill("demo", skill_code())
    mgr.disable_skill("demo")
    assert "updated" in mgr.edit_skill("demo", skill_code(result="new"))
    assert mgr._skills["demo"].status == SkillStatus.DISABLED
    assert json.loads(mgr._disabled_path.read_text()) == ["demo"]
    assert mgr.get_tool_definitions() == []
    assert "disabled" in await mgr.execute("demo", {})
    assert not manager(tmp_path).is_enabled("demo")


@pytest.mark.parametrize("enabled", [True, False])
def test_failed_activation_persistence_does_not_publish(tmp_path, monkeypatch, enabled):
    mgr = manager(tmp_path)
    mgr.create_skill("demo", skill_code())
    if not enabled:
        mgr.disable_skill("demo")
    old_status = mgr._skills["demo"].status
    old_disabled = mgr._disabled.copy()
    old_catalog = mgr.get_tool_definitions()
    def fail(*args):
        raise PermissionError("storage refused")
    monkeypatch.setattr("src.tools.skill_manager.os.replace", fail)
    with pytest.raises(PermissionError):
        (mgr.disable_skill if enabled else mgr.enable_skill)("demo")
    assert mgr._skills["demo"].status == old_status
    assert mgr._disabled == old_disabled
    assert mgr.get_tool_definitions() == old_catalog
    assert manager(tmp_path).is_enabled("demo") == enabled


def test_loaded_artifact_identity_survives_edit_rollback_delete_restart(tmp_path):
    mgr = manager(tmp_path)
    artifact = mgr.skills_dir / "custom_filename.py"
    artifact.write_text(skill_code())
    mgr = manager(tmp_path)
    assert "updated" in mgr.edit_skill("demo", skill_code(result="new"))
    assert not (mgr.skills_dir / "demo.py").exists()
    assert "Reverted" in mgr.edit_skill("demo", skill_code(name="other"))
    assert artifact.read_text() == skill_code(result="new")
    assert manager(tmp_path)._skills["demo"].file_path == artifact
    assert "deleted" in mgr.delete_skill("demo")
    assert not artifact.exists()
    assert not manager(tmp_path).has_skill("demo")


@pytest.mark.parametrize("denial", ["scope", "live_scope", "disabled", "demoted", "strict",
                                  "host", "host_access"])
async def test_real_executor_skill_shell_helper_preserves_admission(tmp_path, denial):
    permissions = Permissions()
    ex = executor(tmp_path, permissions)
    ctx = SkillContext(ex, "demo", requester_id="admin")
    scope = request_tool_scope.set({"demo"} if denial == "scope" else None)
    live = request_scope_authorizer.set((lambda: {"demo"}) if denial == "live_scope" else None)
    command = "systemctl restart example.service" if denial == "strict" else "printf safe"
    alias = "missing" if denial == "host" else "lab"
    if denial == "demoted":
        permissions.tier = "guest"
    if denial == "disabled":
        ex.set_builtin_policy(SimpleNamespace(is_disabled=lambda tool: tool == "run_command"))
    if denial == "strict":
        ex.command_governor = CommandGovernor(host_overrides={"lab": "strict"})
    if denial == "host_access":
        ex._host_access = SimpleNamespace(is_host_allowed=lambda user, host: False)
    try:
        output = await ctx.run_on_host(alias, command)
        assert "output" not in output
        ex._exec_command.assert_not_awaited()
    finally:
        request_scope_authorizer.reset(live)
        request_tool_scope.reset(scope)


async def test_skill_shell_helper_preserves_admin_override_and_generation_lease(tmp_path):
    ex = executor(tmp_path, Permissions())
    ctx = SkillContext(ex, "demo", requester_id="admin")
    from src.tools.executor import _host_lease_ctx

    async def inert_transport(*args, **kwargs):
        lease = _host_lease_ctx.get()
        assert lease is not None and not lease.revoked
        assert lease.target.alias == "lab"
        return 0, "transport output"

    ex._exec_command = AsyncMock(side_effect=inert_transport)
    output = await ctx.run_on_host("lab", "reboot")
    # Inert transport proves the configured override is unchanged, no reboot.
    assert "transport output" in output
    ex._exec_command.assert_awaited_once()
    assert ex._exec_command.call_args.kwargs["use_workspace"] is True
    ex._exec_command.reset_mock()
    ex.command_governor = CommandGovernor(admin_can_override=False)
    assert "Blocked" in await ctx.run_on_host("lab", "reboot")
    ex._exec_command.assert_not_awaited()


@pytest.mark.parametrize("scope_kind", ["snapshot", "live"])
async def test_manager_selected_skill_scope_and_revocation(tmp_path, scope_kind):
    mgr = manager(tmp_path)
    mgr.create_skill("demo", skill_code())
    execute_fn = AsyncMock(return_value="executed")
    mgr._skills["demo"].execute_fn = execute_fn
    var = request_tool_scope if scope_kind == "snapshot" else request_scope_authorizer
    scope = {"invoke_skill"}
    token = var.set(scope if scope_kind == "snapshot" else lambda: scope)
    try:
        assert "Permission denied" in await mgr.execute("demo", {}, requester_id="admin")
        execute_fn.assert_not_awaited()
        scope.add("demo")
        assert await mgr.execute("demo", {}, requester_id="admin") == "executed"
        scope.remove("demo")
        assert "Permission denied" in await mgr.execute("demo", {}, requester_id="admin")
        assert execute_fn.await_count == 1
    finally:
        var.reset(token)


async def test_manager_selected_skill_rbac_demoted_requester(tmp_path):
    ex = executor(tmp_path, Permissions("guest"))
    mgr = SkillManager(str(tmp_path / "skills"), ex)
    mgr.create_skill("demo", skill_code())
    execute_fn = AsyncMock(return_value="executed")
    mgr._skills["demo"].execute_fn = execute_fn
    assert "Permission denied" in await mgr.execute("demo", {}, requester_id="admin")
    execute_fn.assert_not_awaited()


async def test_native_invoke_checks_selected_skill_before_manager(tmp_path):
    from src.discord.native_tools.registry import NativeToolDispatcher
    mgr = manager(tmp_path)
    mgr.create_skill("demo", skill_code())
    mgr.execute = AsyncMock(return_value="executed")
    dispatcher = NativeToolDispatcher(owners={}, skill_manager=mgr,
        tool_catalog=SimpleNamespace(), prompt_builder=SimpleNamespace(),
        channel_state=SimpleNamespace(pending_files={}))
    token = request_tool_scope.set({"invoke_skill"})
    try:
        result, _ = await dispatcher.dispatch("invoke_skill", {"name": "demo"},
            message=SimpleNamespace(channel=SimpleNamespace(id=1)), user_id="admin",
            skill_file_delivery="stage")
        assert not result.ok
        assert result.error == "permission_denied"
        mgr.execute.assert_not_awaited()
    finally:
        request_tool_scope.reset(token)


async def test_legacy_deferred_invoke_checks_selected_skill(tmp_path):
    from src.discord.background_task import _execute_tool_captured

    mgr = manager(tmp_path)
    mgr.create_skill("demo", skill_code())
    mgr.execute = AsyncMock(return_value="executed")
    token = request_tool_scope.set({"invoke_skill"})
    try:
        result = await _execute_tool_captured("invoke_skill", {"name": "demo"},
            executor(tmp_path), mgr, None, None, "admin", requester_id="admin")
        assert not result.ok
        assert result.error == "permission_denied"
        mgr.execute.assert_not_awaited()
    finally:
        request_tool_scope.reset(token)


@pytest.mark.parametrize("explicit_host", [True, False])
async def test_validation_carries_effective_host_and_tier(tmp_path, explicit_host):
    ex = executor(tmp_path, Permissions())
    ex.command_governor = CommandGovernor(host_overrides={"lab": "strict"})
    check = {"type": "command", "target": "systemctl restart example.service"}
    if explicit_host:
        check["host"] = "lab"
    result = await ex.execute("validate_action", {"checks": [check]}, user_id="admin")
    assert "strict-mode" in str(result)
    ex._exec_command.assert_not_awaited()
    ex.command_governor = CommandGovernor()
    result = await ex.execute("validate_action", {"checks": [dict(check, target="reboot")]},
                              user_id="admin")
    ex._exec_command.assert_awaited_once()
    assert "governor-blocked" not in str(result)


@pytest.mark.parametrize("options", ["--user", "--no-block", "--user --no-block",
    "--host lab", "--machine=box", "--root /tmp", "-q --system", "-Hlab", "--"])
def test_systemctl_global_options_cannot_hide_lifecycle(options):
    command = f"systemctl {options} restart example.service"
    assert classify_command(command).level == RiskLevel.HIGH
    assert not CommandGovernor(host_overrides={"lab": "strict"}).check(command, host="lab").allowed
    assert classify_command(f"systemctl {options} reload example.service").level == RiskLevel.MEDIUM
    assert classify_command(f"systemctl {options} status example.service").level == RiskLevel.LOW


@pytest.mark.parametrize("command", ["systemctl --user restart; printf safe",
    "printf safe && systemctl --no-block restart example.service",
    "systemctl --user reload example.service; systemctl --system stop other.service"])
def test_systemctl_option_scan_preserves_shell_boundaries_and_highest_risk(command):
    assert classify_command(command).level == RiskLevel.HIGH


@pytest.mark.parametrize("name", ["browser_screenshot", "list_knowledge", "list_schedules",
    "list_skills", "list_tasks", "parse_time", "search_audit", "search_history",
    "search_knowledge"])
async def test_native_only_names_are_not_advertised_by_generic_skill_api(tmp_path, name):
    ex = executor(tmp_path)
    ctx = SkillContext(ex, "demo", requester_id="admin")
    assert name not in SKILL_SAFE_TOOLS
    assert "not allowed" in await ctx.execute_tool(name)
    ex._exec_command.assert_not_awaited()


def test_all_allowed_skill_generic_tools_resolve(tmp_path):
    ex = executor(tmp_path)
    assert all(ex._resolve_handler(tool) is not None for tool in SKILL_SAFE_TOOLS)


def test_create_skill_description_matches_method_kinds():
    from src.tools.registry import TOOLS
    description = next(t["description"] for t in TOOLS if t["name"] == "create_skill")
    async_part, sync_part = description.split("SkillContext synchronous methods")
    for name in ["run_on_host", "read_file", "execute_tool", "http_get", "http_post",
                 "post_message", "post_file", "search_knowledge", "ingest_document",
                 "search_history", "schedule_task"]:
        assert inspect.iscoroutinefunction(getattr(SkillContext, name))
        assert name + "(" in async_part
    for name in ["remember", "recall", "get_hosts", "log"]:
        assert not inspect.iscoroutinefunction(getattr(SkillContext, name))
        assert name + "(" in sync_part


@pytest.mark.parametrize("spec", ["requests>=2,<3", "demo[feature]>=1.2,!=1.3,<2",
    "demo==1.*", "demo~=1.2", "requests >=2, <3"])
def test_compound_requirements_are_safe(spec):
    from src.tools.skill_manager import is_safe_dependency_spec
    assert is_safe_dependency_spec(spec)


@pytest.mark.parametrize("spec", ["demo[]garbage", "demo>=", "demo>=1,,<2",
    "demo @ https://example.com/archive.whl", "demo; python_version > '3'",
    "demo\n--index-url=https://example.com", "demo>=1 --extra-index-url=example.com"])
def test_requirement_parser_preserves_index_only_safety(spec):
    from src.tools.skill_manager import is_safe_dependency_spec

    assert not is_safe_dependency_spec(spec)


def fake_distribution(version="1.5", extras=(), requires=()):
    metadata = Message()
    for extra in extras:
        metadata["Provides-Extra"] = extra
    return SimpleNamespace(version=version, metadata=metadata, requires=list(requires))


def test_dependencies_check_versions_and_extra_dependencies(tmp_path, monkeypatch):
    from importlib.metadata import PackageNotFoundError

    from src.tools import skill_manager as sm
    installed = {"demo": fake_distribution(extras=["feature"],
                 requires=['child>=2; extra == "feature"']),
                 "child": fake_distribution("1")}
    def distribution(name):
        if name not in installed:
            raise PackageNotFoundError(name)
        return installed[name]
    monkeypatch.setattr(sm, "distribution", distribution)
    assert sm._is_package_installed("demo>=1,<2")
    assert not sm._is_package_installed("demo==2")
    assert not sm._is_package_installed("demo>=999")
    assert not sm._is_package_installed("demo[missing]")
    assert not sm._is_package_installed("demo[feature]")
    installed["child"].version = "2"
    assert sm._is_package_installed("demo[feature]")
    installed.pop("child")
    assert not sm._is_package_installed("demo[feature]")
    mgr = manager(tmp_path)
    mgr.create_skill("demo", skill_code())
    mgr._skills["demo"].metadata.dependencies = ["demo>=999", "demo[feature]"]
    assert not mgr.check_dependencies("demo")["all_satisfied"]
    installs = []
    monkeypatch.setattr(sm, "_install_packages", lambda specs: (installs.extend(specs) or True, ""))
    already, newly, diagnostics = sm.resolve_dependencies(["demo>=999", "demo>=1,<2"])
    assert already == ["demo>=1,<2"]
    assert newly == installs == ["demo>=999"]
    assert not any(d.level == "error" for d in diagnostics)


async def test_long_skill_tail_is_retained_before_preview(tmp_path):
    from src.tools.runtime_delivery import deliver_runtime_output, execution_delivery_scope
    mgr = manager(tmp_path)
    tail = "UNIQUE_FULL_TAIL"
    output = "x" * 60000 + tail
    mgr.create_skill("demo", skill_code(result=output))
    ex = executor(tmp_path)
    with execution_delivery_scope("admin", "channel"):
        result = await mgr.execute("demo", {}, requester_id="admin")
        assert result.endswith(tail)
        delivered = deliver_runtime_output(ex, result, tool_name="demo", tool_input={},
            user_id="admin", channel_id="channel", budget=1500)
        envelope = json.loads(delivered)
        snapshot, _ = ex._ensure_output_store().read(envelope["cursor"], owner="admin",
            channel="channel", authorize=lambda tool, hosts: tool == "demo")
        assert snapshot.text == output
        assert snapshot.text.endswith(tail)
        assert not mgr._skills["demo"].last_execution.truncated
    assert "truncated at" in await mgr.execute("demo", {})


async def test_long_skill_retention_quota_failure_is_explicit(tmp_path, monkeypatch):
    from src.tools.output_retention import RetentionError
    from src.tools.runtime_delivery import deliver_runtime_output, execution_delivery_scope

    mgr = manager(tmp_path)
    output = "x" * 60000 + "TAIL"
    mgr.create_skill("demo", skill_code(result=output))
    ex = executor(tmp_path)
    def refuse(*args, **kwargs):
        raise RetentionError("Result exceeds quota")
    monkeypatch.setattr(ex._ensure_output_store(), "retain", refuse)
    with execution_delivery_scope("admin", "channel"):
        full = await mgr.execute("demo", {}, requester_id="admin")
        assert full == output
        delivered = deliver_runtime_output(ex, full, tool_name="demo", tool_input={},
            user_id="admin", channel_id="channel", budget=1500)
        assert "quota" in delivered
        assert "no continuation" in delivered.lower()
