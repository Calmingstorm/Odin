"""Disposable native managed-host patch probe; no service or user-data access.

Prepare a transport bundle with --prepare DIR in the development venv. Copy it,
this script and src/tools/apply_patch.py to a native temporary directory, then
run /usr/bin/python3 probe_managed_patch.py --run DIR. All fixtures stay beneath
that explicitly supplied directory, in automatically cleaned temporary children.
"""
from __future__ import annotations

import argparse
import asyncio
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path


def prepare(directory):
    from unittest.mock import AsyncMock

    from src.config.schema import ToolHost, ToolsConfig
    from src.tools.executor import ToolExecutor
    from src.tools.handlers.files_docs import FilesDocsTools

    async def commands():
        ex = ToolExecutor(config=ToolsConfig(hosts={
            "fixture": ToolHost(address="192.0.2.1", os="macos"),
        }))
        bundle = {}
        for name, content in (("plain", "portable λ"), ("compressed", "portable λ " * 3000)):
            ex._run_on_host = AsyncMock(return_value=('{"ok":true,"changed":[]}', 0))
            text = "*** Begin Patch\n*** Add File: added.txt\n+" + content + "\n*** End Patch\n"
            await FilesDocsTools._handle_apply_patch(ex, {
                "host": "fixture", "root": "/__PROBE_ROOT__", "patch_text": text,
            })
            command = ex._run_on_host.call_args.args[1]
            assert 'chmod -- 600 "$runner" "$plan"' in command
            assert ("zlib.decompress" in command) == (name == "compressed")
            bundle[name] = {"command": command, "expected": content + "\n"}
        ex.files_docs_tools._run_on_host = AsyncMock(return_value=("", 0))
        await ex.files_docs_tools._handle_read_file({
            "host": "fixture", "path": "/__PROBE_SOURCE__", "raw": True,
        })
        bundle["raw"] = ex.files_docs_tools._run_on_host.call_args.args[1]
        return bundle

    directory.mkdir(parents=True, exist_ok=True)
    (directory / "transport.json").write_text(json.dumps(asyncio.run(commands())))
    print("Prepared production plain, compressed and raw command bundle")


