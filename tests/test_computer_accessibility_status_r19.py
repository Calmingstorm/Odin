"""Bounded AT-SPI status probes with inert process/identity endpoints."""

import asyncio
import stat
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from src.computer import accessibility_status as status


class Process:
    def __init__(self, output=b"b true", code=0, *, linger=False, kill_race=False):
        self.stdout = SimpleNamespace(read=AsyncMock(return_value=output))
        self.code = code
        self.returncode = None if linger else code
        self.killed = False
        self.kill_race = kill_race
        self.waits = 0

    async def wait(self):
        self.waits += 1
        self.returncode = self.code
        return self.code

    def kill(self):
        self.killed = True
        if self.kill_race:
            raise ProcessLookupError
        self.returncode = -9


def settings(**kwargs):
    return SimpleNamespace(
        **{
            "environment": "existing_session",
            "platform": "x11",
            "display": ":177",
            "xauthority": "",
            "wayland_uid": 1234,
            "wayland_bus_address": "unix:path=/run/user/1234/bus",
            "runtime_sudo": False,
            **kwargs,
        }
    )


@pytest.mark.parametrize(
    "output,code,expected", [(b"metadata", 0, "metadata"), (b"", 1, None), (b"x" * 16385, 0, None)]
)
async def test_logind_probe_limits_and_reaps(monkeypatch, output, code, expected):
    process = Process(output, code, linger=True, kill_race=True)
    spawn = AsyncMock(return_value=process)
    monkeypatch.setattr(asyncio, "create_subprocess_exec", spawn)
    if expected is None:
        with pytest.raises(ValueError):
            await status._loginctl("list-sessions")
    else:
        assert await status._loginctl("list-sessions") == expected
    assert process.returncode is not None
    assert process.waits >= 1
    args, kwargs = spawn.call_args
    assert args == ("/usr/bin/loginctl", "list-sessions")
    assert kwargs["env"] == {"PATH": "/usr/bin:/bin", "LANG": "C"}


@pytest.mark.parametrize(
    "rows,users,expected",
    [
        ("one\ntwo\n", [1234, 1234], 1234),
        ("one\ntwo\n", [1234, 5678], None),
        ("\none\n", [0], None),
        ("\n".join(str(i) for i in range(17)), [], None),
    ],
)
async def test_exact_logind_display_requires_one_nonroot_identity(
    monkeypatch, rows, users, expected
):
    replies = [rows] + [
        f"User={uid}\nDisplay=:177\nType=x11\nRemote=no\nActive=yes" for uid in users
    ]
    query = AsyncMock(side_effect=replies)
    monkeypatch.setattr(status, "_loginctl", query)
    assert await status._x11_uid(settings()) == expected


@pytest.mark.parametrize("change", ["Display=:178", "Type=wayland", "Remote=yes", "Active=no"])
async def test_logind_ignores_other_or_inactive_sessions(monkeypatch, change):
    values = {"User": "1234", "Display": ":177", "Type": "x11", "Remote": "no", "Active": "yes"}
    key, value = change.split("=")
    values[key] = value
    query = AsyncMock(side_effect=["one", "\n".join(f"{k}={v}" for k, v in values.items())])
    monkeypatch.setattr(status, "_loginctl", query)
    assert await status._x11_uid(settings()) is None


