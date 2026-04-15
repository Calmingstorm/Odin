"""Tests for the terraform_ops tool — command builder, registry, and executor handler."""

from __future__ import annotations

import pytest

from src.tools.terraform_ops import (
    ALLOWED_ACTIONS,
    build_terraform_command,
    _chdir_flag,
)


# ---------------------------------------------------------------------------
# Registration
# ---------------------------------------------------------------------------

class TestTerraformRegistration:
    def test_tool_in_registry(self):
        from src.tools.registry import TOOLS
        names = [t["name"] for t in TOOLS]
        assert "terraform_ops" in names

    def test_required_fields(self):
        from src.tools.registry import TOOLS
        tool = next(t for t in TOOLS if t["name"] == "terraform_ops")
        assert "description" in tool
        assert "input_schema" in tool
        assert tool["input_schema"]["required"] == ["host", "action"]

    def test_required_params(self):
        from src.tools.registry import TOOLS
        tool = next(t for t in TOOLS if t["name"] == "terraform_ops")
        props = tool["input_schema"]["properties"]
        assert "host" in props
        assert "action" in props
        assert "params" in props

    def test_enum_matches_allowed_actions(self):
        from src.tools.registry import TOOLS
        tool = next(t for t in TOOLS if t["name"] == "terraform_ops")
        enum_vals = set(tool["input_schema"]["properties"]["action"]["enum"])
        assert enum_vals == ALLOWED_ACTIONS


# ---------------------------------------------------------------------------
# Allowed actions
# ---------------------------------------------------------------------------

class TestTerraformAllowedActions:
    def test_all_expected(self):
        expected = {
            "init", "plan", "apply", "output", "show",
            "validate", "fmt", "state", "workspace", "import",
        }
        assert ALLOWED_ACTIONS == expected

    def test_unknown_raises(self):
        with pytest.raises(ValueError, match="Unknown terraform action"):
            build_terraform_command("deploy", {})

    def test_frozenset_immutable(self):
        with pytest.raises(AttributeError):
            ALLOWED_ACTIONS.add("destroy")


# ---------------------------------------------------------------------------
# Chdir flag
# ---------------------------------------------------------------------------

class TestChdirFlag:
    def test_no_working_dir(self):
        assert _chdir_flag({}) == []

    def test_with_working_dir(self):
        flags = _chdir_flag({"working_dir": "/opt/infra"})
        assert flags == ["-chdir=/opt/infra"]

    def test_working_dir_with_spaces(self):
        flags = _chdir_flag({"working_dir": "/opt/my infra"})
        assert flags == ["-chdir='/opt/my infra'"]


# ---------------------------------------------------------------------------
# init
# ---------------------------------------------------------------------------

class TestBuildInit:
    def test_basic(self):
        cmd = build_terraform_command("init", {})
        assert cmd == "terraform init -input=false"

    def test_upgrade(self):
        cmd = build_terraform_command("init", {"upgrade": True})
        assert "-upgrade" in cmd

    def test_reconfigure(self):
        cmd = build_terraform_command("init", {"reconfigure": True})
        assert "-reconfigure" in cmd

    def test_migrate_state(self):
        cmd = build_terraform_command("init", {"migrate_state": True})
        assert "-migrate-state" in cmd

    def test_backend_config(self):
        cmd = build_terraform_command("init", {
            "backend_config": {"bucket": "my-bucket", "key": "state.tfstate"},
        })
        assert "-backend-config=bucket=my-bucket" in cmd
        assert "-backend-config=key=state.tfstate" in cmd

    def test_working_dir(self):
        cmd = build_terraform_command("init", {"working_dir": "/opt/tf"})
        assert cmd.startswith("terraform -chdir=/opt/tf init")

    def test_input_false_always(self):
        cmd = build_terraform_command("init", {})
        assert "-input=false" in cmd

    def test_backend_config_non_dict_skipped(self):
        cmd = build_terraform_command("init", {"backend_config": "not-a-dict"})
        assert "-backend-config" not in cmd

    def test_full_options(self):
        cmd = build_terraform_command("init", {
            "upgrade": True,
            "reconfigure": True,
            "backend_config": {"region": "us-east-1"},
            "working_dir": "/opt/tf",
        })
        assert "-chdir=/opt/tf" in cmd
        assert "-upgrade" in cmd
        assert "-reconfigure" in cmd
        assert "-backend-config=region=us-east-1" in cmd
        assert "-input=false" in cmd


