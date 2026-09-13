#!/usr/bin/env python3
"""Narrow guest-only live test of the shipping Hyprland companion.

All endpoints, PIDs, binaries, geometry, and output identity are explicit.
There is no discovery, host fallback, plugin loading, or ambiguous-input retry.
"""
import argparse, hashlib, json, os, re, select, signal, socket, stat, struct
import subprocess, sys, time
from pathlib import Path

HDR = struct.Struct("<8s6I")
TOKEN = re.compile(r"[0-9a-f]{32,128}\Z")
HEX64 = re.compile(r"[0-9a-f]{64}\Z")
LEFT = 272

class Refusal(RuntimeError): pass
class UnknownRelease(RuntimeError): pass

def req(ok, why):
    if not ok: raise Refusal(why)

def ticks(pid):
    text = Path(f"/proc/{pid}/stat").read_text()
    fields = text[text.rindex(")") + 2:].split()
    req(len(fields) > 19 and fields[0] not in {"Z", "X"}, "dead process")
    return int(fields[19])

def pin(pid, uid):
    p = Path(f"/proc/{pid}")
    req(p.stat().st_uid == uid, "process uid mismatch")
    start = ticks(pid); exe = os.readlink(p / "exe"); s = os.stat(p / "exe")
    out = dict(pid=pid, uid=uid, start_ticks=start, executable=exe,
               exe_device=s.st_dev, exe_inode=s.st_ino, exe_size=s.st_size,
               exe_mtime_ns=s.st_mtime_ns, exe_ctime_ns=s.st_ctime_ns)
    req(ticks(pid) == start and os.stat(p / "exe").st_ino == s.st_ino,
        "process changed while measured")
    return out

def connect(path, pid, uid):
    s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM); s.settimeout(.35)
    try:
        s.connect(path)
        peer = struct.unpack("3i", s.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, 12))
        req(peer[:2] == (pid, uid), "SO_PEERCRED mismatch")
        return s
    except BaseException:
        s.close(); raise

def scope(path, pid, uid, request):
    before = pin(pid, uid)
    with connect(path, pid, uid) as s:
        s.sendall(json.dumps(request, separators=(",", ":")).encode("ascii") + b"\n")
        data = bytearray()
        while b"\n" not in data:
            part = s.recv(4096)
            req(part and len(data) + len(part) <= 16384, "scope framing invalid")
            data += part
        req(data.count(b"\n") == 1 and data.endswith(b"\n"), "scope framing invalid")
        row = json.loads(data)
    req(type(row) is dict and pin(pid, uid) == before, "scope/process identity invalid")
    return row

def events(path):
    out=[]
    try: lines=path.read_text(errors="replace").splitlines()
    except FileNotFoundError: return out
    for line in lines:
        try:
            row=json.loads(line)
            if type(row) is dict: out.append(row)
        except json.JSONDecodeError: pass
    return out

def released_events(path):
    rows = events(path)
    return rows if any(e.get("event") == "pointer_button" and
                       e.get("button") == LEFT and e.get("state") == 0
                       for e in rows) else None

def receiver_barrier(process, path, after, seconds=1):
    """Drain prior receiver events; ordering evidence, not input proof."""
    req(process.poll() is None and process.stdin is not None,
        "receiver unavailable for drain")
    try:
        process.stdin.write(b"D"); process.stdin.flush()
    except OSError as e:
        raise Refusal("receiver drain request failed") from e
    row = wait(lambda: next((e for e in reversed(events(path))
                            if e.get("event") == "receiver_barrier" and
                            type(e.get("barrier")) is int and e["barrier"] > after), None),
               seconds, "receiver drain barrier absent")
    return row["barrier"]

def wait(predicate, seconds, why):
    until=time.monotonic()+seconds
    while time.monotonic()<until:
        value=predicate()
        if value: return value
        time.sleep(.002)
    raise Refusal(why)

