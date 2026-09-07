"""Fixed sandbox argv regressions. No real namespace, process or display needed."""
import sys
from types import SimpleNamespace

import pytest

from src.computer.runtime.accessibility import PrimitiveError
from src.computer.runtime.primitives import NativeDesktop
from src.computer.runtime.profile import launch_argv, sandbox_argv


def test_explicit_userns_for_disabled_nested_userns():
    args = sandbox_argv("xed")
    assert args[args.index("--unshare-all") + 1] == "--unshare-user"
    assert "--disable-userns" in args
    assert "--share-net" not in args
    assert args[args.index("--uid") + 1] == "65534"


def test_private_proc_and_shm_are_real_readonly_mounts():
    args = sandbox_argv("xed")
    assert args[args.index("--proc") + 1] == "/proc"
    shm = args.index("/dev/shm")
    assert args[shm - 3:shm] == ["--size", "1048576", "--tmpfs"]
    mounts = [args[i + 1] for i, value in enumerate(args) if value == "--remount-ro"]
    assert mounts == ["/proc", "/dev/shm", "/dev", "/"]
    assert "/sys" not in args and "/tmp/.X11-unix" not in args


def test_outer_hardening_preserved_without_masked_host_proc():
    args = launch_argv("r4-test", "xed", runtime_sudo=True)
    props = {arg.removeprefix("--property=") for arg in args if arg.startswith("--property=")}
    assert {"DynamicUser=yes", "PrivateTmp=yes", "PrivateNetwork=yes", "PrivateDevices=yes",
            "ProtectSystem=strict", "ProtectHome=yes", "NoNewPrivileges=yes",
            "CapabilityBoundingSet=", "AmbientCapabilities=", "MemoryMax=1G",
            "KillMode=control-group", "ProtectKernelModules=yes"} <= props
    assert not {"ProtectKernelTunables=yes", "ProtectKernelLogs=yes"} & props


def protocol_fixture(monkeypatch, *, width=2, height=2, bits=32, masks=None, reply_bytes=16):
    calls = []
    visual = SimpleNamespace(visual_id=33, visual_class=4,
                             red_mask=0xFF0000, green_mask=0xFF00, blue_mask=0xFF)
    if masks is not None:
        visual.red_mask, visual.green_mask, visual.blue_mask = masks

    def image(*args):
        calls.append(("get_image", args))
        return SimpleNamespace(depth=24, data=(bytes([3, 2, 1, 0]) * 4)[:reply_bytes])

    root = SimpleNamespace(get_geometry=lambda: SimpleNamespace(width=width, height=height),
                           get_image=image)
    screen = SimpleNamespace(root=root, root_depth=24, root_visual=33,
                             allowed_depths=[SimpleNamespace(visuals=[visual])])
    connection = SimpleNamespace(screen=lambda: screen,
        display=SimpleNamespace(info=SimpleNamespace(image_byte_order=0,
            pixmap_formats=[SimpleNamespace(depth=24, bits_per_pixel=bits, scanline_pad=32)])),
        close=lambda: calls.append(("closed",)))

    def connect(name):
        assert name == ":77"
        calls.append(("connect", name))
        return connection

    monkeypatch.setitem(sys.modules, "Xlib", SimpleNamespace(
        X=SimpleNamespace(TrueColor=4, ZPixmap=2), display=SimpleNamespace(Display=connect)))
    return NativeDesktop(), calls


def test_private_native_protocol_capture_decode_and_close(monkeypatch):
    native, calls = protocol_fixture(monkeypatch)
    pixels, width, height, mode = native._capture()
    assert (width, height, mode) == (2, 2, "RGB")
    assert pixels == bytes([1, 2, 3]) * 4
    assert calls[-1] == ("closed",)
    assert native._root_extent == (2, 2)


@pytest.mark.parametrize("kwargs", [{"bits": 24}, {"masks": (31, 63, 31)},
                                   {"width": 4096, "height": 4096}])
def test_private_native_format_and_allocation_fail_before_getimage(monkeypatch, kwargs):
    native, calls = protocol_fixture(monkeypatch, **kwargs)
    with pytest.raises(PrimitiveError):
        native._capture()
    assert not any(call[0] == "get_image" for call in calls)
    assert calls[-1] == ("closed",)


def test_private_native_short_reply_fails_and_closes(monkeypatch):
    native, calls = protocol_fixture(monkeypatch, reply_bytes=15)
    with pytest.raises(PrimitiveError, match="no pixels"):
        native._capture()
    assert calls[-1] == ("closed",)