# ---------------------------------------------------------------------------
# plan
# ---------------------------------------------------------------------------

class TestBuildPlan:
    def test_basic(self):
        cmd = build_terraform_command("plan", {})
        assert cmd == "terraform plan -input=false"

    def test_out(self):
        cmd = build_terraform_command("plan", {"out": "tf.plan"})
        assert "-out=tf.plan" in cmd

    def test_destroy(self):
        cmd = build_terraform_command("plan", {"destroy": True})
        assert "-destroy" in cmd

    def test_var(self):
        cmd = build_terraform_command("plan", {"var": {"env": "prod"}})
        assert "-var=env=prod" in cmd

    def test_var_file(self):
        cmd = build_terraform_command("plan", {"var_file": "prod.tfvars"})
        assert "-var-file=prod.tfvars" in cmd

    def test_target(self):
        cmd = build_terraform_command("plan", {"target": ["aws_instance.web"]})
        assert "-target=aws_instance.web" in cmd

    def test_multiple_targets(self):
        cmd = build_terraform_command("plan", {
            "target": ["aws_instance.web", "aws_s3_bucket.data"],
        })
        assert "-target=aws_instance.web" in cmd
        assert "-target=aws_s3_bucket.data" in cmd

    def test_compact_warnings(self):
        cmd = build_terraform_command("plan", {"compact_warnings": True})
        assert "-compact-warnings" in cmd

    def test_working_dir(self):
        cmd = build_terraform_command("plan", {"working_dir": "/opt/tf"})
        assert cmd.startswith("terraform -chdir=/opt/tf plan")

    def test_input_false_always(self):
        cmd = build_terraform_command("plan", {})
        assert "-input=false" in cmd

    def test_var_non_dict_skipped(self):
        cmd = build_terraform_command("plan", {"var": "not-a-dict"})
        assert "-var=" not in cmd

    def test_target_non_list_skipped(self):
        cmd = build_terraform_command("plan", {"target": "not-a-list"})
        assert "-target=" not in cmd

    def test_full_options(self):
        cmd = build_terraform_command("plan", {
            "destroy": True,
            "out": "destroy.plan",
            "var": {"env": "prod"},
            "var_file": "prod.tfvars",
            "target": ["aws_instance.web"],
            "compact_warnings": True,
            "working_dir": "/opt/tf",
        })
        assert "-chdir=/opt/tf" in cmd
        assert "-destroy" in cmd
        assert "-var=env=prod" in cmd
        assert "-var-file=prod.tfvars" in cmd
        assert "-target=aws_instance.web" in cmd
        assert "-out=destroy.plan" in cmd
        assert "-compact-warnings" in cmd
        assert "-input=false" in cmd


# ---------------------------------------------------------------------------
# apply
# ---------------------------------------------------------------------------

class TestBuildApply:
    def test_basic(self):
        cmd = build_terraform_command("apply", {"plan_file": "tf.plan"})
        assert cmd == "terraform apply -input=false tf.plan"

    def test_requires_plan_file(self):
        with pytest.raises(ValueError, match="apply requires 'plan_file'"):
            build_terraform_command("apply", {})

    def test_empty_plan_file(self):
        with pytest.raises(ValueError, match="apply requires 'plan_file'"):
            build_terraform_command("apply", {"plan_file": ""})

    def test_working_dir(self):
        cmd = build_terraform_command("apply", {
            "plan_file": "tf.plan",
            "working_dir": "/opt/tf",
        })
        assert cmd.startswith("terraform -chdir=/opt/tf apply")
        assert "tf.plan" in cmd

    def test_plan_file_quoted(self):
        cmd = build_terraform_command("apply", {"plan_file": "my plan.tfplan"})
        assert "'my plan.tfplan'" in cmd

    def test_no_auto_approve(self):
        cmd = build_terraform_command("apply", {"plan_file": "tf.plan"})
        assert "-auto-approve" not in cmd

    def test_input_false(self):
        cmd = build_terraform_command("apply", {"plan_file": "tf.plan"})
        assert "-input=false" in cmd


# ---------------------------------------------------------------------------
# output
# ---------------------------------------------------------------------------

