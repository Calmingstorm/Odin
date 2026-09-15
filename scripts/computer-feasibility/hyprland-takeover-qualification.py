#!/usr/bin/env python3
"""Guest-only native-provider durable takeover prerequisite, NOT controller qualification.

Run as the compositor UID in the isolated KVM guest. Uses the recovery driver's
explicit arguments plus --compositor-executable and --compositor-sha256. Never
loads plugins or discovers another desktop. Private descriptors contain secrets;
retain them locally, never publish them with the redacted report.
"""
import argparse
import asyncio
from dataclasses import asdict, replace
import importlib.util
import json
import os
from pathlib import Path
import select
import signal
import socket
import stat
import subprocess
import sys
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
spec = importlib.util.spec_from_file_location(
    "takeover_recovery", Path(__file__).with_name("hyprland-recovery-qualification.py"))
recovery = importlib.util.module_from_spec(spec)
spec.loader.exec_module(recovery)
narrow = recovery.narrow

from src.computer.runtime.hyprland_identity import (  # noqa: E402
    ExecutableTrust, HyprlandIdentity, measure_process)
from src.computer.runtime.hyprland_scope import (  # noqa: E402
    HyprlandScopeFailure, HyprlandScopeProvider, owner_handle_from_record,
    owner_handle_to_record)


def private_write(path, value):
    """Create-only fsynced private evidence, including directory durability."""
    path = Path(path)
    parent = path.parent.lstat()
    narrow.req(stat.S_ISDIR(parent.st_mode) and parent.st_uid == os.geteuid()
               and not parent.st_mode & 0o077, "private directory required")
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "w", closefd=False) as out:
            json.dump(value, out, sort_keys=True)
            out.write("\n")
            out.flush()
            os.fsync(fd)
    finally:
        os.close(fd)
    fd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def private_read(path):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        info = os.fstat(fd)
        narrow.req(stat.S_ISREG(info.st_mode) and info.st_uid == os.geteuid()
                   and stat.S_IMODE(info.st_mode) == 0o600 and info.st_size <= 32768,
                   "private record type/owner/mode/size invalid")
        with os.fdopen(fd, closefd=False) as source:
            return json.load(source)
    finally:
        os.close(fd)


class AckDiscarded(RuntimeError):
    pass


class LostAckProvider(HyprlandScopeProvider):
    """Real authenticated mutation write; deliberately never consumes its reply."""
    lose_adoption_ack = False

    async def _request(self, request):
        if request.get("op") != "owner_reconnect" or not self.lose_adoption_ack:
            return await super()._request(request)
        self.lose_adoption_ack = False
        with narrow.connect(self.socket_path, self.expected_compositor_pid,
                            self.expected_uid) as sock:
            sock.sendall(json.dumps(request).encode("ascii") + b"\n")
            # Readability is deliberately not interpreted as success. The
            # authenticated query below is the only adoption confirmation.
            select.select([sock], [], [], .35)
        raise AckDiscarded("native adoption reply deliberately unread")


async def adopt_and_release(provider, original, directory, *, lost_ack=False):
    directory = Path(directory)
    command = "takeover-one"
    successor = narrow.pin(os.getpid(), os.geteuid())
    private_write(directory / "takeover-intent.json", {
        "original": owner_handle_to_record(original), "command_id": command,
        "successor": successor, "phase": "adopt", "monotonic_ns": time.monotonic_ns()})
    provider.lose_adoption_ack = lost_ack
    try:
        adopted = await provider.reconnect_owner(original, command_id=command)
    except Exception:
        # No mutation retry, including uncertain transport failures.
        adopted = await provider.reconnect_owner(original, command_id=command, query_only=True)
    private_write(directory / "adopted-owner.json", owner_handle_to_record(adopted))
    queried = await provider.reconnect_owner(original, command_id=command, query_only=True)
    narrow.req(queried == adopted, "adoption query changed owner")
    private_write(directory / "release-intent.json", {"command_id": command + "-release"})
    submitted = time.monotonic_ns()
    try:
        row = await provider.reconcile_owner(adopted, command_id=command + "-release")
    except Exception:
        row = await provider.owner_status(adopted, command_id=command + "-release")
    recovery.validate({"ok": True, **row}, asdict(adopted), command + "-release")
    query = await provider.owner_status(adopted, command_id=command + "-release")
    recovery.validate({"ok": True, **query}, asdict(adopted), command + "-release")
    private_write(directory / "retire-intent.json", {"command_id": command + "-retire"})
    try:
        retired = await provider.retire_owner(adopted, command_id=command + "-retire")
    except Exception:
        retired = await provider.owner_status(adopted, command_id=command + "-retire")
    recovery.validate({"ok": True, **retired}, asdict(adopted), command + "-retire")
    narrow.req(retired.get("native_resources_retired") is True and retired.get("retired") is True
               and retired.get("retirement_evidence_version") == 1
               and retired.get("retirement_evidence_kind") == "exact-client-resources-destroyed",
               "native retirement unproven")
    return {"adopted_owner": recovery.redact(owner_handle_to_record(adopted)),
            "release": row, "query": query, "retirement": retired,
            "release_submission_ns": submitted, "adoption_ack_deliberately_unread": lost_ack}


