"""Execute production revoke/button hook with an inert compositor ledger.

No display is opened. The aggregate button model mirrors Hyprland's push/erase
semantics; this qualifies ownership decisions, not compositor ABI or receivers.
"""
import subprocess
from pathlib import Path

import pytest


@pytest.fixture(scope="module")
def release_native(tmp_path_factory):
    plugin = Path("assets/hyprland-input/scope-plugin.cpp").read_text()
    revoke = plugin[plugin.index("    void revoke("):plugin.index("    J status(")]
    button = plugin[plugin.index("void onButton("):plugin.index("void onAxis(")]
    key_mod = plugin[plugin.index("void onKey("):plugin.index("void onButton(")]
    source = r'''
#include <cassert>
#include <cstdint>
#include <cstdio>
#include <memory>
#include <set>
#include <vector>
#include <string>
#include <stdexcept>
#include <algorithm>
#include "scope-provenance.hpp"
constexpr uint32_t KEY_MAX=767;
constexpr uint32_t WL_KEYBOARD_KEY_STATE_RELEASED=0, WL_KEYBOARD_KEY_STATE_PRESSED=1,
                  WL_POINTER_BUTTON_STATE_RELEASED=0, WL_POINTER_BUTTON_STATE_PRESSED=1;
template<class T> using SP=std::shared_ptr<T>;
struct IKeyboard {
 struct SKeyEvent { uint32_t timeMs,keycode,state; };
 struct SModifiersEvent {};
 struct { uint32_t depressed=0,latched=0,locked=0,group=0; } m_modifiersState;
 std::set<uint32_t> pressed;
 bool getPressed(uint32_t code) { return pressed.contains(code); }
 void updateModifiers(uint32_t a,uint32_t b,uint32_t c,uint32_t d){m_modifiersState={a,b,c,d};}
};
struct IPointer { struct SButtonEvent { uint32_t timeMs,button,state; }; };
struct KeySignal { SP<IKeyboard> device; bool fail=false;
 void emit(IKeyboard::SKeyEvent e) { if(!fail) device->pressed.erase(e.keycode); }
};
struct ModSignal { SP<IKeyboard> device;
 void emit(IKeyboard::SModifiersEvent) { device->m_modifiersState={}; }
};
struct Resource { struct { KeySignal key; ModSignal modifiers; } m_events; };
struct Keyboard { SP<IKeyboard> device; SP<Resource> resource; bool dead=false; };
struct Pointer { SP<IPointer> device; bool dead=false; };
struct CInputManager {
 std::vector<SP<IKeyboard>> m_keyboards;
 std::vector<uint32_t> held;
 bool hasHeldButtons() { return !held.empty(); }
 void onMouseButton(IPointer::SButtonEvent, SP<IPointer>);
} input;
auto* g_pInputManager=&input;
struct Ref { int lock(){return 1;} };
struct Seat { struct { Ref pointerFocus; } m_state; } seat;
auto* g_pSeatManager=&seat;
struct PM { int position(){return 1;} } pm;
auto* g_pPointerManager=&pm;
using ButtonFn=void(*)(CInputManager*,IPointer::SButtonEvent,SP<IPointer>);
using KeyFn=void(*)(CInputManager*,const IKeyboard::SKeyEvent&,SP<IKeyboard>);
using ModFn=void(*)(CInputManager*,SP<IKeyboard>);
struct Hook { void* m_original; };
uint32_t ms(){return 1;}
struct State {
 struct Owner {
  bool unknown=false,reconciled=false,empty=false,ack=false,inputFenced=false;
  bool revoked=false,retired=false;
  Keyboard* keyboard=nullptr; Pointer* pointer=nullptr;
 } owner;
 Owner* activeOwner=&owner;
 bool armed=true,draining=false,ownedModifiers=false,failed=false;
 struct PopupWatch { bool action=true; };
 struct { SP<PopupWatch> popupWatch=std::make_shared<PopupWatch>(); } bound;
 bool buttonOwnershipKnown=true,foreignButtonActivity=false;
 int deadline=1,rejected=0;
 std::string reason;
 Keyboard* keyboard=nullptr; Pointer* pointer=nullptr;
 std::set<uint32_t> keys,buttons;
 Hook *buttonHook=nullptr,*keyHook=nullptr,*modHook=nullptr;
 struct OwnedDispatch { OwnedDispatch(State&,bool){} };
 Pointer* find(SP<IPointer> p){return pointer && pointer->device==p?pointer:nullptr;}
 Keyboard* find(SP<IKeyboard> k){return keyboard && keyboard->device==k?keyboard:nullptr;}
 void reject(const char*){++rejected;}
 bool allow(){if(armed&&!failed&&!owner.unknown&&!owner.inputFenced)return true;
  ++rejected;return false;}
 int destinationAt(int){return 1;}
''' + revoke + r'''
};
State* live;
unsigned forwardedKeys=0,forwardedMods=0;
void originalKey(CInputManager*,const IKeyboard::SKeyEvent&,SP<IKeyboard>){++forwardedKeys;}
void originalMod(CInputManager*,SP<IKeyboard>){++forwardedMods;}
void original(CInputManager* m,IPointer::SButtonEvent e,SP<IPointer>){
 if(e.state) m->held.push_back(e.button);
 else std::erase(m->held,e.button);
}
''' + key_mod + button + r'''
void CInputManager::onMouseButton(IPointer::SButtonEvent e,SP<IPointer> p){onButton(this,e,p);}
int main(int argc,char**argv){
 assert(argc==2); std::string test=argv[1];
 State s; live=&s; Hook hook{reinterpret_cast<void*>(original)}; s.buttonHook=&hook;
 Hook keyHook{reinterpret_cast<void*>(originalKey)},modHook{reinterpret_cast<void*>(originalMod)};
 s.keyHook=&keyHook;s.modHook=&modHook;
 auto kd=std::make_shared<IKeyboard>(); auto resource=std::make_shared<Resource>();
 resource->m_events.key.device=kd; resource->m_events.modifiers.device=kd;
 Keyboard keyboard{kd,resource}; Pointer pointer{std::make_shared<IPointer>()};
 s.keyboard=&keyboard;s.pointer=&pointer;input.m_keyboards={kd};
 s.owner.keyboard=&keyboard;s.owner.pointer=&pointer;
 auto human=std::make_shared<IPointer>();
 // Real production hook owns the down; real aggregate then contains our hold.
 onButton(&input,{1,272,1},pointer.device);
 assert(s.buttons.contains(272)&&input.hasHeldButtons());
 if(test=="foreign-same") onButton(&input,{1,272,1},human);
 if(test=="foreign-normal-up") {
   onButton(&input,{1,272,1},human);
   auto before=input.held;
   onButton(&input,{1,272,0},pointer.device);
   assert(s.owner.unknown&&s.buttons.contains(272)&&input.held==before);
   assert(s.rejected==1);s.rejected=0;
 }
 if(test=="foreign-other") onButton(&input,{1,273,1},human);
 if(test=="foreign-up") onButton(&input,{1,273,0},human);
 if(test=="empty-owner-human-held") {
   onButton(&input,{1,272,0},pointer.device);
   onButton(&input,{1,273,1},human);
 }
 if(test=="foreign-press-release") {
   onButton(&input,{1,273,1},human);onButton(&input,{1,273,0},human);}
 if(test=="key-overlap") {auto physical=std::make_shared<IKeyboard>();physical->pressed.insert(40);
   input.m_keyboards.push_back(physical);s.keys.insert(40);kd->pressed.insert(40);}
 if(test=="missing-baseline") s.buttonOwnershipKnown=false;
 if(test=="unknown") {s.owner.unknown=true;s.owner.empty=false;s.owner.ack=false;}
 if(test=="stale-key") kd->pressed.insert(40);
 if(test=="modifier") kd->m_modifiersState.depressed=1;
 if(test=="missing-keyboard") s.keyboard=nullptr;
 if(test=="dead-pointer") pointer.dead=true;
 if(test=="key-release-fails") {
   s.keys.insert(40);kd->pressed.insert(40);resource->m_events.key.fail=true;}
 s.revoke("lease-or-focus-watchdog");
 assert(!s.armed);
 const bool clean=test=="clean"||test=="closed-clean"||test=="human-after-clean"||
   test=="empty-owner-human-held"||
   test=="duplicate-human-same-code"||test=="duplicate-fenced"||test=="duplicate-retired"||test=="duplicate-revoked"||
   test=="duplicate-other-owner"||test=="duplicate-key-mod";
 if(clean){
   assert(!s.failed&&!s.owner.unknown&&s.owner.empty&&s.owner.ack);
   // Exact production gate used by next snapshot/group-target admission.
   assert(odin_scope::group_refresh_allowed(s.armed,s.failed,!s.keys.empty(),
       !s.buttons.empty(),s.ownedModifiers,s.owner.unknown||s.owner.inputFenced,true));
   assert(s.buttons.empty());
   assert(input.hasHeldButtons()==(test=="empty-owner-human-held"));
   if(test=="duplicate-key-mod") {
     onKey(&input,{1,40,0},kd);onMod(&input,kd);
     assert(s.rejected==0 && forwardedKeys==0 && forwardedMods==0);
     s.owner.inputFenced=true;
     onKey(&input,{1,40,0},kd);onMod(&input,kd);
     assert(s.rejected==2 && forwardedKeys==0 && forwardedMods==0);
     return 0;
   }
   if(test=="duplicate-human-same-code") onButton(&input,{1,272,1},human);
   if(test=="duplicate-fenced") s.owner.inputFenced=true;
   if(test=="duplicate-retired") s.owner.retired=true;
   if(test=="duplicate-revoked") s.owner.revoked=true;
   if(test=="duplicate-other-owner") s.owner.pointer=nullptr;
   const bool refusedDuplicate=test=="duplicate-fenced"||test=="duplicate-retired"||
     test=="duplicate-revoked"||test=="duplicate-other-owner";
   auto heldBefore=input.held;
   onButton(&input,{1,272,0},pointer.device);
   assert(input.held==heldBefore && s.buttons.empty());
   assert(s.rejected==(refusedDuplicate?1:0));
   if(refusedDuplicate) return 0;
   if(test=="closed-clean") {keyboard.dead=true;pointer.dead=true;}
   if(test=="human-after-clean") onButton(&input,{1,273,1},human);
   // Subsequent explicit cleanup is harmless; a stale down is not admitted.
   s.revoke("operator-recovery");assert(!s.failed&&s.owner.ack);
   auto before=input.held;
   onButton(&input,{1,272,1},pointer.device);
   assert(s.buttons.empty()&&input.held==before&&s.rejected==1);
   onButton(&input,{1,272,0},pointer.device);
   assert(s.buttons.empty()&&input.held==before&&s.rejected==(test=="closed-clean"?2:1));
 }else{
   assert(s.failed&&s.owner.unknown&&!s.owner.ack);
   assert(!odin_scope::group_refresh_allowed(s.armed,s.failed,!s.keys.empty(),
       !s.buttons.empty(),s.ownedModifiers,s.owner.unknown||s.owner.inputFenced,true));
   // Unknown cannot be washed away by an explicit cleanup, even if a caller
   // claims a clean ledger or the virtual device subsequently changes state.
   s.revoke("operator-recovery");assert(s.failed&&s.owner.unknown);
   auto before=input.held;onButton(&input,{1,272,0},pointer.device);
   assert(input.held==before&&s.rejected==1);
   onButton(&input,{1,273,1},pointer.device);
   assert(input.held==before&&s.rejected==2);
 }
}
'''
    directory = tmp_path_factory.mktemp("revoked-release")
    path = directory / "release.cpp"
    path.write_text(source)
    binary = directory / "release"
    subprocess.run(["c++", "-std=c++23", "-Wall", "-Wextra", "-Werror",
                    "-I", "assets/hyprland-input", str(path),
                    "-o", str(binary)], check=True, timeout=30)
    return binary


@pytest.mark.parametrize("case", [
    "clean", "closed-clean", "human-after-clean", "empty-owner-human-held",
    "duplicate-human-same-code", "duplicate-fenced", "duplicate-retired", "duplicate-revoked",
    "duplicate-other-owner", "duplicate-key-mod",
    "foreign-same", "foreign-normal-up", "foreign-other",
    "foreign-up", "foreign-press-release", "key-overlap", "missing-baseline",
    "unknown", "stale-key", "modifier", "missing-keyboard", "dead-pointer",
    "key-release-fails",
])
def test_revoked_owner_release(release_native, case):
    subprocess.run([str(release_native), case], check=True, timeout=5)


def test_button_provenance_baseline_follows_clean_arm():
    source = Path("assets/hyprland-input/scope-plugin.cpp").read_text()
    arm = source[source.index('        if (armed) return status(false, "already-armed");'):]
    baseline = arm.index('buttonOwnershipKnown = true; foreignButtonActivity = false;')
    assert arm.index('if (inputHeld())') < baseline
    assert arm.index('owner-device-incarnation-changed') < baseline
