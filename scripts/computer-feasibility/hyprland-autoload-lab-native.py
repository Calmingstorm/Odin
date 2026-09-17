#!/usr/bin/env python3
"""Guest-only explicit load for narrow corpus, NOT managed-autoload evidence."""
import asyncio
from dataclasses import asdict
import json
import os
from pathlib import Path
import socket
import subprocess
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from src.computer.runtime.hyprland_discovery import HyprlandDiscoveryPolicy, HyprlandDiscoveryResolver
from src.computer.runtime.hyprland_identity import ExecutableTrust
from src.computer.runtime.hyprland_plugin import HyprlandPluginIPC, read_trusted_plugin_manifest


async def main():
    assert socket.gethostname() == "odin-hyprland-lab" and os.getuid() == 1000
    os.umask(0o077)
    trust = ExecutableTrust("/home/lab/lab-build/prefix/bin/Hyprland", "bfb6a200300e09b5929130d831c815242ec87ce98531ea25993a921aa9e2472b", "0.55.2", "39d7e209c79d451efab1b21151d5938289da838d", owner_uid=1000)
    resolved = await HyprlandDiscoveryResolver(HyprlandDiscoveryPolicy(1000, "/run/user/1000", trust)).resolve()
    manifest = read_trusted_plugin_manifest("/usr/local/lib/odin/build-identity.json")
    ipc = HyprlandPluginIPC(identity=resolved.identity, ipc_path=resolved.runtime_dir + "/hypr/" + resolved.instance_signature + "/.socket.sock")
    if manifest.approval.path not in Path(f"/proc/{resolved.pid}/maps").read_text():
        await ipc.load_fixed_plugin(manifest.approval.path)
    print(json.dumps({"mode": "explicit-fixed-path-load-not-managed-autoload", "discovery": asdict(resolved), "approval": asdict(manifest.approval)}), flush=True)
    env = dict(os.environ, XDG_RUNTIME_DIR=resolved.runtime_dir, WAYLAND_DISPLAY=resolved.wayland_display, HYPRLAND_INSTANCE_SIGNATURE=resolved.instance_signature)
    env["PATH"] = "/home/lab/lab-build/prefix/bin:" + env.get("PATH", "")
    # The old stdlib corpus requires an artifact owned by the compositor UID.
    # Its digest is identical to the independently retained mapped root-owned ELF.
    import shutil
    mirror = Path(sys.argv[1] + "-artifact-mirror")
    mirror.mkdir(mode=0o700)
    shutil.copyfile("/usr/local/lib/odin/build-identity.json", mirror / "build-identity.json")
    shutil.copyfile(manifest.approval.path, mirror / Path(manifest.approval.path).name)
    command = [sys.executable, str(Path(__file__).with_name("hyprland-live-qualification.py")), "--wayland-socket", resolved.runtime_dir + "/" + resolved.wayland_display, "--scope-socket", resolved.runtime_dir + "/odin-hyprland-scope.sock", "--manifest", str(mirror / "build-identity.json"), "--guardian", "/usr/local/lib/odin/odin-hyprland-input", "--capture", "/usr/local/lib/odin/odin-hyprland-capture", "--receiver", "/home/lab/qualification-receiver-build/receiver", "--output-name", "Virtual-1", "--log-dir", sys.argv[1], "--compositor-pid", str(resolved.pid), "--logical-width", "1280", "--logical-height", "800", "--include-sigterm-stroke"]
    print(json.dumps({"command": command}), flush=True)
    if "--sigterm-only" in sys.argv or "--stale-only" in sys.argv:
        # Independent scenario, never ignore or turn the failed stale case green.
        import importlib.util
        spec = importlib.util.spec_from_file_location("narrow", Path(__file__).with_name("hyprland-live-qualification.py"))
        narrow = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(narrow)
        stale_only = "--stale-only" in sys.argv
        sys.argv = command[1:]
        os.environ.update(env)
        original = narrow.Guardian
        class RecordedGuardian(original):
            def finish(self, seconds=2):
                rows = super().finish(seconds)
                (self.h.logs / "guardian-exit.json").write_text(json.dumps({"returncode": self.p.returncode}))
                return rows
        narrow.Guardian = RecordedGuardian
        harness = narrow.Harness(narrow.args())
        try:
            harness.stale() if stale_only else harness.sigterm()
            harness.report["passed"] = True
            return 0
        except Exception as exc:
            harness.report.update(passed=False, error=str(exc))
            return 1
        finally:
            (harness.logs / "report.json").write_text(json.dumps(narrow.redact(harness.report, harness.tokens), indent=2))
    return subprocess.call(command, env=env)


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
