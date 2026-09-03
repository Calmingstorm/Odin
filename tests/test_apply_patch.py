from __future__ import annotations

import os
from pathlib import Path

import pytest

from src.config.schema import ToolHost, ToolsConfig
from src.tools.apply_patch import PatchError, PatchRollbackError, apply_plan, parse_patch
from src.tools.executor import ToolExecutor


def _patch(body: str) -> str:
    return f"*** Begin Patch\n{body}\n*** End Patch\n"


def test_parse_combined_envelope_and_relative_paths():
    plan = parse_patch(
        _patch(
            "*** Add File: added.txt\n+new\n"
            "*** Update File: old.txt\n*** Move to: moved.txt\n"
            "@@ anchor\n anchor\n-before\n+after\n"
            "*** Delete File: gone.txt"
        )
    )
    assert [op["action"] for op in plan["operations"]] == ["add", "update", "delete"]
    assert plan["operations"][1]["move_to"] == "moved.txt"


@pytest.mark.parametrize(
    "text,match",
    [
        ("noise\n" + _patch("*** Add File: a\n+x"), "exactly framed"),
        (_patch("*** Add File: /abs\n+x"), "normalized relative"),
        (_patch("*** Add File: ../escape\n+x"), "stay beneath root"),
        (_patch("*** Add File: a\nnot-prefixed"), r"start with '\+'"),
        (_patch("*** Delete File: a\n+body"), "no body"),
        (_patch("*** Update File: a\n@@\n same"), "contain a change"),
        (_patch("*** Update File: a\n@@\n-old\n+new\n*** Delete File: a"), "more than once"),
    ],
)
def test_parser_rejects_invalid_whole_envelope(text, match):
    with pytest.raises(PatchError, match=match):
        parse_patch(text)


def test_context_mismatch_leaves_all_files_untouched(tmp_path):
    first = tmp_path / "first.txt"
    second = tmp_path / "second.txt"
    first.write_text("old\n")
    second.write_text("actual\n")
    plan = parse_patch(
        _patch(
            "*** Update File: first.txt\n@@\n-old\n+new\n"
            "*** Update File: second.txt\n@@\n-expected\n+replacement"
        )
    )
    with pytest.raises(PatchError, match="context mismatch"):
        apply_plan(str(tmp_path), plan)
    assert first.read_text() == "old\n"
    assert second.read_text() == "actual\n"
    assert not list(tmp_path.glob(".odin-patch-*"))


def test_apply_add_update_move_delete_transaction(tmp_path):
    (tmp_path / "update.txt").write_text("one\ntwo\nthree\n")
    (tmp_path / "move.txt").write_text("anchor\nold\n")
    (tmp_path / "delete.txt").write_text("gone\n")
    plan = parse_patch(
        _patch(
            "*** Add File: add.txt\n+added\n"
            "*** Update File: update.txt\n@@\n one\n-two\n+TWO\n three\n"
            "*** Update File: move.txt\n*** Move to: moved.txt\n@@ anchor\n anchor\n-old\n+new\n"
            "*** Delete File: delete.txt"
        )
    )
    changed = apply_plan(str(tmp_path), plan)
    assert changed == ["add.txt", "update.txt", "move.txt -> moved.txt", "delete.txt"]
    assert (tmp_path / "add.txt").read_text() == "added\n"
    assert (tmp_path / "update.txt").read_text() == "one\nTWO\nthree\n"
    assert not (tmp_path / "move.txt").exists()
    assert (tmp_path / "moved.txt").read_text() == "anchor\nnew\n"
    assert not (tmp_path / "delete.txt").exists()
    assert not list(tmp_path.glob(".odin-patch-*"))


def test_staging_files_are_private_and_unpredictable(tmp_path, monkeypatch):
    target = tmp_path / "a.txt"
    target.write_text("old\n")
    seen: list[tuple[str, int]] = []
    real_replace = os.replace

    def inspect_replace(source, destination):
        source_path = Path(source)
        seen.append((source_path.name, source_path.stat().st_mode & 0o777))
        real_replace(source, destination)

    apply_plan(
        str(tmp_path),
        parse_patch(_patch("*** Update File: a.txt\n@@\n-old\n+new")),
        replace=inspect_replace,
    )
    assert seen and all(mode == 0o600 for _name, mode in seen)
    assert all(
        name.startswith(".odin-patch-") and len(name) > len(".odin-patch-stage-")
        for name, _ in seen
    )


def test_commit_failure_rolls_back_every_committed_path(tmp_path):
    first = tmp_path / "first.txt"
    second = tmp_path / "second.txt"
    first.write_text("old-one\n")
    second.write_text("old-two\n")
    real_replace = os.replace
    writes = 0

    def fail_second_commit(source, destination):
        nonlocal writes
        if Path(source).name.startswith(".odin-patch-stage-"):
            writes += 1
            if writes == 2:
                raise OSError("injected commit failure")
        real_replace(source, destination)

    plan = parse_patch(
        _patch(
            "*** Update File: first.txt\n@@\n-old-one\n+new-one\n"
            "*** Update File: second.txt\n@@\n-old-two\n+new-two"
        )
    )
    with pytest.raises(PatchError, match="rollback completed"):
        apply_plan(str(tmp_path), plan, replace=fail_second_commit)
    assert first.read_text() == "old-one\n"
    assert second.read_text() == "old-two\n"