def run(directory):
    spec = importlib.util.spec_from_file_location("isolated_patcher", directory / "apply_patch.py")
    patcher = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(patcher)
    print("Native platform=" + sys.platform + " python=" + sys.version.split()[0])
    bundle = json.loads((directory / "transport.json").read_text())

    def plan(body):
        return patcher.parse_patch("*** Begin Patch\n" + body + "\n*** End Patch\n")

    move = plan(
        "*** Update File: casetest.txt\n*** Move to: CaseTest.txt\n@@\n-case ok\n+case renamed"
    )
    with tempfile.TemporaryDirectory(prefix="fixtures-", dir=str(directory)) as temporary:
        root = Path(temporary)
        source = root / "casetest.txt"
        source.write_text("case ok\n")
        assert (root / "CaseTest.txt").exists(), "native volume is not case insensitive"
        patcher.apply_plan(str(root), move)
        assert os.listdir(root) == ["CaseTest.txt"]
        assert (root / "CaseTest.txt").read_text() == "case renamed\n"
        print("PASS native case-insensitive case-only move, exact destination spelling")
        (root / "CaseTest.txt").unlink()

        source.write_text("case ok\n")
        alternate_source = json.loads(json.dumps(move))
        alternate_source["operations"][0]["path"] = "CASETEST.txt"
        patcher.apply_plan(str(root), alternate_source)
        assert os.listdir(root) == ["CaseTest.txt"]
        assert (root / "CaseTest.txt").read_text() == "case renamed\n"
        (root / "CaseTest.txt").unlink()
        print("PASS native alternate-source spelling move, exact destination spelling")

        checkpoints = (
            "before_recovery", "recovery", "before_publish", "after_publish", "later_file",
        )
        for source_name, destination_name, point in (
            (name, destination, checkpoint)
            for name, destination in (
                ("casetest.txt", "CaseTest.txt"),
                ("CASETEST.txt", "CaseTest.txt"),
                ("CASETEST.txt", "casetest.txt"),
            )
            for checkpoint in checkpoints
        ):
            source.write_text("case ok\n")
            source.chmod(0o640)
            current = json.loads(json.dumps(move))
            current["operations"][0]["path"] = source_name
            current["operations"][0]["move_to"] = destination_name
            if point == "later_file":
                current["operations"].extend(plan("*** Add File: later.txt\n+later")["operations"])
            injected = [False]

            def fail_once(old, new, **kwargs):
                hit = not injected[0] and (
                    (
                        point in ("before_recovery", "recovery")
                        and new.startswith(".odin-patch-recovery-")
                    )
                    or (point in ("before_publish", "after_publish") and new == destination_name)
                    or (point == "later_file" and new == "later.txt")
                )
                if hit:
                    injected[0] = True
                    if point not in ("before_recovery", "before_publish"):
                        patcher._rename_noreplace(old, new, **kwargs)
                    raise OSError("fixture interruption")
                patcher._rename_noreplace(old, new, **kwargs)

            try:
                patcher.apply_plan(str(root), current, rename_noreplace=fail_once)
                raise AssertionError("fixture interruption was not raised")
            except patcher.PatchError as error:
                assert "rollback completed" in str(error), str(error)
            assert os.listdir(root) == ["casetest.txt"]
            assert injected[0], "fixture interruption was not reached"
            assert source.read_text() == "case ok\n"
            assert source.stat().st_mode & 0o777 == 0o640
            source.unlink()
            print(
                "PASS native rollback " + point + " source=" + source_name
                + " destination=" + destination_name
                + ", exact source spelling/content/mode"
            )

        source.write_text("case ok\n")
        exact_original = json.loads(json.dumps(move))
        exact_original["operations"][0]["path"] = "CASETEST.txt"
        exact_original["operations"][0]["move_to"] = "casetest.txt"
        patcher.apply_plan(str(root), exact_original)
        assert os.listdir(root) == ["casetest.txt"]
        assert source.read_text() == "case renamed\n"
        source.unlink()
        print("PASS native alias-source move to exact original updates same entry")

        source.write_text("case ok\n")
        target = root / "occupied.txt"
        target.write_text("existing content\n")
        collision = plan(
            "*** Update File: casetest.txt\n*** Move to: occupied.txt\n@@\n-case ok\n+case renamed"
        )
        try:
            patcher.apply_plan(str(root), collision)
            raise AssertionError("collision was not refused")
        except patcher.PatchError as error:
            assert "target already exists" in str(error), str(error)
        assert target.read_text() == "existing content\n"
        target.unlink()
        os.link(source, target)
        try:
            patcher.apply_plan(str(root), collision)
            raise AssertionError("distinct hard link was not refused")
        except patcher.PatchError as error:
            assert "target already exists" in str(error), str(error)
        target.unlink()
        source.unlink()
        print("PASS native distinct target and hard-link collision refusal")

        source.write_text("case ok\n")
        injected = [False]

        def introduce_destination(old, new, **kwargs):
            if new == "CaseTest.txt" and not injected[0]:
                injected[0] = True
                fd = os.open(new, os.O_WRONLY | os.O_CREAT | os.O_EXCL,
                             0o640, dir_fd=kwargs["dst_dir_fd"])
                os.write(fd, b"concurrent content\n")
                os.close(fd)
            patcher._rename_noreplace(old, new, **kwargs)

        try:
            patcher.apply_plan(str(root), move, rename_noreplace=introduce_destination)
            raise AssertionError("racing target was not refused")
        except patcher.PatchRollbackError as error:
            artifacts = error.recovery_artifacts
            assert len(artifacts) == 2
            assert {Path(path).read_text() for path in artifacts} == {"case ok\n", "case renamed\n"}
            assert all(Path(path).stat().st_mode & 0o777 == 0o600 for path in artifacts)
        assert (root / "CaseTest.txt").read_text() == "concurrent content\n"
        assert (root / "CaseTest.txt").stat().st_mode & 0o777 == 0o640
        (root / "CaseTest.txt").unlink()
        for artifact in artifacts:
            Path(artifact).unlink()
        print(
            "PASS native concurrent destination preserved; "
            "rollback failure retains private recovery"
        )

        anchors = root / "anchors.txt"
        anchors.write_text("section\nvalue\n")
        patcher.apply_plan(
            str(root), plan("*** Update File: anchors.txt\n@@ section\n@@ value\n+inserted")
        )
        assert anchors.read_text() == "section\ninserted\nvalue\n"
        anchors.unlink()
        print("PASS native bodyless-anchor hunk on Apple Python")

        for name in ("plain", "compressed"):
            entry = bundle[name]
            command = entry["command"].replace("/__PROBE_ROOT__", str(root))
            result = subprocess.run(["/bin/bash", "-c", command], text=True, capture_output=True,
                                    env=dict(os.environ, PATH="/usr/bin:/bin:/usr/sbin:/sbin"))
            assert result.returncode == 0, result.stderr
            assert json.loads(result.stdout)["ok"], result.stdout
            assert (root / "added.txt").read_text() == entry["expected"]
            (root / "added.txt").unlink()
            assert os.listdir(root) == []
            print("PASS production " + name + " transport, BSD chmod, Apple Python, cleanup")

        raw = root / "raw.txt"
        raw.write_bytes(b"native raw bytes\r\n")
        command = bundle["raw"].replace("/__PROBE_SOURCE__", str(raw))
        result = subprocess.run(["/bin/bash", "-c", command], text=True, capture_output=True)
        assert result.returncode == 0, result.stderr
        import base64
        encoded, metadata = result.stdout.splitlines()
        assert base64.b64decode(encoded) == raw.read_bytes()
        assert metadata.startswith("ODIN_READ_FILE_RAW_META_V1\t")
        print("PASS production raw read_file transport, BSD chmod, byte-faithful CRLF")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    modes = parser.add_mutually_exclusive_group(required=True)
    modes.add_argument("--prepare", type=Path)
    modes.add_argument("--run", type=Path)
    args = parser.parse_args()
    prepare(args.prepare) if args.prepare else run(args.run)
