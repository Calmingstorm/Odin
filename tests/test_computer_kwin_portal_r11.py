"""KWin EIS owner revalidation uses the compositor authenticated at consent."""
import os
import socket

import pytest

from src.computer.runtime import wayland_portal as portal


@pytest.mark.parametrize("bus_name", ["org.kde.KWin", "org.gnome.Shell"])
@pytest.mark.parametrize("replace_owner", [False, True])
def test_connect_eis_checks_selected_compositor_and_closes_failed_socket(bus_name, replace_owner):
    worker = object.__new__(portal._PortalWorker)
    left, right = socket.socketpair()
    worker.eis_used, worker.generation = False, 1
    worker.expected_uid = os.getuid()
    identity = {"pid": os.getpid(), "uid": os.getuid(), "start_ticks": 123}
    worker.identity = {"shell": identity, "compositor_bus": bus_name}
    names = []

    def owner(name):
        names.append(name)
        return identity | ({"start_ticks": 456} if replace_owner else {})

    worker.owner = owner
    worker.descriptor = lambda *args: left.detach()
    try:
        if replace_owner:
            with pytest.raises(portal.PortalError, match="creator differs"):
                worker.connect_eis()
        else:
            result, fd = worker.connect_eis()
            assert result["eis_peer"]["pid"] == os.getpid()
            os.close(fd)
        assert names == [bus_name]
        assert right.recv(1) == b""
    finally:
        left.close()
        right.close()
