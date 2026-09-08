"""Compile the shipping callback against a tiny hostile-traffic fixture."""
import subprocess
from pathlib import Path

SOURCE = Path(__file__).resolve().parents[1] / "assets/hyprland-input/scope-plugin.cpp"


def test_shipping_protocol_callback_filters_and_caps(tmp_path):
    source = SOURCE.read_text()
    callback = source.split("    static void protocolEvent(", 1)[1]
    callback = callback.split("    struct OwnedDispatch", 1)[0]
    fields = source.split("    struct WireEvent {", 1)[1].split("    // This callback", 1)[0]
    harness = r'''
#include <array>
#include <cstdint>
#include <cstring>
#include <string>
#include <cassert>
struct wl_client {};
struct wl_protocol_logger {};
enum wl_protocol_logger_type {WL_PROTOCOL_LOGGER_REQUEST, WL_PROTOCOL_LOGGER_EVENT};
union Arg { uint32_t u; int32_t f; };
struct wl_resource { const char* cls; wl_client* client; uint32_t id; };
struct wl_protocol_logger_message {
    wl_resource* resource; int message_opcode; int arguments_count; Arg* arguments;
};
const char* wl_resource_get_class(wl_resource* r) {return r->cls;}
wl_client* wl_resource_get_client(wl_resource* r) {return r->client;}
uint32_t wl_resource_get_id(wl_resource* r) {return r->id;}
double wl_fixed_to_double(int32_t f) {return f / 256.0;}
int64_t ns() {return 123;}
struct Surface {wl_client* c; wl_client* client() {return c;}};
struct Weak {
    Surface* p; bool expired() const {return !p;} Surface* operator->() {return p;}
    bool operator!=(const Weak& b) const {return p != b.p;}
};
struct Seat { struct {Weak pointerFocus;} m_state;} seat;
Seat* g_pSeatManager = &seat;
struct State {
    bool armed = true;
    struct {Weak surface; std::string token;} bound;
    struct WireEvent {FIELDS
    static void protocolEvent(CALLBACK
};
int main() {
    wl_client target, other; Surface surface{&target};
    State s; s.bound.surface = {&surface}; seat.m_state.pointerFocus = {&surface};
    s.bound.token = s.diagnosticToken = "secret-invocation"; s.ownedDispatch = true;
    wl_resource pointer{"wl_pointer", &target, 42};
    Arg args[4]{}; args[0].u=17; args[1].f=2560; args[2].f=5120;
    wl_protocol_logger_message m{&pointer,2,3,args};
    auto emit = [&] {State::protocolEvent(&s,WL_PROTOCOL_LOGGER_EVENT,&m);};
    // Rejected traffic has null args: proves admission precedes dereference.
    m.arguments=nullptr;
    State::protocolEvent(&s,WL_PROTOCOL_LOGGER_REQUEST,&m);
    pointer.client=&other; emit(); pointer.client=&target;
    pointer.cls="wl_keyboard"; emit(); pointer.cls="wl_pointer";
    s.ownedDispatch=false; emit(); s.ownedDispatch=true;
    s.armed=false; emit(); s.armed=true;
    s.diagnosticToken="wrong"; emit(); s.diagnosticToken=s.bound.token;
    seat.m_state.pointerFocus={nullptr}; emit(); seat.m_state.pointerFocus={&surface};
    m.message_opcode=0; emit(); m.message_opcode=2;
    assert(s.wireCount==0);
    m.arguments=args; emit();
    assert(s.wireCount==1 && s.wire[0].x==10 && s.wire[0].y==20 && s.wire[0].time==17);
    m.message_opcode=5; m.arguments_count=0; emit();
    assert(s.wire[1].opcode==5);
    m.message_opcode=3; m.arguments_count=4; args[1].u=18; args[2].u=272; args[3].u=1; emit();
    assert(s.wire[2].button==272 && s.wire[2].state==1 && s.wire[2].time==18);
    for(int i=0;i<300;++i) emit();
    assert(s.wireCount==256 && s.wireOverflow);
}
'''.replace("FIELDS", fields).replace("CALLBACK", callback)
    cpp = tmp_path / "fixture.cpp"
    cpp.write_text(harness)
    exe = tmp_path / "fixture"
    subprocess.run(
        ["c++", "-std=c++23", "-Wall", "-Wextra", "-Werror", str(cpp), "-o", str(exe)],
        check=True,
    )
    subprocess.run([str(exe)], check=True)


def test_flat_status_and_teardown_contract():
    source = SOURCE.read_text()
    status = source.split("    J status(", 1)[1].split("    J snapshot(", 1)[0]
    assert "events" not in status and "diagnostic" not in status
    destructor = source.split("    ~State() noexcept {", 1)[1].split("    bool isPeer", 1)[0]
    assert (destructor.index("wl_protocol_logger_destroy")
            < destructor.index('revoke("plugin-unload")'))
    warp = source.split("void onWarp(", 1)[1].split("void onFocus(", 1)[0]
    assert (warp.index("State::OwnedDispatch trace")
            < warp.rindex("original(manager, event)") < warp.index("sendPointerFrame"))
