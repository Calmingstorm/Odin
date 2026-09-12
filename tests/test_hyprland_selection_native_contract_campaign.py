"""Extracted native selection + production Python provider, not live qualification.

Compositor objects and environment/provenance acquisition are fake. The entire
selection-method block, candidate struct, JSON helpers and Linux /proc/pidfd
checks are production code. No display or input device is contacted.
"""
import asyncio
import copy
import json
import os
import select
import shutil
import subprocess
from pathlib import Path

import pytest

from src.computer.runtime.hyprland_scope import HyprlandScopeFailure, HyprlandScopeProvider

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets/hyprland-input/scope-plugin.cpp"


def extract(source, start, end):
    assert source.count(start) == source.count(end) == 1
    return start + source.split(start, 1)[1].split(end, 1)[0]


NATIVE_FIXTURE = r'''
#include <json-c/json.h>
#include <sys/random.h>
#include <sys/syscall.h>
#include <sys/stat.h>
#include <sys/wait.h>
#include <sys/prctl.h>
#include <poll.h>
#include <unistd.h>
#include <signal.h>
#include <algorithm>
#include <array>
#include <chrono>
#include <cctype>
#include <climits>
#include <cmath>
#include <cstdint>
#include <fstream>
#include <functional>
#include <iostream>
#include <map>
#include <memory>
#include <set>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>
#include "scope-provenance.hpp"
using Clock = std::chrono::steady_clock;
// PRODUCTION_HELPERS
template<class T> using WP = std::weak_ptr<T>;
struct Vector2D { double x = 0, y = 0; bool operator==(const Vector2D&) const = default; };
struct Animated { Vector2D v; Vector2D value() const { return v; } };
struct CWLSurfaceResource {};
struct CWorkspace {};
struct Monitor {
    bool m_enabled = true, m_dpmsStatus = true, m_isUnsafeFallback = false, m_isBeingLeased = false;
    WP<Monitor> m_mirrorOf;
    std::string m_name = "DP-1";
    Vector2D m_position{0,0}, m_size{800,600}, m_pixelSize{800,600};
    float m_scale = 1;
    int m_transform = 0;
};
struct Window {
    bool m_isX11 = false, m_isMapped = true, visible_ = true, wl_ = true;
    WP<Monitor> m_monitor;
    std::shared_ptr<CWorkspace> m_workspace = std::make_shared<CWorkspace>();
    std::shared_ptr<CWLSurfaceResource> surface = std::make_shared<CWLSurfaceResource>();
    std::shared_ptr<Animated> m_realPosition = std::make_shared<Animated>(Animated{{10,20}});
    std::shared_ptr<Animated> m_realSize = std::make_shared<Animated>(Animated{{300,200}});
    std::string m_class = "drawing", m_title = "Selection fixture";
    bool visible() const { return visible_; }
    bool wlSurface() const { return wl_; }
    auto resource() const { return surface; }
};
using PHLWINDOW = std::shared_ptr<Window>;
using PHLWINDOWREF = WP<Window>;
using PHLMONITORREF = WP<Monitor>;
using PHLWORKSPACEREF = WP<CWorkspace>;
struct Compositor { std::vector<PHLWINDOW> m_windows; } compositor;
auto* g_pCompositor = &compositor;
namespace Desktop {
constexpr int FOCUS_REASON_OTHER = 0;
struct Focus {
    PHLWINDOW focused;
    std::shared_ptr<Monitor> focusedMonitor;
    std::function<void()> transition;
    void fullWindowFocus(PHLWINDOW w, int) {
        focused = w; focusedMonitor = w->m_monitor.lock(); transition();
    }
    auto window() { return focused; }
    auto monitor() { return focusedMonitor; }
} focus;
auto* focusState() { return &focus; }
}
// PRODUCTION_CANDIDATE
struct State {
    std::map<std::string, FocusCandidate> focusCandidates;
    std::string instanceID = "i1-11111111111111111111111111111111";
    uint64_t revision = 9;
    bool armed = false, held = false, environmentOK = true, provenanceOK = true;
    uintptr_t ancestryToken = 42;
    pid_t targetPID = 0;
    bool environment() const { return environmentOK; }
    bool inputHeld() const { return held; }
    bool provenance(PHLWINDOW, std::vector<odin_scope::NativeAncestor>& out) const {
        out = {{ancestryToken, targetPID, int64_t(getuid())}}; return provenanceOK;
    }
    J status(bool ok = true, const std::string& reason = "idle") {
        auto j = obj(); put(j.get(), "ok", ok); put(j.get(), "reason", reason);
        put(j.get(), "armed", armed); return j;
    }
    // PRODUCTION_METHODS
};
int main() {
    const pid_t parent = getpid();
    pid_t child = fork();
    if (child == 0) {
        // Do not leave a fixture child behind if a failed harness is killed.
        if (prctl(PR_SET_PDEATHSIG, SIGKILL) != 0 || getppid() != parent) _exit(2);
        for (;;) pause();
    }
    if (child < 0) return 2;
    struct Reap {
        pid_t pid;
        ~Reap() { if (pid > 0) { kill(pid, SIGKILL); waitpid(pid, nullptr, 0); } }
    } reap{child};
    State state; state.targetPID = child;
    auto monitor = std::make_shared<Monitor>();
    auto otherMonitor = std::make_shared<Monitor>();
    auto window = std::make_shared<Window>(); window->m_monitor = monitor;
    compositor.m_windows = {window};
    std::string mode;
    int focusCalls = 0;
    auto mutate = [&](const std::string& what) {
        if (what == "window_position") window->m_realPosition->v.x += 1;
        else if (what == "window_size") window->m_realSize->v.x += 1;
        else if (what == "output_position") monitor->m_position.x += 1;
        else if (what == "output_size") monitor->m_size.x += 1;
        else if (what == "pixel_size") monitor->m_pixelSize.x += 1;
        else if (what == "scale") monitor->m_scale = 2;
        else if (what == "transform") monitor->m_transform = 1;
        else if (what == "output_name") monitor->m_name = "DP-2";
        else if (what == "monitor") {
            window->m_monitor = otherMonitor; Desktop::focus.focusedMonitor = otherMonitor;
        }
        else if (what == "workspace") window->m_workspace = std::make_shared<CWorkspace>();
        else if (what == "surface") window->surface = std::make_shared<CWLSurfaceResource>();
        else if (what == "unmapped") window->m_isMapped = false;
        else if (what == "invisible") window->visible_ = false;
        else if (what == "x11") window->m_isX11 = true;
        else if (what == "no_wl_surface") window->wl_ = false;
        else if (what == "app") window->m_class = "terminal";
        else if (what == "title") window->m_title = "Changed";
        else if (what == "disabled") monitor->m_enabled = false;
        else if (what == "dpms") monitor->m_dpmsStatus = false;
        else if (what == "fallback") monitor->m_isUnsafeFallback = true;
        else if (what == "leased") monitor->m_isBeingLeased = true;
        else if (what == "mirror") monitor->m_mirrorOf = otherMonitor;
        else if (what == "lock") state.environmentOK = false;
        else if (what == "armed") state.armed = true;
        else if (what == "held") state.held = true;
        else if (what == "ancestry") ++state.ancestryToken;
        else if (what == "provenance") state.provenanceOK = false;
        else if (what == "process_dead") {
            kill(child, SIGKILL); waitpid(child, nullptr, 0); reap.pid = -1;
        }
        else if (what == "wrong_focus") Desktop::focus.focused.reset();
        else if (what == "wrong_focus_monitor") Desktop::focus.focusedMonitor = otherMonitor;
        else if (what == "stale_epoch") ++state.revision;
        else if (what == "consumed") state.focusCandidates.clear();
        else if (what == "expired")
            for (auto& [id,c] : state.focusCandidates) c.created -= 30000000001LL;
        else if (what == "stale_ticks")
            for (auto& [id,c] : state.focusCandidates) c.startTicks = "1";
        else if (what == "stale_image") for (auto& [id,c] : state.focusCandidates) ++c.image.inode;
        else if (what == "nan_window") window->m_realPosition->v.x = NAN;
        else if (what == "zero_window") window->m_realSize->v.x = 0;
    };
    Desktop::focus.transition = [&] {
        ++focusCalls;
        if (mode != "no_epoch_change") { ++state.revision; state.focusCandidates.clear(); }
        mutate(mode);
    };
    std::string line;
    while (std::getline(std::cin, line)) {
        J request(json_tokener_parse(line.c_str()), json_object_put);
        if (!request) return 3;
        const auto op = text(request.get(), "op");
        J result = obj();
        if (op == "inventory_targets") result = state.inventoryTargets();
        else if (op == "focus_candidate") result = state.focusCandidate(request.get());
        else if (op == "test_mutate") {
            mutate(text(request.get(), "mode")); put(result.get(), "ok", true);
        }
        else if (op == "test_focus_mode") {
            mode = text(request.get(), "mode"); put(result.get(), "ok", true);
        }
        else if (op == "test_state") {
            put(result.get(), "revision", int64_t(state.revision));
            put(result.get(), "focus_calls", int64_t(focusCalls));
            put(result.get(), "candidates", int64_t(state.focusCandidates.size()));
        }
        else return 4;
        std::cout << json_object_to_json_string_ext(result.get(), JSON_C_TO_STRING_PLAIN)
                  << std::endl;
    }
}
'''