class TestBuildOutput:
    def test_basic(self):
        cmd = build_terraform_command("output", {})
        assert cmd == "terraform output"

    def test_name(self):
        cmd = build_terraform_command("output", {"name": "vpc_id"})
        assert cmd == "terraform output vpc_id"

    def test_json(self):
        cmd = build_terraform_command("output", {"json": True})
        assert "-json" in cmd

    def test_name_and_json(self):
        cmd = build_terraform_command("output", {"name": "vpc_id", "json": True})
        assert "-json" in cmd
        assert "vpc_id" in cmd

    def test_working_dir(self):
        cmd = build_terraform_command("output", {"working_dir": "/opt/tf"})
        assert "-chdir=/opt/tf" in cmd


# ---------------------------------------------------------------------------
# show
# ---------------------------------------------------------------------------

class TestBuildShow:
    def test_basic(self):
        cmd = build_terraform_command("show", {})
        assert cmd == "terraform show"

    def test_plan_file(self):
        cmd = build_terraform_command("show", {"plan_file": "tf.plan"})
        assert "tf.plan" in cmd

    def test_json(self):
        cmd = build_terraform_command("show", {"json": True})
        assert "-json" in cmd

    def test_plan_file_and_json(self):
        cmd = build_terraform_command("show", {"plan_file": "tf.plan", "json": True})
        assert "-json" in cmd
        assert "tf.plan" in cmd

    def test_working_dir(self):
        cmd = build_terraform_command("show", {"working_dir": "/opt/tf"})
        assert "-chdir=/opt/tf" in cmd


# ---------------------------------------------------------------------------
# validate
# ---------------------------------------------------------------------------

class TestBuildValidate:
    def test_basic(self):
        cmd = build_terraform_command("validate", {})
        assert cmd == "terraform validate"

    def test_json(self):
        cmd = build_terraform_command("validate", {"json": True})
        assert "-json" in cmd

    def test_working_dir(self):
        cmd = build_terraform_command("validate", {"working_dir": "/opt/tf"})
        assert "-chdir=/opt/tf" in cmd


# ---------------------------------------------------------------------------
# fmt
# ---------------------------------------------------------------------------

class TestBuildFmt:
    def test_basic(self):
        cmd = build_terraform_command("fmt", {})
        assert cmd == "terraform fmt"

    def test_check(self):
        cmd = build_terraform_command("fmt", {"check": True})
        assert "-check" in cmd

    def test_diff(self):
        cmd = build_terraform_command("fmt", {"diff": True})
        assert "-diff" in cmd

    def test_recursive(self):
        cmd = build_terraform_command("fmt", {"recursive": True})
        assert "-recursive" in cmd

    def test_path(self):
        cmd = build_terraform_command("fmt", {"path": "modules/"})
        assert "modules/" in cmd

    def test_full_options(self):
        cmd = build_terraform_command("fmt", {
            "check": True,
            "diff": True,
            "recursive": True,
            "path": "modules/",
            "working_dir": "/opt/tf",
        })
        assert "-chdir=/opt/tf" in cmd
        assert "-check" in cmd
        assert "-diff" in cmd
        assert "-recursive" in cmd
        assert "modules/" in cmd


# ---------------------------------------------------------------------------
# state
# ---------------------------------------------------------------------------

class TestBuildState:
    def test_list_default(self):
        cmd = build_terraform_command("state", {})
        assert cmd == "terraform state list"

    def test_list_with_id(self):
        cmd = build_terraform_command("state", {"subaction": "list", "id": "i-abc123"})
        assert "-id=i-abc123" in cmd

    def test_show(self):
        cmd = build_terraform_command("state", {
            "subaction": "show",
            "address": "aws_instance.web",
        })
        assert "state show aws_instance.web" in cmd

    def test_show_requires_address(self):
        with pytest.raises(ValueError, match="state show requires 'address'"):
            build_terraform_command("state", {"subaction": "show"})

    def test_show_empty_address(self):
        with pytest.raises(ValueError, match="state show requires 'address'"):
            build_terraform_command("state", {"subaction": "show", "address": ""})

    def test_mv(self):
        cmd = build_terraform_command("state", {
            "subaction": "mv",
            "source": "aws_instance.old",
            "destination": "aws_instance.new",
        })
        assert "state mv aws_instance.old aws_instance.new" in cmd

    def test_mv_requires_both(self):
        with pytest.raises(ValueError, match="state mv requires"):
            build_terraform_command("state", {"subaction": "mv", "source": "a"})

    def test_mv_requires_source(self):
        with pytest.raises(ValueError, match="state mv requires"):
            build_terraform_command("state", {"subaction": "mv", "destination": "b"})

    def test_rm(self):
        cmd = build_terraform_command("state", {
            "subaction": "rm",
            "address": "aws_instance.web",
        })
        assert "state rm aws_instance.web" in cmd

    def test_rm_requires_address(self):
        with pytest.raises(ValueError, match="state rm requires 'address'"):
            build_terraform_command("state", {"subaction": "rm"})

    def test_pull(self):
        cmd = build_terraform_command("state", {"subaction": "pull"})
        assert cmd == "terraform state pull"

    def test_invalid_subaction(self):
        with pytest.raises(ValueError, match="Unknown state subaction"):
            build_terraform_command("state", {"subaction": "push"})

    def test_working_dir(self):
        cmd = build_terraform_command("state", {"working_dir": "/opt/tf"})
        assert "-chdir=/opt/tf" in cmd


