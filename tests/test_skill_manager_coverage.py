"""Coverage for skill_manager (RFC-006 P3 — 28→75%).

Two layers: the module-level pure helpers (dependency-safety guard against
pip-install RCE, config-schema validation, static AST extractors) and the
SkillManager lifecycle (create/edit/delete/enable/disable/config/validate)
against a tmp skills dir with a mock executor.
"""
from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from src.tools.skill_manager import (
    SkillManager,
    SkillMetadata,
    _extract_dependencies_from_source,
    _extract_skill_name_from_source,
    _parse_package_name,
    apply_defaults,
    is_safe_dependency_spec,
    validate_config,
    validate_config_value,
)


def _skill_code(name="demo", deps=None, description="a demo skill", config_schema=None):
    defn = {
        "name": name,
        "description": description,
        "input_schema": {"type": "object", "properties": {}},
    }
    if deps is not None:
        defn["dependencies"] = deps
    if config_schema is not None:
        defn["config_schema"] = config_schema
    return (
        f"SKILL_DEFINITION = {defn!r}\n\n"
        "async def execute(inp, context):\n"
        "    return 'ok'\n"
    )


# ── dependency-safety guard (security-critical) ──────────────────────

class TestIsSafeDependencySpec:
    @pytest.mark.parametrize("spec", [
        "requests", "requests>=2.0", "Pillow[jpeg]", "numpy==1.26.0", "pkg~=1.2",
    ])
    def test_safe_specs_allowed(self, spec):
        assert is_safe_dependency_spec(spec) is True

    @pytest.mark.parametrize("spec", [
        "",                                      # empty
        "pkg @ https://evil/x.tar.gz",           # PEP 508 direct ref
        "git+https://github.com/x/y",            # VCS
        "https://evil/pkg.tar.gz",               # bare URL
        "./local/path",                          # local path
        "-e .",                                  # pip option
        "pkg; os.system('rm -rf /')",            # env marker / chaining
        "pkg with space",                        # whitespace
        "..\\..\\evil",                          # backslash path
    ])
    def test_unsafe_specs_rejected(self, spec):
        assert is_safe_dependency_spec(spec) is False

    def test_parse_package_name(self):
        assert _parse_package_name("requests>=2.0") == "requests"
        assert _parse_package_name("Pillow[jpeg]") == "Pillow"
        assert _parse_package_name("@bad") == ""


# ── config-schema validation ─────────────────────────────────────────

class TestConfigValidation:
    def test_type_checks(self):
        assert validate_config_value("f", {"type": "string"}, 5) is not None
        assert validate_config_value("f", {"type": "integer"}, True) is not None  # bool≠int
        assert validate_config_value("f", {"type": "number"}, "x") is not None
        assert validate_config_value("f", {"type": "boolean"}, 1) is not None
        assert validate_config_value("f", {"type": "string"}, "ok") is None

    def test_enum_constraint(self):
        schema = {"type": "string", "enum": ["a", "b"]}
        assert validate_config_value("f", schema, "c") is not None
        assert validate_config_value("f", schema, "a") is None

    def test_numeric_bounds(self):
        schema = {"type": "integer", "minimum": 1, "maximum": 10}
        assert validate_config_value("f", schema, 0) is not None
        assert validate_config_value("f", schema, 11) is not None
        assert validate_config_value("f", schema, 5) is None

    def test_string_length_bounds(self):
        schema = {"type": "string", "minLength": 2, "maxLength": 4}
        assert validate_config_value("f", schema, "x") is not None
        assert validate_config_value("f", schema, "toolong") is not None
        assert validate_config_value("f", schema, "ok") is None

    def test_validate_config_required_and_unknown(self):
        schema = {"properties": {"a": {"type": "string"}}, "required": ["a", "b"]}
        errs = validate_config(schema, {"a": "x", "c": 1})
        assert any("Missing required field 'b'" in e for e in errs)
        assert any("Unknown field 'c'" in e for e in errs)

    def test_required_with_default_not_flagged(self):
        schema = {"properties": {"a": {"type": "string", "default": "d"}}, "required": ["a"]}
        assert validate_config(schema, {}) == []

    def test_apply_defaults(self):
        schema = {"properties": {"a": {"default": 1}, "b": {"default": 2}}}
        assert apply_defaults(schema, {"b": 9}) == {"a": 1, "b": 9}


# ── static AST extractors ────────────────────────────────────────────

