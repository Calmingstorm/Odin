#!/usr/bin/python3
"""Private GUI-only acceptance, narrowed in R7 to offered Writer save / Inkscape.

Historical filename retained; Writer close/reopen and Calc/Draw are not offered.
No operator display, no script-generated target documents.
"""

import argparse
import asyncio
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import uuid
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

from fixture_source import replace_code
from r6_reaper import Reaper


def record(kind, **fields):
    print(json.dumps({"kind": kind, **fields}), flush=True)


def outer(args):
    if not args.execute_isolated:
        raise RuntimeError("explicit_private_execution_required")
    reaper = Reaper()
    source = Path(__file__).resolve().parent
    out = Path(tempfile.mkdtemp(prefix="attached-apps-r6-", dir="/tmp"))
    tree = out / "tree"
    harness = tree / "scripts/computer-feasibility"
    harness.mkdir(parents=True)
    for name in (
        "x11-run.py",
        "x11_records.py",
        "x11-passwd",
        "x11-group",
        "x11-crossuid-passwd",
        "x11-crossuid-sudoers",
        "x11-crossuid-pam",
        "x11-crossuid-bootstrap.sh",
        "x11-owned-bus.conf",
        "r6_reaper.py",
        "fixture_source.py",
    ):
        shutil.copy2(source / name, harness / name)
    shutil.copy2(__file__, harness / "x11-crossuid-corpus.py")
    (harness / "task").write_text(args.task)
    workspace = out / "workspace"
    subprocess.run(
        ["sudo", "-n", "install", "-d", "-m", "755", "-o", "0", "-g", "0", str(workspace)],
        check=True,
        timeout=5,
    )
    (tree / "src").symlink_to(source.parents[1] / "src", target_is_directory=True)
    # Contained copy of reviewed R5 launcher; no changes to original harness.
    runner = (harness / "x11-run.py").read_text()
    runner = replace_code(runner, "'MemoryMax=1G'", "'MemoryMax=2G'")
    runner = replace_code(runner, "'RuntimeMaxSec=120'", "'RuntimeMaxSec=240'")
    runner = replace_code(
        runner,
        "'--ro-bind', '/etc/fonts', '/etc/fonts',",
        "'--ro-bind', '/etc/fonts', '/etc/fonts', "
        "'--ro-bind', '/etc/libreoffice', '/etc/libreoffice',",
    )
    runner = replace_code(
        runner,
        "'--size', '268435456', '--tmpfs', '/workspace',",
        "'--bind', '/r6-output', '/workspace',",
    )
    runner = replace_code(
        runner,
        "f'BindReadOnlyPaths={root}:/xi2-source',",
        "f'BindReadOnlyPaths={root}:/xi2-source', 'BindPaths=" + str(workspace) + ":/r6-output',",
    )
    runner = replace_code(
        runner,
        "'XI2_PRIVATE_SANDBOX': '1'",
        "'XI2_PRIVATE_SANDBOX': '1', 'SAL_USE_VCLPLUGIN': 'gtk3'",
    )
    (harness / "x11-run.py").write_text(runner)
    result = 1
    try:
        with (out / "runner.log").open("w") as log:
            p = subprocess.Popen(
                [
                    "/usr/bin/python3",
                    str(harness / "x11-run.py"),
                    "--execute-isolated",
                    "--crossuid-guardian",
                ],
                stdout=log,
                stderr=log,
                env={"PATH": "/usr/bin", "LANG": "C.UTF-8"},
            )
            try:
                result = p.wait(timeout=260)
            except subprocess.TimeoutExpired:
                result = 124
    finally:
        cleanup = reaper.close()
        summary = {"exit_code": result, "outer_cleanup": cleanup, "evidence": str(out)}
        (out / "outer.json").write_text(json.dumps(summary, indent=2) + "\n")
        record("outer_result", **summary)
    return result


