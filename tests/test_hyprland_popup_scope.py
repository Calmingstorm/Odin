"""Compile the actual dependency-free native predicate; no compositor/input."""
import pathlib
import subprocess


ROOT = pathlib.Path(__file__).resolve().parents[1]


def test_native_popup_ancestry(tmp_path):
    source = tmp_path / "popup.cpp"
    source.write_text(r'''
#include "scope-provenance.hpp"
#include <cassert>
#include <limits>
using namespace odin_scope;
int main() {
    PopupAncestor root{1, 11, 111, 99, 0, true, false, {0,0,800,600,0,0,0,0}};
    PopupAncestor popup{2, 22, 222, 99, 11, true, true, {0,0,80,60,20,20,80,60}};
    PopupAncestor nested{3, 33, 333, 99, 22, true, true, {0,0,40,30,10,10,40,30}};
    assert(valid_popup_ancestry({root},1,99));
    assert(valid_popup_ancestry({popup,root},1,99));
    assert(valid_popup_ancestry({nested,popup,root},1,99));
    assert(!valid_popup_ancestry({},1,99));
    assert(!valid_popup_ancestry({popup},1,99));
    assert(!valid_popup_ancestry({popup,root},4,99));
    assert(!valid_popup_ancestry({popup,root},1,98));
    auto bad=popup; bad.client=98; assert(!valid_popup_ancestry({bad,root},1,99));
    bad=popup; bad.live=false; assert(!valid_popup_ancestry({bad,root},1,99));
    bad=popup; bad.popup=false; assert(!valid_popup_ancestry({bad,root},1,99));
    bad=popup; bad.parent=33; assert(!valid_popup_ancestry({bad,root},1,99));
    bad=popup; bad.surface=1; assert(!valid_popup_ancestry({bad,root},1,99));
    bad=popup; bad.role=0; assert(!valid_popup_ancestry({bad,root},1,99));
    bad=popup; bad.xdg=0; assert(!valid_popup_ancestry({bad,root},1,99));
    bad=popup; bad.geometry[6]=0; assert(!valid_popup_ancestry({bad,root},1,99));
    bad=popup; bad.geometry[0]=std::numeric_limits<double>::quiet_NaN(); assert(!valid_popup_ancestry({bad,root},1,99));
    bad=popup; bad.geometry[4]++; assert(bad != popup);
    assert(!valid_popup_ancestry(std::vector<PopupAncestor>(34,popup),1,99));
}
''')
    binary = tmp_path / "popup"
    subprocess.run(["c++", "-std=c++23", "-Wall", "-Wextra", "-Werror", "-I",
                    str(ROOT / "assets/hyprland-input"), str(source), "-o", str(binary)], check=True)
    subprocess.run([str(binary)], check=True)


def test_scope_contract():
    source = (ROOT / "assets/hyprland-input/scope-plugin.cpp").read_text()
    assert "g_pSeatManager->m_state.pointerFocus == b.pointerSurface" in source
    assert "g_pSeatManager->m_state.keyboardFocus == b.surface" in source
    assert "popupInventory(b) != b.popups" in source
    assert "!b.popupWatch->valid" in source
    for event in ("reposition", "dismissed", "destroy", "map", "unmap", "newPopup"):
        assert f"m_events.{event}.listen" in source
    watcher = source.split("void watchPopups(", 1)[1].split("SP<CWLSurfaceResource> destinationAt", 1)[0]
    # Existing unmapped popups must be watched before map->unmap restores the
    # inventory. Lifecycle watching must not use the mapped admission predicate.
    assert "popupChain(" not in watcher
    assert "watch->valid = false; ++revision" in watcher
    button = source.split("void onButton(", 1)[1].split("void onAxis(", 1)[0]
    assert button.index("WL_POINTER_BUTTON_STATE_RELEASED") < button.index("!s.allow()")
    assert "s.destinationAt" in button
    assert "s.bound.pointerSurface = surface" in source
    assert "s.positioningBoundSurface = false;\n        original" in source
    assert "m_surfaces.size() > 256" in source
