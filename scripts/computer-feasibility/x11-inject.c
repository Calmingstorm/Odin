/* Real XI2 master devices and XTEST: no painted cursor or move-back. */
#include <X11/Xlib.h>
#include <X11/keysym.h>
#include <X11/extensions/XInput2.h>
#include <X11/extensions/XTest.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <sys/wait.h>

static Display *human, *odin, *monitor;
static int hp=2, hk=3, op=0, ok=0, xi_opcode;
static Window hw, ow;
static int errors=0;
static int xerror(Display *d, XErrorEvent *e) {
    char msg[256]; XGetErrorText(d,e->error_code,msg,sizeof(msg));
    fprintf(stderr,"XERROR %s request=%d minor=%d\n",msg,e->request_code,e->minor_code);
    errors++; return 0;
}
static void snapshot(const char *phase) {
    XSync(human,False); XSync(odin,False); usleep(150000);
    printf("PHASE %s\n",phase);
    for(int i=0;i<2;i++) {
        if(i && !op) continue;
        Window root, child, focus; double rx,ry,wx,wy;
        XIButtonState buttons; XIModifierState mods; XIGroupState group;
        XIQueryPointer(monitor,i?op:hp,DefaultRootWindow(monitor),&root,&child,&rx,&ry,&wx,&wy,&buttons,&mods,&group);
        XIGetFocus(monitor,i?ok:hk,&focus);
        printf("STATE %s pointer=%d keyboard=%d xy=%.0f,%.0f focus=%lu mods=%d buttons=",i?"odin":"human",i?op:hp,i?ok:hk,rx,ry,focus,mods.effective);
        for(int j=0;j<buttons.mask_len;j++) printf("%02x",buttons.mask[j]);
        printf("\n"); XFree(buttons.mask);
    }
    XSync(monitor,False);
    while(XPending(monitor)) {
        XEvent ev; XNextEvent(monitor,&ev);
        if(ev.type==GenericEvent && ev.xcookie.extension==xi_opcode && XGetEventData(monitor,&ev.xcookie)) {
            XIRawEvent *r=ev.xcookie.data;
            printf("RAW type=%d device=%d source=%d detail=%d\n",ev.xcookie.evtype,r->deviceid,r->sourceid,r->detail);
            XFreeEventData(monitor,&ev.xcookie);
        }
    }
    fflush(stdout);
}
static void motion(Display *d,int x,int y) {XTestFakeMotionEvent(d,-1,x,y,CurrentTime); XFlush(d);}
static void button(Display *d,int b,int down) {XTestFakeButtonEvent(d,b,down,CurrentTime); XFlush(d);}
static void key(Display *d,KeySym k,int down) {XTestFakeKeyEvent(d,XKeysymToKeycode(d,k),down,CurrentTime); XFlush(d);}
static void click(Display *d,int x,int y) {motion(d,x,y); button(d,1,True); button(d,1,False);}
static void stroke(Display *d,KeySym k) {key(d,k,True); key(d,k,False);}
static int same_process(void) {
    click(human,70,80); snapshot("same-process-human-top-click");
    click(odin,470,80); snapshot("same-process-robot-top-click");
    key(human,XK_Shift_L,True);
    stroke(human,XK_h); snapshot("two-windows-human-H");
    stroke(odin,XK_a); snapshot("two-windows-odin-a");
    motion(human,80,80); motion(odin,480,80);
    stroke(human,XK_j); snapshot("two-windows-human-J");
    stroke(odin,XK_b); snapshot("two-windows-odin-b");
    XISetFocus(odin,ok,hw,CurrentTime);
    click(odin,70,160); snapshot("same-window-odin-bottom-click");
    stroke(odin,XK_c); snapshot("same-window-odin-c");
    stroke(human,XK_k); snapshot("same-window-human-K-without-refocus");
    click(human,80,80); snapshot("same-window-human-top-refocus");
    stroke(human,XK_l); snapshot("same-window-human-L");
    stroke(odin,XK_d); snapshot("same-window-odin-d-without-refocus");
    /* Fresh child connection owns held input; exits without releases or XCloseDisplay.
       The controller retains a separate connection for observation/removal only. */
    int ready[2], finish[2];
    if(pipe(ready) || pipe(finish)) return 7;
    pid_t child=fork();
    if(child<0) return 7;
    if(child==0) {
        close(ready[0]); close(finish[1]);
        Display *d=XOpenDisplay(":177"); if(!d) _exit(8);
        XISetClientPointer(d,None,op);
        key(d,XK_Control_L,True); button(d,1,True); XSync(d,False);
        if(write(ready[1],"H",1)!=1) _exit(8);
        char c; if(read(finish[0],&c,1)!=1) _exit(8);
        _exit(0);
    }
    close(ready[1]); close(finish[0]);
    char c; if(read(ready[0],&c,1)!=1) return 8;
    snapshot("child-owned-control-button-held-human-shift-held");
    if(write(finish[1],"X",1)!=1) return 8;
    close(ready[0]); close(finish[1]);
    int status; waitpid(child,&status,0);
    printf("CHILD_DISCONNECT wait_status=%d no-release-no-XCloseDisplay\n",status);
    snapshot("after-child-disconnect-no-cleanup");
    /* Never attach potentially held devices to the human masters. */
    XIRemoveMasterInfo remove={XIRemoveMaster,op,XIFloating,0,0};
    XIChangeHierarchy(odin,(XIAnyHierarchyChangeInfo*)&remove,1); XSync(odin,False);
    int n, remaining=0; XIDeviceInfo *list=XIQueryDevice(monitor,XIAllDevices,&n);
    for(int i=0;i<n;i++) {
        printf("AFTER_REMOVE device=%d name=%s\n",list[i].deviceid,list[i].name);
        if(strstr(list[i].name,"Odin feasibility")) remaining++;
    }
    XIFreeDeviceInfo(list); op=0;
    snapshot("after-owned-master-removal-human-shift-still-held");
    stroke(human,XK_m); snapshot("human-M-after-owned-removal");
    key(human,XK_Shift_L,False); snapshot("human-releases-own-shift");
    printf("DETACH removed-owned-master-pair remaining-owned-devices=%d errors=%d\n",remaining,errors);
    return errors || remaining || status ? 9:0;
}
int main(int argc,char **argv) {
    if(argc!=3 || !getenv("XI2_PRIVATE_SANDBOX") || strcmp(getenv("DISPLAY")?getenv("DISPLAY"):"",":177") || getuid()==0) return 2;
    if(access("/proc/self",F_OK)==0 || access("/harness/x11-passwd",R_OK)!=0) return 2;
    setbuf(stdout,NULL); XSetErrorHandler(xerror);
    human=XOpenDisplay(":177"); odin=XOpenDisplay(":177"); monitor=XOpenDisplay(":177");
    if(!human || !odin || !monitor) return 3;
    hw=strtoul(argv[1],NULL,10); ow=strtoul(argv[2],NULL,10);
    int event,error,major=2,minor=2; XQueryExtension(monitor,"XInputExtension",&xi_opcode,&event,&error);
    XIQueryVersion(monitor,&major,&minor); printf("XI_VERSION %d.%d server=%s release=%d\n",major,minor,ServerVendor(monitor),VendorRelease(monitor));
    XIAddMasterInfo add={XIAddMaster,"Odin feasibility",True,True};
    XIChangeHierarchy(odin,(XIAnyHierarchyChangeInfo*)&add,1); XSync(odin,False);
    int n; XIDeviceInfo *list=XIQueryDevice(odin,XIAllMasterDevices,&n);
    for(int i=0;i<n;i++) {printf("DEVICE id=%d use=%d paired=%d name=%s\n",list[i].deviceid,list[i].use,list[i].attachment,list[i].name);
        if(strstr(list[i].name,"Odin feasibility")) {if(list[i].use==XIMasterPointer)op=list[i].deviceid; if(list[i].use==XIMasterKeyboard)ok=list[i].deviceid;}}
    XIFreeDeviceInfo(list); if(!op||!ok) return 4;
    XISetClientPointer(human,None,hp); XISetClientPointer(odin,None,op);
    unsigned char bits[XIMaskLen(XI_LASTEVENT)]={0};
    XISetMask(bits,XI_RawMotion); XISetMask(bits,XI_RawButtonPress); XISetMask(bits,XI_RawButtonRelease);
    XISetMask(bits,XI_RawKeyPress); XISetMask(bits,XI_RawKeyRelease);
    XIEventMask mask={XIAllMasterDevices,sizeof(bits),bits}; XISelectEvents(monitor,DefaultRootWindow(monitor),&mask,1);
    XISetFocus(human,hk,hw,CurrentTime); XISetFocus(odin,ok,ow,CurrentTime);
    motion(human,70,80); motion(odin,470,80); snapshot("baseline");
    if(getenv("XI2_SAME_PROCESS")) {
        int result=same_process();
        XCloseDisplay(odin); XCloseDisplay(human); XCloseDisplay(monitor);
        return result;
    }
    key(human,XK_Shift_L,True); snapshot("human-shift-held");
    stroke(odin,XK_a); stroke(human,XK_h); snapshot("simultaneous-independent-typing");
    motion(odin,470,150); snapshot("odin-motion-human-stationary");
    click(odin,470,150); snapshot("odin-click");
    button(odin,1,True); motion(odin,510,180); motion(human,80,80); motion(odin,580,210); snapshot("drag-with-human-motion");
    button(odin,1,False); snapshot("drag-release");
    button(odin,4,True); button(odin,4,False); button(odin,5,True); button(odin,5,False); snapshot("scroll");
    key(odin,XK_Control_L,True); button(odin,1,True); snapshot("owned-input-held");
    /* Cancellation ledger contains only this connection's Control and button 1. */
    key(odin,XK_Control_L,False); button(odin,1,False); snapshot("cancel-owned-only-human-shift-still-held");
    click(odin,470,40); snapshot("menu-open-grab");
    stroke(human,XK_j); snapshot("human-typing-during-odin-menu");
    stroke(odin,XK_Down); stroke(odin,XK_Return); snapshot("menu-activation");
    click(odin,470,340); snapshot("modal-open");
    stroke(human,XK_k); snapshot("human-typing-during-odin-modal");
    stroke(odin,XK_Return); snapshot("modal-response");
    key(human,XK_Shift_L,False); snapshot("human-releases-own-shift");
    /* Remove only the master pair we created, after owned release. */
    XIRemoveMasterInfo remove={XIRemoveMaster,op,XIAttachToMaster,hp,hk};
    XIChangeHierarchy(odin,(XIAnyHierarchyChangeInfo*)&remove,1); XSync(odin,False);
    printf("DETACH removed-owned-master-pair errors=%d\n",errors);
    XCloseDisplay(odin); XCloseDisplay(human); XCloseDisplay(monitor);
    return errors?5:0;
}
