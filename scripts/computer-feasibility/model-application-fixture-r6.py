#!/usr/bin/env python3
"""Private Xvfb/nobody desktop for a finite model acceptance, not the main session.

Must run under owned-test-supervisor-r6.py as root. That supervisor adopts and
reaps app daemon descendants. Model driver uses read-only auth on the host; the
unprivileged app has a fresh HOME and private X cookie, never a live bus/cookie.
"""
import argparse
import json
import os
import pwd
import signal
import subprocess
import sys
import tempfile
import time
from pathlib import Path


def validate_fixture_args(args):
    if os.geteuid() != 0 or not 100 <= args.display <= 999:
        raise RuntimeError("root_and_disposable_display_required")
    evidence = Path(args.evidence).resolve()
    if evidence.exists() or not evidence.is_relative_to(Path("/home/odin")):
        raise RuntimeError("new_private_developer_evidence_path_required")
    parent = Path(f"/proc/{os.getppid()}/cmdline").read_bytes().split(b"\0")
    if not any(Path(os.fsdecode(arg)).name == "owned-test-supervisor-r6.py"
               for arg in parent if arg):
        raise RuntimeError("owned_outer_supervisor_required")


def main(args):
    validate_fixture_args(args)
    display = ":" + str(args.display)
    if Path(f"/tmp/.X11-unix/X{args.display}").exists():
        raise RuntimeError("display_already_in_use")
    root = Path(tempfile.mkdtemp(prefix="model-app-r6-", dir="/tmp"))
    root.chmod(0o711)
    home = root / "home"
    home.mkdir(mode=0o700)
    user = pwd.getpwnam("nobody")
    os.chown(home, user.pw_uid, user.pw_gid)
    config = home / ".config" / "inkscape"
    config.mkdir(parents=True, mode=0o700)
    preferences = config / "preferences.xml"
    preferences.write_text('<inkscape version="1"><group id="options">'
                           '<group id="boot" enabled="0"/></group></inkscape>')
    for item in (home / ".config", config, preferences):
        os.chown(item, user.pw_uid, user.pw_gid)
    gtk = home / ".config" / "gtk-3.0"
    gtk.mkdir(mode=0o700)
    gtk_settings = gtk / "settings.ini"
    gtk_settings.write_text('[Settings]\ngtk-cursor-blink=false\n')
    for item in (gtk, gtk_settings):
        os.chown(item, user.pw_uid, user.pw_gid)
    authority = home / ".Xauthority"
    authority.touch(mode=0o600)
    subprocess.run(["xauth", "-f", str(authority), "add", display, ".", os.urandom(16).hex()],
                   check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=5)
    os.chown(authority, user.pw_uid, user.pw_gid)
    env = {"PATH": "/usr/bin:/bin", "HOME": str(home), "DISPLAY": display,
           "XAUTHORITY": str(authority), "LANG": "C.UTF-8", "NO_AT_BRIDGE": "1"}
    app_prefix = ["runuser", "-u", "nobody", "--", "env", "-i"]
    app_prefix += [key + "=" + value for key, value in env.items()]
    children = []
    log = (root / "fixture.log").open("wb")
    result = 1
    started = time.monotonic()

    def launch(argv):
        process = subprocess.Popen(argv, stdout=log, stderr=log, start_new_session=True)
        children.append(process)
        return process

    try:
        launch(["Xvfb", display, "-screen", "0", "1280x900x24", "-nolisten", "tcp",
                "-auth", str(authority), "-noreset"])
        for _ in range(50):
            if subprocess.run(["xdpyinfo"], env=env, stdout=subprocess.DEVNULL,
                              stderr=subprocess.DEVNULL, timeout=2).returncode == 0:
                break
            time.sleep(.1)
        else:
            raise RuntimeError("private_display_not_ready")
        launch(app_prefix + ["openbox", "--sm-disable"])
        time.sleep(.5)
        launch(app_prefix + ["dbus-run-session", "--", "inkscape"])
        time.sleep(4)
        driver = Path(__file__).with_name("model-application-r6.py")
        command = [sys.executable, str(driver), "--display", display, "--xauthority",
                   str(authority), "--monitor", "screen", "--fixture-home", str(home),
                   "--confirm-disposable", "--credentials", args.credentials,
                   "--model", args.model, "--evidence", args.evidence]
        process = subprocess.Popen(command, env={**os.environ, **env})
        children.append(process)
        result = process.wait(timeout=950)
    finally:
        for process in reversed(children):
            if process.poll() is None:
                process.send_signal(signal.SIGTERM)
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=5)
        log.close()
        report = {"fixture": str(root), "display": display, "driver_returncode": result,
                  "direct_children_waited": [{"pid": p.pid, "returncode": p.returncode}
                                             for p in children],
                  "seconds": round(time.monotonic() - started, 3),
                  "descendant_cleanup": "check_outer_owned_supervisor_report"}
        (root / "fixture-summary.json").write_text(json.dumps(report, indent=2))
        owner = int(os.environ.get("SUDO_UID", "0"))
        group = int(os.environ.get("SUDO_GID", "0"))
        evidence = Path(args.evidence)
        if evidence.is_dir():
            for item in [evidence, *evidence.rglob("*")]:
                if not item.is_symlink():
                    os.chown(item, owner, group)
        print(json.dumps(report), flush=True)
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--display", type=int, default=178)
    parser.add_argument("--credentials", required=True)
    parser.add_argument("--model", required=True)
    parser.add_argument("--evidence", required=True)
    raise SystemExit(main(parser.parse_args()))
