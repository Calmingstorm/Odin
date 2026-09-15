# ruff: noqa: E501
"""Execute production focus hooks and ancestry with synthetic protocol objects."""
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture(scope="module")
def focus_binary(tmp_path_factory):
    directory = tmp_path_factory.mktemp("admitted-focus-native")
    production = (ROOT / "assets/hyprland-input/scope-plugin.cpp").read_text()
    (directory / "native_popup_subsurface_node.hpp").write_text(
        production[production.index("struct SubsurfaceNode {"):production.index("struct Snapshot {")])
    methods = production[production.index("    bool popupChain("):production.index("    SP<CWLSurfaceResource> destinationAt(")]
    transfer = production[production.index("    bool focusTransfer("):production.index("    bool point(")]
    hooks = production[production.index("void onFocus("):production.index("void onNewPointer(")]
    source = directory / "focus.cpp"
    source.write_text(r'''
#include "native_popup_fixture.hpp"
#include <map>
long ns() {return 1;}
struct CSeatManager { struct { WP<CWLSurfaceResource> keyboardFocus, pointerFocus; } m_state; } seat;
auto* g_pSeatManager=&seat;
struct PointerManager { Vector2D position() const { return {}; } } pointerManager;
auto* g_pPointerManager=&pointerManager;
using FocusFn=void(*)(CSeatManager*,SP<CWLSurfaceResource>);
using PointerFocusFn=void(*)(CSeatManager*,SP<CWLSurfaceResource>,const Vector2D&);
struct Hook { void* m_original=nullptr; };
struct Device {bool dead=false;}; struct Peer {int pid=1;};
struct State {
    unsigned revision=0; bool armed=false,failed=false,draining=false;
    bool positioningBoundSurface=false,ownedModifiers=false,held=false,stable=true;
    long deadline=100; int guardianFD=1; std::map<int,SP<Peer>> peers{{1,std::make_shared<Peer>()}};
    Device device; Device *keyboard=&device,*pointer=&device;
    std::set<int> keys,buttons;
    Snapshot bound; Hook *focusHook=nullptr,*pointerFocusHook=nullptr;
    SP<CWLSurfaceResource> hit;
    bool isPeer(int) const {return true;}
    bool inputHeld() const {return held;}
    bool point(Vector2D) const {return true;}
    bool same(const Snapshot& b,bool =true) const {return stable && actionTopology(b);}
    bool scope() const {return armed && stable && !failed && actionTopology(bound) &&
        destination(bound,seat.m_state.keyboardFocus.lock()) &&
        (seat.m_state.pointerFocus==bound.pointerSurface || destination(bound,seat.m_state.pointerFocus.lock()));}
    auto destinationAt(Vector2D) const {return destination(bound,hit)?hit:SP<CWLSurfaceResource>{};}
    void revoke(const char*) {armed=false; bound.popupWatch->action=false;}
''' + methods + transfer + r'''
};
State* live=nullptr;
void keyboardOriginal(CSeatManager* s,SP<CWLSurfaceResource> p) {s->m_state.keyboardFocus=p;}
void pointerOriginal(CSeatManager* s,SP<CWLSurfaceResource> p,const Vector2D&) {s->m_state.pointerFocus=p;}
''' + hooks + r'''
int main(int argc,char** argv) {
    assert(argc==2); std::string mode=argv[1]; Fixture f; State s; live=&s;
    Hook key{reinterpret_cast<void*>(keyboardOriginal)},ptr{reinterpret_cast<void*>(pointerOriginal)};
    s.focusHook=&key;s.pointerFocusHook=&ptr;
    auto& b=s.bound;b=f.snapshot;b.popups=s.popupInventory(b);s.watchPopups(b);
    s.armed=true;b.popupWatch->action=true; b.pointerSurface=f.root.surface;
    seat.m_state.keyboardFocus=f.root.surface;seat.m_state.pointerFocus=f.root.surface;
    if(mode=="keyboard") {
        onFocus(&seat,f.child.surface);assert(s.armed && s.revision==0);
        onFocus(&seat,f.nested.surface);assert(s.armed && s.revision==0);
        onFocus(&seat,f.root.surface);assert(s.armed && s.revision==0);
    } else if(mode=="pointer") {
        s.hit=f.child.surface;onPointerFocus(&seat,f.child.surface,{});assert(s.armed && s.revision==0);
        s.hit=f.root.surface;onPointerFocus(&seat,f.root.surface,{});assert(s.armed && s.revision==0);
    } else if(mode=="withdraw") {
        onFocus(&seat,f.child.surface);f.child.xdg->m_mapped=false;f.child.surface->m_mapped=false;
        f.child.xdg->m_events.unmap.emit();onFocus(&seat,f.root.surface);assert(s.armed && s.revision==0);
    } else if(mode=="withdraw-pointer-first" || mode=="withdraw-keyboard-first") {
        onFocus(&seat,f.child.surface);s.hit=f.child.surface;
        onPointerFocus(&seat,f.child.surface,{});assert(s.armed);
        f.child.xdg->m_mapped=false;f.child.surface->m_mapped=false;
        f.child.xdg->m_events.unmap.emit();s.hit=f.root.surface;
        // With both foci on a disappearing surface, neither input nor a
        // watchdog renewal may target that withdrawn surface. Pointer-first
        // departure conservatively interrupts until a fresh observation.
        if(mode=="withdraw-pointer-first") {
            onPointerFocus(&seat,f.root.surface,{});assert(!s.armed);
            onFocus(&seat,f.root.surface);assert(!s.armed);
        } else {
            onFocus(&seat,f.root.surface);assert(s.armed);
            onPointerFocus(&seat,f.root.surface,{});assert(s.armed);
        }
    } else if(mode=="foreign" || mode=="null" || mode=="geometry" || mode=="pointer-hit") {
        SP<CWLSurfaceResource> next=f.child.surface;
        Node foreign{f.owner};foreign.childOf(f.root);
        if(mode=="foreign")next=foreign.surface;
        if(mode=="null")next={};
        if(mode=="geometry")s.stable=false;
        if(mode=="pointer-hit")onPointerFocus(&seat,next,{});else onFocus(&seat,next);
        assert(!s.armed && s.revision==1);
        onFocus(&seat,f.root.surface);assert(!s.armed && s.revision>=1);
    } else if(mode=="foreign-pointer") {
        auto foreign=std::make_shared<CWLSurfaceResource>();b.pointerSurface=foreign;
        seat.m_state.pointerFocus=foreign;
        onFocus(&seat,f.child.surface);assert(s.armed);
        s.positioningBoundSurface=true;s.hit=f.root.surface;
        onPointerFocus(&seat,f.root.surface,{});assert(s.armed && b.pointerSurface.lock()==f.root.surface);
        onPointerFocus(&seat,foreign,{});assert(!s.armed && s.revision==1);
    } else assert(false);
}
''')
    binary = directory / "focus"
    subprocess.run(["c++", "-std=c++23", "-Wall", "-Wextra", "-Werror", "-I", str(directory),
                    "-I", str(ROOT / "tests"), "-I", str(ROOT / "assets/hyprland-input"),
                    str(source), "-o", str(binary)], check=True)
    return binary


