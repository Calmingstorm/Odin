/* R2 feasibility fixture, NOT a production backend. No hierarchy deletion.
 * Independent watchdog owns one pair for the private X server lifetime. Each
 * attachment gets a child input client with a pipe, a finite whitelist and a
 * two-second non-renewable lease. Record potentially-down input BEFORE dispatch.
 * Fence/reap client BEFORE releasing only the owned ledger. Keep the pair alive:
 * XSync + idle time cannot prove every other X client has drained its XI queries.
 */
#define _POSIX_C_SOURCE 200809L
#include <X11/Xlib.h>
#include <X11/keysym.h>
#include <X11/extensions/XInput2.h>
#include <X11/extensions/XTest.h>
#include <sys/socket.h>
#include <sys/un.h>
#include <sys/wait.h>
#include <poll.h>
#include <signal.h>
#include <time.h>
#include <unistd.h>
#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define SOCK "/workspace/watchdog.sock"
#define OWNER "Odin R2 retained"
#define LEASE 2.0
static int errors, op, ok;
static double now(void) { struct timespec t; clock_gettime(CLOCK_MONOTONIC,&t); return t.tv_sec+t.tv_nsec/1e9; }
static void sleep_ms(int n) { struct timespec t={n/1000,(n%1000)*1000000L}; nanosleep(&t,NULL); }
static void fail(const char *s) { fprintf(stderr,"FAIL %s errno=%d\n",s,errno); exit(10); }
static int xerror(Display *d,XErrorEvent *e) { char b[256]; XGetErrorText(d,e->error_code,b,sizeof b); fprintf(stderr,"XERROR %s minor=%d\n",b,e->minor_code); errors++; return 0; }
static Display *open_display(void) {
    Display *d=XOpenDisplay(":177"); if(!d) fail("display unavailable");
    int major=2,minor=2; if(XIQueryVersion(d,&major,&minor)!=Success) fail("XI2 unavailable"); return d;
}
static void key(Display *d,KeySym k,int down) { if(!XTestFakeKeyEvent(d,XKeysymToKeycode(d,k),down,CurrentTime)) fail("key injection"); }
static void button(Display *d,int b,int down) { if(!XTestFakeButtonEvent(d,b,down,CurrentTime)) fail("button injection"); }
static void motion(Display *d,int x,int y) { if(!XTestFakeMotionEvent(d,-1,x,y,CurrentTime)) fail("motion injection"); }
static void query(Display *d,int p,int k,const char *label) {
    Window root,child,focus; double rx,ry,wx,wy; XIButtonState b={0}; XIModifierState m; XIGroupState g;
    if(!XIQueryPointer(d,p,DefaultRootWindow(d),&root,&child,&rx,&ry,&wx,&wy,&b,&m,&g)) fail("query pointer");
    XIGetFocus(d,k,&focus); XSync(d,False);
    int buttons=0; for(int i=1;i<8;i++) if(i/8<b.mask_len && XIMaskIsSet(b.mask,i)) buttons|=1<<i;
    printf("{\"kind\":\"state\",\"label\":\"%s\",\"t\":%.9f,\"pointer\":%d,\"keyboard\":%d,\"x\":%.0f,\"y\":%.0f,\"focus\":%lu,\"mods\":%d,\"buttons\":%d}\n",label,now(),p,k,rx,ry,focus,m.effective,buttons);
    XFree(b.mask);
}
static int owned_identity(Display *d) {
    int n,found=0; XIDeviceInfo *all=XIQueryDevice(d,XIAllDevices,&n);
    if(!all) return 0;
    for(int i=0;i<n;i++) {
        if(all[i].deviceid==op && all[i].use==XIMasterPointer && all[i].attachment==ok && !strcmp(all[i].name,OWNER " pointer")) found|=1;
        if(all[i].deviceid==ok && all[i].use==XIMasterKeyboard && all[i].attachment==op && !strcmp(all[i].name,OWNER " keyboard")) found|=2;
    }
    XIFreeDeviceInfo(all); return found==3 && !errors;
}
static int owned_clear(Display *d) {
    Window root,child; double rx,ry,wx,wy; XIButtonState b={0}; XIModifierState m; XIGroupState g;
    if(!XIQueryPointer(d,op,DefaultRootWindow(d),&root,&child,&rx,&ry,&wx,&wy,&b,&m,&g)) return 0;
    int clear=m.effective==0;
    for(int i=0;i<b.mask_len;i++) if(b.mask[i]) clear=0;
    XFree(b.mask); return clear && !errors;
}
typedef struct { char kind; int a,b; unsigned long window; } Command;
static void worker(int fd) {
    Display *d=open_display(); XISetClientPointer(d,None,op); XSync(d,False);
    Command c;
    while(recv(fd,&c,sizeof c,0)==sizeof c) {
        if(c.kind=='Q') _exit(0); /* loss without XCloseDisplay or releases */
        if(c.kind=='H') { key(d,XK_Control_L,True); button(d,1,True); }
        else if(c.kind=='T') { key(d,(KeySym)c.a,True); key(d,(KeySym)c.a,False); }
        else if(c.kind=='C') { motion(d,c.a,c.b); button(d,1,True); button(d,1,False); }
        else if(c.kind=='F') XISetFocus(d,ok,c.window,CurrentTime);
        else _exit(12);
        XSync(d,False); if(errors || send(fd,"A",1,MSG_NOSIGNAL)!=1) _exit(13);
    }
    _exit(0); /* EOF fences this input client without a fatal signal */
}
static void receipt(const char *reason,double trigger,double released,int status) {
    printf("{\"kind\":\"release\",\"reason\":\"%s\",\"trigger\":%.9f,\"released\":%.9f,\"latency_ms\":%.3f,\"client_status\":%d,\"retained\":true,\"disabled\":false}\n",reason,trigger,released,(released-trigger)*1000,status);
}
static int watchdog(void) {
    Display *d=open_display();
    XIAddMasterInfo add={XIAddMaster,OWNER,True,True}; XIChangeHierarchy(d,(XIAnyHierarchyChangeInfo*)&add,1); XSync(d,False);
    int n; XIDeviceInfo *all=XIQueryDevice(d,XIAllMasterDevices,&n);
    for(int i=0;i<n;i++) { if(!strcmp(all[i].name,OWNER " pointer")) op=all[i].deviceid; if(!strcmp(all[i].name,OWNER " keyboard")) ok=all[i].deviceid; }
    XIFreeDeviceInfo(all); if(!op || !ok || !owned_identity(d)) fail("owned pair identity");
    XISetClientPointer(d,None,op); XSync(d,False);
    int listener=socket(AF_UNIX,SOCK_SEQPACKET|SOCK_CLOEXEC,0); if(listener<0) fail("socket");
    struct sockaddr_un a={.sun_family=AF_UNIX}; strcpy(a.sun_path,SOCK);
    if(bind(listener,(struct sockaddr*)&a,sizeof a) || listen(listener,1)) fail("bind/listen");
    printf("{\"kind\":\"watchdog-ready\",\"pid\":%ld,\"pointer\":%d,\"keyboard\":%d,\"lease_ms\":2000,\"server_release\":%d}\n",(long)getpid(),op,ok,VendorRelease(d));
    for(;;) {
        int control=accept(listener,NULL,NULL); if(control<0) fail("accept");
        char request[80]={0}; ssize_t len=recv(control,request,sizeof request-1,0);
        if(len==4 && !strcmp(request,"quit")) { if(!owned_clear(d)) fail("quit with held input"); send(control,"RETAINED",8,MSG_NOSIGNAL); close(control); break; }
        if(len!=6 || strcmp(request,"attach")) { close(control); continue; }
        if(!owned_identity(d) || !owned_clear(d)) fail("quarantined ownership/state");
        int pair[2]; if(socketpair(AF_UNIX,SOCK_SEQPACKET|SOCK_CLOEXEC,0,pair)) fail("worker socketpair");
        pid_t pid=fork(); if(pid<0) fail("fork");
        if(!pid) { close(pair[0]); close(listener); close(control); close(ConnectionNumber(d)); worker(pair[1]); }
        close(pair[1]);
        double deadline=now()+LEASE, trigger=0; const char *reason="unknown";
        int held_control=0,held_button=0,pending_key=0,pending_button=0;
        int pending=0; char pending_kind=0;
        char ack[128]; snprintf(ack,sizeof ack,"ATTACHED %d %d %ld %.9f",op,ok,(long)pid,deadline);
        send(control,ack,strlen(ack),MSG_NOSIGNAL);
        for(;;) {
            double remain=deadline-now();
            if(remain<=0) { reason="lease-expired"; trigger=deadline; break; }
            struct pollfd fds[2]={{control,POLLIN,0},{pair[0],POLLIN,0}};
            int ready=poll(fds,2,(int)(remain*1000)+1); if(ready<0 && errno==EINTR) continue; if(ready<0) fail("poll");
            if(fds[1].revents) {
                char b; ssize_t r=recv(pair[0],&b,1,MSG_DONTWAIT);
                if(r<=0) { reason="input-client-eof"; trigger=now(); break; }
                if(!pending || b!='A') fail("invalid worker acknowledgement");
                pending=0; pending_key=pending_button=0;
                if(pending_kind=='H') { held_control=1; held_button=1; }
                send(control,"DONE",4,MSG_NOSIGNAL);
            }
            if(fds[0].revents) {
                memset(request,0,sizeof request); len=recv(control,request,sizeof request-1,MSG_DONTWAIT);
                if(len<=0) { reason="controller-eof"; trigger=now(); break; }
                if(!strcmp(request,"detach")) { reason="graceful-detach"; trigger=now(); break; }
                if(pending) { reason="protocol-quarantine"; trigger=now(); break; }
                Command c={0};
                if(!strcmp(request,"hold")) { c.kind='H'; held_control=1; held_button=1; }
                else if(!strcmp(request,"client-eof")) c.kind='Q';
                else if(sscanf(request,"focus %lu",&c.window)==1) c.kind='F';
                else if(sscanf(request,"click %d %d",&c.a,&c.b)==2 && c.a>=0 && c.a<900 && c.b>=0 && c.b<500) { c.kind='C'; pending_button=1; }
                else if(strlen(request)==5 && !strncmp(request,"tap ",4) && request[4]>='a' && request[4]<='z') { c.kind='T'; c.a=request[4]; pending_key=c.a; }
                else { reason="protocol-quarantine"; trigger=now(); break; }
                if(held_control && c.kind!='H' && c.kind!='Q') { reason="protocol-quarantine"; trigger=now(); break; }
                pending=1; pending_kind=c.kind;
                if(send(pair[0],&c,sizeof c,MSG_NOSIGNAL)!=sizeof c) { reason="input-client-eof"; trigger=now(); break; }
            }
        }
        /* No future injection after fence/reap. If it cannot be established,
         * quarantine; do not delete devices or claim a verified cleanup. */
        shutdown(pair[0],SHUT_RDWR); close(pair[0]);
        int status=0; double limit=now()+0.2; pid_t waited;
        do { waited=waitpid(pid,&status,WNOHANG); if(waited==0) sleep_ms(1); } while(waited==0 && now()<limit);
        if(waited!=pid) fail("QUARANTINE client did not quiesce; no deletion or further input");
        if(!owned_identity(d)) fail("QUARANTINE device identity changed");
        if(held_control) key(d,XK_Control_L,False);
        if(held_button || pending_button) button(d,1,False);
        if(pending_key) key(d,(KeySym)pending_key,False);
        XSync(d,False);
        if(!owned_clear(d)) fail("QUARANTINE owned release unverified");
        receipt(reason,trigger,now(),status);
        const char *released_message="RELEASED RETAINED ENABLED";
        send(control,released_message,strlen(released_message),MSG_NOSIGNAL); close(control);
    }
    close(listener); unlink(SOCK); XCloseDisplay(d);
    printf("{\"kind\":\"watchdog-exit\",\"retained\":true,\"removed\":false}\n"); return errors?11:0;
}
int main(int argc,char **argv) {
    if(argc<2 || !getenv("XI2_PRIVATE_SANDBOX") || strcmp(getenv("DISPLAY")?getenv("DISPLAY"):"",":177") || getuid()==0 || access("/proc/self",F_OK)==0 || access("/harness/x11-passwd",R_OK)!=0) return 2;
    setbuf(stdout,NULL); XSetErrorHandler(xerror); signal(SIGPIPE,SIG_IGN);
    if(!strcmp(argv[1],"watchdog")) return watchdog();
    Display *d=open_display(); XISetClientPointer(d,None,2);
    if(!strcmp(argv[1],"query") && argc==4) { query(d,2,3,"human"); query(d,atoi(argv[2]),atoi(argv[3]),"owned"); }
    else if(!strcmp(argv[1],"human-focus") && argc==3) XISetFocus(d,3,strtoul(argv[2],NULL,10),CurrentTime);
    else if(!strcmp(argv[1],"human-click") && argc==4) { motion(d,atoi(argv[2]),atoi(argv[3])); button(d,1,True); button(d,1,False); }
    else if(!strcmp(argv[1],"human-hold")) { motion(d,850,450); key(d,XK_Shift_L,True); button(d,3,True); }
    else if(!strcmp(argv[1],"human-release")) { button(d,3,False); key(d,XK_Shift_L,False); }
    else if(!strcmp(argv[1],"human-tap") && argc==3 && strlen(argv[2])==1) { key(d,(KeySym)argv[2][0],True); key(d,(KeySym)argv[2][0],False); }
    else if(!strcmp(argv[1],"inventory")) {
        int n; XIDeviceInfo *all=XIQueryDevice(d,XIAllDevices,&n);
        for(int i=0;i<n;i++) printf("{\"kind\":\"device\",\"id\":%d,\"name\":\"%s\",\"enabled\":%s}\n",all[i].deviceid,all[i].name,all[i].enabled?"true":"false");
        XIFreeDeviceInfo(all);
    } else return 2;
    XSync(d,False); XCloseDisplay(d); return errors?11:0;
}