class Guardian:
    def __init__(self, h, name):
        self.h=h; self.path=h.logs/f"guardian-{name}.jsonl"; self.rows=[]
        self.pending=bytearray()
        self.action_submitted=False
        env=dict(os.environ); env["LC_ALL"]="C"
        self.p=subprocess.Popen([h.a.guardian,h.a.wayland_socket,str(h.pid),str(h.uid),
            h.a.output_name,h.a.scope_socket,str(h.a.logical_width),str(h.a.logical_height)],
            stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,
            bufsize=0,start_new_session=True,cwd="/",env=env)
        try:
            self.process_identity=pin(self.p.pid,h.uid)
            req(os.path.samefile(self.process_identity["executable"],h.a.guardian),
                "guardian executable identity mismatch")
            row=self.until({"ready"},3)
            req(row.get("pid")==self.p.pid and row.get("peer_pid")==h.pid,
                "guardian ready mismatch")
        except BaseException:
            self.cleanup(False)
            raise
    def until(self,names,seconds):
        end=time.monotonic()+seconds
        drain_after_exit=False
        while time.monotonic()<end:
            if b"\n" not in self.pending:
                ready,_,_=select.select([self.p.stdout],[],[],max(0,end-time.monotonic()))
                if not ready: break
                chunk=os.read(self.p.stdout.fileno(),65536)
                if not chunk: break
                self.pending.extend(chunk)
                if b"\n" not in self.pending:continue
            raw,_,rest=self.pending.partition(b"\n");self.pending=bytearray(rest)
            line=(raw+b"\n").decode("utf-8",errors="replace")
            with self.path.open("a") as f: f.write(line)
            try: row=json.loads(line)
            except json.JSONDecodeError: continue
            self.rows.append(row)
            if hasattr(self,"process_identity") and row.get("event")!="closed":
                if not drain_after_exit:
                    try:
                        req(pin(self.p.pid,self.h.uid)==self.process_identity,
                            "guardian process changed")
                    except (OSError, Refusal):
                        if self.p.poll() is None:
                            raise
                        # The initial pin owns this child's stdout pipe. An exited
                        # child cannot make a nonterminal receipt live evidence,
                        # but its already-buffered terminal closure must be drained.
                        drain_after_exit=True
                        continue
                else:
                    continue
            if drain_after_exit and row.get("event")=="closed":return row
            if row.get("event") in names: return row
        if self.action_submitted:
            raise UnknownRelease("guardian receipt timeout after action submission")
        raise Refusal("guardian receipt timeout")
    def batch(self,token,action):
        req(TOKEN.fullmatch(token) is not None,"invalid scope token")
        deadline=time.monotonic_ns()//1000+249000
        # Exactly one controller write. No manual sleep between F/B/action.
        payload=f"F {token}\nB 250 {deadline}\n{action}\n".encode("ascii")
        req(len(payload)<=select.PIPE_BUF,"guardian atomic command exceeds PIPE_BUF")
        self.action_submitted=True
        try:
            written=os.write(self.p.stdin.fileno(),payload)
        except OSError as e:
            raise UnknownRelease("guardian atomic command write failed") from e
        if written!=len(payload):
            raise UnknownRelease("guardian atomic command write was short")
    def finish(self,seconds=2):
        try: self.p.wait(timeout=seconds)
        except subprocess.TimeoutExpired as e: raise UnknownRelease("guardian did not close") from e
        remaining=bytes(self.pending)+self.p.stdout.read();self.pending.clear()
        for line in remaining.decode("utf-8",errors="replace").splitlines(keepends=True):
            with self.path.open("a") as f: f.write(line)
            try: self.rows.append(json.loads(line))
            except json.JSONDecodeError: pass
        return self.rows
    def term(self):
        if self.p.poll() is None: os.kill(self.p.pid,signal.SIGTERM)
    def cleanup(self,input_possible):
        if self.p.poll() is not None:return
        self.term()
        try:self.p.wait(timeout=2)
        except subprocess.TimeoutExpired:
            if input_possible or self.action_submitted:
                raise UnknownRelease("guardian retained after possible input; refusing SIGKILL")
            os.killpg(self.p.pid,signal.SIGKILL);self.p.wait(timeout=2)
    def close_verified(self):
        req(self.p.stdin is not None,"guardian controller pipe absent")
        self.p.stdin.close();rows=self.finish()
        closed=next((r for r in reversed(rows) if r.get("event")=="closed"),None)
        native=closed.get("native_failure",{}).get("input_loss_v1",{}) if closed else {}
        if (self.p.returncode!=0 or not closed or closed.get("reason")!="controller-eof" or
                closed.get("release_acknowledged") is not True or
                native.get("resource_closure")!="complete"):
            raise UnknownRelease("guardian final closure was not natively acknowledged")
        return closed

