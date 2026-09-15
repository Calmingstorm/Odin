"""Compiled production binding predicates plus explicit hook-boundary contracts.

Not a compositor runtime qualification: real hit testing/focus requires the
pinned plugin build and an explicitly authorized isolated receiver session.
"""
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_group_target_production_predicates(tmp_path):
    source = tmp_path / "target.cpp"
    source.write_text(r'''
#include "scope-provenance.hpp"
#include <cassert>
int main() {
    using namespace odin_scope;
    assert(group_target_binding(1, 1, 1, "group", "group"));
    assert(!group_target_binding(1, 2, 2, "group", "group"));
    assert(!group_target_binding(1, 1, -1, "group", "group"));
    assert(!group_target_binding(1, 1, 1, "group", "foreign"));
    assert(!group_target_binding(1, 1, 1, "", ""));
    for (unsigned mask = 0; mask < 64; ++mask)
        assert(group_refresh_allowed(mask & 1, mask & 2, mask & 4,
            mask & 8, mask & 16, mask & 32, true) == (mask == 0));
    assert(!group_refresh_allowed(false, false, false, false, false, false, false));
}
''')
    exe = tmp_path / "target"
    subprocess.run(["c++", "-std=c++20", "-I", str(ROOT / "assets/hyprland-input"),
                    str(source), "-o", str(exe)], check=True)
    subprocess.run([str(exe)], check=True)


def test_group_target_is_explicit_preinput_not_warp_retarget():
    text = (ROOT / "assets/hyprland-input/scope-plugin.cpp").read_text()
    method = text.split("J prepareGroupTarget(json_object* j) {", 1)[1].split(
        "J request(Peer&", 1)[0]
    assert 'snapshots.find(text(j, "target_token"))' in method
    assert "250000000" in method and "!same(it->second)" in method
    assert "group_target_binding(" in method
    assert "vectorToLayerSurface" in method
    assert "vectorToWindowUnified" in method
    assert "groupMember(group->second, w)" in method
    assert "destination(destinationProof, surface)" in method
    assert "fullWindowFocus" in method
    assert "snapshot(before.monitor->m_name, before.groupToken, false)" in method
    assert '"target_changed", changed' in method
    assert "applicationGroups.insert" not in method
    warp = text.split("void onWarp(", 1)[1].split("void ", 1)[0]
    assert "prepareGroupTarget" not in warp
    assert "fullWindowFocus" not in warp
    assert "warp-destination-unknown" in warp
