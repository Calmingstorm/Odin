"""Compiled production hooks and recovery, inert compositor, no live input.

Device state, aggregate state and seat-output state are deliberately independent.
Qualification covers native control flow, not Hyprland ABI or receiver delivery.
"""

import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]

NATIVE_DOUBLES = r'''
#include <algorithm>
#include <any>
#include <cassert>
#include <cstdint>
#include <cstdio>
#include <memory>
#include <set>
#include <stdexcept>
#include <string>
#include <tuple>
#include <vector>
#define physicalInputsReleased unusedPhysicalInputsReleased
#include "scope-provenance.hpp"
#undef physicalInputsReleased
bool physicalReleased=true;
namespace odin_scope { bool physicalInputsReleased() noexcept{return physicalReleased;} }
constexpr uint32_t WL_KEYBOARD_KEY_STATE_RELEASED=0, WL_KEYBOARD_KEY_STATE_PRESSED=1,
                  WL_POINTER_BUTTON_STATE_RELEASED=0, WL_POINTER_BUTTON_STATE_PRESSED=1;
template<class T> using SP=std::shared_ptr<T>;
struct IKeyboard {
 bool m_enabled=true,m_allowed=true,virtualDevice=true;
 bool isVirtual()const{return virtualDevice;}
 void* getClient()const{return virtualDevice?(void*)this:nullptr;}
 void updatePressed(uint32_t code,bool state){
  if(state)pressed.insert(code);else pressed.erase(code);
 }
 struct SKeyEvent { uint32_t timeMs,keycode,state; };
 struct SModifiersEvent {};
 struct { uint32_t depressed=0,latched=0,locked=0,group=0; } m_modifiersState;
 std::set<uint32_t> pressed;
 bool getPressed(uint32_t code) const { return pressed.contains(code); }
 void updateModifiers(uint32_t a,uint32_t b,uint32_t c,uint32_t d){m_modifiersState={a,b,c,d};}
};
struct IPointer { struct SButtonEvent { uint32_t timeMs,button,state; }; };
struct CInputManager {
 std::vector<SP<IKeyboard>> m_keyboards;
 std::vector<uint32_t> held,outputKeys;
 bool hasHeldButtons() const { return !held.empty(); }
 const std::vector<uint32_t>& getKeysFromAllKBs() const { return outputKeys; }
 void onMouseButton(IPointer::SButtonEvent, SP<IPointer>);
 void onKeyboardKey(const IKeyboard::SKeyEvent&, SP<IKeyboard>);
 void onKeyboardMod(SP<IKeyboard>);
 bool shouldIgnoreVirtualKeyboard(SP<IKeyboard>){return false;}
} input;
auto* g_pInputManager=&input;
void onKey(CInputManager*,const IKeyboard::SKeyEvent&,SP<IKeyboard>);
void onButton(CInputManager*,IPointer::SButtonEvent,SP<IPointer>);
void onMod(CInputManager*,SP<IKeyboard>);
struct KeySignal { SP<IKeyboard> device; bool fail=false;
 void emit(IKeyboard::SKeyEvent e) {
  if(fail) throw std::runtime_error("injected key transport failure");
  if(e.state) device->pressed.insert(e.keycode); else device->pressed.erase(e.keycode);
  onKey(&input,e,device);
 }
};
struct ModSignal { SP<IKeyboard> device;
 void emit(IKeyboard::SModifiersEvent) {device->m_modifiersState={};onMod(&input,device);}
};
struct Resource { struct { KeySignal key; ModSignal modifiers; } m_events; };
struct Keyboard {
 SP<IKeyboard> device; SP<Resource> resource; bool dead=false; pid_t pid=getpid();
};
struct Pointer { SP<IPointer> device; bool dead=false; };
struct Ref { int lock(){return 1;} };
struct Seat { struct { Ref pointerFocus; } m_state; std::weak_ptr<IKeyboard> m_keyboard; } seat;
auto* g_pSeatManager=&seat;
struct PM { int position(){return 1;} } pm;
auto* g_pPointerManager=&pm;
using ButtonFn=void(*)(CInputManager*,IPointer::SButtonEvent,SP<IPointer>);
using KeyFn=void(*)(CInputManager*,const IKeyboard::SKeyEvent&,SP<IKeyboard>);
using ModFn=void(*)(CInputManager*,SP<IKeyboard>);
struct Hook { void* m_original; };
uint32_t ms(){return 1;}
std::string processStartTicks(pid_t){return "999";}
void wl_client_get_credentials(void*,pid_t* pid,uid_t* uid,gid_t* gid){
 *pid=getpid();*uid=getuid();*gid=getgid();
}
using Event=std::tuple<char,uint32_t,uint32_t>;
std::vector<Event> forwarded;
bool cancelButton=false, cancelKey=false, consumeKeybind=false, throwButton=false;
bool injectForeign=false,injectLock=false;
bool injectPhysical=false;
void changeEnvironmentDuringRelease();
struct CKeybindManager {} bindings;
using KeyBindFn=bool(*)(CKeybindManager*,std::any,SP<IKeyboard>);
using MouseBindFn=bool(*)(CKeybindManager*,const IPointer::SButtonEvent&,SP<IPointer>);
bool onKeyBind(CKeybindManager*,std::any,SP<IKeyboard>);
bool onMouseBind(CKeybindManager*,const IPointer::SButtonEvent&,SP<IPointer>);
bool originalKeyBind(CKeybindManager*,std::any,SP<IKeyboard>){return !consumeKeybind;}
bool originalMouseBind(CKeybindManager*,const IPointer::SButtonEvent&,SP<IPointer>){return true;}
void originalKey(CInputManager* m,const IKeyboard::SKeyEvent& e,SP<IKeyboard> k){
 forwarded.emplace_back('k',e.keycode,e.state);
 if(cancelKey || !onKeyBind(&bindings,e,k)) return;
 if(e.state) m->outputKeys.push_back(e.keycode); else std::erase(m->outputKeys,e.keycode);
}
void originalMod(CInputManager*,SP<IKeyboard>){}
void originalButton(CInputManager* m,IPointer::SButtonEvent e,SP<IPointer> p){
 forwarded.emplace_back('b',e.button,e.state);
 if(throwButton) throw std::runtime_error("injected button transport failure");
 if(cancelButton) return;
 if(!e.state&&injectForeign){injectForeign=false;onButton(m,{1,274,1},std::make_shared<IPointer>());}
 if(!e.state&&injectLock){injectLock=false;changeEnvironmentDuringRelease();}
 if(!e.state&&injectPhysical){injectPhysical=false;physicalReleased=false;}
 if(e.state) m->held.push_back(e.button);
 else {
  if(std::find(m->held.begin(),m->held.end(),e.button)==m->held.end()) return;
  std::erase(m->held,e.button);
 }
 (void)onMouseBind(&bindings,e,p);
}
'''


