"""Private fake-bus/proc/JS harness tests. Never connects to a real desktop."""
import asyncio
import json
import os
import subprocess
from pathlib import Path

import pytest

from src.computer.runtime import wayland_scope as scope

SOURCE = {"node_id": 71, "session_handle": "/org/freedesktop/portal/desktop/session/a/b",
          "source_type": 1, "position": [-1920, 0], "size": [1920, 1080],
          "mapping_id": "stream-1"}


def process(pid, uid, profile):
    return {"pid": pid, "uid": uid, "start_ticks": 345,
            "exe": "/usr/bin/" + profile, "exe_identity": [5, pid]}


class FakeProvider(scope.GNOMEWaylandScopeProvider):
    def __init__(self):
        super().__init__(bus_address="unix:path=/tmp/odin-private-test-bus",
                         expected_uid=os.geteuid(), expected_compositor_pid=700)
        self.owner = ":1.70"
        self.shell_owner = self.owner
        self.pid = 700
        self.uid = os.geteuid()
        self.observations = 0
        self.mutate = lambda result: result
        self.backend_class = "MetaBackendNative"

    async def _daemon(self, member, name):
        if member == "GetNameOwner":
            return self.shell_owner if name == "org.gnome.Shell" else self.owner
        return self.pid if member == "GetConnectionUnixProcessID" else self.uid

    async def _call(self, destination, path, interface, member, signature="", body=None):
        assert destination == self.owner
        if member == "Identity":
            return [json.dumps({"challenge": body[0], "native_wayland": True,
                                "compositor_name": "gnome-shell", "compositor_version": "46.2",
                                "backend_class": self.backend_class})]
        request = json.loads(body[0])
        self.observations += 1
        result = {"protocol": 1, "challenge": request["challenge"],
                  "source_digest": request["source_digest"], "profile": request["profile"],
                  "native_wayland": True, "safe_focus": True, "pid": 800,
                  "focus_serial": 1, "focus_token": "1234",
                  "bounds": {"x": 10, "y": 20, "width": 800, "height": 600}}
        return [json.dumps(self.mutate(result))]


@pytest.fixture
def provider(monkeypatch):
    monkeypatch.setattr(scope, "_process_identity", process)
    return FakeProvider()


def test_good_snapshot_is_source_local_authenticated_and_stable(provider):
    first = asyncio.run(provider.snapshot(SOURCE, "xed"))
    second = asyncio.run(provider.snapshot(SOURCE, "xed"))
    assert first["bounds"] == {"x": 10, "y": 20, "width": 800, "height": 600}
    assert first["authenticated"] and first["safe_focus"] and first["native_wayland"]
    assert first["source_digest"] == second["source_digest"]
    assert first["focus_digest"] == second["focus_digest"]
    assert first["compositor"]["owner"] == ":1.70"
    assert provider.observations == 4
    assert "position" not in first


@pytest.mark.parametrize("key,value", [
    ("node_id", 72), ("session_handle", "/different/session"),
    ("position", [0, 0]), ("mapping_id", "stream-2"), ("size", [2560, 1440]),
])
def test_each_stream_binding_field_changes_digest(provider, key, value):
    first = asyncio.run(provider.snapshot(SOURCE, "xed"))
    changed = asyncio.run(provider.snapshot(SOURCE | {key: value}, "xed"))
    assert first["source_digest"] != changed["source_digest"]
    assert first["bounds_digest"] != changed["bounds_digest"]


@pytest.mark.parametrize("key,value", [
    ("node_id", True), ("node_id", 0), ("source_type", 2), ("source_type", True),
    ("position", None), ("position", [0.5, 0]), ("size", [0, 1]),
    ("size", [True, 800]), ("mapping_id", "a\x00b"), ("session_handle", "ambient"),
])
def test_malformed_or_nonmonitor_source_refused_before_bus(provider, key, value):
    with pytest.raises(scope.WaylandScopeFailure):
        asyncio.run(provider.snapshot(SOURCE | {key: value}, "xed"))
    assert provider.observations == 0


@pytest.mark.parametrize("profile", ["drawing", "terminal", "unknown", "gnome-shell"])
def test_unknown_profile_refused_before_bus(provider, profile):
    with pytest.raises(scope.WaylandScopeFailure):
        asyncio.run(provider.snapshot(SOURCE, profile))
    assert provider.observations == 0


@pytest.mark.parametrize("attribute,value", [
    ("owner", "org.gnome.Shell"), ("shell_owner", ":1.80"),
    ("pid", 999), ("uid", 65534),
])
def test_owner_pid_uid_authentication(provider, attribute, value):
    setattr(provider, attribute, value)
    with pytest.raises(scope.WaylandScopeFailure):
        asyncio.run(provider.identity())


