"""Compiled production predicates, collected by computer/native and make test.

No desktop input or runtime qualification. Acquisition remains compositor-owned.
"""
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]


def test_compiled_application_group_predicates(tmp_path):
    compiler = shutil.which("c++")
    assert compiler, "native matrix requires a C++ compiler"
    source = tmp_path / "group.cpp"
    source.write_text(r'''
#include <cassert>
#include "scope-provenance.hpp"
using namespace odin_scope;
int main() {
    ApplicationIdentity a{1, 42, 1000, "900", "/usr/bin/krita", "plugin:compositor", "DP-1", 2, 3};
    assert(same_application(a, a));
    auto b = a;
    b.client++; assert(!same_application(a,b)); b=a;
    b.pid++; assert(!same_application(a,b)); b=a;
    b.uid++; assert(!same_application(a,b)); b=a;
    b.startTicks="901"; assert(!same_application(a,b)); b=a;
    b.executable="/usr/bin/portal"; assert(!same_application(a,b)); b=a;
    b.incarnation="replacement"; assert(!same_application(a,b)); b=a;
    b.output="DP-2"; assert(!same_application(a,b)); b=a;
    b.device++; assert(!same_application(a,b)); b=a;
    b.inode++; assert(!same_application(a,b));
    assert(!same_application({}, {}));
    assert(group_refresh_allowed(false,false,false,false,false,false,true));
    for (unsigned bit=0; bit<6; ++bit) {
        const auto v=1u<<bit;
        assert(!group_refresh_allowed(v&1,v&2,v&4,v&8,v&16,v&32,true));
    }
    assert(!group_refresh_allowed(false,false,false,false,false,false,false));
    assert(bounded_group_members({"main","dialog"}, "dialog"));
    assert(bounded_group_members({"main"}, "main"));
    assert(!bounded_group_members({"main"}, "new-dialog"));
    assert(!bounded_group_members({"main","main"}, "main"));
    assert(!bounded_group_members({""}, ""));
    std::vector<std::string> members;
    for (int i=0; i<32; ++i) members.push_back(std::to_string(i));
    assert(bounded_group_members(members,"0"));
    members.push_back("32"); assert(!bounded_group_members(members,"0"));
}
''')
    binary = tmp_path / "group"
    subprocess.run([compiler, "-std=c++20", "-Wall", "-Wextra", "-Werror",
                    "-I", str(ROOT / "assets/hyprland-input"), str(source),
                    "-o", str(binary)], check=True, capture_output=True, text=True)
    subprocess.run([str(binary)], check=True, capture_output=True, text=True)


@pytest.mark.parametrize("hook", ["void onWarp(", "void onFocus(", "void onPointerFocus("])
def test_event_hooks_cannot_refresh_or_retarget_group(hook):
    source = (ROOT / "assets/hyprland-input/scope-plugin.cpp").read_text()
    body = source.split(hook, 1)[1].split("\n}", 1)[0]
    assert "applicationGroups" not in body
    assert "refreshGroup" not in body
    assert "groupMember" not in body


def test_group_commit_is_after_full_snapshot_validation_and_lease_stays_exact():
    source = (ROOT / "assets/hyprland-input/scope-plugin.cpp").read_text()
    snapshot = source.split("    J snapshot(", 1)[1].split(
        "    static std::string lowercaseASCII", 1)[0]
    assert snapshot.index('"focus-not-contained-or-ambiguous"') < snapshot.index(
        "applicationGroups.insert_or_assign")
    assert "bound =" not in snapshot
    exact = source.split("    bool same(const Snapshot& b)", 1)[1].split("    bool scope()", 1)[0]
    assert "it->second.epoch != b.groupEpoch" in exact
    assert "Desktop::focusState()->window() == w" in exact
    assert "w->m_realPosition->value() == b.pos" in exact
    assert "w->m_realSize->value() == b.size" in exact


def test_extracted_group_reuse_and_dead_pruning_preserves_paused_group(tmp_path):
    """Production reuse block, fake windows; 65 starts do not consume 65 groups."""
    production = (ROOT / "assets/hyprland-input/scope-plugin.cpp").read_text()
    block = production.split("        ApplicationGroup nextGroup;", 1)[1].split(
        "        if (!groupToken.empty())", 1)[0]
    source = tmp_path / "lifetime.cpp"
    source.write_text(r'''
#include <algorithm>
#include <cassert>
#include <map>
#include <memory>
#include <string>
struct Window { int app; };
struct ApplicationGroup { int app=0; std::map<std::string,std::weak_ptr<Window>> members; };
struct State {
    std::map<std::string,ApplicationGroup> applicationGroups;
    bool armed=false;
    bool groupIdentity(const ApplicationGroup& group, std::shared_ptr<Window> w) {
        return w && group.app==w->app;
    }
    std::string reuse(std::shared_ptr<Window> w, bool refreshGroup=true,
                      std::string groupToken={}) {
        ApplicationGroup nextGroup;
''' + block + r'''
        return selectedGroup;
    }
};
int main() {
    State s;
    auto main=std::make_shared<Window>(Window{1});
    auto dialog=std::make_shared<Window>(Window{1});
    auto paused=std::make_shared<Window>(Window{2});
    s.applicationGroups["selected"]={1,{{"main",main},{"dialog",dialog}}};
    s.applicationGroups["paused"]={2,{{"main",paused}}};
    dialog.reset();
    for(int i=0;i<65;++i) {
        assert(s.reuse(main)=="selected");
        assert(s.applicationGroups.size()==2);
        assert(s.applicationGroups.contains("paused"));
    }
    main.reset();
    assert(s.reuse(paused)=="paused");
    assert(s.applicationGroups.size()==1);
    auto foreign=std::make_shared<Window>(Window{3});
    assert(s.reuse(foreign).empty());
    assert(s.applicationGroups.contains("paused"));
}
''')
    binary = tmp_path / "lifetime"
    subprocess.run([shutil.which("c++"), "-std=c++20", "-Wall", "-Wextra", "-Werror",
                    str(source), "-o", str(binary)], check=True, capture_output=True, text=True)
    subprocess.run([str(binary)], check=True, capture_output=True, text=True)