STATE = r'''
struct State {
 void (*updateDevicePressed)(IKeyboard*,uint32_t,bool)=
  [](IKeyboard* k,uint32_t code,bool state){k->updatePressed(code,state);};
 struct Owner {
  bool unknown=false,reconciled=false,empty=false,ack=false,inputFenced=false;
  bool revoked=false,retired=false;
  Keyboard* keyboard=nullptr; Pointer* pointer=nullptr;
 } owner;
 Owner* activeOwner=&owner;
 bool armed=true,draining=false,ownedModifiers=false,failed=false,ready=true;
 bool buttonOwnershipKnown=true,foreignButtonActivity=false,lockTransition=false;
 struct PopupWatch { bool action=true; };
 struct { SP<PopupWatch> popupWatch=std::make_shared<PopupWatch>(); } bound;
 int deadline=1,rejected=0;
 std::string reason;
 Keyboard* keyboard=nullptr; Pointer* pointer=nullptr;
 std::set<uint32_t> keys,buttons;
 Hook *buttonHook=nullptr,*keyHook=nullptr,*modHook=nullptr;
 Hook *keyBindHook=nullptr,*mouseBindHook=nullptr;
 struct OwnedDispatch { OwnedDispatch(State&,bool){} };
 Pointer* find(SP<IPointer> p){return pointer && pointer->device==p?pointer:nullptr;}
 Keyboard* find(SP<IKeyboard> k){return keyboard && keyboard->device==k?keyboard:nullptr;}
 void reject(const char*){++rejected;}
 bool allow(){if(armed&&!failed&&(!activeOwner||(!owner.unknown&&!owner.inputFenced)))return true;
  ++rejected;return false;}
 bool environment()const{return ready&&!lockTransition;}
 int destinationAt(int){return 1;}
 std::string status(bool,const char* error){return error;}
'''