# ---------------------------------------------------------------------------
# workspace
# ---------------------------------------------------------------------------

class TestBuildWorkspace:
    def test_list_default(self):
        cmd = build_terraform_command("workspace", {})
        assert cmd == "terraform workspace list"

    def test_select(self):
        cmd = build_terraform_command("workspace", {
            "subaction": "select",
            "name": "staging",
        })
        assert "workspace select staging" in cmd

    def test_new(self):
        cmd = build_terraform_command("workspace", {
            "subaction": "new",
            "name": "dev",
        })
        assert "workspace new dev" in cmd

    def test_delete(self):
        cmd = build_terraform_command("workspace", {
            "subaction": "delete",
            "name": "old-env",
        })
        assert "workspace delete old-env" in cmd

    def test_show(self):
        cmd = build_terraform_command("workspace", {"subaction": "show"})
        assert cmd == "terraform workspace show"

    def test_select_requires_name(self):
        with pytest.raises(ValueError, match="workspace select requires 'name'"):
            build_terraform_command("workspace", {"subaction": "select"})

    def test_new_requires_name(self):
        with pytest.raises(ValueError, match="workspace new requires 'name'"):
            build_terraform_command("workspace", {"subaction": "new"})

    def test_delete_requires_name(self):
        with pytest.raises(ValueError, match="workspace delete requires 'name'"):
            build_terraform_command("workspace", {"subaction": "delete"})

    def test_empty_name_raises(self):
        with pytest.raises(ValueError, match="workspace select requires 'name'"):
            build_terraform_command("workspace", {"subaction": "select", "name": ""})

    def test_invalid_subaction(self):
        with pytest.raises(ValueError, match="Unknown workspace subaction"):
            build_terraform_command("workspace", {"subaction": "rename"})

    def test_working_dir(self):
        cmd = build_terraform_command("workspace", {
            "subaction": "list",
            "working_dir": "/opt/tf",
        })
        assert "-chdir=/opt/tf" in cmd


# ---------------------------------------------------------------------------
# import
# ---------------------------------------------------------------------------

class TestBuildImport:
    def test_basic(self):
        cmd = build_terraform_command("import", {
            "address": "aws_instance.web",
            "id": "i-abc123",
        })
        assert cmd == "terraform import -input=false aws_instance.web i-abc123"

    def test_requires_address(self):
        with pytest.raises(ValueError, match="import requires 'address'"):
            build_terraform_command("import", {"id": "i-abc123"})

    def test_requires_id(self):
        with pytest.raises(ValueError, match="import requires 'id'"):
            build_terraform_command("import", {"address": "aws_instance.web"})

    def test_empty_address(self):
        with pytest.raises(ValueError, match="import requires 'address'"):
            build_terraform_command("import", {"address": "", "id": "i-abc123"})

    def test_empty_id(self):
        with pytest.raises(ValueError, match="import requires 'id'"):
            build_terraform_command("import", {"address": "aws_instance.web", "id": ""})

    def test_var(self):
        cmd = build_terraform_command("import", {
            "address": "aws_instance.web",
            "id": "i-abc123",
            "var": {"region": "us-east-1"},
        })
        assert "-var=region=us-east-1" in cmd

    def test_var_file(self):
        cmd = build_terraform_command("import", {
            "address": "aws_instance.web",
            "id": "i-abc123",
            "var_file": "prod.tfvars",
        })
        assert "-var-file=prod.tfvars" in cmd

    def test_working_dir(self):
        cmd = build_terraform_command("import", {
            "address": "aws_instance.web",
            "id": "i-abc123",
            "working_dir": "/opt/tf",
        })
        assert "-chdir=/opt/tf" in cmd

    def test_input_false(self):
        cmd = build_terraform_command("import", {
            "address": "aws_instance.web",
            "id": "i-abc123",
        })
        assert "-input=false" in cmd

    def test_var_non_dict_skipped(self):
        cmd = build_terraform_command("import", {
            "address": "aws_instance.web",
            "id": "i-abc123",
            "var": "not-a-dict",
        })
        assert "-var=" not in cmd