def test_rollback_failure_is_explicit(tmp_path):
    first = tmp_path / "first.txt"
    second = tmp_path / "second.txt"
    first.write_text("old-one\n")
    second.write_text("old-two\n")
    real_replace = os.replace
    stage_writes = 0

    def fail_commit_and_restore(source, destination):
        nonlocal stage_writes
        name = Path(source).name
        if name.startswith(".odin-patch-stage-"):
            stage_writes += 1
            if stage_writes == 2:
                raise OSError("injected commit failure")
        if name.startswith(".odin-patch-backup-"):
            raise OSError("injected rollback failure")
        real_replace(source, destination)

    plan = parse_patch(
        _patch(
            "*** Update File: first.txt\n@@\n-old-one\n+new-one\n"
            "*** Update File: second.txt\n@@\n-old-two\n+new-two"
        )
    )
    with pytest.raises(PatchRollbackError, match="rollback also failed") as caught:
        apply_plan(str(tmp_path), plan, replace=fail_commit_and_restore)
    assert caught.value.failures


def test_symlink_component_refused(tmp_path):
    outside = tmp_path / "outside"
    outside.mkdir()
    (outside / "x.txt").write_text("old\n")
    root = tmp_path / "root"
    root.mkdir()
    (root / "link").symlink_to(outside, target_is_directory=True)
    plan = parse_patch(_patch("*** Update File: link/x.txt\n@@\n-old\n+new"))
    with pytest.raises(PatchError, match="symlink path component"):
        apply_plan(str(root), plan)
    assert (outside / "x.txt").read_text() == "old\n"


@pytest.mark.asyncio
async def test_handler_uses_base64_private_staging_and_reports_success(tmp_path, monkeypatch):
    config = ToolsConfig(hosts={"local": ToolHost(address="127.0.0.1", ssh_user="root")})
    executor = ToolExecutor(config=config)
    root = tmp_path / "root"
    root.mkdir()
    patch = _patch("*** Add File: hello.txt\n+hello")
    result = await executor.execute(
        "apply_patch", {"host": "local", "root": str(root), "patch_text": patch}
    )
    assert result.ok is True
    assert (root / "hello.txt").read_text() == "hello\n"
    assert "Applied patch successfully" in result.output


@pytest.mark.asyncio
async def test_handler_rejects_context_mismatch_as_failure(tmp_path):
    config = ToolsConfig(hosts={"local": ToolHost(address="127.0.0.1", ssh_user="root")})
    executor = ToolExecutor(config=config)
    target = tmp_path / "a.txt"
    target.write_text("actual\n")
    result = await executor.execute(
        "apply_patch",
        {
            "host": "local",
            "root": str(tmp_path),
            "patch_text": _patch("*** Update File: a.txt\n@@\n-expected\n+new"),
        },
    )
    assert result.ok is False
    assert "context mismatch" in result.output
    assert target.read_text() == "actual\n"


def test_context_match_guard_is_load_bearing(tmp_path):
    target = tmp_path / "guard.txt"
    target.write_text("before\n")
    plan = parse_patch(_patch("*** Update File: guard.txt\n@@\n-not-before\n+after"))
    with pytest.raises(PatchError, match="context mismatch"):
        apply_plan(str(tmp_path), plan)
    assert target.read_text() == "before\n"


def test_ambiguous_context_is_refused(tmp_path):
    target = tmp_path / "guard.txt"
    target.write_text("repeat\nrepeat\n")
    plan = parse_patch(_patch("*** Update File: guard.txt\n@@\n-repeat\n+after"))
    with pytest.raises(PatchError, match="ambiguous"):
        apply_plan(str(tmp_path), plan)
    assert target.read_text() == "repeat\nrepeat\n"


def test_failed_delete_after_update_restores_update_from_private_snapshot(tmp_path):
    update = tmp_path / "update.txt"
    delete = tmp_path / "delete.txt"
    update.write_text("old\n")
    delete.write_text("delete-me\n")
    real_unlink = os.unlink

    def fail_delete(path):
        if Path(path) == delete:
            raise OSError("injected delete failure")
        real_unlink(path)

    plan = parse_patch(
        _patch("*** Update File: update.txt\n@@\n-old\n+new\n*** Delete File: delete.txt")
    )
    with pytest.raises(PatchError, match="rollback completed"):
        apply_plan(str(tmp_path), plan, unlink=fail_delete)
    assert update.read_text() == "old\n"
    assert delete.read_text() == "delete-me\n"