class TestAstExtractors:
    def test_extract_name(self):
        assert _extract_skill_name_from_source(_skill_code("mine")) == "mine"

    def test_extract_dependencies(self):
        code = _skill_code(deps=["requests", "numpy"])
        assert _extract_dependencies_from_source(code) == ["requests", "numpy"]

    def test_extract_from_syntax_error_is_empty(self):
        assert _extract_skill_name_from_source("def (:::") == ""
        assert _extract_dependencies_from_source("def (:::") == []

    def test_extract_missing_definition(self):
        assert _extract_skill_name_from_source("X = 1") == ""
        assert _extract_dependencies_from_source("X = 1") == []


# ── SkillMetadata ────────────────────────────────────────────────────

class TestSkillMetadata:
    def test_from_valid_definition(self):
        meta, diags = SkillMetadata.from_definition({
            "name": "demo", "version": "1.2.3", "author": "aaron",
            "tags": ["util"], "dependencies": ["requests"],
        })
        assert meta.version == "1.2.3" and meta.tags == ["util"]
        assert meta.dependencies == ["requests"]
        assert not any(d.level == "error" for d in diags)

    def test_bad_field_types_produce_warnings(self):
        meta, diags = SkillMetadata.from_definition({
            "version": 123, "author": [], "tags": "notalist",
        })
        # bad types are ignored with warnings, defaults kept
        assert meta.version == "0.0.0"
        assert any(d.level == "warn" for d in diags)


# ── SkillManager lifecycle ───────────────────────────────────────────

@pytest.fixture
def manager(tmp_path):
    return SkillManager(str(tmp_path / "skills"), tool_executor=MagicMock())


class TestSkillManagerLifecycle:
    def test_create_show_and_duplicate(self, manager):
        assert "created and loaded" in manager.create_skill("demo", _skill_code("demo"))
        assert manager.has_skill("demo")
        assert "already exists" in manager.create_skill("demo", _skill_code("demo"))

    def test_create_name_mismatch_rejected(self, manager):
        # SKILL_DEFINITION.name must match the filename
        out = manager.create_skill("wrongfile", _skill_code("realname"))
        assert "doesn't match filename" in out
        assert not manager.has_skill("wrongfile")

    def test_create_broken_code_rejected(self, manager):
        out = manager.create_skill("broken", "def (:::")
        assert "failed to load" in out

    def test_edit_reloads(self, manager):
        manager.create_skill("demo", _skill_code("demo", description="v1"))
        out = manager.edit_skill("demo", _skill_code("demo", description="v2"))
        assert "updated and reloaded" in out

    def test_edit_missing(self, manager):
        assert "not found" in manager.edit_skill("ghost", _skill_code("ghost"))

    def test_edit_broken_reverts(self, manager):
        manager.create_skill("demo", _skill_code("demo"))
        out = manager.edit_skill("demo", "def (:::")
        assert "Reverted" in out and manager.has_skill("demo")  # still usable

    def test_enable_disable_lifecycle(self, manager):
        manager.create_skill("demo", _skill_code("demo"))
        assert manager.is_enabled("demo")
        assert "disabled" in manager.disable_skill("demo")
        assert not manager.is_enabled("demo")
        assert "already disabled" in manager.disable_skill("demo")
        assert "enabled" in manager.enable_skill("demo")
        assert "already enabled" in manager.enable_skill("demo")

    def test_disable_survives_reload(self, tmp_path):
        d = str(tmp_path / "skills")
        m1 = SkillManager(d, tool_executor=MagicMock())
        m1.create_skill("demo", _skill_code("demo"))
        m1.disable_skill("demo")
        # A fresh manager reads the persisted .disabled.json
        m2 = SkillManager(d, tool_executor=MagicMock())
        assert not m2.is_enabled("demo")

    def test_delete(self, manager):
        manager.create_skill("demo", _skill_code("demo"))
        assert "deleted" in manager.delete_skill("demo")
        assert not manager.has_skill("demo")
        assert "not found" in manager.delete_skill("demo")

    def test_invalid_name_rejected(self, manager):
        assert manager.create_skill("bad name!", _skill_code("bad name!")) != ""
        assert not manager.has_skill("bad name!")

    def test_list_skills_and_get_info(self, manager):
        manager.create_skill("demo", _skill_code("demo"))
        listed = manager.list_skills()
        assert any(s["name"] == "demo" for s in listed)
        info = manager.get_skill_info("demo")
        assert info and info["name"] == "demo"
        assert manager.get_skill_info("ghost") is None

    def test_get_tool_definitions_excludes_disabled(self, manager):
        manager.create_skill("demo", _skill_code("demo"))
        assert any(t["name"] == "demo" for t in manager.get_tool_definitions())
        manager.disable_skill("demo")
        assert not any(t["name"] == "demo" for t in manager.get_tool_definitions())