def test_owner_replacement_is_not_silently_followed(provider):
    asyncio.run(provider.identity())
    provider.owner = provider.shell_owner = ":1.71"
    with pytest.raises(scope.WaylandScopeFailure, match="owner_changed"):
        asyncio.run(provider.identity())


@pytest.mark.parametrize("native,expected", [("MetaBackendNative", "native"),
                                           ("MetaBackendX11", "x11-nested"),
                                           ("MetaBackendX11Nested", "x11-nested")])
def test_backend_runtime_class_is_authenticated_not_environment(provider, native, expected):
    provider.backend_class = native
    identity = asyncio.run(provider.identity())
    assert identity["backend"] == expected
    assert identity["compositor_version"] == "46.2"


def test_unknown_backend_refused(provider):
    provider.backend_class = "MetaBackendUnknown"
    with pytest.raises(scope.WaylandScopeFailure, match="backend_unavailable"):
        asyncio.run(provider.identity())


def test_pid_reuse_rejected_against_pinned_start(provider, monkeypatch):
    asyncio.run(provider.identity())
    monkeypatch.setattr(scope, "_process_identity", lambda *args:
                        process(*args) | {"start_ticks": 999})
    with pytest.raises(scope.WaylandScopeFailure, match="owner_changed"):
        asyncio.run(provider.identity())


@pytest.mark.parametrize("patch", [
    {"native_wayland": False}, {"safe_focus": False}, {"challenge": "replay"},
    {"source_digest": "different"}, {"profile": "inkscape"}, {"pid": True},
    {"focus_serial": 0}, {"focus_token": "title"},
    {"bounds": {"x": -1, "y": 0, "width": 30, "height": 30}},
    {"bounds": {"x": 1900, "y": 0, "width": 30, "height": 30}},
    {"bounds": {"x": 0, "y": 0, "width": True, "height": 30}},
])
def test_forged_stale_unsafe_or_out_of_source_observation(provider, patch):
    provider.mutate = lambda result: result | patch
    with pytest.raises(scope.WaylandScopeFailure):
        asyncio.run(provider.snapshot(SOURCE, "xed"))


def test_focus_changed_between_observations(provider):
    provider.mutate = lambda result: result | {"focus_serial": provider.observations}
    with pytest.raises(scope.WaylandScopeFailure, match="focus_changed"):
        asyncio.run(provider.snapshot(SOURCE, "xed"))


def test_process_changed_between_observations(provider, monkeypatch):
    calls = 0

    def changing(pid, uid, profile):
        nonlocal calls
        if profile == "xed":
            calls += 1
        return process(pid, uid, profile) | {"start_ticks": calls}

    monkeypatch.setattr(scope, "_process_identity", changing)
    with pytest.raises(scope.WaylandScopeFailure, match="application_changed"):
        asyncio.run(provider.snapshot(SOURCE, "xed"))


def test_stale_round_trip_refused(provider, monkeypatch):
    clock = iter([100, 600_000_101])
    monkeypatch.setattr(scope.time, "monotonic_ns", lambda: next(clock))
    with pytest.raises(scope.WaylandScopeFailure, match="focus_stale"):
        asyncio.run(provider.snapshot(SOURCE, "xed"))


def test_reply_extra_private_fields_are_discarded(provider):
    provider.mutate = lambda result: result | {"title": "private", "global_x": -100}
    result = asyncio.run(provider.snapshot(SOURCE, "xed"))
    assert "private" not in json.dumps(result)
    assert "global_x" not in result


@pytest.mark.parametrize("address", ["", "unix:abstract=/tmp/bus", "tcp:host=localhost",
                                     "unix:path=/tmp/a;unix:path=/tmp/b"])
def test_no_ambient_or_remote_bus(address):
    with pytest.raises(scope.WaylandScopeFailure):
        scope.GNOMEWaylandScopeProvider(bus_address=address, expected_uid=os.geteuid(),
                                       expected_compositor_pid=700)


def test_process_identity_refuses_current_interpreter_for_native_profile():
    with pytest.raises(scope.WaylandScopeFailure):
        scope._process_identity(os.getpid(), os.geteuid(), "xed")


def test_untrusted_installed_executable(tmp_path):
    executable = tmp_path / "app"
    executable.write_text("native")
    executable.chmod(0o777)
    with pytest.raises(scope.WaylandScopeFailure):
        scope._trusted_executable(executable)