class Harness:
    def __init__(self,a):
        self.a=a;self.uid=os.getuid();self.pid=a.compositor_pid;self.tokens=set()
        self.logs=Path(a.log_dir);self.logs.mkdir(mode=0o700,parents=False,exist_ok=False)
        os.chmod(self.logs,0o700)
        self.report={"schema":1,"runtime_qualified":False,
          "qualification_scope":"guest-only narrow live corpus","cases":[]}
        self.compositor=pin(self.pid,self.uid)
        self.scope_identity=self.socket_check(a.scope_socket,True)
        self.socket_check(a.wayland_socket,False)
        for x in (a.guardian,a.capture,a.receiver):
            req(os.path.isabs(x),"binary path not absolute");s=os.stat(x)
            req(stat.S_ISREG(s.st_mode) and os.access(x,os.X_OK),"binary not executable")
        self.manifest_check()
    def socket_check(self,path,private):
        req(os.path.isabs(path) and len(os.fsencode(path))<=107,"socket path invalid")
        s=os.lstat(path);d=os.stat(os.path.dirname(path))
        req(stat.S_ISSOCK(s.st_mode) and s.st_uid==self.uid,"socket type/owner invalid")
        req(stat.S_ISDIR(d.st_mode) and d.st_uid==self.uid and not d.st_mode&0o022,
            "socket parent unsafe")
        if private:req(not s.st_mode&0o077,"scope socket not private")
        return s.st_dev,s.st_ino,s.st_uid
    def call(self,value,ok=False):
        s=os.lstat(self.a.scope_socket)
        req((s.st_dev,s.st_ino,s.st_uid)==self.scope_identity,"scope socket changed")
        row=scope(self.a.scope_socket,self.pid,self.uid,value)
        if ok:req(row.get("ok") is True,f"scope refused {value['op']}")
        return row
    def manifest_check(self):
        p=Path(self.a.manifest);req(p.is_absolute(),"manifest path not absolute")
        m=json.loads(p.read_text());bid=m.get("companion_build_id");sha=m.get("plugin_sha256")
        name=m.get("plugin_filename")
        req(m.get("schema")==1 and m.get("hyprland_version")=="0.55.2" and
            m.get("hyprland_commit")=="39d7e209c79d451efab1b21151d5938289da838d",
            "manifest pinned Hyprland identity mismatch")
        req(m.get("runtime_qualified") is False,"manifest runtime_qualified is not false")
        req(type(bid)is str and HEX64.fullmatch(bid),"bad build id")
        req(type(sha)is str and HEX64.fullmatch(sha),"bad plugin hash")
        req(type(name)is str and name==os.path.basename(name),"bad plugin filename")
        artifact=p.parent/name;before=os.stat(artifact)
        req(stat.S_ISREG(before.st_mode) and before.st_uid==self.uid and not before.st_mode&0o022,
            "plugin artifact type/owner/mode invalid")
        req(hashlib.sha256(artifact.read_bytes()).hexdigest()==sha,"plugin hash mismatch")
        after=os.stat(artifact)
        stable=("st_dev","st_ino","st_size","st_mtime_ns","st_ctime_ns")
        req(all(getattr(before,k)==getattr(after,k) for k in stable),"plugin changed while hashed")
        r=self.call({"op":"status"},True)
        boot=Path("/proc/sys/kernel/random/boot_id").read_text().strip()
        req(r.get("version")==1 and r.get("scope_protocol_version")==1,"protocol mismatch")
        req(r.get("companion_build_id")==bid,"executing build id mismatch")
        req(r.get("compositor_pid")==self.pid and r.get("compositor_uid")==self.uid and
            str(r.get("compositor_start_ticks"))==str(self.compositor["start_ticks"]) and
            r.get("boot_id")==boot,"plugin process identity mismatch")
        req(r.get("armed")is False and r.get("failed")is False and r.get("keys")==0 and
            r.get("buttons")==0,"plugin initially unclean")
        self.report["attestation"]={"companion_build_id":bid,"plugin_sha256":sha,
          "plugin_filename":name,"SO_PEERCRED_pid":self.pid,"SO_PEERCRED_uid":self.uid,
          "compositor_start_ticks":self.compositor["start_ticks"]}
    def launch(self,name):
        path=self.logs/f"receiver-{name}.jsonl";f=path.open("w")
        code=("import os,socket,struct,sys;s=socket.socket(socket.AF_UNIX);"
          "s.connect(sys.argv[1]);p,u,g=struct.unpack('3i',s.getsockopt(socket.SOL_SOCKET,socket.SO_PEERCRED,12));"
          "assert p==int(sys.argv[2]) and u==int(sys.argv[3]);os.set_inheritable(s.fileno(),True);"
          "os.execv(sys.argv[4],[sys.argv[4],str(s.fileno()),sys.argv[5],'30000'])")
        env=dict(os.environ);env["LC_ALL"]="C"
        p=subprocess.Popen([sys.executable,"-c",code,self.a.wayland_socket,str(self.pid),
          str(self.uid),self.a.receiver,f"odin-lab-{name}"],stdin=subprocess.PIPE,
          stdout=f,stderr=subprocess.STDOUT,start_new_session=True,cwd="/",env=env)
        f.close()
        wait(lambda:p.poll()is not None or any(x.get("event")=="surface_commit" for x in events(path)),
             3,"receiver did not map")
        req(p.poll()is None,"receiver exited at startup")
        wait(lambda:any(x.get("event")=="keyboard_enter" and x.get("own_surface") is True for x in events(path)),
             3,"receiver did not gain native keyboard focus")
        time.sleep(.10)  # Initial map/configure settles before read-only inventory.
        return p,path
    def select(self,p):
        identity=pin(p.pid,self.uid);inv=self.call({"op":"inventory_targets"},True)
        found=[x for x in inv.get("candidates",[]) if x.get("identity",{}).get("pid")==p.pid]
        req(len(found)==1,"inventory did not select exact child PID");c=found[0];got=c["identity"]
        req(c.get("output_name")==self.a.output_name,"receiver is not on explicit output")
        req(type(got.get("start_ticks"))is int,"inventory start_ticks is not integer")
        for k in ("pid","uid","start_ticks","executable","exe_device","exe_inode"):
            req(got.get(k)==identity[k],f"inventory immutable identity mismatch {k}")
        q={"op":"focus_candidate","candidate_id":c["id"],"output_id":c["output_id"],
           "topology_epoch":inv["topology_epoch"],"requested_identity":{
             "executable":got["executable"],"start_ticks":got["start_ticks"]}}
        r=self.call(q,True)
        for k,v in {"instance_id":inv["instance_id"],"candidate_id":c["id"],
          "output_id":c["output_id"],"output_name":c["output_name"],
          "topology_epoch":inv["topology_epoch"],"topology_digest":c["topology_digest"],
          "identity":got,"output":c["output"]}.items():req(r.get(k)==v,f"focus echo mismatch {k}")
        req(pin(p.pid,self.uid)==identity,"receiver changed across focus")
        return identity
    def snapshot(self,identity):
        began=time.monotonic_ns();r=self.call({"op":"snapshot","output_name":self.a.output_name},True)
        now=time.monotonic_ns();tok=r.get("token");measured=r.get("measured_monotonic_ns")
        req(r.get("locked")is False and r.get("native_wayland")is True and r.get("safe_focus")is True,
            "unsafe snapshot")
        req(type(tok)is str and TOKEN.fullmatch(tok),"bad token")
        req(type(measured)is int and began<=measured<=now and now-measured<250000000,"stale snapshot")
        self.tokens.add(tok);focus=r.get("focus",{});out=r.get("output",{})
        req(focus.get("pid")==identity["pid"] and focus.get("uid")==self.uid and
            focus.get("parent_chain_verified")is True,"snapshot receiver mismatch")
        req(out.get("name")==self.a.output_name and out.get("width")==self.a.logical_width and
            out.get("height")==self.a.logical_height,"snapshot output mismatch")
        req(pin(identity["pid"],self.uid)==identity,"receiver changed across snapshot")
        return r
    def binding(self,r):
        return {"output":r["output"],"focus":r["focus"]}
    def capture(self,identity):
        before=self.snapshot(identity);o=before["output"];ws=connect(self.a.wayland_socket,self.pid,self.uid)
        env=dict(os.environ);env["LC_ALL"]="C"
        try:p=subprocess.Popen([self.a.capture,str(ws.fileno()),str(self.pid),str(self.uid),
          self.a.output_name,str(o["pixel_width"]),str(o["pixel_height"]),str(o["transform"]),
          str(self.a.capture_timeout_ms)],stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,
          stderr=subprocess.PIPE,pass_fds=(ws.fileno(),),start_new_session=True,cwd="/",env=env)
        finally:ws.close()
        try:data,err=p.communicate(timeout=self.a.capture_timeout_ms/1000+1)
        except subprocess.TimeoutExpired:
            os.killpg(p.pid,signal.SIGKILL);p.communicate();raise Refusal("capture timeout")
        req(p.returncode==0 and not err and len(data)>=HDR.size,"capture helper refused")
        magic,w,h,stride,fmt,flags,size=HDR.unpack(data[:HDR.size])
        req(magic==b"ODINSC01" and w==o["pixel_width"] and h==o["pixel_height"] and
            stride==w*4 and fmt==1 and flags==0 and size==stride*h and len(data)==HDR.size+size,
            "capture header/payload invalid")
        after=self.snapshot(identity);req(self.binding(before)==self.binding(after),"capture identity changed")
        return {"header":"ODINSC01","width":w,"height":h,"stride":stride,"payload_bytes":size,
          "frame_sha256":hashlib.sha256(data[HDR.size:]).hexdigest(),"identity_bracket_unchanged":True}
    def point(self,s):
        f=s["focus"];o=s["output"];x=f["x"]-o["x"]+f["width"]/2;y=f["y"]-o["y"]+f["height"]/2
        req(0<=x<self.a.logical_width and 0<=y<self.a.logical_height,"point outside output")
        return x,y
    def clean(self):
        r=self.call({"op":"status"},True)
        req(r.get("armed")is False and r.get("keys")==0 and r.get("buttons")==0 and
            r.get("failed")is False and r.get("release_acknowledged")is True,"cleanup unconfirmed")
        return {"armed":False,"keys":0,"buttons":0,"release_acknowledged":True}
    def stop(self,p):
        if p.poll()is None:
            p.send_signal(signal.SIGTERM)
            try:p.wait(timeout=2)
            except subprocess.TimeoutExpired:os.killpg(p.pid,signal.SIGKILL);p.wait(timeout=2)
    def positive(self):
        result={"name":"positive_click","passed":False};g=p=None;sent=False
        try:
            p,path=self.launch("positive");identity=self.select(p);result["capture"]=self.capture(identity)
            g=Guardian(self,"positive");s=self.snapshot(identity);x,y=self.point(s)
            g.batch(s["token"],f"P {LEFT} {x:.3f} {y:.3f}");sent=True
            req(g.until({"begun","closed"},1).get("event")=="begun","arm refused")
            done=g.until({"action_done","action_rejected","closed"},2)
            if done.get("event")!="action_done" or done.get("release_acknowledged")is not True:
                raise UnknownRelease("positive action incomplete; native cleanup acknowledgement recorded separately")
            rows=wait(lambda:released_events(path),1,"receiver release absent")
            buttons=[(e.get("button"),e.get("state")) for e in rows if e.get("event")=="pointer_button"]
            req(buttons==[(LEFT,1),(LEFT,0)],"exact raw click press/release absent")
            req(pin(p.pid,self.uid)==identity,"receiver changed across positive release")
            result["terminal_cleanup"]=g.close_verified()
            result.update(passed=True,receiver_buttons=buttons,plugin_status=self.clean())
        finally:
            if g:g.cleanup(sent)
            if p:self.stop(p)
            self.report["cases"].append(result)
    def stale(self):
        result={"name":"stale_snapshot_refusal","passed":False};g=p=None
        try:
            p,path=self.launch("stale");identity=self.select(p);g=Guardian(self,"stale");s=self.snapshot(identity)
            barrier=receiver_barrier(p,path,0)
            baseline=len(events(path));expiry=s["measured_monotonic_ns"]+280000000
            while time.monotonic_ns()<expiry:time.sleep(.002)
            x,y=self.point(s);g.batch(s["token"],f"P {LEFT} {x:.3f} {y:.3f}");rows=g.finish()
            closed=next((r for r in rows if r.get("event")=="closed"),{});native=closed.get("native_failure",{})
            req(g.p.returncode==1 and closed.get("reason")=="scope-refused" and
                closed.get("release_acknowledged") is False and
                native.get("scope_error")=="stale-snapshot" and closed.get("input_was_sent")is False,
                "stale snapshot not refused before input")
            input_events={"pointer_motion","pointer_button","pointer_axis","pointer_frame",
                          "pointer_axis_source","pointer_axis_stop","pointer_axis_discrete",
                          "keyboard_key","keyboard_modifiers"}
            req(not [e for e in events(path)[baseline:] if e.get("event") in input_events],
                "stale input reached receiver")
            barrier=receiver_barrier(p,path,barrier)
            req(not [e for e in events(path)[baseline:] if e.get("event") in input_events],
                "stale input reached receiver before drain barrier")
            result.update(passed=True,scope_error="stale-snapshot",receiver_buttons=[],
                          receiver_drain_barrier=barrier,plugin_status=self.clean())
        finally:
            if g:g.cleanup(g.action_submitted)
            if p:self.stop(p)
            self.report["cases"].append(result)
    def sigterm(self):
        result={"name":"cooperative_sigterm_mid_stroke","passed":False};g=p=None;sent=False
        try:
            p,path=self.launch("sigterm");identity=self.select(p);g=Guardian(self,"sigterm");s=self.snapshot(identity)
            f=s["focus"];o=s["output"];x1=f["x"]-o["x"]+f["width"]*.35;x2=f["x"]-o["x"]+f["width"]*.65;y=f["y"]-o["y"]+f["height"]*.5
            action=f"L {LEFT} 5 120 {x1:.3f} {y:.3f} {(x1+x2)/2:.3f} {y:.3f} {x2:.3f} {y:.3f} {(x1+x2)/2:.3f} {y:.3f} {x1:.3f} {y:.3f}"
            g.batch(s["token"],action);sent=True;req(g.until({"begun","closed"},1).get("event")=="begun","arm refused")
            try:
                down=wait(lambda:next((e for e in events(path) if e.get("event")=="pointer_button" and e.get("button")==LEFT and e.get("state")==1),None),.2,"receiver down absent")
            except Refusal as e:
                raise UnknownRelease("receiver down observation timed out after stroke submission") from e
            req(not any(e.get("event")=="pointer_button" and e.get("button")==LEFT and
                        e.get("state")==0 for e in events(path)),
                "stroke already released before cooperative signal")
            signal_ns=time.monotonic_ns();req(down["monotonic_ns"]<=signal_ns,"signal preceded down");g.term();rows=g.finish()
            closed=next((r for r in rows if r.get("event")=="closed"),{})
            native=closed.get("native_failure",{}).get("input_loss_v1",{})
            if closed.get("release_acknowledged")is not True:raise UnknownRelease("SIGTERM release unconfirmed")
            req(closed.get("reason")=="signal-cancel" and native.get("terminal_cause")=="signal_cancel",
                "SIGTERM terminal cause mismatch")
            ev=wait(lambda:released_events(path),1,"receiver cooperative release absent")
            up=next(e for e in ev if e.get("event")=="pointer_button" and e.get("button")==LEFT and e.get("state")==0)
            req(up["monotonic_ns"]>=signal_ns,"stroke release preceded SIGTERM")
            req(pin(p.pid,self.uid)==identity,"receiver changed across cooperative release")
            req(g.p.returncode==0 and
                native.get("resource_closure")=="complete" and
                native.get("release_ack")=="acknowledged",
                "SIGTERM terminal cleanup status mismatch")
            result.update(passed=True,sigterm_after_receiver_down=True,receiver_release_after_sigterm=True,
                          terminal_cause="signal_cancel",plugin_status=self.clean())
        finally:
            if g:g.cleanup(sent)
            if p:self.stop(p)
            self.report["cases"].append(result)
    def run(self):
        code=1
        try:
            self.positive();self.stale()
            if self.a.include_sigterm_stroke:self.sigterm()
            self.report["passed"]=all(x.get("passed")is True for x in self.report["cases"]);code=0 if self.report["passed"]else 1
        except UnknownRelease as e:self.report.update(passed=False,stopped_on_unknown_release=True,error=str(e));code=2
        except BaseException as e:self.report.update(passed=False,error=f"{type(e).__name__}: {e}");code=1
        finally:(self.logs/"report.json").write_text(json.dumps(redact(self.report,self.tokens),indent=2,sort_keys=True)+"\n")
        return code

