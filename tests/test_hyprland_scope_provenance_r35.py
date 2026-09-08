"""Native ancestry policy compiled independently; no display or plugin load."""

import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]


def test_native_ancestry_policy(tmp_path):
    compiler = shutil.which("c++")
    if not compiler:
        pytest.skip("C++ compiler unavailable")
    source = tmp_path / "provenance.cpp"
    source.write_text(
        r'''
#include "scope-provenance.hpp"
#include <cassert>
using namespace odin_scope;
int main() {
    assert(!valid_ancestry({}));
    assert(valid_ancestry({{1,42,1000}})); // unparented canvas or dialog
    assert(valid_ancestry({{2,42,1000},{1,42,1000}}));
    assert(!valid_ancestry({{2,42,1000},{1,43,1000}}));
    assert(!valid_ancestry({{2,42,1000},{1,42,1001}}));
    assert(!valid_ancestry({{2,42,1000},{1,42,1000},{2,42,1000}}));
    assert(!valid_ancestry({{0,42,1000}}));
    assert(!valid_ancestry({{1,1,1000}}));
    assert(!valid_ancestry({{1,42,-1}}));
    std::vector<NativeAncestor> chain;
    for (unsigned i=1;i<=33;++i) chain.push_back({i,42,1000});
    assert(valid_ancestry(chain));
    chain.push_back({34,42,1000});
    assert(!valid_ancestry(chain));
    auto changed=chain; changed.back().pid=43;
    assert(chain != changed);
}
'''
    )
    binary = tmp_path / "provenance"
    subprocess.run(
        [compiler, "-std=c++23", "-Wall", "-Wextra", "-Werror", "-I",
         str(ROOT / "assets/hyprland-input"), str(source), "-o", str(binary)],
        check=True,
    )
    subprocess.run([str(binary)], check=True)


def test_native_keyboard_and_pointer_fences_remain_distinct():
    source = (ROOT / "assets/hyprland-input/scope-plugin.cpp").read_text()
    assert "keyboardFocus == b.surface" in source
    assert "pointerFocus == b.pointerSurface" in source
    assert "chain != b.ancestry" in source
    assert "wl_client_get_credentials(surface->client()" in source
    assert "SYS_pidfd_open, b.pid" in source
    assert "poll(&identity, 1, 0) != 0" in source
    for event in ("Button", "Axis", "Motion"):
        body = source.split(f"void on{event}(", 1)[1].split("\nvoid ", 1)[0]
        assert "g_pSeatManager->m_state.pointerFocus != s.bound.surface" in body
        assert "s.point(" in body
    assert 's.revoke("pre-pointer-focus-transfer")' in source
    assert 's.revoke("pre-keyboard-focus-transfer")' in source
    warp = source.split("void onWarp(", 1)[1].split("\nvoid ", 1)[0]
    assert "!s.point(pos)" in warp
    assert "s.ownedModifiers" in warp
    assert "s.inputHeld()" in warp
    assert 's.revoke("warp-focus-postcondition-refused")' in warp
    transfer = source.split("void onPointerFocus(", 1)[1].split("\nvoid ", 1)[0]
    assert "surface == s.bound.surface.lock()" in transfer
    assert "s.scope()" in transfer
    assert "!s.inputHeld()" in transfer
    assert "s.point(g_pPointerManager->position())" in transfer
    assert "s.positioningBoundSurface = false" in transfer


def test_provenance_header_participates_in_build_identity():
    script = (ROOT / "scripts/build-hyprland-input.sh").read_text()
    assert "assets/hyprland-input/scope-provenance.hpp | sha256sum" in script