# ---------------------------------------------------------------------------
# Shell injection safety
# ---------------------------------------------------------------------------

class TestShellInjectionSafety:
    def test_working_dir_injection(self):
        cmd = build_terraform_command("plan", {
            "working_dir": "/opt; rm -rf /",
        })
        assert "rm -rf" not in cmd or "'/opt; rm -rf /'" in cmd

    def test_plan_out_injection(self):
        cmd = build_terraform_command("plan", {"out": "a; cat /etc/passwd"})
        assert "cat /etc/passwd" not in cmd or "'" in cmd

    def test_var_value_injection(self):
        cmd = build_terraform_command("plan", {
            "var": {"key": "val; whoami"},
        })
        assert "whoami" not in cmd or "'" in cmd

    def test_target_injection(self):
        cmd = build_terraform_command("plan", {
            "target": ["$(whoami)"],
        })
        assert "'$(whoami)'" in cmd

    def test_address_injection(self):
        cmd = build_terraform_command("state", {
            "subaction": "show",
            "address": "aws_instance.web; id",
        })
        assert "'aws_instance.web; id'" in cmd

    def test_plan_file_injection(self):
        cmd = build_terraform_command("apply", {
            "plan_file": "plan; rm -rf /",
        })
        assert "'plan; rm -rf /'" in cmd

    def test_workspace_name_injection(self):
        cmd = build_terraform_command("workspace", {
            "subaction": "select",
            "name": "prod$(whoami)",
        })
        assert "'prod$(whoami)'" in cmd

    def test_import_id_injection(self):
        cmd = build_terraform_command("import", {
            "address": "aws_instance.web",
            "id": "i-123; cat /etc/shadow",
        })
        assert "'i-123; cat /etc/shadow'" in cmd

    def test_backend_config_injection(self):
        cmd = build_terraform_command("init", {
            "backend_config": {"bucket": "b; evil"},
        })
        assert "'bucket=b; evil'" in cmd

    def test_var_file_injection(self):
        cmd = build_terraform_command("plan", {
            "var_file": "vars.tf; rm -rf /",
        })
        assert "'vars.tf; rm -rf /'" in cmd


# ---------------------------------------------------------------------------
# Handler integration tests
# ---------------------------------------------------------------------------

