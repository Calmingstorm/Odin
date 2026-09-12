# ruff: noqa: E501
"""Synthetic contracts for the R46 stationary absolute-warp repair.

This compiles the real extracted ``onWarp`` with mocks. It is not live
Hyprland, input-delivery, or receiver evidence.
"""

import os
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
PLUGIN = ROOT / "assets/hyprland-input/scope-plugin.cpp"


def _hook():
    source = PLUGIN.read_text(encoding="utf-8")
    return "void onWarp(" + source.split("void onWarp(", 1)[1].split("\nvoid onFocus(", 1)[0]


@pytest.fixture(scope="module")
def warp_binary(tmp_path_factory):
    compiler = shutil.which("c++") or shutil.which("g++") or shutil.which("clang++")
    assert compiler
    build = tmp_path_factory.mktemp("stationary-warp-r46")
    cpp, binary = build / "test.cpp", build / "test"
    cpp.write_text(r'''
#include <cassert>
#include <cmath>
#include <memory>
#include <set>
#include <string>
#include <string_view>
#include <vector>
struct Vector2D {
 double x=0,y=0;
 Vector2D operator+(Vector2D b) const { return {x+b.x,y+b.y}; }
 Vector2D operator*(Vector2D b) const { return {x*b.x,y*b.y}; }
 Vector2D floor() const { return {std::floor(x),std::floor(y)}; }
 bool operator==(const Vector2D&) const = default;
};
struct Device{}; struct Surface{int id;};
struct Ref { std::shared_ptr<Surface> value; auto lock() const { return value; } };
struct IPointer { struct SMotionAbsoluteEvent { std::shared_ptr<Device> device; Vector2D absolute; }; };
struct CInputManager; using WarpFn=void(*)(CInputManager*,IPointer::SMotionAbsoluteEvent);
struct Hook { WarpFn m_original; }; struct Pointer { std::shared_ptr<Device> device; };
auto target=std::make_shared<Surface>(Surface{1});
auto prior=std::make_shared<Surface>(Surface{2});
auto second=std::make_shared<Surface>(Surface{3});
struct State {
 struct OwnedDispatch { OwnedDispatch(State&,bool){} };
 Hook* warpHook=nullptr; std::vector<std::unique_ptr<Pointer>> pointers; Pointer* pointer=nullptr;
 bool positioningBoundSurface=false,ownedModifiers=false,armed=true,held=false,destinationValid=true;
 bool revokeInOriginal=false,holdInOriginal=false,moveUnexpectedly=false,consumeGate=false,secondTransition=false;
 unsigned accepted=0,rejected=0;
 std::string reason; std::set<int> keys,buttons;
 struct { Vector2D outputPos{0,0},outputSize{100,100}; } bound;
 bool scope() const { return armed; }
 bool allow(){ if(scope()){++accepted;return true;} ++rejected;return false; }
 bool inputHeld() const { return held; }
 auto destinationAt(Vector2D p) const { return destinationValid&&p.x>=0&&p.y>=0&&p.x<100&&p.y<100?target:std::shared_ptr<Surface>{}; }
 void reject(const char*){++rejected;} void revoke(const char* why){armed=false;reason=why;}
};
State* live=nullptr;
struct Seat {
 struct { Ref pointerFocus{prior}; } m_state;
 unsigned frames=0;
 void sendPointerFrame() { ++frames; }
} seat;
Seat* g_pSeatManager=&seat;
struct CInputManager {
 Vector2D cursor{50.25,50.75}; unsigned simulated=0;
 Vector2D getMouseCoordsInternal() const { return cursor; }
 void simulateMouseMovement(){
  ++simulated;
  if(live->positioningBoundSurface&&live->scope()&&!live->inputHeld()&&live->keys.empty()&&live->buttons.empty()&&!live->ownedModifiers&&live->destinationAt(cursor)==target){
   live->positioningBoundSurface=false; seat.m_state.pointerFocus.value=target;
  }
  if(live->secondTransition){ live->revoke("pre-pointer-focus-transfer"); seat.m_state.pointerFocus.value=second; }
 }
};
unsigned originals=0; bool originalMoves=false;
void originalWarp(CInputManager* m,IPointer::SMotionAbsoluteEvent e){
 ++originals; if(originalMoves)m->cursor=live->bound.outputPos+e.absolute*live->bound.outputSize;
 if(live->moveUnexpectedly)m->cursor={51.25,50.75};
 if(live->holdInOriginal)live->held=true;
 if(live->consumeGate)live->positioningBoundSurface=false;
 if(live->revokeInOriginal)live->revoke("synthetic-original-revoked");
}
''' + _hook() + r'''
struct Fixture {
 Hook hook{originalWarp}; State state; CInputManager manager; std::shared_ptr<Device> owned=std::make_shared<Device>();
 Fixture(){ originals=0;originalMoves=false;seat.m_state.pointerFocus.value=prior;state.warpHook=&hook;
  state.pointers.emplace_back(std::make_unique<Pointer>(Pointer{owned}));state.pointer=state.pointers.front().get();live=&state; }
 void warp(Vector2D absolute={0.5025,0.5075}){onWarp(&manager,{owned,absolute});}
};
int main(int argc,char** argv){
 assert(argc==2);std::string_view scenario(argv[1]);Fixture f;
 if(scenario=="stationary"){
  auto before=f.manager.cursor;f.warp();
  assert(before.x==50.25&&before.y==50.75); assert(f.manager.cursor==before); // explicit pre/post stationary evidence
  assert(f.manager.simulated==1&&seat.m_state.pointerFocus.lock()==target&&f.state.armed&&originals==1&&f.state.rejected==0);
  assert(seat.frames==1);return 0;
 }
 if(scenario=="moving"){
  f.manager.cursor={20.2,20.8};originalMoves=true;f.warp();assert((f.manager.cursor.floor()==Vector2D{50,50}));
  assert(f.manager.simulated==0&&!f.state.armed&&originals==1);return 0;
 }
 if(scenario=="scope-revoked"){
  f.state.revokeInOriginal=true;f.warp();assert(f.manager.simulated==0&&!f.state.armed&&originals==1);return 0;
 }
 if(scenario=="already-focused"){
  seat.m_state.pointerFocus.value=target;f.warp();assert(f.manager.simulated==0&&f.state.armed&&originals==1&&seat.frames==1);return 0;
 }
 if(scenario=="consumed-gate"){
  f.state.consumeGate=true;f.warp();assert(f.manager.simulated==0&&!f.state.armed&&originals==1);return 0;
 }
 if(scenario=="held-during-original"){
  f.state.holdInOriginal=true;f.warp();assert(f.manager.simulated==0&&!f.state.armed&&originals==1);return 0;
 }
 if(scenario=="unexpected-move"){
  f.state.moveUnexpectedly=true;f.warp();assert(f.manager.simulated==0&&!f.state.armed&&originals==1);return 0;
 }
 if(scenario=="held"){
  f.state.held=true;f.warp();assert(f.manager.simulated==0&&originals==0&&!f.state.armed&&f.state.reason=="warp-destination-refused");return 0;
 }
 if(scenario=="wrong-destination"){
  f.state.destinationValid=false;f.warp();assert(f.manager.simulated==0&&originals==0&&!f.state.armed&&f.state.reason=="warp-destination-refused");return 0;
 }
 if(scenario=="second-transition"){
  f.state.secondTransition=true;f.warp();assert(f.manager.simulated==1&&originals==1&&!f.state.armed);
  assert(f.state.reason=="warp-focus-postcondition-refused"&&seat.m_state.pointerFocus.lock()==second);return 0;
 }
 return 2;
}
''', encoding="utf-8")
    subprocess.run([compiler, "-std=c++20", "-Wall", "-Wextra", "-Werror", str(cpp), "-o", str(binary)],
                   check=True, capture_output=True, text=True, timeout=30)
    return binary


