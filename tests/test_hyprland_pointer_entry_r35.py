"""Coupled production warp/focus hooks, compiled against an inert seat model.

No compositor or input is started. Scope models the production snapshot's
keyboard/pointer/revision equality; revoke models release acknowledgement. This
tests hook admission and cleanup requests, not native release delivery.
"""
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]

HARNESS = r'''
#include <cassert>
#include <memory>
#include <string>
#include <vector>
template<class T> using SP = std::shared_ptr<T>;
struct CWLSurfaceResource {};
struct Ref {
    SP<CWLSurfaceResource> value;
    SP<CWLSurfaceResource> lock() const { return value; }
    Ref& operator=(SP<CWLSurfaceResource> v) { value=v; return *this; }
    bool operator==(const Ref& b) const { return value==b.value; }
    bool operator!=(const Ref& b) const { return !(*this==b); }
};
struct Vector2D {
    double x=0, y=0;
    Vector2D operator+(Vector2D b) const { return {x+b.x,y+b.y}; }
    Vector2D operator*(Vector2D b) const { return {x*b.x,y*b.y}; }
};
struct Device {};
struct IPointer { struct SMotionAbsoluteEvent {
    SP<Device> device; Vector2D absolute;
}; };
struct CInputManager {
    std::vector<int> physicalKeys;
    bool physicalButtons=false;
    std::vector<int> getKeysFromAllKBs() { return physicalKeys; }
    bool hasHeldButtons() { return physicalButtons; }
} input;
auto* g_pInputManager=&input;
struct CSeatManager {
    struct { Ref pointerFocus, keyboardFocus; } m_state;
    unsigned frames=0;
    void sendPointerFrame() { ++frames; }
} seat;
auto* g_pSeatManager=&seat;
struct PointerManager {
    Vector2D pos;
    Vector2D position() { return pos; }
} pointerManager;
auto* g_pPointerManager=&pointerManager;
using WarpFn=void (*)(CInputManager*, IPointer::SMotionAbsoluteEvent);
using PointerFocusFn=void (*)(CSeatManager*, SP<CWLSurfaceResource>, const Vector2D&);
struct Hook { void* m_original; };
struct Pointer { SP<Device> device; };
struct State {
    struct OwnedDispatch { OwnedDispatch(State&, bool) {} };
    Hook *warpHook, *pointerFocusHook;
    std::vector<std::unique_ptr<Pointer>> pointers;
    Pointer* pointer;
    bool armed=true, failed=false, draining=false;
    bool positioningBoundSurface=false, ownedModifiers=false, pointMatches=true;
    unsigned rejected=0, revision=0, boundRevision=0, revokes=0, releases=0;
    std::vector<int> keys, buttons;
    std::string reason;
    struct {
        Vector2D outputPos{0,0}, outputSize{1,1};
        Ref surface, pointerSurface;
    } bound;
    bool scope() const {
        return armed && !failed && revision==boundRevision &&
            seat.m_state.keyboardFocus==bound.surface &&
            seat.m_state.pointerFocus==bound.pointerSurface;
    }
    bool allow() {
        if (scope()) return true;
        ++rejected; revoke("scope-expired-or-changed"); return false;
    }
    bool point(Vector2D p) const {
        return pointMatches && p.x>=0 && p.y>=0 && p.x<100 && p.y<100;
    }
    void revoke(const char* why) {
        armed=false; reason=why; ++revokes;
        releases+=keys.size()+buttons.size()+unsigned(ownedModifiers);
        keys.clear(); buttons.clear(); ownedModifiers=false;
    }
};
State* live;
void onPointerFocus(CSeatManager*, SP<CWLSurfaceResource>, const Vector2D&);
unsigned warps=0, focuses=0;
SP<CWLSurfaceResource> destination, sibling;
bool reenter=false, flagSeen=false, corruptKeyboard=false, omitFocus=false;
bool addHeldDuringDispatch=false;
void originalFocus(CSeatManager* manager, SP<CWLSurfaceResource> surface, const Vector2D& local) {
    ++focuses;
    flagSeen=flagSeen || live->positioningBoundSurface;
    if (reenter) {
        reenter=false;
        // Reentrant focus to the SAME desired target, before the first transfer
        // updates seat state, must not reuse the single-entry exemption.
        onPointerFocus(manager, surface, local);
    }
    manager->m_state.pointerFocus=surface;
    if (corruptKeyboard) manager->m_state.keyboardFocus=sibling;
}
void originalWarp(CInputManager*, IPointer::SMotionAbsoluteEvent event) {
    ++warps; pointerManager.pos=event.absolute;
    if (addHeldDuringDispatch) { live->keys={10}; live->buttons={20}; live->ownedModifiers=true; }
    if (!omitFocus) onPointerFocus(&seat,destination,event.absolute);
}
'''