async def exercise(task, app, d):
    sys.path.insert(0, "/code")
    from src.computer.controller import ComputerController
    from src.computer.models import ComputerError, RequestContext
    from src.computer.runtime.x11_attached import X11AttachedBackend
    from src.computer.store import ComputerStore
    from src.computer.vision import observation_image

    profile = "inkscape" if task == "inkscape" else "writer"

    class EvidenceBackend(X11AttachedBackend):
        input_calls = 0

        async def _input_worker(self, request):
            self.input_calls += 1
            return await super()._input_worker(request)

        async def act(self, payload):
            try:
                result = await super().act(payload)
                record("native_receipt", receipt=result)
                return result
            except Exception as exc:
                record("native_error", code=str(exc)[:160], error_type=type(exc).__name__)
                raise

    backend = EvidenceBackend(
        enabled=True,
        display_name=":177",
        monitor_names=["screen"],
        app_profile=profile,
        input_enabled=True,
        runtime_sudo=True,
    )
    store = ComputerStore(Path("/workspace/private/state"), Path("/workspace/private/evidence"))
    ctx = RequestContext("private-r6", "scratch-only", uuid.uuid4().hex, "localhost")
    ctl = ComputerController(store, lambda _: backend, lambda c: c == ctx, enabled=True)
    index = 0
    grant = None

    def census():
        prop = d.screen().root.get_full_property(d.intern_atom("_NET_CLIENT_LIST"), 0)
        rows = []
        for xid in prop.value if prop else []:
            w = d.create_resource_object("window", xid)
            t = w.get_full_property(d.intern_atom("_NET_WM_NAME"), 0)
            kind = w.get_full_property(d.intern_atom("_NET_WM_WINDOW_TYPE"), 0)
            parent = w.get_wm_transient_for()
            rows.append(
                {
                    "xid": int(xid),
                    "title": bytes(t.value).decode("utf-8") if t else w.get_wm_name(),
                    "wm_class": w.get_wm_class(),
                    "transient": parent.id if parent else None,
                    "types": [d.get_atom_name(int(v)) for v in kind.value] if kind else [],
                }
            )
        record("private_window_census", windows=rows)
        return rows

    async def observe():
        nonlocal index
        census()
        current = store.get_session(grant["session_id"])
        r = await ctl.observe(
            ctx, {"session_id": current.session_id, "generation": current.generation}
        )
        obs = ctl._live[current.session_id].observations[r["observation_id"]]
        assert observation_image(r["image_bytes"], obs.frame_metadata)["__computer_frame__"]
        await ctl.validate_observation_delivery(ctx, obs.frame_metadata, obs.image_sha256)
        Path(f"/workspace/frame-{index:03}.png").write_bytes(r["image_bytes"])
        index += 1
        record("observation", frame=index - 1, focused=obs.focused, modal_kind=obs.modal_kind)
        return obs

    async def act_once(operation, **fields):
        obs = await observe()
        payload = {
            "session_id": obs.session_id,
            "generation": obs.generation,
            "consent_generation": obs.source.consent_generation,
            "source_id": obs.source.source_id,
            "source_revision": obs.source.source_revision,
            "observation_id": obs.observation_id,
            "action_id": uuid.uuid4().hex,
            "operation": operation,
            "expect": {"type": "visual_change"},
            **fields,
        }
        if obs.modal is not None:
            payload["expected_modal"] = obs.modal
        result = await ctl.act(ctx, payload)
        record("action", operation=operation, key=fields.get("key"), status=result["status"])
        if result["status"] in {"unknown", "unavailable"}:
            census()
            raise RuntimeError("uncertain_action_no_replay")
        await asyncio.sleep(0.5)

    async def act(operation, **fields):
        for attempt in range(5):
            try:
                return await act_once(operation, **fields)
            except Exception as exc:
                if (
                    str(exc) not in {"visual_target_changed", "stale_source_binding"}
                    or attempt == 4
                ):
                    raise
                record("predispatch_refresh", code=str(exc))
                await asyncio.sleep(0.15)

    try:
        census()
        if task == "census":
            return
        grant = await ctl.session(ctx, {"operation": "start", "app": profile})
        await observe()
        marker = "R6 private note."
        if task == "writer":
            # Ordinary controller refusal, before native dispatch or any document
            # mutation. These are lifecycle/menu paths, not a shortcut blacklist.
            for operation, fields in [
                ("click", {"x": 45, "y": 167}),
                ("drag", {"points": [[100, 100], [110, 110]], "duration": 0.1}),
                ("key", {"key": "ctrl+o"}),
                ("key", {"key": "ctrl+n"}),
            ]:
                try:
                    await act_once(operation, **fields)
                except ComputerError as exc:
                    assert exc.code == "application_task_not_offered"
                    assert backend.input_calls == 0
                    record(
                        "policy_refused",
                        operation=operation,
                        key=fields.get("key"),
                        reason=exc.code,
                        native_input_calls=backend.input_calls,
                    )
                else:
                    raise RuntimeError("unoffered_writer_action_not_refused")
            await act("type", text=marker)
            await act("key", key="Return")
            await act("key", key="ctrl+b")
            await act("type", text="Save verified.")
            await act("key", key="ctrl+b")
        elif task == "inkscape":
            await act("type", text="r")
            await act("drag", points=[[550, 350], [650, 400], [750, 480]], duration=0.3)
            await act("key", key="Escape")
            await act("type", text="e")
            await act("drag", points=[[600, 520], [660, 570], [720, 620]], duration=0.3)
            await act("key", key="Escape")
        else:
            raise RuntimeError("application_task_not_offered")
        suffix = {"writer": "odt", "inkscape": "svg"}[task]
        target = Path("/workspace/home/result." + suffix)
        await act("key", key="ctrl+shift+s")
        await act("key", key="ctrl+a")
        await act("type", text=str(target))
        await act("key", key="Return")
        await asyncio.sleep(1)
        if task == "inkscape":
            content = target.read_text()
            assert "<rect" in content and ("<ellipse" in content or "<circle" in content)
        else:
            with zipfile.ZipFile(target) as archive:
                assert archive.testzip() is None
                content = archive.read("content.xml").decode("utf-8")
            assert "R6 private note." in content
        record(
            "saved_artifact",
            task=task,
            size=target.stat().st_size,
            sha256=hashlib.sha256(target.read_bytes()).hexdigest(),
            content_verified=True,
        )
        await observe()
        if task == "writer":
            saved_windows = {w["xid"] for w in census() if "result.odt" in (w["title"] or "")}
            assert len(saved_windows) == 1
            # Verify the actual GUI-written ZIP/XML. Disk parsing is not a claim
            # of a GUI close/reopen; that unqualified lifecycle is not attempted.
            with zipfile.ZipFile(target) as archive:
                assert archive.testzip() is None
                document = ET.fromstring(archive.read("content.xml"))
            ns = {
                "text": "urn:oasis:names:tc:opendocument:xmlns:text:1.0",
                "style": "urn:oasis:names:tc:opendocument:xmlns:style:1.0",
                "fo": "urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0",
            }
            paragraphs = document.findall(".//text:p", ns)
            assert ["".join(p.itertext()) for p in paragraphs] == [marker, "Save verified."]
            bold_styles = {
                s.get("{" + ns["style"] + "}name")
                for s in document.findall(".//style:style", ns)
                if s.find("style:text-properties", ns) is not None
                and s.find("style:text-properties", ns).get("{" + ns["fo"] + "}font-weight")
                == "bold"
            }
            spans = paragraphs[1].findall(".//text:span", ns)
            assert (
                paragraphs[1].get("{" + ns["text"] + "}style-name") in bold_styles
                and paragraphs[1].text == "Save verified."
            ) or any(
                s.get("{" + ns["text"] + "}style-name") in bold_styles
                and "".join(s.itertext()) == "Save verified."
                for s in spans
            )
            record(
                "task_complete",
                task_scope="writer_keyboard_note_bold_save",
                saved=True,
                reopened=False,
                close_reopen="not_offered",
                saved_windows=sorted(saved_windows),
                paragraphs=[marker, "Save verified."],
                second_paragraph_bold=True,
                final_frame=index - 1,
                sha256=hashlib.sha256(target.read_bytes()).hexdigest(),
            )
        else:
            record("task_partial", saved=True, reopened=False)
    finally:
        await ctl.close()
        store.close()
        record("controller_cleanup", children_remaining=len(backend._children))