@pytest.mark.parametrize("scenario", [
    "stationary", "moving", "scope-revoked", "already-focused", "consumed-gate",
    "held-during-original", "unexpected-move", "held", "wrong-destination", "second-transition",
])
def test_extracted_on_warp_keeps_repair_narrow(warp_binary, scenario):
    result = subprocess.run([str(warp_binary), scenario], capture_output=True, text=True, timeout=5,
                            env={k: v for k, v in os.environ.items() if k not in {"DISPLAY", "WAYLAND_DISPLAY"}})
    assert result.returncode == 0, result.stderr


def test_source_uses_normal_non_refocusing_path_and_retains_guards():
    hook = _hook()
    assert hook.count("manager->simulateMouseMovement();") == 1
    assert "manager->refocus(" not in hook
    retry = hook.index("manager->simulateMouseMovement();")
    assert retry < hook.index('s.reject(!s.scope() ? "warp-post-scope-changed"')
    retry_guard = hook[hook.rfind("if (positioning", 0, retry):retry]
    for guard in ("s.positioningBoundSurface", "prewarp.floor() == pos.floor()", "manager->getMouseCoordsInternal().floor() == pos.floor()",
                  "s.scope()", "s.keys.empty()", "s.buttons.empty()", "!s.ownedModifiers", "!s.inputHeld()",
                  "s.destinationAt(pos) == destination", "g_pSeatManager->m_state.pointerFocus.lock() != destination"):
        assert guard in retry_guard