MAIN = r'''
int main(int argc, char** argv) {
    assert(argc==2); std::string test=argv[1];
    Hook wh{reinterpret_cast<void*>(originalWarp)}, fh{reinterpret_cast<void*>(originalFocus)};
    State s; live=&s; s.warpHook=&wh; s.pointerFocusHook=&fh;
    auto target=std::make_shared<CWLSurfaceResource>();
    auto prior=std::make_shared<CWLSurfaceResource>();
    sibling=std::make_shared<CWLSurfaceResource>(); destination=target;
    s.bound.surface=target; s.bound.pointerSurface=prior;
    seat.m_state.keyboardFocus=target; seat.m_state.pointerFocus=prior;
    auto owned=std::make_shared<Device>(), physical=std::make_shared<Device>();
    auto other=std::make_shared<Device>();
    s.pointers.emplace_back(std::make_unique<Pointer>(Pointer{owned}));
    s.pointers.emplace_back(std::make_unique<Pointer>(Pointer{other}));
    s.pointer=s.pointers.front().get();
    if (test=="owned-key") s.keys={1};
    if (test=="owned-button") s.buttons={2};
    if (test=="owned-modifier") s.ownedModifiers=true;
    if (test=="physical-key") input.physicalKeys={3};
    if (test=="physical-button") input.physicalButtons=true;
    if (test=="mixed-holds") {
        s.keys={1}; s.buttons={2}; input.physicalKeys={3}; input.physicalButtons=true;
    }
    if (test=="wrong-keyboard") seat.m_state.keyboardFocus=sibling;
    if (test=="sibling-hit") s.pointMatches=false;
    if (test=="wrong-focus") destination=sibling;
    if (test=="reentry") reenter=true;
    if (test=="post-scope") corruptKeyboard=true;
    if (test=="post-pointer") omitFocus=true;
    if (test=="dispatch-holds") addHeldDuringDispatch=true;
    if (test=="physical") { s.armed=false; destination=sibling; }
    auto device=test=="physical" ? physical : test=="other-owned" ? other : owned;
    onWarp(&input,{device,{40,50}});
    assert(!s.positioningBoundSurface);
    if (test=="success") {
        assert(s.armed && s.scope() && s.revokes==0 && s.revision==0);
        assert(seat.m_state.pointerFocus.lock()==target && s.bound.pointerSurface.lock()==target);
        assert(warps==1 && focuses==1 && seat.frames==1 && !flagSeen);
        // An ordinary later focus transfer cannot inherit the exemption.
        onPointerFocus(&seat,sibling,{1,2});
        assert(!s.armed && s.revision==1 && s.revokes==1);
    } else if (test=="physical") {
        assert(warps==1 && focuses==1 && seat.frames==0);
        assert(seat.m_state.pointerFocus.lock()==sibling);
        assert(pointerManager.pos.x==40 && pointerManager.pos.y==50);
    } else if (test=="other-owned") {
        assert(warps==0 && focuses==0 && s.armed && s.rejected==1);
    } else {
        assert(!s.armed && s.revokes>0 && seat.frames==0);
        assert(s.keys.empty() && s.buttons.empty() && !s.ownedModifiers);
        if (test=="wrong-focus" || test=="reentry" || test=="post-scope" ||
            test=="post-pointer" || test=="dispatch-holds") {
            assert(warps==1);
            assert(s.reason=="warp-focus-postcondition-refused");
        } else assert(warps==0 && focuses==0);
        if (test=="reentry") assert(focuses==2 && s.revision==1 && !flagSeen);
        if (test=="post-scope") assert(s.revokes==2);
        if (test=="dispatch-holds") assert(s.releases==3);
        if (test=="owned-key" || test=="owned-button" || test=="owned-modifier")
            assert(s.releases==1);
        if (test=="mixed-holds") assert(s.releases==2);
        if (test=="physical-key" || test=="mixed-holds")
            assert(input.physicalKeys==std::vector<int>{3});
        if (test=="physical-button" || test=="mixed-holds") assert(input.physicalButtons);
        unsigned before=warps;
        onWarp(&input,{owned,{40,50}});
        assert(warps==before); // Revocation fences further owned dispatch.
    }
}
'''


@pytest.fixture(scope="module")
def entry_binary(tmp_path_factory):
    compiler = shutil.which("c++")
    if not compiler:
        pytest.skip("C++ compiler unavailable")
    source = (ROOT / "assets/hyprland-input/scope-plugin.cpp").read_text()
    warp = "void onWarp(" + source.split("void onWarp(", 1)[1].split("\nvoid onFocus(", 1)[0]
    focus = "void onPointerFocus(" + source.split("void onPointerFocus(", 1)[1].split(
        "\nvoid onNewPointer(", 1
    )[0]
    directory = tmp_path_factory.mktemp("native-pointer-entry")
    cpp = directory / "entry.cpp"
    cpp.write_text(HARNESS + warp + focus + MAIN)
    binary = directory / "entry"
    subprocess.run([compiler, "-std=c++23", "-Wall", "-Wextra", "-Werror",
                    str(cpp), "-o", str(binary)], check=True, timeout=60)
    return binary


@pytest.mark.parametrize("scenario", [
    "success", "owned-key", "owned-button", "owned-modifier", "physical-key",
    "physical-button", "mixed-holds", "wrong-keyboard", "sibling-hit",
    "wrong-focus", "other-owned", "physical", "reentry", "post-scope",
    "post-pointer", "dispatch-holds",
])
def test_coupled_native_pointer_entry(entry_binary, scenario):
    subprocess.run([str(entry_binary), scenario], check=True, timeout=10)