@pytest.fixture(scope="module")
def selection_binary(tmp_path_factory):
    source = SOURCE.read_text()
    helpers = extract(source, "using J = ", "bool releaseCommandID(")
    candidate = extract(source, "struct FocusCandidate {", "struct Peer {")
    methods = extract(
        source, "    static std::string lowercaseASCII(",
        "    J request(Peer& peer, json_object* j) {",
    )
    harness = NATIVE_FIXTURE.replace("// PRODUCTION_HELPERS", helpers).replace(
        "// PRODUCTION_CANDIDATE", candidate
    ).replace("// PRODUCTION_METHODS", methods)
    directory = tmp_path_factory.mktemp("native-selection-contract")
    cpp, binary = directory / "selection.cpp", directory / "selection"
    cpp.write_text(harness)
    compiler = shutil.which("g++-14") or shutil.which("g++")
    assert compiler, "native selection contract requires a C++ compiler"
    subprocess.run(
        [compiler, "-std=c++23", "-Wall", "-Wextra", str(cpp),
         "-I", str(ROOT / "assets/hyprland-input"), "-ljson-c", "-o", str(binary)],
        check=True, capture_output=True, text=True, timeout=60,
    )
    return binary


class NativePeer:
    def __init__(self, binary):
        self.child = subprocess.Popen(
            [str(binary)], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=subprocess.PIPE, text=True,
        )

    def request(self, row):
        self.child.stdin.write(json.dumps(row) + "\n")
        self.child.stdin.flush()
        assert select.select([self.child.stdout], [], [], 5)[0], "native response timed out"
        response = self.child.stdout.readline()
        assert response, f"native peer exited {self.child.poll()}"
        return json.loads(response)

    def close(self):
        self.child.stdin.close()
        try:
            assert self.child.wait(timeout=5) == 0, self.child.stderr.read()
        finally:
            if self.child.poll() is None:
                self.child.kill()
                self.child.wait(timeout=5)
            self.child.stdout.close()
            self.child.stderr.close()