def _section(source, start, end):
    """Extract exact production definitions, never rewrite their control flow."""
    return source[source.index(start):source.index(end, source.index(start))]


SETUP = r'''
struct Fixture {
 State s;
 Hook bh{reinterpret_cast<void*>(originalButton)},kh{reinterpret_cast<void*>(originalKey)},
      mh{reinterpret_cast<void*>(originalMod)},kb{reinterpret_cast<void*>(originalKeyBind)},
      mb{reinterpret_cast<void*>(originalMouseBind)};
 SP<IKeyboard> kd=std::make_shared<IKeyboard>();
 SP<Resource> resource=std::make_shared<Resource>();
 Keyboard keyboard{kd,resource};
 Pointer pointer{std::make_shared<IPointer>()};
 Fixture(const char* directory) {
  live=&s;
  s.buttonHook=&bh;s.keyHook=&kh;s.modHook=&mh;s.keyBindHook=&kb;s.mouseBindHook=&mb;
  resource->m_events.key.device=kd;resource->m_events.modifiers.device=kd;
  s.keyboard=&keyboard;s.pointer=&pointer;
  s.owner.keyboard=&keyboard;s.owner.pointer=&pointer;
  input.m_keyboards={kd};
  seat.m_keyboard=kd;
  assert(s.recovery.open(directory,"i1-abcd1234"));
 }
 void down(char kind,uint32_t code) {
  if(kind=='b') onButton(&input,{1,code,1},pointer.device);
  else resource->m_events.key.emit({1,code,1});
 }
 void up(char kind,uint32_t code) {
  if(kind=='b') onButton(&input,{1,code,0},pointer.device);
  else resource->m_events.key.emit({1,code,0});
 }
 void retire() {
  s.armed=false;s.activeOwner=nullptr;s.keyboard=nullptr;s.pointer=nullptr;
  input.m_keyboards={std::make_shared<IKeyboard>()};
 }
};
'''


@pytest.fixture(scope="module")
def native_binary(tmp_path_factory):
    plugin = (ROOT / "assets/hyprland-input/scope-plugin.cpp").read_text()
    members = _section(
        plugin, "    odin_scope::RecoveryJournal recovery;", "    CHyprSignalListener newKeyboard",
    )
    helpers = _section(plugin, "    bool pendingIntent(", "    bool provenance(")
    revoke = _section(plugin, "    void revoke(", "    J status(")
    held = _section(plugin, "    bool inputHeld()", "    bool pendingIntent(")
    recovery = _section(plugin, "bool State::recoverPending()", "// Witness only")
    hooks = _section(plugin, "bool onKeyBind(", "void onAxis(")
    guards = _section(plugin, "    J inventoryTargets() {", "        focusCandidates.clear();")
    guards = guards.replace("J inventoryTargets()", "std::string inventoryTargets()")
    code = NATIVE_DOUBLES + STATE + members + helpers + held + revoke + guards + '''
        return "ok";
    }
};
State* live;
void changeEnvironmentDuringRelease(){live->lockTransition=true;}
''' + recovery + hooks + r'''
void CInputManager::onMouseButton(IPointer::SButtonEvent e,SP<IPointer> p){onButton(this,e,p);}
void CInputManager::onKeyboardKey(const IKeyboard::SKeyEvent& e,SP<IKeyboard> k){onKey(this,e,k);}
void CInputManager::onKeyboardMod(SP<IKeyboard> k){onMod(this,k);}
''' + SETUP + MAIN
    directory = tmp_path_factory.mktemp("precise-native")
    source = directory / "native.cpp"
    source.write_text(code)
    binary = directory / "native"
    subprocess.run(["c++", "-std=c++23", "-Wall", "-Wextra", "-Werror", "-I",
                    str(ROOT / "assets/hyprland-input"), str(source), "-o", str(binary)],
                   check=True, timeout=60)
    return binary


