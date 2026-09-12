"""Compile the production hold predicate; no desktop or compositor is started."""
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]


def test_device_hold_predicate_ignores_stale_seat_output_not_live_inputs(tmp_path):
    compiler = shutil.which("c++")
    if not compiler:
        pytest.skip("C++ compiler unavailable")
    source = (ROOT / "assets/hyprland-input/scope-plugin.cpp").read_text()
    helper = "    bool inputHeld() const {" + source.split(
        "    bool inputHeld() const {", 1
    )[1].split("    bool provenance(", 1)[0]
    harness = r'''
#include <cassert>
#include <cstdint>
#include <linux/input-event-codes.h>
#include <memory>
#include <set>
#include <vector>
struct Keyboard {
    std::set<uint32_t> pressed;
    bool getPressed(uint32_t code) { return pressed.contains(code); }
};
struct Input {
    std::vector<std::shared_ptr<Keyboard>> m_keyboards;
    std::vector<uint32_t> output;
    bool buttons=false;
    bool hasHeldButtons() { return buttons; }
    const auto& getKeysFromAllKBs() { return output; }
} input;
auto* g_pInputManager=&input;
struct State {
'''
    harness += helper + r'''};
int main() {
    State s;
    assert(s.inputHeld()); // Missing keyboard inventory is not proof of release.
    auto physical=std::make_shared<Keyboard>(), other=std::make_shared<Keyboard>();
    input.m_keyboards={physical,other};
    input.output={KEY_LEFTMETA}; // Exact R38 seat-output/device-state divergence.
    assert(!s.inputHeld());
    assert(input.output==std::vector<uint32_t>{KEY_LEFTMETA}); // Never clear it.
    for (uint32_t code=0; code<=KEY_MAX; ++code) {
        other->pressed.insert(code); // All device types, even non-forwarded keys.
        assert(s.inputHeld());
        assert(other->pressed.contains(code)); // Read-only, no foreign release.
        other->pressed.clear();
    }
    input.output={KEY_MAX+1}; assert(s.inputHeld());
    input.output.clear(); input.buttons=true; assert(s.inputHeld());
    input.buttons=false; input.m_keyboards.push_back(nullptr); assert(s.inputHeld());
    g_pInputManager=nullptr; assert(s.inputHeld());
}
'''
    cpp, binary = tmp_path / "held.cpp", tmp_path / "held"
    cpp.write_text(harness)
    subprocess.run([compiler, "-std=c++23", "-Wall", "-Wextra", "-Werror",
                    str(cpp), "-o", str(binary)], check=True, timeout=60)
    subprocess.run([str(binary)], check=True, timeout=10)
    assert 'if (inputHeld()) return status(false, "human-input-held")' in source
    # Initial positioning, stationary-position reprocessing, and the actual
    # focus transfer must independently preserve the no-foreign-input guard.
    warp = source.split("void onWarp(", 1)[1].split("\nvoid onFocus(", 1)[0]
    focus = source.split("void onPointerFocus(", 1)[1].split("\nvoid onNewPointer(", 1)[0]
    assert warp.count("s.inputHeld()") == 2
    assert focus.count("s.inputHeld()") == 1