@pytest.mark.parametrize(
    "case,expected",
    [
        ("wayland", True),
        ("authority", True),
        ("logind", True),
        ("isolated", False),
        ("unsupported", False),
        ("no_uid", False),
        ("root", False),
        ("nonunix", False),
        ("not_socket", False),
        ("wrong_owner", False),
        ("private_no_sudo", False),
        ("private_sudo", True),
        ("private_noncanonical", False),
    ],
)
async def test_target_bus_uses_explicit_identity_not_ambient_session(monkeypatch, case, expected):
    config = settings(
        platform="wayland" if case not in {"authority", "logind", "no_uid"} else "x11"
    )
    if case == "authority":
        config.xauthority = "/synthetic/authority"
    if case == "isolated":
        config.environment = "isolated"
    if case == "unsupported":
        config.platform = "other"
    if case == "root":
        config.wayland_uid = 0
    if case == "nonunix":
        config.wayland_bus_address = "tcp:host=localhost"
    if case == "private_sudo":
        config.runtime_sudo = True
    if case == "private_noncanonical":
        config.runtime_sudo = True
        config.wayland_bus_address = "unix:path=/synthetic/bus"
    monkeypatch.setattr(
        status, "_x11_uid", AsyncMock(return_value=None if case == "no_uid" else 1234)
    )
    monkeypatch.setattr(status.pwd, "getpwuid", lambda uid: SimpleNamespace(pw_gid=4321))

    def info(path):
        if str(path) == "/synthetic/authority":
            return SimpleNamespace(st_uid=1234, st_mode=stat.S_IFREG)
        if case.startswith("private_"):
            raise PermissionError
        return SimpleNamespace(
            st_uid=5678 if case == "wrong_owner" else 1234,
            st_mode=stat.S_IFREG if case == "not_socket" else stat.S_IFSOCK,
        )

    monkeypatch.setattr(status.Path, "stat", info)
    result = await status._target(config)
    assert (result is not None) is expected
    if expected:
        assert result == (1234, 4321, "unix:path=/run/user/1234/bus")


@pytest.mark.parametrize(
    "uid,sudo,output,code,expected",
    [
        (0, False, b"b true\n", 0, True),
        (1234, False, b"b false", 0, False),
        (4567, True, b"b true", 0, True),
        (4567, False, b"b true", 0, None),
        (1234, False, b"b maybe", 0, None),
        (1234, False, b"x" * 129, 0, None),
        (1234, False, b"b true", 1, None),
    ],
)
async def test_status_reads_one_property_without_activation_or_environment_leak(
    monkeypatch, uid, sudo, output, code, expected
):
    monkeypatch.setattr(
        status, "_target", AsyncMock(return_value=(1234, 4321, "unix:path=/run/user/1234/bus"))
    )
    monkeypatch.setattr(status.os, "geteuid", lambda: uid)
    process = Process(output, code, linger=True)
    spawn = AsyncMock(return_value=process)
    monkeypatch.setattr(asyncio, "create_subprocess_exec", spawn)
    result = await status.read_accessibility_status(settings(runtime_sudo=sudo))
    assert result["enabled"] is expected
    assert "checked_at" in result
    if uid == 4567 and not sudo:
        assert result["reason"] == "operator_identity_unavailable"
        spawn.assert_not_called()
        return
    args, kwargs = spawn.call_args
    assert "--auto-start=no" in args
    assert args[-4:] == ("org.a11y.Bus", "/org/a11y/bus", "org.a11y.Status", "IsEnabled")
    assert kwargs["env"] == {"PATH": "/usr/bin:/bin", "LANG": "C"}
    if uid == 0:
        assert kwargs["user"] == 1234 and kwargs["group"] == 4321 and kwargs["extra_groups"] == []
    elif uid == 4567:
        assert args[:5] == ("/usr/bin/sudo", "-n", "-u", "#1234", "--")
    assert process.returncode is not None


@pytest.mark.parametrize("error", [TimeoutError(), OSError(), ValueError(), KeyError()])
async def test_probe_errors_remain_unknown_and_reap_child(monkeypatch, error):
    monkeypatch.setattr(
        status, "_target", AsyncMock(return_value=(1234, 4321, "unix:path=/run/user/1234/bus"))
    )
    monkeypatch.setattr(status.os, "geteuid", lambda: 1234)
    process = Process(linger=True, kill_race=True)
    process.stdout.read.side_effect = error
    monkeypatch.setattr(asyncio, "create_subprocess_exec", AsyncMock(return_value=process))
    result = await status.read_accessibility_status(settings())
    assert result["enabled"] is None and result["state"] == "unknown"
    assert process.killed and process.waits == 1
    assert result["reason"] == (
        "read_timeout" if isinstance(error, TimeoutError) else "property_unavailable"
    )


async def test_missing_target_does_not_spawn(monkeypatch):
    monkeypatch.setattr(status, "_target", AsyncMock(return_value=None))
    spawn = AsyncMock()
    monkeypatch.setattr(asyncio, "create_subprocess_exec", spawn)
    result = await status.read_accessibility_status(settings())
    assert result["enabled"] is None and result["reason"] == "target_unavailable"
    spawn.assert_not_called()
