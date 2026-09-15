#!/usr/bin/env python3
"""Guest-only native owner prerequisite. Not recovery qualification.

Use the sibling live-qualification arguments plus --lost-ack to select
the unread-ACK variant. Real native owner and
receiver evidence only. No controller, durable takeover, or failed-release claim.

The manifest and its parent directories are provisioned guest-fixture inputs,
not a production trust root. Image checks pin the descriptor while hashing and
retain its identity for the mapped-ELF check; they do not authenticate the manifest.
"""

import argparse
import hashlib
import importlib.util
import json
import os
import signal
import socket
import stat
import time
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "narrow", Path(__file__).with_name("hyprland-live-qualification.py")
)
narrow = importlib.util.module_from_spec(spec)
spec.loader.exec_module(narrow)
IDENTITY = ("instance_id", "plugin_epoch", "ledger_id", "guardian_pid", "guardian_uid",
            "guardian_start_ticks", "recovery_pid", "recovery_uid", "recovery_start_ticks")


def redact(row):
    if isinstance(row, dict):
        return {k: "[REDACTED]" if any(s in k for s in ("token", "capability")) else redact(v)
                for k, v in row.items()}
    if isinstance(row, list):
        return [redact(v) for v in row]
    return row


def validate(row, owner, command):
    narrow.req(row.get("ok") is True, "native refusal")
    narrow.req(
        all(type(row.get(k)) is type(owner[k]) and row.get(k) == owner[k] for k in IDENTITY),
        "owner mismatch",
    )
    narrow.req(row.get("command_id") == command, "command mismatch")
    facts = ("owner_matched", "revoked", "release_ack", "ledger_empty")
    narrow.req(
        all(row.get(k) is True for k in facts) and row.get("unknown_release") is False,
        "release unproven",
    )
    narrow.req(row.get("receiver_release_verified") is False, "false receiver claim")


def checked_image(image, digest, uid):
    """Hash a stable no-follow image descriptor in the provisioned guest fixture."""
    stable = ("st_dev", "st_ino", "st_size", "st_mtime_ns", "st_ctime_ns", "st_mode", "st_uid")
    # Nonblocking also prevents a substituted FIFO from hanging before fstat.
    fd = os.open(image, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC | os.O_NONBLOCK)
    try:
        before = os.fstat(fd)
        narrow.req(
            stat.S_ISREG(before.st_mode) and before.st_uid in (0, uid)
            and not before.st_mode & 0o022,
            "plugin artifact type/owner/mode invalid",
        )
        hashed = hashlib.sha256()
        while chunk := os.read(fd, 1024 * 1024):
            hashed.update(chunk)
        after = os.fstat(fd)
        current = image.lstat()
        narrow.req(
            all(getattr(before, key) == getattr(after, key) == getattr(current, key)
                for key in stable),
            "plugin changed while hashed",
        )
        narrow.req(hashed.hexdigest() == digest, "plugin hash mismatch")
        return before
    finally:
        os.close(fd)


