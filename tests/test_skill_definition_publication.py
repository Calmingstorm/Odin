"""Malformed runtime definitions cannot enter the production skill catalog."""

import sys
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.tools.skill_manager import SkillManager


def source(name="example", **changes):
    definition = {
        "name": name,
        "description": "A healthy tool",
        "input_schema": {"type": "object", "properties": {}},
    }
    definition.update(changes)
    return f"SKILL_DEFINITION = {definition!r}\nasync def execute(inp, context): return 'ok'\n"


@pytest.mark.parametrize("changes", [
    {"name": []}, {"description": 5}, {"input_schema": 5},
    {"input_schema": {"type": "object", "properties": {"x": {"type": "bogus"}}}},
    {"input_schema": {"type": "object", "properties": {}, "required": ["missing"]}},
])
def test_bad_startup_definition_isolated(tmp_path, changes):
    (tmp_path / "good.py").write_text(source("good"))
    (tmp_path / "bad.py").write_text(source(**changes))
    manager = SkillManager(str(tmp_path), MagicMock())
    assert [d["name"] for d in manager.get_tool_definitions()] == ["good"]
    assert "bad.py" in manager.definition_errors


def test_rejected_create_and_edit_preserve_working_object(tmp_path):
    manager = SkillManager(str(tmp_path), MagicMock())
    assert "failed to load" in manager.create_skill("bad", source("bad", description=1))
    assert not manager.has_skill("bad")
    original = source()
    manager.create_skill("example", original)
    working = manager._skills["example"]
    assert "Reverted" in manager.edit_skill("example", source(description=1))
    assert manager._skills["example"] is working
    assert (tmp_path / "example.py").read_text() == original


def test_dynamic_trusted_definition_still_loads(tmp_path):
    manager = SkillManager(str(tmp_path), MagicMock())
    code = source() + "SKILL_DEFINITION['description'] = str(123)\n"
    assert "successfully" in manager.create_skill("example", code)
    assert manager.get_tool_definitions()[0]["description"] == "123"


async def test_url_install_uses_runtime_publication_boundary(tmp_path, monkeypatch):
    manager = SkillManager(str(tmp_path), MagicMock())
    body = source("downloaded", description=5).encode()
    monkeypatch.setattr("src.tools.safe_fetch.safe_fetch", AsyncMock(
        return_value=MagicMock(status=200, body=body),
    ))
    result = await manager.install_from_url("https://example.com/downloaded.py")
    assert "failed to load" in result
    assert manager.get_tool_definitions() == []
    assert not (tmp_path / "downloaded.py").exists()


async def test_mismatched_create_cannot_unload_another_working_skill(tmp_path):
    manager = SkillManager(str(tmp_path), MagicMock())
    manager.create_skill("example", source())
    working = manager._skills["example"]
    module = sys.modules[working.module_name]
    result = manager.create_skill("other", source())
    assert "failed to load" in result or "doesn't match" in result
    assert manager._skills["example"] is working
    assert sys.modules[working.module_name] is module
    assert "odin_skill_other" not in sys.modules
    assert await working.execute_fn({}, None) == "ok"


async def test_same_size_same_timestamp_edit_validates_current_source(tmp_path):
    import os

    manager = SkillManager(str(tmp_path), MagicMock())
    original = source()
    manager.create_skill("example", original)
    working = manager._skills["example"]
    module = sys.modules[working.module_name]
    path = tmp_path / "example.py"
    stamp = path.stat().st_mtime
    # Importlib's timestamp cache uses whole seconds and source byte length.
    # Keep both stable so this tests the actual edit publication, not cache luck.
    invalid = original.replace("'A healthy tool'", "1234567890123456")
    assert len(invalid) == len(original)
    from unittest.mock import patch
    real_write = type(path).write_text

    def stable_write(file, content, *args, **kwargs):
        result = real_write(file, content, *args, **kwargs)
        os.utime(file, (stamp, stamp))
        return result

    with patch.object(type(path), "write_text", stable_write):
        assert "Reverted" in manager.edit_skill("example", invalid)
    assert manager._skills["example"] is working
    assert sys.modules[working.module_name] is module
    assert path.read_text() == original
    assert await working.execute_fn({}, None) == "ok"