@pytest.mark.parametrize("case", ["unmatched", "button", "multiple", "cancel-button",
    "cancel-key", "throw-button", "physical", "lock", "keybind-consumed", "reload",
    "normal-cancel-key", "normal-cancel-button", "foreign-reentrant", "lock-midway",
    "foreign-device-held", "unmatched-alongside", "reload-key", "ghost-button",
    "physical-midway", "failed-reload", "disabled-keyboard", "duplicate-down",
    "revoke-cancel-key", "revoke-cancel-button", "revoke-key-transport-fail",
    "revoke-keybind-consumed"])
def test_actual_hook_and_inventory_recovery(native_binary, tmp_path, case):
    tmp_path.chmod(0o700)
    subprocess.run([str(native_binary), case, str(tmp_path)], check=True, timeout=10)


MAIN = r'''
int main(int argc,char** argv) {
 assert(argc==3);std::string test=argv[1];
 auto f=std::make_unique<Fixture>(argv[2]);
 if(test=="unmatched") {
  f->s.armed=false;input.held={273};
  const auto result=f->s.inventoryTargets();
  assert(result!="ok" && forwarded.empty() && input.held==std::vector<uint32_t>{273});
  return 0;
 }
 const bool key=test=="cancel-key"||test=="keybind-consumed"||test=="normal-cancel-key"||
  test=="reload-key"||test=="disabled-keyboard"||test=="revoke-cancel-key"||
  test=="revoke-key-transport-fail"||test=="revoke-keybind-consumed";
 f->down(key?'k':'b',key?40:272);
 assert(f->s.recovery.hasPending());
 if(test=="multiple") {f->down('k',40);f->down('k',42);f->down('b',273);}
 if(test=="foreign-reentrant"||test=="lock-midway"||test=="physical-midway")f->down('b',273);
 forwarded.clear();
 if(test.starts_with("revoke-")) {
  cancelKey=test=="revoke-cancel-key";cancelButton=test=="revoke-cancel-button";
  f->resource->m_events.key.fail=test=="revoke-key-transport-fail";
  consumeKeybind=test=="revoke-keybind-consumed";
  f->s.revoke("test-revoke");
  if(consumeKeybind) {
   assert(!f->s.recovery.hasPending()&&!f->s.failed&&f->s.owner.ack);
   assert(input.outputKeys==std::vector<uint32_t>{40});
  } else {
   assert(f->s.recovery.hasPending()&&f->s.failed&&!f->s.owner.ack);
   assert(key?f->s.keys.contains(40):f->s.buttons.contains(272));
  }
  if(f->resource->m_events.key.fail)assert(forwarded.empty());
  for(const auto& e:forwarded)assert(std::get<2>(e)==0);
  return 0;
 }
 if(test=="duplicate-down") {
  f->down('b',272);
  assert(forwarded.empty()&&input.held==std::vector<uint32_t>{272});
  assert(f->s.recovery.heldButtons()==std::set<uint32_t>{272});return 0;
 }
 if(test=="failed-reload") {
  cancelButton=true;f->s.armed=false;assert(f->s.inventoryTargets()!="ok");
  assert(f->s.buttons.contains(272)&&f->s.recovery.hasPending());
  f.reset();f=std::make_unique<Fixture>(argv[2]);f->s.armed=false;
  assert(f->s.recovery.heldButtons()==std::set<uint32_t>{272});
  assert(f->s.inventoryTargets()!="ok"&&f->s.recovery.hasPending());
  assert(input.held==std::vector<uint32_t>{272});
  assert(forwarded==std::vector<Event>({{'b',272,0},{'b',272,0}}));return 0;
 }
 if(test=="normal-cancel-key"||test=="normal-cancel-button") {
  cancelKey=key;cancelButton=!key;f->up(key?'k':'b',key?40:272);
  assert(f->s.recovery.hasPending());
  assert(key?f->s.keys.contains(40):f->s.buttons.contains(272));
  return 0;
 }
 if(test=="keybind-consumed") {
  consumeKeybind=true;f->up('k',40);
  assert(!f->s.recovery.hasPending()&&f->s.keys.empty());
  assert(input.outputKeys==std::vector<uint32_t>{40});
  f->s.armed=false;assert(f->s.inventoryTargets()=="ok");
  assert(forwarded==std::vector<Event>({{'k',40,0}}));return 0;
 }
 if(test=="cancel-button")cancelButton=true;
 if(test=="cancel-key")cancelKey=true;
 if(test=="throw-button")throwButton=true;
 if(test=="physical")physicalReleased=false;
 if(test=="lock")f->s.lockTransition=true;
 if(test=="foreign-reentrant")injectForeign=true;
 if(test=="lock-midway")injectLock=true;
 if(test=="physical-midway")injectPhysical=true;
 if(test=="disabled-keyboard")f->kd->m_enabled=false;
 if(test=="foreign-device-held") {
  auto human=std::make_shared<IKeyboard>();human->virtualDevice=false;human->pressed.insert(30);
  input.m_keyboards.push_back(human);
 }
 if(test=="unmatched-alongside")input.held.push_back(274);
 if(test=="ghost-button")input.held.clear(); // WAL intent survived a crash BEFORE down delivery.
 f->s.armed=false;
 if(test=="reload"||test=="reload-key") {
  f.reset(); // Close journal then recreate plugin state on the SAME compositor ledger.
  f=std::make_unique<Fixture>(argv[2]);f->s.armed=false;
  assert(key?f->s.recovery.heldKeys()==std::set<uint32_t>{40}:
             f->s.recovery.heldButtons()==std::set<uint32_t>{272});
 }
 const auto result=f->s.inventoryTargets();
 if(test=="unmatched-alongside") {
  assert(result!="ok"&&!f->s.recovery.hasPending());
  assert(input.held==std::vector<uint32_t>{274});
  assert(forwarded==std::vector<Event>({{'b',272,0}}));return 0;
 }
 if(test=="foreign-reentrant") {
  assert(result!="ok"&&f->s.recovery.poisoned());
  assert(f->s.recovery.heldButtons()==std::set<uint32_t>({272,273}));
  assert(forwarded==std::vector<Event>({{'b',272,0},{'b',274,1}}));
  assert(input.held==std::vector<uint32_t>({273,274}));return 0;
 }
 if(test=="lock-midway"||test=="physical-midway") {
  assert(result!="ok"&&f->s.recovery.heldButtons()==std::set<uint32_t>{273});
  assert(forwarded==std::vector<Event>({{'b',272,0}}));return 0;
 }
 const bool blocked=test=="cancel-button"||test=="cancel-key"||test=="throw-button"||
  test=="physical"||test=="lock"||test=="foreign-device-held"||test=="disabled-keyboard";
 if(blocked) {
  assert(result!="ok" && f->s.recovery.hasPending());
  if(test=="physical"||test=="lock"||test=="foreign-device-held"||test=="disabled-keyboard")assert(forwarded.empty());
  if(key)assert(f->s.recovery.heldKeys()==std::set<uint32_t>{40});
  else assert(f->s.recovery.heldButtons()==std::set<uint32_t>{272});
 } else {
  assert(result=="ok"&&!f->s.recovery.hasPending()&&input.held.empty());
  const std::vector<Event> expected=test=="multiple"?
   std::vector<Event>{{'k',40,0},{'k',42,0},{'b',272,0},{'b',273,0}}:
   test=="ghost-button"?std::vector<Event>{}:
   key?std::vector<Event>{{'k',40,0}}:std::vector<Event>{{'b',272,0}};
  assert(forwarded==expected);
 }
 for(const auto& e:forwarded)assert(std::get<2>(e)==0); // No recovery DOWN, ever.
}
'''
