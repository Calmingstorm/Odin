#!/usr/bin/env python3
"""Standalone Linux subreaper for test commands, never the live Odin process.

CLI: --deadline 600 --grace 5 --report /tmp/unique.json -- command arg ...
Output passes through. Primary status is preserved; timeout returns 124. Cleanup
health is separate in the report and MUST be checked even when exit status is 0.
No process groups or global waits: pidfd signals verify exact descendant identity,
and exact-PID adopted-child waits occur only after Popen has settled the primary.
"""

from __future__ import annotations

import argparse
import ctypes
import json
import math
import os
import signal
import subprocess
import sys
import tempfile
import time
from pathlib import Path


def metadata(pid):
    directory = Path("/proc") / str(pid)
    fields = (directory / "stat").read_bytes().rsplit(b") ", 1)[1].split()
    return {
        "pid": pid,
        "start_ticks": int(fields[19]),
        "uid": directory.stat().st_uid,
        "ppid": int(fields[1]),
        "state": fields[0].decode("ascii"),
    }


def stable(item):
    return {key: item[key] for key in ("pid", "start_ticks", "uid")}


def tree(owner):
    """Metadata only. Also discovers orphans adopted by this sole-child runner."""
    rows, complete = {}, True
    for path in Path("/proc").iterdir():
        if path.name.isdecimal():
            try:
                row = metadata(int(path.name))
                rows[row["pid"]] = row
            except (FileNotFoundError, ProcessLookupError):
                continue
            except (OSError, ValueError, IndexError):
                complete = False
    found, parents = {}, {owner}
    while True:
        children = {
            pid: row
            for pid, row in rows.items()
            if row["ppid"] in parents and pid not in found and pid != owner
        }
        if not children:
            return found, complete
        found.update(children)
        parents = set(children)


def become_subreaper():
    descendants, complete = tree(os.getpid())
    if not complete or descendants:
        raise RuntimeError("standalone_process_required")
    libc = ctypes.CDLL(None, use_errno=True)
    if libc.prctl(36, 1, 0, 0, 0):
        raise OSError(ctypes.get_errno(), "PR_SET_CHILD_SUBREAPER")
    value = ctypes.c_int()
    if libc.prctl(37, ctypes.byref(value), 0, 0, 0) or value.value != 1:
        raise RuntimeError("subreaper_verification_failed")


def signal_owned(row, number, events):
    """pidfd pins the task; verify identity and current descendant ancestry."""
    fd = None
    try:
        fd = os.pidfd_open(row["pid"])
        current = metadata(row["pid"])
        if stable(current) != stable(row):
            return
        descendants, complete = tree(os.getpid())
        owned = descendants.get(row["pid"])
        if owned is None or stable(owned) != stable(row):
            return
        if current["state"] in {"Z", "X", "x"}:
            return
        signal.pidfd_send_signal(fd, number)
        events.append({"identity": stable(row), "signal": int(number)})
    except ProcessLookupError:
        pass
    except (OSError, ValueError, IndexError) as exc:
        events.append({"identity": stable(row), "signal": int(number), "error": type(exc).__name__})
    finally:
        if fd is not None:
            os.close(fd)


def reap_adopted(primary, records):
    # Never steal Popen's primary status or a still-live owner's child status.
    if primary.returncode is None:
        return
    descendants, _complete = tree(os.getpid())
    for row in descendants.values():
        if row["ppid"] != os.getpid() or row["pid"] == primary.pid:
            continue
        try:
            current = metadata(row["pid"])
            if stable(current) != stable(row) or current["ppid"] != os.getpid():
                continue
            pid, status = os.waitpid(row["pid"], os.WNOHANG)
            if pid:
                records.append({"identity": stable(row), "wait_status": status})
        except (ChildProcessError, ProcessLookupError, FileNotFoundError):
            continue


