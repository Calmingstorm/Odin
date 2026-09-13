"""Execute production dispatch/lease/cleanup C with inert transport doubles.

This is not a compositor test. fd760ecb batches 32 (not 16), and renewal
arrives through command O, not a scope_bind call between dispatched events.
"""
import os
import subprocess
from pathlib import Path

import pytest

SOURCE = Path(__file__).resolve().parents[1] / "assets/hyprland-input/guardian.c"


def function(source, signature):
    start = source.index(signature)
    opening = source.index("{", start)
    depth = 1
    end = opening + 1
    while depth:
        depth += (source[end] == "{") - (source[end] == "}")
        end += 1
    return source[start:end]


@pytest.fixture(scope="module")
def dispatch_binary(tmp_path_factory):
    source = SOURCE.read_text()
    declarations = source[source.index("enum event_kind"):source.index("static void fail")]
    preamble = r'''
#include <assert.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <sys/types.h>
#define MAX_OUTPUTS 1
#define MAX_STEPS 128
#define WL_POINTER_AXIS_SOURCE_WHEEL 0
struct output { int unused; };
static uint64_t clock_us=100;
static bool cancelled;
static pid_t parent=123;
static uint64_t now_us(void) { return clock_us; }
static pid_t getppid(void) { return parent; }
'''
    doubles = r'''
static unsigned sent, releases, syncs, scope_calls, frames, receipts;
static int mutation, emit_ok=1, sync_ok=1, ack_ok=1, flush_ok=1;
static struct guardian *active;
/* Dispatch tests deliberately exercise the legacy no-query capability. The
 * negotiated query path has separate real AF_UNIX tests; reaching these
 * transport helpers here would invalidate this fixture's contract. */
static bool own_start_ticks(char out[32]) { (void)out; assert(false); return false; }
static bool command_id(char out[49]) { (void)out; assert(false); return false; }
static bool connect_scope_peer(struct guardian *g, bool initial) {
 (void)g; (void)initial; assert(false); return false;
}
struct scope_reply { bool release_acknowledged, have_armed, armed,
 have_keys, have_buttons, have_rejected; uint64_t keys,buttons,rejected; };
static void after_event(void) {
 ++sent;
 if (sent!=1) return;
 if(mutation==1) clock_us=active->lease;
 if(mutation==2) clock_us=active->scope_deadline;
 if(mutation==3) cancelled=true;
 if(mutation==4) parent++;
 if(mutation==5) active->changed=true;
 if(mutation==6) active->disconnected=true;
 if(mutation==7) clock_us=150;
}
static bool emit(const char *s) { (void)s; return emit_ok; }
static void receipt(struct guardian *g,const char *a,const char *b) {
 (void)g;(void)a;(void)b; ++receipts;
}
static void action_receipt(struct guardian *g,const char *a,const char *b) {
 receipt(g,a,b);
}
static void key(struct guardian *g,unsigned k,bool down) {
 g->keys[k]=down; if(down) after_event(); else ++releases;
}
static void button(struct guardian *g,unsigned b,bool down) {
 g->buttons[b-272]=down; if(down) after_event(); else ++releases;
}
static void zwlr_virtual_pointer_v1_motion_absolute(void *p,uint32_t t,
 uint32_t x,uint32_t y,unsigned w,unsigned h) {
 (void)p;(void)t;(void)x;(void)y;(void)w;(void)h;after_event();
}
static void zwlr_virtual_pointer_v1_frame(void *p) {(void)p;++frames;}
static void zwlr_virtual_pointer_v1_axis_source(void *p,int s) {(void)p;(void)s;}
static void zwlr_virtual_pointer_v1_axis_discrete(void *p,uint32_t t,
 unsigned code,int v,int32_t d) {(void)p;(void)t;(void)code;(void)v;(void)d;after_event();}
static int wl_fixed_from_double(double d) {return (int)(d*256);}
static void zwp_virtual_keyboard_v1_modifiers(void *p,int a,int b,int c,int d) {
 (void)p;(void)a;(void)b;(void)c;(void)d;
}
static void xkb_state_update_mask(void *p,int a,int b,int c,int d,int e,int f) {
 (void)p;(void)a;(void)b;(void)c;(void)d;(void)e;(void)f;
}
static bool synchronize(struct guardian *g,unsigned ms) {
 (void)g;assert(ms==100);++syncs;return sync_ok;
}
static int wl_display_flush(void *p) {(void)p;return flush_ok ? 0 : -1;}
static bool scope_call(struct guardian *g,const char *request,struct scope_reply *r) {
 assert(strcmp(request,"{\"op\":\"release_all\"}\n")==0);++scope_calls;
 *r=(struct scope_reply){.release_acknowledged=ack_ok,.have_armed=true,
 .have_keys=true,.have_buttons=true,.have_rejected=true,.rejected=g->rejected};return true;
}
'''
    main = r'''
int main(int argc,char **argv) {
 assert(argc==2); const char *test=argv[1];
 struct guardian g={.begun=true,.action=true,.parent_pid=123,.lease=1000,
 .scope_deadline=900,.planned=40,.pointer=(void*)1,.keyboard=(void*)1};active=&g;
 for(unsigned i=0;i<40;++i)g.events[i]=(struct event){.kind=MOVE};
 if(!strcmp(test,"budget")) {
  step(&g);assert(sent==32&&g.completed==32&&g.index==32&&g.action&&frames==32);
  step(&g);assert(sent==40&&g.completed==40&&!g.action&&!g.begun);
  assert(scope_calls==1&&syncs==1&&g.release_acknowledged&&g.release_sent);
 } else if(!strcmp(test,"mixed")) {
  g.planned=5;
  g.events[1]=(struct event){.kind=BUTTON,.code=272,.down=true};
  g.events[2]=(struct event){.kind=KEY,.code=42,.down=true};
  g.events[3]=(struct event){.kind=SCROLL,.x=1};
  g.events[4]=(struct event){.kind=BUTTON,.code=272,.down=false};
  step(&g);assert(sent==4&&g.completed==5&&!g.action&&releases==2);
  assert(!g.keys[42]&&!g.buttons[0]&&g.release_acknowledged);
 } else if(!strcmp(test,"due")) {
  mutation=7;g.events[1].at=120;step(&g);
  assert(sent==1&&g.index==1&&clock_us==150);step(&g);assert(sent==33);
  step(&g);assert(sent==40);
 } else if(!strcmp(test,"future")) {
  g.start=90;g.events[0].at=11;step(&g);assert(sent==0&&g.index==0);
  clock_us=101;step(&g);assert(sent==32);
 } else if(!strcmp(test,"gate")) {
  g.events[1].kind=GATE;step(&g);assert(sent==1&&g.index==1&&g.gate_waiting);
  step(&g);assert(sent==1&&g.gate_serial==1);g.gate_allowed=true;
  step(&g);assert(sent==1&&g.index==2&&!g.gate_allowed);step(&g);assert(sent==33);
 } else if(!strcmp(test,"gate_transport")) {
  g.events[0].kind=GATE;emit_ok=0;step(&g);
  assert(!sent&&!strcmp(g.reason,"transport-error"));
 } else if(!strncmp(test,"guard",5)) {
  mutation=atoi(test+5);step(&g);assert(sent==1&&g.index==1&&g.completed==1);
  assert(g.action&&scope_calls==0);
  const char *reasons[]={"", "lease-expired", "scope-evidence-expired",
                         "signal-cancel", "controller-eof"};
  if(mutation<=4)assert(g.reason&&!strcmp(g.reason,reasons[mutation]));
  /* Final supervisor cleanup must remain possible after a refusal. */
  g.disconnected=false;g.keys[42]=true;g.buttons[0]=true;g.modifiers=true;
  assert(release_all(&g));assert(releases==2&&!g.keys[42]&&!g.buttons[0]&&!g.modifiers);
  assert(g.release_sent&&g.release_acknowledged&&scope_calls==1);
 } else if(!strcmp(test,"expired_before_first")) {
  g.lease=clock_us;step(&g);assert(!sent&&!strcmp(g.reason,"lease-expired"));
 } else if(!strcmp(test,"completion_release_before_guard")) {
  g.planned=0;cancelled=true;g.keys[42]=true;step(&g);
  assert(releases==1&&scope_calls==1&&!g.action);
 } else if(!strcmp(test,"release_refusal")) {
  g.planned=0;ack_ok=0;step(&g);assert(g.action&&!g.release_acknowledged);
  assert(!strcmp(g.reason,"input-path-lost")&&scope_calls==1);
 } else if(!strcmp(test,"flush_refusal")) {
  g.planned=0;flush_ok=0;step(&g);assert(!g.release_sent&&scope_calls==1);
 } else if(!strcmp(test,"inactive")) {
  g.action=false;step(&g);assert(!sent&&!scope_calls);
 } else {assert(!"unknown test");}
 return 0;
}
'''
    unit = preamble + declarations + function(source, "static void fail(")
    unit += doubles + function(source, "static bool alive_scope(")
    unit += function(source, "static bool release_all(")
    unit += function(source, "static void step(") + main
    root = tmp_path_factory.mktemp("r41-dispatch")
    c_file, binary = root / "dispatch.c", root / "dispatch"
    c_file.write_text(unit)
    subprocess.run(["cc", "-std=c11", "-Wall", "-Wextra", "-Werror", "-O0",
                    str(c_file), "-o", str(binary)], check=True, capture_output=True, text=True)
    return binary


@pytest.mark.parametrize("case", [
    "budget", "mixed", "due", "future", "gate", "gate_transport",
    "guard1", "guard2", "guard3", "guard4", "guard5", "guard6",
    "expired_before_first", "completion_release_before_guard", "release_refusal",
    "flush_refusal", "inactive",
])
def test_extracted_production_dispatch(dispatch_binary, case):
    env = {k: v for k, v in os.environ.items()
           if k not in {"DISPLAY", "WAYLAND_DISPLAY", "DBUS_SESSION_BUS_ADDRESS"}}
    subprocess.run([str(dispatch_binary), case], check=True, env=env,
                   capture_output=True, text=True, timeout=5)
