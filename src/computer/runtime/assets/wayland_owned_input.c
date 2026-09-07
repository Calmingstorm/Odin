/* Sole EI owner. argv: granted fd, exact portal mapping ID.
 * H key button GLOBAL_x GLOBAL_y ms; R; C (qualification compatibility).
 * B ms; then M x y | P button x y | D button n x y ... | K n key... |
 * T utf8_hex | J ctrl+a | Q button x y | W direction count x y.
 * Source-local actions release,
 * emits action_done, returns idle on SAME EI context. N heartbeat renews idle
 * only; ignored while active. S mapping_id selects an exact region while idle.
 * Compile -std=c11 -Wall -Wextra -Werror with libei-1.0, xkbcommon, -lm.
 * Receipts prove queued requests, NOT toolkit release or compositor admission.
 */
#define _POSIX_C_SOURCE 200809L
#include <libei.h>
#include <xkbcommon/xkbcommon.h>
#include <xkbcommon/xkbcommon-keysyms.h>
#include <errno.h>
#include <fcntl.h>
#include <math.h>
#include <poll.h>
#include <signal.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/mman.h>
#include <unistd.h>
static volatile sig_atomic_t cancelled;
static void on_signal(int sig) { (void)sig; cancelled = 1; }
static void receipt(const char *event, const char *reason, uint64_t now) {
  char line[256];
  int n=snprintf(line,sizeof line,"{\"event\":\"%s\",\"reason\":\"%s\",\"monotonic_us\":%llu}\n",event,reason,(unsigned long long)now);
  if(n>0 && n<(int)sizeof line) (void)write(1,line,(size_t)n);
}
struct point { double x,y; };
struct chord { unsigned keys[4],n; };
struct guardian {
  struct ei *ctx;
  struct ei_device *devices[64],*pointer,*keyboard;
  struct ei_region *region;
  unsigned ndevices,sequence;
  char mapping[129];
  double ox,oy,width,height;
  bool plost,klost,disconnected,ready,begun,action,pstarted,kstarted,fenced,done_pending;
  bool keys[248],buttons[8];
  struct xkb_context *xctx;
  struct xkb_keymap *keymap;
  uint32_t depressed,latched,locked,group;
  struct point points[256];
  struct chord text[256];
  unsigned combo[16],count,index,phase,button;
  int scroll_x,scroll_y;
  uint64_t next_step;
  char kind;
  uint64_t lease,idle,finish,settle;
  const char *reason;
  int status;
};
static void fail(struct guardian *g,const char *r,int s) { if(!g->reason){g->reason=r;g->status=s;} }
static bool valid_mapping(const char *s) {
  size_t n=strlen(s); if(!n || n>128)return false;
  for(size_t i=0;i<n;i++)if((unsigned char)s[i]<33 || (unsigned char)s[i]>126)return false;
  return true;
}
static bool mapped(struct guardian *g,bool select) {
  struct ei_device *chosen=NULL; struct ei_region *region=NULL; unsigned matches=0;
  for(unsigned d=0;d<g->ndevices;d++) {
    struct ei_device *dev=g->devices[d];
    if(!ei_device_has_capability(dev,EI_DEVICE_CAP_POINTER_ABSOLUTE) || !ei_device_has_capability(dev,EI_DEVICE_CAP_BUTTON))continue;
    for(unsigned i=0;i<1024;i++) {
      struct ei_region *r=ei_device_get_region(dev,i); if(!r)break; if(i==1023)return false;
      const char *id=ei_region_get_mapping_id(r);
      if(id && !strcmp(id,g->mapping)){matches++;chosen=dev;region=r;}
    }
  }
  if(matches!=1)return false;
  double x=ei_region_get_x(region),y=ei_region_get_y(region),w=ei_region_get_width(region),h=ei_region_get_height(region);
  if(!isfinite(x)||!isfinite(y)||!isfinite(w)||!isfinite(h)||w<=0||h<=0||!isfinite(x+w)||!isfinite(y+h))return false;
  if(!select)return chosen==g->pointer && region==g->region && x==g->ox && y==g->oy && w==g->width && h==g->height;
  g->pointer=chosen;g->region=region;g->ox=x;g->oy=y;g->width=w;g->height=h;return true;
}
static void load_keymap(struct guardian *g) {
  if(!g->keyboard)return;
  struct ei_keymap *km=ei_device_keyboard_get_keymap(g->keyboard);
  if(!km || ei_keymap_get_type(km)!=EI_KEYMAP_TYPE_XKB)return;
  size_t size=ei_keymap_get_size(km); if(!size || size>4*1024*1024)return;
  void *data=mmap(NULL,size,PROT_READ,MAP_PRIVATE,ei_keymap_get_fd(km),0);
  if(data==MAP_FAILED)return;
  /* EI keymap size is payload bytes; Mutter sends strlen(), without NUL.
   * Own one bounded terminator instead of assuming the mapped file includes it.
   * Embedded NUL followed by content remains invalid, never a silent prefix. */
  char *text=malloc(size+1);
  if(!text){munmap(data,size);return;}
  memcpy(text,data,size);text[size]=0;
  size_t content=size;
  if(content && text[content-1]==0)content--;
  bool valid=memchr(text,0,content)==NULL;
  g->xctx=xkb_context_new(XKB_CONTEXT_NO_FLAGS);
  if(g->xctx && valid)g->keymap=xkb_keymap_new_from_string(g->xctx,text,XKB_KEYMAP_FORMAT_TEXT_V1,XKB_KEYMAP_COMPILE_NO_FLAGS);
  free(text);
  munmap(data,size);
}
static void ready_receipt(struct guardian *g,const char *event) {
  char line[512];
  int n=snprintf(line,sizeof line,"{\"event\":\"%s\",\"reason\":\"single-ei-owner\",\"protocol\":1,\"width\":%.17g,\"height\":%.17g,\"pointer\":true,\"keyboard\":%s,\"text\":%s,\"keymap_format\":\"%s\",\"keymap_layouts\":%u,\"monotonic_us\":%llu}\n",event,g->width,g->height,g->keyboard?"true":"false",g->keymap?"true":"false",g->keymap?"xkb_v1":"none",g->keymap?xkb_keymap_num_layouts(g->keymap):0,(unsigned long long)ei_now(g->ctx));
  if(n>0 && n<(int)sizeof line)(void)write(1,line,(size_t)n);
}
/* Owned ledger is always written BEFORE a down, never releases human state. */
static void key(struct guardian *g,unsigned k,bool down) {
  g->keys[k]=down;ei_device_keyboard_key(g->keyboard,k,down);ei_device_frame(g->keyboard,ei_now(g->ctx));
}
static void button(struct guardian *g,unsigned b,bool down) {
  g->buttons[b-272]=down;ei_device_button_button(g->pointer,b,down);ei_device_frame(g->pointer,ei_now(g->ctx));
}
static void move(struct guardian *g,struct point p) {
  ei_device_pointer_motion_absolute(g->pointer,p.x+g->ox,p.y+g->oy);ei_device_frame(g->pointer,ei_now(g->ctx));
}
static void release(struct guardian *g,const char *reason) {
  bool sent=false,unsupported=false;
  for(unsigned k=247;k;k--)if(g->keys[k]) {
    if(!g->klost && !g->disconnected){key(g,k,false);sent=true;}else{g->keys[k]=false;unsupported=true;}
  }
  for(unsigned b=272;b<=279;b++)if(g->buttons[b-272]) {
    if(!g->plost && !g->disconnected){button(g,b,false);sent=true;}else{g->buttons[b-272]=false;unsupported=true;}
  }
  if(sent)receipt("release_sent",reason,ei_now(g->ctx));
  if(unsupported)receipt("unsupported_release","input-path-lost",ei_now(g->ctx));
}
static void stop_emulating(struct guardian *g) {
  if(g->pstarted && !g->plost && !g->disconnected)ei_device_stop_emulating(g->pointer);
  if(g->kstarted && !g->klost && !g->disconnected)ei_device_stop_emulating(g->keyboard);
  g->pstarted=g->kstarted=false;
}
static char *token(char **s) {
  if(!*s || !**s)return NULL;
  char *t=*s,*p=strchr(t,' ');if(p){*p=0;*s=p+1;}else *s=NULL;return *t?t:NULL;
}
static bool number(char **s,unsigned *out,unsigned low,unsigned high) {
  char *t=token(s),*end;if(!t)return false;
  for(char *p=t;*p;p++)if(*p<'0'||*p>'9')return false;
  errno=0;unsigned long n=strtoul(t,&end,10);if(errno||*end||n<low||n>high)return false;*out=(unsigned)n;return true;
}
static bool point(struct guardian *g,char **s,struct point *p,bool global) {
  double *v[]={&p->x,&p->y};
  for(unsigned i=0;i<2;i++){
    char *t=token(s),*end;if(!t)return false;errno=0;*v[i]=strtod(t,&end);
    if(errno||end==t||*end||!isfinite(*v[i]))return false;
  }
  if(global){p->x-=g->ox;p->y-=g->oy;}
  return p->x>=0 && p->y>=0 && p->x<g->width && p->y<g->height;
}
static unsigned modifier_key(struct guardian *g,xkb_keysym_t sym) {
  for(unsigned k=9;k<=255;k++){
    const xkb_keysym_t *syms;int n=xkb_keymap_key_get_syms_by_level(g->keymap,k,g->group,0,&syms);
    if(n==1 && syms[0]==sym)return k;
  }return 0;
}
/* Actual EI keymap, not US keycodes. Reject external held/latched/locked mods. */
static bool symbol_chord(struct guardian *g,unsigned ch,xkb_keysym_t sym,struct chord *out) {
  unsigned shift=modifier_key(g,XKB_KEY_Shift_L),level3=modifier_key(g,XKB_KEY_ISO_Level3_Shift),level5=modifier_key(g,XKB_KEY_ISO_Level5_Shift);
  for(unsigned mask=0;mask<8;mask++){
    if(((mask&1)&&!shift)||((mask&2)&&!level3)||((mask&4)&&!level5))continue;
    struct xkb_state *state=xkb_state_new(g->keymap);if(!state)return false;
    xkb_state_update_mask(state,0,0,0,0,0,g->group);
    if(mask&1)xkb_state_update_key(state,shift,XKB_KEY_DOWN);
    if(mask&2)xkb_state_update_key(state,level3,XKB_KEY_DOWN);
    if(mask&4)xkb_state_update_key(state,level5,XKB_KEY_DOWN);
    for(unsigned k=9;k<=255;k++){
      if(!sym&&(k==shift||k==level3||k==level5))continue;
      if(sym ? xkb_state_key_get_one_sym(state,k)==sym : xkb_state_key_get_utf32(state,k)==ch){
        out->n=0;if(mask&1)out->keys[out->n++]=shift-8;if(mask&2)out->keys[out->n++]=level3-8;
        if(mask&4)out->keys[out->n++]=level5-8;
        out->keys[out->n++]=k-8;xkb_state_unref(state);return true;
      }
    }xkb_state_unref(state);
  }return false;
}
static int hex(char c) {
  if(c>='0'&&c<='9')return c-'0';
  if(c>='a'&&c<='f')return c-'a'+10;
  if(c>='A'&&c<='F')return c-'A'+10;
  return -1;
}
static bool add_combo(struct guardian *g,unsigned code) {
  if(code<1||code>247||g->count>=16)return false;
  for(unsigned i=0;i<g->count;i++)if(g->combo[i]==code)return true;
  g->combo[g->count++]=code;return true;
}
static unsigned named_modifier(struct guardian *g,const char *name) {
  xkb_keysym_t sym;const char *mod;
  if(!strcmp(name,"ctrl")){sym=XKB_KEY_Control_L;mod=XKB_MOD_NAME_CTRL;}
  else if(!strcmp(name,"shift")){sym=XKB_KEY_Shift_L;mod=XKB_MOD_NAME_SHIFT;}
  else if(!strcmp(name,"alt")){sym=XKB_KEY_Alt_L;mod=XKB_MOD_NAME_ALT;}
  else if(!strcmp(name,"super")){sym=XKB_KEY_Super_L;mod=XKB_MOD_NAME_LOGO;}
  else return 0;
  unsigned code=modifier_key(g,sym);if(!code)return 0;
  struct xkb_state *state=xkb_state_new(g->keymap);if(!state)return 0;
  xkb_state_update_mask(state,0,0,0,0,0,g->group);
  xkb_state_update_key(state,code,XKB_KEY_DOWN);
  bool active=xkb_state_mod_name_is_active(state,mod,XKB_STATE_MODS_DEPRESSED)>0;
  xkb_state_unref(state);return active?code:0;
}
static bool named_chord(struct guardian *g,char *text) {
  if(!g->keymap||g->depressed||g->latched||g->locked||g->group>=xkb_keymap_num_layouts(g->keymap))return false;
  g->count=0;char *part=text,*plus;unsigned modifiers=0;
  while((plus=strchr(part,'+'))){
    *plus=0;unsigned code=named_modifier(g,part),before=g->count;
    if(!code||!add_combo(g,code-8)||g->count==before||++modifiers>4)return false;
    part=plus+1;
  }
  if(strlen(part)==1 && (unsigned char)*part>=32 && (unsigned char)*part<=126){
    struct chord chord;if(!symbol_chord(g,(unsigned char)*part,0,&chord))return false;
    for(unsigned i=0;i<chord.n;i++)if(!add_combo(g,chord.keys[i]))return false;
    return true;
  }
  xkb_keysym_t sym=xkb_keysym_from_name(part,XKB_KEYSYM_NO_FLAGS);
  struct chord chord;
  if(!sym||!symbol_chord(g,0,sym,&chord))return false;
  for(unsigned i=0;i<chord.n;i++)if(!add_combo(g,chord.keys[i]))return false;
  return true;
}
/* Strict UTF-8 decoding and whole-chunk preflight before any input event. */
static bool text_chords(struct guardian *g,const char *text) {
  size_t len=strlen(text);unsigned char bytes[1024];
  if(!len||len%2||len>sizeof bytes*2)return false;
  for(size_t i=0;i<len/2;i++){
    int a=hex(text[i*2]),b=hex(text[i*2+1]);if(a<0||b<0)return false;
    bytes[i]=(unsigned char)(a*16+b);
  }
  unsigned cps[256],n=0;size_t pos=0;
  while(pos<len/2){
    unsigned first=bytes[pos++],cp,min,extra;
    if(first<128){cp=first;min=0;extra=0;}
    else if(first>=0xc2&&first<=0xdf){cp=first&31;min=128;extra=1;}
    else if(first>=0xe0&&first<=0xef){cp=first&15;min=2048;extra=2;}
    else if(first>=0xf0&&first<=0xf4){cp=first&7;min=65536;extra=3;}
    else return false;
    if(n==256||pos+extra>len/2)return false;
    for(unsigned j=0;j<extra;j++){unsigned b=bytes[pos++];if((b&0xc0)!=0x80)return false;cp=(cp<<6)|(b&63);}
    if(cp<min||cp>0x10ffff||(cp>=0xd800&&cp<=0xdfff))return false;
    cps[n++]=cp;
  }
  char report[12000];size_t used=0;unsigned missing=0;
  for(unsigned i=0;i<n;i++){
    if(cps[i]<32||(cps[i]>=127&&cps[i]<160)||!symbol_chord(g,cps[i],0,&g->text[i])){
      int size=snprintf(report+used,sizeof report-used,"%s{\"index\":%u,\"codepoint\":%u}",missing?",":"",i,cps[i]);
      if(size<0||(size_t)size>=sizeof report-used)return false;
      used+=(size_t)size;missing++;
    }
  }
  if(missing){
    char line[12500];int size=snprintf(line,sizeof line,"{\"event\":\"action_rejected\",\"reason\":\"unsupported_character\",\"characters\":[%s],\"input_was_sent\":false}\n",report);
    if(size<=0||(size_t)size>=sizeof line)return false;
    /* Reports may exceed PIPE_BUF. Bounded partial-write drain before input. */
    size_t sent=0;
    for(unsigned attempt=0;sent<(size_t)size&&attempt<16&&!cancelled;attempt++){
      ssize_t written=write(1,line+sent,(size_t)size-sent);
      if(written>0){sent+=(size_t)written;continue;}
      if(written<0&&(errno==EAGAIN||errno==EWOULDBLOCK||errno==EINTR)){
        struct pollfd fd={1,POLLOUT,0};(void)poll(&fd,1,10);continue;
      }
      return false;
    }
    if(sent!=(size_t)size)return false;
    g->begun=false;g->lease=0;g->idle=ei_now(g->ctx)+2000000;g->count=0;
    return true;
  }
  g->count=n;return true;
}
static void start(struct guardian *g,bool p,bool k) {
  if(p){ei_device_start_emulating(g->pointer,++g->sequence);g->pstarted=true;}
  if(k){ei_device_start_emulating(g->keyboard,++g->sequence);g->kstarted=true;}
}
static void reject(struct guardian *g,const char *reason) {
  char line[256];int size=snprintf(line,sizeof line,"{\"event\":\"action_rejected\",\"reason\":\"%s\",\"input_was_sent\":false}\n",reason);
  if(size>0&&(size_t)size<sizeof line)(void)write(1,line,(size_t)size);
  g->begun=false;g->lease=0;g->idle=ei_now(g->ctx)+2000000;g->count=0;
}
static bool command(struct guardian *g,char *line) {
#ifdef WAYLAND_FIXTURE_FAULTS
  if(!strcmp(line,"F")){receipt("guardian_loss","last-ei-fd-eof-no-release",ei_now(g->ctx));_exit(0);}
#endif
  if(!strcmp(line,"R")){fail(g,"orderly",0);return true;}
  if(!strcmp(line,"C")){fail(g,"cancelled",0);return true;}
  if(!g->ready || !mapped(g,false))return false;
  if(!strcmp(line,"N")){
    if(!g->begun)g->idle=ei_now(g->ctx)+2000000;
    receipt("idle",g->begun?"active-no-renewal":"controller-heartbeat",ei_now(g->ctx));return true;
  }
  if(g->action)return false;
  char *rest=line,*verb=token(&rest);if(!verb || strlen(verb)!=1)return false;
  unsigned ms,k;
  if(*verb=='S'){
    char *id=token(&rest);if(g->begun||!id||rest||!valid_mapping(id))return false;
    strcpy(g->mapping,id);if(!mapped(g,true))return false;
    ready_receipt(g,"selected");return true;
  }
  if(*verb=='B'){
    if(g->begun||!number(&rest,&ms,1,2000)||rest)return false;
    g->begun=true;g->lease=ei_now(g->ctx)+(uint64_t)ms*1000;
    receipt("begun","nonrenewable-lease",ei_now(g->ctx));return true;
  }
  if(*verb=='H'){
    if(g->begun||!g->keyboard||!number(&rest,&k,1,247)||!number(&rest,&g->button,272,279)||!point(g,&rest,&g->points[0],true)||!number(&rest,&ms,1,2000)||rest)return false;
    g->begun=g->action=true;g->kind='H';g->lease=ei_now(g->ctx)+(uint64_t)ms*1000;
    start(g,true,true);move(g,g->points[0]);button(g,g->button,true);key(g,k,true);
    receipt("held","owned-ledger-before-dispatch",ei_now(g->ctx));return true;
  }
  if(!g->begun)return false;
  g->kind=*verb;
  if(*verb=='M'||*verb=='P'||*verb=='D'||*verb=='Q'){
    g->count=1;if(*verb!='M'&&!number(&rest,&g->button,272,279))return false;
    if(*verb=='D'&&!number(&rest,&g->count,2,256))return false;
    for(unsigned i=0;i<g->count;i++)if(!point(g,&rest,&g->points[i],false))return false;
  }else if(*verb=='W'){
    char *direction=token(&rest);
    if(!direction||!number(&rest,&g->count,1,20)||!point(g,&rest,&g->points[0],false)||rest)return false;
    if(!ei_device_has_capability(g->pointer,EI_DEVICE_CAP_SCROLL)){reject(g,"scroll_capability_unavailable");return true;}
    g->scroll_x=g->scroll_y=0;
    if(!strcmp(direction,"up"))g->scroll_y=-120;
    else if(!strcmp(direction,"down"))g->scroll_y=120;
    else if(!strcmp(direction,"left"))g->scroll_x=-120;
    else if(!strcmp(direction,"right"))g->scroll_x=120;
    else return false;
  }else if(*verb=='K'){
    if(!g->keyboard||!number(&rest,&g->count,1,16))return false;
    for(unsigned i=0;i<g->count;i++){
      if(!number(&rest,&g->combo[i],1,247))return false;
      for(unsigned j=0;j<i;j++)if(g->combo[j]==g->combo[i])return false;
    }
  }else if(*verb=='J'){
    char *chord=token(&rest);
    if(!chord||strlen(chord)>128||rest)return false;
    if(!g->keyboard||!g->keymap){reject(g,"keymap_unavailable");return true;}
    if(g->depressed||g->latched||g->locked){reject(g,"modifier_state_active");return true;}
    if(!named_chord(g,chord)){reject(g,"unsupported_key");return true;}
    g->kind='K';
  }else if(*verb=='T'){
    char *text=token(&rest);
    if(!text||!g->keymap||g->depressed||g->latched||g->locked||g->group>=xkb_keymap_num_layouts(g->keymap))return false;
    if(rest||!text_chords(g,text))return false;
    if(!g->begun)return true;
  }else return false;
  if(rest||cancelled||ei_now(g->ctx)>=g->lease)return false;
  g->action=true;g->next_step=0;start(g,*verb=='M'||*verb=='P'||*verb=='D'||*verb=='Q'||*verb=='W',*verb=='K'||*verb=='J'||*verb=='T');return true;
}
static void complete(struct guardian *g) {
  receipt("release_begin","completed",ei_now(g->ctx));release(g,"completed");
  /* Dispatch release before stop. Main loop processes path-loss events before
   * reporting success or accepting another lease. */
  ei_dispatch(g->ctx);g->done_pending=true;
}
static void action_done(struct guardian *g) {
  stop_emulating(g);
  receipt("action_done","completed",ei_now(g->ctx));g->begun=g->action=false;g->lease=0;
  g->index=g->phase=g->count=0;g->kind=0;g->idle=ei_now(g->ctx)+2000000;g->done_pending=false;
}
static void step(struct guardian *g) {
  if(!g->action||g->kind=='H'||g->done_pending)return;
  uint64_t now=ei_now(g->ctx);if(now<g->next_step)return;
  if(g->kind=='M'||g->kind=='P'||g->kind=='D'){
    if(g->index<g->count){move(g,g->points[g->index]);if(!g->index&&g->kind!='M')button(g,g->button,true);g->index++;}else complete(g);
  }else if(g->kind=='Q'){
    if(!g->phase){move(g,g->points[0]);button(g,g->button,true);g->phase=1;}
    else if(g->phase==1){button(g,g->button,false);g->phase=2;g->next_step=now+80000;}
    else if(g->phase==2){button(g,g->button,true);g->phase=3;}
    else complete(g);
  }else if(g->kind=='W'){
    if(!g->index)move(g,g->points[0]);
    ei_device_scroll_discrete(g->pointer,g->scroll_x,g->scroll_y);ei_device_frame(g->pointer,now);
    if(++g->index==g->count)complete(g);else g->next_step=now+30000;
  }else if(g->kind=='K'){
    if(!g->phase++){for(unsigned i=0;i<g->count;i++)key(g,g->combo[i],true);}else complete(g);
  }else if(g->kind=='T'){
    struct chord *c=&g->text[g->index];
    if(!g->phase){for(unsigned i=0;i<c->n;i++)key(g,c->keys[i],true);g->phase=1;}
    else{for(unsigned i=c->n;i;i--)key(g,c->keys[i-1],false);g->phase=0;if(++g->index==g->count)complete(g);}
  }
}
static void check_deadline(struct guardian *g) {
  uint64_t now=ei_now(g->ctx);if(cancelled)fail(g,"signal-cancel",0);
  if(g->lease&&now>=g->lease)fail(g,"lease-expired",2);
  if(!g->begun&&now>=g->idle)fail(g,"controller-timeout",2);
}
int main(int argc,char **argv) {
  if(argc!=3||!valid_mapping(argv[2]))return 64;
  char *end;errno=0;long fd=strtol(argv[1],&end,10);
  if(errno||end==argv[1]||*end||fd<3||fd>1048576)return 64;
  signal(SIGPIPE,SIG_IGN);signal(SIGTERM,on_signal);signal(SIGINT,on_signal);
  /* Library diagnostics must not turn a full stderr pipe into an unbounded
   * hold either. O_NONBLOCK applies to the inherited pipe, never the EI fd. */
  if(fcntl(0,F_SETFL,O_NONBLOCK)<0||fcntl(1,F_SETFL,O_NONBLOCK)<0||fcntl(2,F_SETFL,O_NONBLOCK)<0)return 1;
  struct guardian g={0};strcpy(g.mapping,argv[2]);g.ctx=ei_new_sender(NULL);
  if(!g.ctx){close((int)fd);return 1;}ei_configure_name(g.ctx,"odin-bounded-owned-input");
  if(ei_setup_backend_fd(g.ctx,(int)fd)){ei_unref(g.ctx);return 1;}
  g.idle=ei_now(g.ctx)+10000000;char input[32768];size_t used=0;
  for(;;){
    check_deadline(&g);uint64_t now=ei_now(g.ctx);
    if(g.reason&&!g.fenced){g.fenced=true;receipt("release_begin",g.reason,now);release(&g,g.reason);g.finish=now+100000;}
    if(g.fenced&&now>=g.finish)break;
    struct pollfd fds[]={{ei_get_fd(g.ctx),POLLIN,0},{g.fenced?-1:0,POLLIN,0}};
    int rc=poll(fds,2,1);if(rc<0&&errno!=EINTR)fail(&g,"poll-error",2);ei_dispatch(g.ctx);
    struct ei_event *event;
    while((event=ei_get_event(g.ctx))){
      enum ei_event_type type=ei_event_get_type(event);struct ei_device *dev=ei_event_get_device(event);
      if(type==EI_EVENT_SEAT_ADDED)ei_seat_bind_capabilities(ei_event_get_seat(event),EI_DEVICE_CAP_POINTER_ABSOLUTE,EI_DEVICE_CAP_BUTTON,EI_DEVICE_CAP_KEYBOARD,EI_DEVICE_CAP_SCROLL,NULL);
      if(type==EI_EVENT_DEVICE_RESUMED&&!g.fenced&&!g.reason){
        bool known=false;for(unsigned i=0;i<g.ndevices;i++)if(g.devices[i]==dev)known=true;
        if(g.ready)fail(&g,"topology-changed",3);
        else if(!known&&g.ndevices<64){g.devices[g.ndevices++]=ei_device_ref(dev);if(!g.keyboard&&ei_device_has_capability(dev,EI_DEVICE_CAP_KEYBOARD))g.keyboard=dev;g.settle=ei_now(g.ctx)+50000;}
        else if(!known)fail(&g,"too-many-devices",3);
      }
      if(type==EI_EVENT_DISCONNECT){g.disconnected=true;fail(&g,"input-path-lost",3);}
      if(type==EI_EVENT_DEVICE_REMOVED||type==EI_EVENT_DEVICE_PAUSED){
        if(dev==g.pointer)g.plost=true;
        if(dev==g.keyboard)g.klost=true;
        for(unsigned i=0;i<g.ndevices;i++)if(g.devices[i]==dev)fail(&g,"input-path-lost",3);
      }
      if(type==EI_EVENT_KEYBOARD_MODIFIERS&&dev==g.keyboard){
        g.depressed=ei_event_keyboard_get_xkb_mods_depressed(event);g.latched=ei_event_keyboard_get_xkb_mods_latched(event);
        g.locked=ei_event_keyboard_get_xkb_mods_locked(event);g.group=ei_event_keyboard_get_xkb_group(event);
        if(g.action)fail(&g,"modifier-state-changed",3);
      }ei_event_unref(event);
    }
    check_deadline(&g);
    if(!g.ready&&g.ndevices&&!g.reason&&ei_now(g.ctx)>=g.settle&&mapped(&g,true)){load_keymap(&g);g.ready=true;g.idle=ei_now(g.ctx)+2000000;ready_receipt(&g,"ready");}
    if(g.ready&&!g.reason&&!mapped(&g,false))fail(&g,"mapping-changed",3);
    /* Partial commands from inside an action cannot become fresh idle work. */
    if(g.done_pending&&used)fail(&g,"invalid-command",2);
    if(g.done_pending&&!g.reason)action_done(&g);
    if(!g.fenced&&!g.reason&&fds[1].revents){
      for(unsigned budget=0;budget<1024;budget++){
        char c;ssize_t n=read(0,&c,1);if(!n){fail(&g,"controller-eof",0);break;}
        if(n<0){if(errno!=EAGAIN&&errno!=EWOULDBLOCK&&errno!=EINTR)fail(&g,"transport-error",2);break;}
        if(c!='\n'){
          if(used==sizeof input-1||c==0||c=='\r'){fail(&g,"invalid-command",2);break;}input[used++]=c;continue;
        }
        input[used]=0;used=0;check_deadline(&g);
        if(!g.reason&&!command(&g,input))fail(&g,"invalid-command",2);
        if(g.reason)break;
      }
    }
    if(!g.fenced&&!g.reason)step(&g);
  }
  stop_emulating(&g);ei_dispatch(g.ctx);
  for(unsigned i=0;i<g.ndevices;i++)ei_device_unref(g.devices[i]);
  if(g.keymap)xkb_keymap_unref(g.keymap);
  if(g.xctx)xkb_context_unref(g.xctx);
  receipt("closed",g.reason?g.reason:"unknown",ei_now(g.ctx));ei_unref(g.ctx);return g.status;
}
