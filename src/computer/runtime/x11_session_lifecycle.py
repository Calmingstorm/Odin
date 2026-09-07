"""Task XI2 owner. EOF revokes before an exclusive input-client detach fence."""
from __future__ import annotations

import contextlib
import fcntl
import json
import os
import select
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))


def emit(receipt):
    # Controller death also closes its stdout reader. Delivery loss must never
    # abort the only independent owner still restoring the user's devices.
    try:
        print(json.dumps(receipt), flush=True)
    except BrokenPipeError:
        pass


@contextlib.contextmanager
def input_lease(fd):
    """Hold until the client X connection closes; never inherit a flock owner."""
    if type(fd) is not int or fd < 3:
        raise RuntimeError("session_lease_required")
    handle = os.open(f"/proc/self/fd/{fd}", os.O_RDWR | os.O_CLOEXEC)
    try:
        fcntl.flock(handle, fcntl.LOCK_SH | fcntl.LOCK_NB)
        if os.pread(handle, 1, 0) != b"1":
            raise RuntimeError("session_lease_revoked")
        yield
    finally:
        os.close(handle)


def serve(request):
    from src.computer.runtime import x11_worker_lifecycle as lifecycle
    from src.computer.runtime.x11_owned_device import (
        ExistingXTest,
        HierarchyAddUnavailableError,
        SessionXTest,
    )

    fd = request["session_lease_fd"]
    native = None
    receipt = {"released": False, "owned_devices": "unknown",
               "physical_slaves_restored": False, "no_inflight_input": False,
               "no_active_grabs": False, "owned_masters_removed": False}
    try:
        try:
            native = SessionXTest(request["display_name"], request["session_prefix"], create=True)
        except HierarchyAddUnavailableError:
            # Only the creator's unchanged post-error census authorizes this.
            # Shared input has guardian ledgers, never disposable master removal.
            shared = ExistingXTest(request["display_name"])
            try:
                identity = shared.identity()
                if any(shared.owned_release_state().values()):
                    raise RuntimeError("shared_devices_not_idle")
                receipt = {"released": True, "owned_devices": "not_created"}
                emit({"ok": True, **receipt, "device_identity": identity,
                      "session_input_devices": False, "persistent_input_devices": False,
                      "pointer": "shared", "keyboard_focus": "shared",
                      "widget_focus": "shared_within_window", "shared_pointer": True,
                      "shared_keyboard": True})
            finally:
                shared.close()
            return
        identity = native.identity()
        if any(native.owned_release_state().values()):
            raise RuntimeError("new_session_devices_not_idle")
        os.pwrite(fd, b"1", 0)
        emit({"ok": True, "released": True,
                          "device_identity": identity, "owned_devices": "session_idle",
                          "session_input_devices": True, "persistent_input_devices": False,
                          "pointer": "independent", "keyboard_focus": "independent_per_window",
                          "widget_focus": "shared_within_window", "shared_pointer": False,
                          "shared_keyboard": False})
        while not lifecycle.REVOKED:
            if select.select([0], [], [], .05)[0]:
                break
    finally:
        os.pwrite(fd, b"0", 0)
        lock = os.open(f"/proc/self/fd/{fd}", os.O_RDWR | os.O_CLOEXEC)
        try:
            # Caller timeout cannot kill this restoration owner. Allow the
            # complete 9s worker drain plus native cleanup, not just one lease.
            deadline = time.monotonic() + 15
            reported = False
            while True:
                try:
                    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                    break
                except BlockingIOError:
                    if not reported and time.monotonic() >= deadline:
                        emit(receipt)
                        reported = True
                    time.sleep(.05)
            if native is not None:
                while True:
                    try:
                        receipt = native.detach_owned()
                        break
                    except Exception:
                        if not reported and time.monotonic() >= deadline:
                            emit(receipt)
                            reported = True
                        # Retain exact ownership/baseline after caller timeout.
                        # Long-lived grabs must not destroy the recovery owner.
                        time.sleep(.25)
        except Exception:
            pass
        finally:
            if native is not None:
                native.close()
            os.close(lock)
            emit(receipt)


if __name__ == "__main__":
    from src.computer.runtime.x11_worker_lifecycle import announce, parent_watch, read_gate

    parent_watch()
    if "--identity-gate" in sys.argv:
        announce("lifecycle")
    try:
        serve(read_gate())
    except Exception:
        sys.exit(1)