class TestHandleTerraformOps:
    @pytest.fixture
    def executor(self):
        from unittest.mock import AsyncMock, MagicMock
        from src.tools.executor import ToolExecutor

        config = MagicMock()
        config.hosts = {
            "infra": MagicMock(address="10.0.0.1", ssh_user="deploy", os="linux"),
        }
        config.tools = MagicMock()
        config.tools.tool_timeouts = {}
        config.tools.tool_timeout_seconds = 300

        exec_inst = ToolExecutor.__new__(ToolExecutor)
        exec_inst.config = config
        exec_inst._metrics = {}
        exec_inst._permission_manager = None
        exec_inst._recovery_enabled = False
        from src.tools.recovery import RecoveryStats
        exec_inst.recovery_stats = RecoveryStats()
        exec_inst._exec_command = AsyncMock(return_value=(0, "Success"))
        return exec_inst

    @pytest.mark.asyncio
    async def test_unknown_host(self, executor):
        result = await executor._handle_terraform_ops({
            "host": "nohost",
            "action": "plan",
        })
        assert "Unknown or disallowed host" in result

    @pytest.mark.asyncio
    async def test_unknown_action(self, executor):
        result = await executor._handle_terraform_ops({
            "host": "infra",
            "action": "deploy",
        })
        assert "Unknown terraform action" in result

    @pytest.mark.asyncio
    async def test_missing_action(self, executor):
        result = await executor._handle_terraform_ops({
            "host": "infra",
        })
        assert "Unknown terraform action" in result

    @pytest.mark.asyncio
    async def test_init_dispatch(self, executor):
        result = await executor._handle_terraform_ops({
            "host": "infra",
            "action": "init",
        })
        executor._exec_command.assert_called_once()
        cmd = executor._exec_command.call_args[0][1]
        assert cmd.startswith("terraform init")
        assert "Success" in result or "completed successfully" in result

    @pytest.mark.asyncio
    async def test_plan_dispatch(self, executor):
        result = await executor._handle_terraform_ops({
            "host": "infra",
            "action": "plan",
            "params": {"out": "tf.plan"},
        })
        cmd = executor._exec_command.call_args[0][1]
        assert "terraform plan" in cmd
        assert "-out=tf.plan" in cmd

    @pytest.mark.asyncio
    async def test_apply_dispatch(self, executor):
        result = await executor._handle_terraform_ops({
            "host": "infra",
            "action": "apply",
            "params": {"plan_file": "tf.plan"},
        })
        cmd = executor._exec_command.call_args[0][1]
        assert "terraform apply" in cmd
        assert "tf.plan" in cmd

    @pytest.mark.asyncio
    async def test_apply_validation_error(self, executor):
        result = await executor._handle_terraform_ops({
            "host": "infra",
            "action": "apply",
            "params": {},
        })
        assert "terraform_ops error" in result
        assert "plan_file" in result

    @pytest.mark.asyncio
    async def test_output_dispatch(self, executor):
        await executor._handle_terraform_ops({
            "host": "infra",
            "action": "output",
            "params": {"json": True},
        })
        cmd = executor._exec_command.call_args[0][1]
        assert "terraform output" in cmd
        assert "-json" in cmd

    @pytest.mark.asyncio
    async def test_show_dispatch(self, executor):
        await executor._handle_terraform_ops({
            "host": "infra",
            "action": "show",
            "params": {"plan_file": "tf.plan"},
        })
        cmd = executor._exec_command.call_args[0][1]
        assert "terraform show" in cmd

    @pytest.mark.asyncio
    async def test_validate_dispatch(self, executor):
        await executor._handle_terraform_ops({
            "host": "infra",
            "action": "validate",
        })
        cmd = executor._exec_command.call_args[0][1]
        assert "terraform validate" in cmd

    @pytest.mark.asyncio
    async def test_fmt_dispatch(self, executor):
        await executor._handle_terraform_ops({
            "host": "infra",
            "action": "fmt",
            "params": {"check": True},
        })
        cmd = executor._exec_command.call_args[0][1]
        assert "terraform fmt" in cmd
        assert "-check" in cmd

    @pytest.mark.asyncio
    async def test_state_dispatch(self, executor):
        await executor._handle_terraform_ops({
            "host": "infra",
            "action": "state",
            "params": {"subaction": "list"},
        })
        cmd = executor._exec_command.call_args[0][1]
        assert "terraform state list" in cmd

    @pytest.mark.asyncio
    async def test_workspace_dispatch(self, executor):
        await executor._handle_terraform_ops({
            "host": "infra",
            "action": "workspace",
            "params": {"subaction": "select", "name": "prod"},
        })
        cmd = executor._exec_command.call_args[0][1]
        assert "terraform workspace select prod" in cmd

    @pytest.mark.asyncio
    async def test_import_dispatch(self, executor):
        await executor._handle_terraform_ops({
            "host": "infra",
            "action": "import",
            "params": {"address": "aws_instance.web", "id": "i-abc123"},
        })
        cmd = executor._exec_command.call_args[0][1]
        assert "terraform import" in cmd
        assert "aws_instance.web" in cmd
        assert "i-abc123" in cmd

    @pytest.mark.asyncio
    async def test_command_failure(self, executor):
        executor._exec_command.return_value = (1, "Error: No configuration files")
        result = await executor._handle_terraform_ops({
            "host": "infra",
            "action": "init",
        })
        assert "terraform init failed" in result
        assert "exit 1" in result

    @pytest.mark.asyncio
    async def test_empty_output(self, executor):
        executor._exec_command.return_value = (0, "")
        result = await executor._handle_terraform_ops({
            "host": "infra",
            "action": "validate",
        })
        assert "completed successfully" in result

    @pytest.mark.asyncio
    async def test_no_params_default(self, executor):
        result = await executor._handle_terraform_ops({
            "host": "infra",
            "action": "plan",
        })
        cmd = executor._exec_command.call_args[0][1]
        assert "terraform plan" in cmd

    @pytest.mark.asyncio
    async def test_correct_ssh_user(self, executor):
        await executor._handle_terraform_ops({
            "host": "infra",
            "action": "plan",
        })
        call_args = executor._exec_command.call_args
        assert call_args[0][0] == "10.0.0.1"
        assert call_args[0][2] == "deploy"

    @pytest.mark.asyncio
    async def test_state_validation_error(self, executor):
        result = await executor._handle_terraform_ops({
            "host": "infra",
            "action": "state",
            "params": {"subaction": "show"},
        })
        assert "terraform_ops error" in result
        assert "address" in result

    @pytest.mark.asyncio
    async def test_import_validation_error(self, executor):
        result = await executor._handle_terraform_ops({
            "host": "infra",
            "action": "import",
            "params": {"address": "aws_instance.web"},
        })
        assert "terraform_ops error" in result
        assert "id" in result


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------