@pytest.fixture
def peer(selection_binary):
    native = NativePeer(selection_binary)
    try:
        yield native
    finally:
        native.close()


async def joined_provider(peer, *, request_edit=None, response_edit=None):
    provider = object.__new__(HyprlandScopeProvider)
    provider._lock = asyncio.Lock()
    provider._inventory = {}
    provider._inventory_epoch = provider._inventory_instance = None
    provider.expected_uid = os.getuid()
    sent, received = [], []

    async def transport(row):
        # Only transport is replaced. Python parses native inventory, caches
        # identity, serializes focus requests and validates native responses.
        sent.append(copy.deepcopy(row))
        wire = copy.deepcopy(row)
        if row["op"] == "focus_candidate" and request_edit:
            request_edit(wire)
        result = peer.request(wire)
        received.append(copy.deepcopy(result))
        if row["op"] == "focus_candidate" and response_edit:
            response_edit(result)
        return result

    provider._request = transport
    inventory = await provider.inventory_targets()
    assert len(inventory["candidates"]) == 1
    return provider, inventory, sent, received


async def focus(provider, inventory):
    candidate = inventory["candidates"][0]
    return await provider.focus_candidate(
        candidate_id=candidate["id"], output_id=candidate["output_id"],
        topology_epoch=inventory["candidate_epoch"],
    )


@pytest.mark.parametrize("mode,revision", [("", 10), ("no_epoch_change", 9), ("title", 10)])
def test_real_inventory_provider_request_and_focus_epoch(peer, mode, revision):
    async def run():
        peer.request({"op": "test_focus_mode", "mode": mode})
        provider, inventory, sent, received = await joined_provider(peer)
        result = await focus(provider, inventory)
        assert result["topology_epoch"] == inventory["candidate_epoch"] == 9
        assert result["identity"] == received[0]["candidates"][0]["identity"]
        assert type(sent[1]["requested_identity"]["start_ticks"]) is int
        assert sent[1]["requested_identity"]["start_ticks"] > 0
        assert peer.request({"op": "test_state"}) == {
            "revision": revision, "focus_calls": 1, "candidates": 0,
        }
        replay = copy.deepcopy(sent[1])
        replay["topology_epoch"] = revision
        assert peer.request(replay)["ok"] is False
        assert peer.request({"op": "test_state"})["focus_calls"] == 1
    asyncio.run(run())