async def owner_worker(config_path):
    config = private_read(config_path)
    trust = ExecutableTrust(**config["trust"])
    pin = measure_process(config["pid"], config["uid"], trust, time.monotonic() + 3)
    provider = await HyprlandScopeProvider.from_identity(
        identity=HyprlandIdentity(pin, trust), runtime_dir=config["runtime_dir"])
    try:
        handle = await provider.capture_owner(config["guardian"])
        private_write(Path(config_path).parent / "original-owner.json", owner_handle_to_record(handle))
        private_write(Path(config_path).parent / "owner-ready.json", {"persisted": True})
        # Explicit parent command or parent EOF retires this recovery process,
        # not the guardian or its retained native ledger.
        await asyncio.to_thread(sys.stdin.buffer.read, 1)
    finally:
        await provider.close()


class Takeover(recovery.Recovery):
    def manifest_check(self):
        super().manifest_check()
        artifact = self.artifact_identity
        mapped = False
        for line in Path(f"/proc/{self.pid}/maps").read_text().splitlines():
            fields = line.split(None, 5)
            major, minor = (int(value, 16) for value in fields[3].split(":"))
            if (int(fields[4]) == artifact.st_ino
                    and os.makedev(major, minor) == artifact.st_dev and "x" in fields[1]):
                mapped = True
        narrow.req(mapped, "manifest ELF not mapped executable")
        self.report["mapped_manifest_plugin_verified"] = True

    async def execute(self):
        guardian = receiver = child = provider = None
        pidfd = None
        code = 1
        self.report.update(qualification_scope="native-provider-durable-takeover-prerequisite-only",
                           runtime_qualified=False, controller_durable_db_tested=False,
                           stop_race_tested=False, receiver_source_attribution=False)
        try:
            trust = ExecutableTrust(path=self.a.compositor_executable,
                                    sha256=self.a.compositor_sha256, version="0.55.2",
                                    commit="39d7e209c79d451efab1b21151d5938289da838d",
                                    owner_uid=self.a.compositor_owner_uid)
            identity = HyprlandIdentity(measure_process(self.pid, self.uid, trust,
                                                       time.monotonic() + 3), trust)
            runtime_dir = str(Path(self.a.scope_socket).parent)
            provider = await LostAckProvider.from_identity(identity=identity, runtime_dir=runtime_dir)
            narrow.req(provider.socket_path == self.a.scope_socket, "explicit scope socket mismatch")
            receiver, path = self.launch("takeover")
            target = self.select(receiver)
            self.report["capture"] = self.capture(target)
            guardian = narrow.Guardian(self, "takeover")
            private = self.logs / "private"
            private.mkdir(mode=0o700)
            config_path = private / "owner-config.json"
            private_write(config_path, {"trust": asdict(trust), "pid": self.pid, "uid": self.uid,
                "runtime_dir": runtime_dir, "guardian": {key: guardian.process_identity[key]
                                                         for key in ("pid", "uid", "start_ticks")}})
            with (self.logs / "owner-worker.log").open("w") as log:
                child = subprocess.Popen([sys.executable, str(Path(__file__).resolve()),
                    "--owner-worker", str(config_path)], stdin=subprocess.PIPE,
                    stdout=log, stderr=log, start_new_session=True)
            pidfd = os.pidfd_open(child.pid)
            narrow.wait(lambda: (private / "owner-ready.json").exists() or child.poll() is not None,
                        8, "owner persistence timeout")
            narrow.req((private / "owner-ready.json").exists(), "original owner exited before persistence")
            original = owner_handle_from_record(private_read(private / "original-owner.json"))
            narrow.req(original.recovery_pid == child.pid and original.recovery_uid == self.uid
                       and original.recovery_start_ticks == str(narrow.ticks(child.pid))
                       and original.compositor == identity, "original owner mismatch")
            self.report["original_owner"] = recovery.redact(owner_handle_to_record(original))
            private_write(private / "active-denial-intent.json", {
                "original": owner_handle_to_record(original), "command_id": "active-denial",
                "successor": narrow.pin(os.getpid(), os.geteuid())})
            try:
                await provider.reconnect_owner(original, command_id="active-denial")
            except HyprlandScopeFailure as error:
                narrow.req(str(error) == "hyprland_owner_recovery_still_live_or_unproven",
                           "wrong active-owner refusal")
                self.report["active_owner_denial"] = str(error)
            else:
                raise narrow.Refusal("living owner takeover accepted")
            wrong = replace(original, recovery_capability=("0" if original.recovery_capability[0] != "0"
                                                         else "1") + original.recovery_capability[1:])
            private_write(private / "capability-denial-intent.json", {
                "original": owner_handle_to_record(wrong), "command_id": "capability-denial",
                "successor": narrow.pin(os.getpid(), os.geteuid())})
            try:
                await provider.reconnect_owner(wrong, command_id="capability-denial")
            except HyprlandScopeFailure as error:
                narrow.req(str(error) == "hyprland_owner_adoption_authority_refused",
                           "wrong capability refusal")
                self.report["bad_authority_refusal"] = str(error)
            else:
                raise narrow.Refusal("wrong capability accepted")
            snapshot = self.snapshot(target)
            x, y = self.point(snapshot)
            guardian.batch(snapshot["token"], f"L 272 2 120 {x:.3f} {y:.3f} {x+5:.3f} {y:.3f}")
            narrow.req(guardian.until({"begun", "closed"}, 1).get("event") == "begun", "arm refused")
            narrow.wait(lambda: any(row.get("event") == "pointer_button" and row.get("state") == 1
                                   for row in narrow.events(path)), .2, "receiver down absent")
            narrow.req(narrow.pin(guardian.p.pid, self.uid) == guardian.process_identity, "guardian changed")
            os.kill(guardian.p.pid, signal.SIGSTOP)
            narrow.req(narrow.released_events(path) is None, "release preceded owner exit")
            child.stdin.write(b"X")
            child.stdin.flush()
            child.wait(timeout=2)
            poll = select.poll()
            poll.register(pidfd, select.POLLIN)
            evidence = poll.poll(0)
            narrow.req(child.returncode == 0 and evidence and evidence[0][1] == select.POLLIN,
                       "predecessor pidfd exit unproven")
            self.report["predecessor_pidfd_exited"] = True
            self.report.update(await adopt_and_release(provider, original, private, lost_ack=self.a.lost_ack))
            narrow.wait(lambda: narrow.released_events(path), 1, "receiver up absent")
            barrier = narrow.receiver_barrier(receiver, path, 0)
            rows = [r for r in narrow.events(path) if r.get("event") == "pointer_button"]
            narrow.req([(r["button"], r["state"]) for r in rows] == [(272, 1), (272, 0)],
                       "receiver transition mismatch")
            narrow.req(rows[1]["monotonic_ns"] >= self.report["release_submission_ns"],
                       "receiver release preceded explicit reconciliation")
            os.kill(guardian.p.pid, signal.SIGCONT)
            guardian.finish()
            narrow.receiver_barrier(receiver, path, barrier)
            narrow.req(len([r for r in narrow.events(path) if r.get("event") == "pointer_button"]) == 2,
                       "old guardian late input")
            self.report.update(passed=True, receiver_down_up_verified=True,
                               no_late_button_events=True, guardian_exit=guardian.p.returncode)
            code = 0
        except BaseException as error:
            # Exception strings can contain private records. Only static class
            # names enter reports; detailed artifacts remain private/local.
            self.report.update(passed=False, error_type=type(error).__name__)
            if isinstance(error, (narrow.Refusal, HyprlandScopeFailure, AckDiscarded)):
                self.report["error"] = str(error)
        finally:
            try:
                if child and child.poll() is None:
                    child.stdin.close()
                    child.wait(timeout=3)
                if guardian and guardian.p.poll() is None:
                    narrow.req(narrow.pin(guardian.p.pid, self.uid) == guardian.process_identity,
                               "guardian changed at cleanup")
                    guardian.term()
                    os.kill(guardian.p.pid, signal.SIGCONT)
                    guardian.cleanup(guardian.action_submitted)
                    guardian.finish()
                if receiver:
                    self.stop(receiver)
                if provider:
                    await provider.close()
            except BaseException as error:
                code = 2
                self.report.update(passed=False, cleanup_error_type=type(error).__name__)
            if pidfd is not None:
                os.close(pidfd)
            private_write(self.logs / "report.json", recovery.redact(self.report))
        return code