def test_real_private_bus_lookalike_shell_service_fails_native_executable_auth():
    """Actual private daemon credentials reject a Python-owned fake Shell name."""
    from dbus_next.aio import MessageBus

    daemon = subprocess.Popen(["dbus-daemon", "--session", "--nofork", "--print-address=1"],
                              stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    try:
        address = daemon.stdout.readline().strip()
        assert address.startswith("unix:path=")
        # Explicit path only; daemon also prints a GUID that our adapter doesn't need.
        address = address.split(",guid=", 1)[0]

        async def check():
            impostor = await MessageBus(bus_address=address).connect()
            provider = scope.GNOMEWaylandScopeProvider(
                bus_address=address, expected_uid=os.geteuid(),
                expected_compositor_pid=os.getpid())
            try:
                await impostor.request_name("org.gnome.Shell")
                await impostor.request_name(scope.BUS_NAME)
                with pytest.raises(scope.WaylandScopeFailure,
                                   match="process_identity_(untrusted|unavailable)"):
                    await provider.identity()
            finally:
                await provider.close()
                impostor.disconnect()

        asyncio.run(check())
    finally:
        daemon.terminate()
        daemon.communicate(timeout=5)


def test_extension_executable_private_mock_compositor_harness():
    """Execute extension policy JS without GJS/Wayland or any host bus/display."""
    extension = (Path(__file__).parents[1] / "assets/wayland-scope/extension.js").read_text()
    source = "\n".join(line for line in extension.splitlines() if not line.startswith("import "))
    source = "class Extension {}\n" + source.replace(
        "export default class OdinScope", "class OdinScope")
    harness = r'''
const assert = require('node:assert/strict');
const Meta = {is_wayland_compositor: () => true,
    WindowClientType: {WAYLAND: 1}, WindowType: {NORMAL: 0}};
const Main = {sessionMode: {currentMode: 'user'}, screenShield: {}, overview: {},
    modalCount: 0, layoutManager: {monitors: [{x:-1920,y:0,width:1920,height:1080}]}};
const workspace = {get_work_area_for_monitor:()=>({x:-1920,y:0,width:1920,height:1080})};
let transient = false;
const focus = {appears_focused:true, minimized:false,
    get_client_type:()=>1, get_window_type:()=>0, get_transient_for:()=>null,
    showing_on_its_workspace:()=>true, get_workspace:()=>workspace,
    get_pid:()=>800, get_title:()=> 'document', get_wm_class:()=> 'xed',
    foreach_transient: cb => { if (transient) cb(focus); },
    get_frame_rect:()=>({x:-1900,y:20,width:800,height:600}),
    get_compositor_private:()=>actor, get_stable_sequence:()=>123};
const actor = {visible:true, meta_window:focus};
global.display = {focus_window: focus, sort_windows_by_stacking: windows=>windows};
global.workspace_manager = {get_active_workspace:()=>workspace};
global.stage = {get_key_focus:()=>null};
global.get_window_actors = ()=>[actor];
const provider = new OdinScope(); provider._serial=1;
const request = {protocol:1,challenge:'a'.repeat(48),source_digest:'b'.repeat(64),
    profile:'xed', source:{source_type:1,node_id:71,session_handle:'/a/b',
        position:[-1920,0],size:[1920,1080]}};
let passed = 0;
function deny(mutate, restore) {
    mutate(); assert.throws(()=>provider._snapshot(request)); restore(); passed++;
}
assert.deepEqual(provider._snapshot(request).bounds,{x:20,y:20,width:800,height:600}); passed++;
deny(()=>focus.get_client_type=()=>0, ()=>focus.get_client_type=()=>1);
deny(()=>focus.get_window_type=()=>1, ()=>focus.get_window_type=()=>0);
deny(()=>focus.get_pid=()=>0, ()=>focus.get_pid=()=>800);
deny(()=>focus.get_title=()=> 'Authentication', ()=>focus.get_title=()=> 'document');
deny(()=>Main.modalCount=1, ()=>Main.modalCount=0);
deny(()=>Main.sessionMode.isLocked=true, ()=>Main.sessionMode.isLocked=false);
deny(()=>Main.overview.visible=true, ()=>Main.overview.visible=false);
deny(()=>global.stage.get_key_focus=()=>({}), ()=>global.stage.get_key_focus=()=>null);
deny(()=>transient=true, ()=>transient=false);
deny(()=>request.source.position=[0,0], ()=>request.source.position=[-1920,0]);
deny(()=>Main.layoutManager.monitors.push(Main.layoutManager.monitors[0]),
    ()=>Main.layoutManager.monitors.pop());
deny(()=>request.source.source_type=2, ()=>request.source.source_type=1);
deny(()=>request.profile='writer', ()=>request.profile='xed');
const overlay = {visible:true};
overlay.meta_window = {...focus, get_compositor_private:()=>overlay};
deny(()=>global.get_window_actors=()=>[actor,overlay], ()=>global.get_window_actors=()=>[actor]);
focus.get_frame_rect=()=>({x:-2000,y:-100,width:300,height:300});
assert.deepEqual(provider._snapshot(request).bounds,{x:0,y:0,width:220,height:200}); passed++;
console.log(JSON.stringify({passed}));
'''
    result = subprocess.run(["node", "-e", source + harness], capture_output=True,
                            text=True, check=True, timeout=10)
    assert json.loads(result.stdout) == {"passed": 16}