@pytest.mark.parametrize("value", ["string", True, False, -1, 0, "mismatch", 1.5, None])
def test_native_rejects_noncanonical_or_mismatched_start_ticks(peer, value):
    def corrupt(row):
        current = row["requested_identity"]["start_ticks"]
        row["requested_identity"]["start_ticks"] = (
            str(current) if value == "string" else current + 1 if value == "mismatch" else value
        )

    async def run():
        provider, inventory, _, received = await joined_provider(peer, request_edit=corrupt)
        with pytest.raises(HyprlandScopeFailure):
            await focus(provider, inventory)
        assert received[-1]["ok"] is False
        assert peer.request({"op": "test_state"})["focus_calls"] == 0
    asyncio.run(run())


@pytest.mark.parametrize("field,value", [
    ("candidate_id", "c1-" + "f" * 48), ("output_id", "DP-WRONG"),
    ("topology_epoch", 10), ("topology_epoch", "9"), ("topology_epoch", True),
    ("topology_epoch", -1), ("requested_identity", {}),
    ("requested_identity", {"executable": "/wrong", "start_ticks": 1}),
])
def test_native_rejects_wrong_request_binding(peer, field, value):
    async def run():
        provider, inventory, _, received = await joined_provider(
            peer, request_edit=lambda row: row.__setitem__(field, value)
        )
        with pytest.raises(HyprlandScopeFailure):
            await focus(provider, inventory)
        assert received[-1]["ok"] is False
        assert peer.request({"op": "test_state"})["focus_calls"] == 0
    asyncio.run(run())


STATE_CHANGES = [
    "window_position", "window_size", "output_position", "output_size", "pixel_size",
    "scale", "transform", "output_name", "monitor", "workspace", "surface",
    "unmapped", "invisible", "x11", "no_wl_surface", "app", "disabled",
    "dpms", "fallback", "leased", "mirror", "lock", "armed", "held", "ancestry",
    "provenance", "process_dead",
]


@pytest.mark.parametrize("mode", STATE_CHANGES + [
    "stale_epoch", "consumed", "expired", "stale_ticks", "stale_image",
])
def test_native_revalidates_before_focus(peer, mode):
    async def run():
        provider, inventory, _, received = await joined_provider(peer)
        peer.request({"op": "test_mutate", "mode": mode})
        with pytest.raises(HyprlandScopeFailure):
            await focus(provider, inventory)
        assert received[-1]["ok"] is False
        assert peer.request({"op": "test_state"})["focus_calls"] == 0
    asyncio.run(run())


@pytest.mark.parametrize("mode", STATE_CHANGES + ["wrong_focus", "wrong_focus_monitor"])
def test_native_revalidates_same_measured_candidate_after_focus(peer, mode):
    async def run():
        provider, inventory, _, received = await joined_provider(peer)
        peer.request({"op": "test_focus_mode", "mode": mode})
        with pytest.raises(HyprlandScopeFailure):
            await focus(provider, inventory)
        assert received[-1]["ok"] is False
        assert peer.request({"op": "test_state"}) == {
            "revision": 10, "focus_calls": 1, "candidates": 0,
        }
    asyncio.run(run())


@pytest.mark.parametrize("field,value", [
    ("topology_epoch", 10), ("output_id", "DP-WRONG"),
    ("candidate_id", "c1-" + "f" * 48), ("identity", {}),
])
def test_provider_rejects_native_success_for_different_binding(peer, field, value):
    async def run():
        provider, inventory, _, received = await joined_provider(
            peer, response_edit=lambda row: row.__setitem__(field, value)
        )
        with pytest.raises(HyprlandScopeFailure):
            await focus(provider, inventory)
        assert received[-1]["ok"] is True
        assert received[-1]["topology_epoch"] == 9
        assert peer.request({"op": "test_state"})["revision"] == 10
    asyncio.run(run())


@pytest.mark.parametrize("mode", ["nan_window", "zero_window", "app", "x11", "disabled"])
def test_native_inventory_excludes_unmeasurable_or_unsafe_target(peer, mode):
    async def run():
        peer.request({"op": "test_mutate", "mode": mode})
        provider = object.__new__(HyprlandScopeProvider)
        provider._lock = asyncio.Lock()
        provider.expected_uid = os.getuid()
        async def transport(row):
            return peer.request(row)
        provider._request = transport
        result = await provider.inventory_targets()
        assert result["candidates"] == []
        assert peer.request({"op": "test_state"})["focus_calls"] == 0
    asyncio.run(run())