@pytest.mark.parametrize("scenario", ["keyboard", "pointer", "withdraw", "foreign", "null",
                                      "geometry", "pointer-hit", "foreign-pointer",
                                      "withdraw-pointer-first", "withdraw-keyboard-first"])
def test_native_admitted_focus(focus_binary, scenario):
    subprocess.run([str(focus_binary), scenario], check=True)


def test_extracted_armed_snapshot_and_active_event(tmp_path):
    """Execute the production early-return and event lambda, not copies of them."""
    production = (ROOT / "assets/hyprland-input/scope-plugin.cpp").read_text()
    snapshot = production.split("    J snapshot(", 1)[1].split(
        "        if (refreshGroup &&", 1)[0]
    signature, body = snapshot.split(" {", 1)
    event = production.split("e.window.active.listen(", 1)[1].split("));", 1)[0]
    source = tmp_path / "snapshot-event.cpp"
    source.write_text(r'''
#include <cassert>
#include <functional>
#include <memory>
#include <string>
struct Monitor {std::string m_name="HDMI-A-1";};
struct Ref {
    std::shared_ptr<Monitor> value=std::make_shared<Monitor>();
    bool expired() const {return !value;}
    Monitor* operator->() const {return value.get();}
};
struct Snapshot {Ref monitor; std::string groupToken="group", token="frozen"; int inventory=7;};
using J=int;
struct State {
    bool armed=true,healthy=true,environmentOK=true;
    int revision=9, serial=9, captures=0, replies=0, checks=0, liveInventory=7;
    Snapshot bound;
    bool environment() const {return environmentOK;}
    bool scope() {++checks;return armed && healthy && serial==revision;}
    J status(bool,const std::string&) {return -1;}
    J snapshotReply(const Snapshot& b) {++replies;assert(&b==&bound);assert(b.token=="frozen");return b.inventory;}
    J snapshot(''' + signature + " {" + body + r'''
        ++captures;return liveInventory;
    }
};
int main() {
    State state; auto* s=&state;
    std::function<void()> epoch=[&]{++s->revision;s->armed=false;};
    auto activeEvent=''' + event + r''';
    assert(s->snapshot("HDMI-A-1","group")==7 && s->captures==0);
    // A live inventory change is never recaptured by an armed read. Its safety
    // is decided by scope(); the response remains the original captured proof.
    s->liveInventory=99;
    assert(s->snapshot("HDMI-A-1","group")==7 && s->captures==0);
    assert(s->snapshot("HDMI-A-1","group",true)==-1);
    assert(s->snapshot("DP-3","group")==-1);
    assert(s->snapshot("HDMI-A-1","other")==-1);
    auto replies=s->replies;
    s->healthy=false;
    assert(s->snapshot("HDMI-A-1","group")==-1 && s->replies==replies);
    s->healthy=true;activeEvent();assert(s->armed && s->revision==9);
    // A foreign seat hook advances revision before redundant window.active.
    // Returning to the original member cannot repair the invalidated serial.
    ++s->revision;
    activeEvent();assert(!s->armed && s->revision==11);
    activeEvent();assert(!s->armed && s->revision==12);
    assert(s->captures==0);
    s->armed=true;s->serial=s->revision;s->bound.monitor.value.reset();
    assert(s->snapshot("HDMI-A-1","group")==-1);
    s->environmentOK=false;
    assert(s->snapshot("HDMI-A-1","group")==-1);
}
''')
    binary = tmp_path / "snapshot-event"
    subprocess.run(["c++", "-std=c++23", "-Wall", "-Wextra", "-Werror",
                    str(source), "-o", str(binary)], check=True)
    subprocess.run([str(binary)], check=True)
