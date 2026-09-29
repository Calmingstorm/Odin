"""Campaign regressions using real managers/executors and inert transports."""
from __future__ import annotations

import json
from unittest.mock import AsyncMock

import pytest

from src.tools.skill_manager import SkillManager, SkillStatus


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