class Recovery(narrow.Harness):
    def manifest_check(self):
        """Check a provisioned guest image, not a production manifest trust root."""
        path = Path(self.a.manifest)
        narrow.req(path.is_absolute(), "manifest path not absolute")
        manifest = json.loads(path.read_text())
        narrow.req(type(manifest.get("schema")) is int and manifest["schema"] in (1, 2)
                   and manifest.get("hyprland_version") == "0.55.2"
                   and manifest.get("hyprland_commit") == "39d7e209c79d451efab1b21151d5938289da838d"
                   and type(manifest.get("runtime_qualified")) is bool, "manifest tuple invalid")
        digest, build = manifest.get("plugin_sha256"), manifest.get("companion_build_id")
        narrow.req(
            isinstance(digest, str) and narrow.HEX64.fullmatch(digest)
            and isinstance(build, str) and narrow.HEX64.fullmatch(build),
            "manifest digest invalid",
        )
        name = manifest.get("plugin_filename")
        narrow.req(name == f"odin-hyprland-scope-{digest}.so", "manifest filename invalid")
        image = path.parent / name
        before = checked_image(image, digest, self.uid)
        self.artifact_identity = before
        row = self.call({"op": "status"}, True)
        narrow.req(row.get("version") == 1 and row.get("scope_protocol_version") == 1
                   and row.get("companion_build_id") == build
                   and row.get("compositor_pid") == self.pid
                   and row.get("compositor_uid") == self.uid
                   and str(row.get("compositor_start_ticks")) == str(self.compositor["start_ticks"])
                   and row.get("boot_id") == (
                       Path("/proc/sys/kernel/random/boot_id").read_text().strip()
                   ), "plugin process identity mismatch")
        narrow.req(row.get("armed") is False and row.get("failed") is False
                   and row.get("keys") == 0 and row.get("buttons") == 0, "plugin initially unclean")
        self.report["attestation"] = {
            "plugin_sha256": digest, "companion_build_id": build,
            "artifact_owner_uid": before.st_uid, "compositor": self.compositor,
        }

    def run(self):
        g = p = None
        code = 1
        self.report.update(
            qualification_scope="native-owner-prerequisite-only", runtime_qualified=False
        )
        try:
            self.report["boot_id"] = Path("/proc/sys/kernel/random/boot_id").read_text().strip()
            # Match the hashed inode, never a newly resolved manifest/image path.
            artifact = self.artifact_identity
            maps = []
            for line in Path(f"/proc/{self.pid}/maps").read_text().splitlines():
                fields = line.split(None, 5)
                major, minor = (int(v, 16) for v in fields[3].split(":"))
                if (int(fields[4]) == artifact.st_ino
                        and os.makedev(major, minor) == artifact.st_dev):
                    maps.append(line)
            narrow.req(
                any("x" in line.split()[1] for line in maps), "manifest ELF not mapped executable"
            )
            self.report["mapped_plugin"] = maps
            p, path = self.launch("owner")
            identity = self.select(p)
            self.report["capture"] = self.capture(identity)
            g = narrow.Guardian(self, "owner")
            status = self.call({"op": "status"}, True)
            owner = self.call({
                "op": "owner_capture", "instance_id": status["instance_id"],
                "plugin_epoch": status["plugin_epoch"], "guardian_pid": g.p.pid,
                "guardian_uid": self.uid,
                "guardian_start_ticks": str(g.process_identity["start_ticks"]),
            }, True)
            self.report["owner"] = redact(owner)
            request = {k: owner[k] for k in IDENTITY}
            request.update(op="owner_reconcile", command_id="release-one")
            snapshot = self.snapshot(identity)
            x, y = self.point(snapshot)
            # 120ms plus native 100ms cleanup reserve fits the 250ms lease.
            g.batch(snapshot["token"], f"L 272 2 120 {x:.3f} {y:.3f} {x+5:.3f} {y:.3f}")
            narrow.req(g.until({"begun", "closed"}, 1).get("event") == "begun", "arm refused")
            narrow.wait(lambda: any(r.get("event") == "pointer_button" and r.get("state") == 1
                                   for r in narrow.events(path)), .2, "receiver down absent")
            narrow.req(narrow.pin(g.p.pid, self.uid) == g.process_identity, "guardian changed")
            os.kill(g.p.pid, signal.SIGSTOP)
            narrow.req(narrow.released_events(path) is None, "release preceded fault")
            self.report["release_submission_ns"] = time.monotonic_ns()
            if self.a.lost_ack:
                with narrow.connect(self.a.scope_socket, self.pid, self.uid) as sock:
                    sock.sendall(json.dumps(request).encode() + b"\n")
                    narrow.wait(lambda: narrow.released_events(path), 1, "receiver up absent")
                self.report["mutation_ack_deliberately_unread"] = True
                request["op"] = "owner_status"
            row = self.call(request)
            self.report["reconciliation"] = row
            validate(row, owner, "release-one")
            narrow.wait(lambda: narrow.released_events(path), 1, "receiver up absent")
            barrier = narrow.receiver_barrier(p, path, 0)
            rows = [r for r in narrow.events(path) if r.get("event") == "pointer_button"]
            narrow.req(
                [(r["button"], r["state"]) for r in rows] == [(272, 1), (272, 0)],
                "receiver transition mismatch",
            )
            narrow.req(
                rows[1]["monotonic_ns"] >= self.report["release_submission_ns"], "premature release"
            )
            request["op"] = "owner_status"
            row = self.call(request)
            self.report["query"] = row
            validate(row, owner, "release-one")
            request.update(op="owner_retire", command_id="retire-one")
            row = self.call(request)
            self.report["retirement"] = row
            validate(row, owner, "retire-one")
            narrow.req(
                row.get("native_resources_retired") is True and row.get("retired") is True
                and row.get("retirement_evidence_version") == 1
                and row.get("retirement_evidence_kind") == "exact-client-resources-destroyed",
                "retirement unproven",
            )
            os.kill(g.p.pid, signal.SIGCONT)
            g.finish()
            narrow.receiver_barrier(p, path, barrier)
            narrow.req(
                len([r for r in narrow.events(path) if r.get("event") == "pointer_button"]) == 2,
                "late input",
            )
            self.report.update(
                passed=True, guardian_exit=g.p.returncode, clean_retirement_only=True
            )
            code = 0
        except BaseException as error:
            self.report.update(passed=False, error=f"{type(error).__name__}: {error}")
        finally:
            try:
                if g and g.p.poll() is None:
                    narrow.req(
                        narrow.pin(g.p.pid, self.uid) == g.process_identity,
                        "guardian changed at cleanup",
                    )
                    # Queue cancellation before resuming a stopped guardian. Do
                    # not deliberately resume an uncertain action tail.
                    g.term()
                    os.kill(g.p.pid, signal.SIGCONT)
                    g.cleanup(g.action_submitted)
                    g.finish()
                    self.report["guardian_cleanup_exit"] = g.p.returncode
                if p:
                    self.stop(p)
            except BaseException as error:
                code = 2
                self.report.update(passed=False, cleanup_error=str(error))
            (self.logs / "report.json").write_text(json.dumps(redact(self.report), indent=2) + "\n")
        return code


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--lost-ack", action="store_true")
    for name in ("wayland-socket", "scope-socket", "manifest", "guardian", "capture",
                 "receiver", "output-name", "log-dir"):
        parser.add_argument("--" + name, required=True)
    for name in ("compositor-pid", "logical-width", "logical-height"):
        parser.add_argument("--" + name, required=True, type=int)
    parser.add_argument("--capture-timeout-ms", type=int, default=3000)
    args = parser.parse_args(argv)
    if socket.gethostname() != "odin-hyprland-lab":
        parser.error("native fault execution requires the odin-hyprland-lab guest")
    if args.compositor_pid <= 1 or not all(1 <= v <= 32768 for v in
            (args.logical_width, args.logical_height)) or not 1 <= args.capture_timeout_ms <= 30000:
        parser.error("invalid numeric identity/geometry/timeout")
    return Recovery(args).run()


if __name__ == "__main__":
    raise SystemExit(main())
