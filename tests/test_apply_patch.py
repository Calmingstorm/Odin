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


def test_staging_files_are_private_and_unpredictable(tmp_path):
    target = tmp_path / "a.txt"
    target.write_text("old\n")
    seen: list[tuple[str, int]] = []
    from src.tools.apply_patch import _rename_noreplace

    def inspect_rename(source, destination, **kwargs):
        source_info = os.stat(source, dir_fd=kwargs["src_dir_fd"], follow_symlinks=False)
        if str(source).startswith(".odin-patch-"):
            seen.append((str(source), source_info.st_mode & 0o777))
        _rename_noreplace(source, destination, **kwargs)

    apply_plan(
        str(tmp_path),
        parse_patch(_patch("*** Update File: a.txt\n@@\n-old\n+new")),
        rename_noreplace=inspect_rename,
    )
    assert seen and all(mode == 0o600 for _name, mode in seen)
    assert all(name.startswith(".odin-patch-") and len(name) > 40 for name, _ in seen)


def test_commit_failure_rolls_back_every_committed_path(tmp_path):
    first = tmp_path / "first.txt"
    second = tmp_path / "second.txt"
    first.write_text("old-one\n")
    second.write_text("old-two\n")
    from src.tools.apply_patch import _rename_noreplace

    publishes = 0

    def fail_second_publish(source, destination, **kwargs):
        nonlocal publishes
        if str(source).startswith(".odin-patch-stage-"):
            publishes += 1
            if publishes == 2:
                raise OSError("injected commit failure")
        _rename_noreplace(source, destination, **kwargs)

    plan = parse_patch(
        _patch(
            "*** Update File: first.txt\n@@\n-old-one\n+new-one\n"
            "*** Update File: second.txt\n@@\n-old-two\n+new-two"
        )
    )
    with pytest.raises(PatchError, match="rollback completed"):
        apply_plan(str(tmp_path), plan, rename_noreplace=fail_second_publish)
    assert first.read_text() == "old-one\n"
    assert second.read_text() == "old-two\n"
    assert not list(tmp_path.glob(".odin-patch-*"))


def test_rollback_failure_is_explicit_and_retains_private_artifact(tmp_path):
    first = tmp_path / "first.txt"
    second = tmp_path / "second.txt"
    first.write_text("old-one\n")
    second.write_text("old-two\n")
    from src.tools.apply_patch import _rename_noreplace

    publishes = 0

    def fail_commit_and_restore(source, destination, **kwargs):
        nonlocal publishes
        if str(source).startswith(".odin-patch-stage-"):
            publishes += 1
            if publishes == 2:
                raise OSError("injected commit failure")
        if str(source).startswith(".odin-patch-recovery-"):
            raise OSError("injected rollback failure")
        _rename_noreplace(source, destination, **kwargs)

    plan = parse_patch(
        _patch(
            "*** Update File: first.txt\n@@\n-old-one\n+new-one\n"
            "*** Update File: second.txt\n@@\n-old-two\n+new-two"
        )
    )
    with pytest.raises(PatchRollbackError) as caught:
        apply_plan(str(tmp_path), plan, rename_noreplace=fail_commit_and_restore)
    artifacts = [Path(path) for path in caught.value.recovery_artifacts]
    assert artifacts
    assert all(path.exists() and path.stat().st_mode & 0o777 == 0o600 for path in artifacts)
    for path in artifacts:
        path.unlink()


def test_symlink_component_refused(tmp_path):
    outside = tmp_path / "outside"
    outside.mkdir()
    (outside / "x.txt").write_text("old\n")
    root = tmp_path / "root"
    root.mkdir()
    (root / "link").symlink_to(outside, target_is_directory=True)
    plan = parse_patch(_patch("*** Update File: link/x.txt\n@@\n-old\n+new"))
    with pytest.raises(PatchError, match="symlink"):
        apply_plan(str(root), plan)
    assert (outside / "x.txt").read_text() == "old\n"


def test_failure_after_source_move_restores_deleted_file(tmp_path):
    target = tmp_path / "deleted.txt"
    target.write_text("original\n")
    from src.tools.apply_patch import _rename_noreplace

    def move_then_raise(source, destination, **kwargs):
        _rename_noreplace(source, destination, **kwargs)
        if str(destination).startswith(".odin-patch-recovery-"):
            raise OSError("injected post-effect source move failure")

    plan = parse_patch(_patch("*** Delete File: deleted.txt"))
    with pytest.raises(PatchError, match="rollback completed"):
        apply_plan(str(tmp_path), plan, rename_noreplace=move_then_raise)
    assert target.read_text() == "original\n"
    assert not list(tmp_path.glob(".odin-patch-*"))


def test_failure_after_publish_restores_original(tmp_path):
    target = tmp_path / "updated.txt"
    target.write_text("old\n")
    from src.tools.apply_patch import _rename_noreplace

    def publish_then_raise(source, destination, **kwargs):
        _rename_noreplace(source, destination, **kwargs)
        if str(source).startswith(".odin-patch-stage-"):
            raise OSError("injected post-effect publish failure")

    plan = parse_patch(_patch("*** Update File: updated.txt\n@@\n-old\n+new"))
    with pytest.raises(PatchError, match="rollback completed"):
        apply_plan(str(tmp_path), plan, rename_noreplace=publish_then_raise)
    assert target.read_text() == "old\n"
    assert not list(tmp_path.glob(".odin-patch-*"))


def test_destination_created_during_commit_is_not_overwritten(tmp_path):
    destination = tmp_path / "created.txt"
    from src.tools.apply_patch import _rename_noreplace

    def race_publish(source, destination_name, **kwargs):
        if str(source).startswith(".odin-patch-stage-"):
            destination.write_text("concurrent\n")
        _rename_noreplace(source, destination_name, **kwargs)

    plan = parse_patch(_patch("*** Add File: created.txt\n+patch"))
    with pytest.raises(PatchError, match="rollback completed"):
        apply_plan(str(tmp_path), plan, rename_noreplace=race_publish)
    assert destination.read_text() == "concurrent\n"
    assert not list(tmp_path.glob(".odin-patch-*"))


def test_source_parent_swap_cannot_redirect_update_outside_root(tmp_path):
    root = tmp_path / "root"
    root.mkdir()
    held = root / "held"
    held.mkdir()
    (held / "a.txt").write_text("inside\n")
    outside = tmp_path / "outside"
    outside.mkdir()
    outside_target = outside / "a.txt"
    outside_target.write_text("outside\n")
    from src.tools.apply_patch import _rename_noreplace

    swapped = False

    def swap_parent_then_rename(source, destination, **kwargs):
        nonlocal swapped
        if not swapped and str(source).startswith(".odin-patch-stage-"):
            held.rename(root / "original-held")
            held.symlink_to(outside, target_is_directory=True)
            swapped = True
        _rename_noreplace(source, destination, **kwargs)

    plan = parse_patch(_patch("*** Update File: held/a.txt\n@@\n-inside\n+updated"))
    apply_plan(str(root), plan, rename_noreplace=swap_parent_then_rename)
    assert outside_target.read_text() == "outside\n"
    assert (root / "original-held" / "a.txt").read_text() == "updated\n"


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