def main():
    if socket.gethostname() != "odin-hyprland-lab":
        raise narrow.Refusal("disposable KVM guest required")
    if len(sys.argv) == 3 and sys.argv[1] == "--owner-worker":
        # Do not emit tracebacks carrying secret descriptors.
        try:
            asyncio.run(owner_worker(sys.argv[2]))
            return 0
        except BaseException as error:
            print(type(error).__name__)
            return 1
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--lost-ack", action="store_true")
    for name in ("wayland-socket", "scope-socket", "manifest", "guardian", "capture",
                 "receiver", "output-name", "log-dir", "compositor-executable", "compositor-sha256"):
        parser.add_argument("--" + name, required=True)
    for name in ("compositor-pid", "logical-width", "logical-height"):
        parser.add_argument("--" + name, required=True, type=int)
    parser.add_argument("--capture-timeout-ms", type=int, default=3000)
    parser.add_argument("--compositor-owner-uid", type=int, default=0,
                        help="explicit approved executable owner UID (default root)")
    args = parser.parse_args()
    if args.compositor_pid <= 1 or not all(1 <= value <= 32768 for value in
            (args.logical_width, args.logical_height)) or not 1 <= args.capture_timeout_ms <= 30000:
        parser.error("invalid numeric identity/geometry/timeout")
    return asyncio.run(Takeover(args).execute())


if __name__ == "__main__":
    raise SystemExit(main())