def redact(value,tokens):
    if isinstance(value,dict):return {k:("[REDACTED]" if "token" in k.lower() else redact(v,tokens)) for k,v in value.items()}
    if isinstance(value,list):return [redact(v,tokens) for v in value]
    if isinstance(value,str):
        for token in tokens:value=value.replace(token,"[REDACTED]")
    return value

def args():
    p=argparse.ArgumentParser();p.add_argument("--self-test",action="store_true")
    for x in ("wayland-socket","scope-socket","manifest","guardian","capture","receiver","output-name","log-dir"):p.add_argument("--"+x)
    p.add_argument("--compositor-pid",type=int);p.add_argument("--logical-width",type=int);p.add_argument("--logical-height",type=int)
    p.add_argument("--capture-timeout-ms",type=int,default=3000);p.add_argument("--include-sigterm-stroke",action="store_true")
    a=p.parse_args()
    if not a.self_test:
        missing=[k for k,v in vars(a).items() if k not in {"self_test","include_sigterm_stroke"} and v is None]
        if missing:p.error("explicit values required: "+", ".join(missing))
        if a.compositor_pid<=1 or not 1<=a.logical_width<=32768 or not 1<=a.logical_height<=32768 or not 1<=a.capture_timeout_ms<=30000:p.error("invalid numeric value")
    return a

def main():
    a=args()
    if a.self_test:
        token="a"*64;assert redact({"native_scope_token":token,"text":token},{token})=={"native_scope_token":"[REDACTED]","text":"[REDACTED]"}
        assert HDR.unpack(HDR.pack(b"ODINSC01",2,3,8,1,0,24))==(b"ODINSC01",2,3,8,1,0,24)
        print("self-test passed: syntax, header, redaction");return 0
    return Harness(a).run()
if __name__=="__main__":raise SystemExit(main())