class TestSkillConfig:
    _SCHEMA = {"type": "object",
               "properties": {"level": {"type": "integer", "default": 1}}}

    def test_set_and_get_config(self, tmp_path):
        m = SkillManager(str(tmp_path / "skills"), tool_executor=MagicMock())
        m.create_skill("demo", _skill_code("demo", config_schema=self._SCHEMA))
        assert m.set_skill_config("demo", {"level": 5}) == []
        assert m.get_skill_config("demo")["level"] == 5

    def test_set_config_validation_error(self, tmp_path):
        m = SkillManager(str(tmp_path / "skills"), tool_executor=MagicMock())
        m.create_skill("demo", _skill_code("demo", config_schema=self._SCHEMA))
        errs = m.set_skill_config("demo", {"level": "not-an-int"})
        assert errs and any("integer" in e for e in errs)


class TestExecuteExportStatus:
    @pytest.mark.asyncio
    async def test_execute_runs_skill(self, manager):
        code = ("SKILL_DEFINITION = {'name': 'echo', 'description': 'd', "
                "'input_schema': {'type': 'object', 'properties': {}}}\n"
                "async def execute(inp, context):\n"
                "    return f\"got {inp.get('x')}\"\n")
        manager.create_skill("echo", code)
        assert await manager.execute("echo", {"x": 42}) == "got 42"

    @pytest.mark.asyncio
    async def test_execute_missing_and_disabled(self, manager):
        assert "not found" in await manager.execute("ghost", {})
        manager.create_skill("demo", _skill_code("demo"))
        manager.disable_skill("demo")
        assert "disabled" in await manager.execute("demo", {})

    @pytest.mark.asyncio
    async def test_execute_error_is_caught(self, manager):
        code = ("SKILL_DEFINITION = {'name': 'boom', 'description': 'd', "
                "'input_schema': {'type': 'object', 'properties': {}}}\n"
                "async def execute(inp, context):\n"
                "    raise ValueError('kaboom')\n")
        manager.create_skill("boom", code)
        out = await manager.execute("boom", {})
        assert "Skill error" in out and "kaboom" in out
        # stats recorded even on error
        assert manager._skills["boom"].total_executions == 1

    def test_export_skill(self, manager):
        manager.create_skill("demo", _skill_code("demo"))
        result = manager.export_skill("demo")
        assert isinstance(result, tuple)
        blob, fname = result
        assert b"SKILL_DEFINITION" in blob and fname == "demo.py"
        assert "not found" in manager.export_skill("ghost")

    def test_skill_status_report(self, manager):
        manager.create_skill("demo", _skill_code("demo", description="a demo skill"))
        status = manager.skill_status("demo")
        assert "Skill: demo" in status and "a demo skill" in status
        assert "not found" in manager.skill_status("ghost")

    def test_check_dependencies(self, manager):
        # A skill declaring an already-installed dep reports it satisfied.
        manager.create_skill("dep", _skill_code("dep", deps=["pytest"]))
        result = manager.check_dependencies("dep")
        assert isinstance(result, dict)


class TestValidateSkillCode:
    def _mgr(self, tmp_path):
        return SkillManager(str(tmp_path / "skills"), tool_executor=MagicMock())

    def test_valid_code_passes(self, tmp_path):
        res = self._mgr(tmp_path).validate_skill_code(_skill_code("demo"))
        assert res["valid"] is True

    def test_missing_execute_flagged(self, tmp_path):
        code = "SKILL_DEFINITION = {'name': 'x', 'description': 'd', 'input_schema': {}}\n"
        res = self._mgr(tmp_path).validate_skill_code(code)
        assert res["valid"] is False
        assert any("execute" in e for e in res["errors"])

    def test_syntax_error_flagged(self, tmp_path):
        res = self._mgr(tmp_path).validate_skill_code("def (:::")
        assert res["valid"] is False

    def test_non_async_execute_flagged(self, tmp_path):
        code = ("SKILL_DEFINITION = {'name': 'x', 'description': 'd', 'input_schema': {}}\n"
                "def execute(inp, context):\n    return 'x'\n")
        res = self._mgr(tmp_path).validate_skill_code(code)
        # non-async execute is a warning, not a hard error
        assert any("async" in w for w in res["warnings"])