def inner():
    assert os.environ.get("XI2_PRIVATE_SANDBOX") == "1"
    assert os.environ.get("DISPLAY") == ":177" and os.geteuid() == 0
    assert not any(Path("/home").iterdir()) and not Path("/tmp/.X11-unix/X0").exists()
    task = Path("/harness/task").read_text()
    reaper = Reaper()
    children = []
    d = None
    passed = False

    def spawn(name, argv):
        log = Path("/workspace/" + name + ".log").open("w")
        p = subprocess.Popen(
            [
                "setpriv",
                "--reuid=65534",
                "--regid=65534",
                "--clear-groups",
                "--bounding-set=-all",
                "--no-new-privs",
                *argv,
            ],
            stdout=log,
            stderr=log,
        )
        children.append((p, log))
        return p

    def wait(test):
        for _ in range(150):
            value = test()
            if value:
                return value
            time.sleep(0.1)
        raise RuntimeError("private_fixture_start_timeout")

    try:
        from Xlib import X, display

        gtk = Path("/workspace/home/.config/gtk-3.0")
        gtk.mkdir(parents=True)
        (gtk / "settings.ini").write_text(
            "[Settings]\ngtk-cursor-blink=true\ngtk-cursor-blink-time=1200\n"
            if task == "writer"
            else "[Settings]\ngtk-cursor-blink=false\n"
        )
        for path in (gtk.parent, gtk, gtk / "settings.ini"):
            os.chown(path, 65534, 65534)
        if task == "inkscape":
            profile = Path("/workspace/home/.config/inkscape")
            profile.mkdir(parents=True)
            settings = profile / "preferences.xml"
            settings.write_text(
                '<inkscape version="1"><group id="options">'
                '<group id="boot" enabled="0"/></group></inkscape>'
            )
            for path in (profile.parent, profile, settings):
                os.chown(path, 65534, 65534)
        if task != "inkscape":
            profile = Path("/workspace/home/profile/user")
            profile.mkdir(parents=True)
            settings = profile / "registrymodifications.xcu"
            settings.write_text(
                '<?xml version="1.0" encoding="UTF-8"?>'
                '<oor:items xmlns:oor="http://openoffice.org/2001/registry">'
                '<item oor:path="/org.openoffice.Office.Common/Misc">'
                '<prop oor:name="ShowTipOfTheDay" oor:op="fuse">'
                "<value>false</value></prop></item></oor:items>"
            )
            for path in (profile.parent, profile, settings):
                os.chown(path, 65534, 65534)
        Path("/tmp/.X11-unix").mkdir(mode=0o1777)
        os.chmod("/tmp/.X11-unix", 0o1777)
        spawn(
            "xvfb",
            [
                "Xvfb",
                ":177",
                "-screen",
                "0",
                "1280x900x24",
                "-nolisten",
                "tcp",
                "-noreset",
                "-extension",
                "GLX",
            ],
        )
        wait(
            lambda: (
                subprocess.run(
                    ["xdpyinfo", "-display", ":177"],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                ).returncode
                == 0
            )
        )
        spawn("wm", ["openbox", "--sm-disable"])
        d = display.Display(":177")
        wait(
            lambda: d.screen().root.get_full_property(d.intern_atom("_NET_SUPPORTING_WM_CHECK"), 0)
        )
        app_args = (
            ["inkscape"]
            if task == "inkscape"
            else [
                "soffice",
                "-env:UserInstallation=file:///workspace/home/profile",
                "--norestore",
                "--nofirststartwizard",
                "--" + ("writer" if task == "census" else task),
            ]
        )
        app = spawn(
            "app",
            ["dbus-run-session", "--config-file=/harness/x11-owned-bus.conf", "--", *app_args],
        )

        def find():
            prop = d.screen().root.get_full_property(d.intern_atom("_NET_CLIENT_LIST"), 0)
            for xid in prop.value if prop else []:
                w = d.create_resource_object("window", xid)
                if (
                    any(p in str(w.get_wm_class()).lower() for p in ("libreoffice", "inkscape"))
                    and w.get_attributes().map_state == X.IsViewable
                ):
                    return w

        target = wait(find)
        subprocess.run(
            ["xdotool", "windowsize", str(target.id), "1200", "840"], check=True, timeout=3
        )
        subprocess.run(["xdotool", "windowmove", str(target.id), "20", "20"], check=True, timeout=3)
        subprocess.run(
            ["xdotool", "windowactivate", "--sync", str(target.id)], check=True, timeout=3
        )
        time.sleep(2)
        asyncio.run(asyncio.wait_for(exercise(task, app, d), 180))
        passed = True
    except Exception as exc:
        record("failure", error_type=type(exc).__name__, code=str(exc)[:140])
    finally:
        if d:
            d.close()
        cleanup = reaper.close()
        for p, log in children:
            p.wait(timeout=1)
            log.close()
        record("inner_cleanup", **cleanup)
        Path("/workspace/inner.json").write_text(
            json.dumps({"passed": passed, "cleanup": cleanup}) + "\n"
        )
    return 0 if passed else 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--execute-isolated", action="store_true")
    parser.add_argument("--task", choices=["census", "writer", "inkscape"], default="writer")
    args = parser.parse_args()
    raise SystemExit(inner() if os.environ.get("XI2_PRIVATE_SANDBOX") == "1" else outer(args))