class TestEdgeCases:
    def test_all_actions_have_builders(self):
        from src.tools.terraform_ops import _BUILDERS
        for action in ALLOWED_ACTIONS:
            assert action in _BUILDERS, f"Missing builder for {action}"

    def test_apply_never_has_auto_approve(self):
        cmd = build_terraform_command("apply", {"plan_file": "tf.plan"})
        assert "-auto-approve" not in cmd

    def test_init_always_has_input_false(self):
        cmd = build_terraform_command("init", {})
        assert "-input=false" in cmd

    def test_plan_always_has_input_false(self):
        cmd = build_terraform_command("plan", {})
        assert "-input=false" in cmd

    def test_apply_always_has_input_false(self):
        cmd = build_terraform_command("apply", {"plan_file": "tf.plan"})
        assert "-input=false" in cmd

    def test_import_always_has_input_false(self):
        cmd = build_terraform_command("import", {
            "address": "aws_instance.web",
            "id": "i-abc123",
        })
        assert "-input=false" in cmd

    def test_output_no_input_false(self):
        cmd = build_terraform_command("output", {})
        assert "-input=false" not in cmd

    def test_show_no_input_false(self):
        cmd = build_terraform_command("show", {})
        assert "-input=false" not in cmd

    def test_fmt_no_input_false(self):
        cmd = build_terraform_command("fmt", {})
        assert "-input=false" not in cmd

    def test_state_list_default_subaction(self):
        cmd = build_terraform_command("state", {})
        assert "state list" in cmd

    def test_workspace_list_default_subaction(self):
        cmd = build_terraform_command("workspace", {})
        assert "workspace list" in cmd

    def test_plan_destroy_with_out(self):
        cmd = build_terraform_command("plan", {
            "destroy": True,
            "out": "destroy.plan",
        })
        assert "-destroy" in cmd
        assert "-out=destroy.plan" in cmd

    def test_chdir_before_subcommand(self):
        cmd = build_terraform_command("plan", {"working_dir": "/opt/tf"})
        parts = cmd.split()
        chdir_idx = next(i for i, p in enumerate(parts) if p.startswith("-chdir="))
        plan_idx = parts.index("plan")
        assert chdir_idx < plan_idx

    def test_multiple_vars(self):
        cmd = build_terraform_command("plan", {
            "var": {"env": "prod", "region": "us-east-1"},
        })
        assert "-var=env=prod" in cmd
        assert "-var=region=us-east-1" in cmd

    def test_state_mv_both_quoted(self):
        cmd = build_terraform_command("state", {
            "subaction": "mv",
            "source": "module.old.aws_instance.web",
            "destination": "module.new.aws_instance.web",
        })
        assert "module.old.aws_instance.web" in cmd
        assert "module.new.aws_instance.web" in cmd

    def test_init_multiple_backend_configs(self):
        cmd = build_terraform_command("init", {
            "backend_config": {
                "bucket": "my-bucket",
                "key": "state.tfstate",
                "region": "us-east-1",
            },
        })
        assert cmd.count("-backend-config=") == 3
