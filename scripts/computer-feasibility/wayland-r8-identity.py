"""Collect exact executable/mapped-library identity in owned container only."""

import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path


def identify(pid, backend):
    assert Path("/.dockerenv").exists() and os.environ["HOME"] == "/tmp/home"
    proc = Path("/proc") / str(pid)
    before = (proc / "stat").read_text().rsplit(")", 1)[1].split()[19]
    paths = sorted(
        {
            line.split()[-1]
            for line in (proc / "maps").read_text().splitlines()
            if len(line.split()) >= 6 and line.split()[-1].startswith("/")
        }
    )
    selected = [
        p for p in paths if any(s in p for s in ("libmutter-", "/gnome-shell", "libeis-", "libei."))
    ]
    mapped = []
    for name in selected:
        path = proc / "root" / name.lstrip("/")
        info = path.stat()
        mapped.append(
            dict(
                path=name,
                sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
                device=info.st_dev,
                inode=info.st_ino,
                bytes=info.st_size,
            )
        )
    argv = (proc / "cmdline").read_bytes().replace(b"\0", b" ").decode().strip()
    assert "--headless" in argv if backend == "native-headless" else "--nested" in argv
    assert any("/libmutter-16.so." in p["path"] for p in mapped)
    assert before == (proc / "stat").read_text().rsplit(")", 1)[1].split()[19]
    return dict(
        schema=1,
        pid=pid,
        start_ticks=before,
        uid=proc.stat().st_uid,
        argv=argv,
        backend=backend,
        mapped_files=mapped,
        boot_id=Path("/proc/sys/kernel/random/boot_id").read_text().strip(),
        packages=subprocess.check_output(
            [
                "dpkg-query",
                "-W",
                "gnome-shell",
                "libmutter-16-0",
                "libei1",
                "libeis1",
                "xdg-desktop-portal",
                "xdg-desktop-portal-gnome",
            ],
            text=True,
        ),
        physical_input=False,
        no_libinput=backend == "native-headless",
    )


if __name__ == "__main__":
    result = identify(int(sys.argv[1]), sys.argv[2])
    Path(sys.argv[3]).write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result))