def write_report(path, value):
    fd, name = tempfile.mkstemp(prefix=".owned-r6-", dir=path.parent)
    try:
        with os.fdopen(fd, "w") as stream:
            json.dump(value, stream, sort_keys=True)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(name, path)
    finally:
        Path(name).unlink(missing_ok=True)


def supervise(argv, deadline, grace, report_path):
    if not argv or not math.isfinite(deadline) or not 0 < deadline <= 14400:
        raise ValueError("finite_deadline_and_command_required")
    if not math.isfinite(grace) or not 0 < grace <= 30:
        raise ValueError("finite_grace_required")
    fd = os.open(report_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    os.close(fd)
    started = time.monotonic()
    result = {
        "schema": 1,
        "supervisor_pid": os.getpid(),
        "primary_pid": None,
        "primary_returncode": None,
        "deadline_exceeded": False,
        "interrupted_signal": None,
        "signals": [],
        "reaped": [],
        "residuals": [],
        "census_complete": True,
        "cleanup_ok": False,
        "completed": False,
    }
    primary = None
    previous = {}

    def interrupted(number, _frame):
        result["interrupted_signal"] = number

    try:
        become_subreaper()
        for number in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP):
            previous[number] = signal.signal(number, interrupted)
        primary = subprocess.Popen(argv, start_new_session=True)
        result["primary_pid"] = primary.pid
        write_report(report_path, result)
        while primary.poll() is None:
            if result["interrupted_signal"] is not None:
                break
            if time.monotonic() - started >= deadline:
                result["deadline_exceeded"] = True
                break
            time.sleep(0.05)
    except Exception as exc:
        result["failure"] = type(exc).__name__
    finally:
        if primary is not None:
            cleanup_start = time.monotonic()
            sent = set()
            while time.monotonic() - cleanup_start < grace + 3:
                primary.poll()
                reap_adopted(primary, result["reaped"])
                descendants, complete = tree(os.getpid())
                result["census_complete"] = result["census_complete"] and complete
                if complete and not descendants and primary.returncode is not None:
                    break
                number = (
                    signal.SIGTERM if time.monotonic() - cleanup_start < grace else signal.SIGKILL
                )
                for row in descendants.values():
                    key = (row["pid"], row["start_ticks"], row["uid"], number)
                    if key not in sent:
                        signal_owned(row, number, result["signals"])
                        sent.add(key)
                time.sleep(0.05)
            primary.poll()
            reap_adopted(primary, result["reaped"])
            result["primary_returncode"] = primary.returncode
        descendants, complete = tree(os.getpid())
        result["census_complete"] = result["census_complete"] and complete
        result["residuals"] = list(descendants.values())
        result["cleanup_ok"] = (
            not result.get("failure")
            and result["census_complete"]
            and not result["residuals"]
            and (primary is None or primary.returncode is not None)
        )
        result["completed"] = True
        result["seconds"] = round(time.monotonic() - started, 3)
        write_report(report_path, result)
        for number, handler in previous.items():
            signal.signal(number, handler)
    print(
        json.dumps(
            {
                "owned_test_report": str(report_path),
                "primary_returncode": result["primary_returncode"],
                "cleanup_ok": result["cleanup_ok"],
            }
        ),
        file=sys.stderr,
        flush=True,
    )
    if result["interrupted_signal"] is not None:
        return 128 + result["interrupted_signal"]
    if result["deadline_exceeded"]:
        return 124
    if result.get("failure") or result["primary_returncode"] is None:
        return 125
    code = result["primary_returncode"]
    return code if code >= 0 else 128 - code


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--deadline", type=float, required=True)
    parser.add_argument("--grace", type=float, default=5)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("command", nargs=argparse.REMAINDER)
    args = parser.parse_args()
    argv = args.command[1:] if args.command[:1] == ["--"] else args.command
    return supervise(argv, args.deadline, args.grace, args.report)


if __name__ == "__main__":
    raise SystemExit(main())
