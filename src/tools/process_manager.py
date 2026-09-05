"""Background process lifecycle management.

Provides start/poll/write/kill/list operations for long-running processes
spawned locally or on remote hosts. Each process gets a ring buffer of
output lines (max 500) and is auto-killed after 1 hour.
"""

from __future__ import annotations

import asyncio
import base64
import ctypes
import json
import os
import re
import secrets
import shlex
import signal
import time
from collections import deque
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING

from ..observability.diagnostics import command_display, safe_error, safe_text
from ..odin_log import get_logger
from .workspace import WorkspaceError, workspace_env

if TYPE_CHECKING:
    from .hosts import HostLease, HostTarget

log = get_logger("process_manager")


_UNKNOWN = object()  # "could not determine" — never means "absent"

_REMOTE_SUPERVISOR = r'''import base64,json,os,signal,subprocess,sys,threading,time
root,token,encoded,lifetime=sys.argv[1:]
os.umask(0o077)
os.setsid()
fifo=root+"/in"
out_path=root+"/out"
exit_path=root+"/exit.json"
ready_path=root+"/ready.json"
stdin_fd=os.open(fifo,os.O_RDWR)
env=dict(os.environ)
env["ODIN_REMOTE_JOB_TOKEN"]=token
command=base64.b64decode(encoded).decode("utf-8")
stopping=False
def request_stop(_signum,_frame):
    global stopping
    stopping=True
signal.signal(signal.SIGTERM,request_stop)
signal.signal(signal.SIGINT,request_stop)
proc=subprocess.Popen(["/bin/sh","-c",command],stdin=stdin_fd,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,bufsize=0,env=env,preexec_fn=os.setpgrp)
pid=proc.pid
pgid=os.getpgid(pid)
sid=os.getsid(pid)
def start_id(value):
    try:
        return open("/proc/%d/stat"%value).read().rsplit(")",1)[1].split()[19]
    except Exception:
        try:
            probe=subprocess.check_output(["ps","-o","lstart=","-p",str(value)],env={**os.environ,"LC_ALL":"C"},stderr=subprocess.DEVNULL).decode().strip()
            return "ps:"+probe if probe else ""
        except Exception:
            return ""
ready={"token":token,"supervisor_pid":os.getpid(),"pid":pid,"pgid":pgid,"sid":sid,"start_id":start_id(pid)}
tmp=ready_path+".tmp"
open(tmp,"w").write(json.dumps(ready,separators=(",",":")))
os.replace(tmp,ready_path)
output_state={"bytes":0,"truncated":False}
def drain_output():
    with open(out_path,"ab",buffering=0) as out:
        while True:
            # Drain available bytes: buffered read(n) can wait for n bytes or EOF.
            chunk=os.read(proc.stdout.fileno(),65536)
            if not chunk: break
            remaining=max(0,4194304-output_state["bytes"])
            if remaining: out.write(chunk[:remaining]); output_state["bytes"]+=min(len(chunk),remaining)
            if len(chunk)>remaining: output_state["truncated"]=True
reader=threading.Thread(target=drain_output,daemon=True)
reader.start()
timed_out=False
deadline=time.monotonic()+int(lifetime)
while proc.poll() is None and not stopping and time.monotonic()<deadline: time.sleep(.2)
if proc.poll() is None and time.monotonic()>=deadline: timed_out=True
rc=proc.returncode if proc.returncode is not None else (124 if timed_out else 143)
def alive():
    try:
        os.killpg(pgid,0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
if alive():
    try: os.killpg(pgid,signal.SIGTERM)
    except ProcessLookupError: pass
    end=time.monotonic()+5
    while alive() and time.monotonic()<end: time.sleep(.1)
if alive():
    try: os.killpg(pgid,signal.SIGKILL)
    except ProcessLookupError: pass
    end=time.monotonic()+3
    while alive() and time.monotonic()<end: time.sleep(.1)
try: proc.wait(timeout=1)
except Exception: pass
reader.join(timeout=2)
try: os.close(stdin_fd)
except Exception: pass
record={"exit_code":rc,"empty":not alive(),"timed_out":timed_out,"output_truncated":output_state["truncated"]}
tmp=exit_path+".tmp"
open(tmp,"w").write(json.dumps(record,separators=(",",":")))
os.replace(tmp,exit_path)
'''

# ruff: noqa: E501
_REMOTE_CONTROLLER = r'''# noqa: E501
import base64,json,os,signal,subprocess,sys,time
root,token,op,payload,wait_s=sys.argv[1:]
def emit(**value):
    print(json.dumps(value,separators=(",",":")))
def load(name):
    try:
        return json.load(open(root+"/"+name))
    except Exception:
        return None
ready=load("ready.json")
if not isinstance(ready,dict) or ready.get("token")!=token:
    emit(ok=False,unknown=True,error="remote process identity is unavailable")
    raise SystemExit(3)
pid=int(ready["pid"]); pgid=int(ready["pgid"]); sid=int(ready["sid"])
def start_id(value):
    try:
        return open("/proc/%d/stat"%value).read().rsplit(")",1)[1].split()[19]
    except Exception:
        try:
            probe=subprocess.check_output(["ps","-o","lstart=","-p",str(value)],env={**os.environ,"LC_ALL":"C"},stderr=subprocess.DEVNULL).decode().strip()
            return "ps:"+probe if probe else ""
        except Exception:
            return ""
def identity():
    try:
        if os.getpgid(pid)!=pgid or os.getsid(pid)!=sid: return False
        expected=ready.get("start_id","")
        return not expected or start_id(pid)==expected
    except (ProcessLookupError,PermissionError):
        return False
def group_alive():
    try:
        os.killpg(pgid,0); return True
    except ProcessLookupError: return False
    except PermissionError: return True
if op=="status":
    end=time.monotonic()+max(0.0,float(wait_s))
    exit_record=load("exit.json")
    while exit_record is None and time.monotonic()<end:
        time.sleep(.2); exit_record=load("exit.json")
    cursor=max(0,int(payload or "0")); data=b""; total=0
    try:
        with open(root+"/out","rb") as handle:
            handle.seek(0,2); total=handle.tell(); handle.seek(min(cursor,total)); data=handle.read(16000)
    except FileNotFoundError: pass
    if exit_record is not None and not exit_record.get("empty",False):
        emit(ok=False,unknown=True,error="remote process group emptiness was not verified",output=base64.b64encode(data).decode(),cursor=cursor+len(data),size=total,ready=ready)
        raise SystemExit(4)
    emit(ok=True,status="exited" if exit_record is not None else "running",exit=exit_record,output=base64.b64encode(data).decode(),cursor=cursor+len(data),size=total,identity=identity(),ready=ready)
elif op=="write":
    if load("exit.json") is not None: emit(ok=False,error="process is not running"); raise SystemExit(5)
    if not identity(): emit(ok=False,unknown=True,error="remote process identity changed; stdin not written"); raise SystemExit(6)
    data=base64.b64decode(payload)
    try:
        fd=os.open(root+"/in",os.O_WRONLY|os.O_NONBLOCK); os.write(fd,data); os.close(fd)
    except Exception as exc: emit(ok=False,unknown=True,error="stdin delivery could not be verified: "+type(exc).__name__); raise SystemExit(7)
    emit(ok=True,written=len(data),ready=ready)
elif op=="kill":
    if load("exit.json") is not None: emit(ok=True,killed=False,already_exited=True,ready=ready); raise SystemExit(0)
    if not identity(): emit(ok=False,unknown=True,error="remote process identity changed; no signal sent"); raise SystemExit(8)
    try: os.killpg(pgid,signal.SIGTERM)
    except ProcessLookupError: pass
    end=time.monotonic()+5
    while group_alive() and time.monotonic()<end: time.sleep(.1)
    if group_alive():
        try: os.killpg(pgid,signal.SIGKILL)
        except ProcessLookupError: pass
        end=time.monotonic()+3
        while group_alive() and time.monotonic()<end: time.sleep(.1)
    end=time.monotonic()+2; exit_record=load("exit.json")
    while exit_record is None and time.monotonic()<end: time.sleep(.1); exit_record=load("exit.json")
    empty=not group_alive()
    if not empty: emit(ok=False,unknown=True,error="remote process group still exists",ready=ready); raise SystemExit(9)
    emit(ok=True,killed=True,empty=True,exit=exit_record,ready=ready)
else:
    emit(ok=False,error="invalid controller operation"); raise SystemExit(2)
'''

_PR_SET_CHILD_SUBREAPER = 36
_PR_GET_CHILD_SUBREAPER = 37


def child_subreaper_active() -> bool:
    """Whether THIS process is already a child subreaper (read-only)."""
    try:
        libc = ctypes.CDLL("libc.so.6", use_errno=True)
        value = ctypes.c_int(0)
        if libc.prctl(_PR_GET_CHILD_SUBREAPER, ctypes.byref(value), 0, 0, 0) != 0:
            return False
        return value.value == 1
    except Exception:
        return False


def set_child_subreaper(enabled: bool = True) -> bool:
    """Set (or clear) the child-subreaper flag; returns the verified state."""
    try:
        libc = ctypes.CDLL("libc.so.6", use_errno=True)
        if libc.prctl(_PR_SET_CHILD_SUBREAPER, 1 if enabled else 0, 0, 0, 0) != 0:
            return child_subreaper_active()
    except Exception:
        log.exception("Could not change child-subreaper containment")
        return child_subreaper_active()
    return child_subreaper_active()


def reap_adopted_zombies(
    adopted: set[tuple[int, int]] | frozenset[tuple[int, int]] = frozenset(),
) -> int:
    """Reap zombies among orphans we previously VERIFIED as ours.

    Attribution happened while each process was alive (a zombie's
    environment is unreadable), so this works from recorded
    ``(pid, starttime)`` identities — the starttime is re-checked so pid
    reuse can never redirect a ``waitpid`` at an unrelated child
    (round-11 #2). Only zombies parented to us are touched, and settled
    entries are pruned from a mutable record.
    """
    if not adopted:
        return 0
    reaped = 0
    mypid = os.getpid()
    mutable = adopted if isinstance(adopted, set) else None
    for pid, start in list(adopted):
        current = _proc_starttime(pid)
        if current is None:
            if mutable is not None:
                mutable.discard((pid, start))
            continue
        if current != start:
            if mutable is not None:
                mutable.discard((pid, start))  # pid reused — not ours
            continue
        try:
            raw = Path(f"/proc/{pid}/stat").read_bytes()
            rest = raw.rsplit(b")", 1)[1].split()
            if rest[0] != b"Z" or int(rest[1]) != mypid:
                continue
        except (OSError, IndexError, ValueError):
            continue
        try:
            if os.waitpid(pid, os.WNOHANG)[0]:
                reaped += 1
                if mutable is not None:
                    mutable.discard((pid, start))
        except (ChildProcessError, OSError):
            pass
    return reaped



def _pidfd_owned_pids() -> set[int] | None:
    """PIDs for which THIS process holds an open pidfd.

    The runtime uses ``PidfdChildWatcher``, so an open pidfd means the
    event loop still owns that child's exit status and nobody else may
    consume it — the decisive exclusion signal (round-14 design, Odin:
    "age alone is not proof that nobody owns the exit status").

    Fail-closed inspection rule (round-15 blocker #2): a malformed or
    unreadable **pidfd** entry makes the WHOLE pass incomplete (``None``)
    — a partial owned-set once let a real asyncio-owned child be reaped.
    An entry that PROVABLY closed between enumeration and inspection is
    gone, not ambiguous. Ordinary descriptors (files, sockets — no
    ``Pid:`` line in fdinfo) are classifiable and never poison the pass.
    """
    try:
        entries = os.listdir("/proc/self/fd")
    except OSError:
        return None
    owned: set[int] = set()
    for entry in entries:
        try:
            info = Path(f"/proc/self/fdinfo/{entry}").read_text()
        except FileNotFoundError:
            continue  # provably closed between enumeration and inspection
        except OSError:
            return None  # unreadable: could be a pidfd — prove nothing
        for line in info.splitlines():
            if line.startswith("Pid:"):
                try:
                    owned.add(int(line.split()[1]))
                except (IndexError, ValueError):
                    # A pidfd we cannot attribute: the inspection is
                    # incomplete, and a partial owned-set must never
                    # authorize reaping.
                    return None
                break
    return owned


def _scan_process_table() -> tuple[dict[int, tuple[int, int, bytes]], bool]:
    """``pid -> (ppid, starttime, state)`` for every readable process.

    ``complete`` is False when the table may be MISSING a live process:
    an unreadable /proc, an unreadable stat (non-ENOENT), or a malformed
    stat line. An incomplete table still carries positive observations,
    but absence must not be inferred from it and reaping must not be
    authorized on it (round-15 design §3.4). Parsing is done on BYTES:
    ``comm`` may hold arbitrary non-UTF-8.
    """
    table: dict[int, tuple[int, int, bytes]] = {}
    try:
        entries = os.listdir("/proc")
    except OSError:
        return table, False
    complete = True
    for entry in entries:
        if not entry.isdigit():
            continue
        pid = int(entry)
        try:
            raw = Path(f"/proc/{pid}/stat").read_bytes()
        except (FileNotFoundError, ProcessLookupError):
            continue  # exited between listdir and read — provably gone
        except OSError:
            complete = False
            continue
        try:
            rest = raw.rsplit(b")", 1)[1].split()
            table[pid] = (int(rest[1]), int(rest[19]), rest[0])
        except (IndexError, ValueError):
            complete = False
    return table, complete


def _descendants_of(
    table: dict[int, tuple[int, int, bytes]], root: int
) -> set[int]:
    """Transitive descendants of ``root`` within one table snapshot.

    Everything containment can ever hand us is in here: subreaper
    adoption applies only to descendants, and a process that already
    reparented to us appears as our direct child in the same snapshot.
    """
    children: dict[int, list[int]] = {}
    for pid, (ppid, _start, _state) in table.items():
        children.setdefault(ppid, []).append(pid)
    found: set[int] = set()
    stack = [root]
    while stack:
        for child in children.get(stack.pop(), ()):
            if child not in found:
                found.add(child)
                stack.append(child)
    return found


def _reap_identity(pid: int, starttime: int, parent: int) -> bool | None:
    """Identity-stable consumption of ONE verified zombie (design §3.5).

    Sequence: ``pidfd_open`` FIRST, then re-verify ``(starttime, state=Z,
    ppid==parent)`` from /proc — the fd and that read name the same
    current occupant of the pid, so pid reuse between any earlier
    snapshot and the open cannot redirect the reap — then
    ``waitid(P_PIDFD)`` through the fd, which stays pinned to that exact
    incarnation no matter what the pid later names.

    Returns True (status consumed), None (identity provably gone —
    reaped elsewhere or pid reused), or False (must not / could not act;
    nothing was consumed).
    """
    try:
        fd = os.pidfd_open(pid)
    except ProcessLookupError:
        return None
    except OSError:
        return False
    try:
        try:
            raw = Path(f"/proc/{pid}/stat").read_bytes()
        except (FileNotFoundError, ProcessLookupError):
            return None
        except OSError:
            return False
        try:
            rest = raw.rsplit(b")", 1)[1].split()
            state, ppid, start = rest[0], int(rest[1]), int(rest[19])
        except (IndexError, ValueError):
            return False
        if start != starttime:
            return None  # pid reused — the recorded incarnation is gone
        if state != b"Z" or ppid != parent:
            return False
        try:
            result = os.waitid(os.P_PIDFD, fd, os.WEXITED | os.WNOHANG)
        except ChildProcessError:
            return None  # consumed by someone else — not ours to take
        except OSError:
            return False
        return result is not None
    finally:
        os.close(fd)


# ---------------------------------------------------------------------------
# Positive-ownership registration (round-15 design §3.1.2)
#
# Observed reparenting cannot cover a descendant whose intermediate parent
# exits entirely between scans — an ssh ControlPersist master daemonizes in
# milliseconds, so its first observation is already ``ppid == us`` with no
# recorded transition. Subsystems that KNOW a process is theirs therefore
# register its identity while it is alive. Process-global on purpose: there
# is exactly one subreaper per process, and registration must reach it from
# any subsystem without threading an instance through every constructor.
# ---------------------------------------------------------------------------

_REAP_REGISTRY_CAP = 256
_reap_registry: dict[tuple[int, int], tuple[float, str]] = {}
_reap_registry_evictions = 0


def register_reap_identity(pid: int, starttime: int, *, source: str) -> None:
    """Register ``(pid, starttime)`` as ours-to-reap once it dies.

    Registration is EVIDENCE, not action: the reaper still requires the
    identity to be observed as our own zombie, to survive the grace
    period, and to pass the pidfd exclusion. Re-registering refreshes
    the entry's age. Saturation evicts the oldest entry — losing
    evidence defers that reap to teardown; it can never create
    eligibility (design §3.4).
    """
    global _reap_registry_evictions
    if (pid, starttime) not in _reap_registry:
        while len(_reap_registry) >= _REAP_REGISTRY_CAP:
            oldest = min(_reap_registry, key=lambda k: _reap_registry[k][0])
            del _reap_registry[oldest]
            _reap_registry_evictions += 1
            log.warning(
                "Reap registry saturated: evicted %r (evidence lost — its "
                "zombie defers to the teardown drain)", oldest,
            )
    _reap_registry[(pid, starttime)] = (time.monotonic(), source)


def register_reap_candidate(pid: int, *, source: str) -> int | None:
    """Verify ``pid`` against /proc and register its LIVE identity.

    Returns the starttime that was registered, or None when the process
    could not be identified (gone, or /proc unreadable) — a guess must
    never enter the registry.
    """
    starttime = _proc_starttime(pid)
    if starttime is None:
        return None
    register_reap_identity(pid, starttime, source=source)
    return starttime


def registered_reap_identities() -> frozenset[tuple[int, int]]:
    """Snapshot of the currently registered identities."""
    return frozenset(_reap_registry)


def _reset_reap_registry() -> None:
    """Test hygiene only: drop all registrations and counters."""
    global _reap_registry_evictions
    _reap_registry.clear()
    _reap_registry_evictions = 0


@dataclass
class _Candidate:
    """Bounded per-descendant history (round-15 design §3.4)."""

    last_seen_ppid: int
    last_seen_at: float
    adoption_observed: bool = False
    zombie_since: float | None = None


class AdoptedZombieReaper:
    """Reaps orphaned descendants that child-subreaper containment made
    ours (PR #244 soak finding).

    Containment reparents escaped grandchildren to this process instead
    of PID 1, so nothing else will ever wait on them — an ``ssh``
    ControlPersist master or a job shell's forked child otherwise
    lingers as a zombie forever. Eligibility is a union of POSITIVE
    evidence only (round-15 design §3.1):

    - **observed reparenting** — the same ``(pid, starttime)`` was seen
      alive with ``ppid != us`` and later with ``ppid == us``; a
      directly spawned child has us as parent from birth and can never
      satisfy this, which is the safety property that keeps ordinary
      ``subprocess.Popen`` children untouchable;
    - **explicit registration** while alive by the spawning subsystem
      (ssh ControlPersist masters, background-job descendants);
    - **final teardown** (:meth:`drain_at_teardown`) — after every
      subprocess owner has stopped, every remaining zombie child is
      ours by construction.

    A candidate must additionally survive :attr:`GRACE` measured from
    its first observation AS A ZOMBIE (adoption age proves nothing
    about status interest — §3.2), must not be pidfd-owned by asyncio,
    and is consumed only through the identity-stable §3.5 sequence.
    Incomplete evidence — an unreadable fd table, a malformed pidfd
    entry, an incomplete /proc scan — authorizes nothing.
    """

    SCAN_INTERVAL = 15.0
    GRACE = 30.0
    # History bounds (§3.4): a fork storm or prolonged /proc failure must
    # not grow tracking without limit. Eviction only loses evidence — an
    # evicted identity re-enters as a fresh candidate and its reap defers.
    MAX_TRACKED = 512
    MAX_AGE = 3600.0

    def __init__(
        self,
        *,
        scan_interval: float = SCAN_INTERVAL,
        grace: float = GRACE,
    ) -> None:
        self._scan_interval = scan_interval
        self._grace = grace
        self._candidates: dict[tuple[int, int], _Candidate] = {}
        self._task: asyncio.Task | None = None
        self.reaped_total = 0
        self.evicted_total = 0

    @property
    def pending_zombies(self) -> int:
        return sum(
            1 for c in self._candidates.values() if c.zombie_since is not None
        )

    @property
    def stats(self) -> dict[str, int]:
        return {
            "pending_zombies": self.pending_zombies,
            "reaped_total": self.reaped_total,
            "tracked_candidates": len(self._candidates),
            "registered_candidates": len(_reap_registry),
            "evicted_total": self.evicted_total + _reap_registry_evictions,
        }

    def start(self) -> None:
        """Begin sweeping. Only meaningful once containment is active —
        without it, orphans go to PID 1 and are never ours."""
        if self._task is not None or not child_subreaper_active():
            return
        self._task = asyncio.create_task(self._run(), name="zombie-reaper")

    async def stop(self) -> None:
        task, self._task = self._task, None
        if task is None:
            return
        task.cancel()
        try:
            await task
        except (asyncio.CancelledError, Exception):
            pass

    async def _run(self) -> None:
        while True:
            await asyncio.sleep(self._scan_interval)
            try:
                self.sweep_once()
            except asyncio.CancelledError:
                raise
            except Exception:
                # A failing pass must never silently kill the task.
                log.exception("Adopted-zombie sweep failed (continuing)")

    def sweep_once(self) -> int:
        """One observe → prune → reap pass. Returns the number reaped."""
        mypid = os.getpid()
        now = time.monotonic()
        table, complete = _scan_process_table()
        evicted = 0
        for pid in _descendants_of(table, mypid):
            ppid, start, state = table[pid]
            identity = (pid, start)
            cand = self._candidates.get(identity)
            if cand is None:
                if len(self._candidates) >= self.MAX_TRACKED:
                    oldest = min(
                        self._candidates,
                        key=lambda k: self._candidates[k].last_seen_at,
                    )
                    del self._candidates[oldest]
                    evicted += 1
                cand = _Candidate(last_seen_ppid=ppid, last_seen_at=now)
                self._candidates[identity] = cand
            else:
                if ppid == mypid and cand.last_seen_ppid != mypid:
                    # Same incarnation, previously under another parent,
                    # now under us: kernel-observed adoption. A first
                    # sighting that is ALREADY ours records ppid == us
                    # and can never flip this flag (§3.6 pin 1).
                    cand.adoption_observed = True
                cand.last_seen_ppid = ppid
                cand.last_seen_at = now
            if state == b"Z" and ppid == mypid and cand.zombie_since is None:
                # Grace runs from the first observation AS A ZOMBIE —
                # time spent adopted-but-alive must not pre-spend it
                # (§3.2: a long-lived ControlPersist master would
                # otherwise exhaust its grace before it dies).
                cand.zombie_since = now
        if complete:
            # Only a COMPLETE table may infer absence (§3.4): identities
            # that disappeared or changed incarnation are forgotten, in
            # both the candidate history and the registration registry.
            for identity in list(self._candidates):
                entry = table.get(identity[0])
                if entry is None or entry[1] != identity[1]:
                    del self._candidates[identity]
            for identity in list(_reap_registry):
                entry = table.get(identity[0])
                if entry is None or entry[1] != identity[1]:
                    del _reap_registry[identity]
        # Age bound: the backstop for prolonged /proc failure, where the
        # completeness-gated pruning above never runs.
        for identity, cand in list(self._candidates.items()):
            if (now - cand.last_seen_at) > self.MAX_AGE:
                del self._candidates[identity]
                evicted += 1
        if evicted:
            self.evicted_total += evicted
            log.warning(
                "Zombie-candidate history evicted %d entry(ies) (cap/age) — "
                "affected reaps defer to teardown", evicted,
            )
        if not complete:
            return 0  # an incomplete scan authorizes nothing (§3.4)
        owned = _pidfd_owned_pids()
        if owned is None:
            return 0  # cannot prove abandonment — reap nothing
        reaped = 0
        for identity, cand in list(self._candidates.items()):
            pid, start = identity
            if cand.zombie_since is None or pid in owned:
                continue
            if (now - cand.zombie_since) < self._grace:
                continue
            if not (cand.adoption_observed or identity in _reap_registry):
                continue  # no positive evidence — age alone never reaps
            verdict = _reap_identity(pid, start, mypid)
            if verdict is True:
                reaped += 1
                self.reaped_total += 1
            if verdict is not False:
                del self._candidates[identity]
                _reap_registry.pop(identity, None)
        return reaped

    def drain_at_teardown(self) -> tuple[int, bool]:
        """Final no-grace drain (design §3.3 step 5).

        Returns ``(reaped, verified)``. Runs after the periodic reaper
        is stopped, loop tasks are done, async generators are shut and
        the default executor has joined — every subprocess owner has
        stopped, so EVERY remaining zombie child is ours: transition
        history and registration are unnecessary (nobody can
        legitimately wait later), and the pidfd exclusion does not
        apply (asyncio will never run its callbacks again; the same
        fact is what keeps zombies from surviving an in-place
        ``execve``).

        ``verified`` is True only when a COMPLETE scan observed zero
        remaining zombie children. The caller must treat False as a
        VETO for in-place re-exec (§3.3): exec'ing over unproven state
        hands invisible survivors to the new image.
        """
        mypid = os.getpid()
        total = 0

        def _remaining() -> tuple[list[tuple[int, int]], bool]:
            table, complete = _scan_process_table()
            return (
                [
                    (pid, entry[1])
                    for pid, entry in table.items()
                    if entry[2] == b"Z" and entry[0] == mypid
                ],
                complete,
            )

        # A still-live adopted child may die mid-drain and add a fresh
        # zombie; bounded re-scans converge on the settled table.
        for _attempt in range(4):
            zombies, complete = _remaining()
            if complete and not zombies:
                return total, True
            progressed = False
            for pid, start in zombies:
                verdict = _reap_identity(pid, start, mypid)
                if verdict is True:
                    total += 1
                    self.reaped_total += 1
                if verdict is not False:
                    progressed = True
            if not progressed:
                return total, False
        zombies, complete = _remaining()
        return total, (complete and not zombies)


class ProcessCleanupError(RuntimeError):
    """Shutdown could not affirmatively prove the owned session is empty.

    Raised so the caller — which re-execs in place after teardown — sees
    that descendants may survive, rather than shutdown returning normally
    on unverified state (round-7 #3).
    """

MAX_CONCURRENT = 20
MAX_LIFETIME_SECONDS = 3600  # 1 hour
OUTPUT_BUFFER_LINES = 500
# Ceiling for one poll's server-side wait: comfortably under the executor's
# 300s per-tool wall (an unbounded wait would die THERE as a tool error).
# Monitoring longer work = chained poll calls, each ≤ this.
MAX_POLL_WAIT_SECONDS = 120.0
# Upper bound on awaiting an in-flight group reap at shutdown before giving up
# and cancelling it — comfortably exceeds a reader's TERM-grace + KILL-grace so
# a compliant descendant always finishes, while a wedged one can't hang re-exec.
SHUTDOWN_REAP_TIMEOUT = 12.0
# Display segmentation for the ring buffer: newline AND carriage return
# both end a display segment (progress bars redraw with bare \r).
_SEGMENT_SPLIT = re.compile(rb"[\r\n]")


def _utf8_boundary_split(buf: bytes) -> tuple[bytes, bytes]:
    """Split ``buf`` so the head never ends mid-UTF-8-sequence.

    Backs off past trailing continuation bytes (0b10xxxxxx) and, if the
    byte before them is a multibyte lead whose sequence is incomplete,
    past the lead too. Arbitrary binary output degrades gracefully: at
    most 3 bytes are carried, everything else flushes with
    errors='replace' as before.
    """
    i = len(buf)
    while i > 0 and (len(buf) - i) < 3 and (buf[i - 1] & 0xC0) == 0x80:
        i -= 1
    if i > 0:
        lead = buf[i - 1]
        expected = 0
        if (lead & 0xE0) == 0xC0:
            expected = 2
        elif (lead & 0xF0) == 0xE0:
            expected = 3
        elif (lead & 0xF8) == 0xF0:
            expected = 4
        if expected and (len(buf) - (i - 1)) < expected:
            # Incomplete trailing sequence: carry lead + continuations.
            return buf[: i - 1], buf[i - 1 :]
    # Trailing unit is complete (or not UTF-8 at all): flush everything.
    return buf, b""



def _proc_ids(pid: int) -> tuple[int, int] | None | str:
    """``(ppid, session)`` from /proc/<pid>/stat.

    Returns ``None`` only when the process is PROVABLY gone
    (ENOENT/ESRCH), or the sentinel ``"unknown"`` for any other failure —
    a malformed or unreadable stat must never read as absence. Parsing is
    done on BYTES: ``comm`` may hold arbitrary non-UTF-8.
    """
    try:
        raw = Path(f"/proc/{pid}/stat").read_bytes()
    except (FileNotFoundError, ProcessLookupError):
        return None  # exited between listdir and read — genuinely gone
    except OSError:
        return "unknown"  # EMFILE/EACCES/… — we do NOT know
    try:
        rest = raw.rsplit(b")", 1)[1].split()
        if rest[0] == b"Z":
            return None  # zombie: dead, awaiting reap — not a live member
        return int(rest[1]), int(rest[3])  # ppid, session
    except (IndexError, ValueError):
        return "unknown"  # malformed — never treated as absence


def _proc_starttime(pid: int) -> int | None:
    """Field 22 of /proc/<pid>/stat — the incarnation discriminator.

    A bare pid is not an identity: after reuse it names a different
    process entirely (round-11 #2). ``(pid, starttime)`` is stable and
    unique for the life of one incarnation, so a recorded escapee can
    never be confused with whatever later occupies its pid.
    """
    try:
        raw = Path(f"/proc/{pid}/stat").read_bytes()
        rest = raw.rsplit(b")", 1)[1].split()
        return int(rest[19])
    except (OSError, IndexError, ValueError):
        return None


def _proc_live_starttime(pid: int) -> int | None:
    """Starttime of a LIVE (non-zombie) incarnation, else None.

    A zombie still shows its starttime until it is reaped, so starttime
    alone cannot distinguish "this process is alive" from "this is a
    corpse awaiting reap" (round-16 #1: a cached ssh-master record must
    not treat its own zombie as proof of liveness — the replacement
    master would silently bypass registration and leak until teardown).
    """
    try:
        raw = Path(f"/proc/{pid}/stat").read_bytes()
        rest = raw.rsplit(b")", 1)[1].split()
        if rest[0] == b"Z":
            return None
        return int(rest[19])
    except (OSError, IndexError, ValueError):
        return None


def _proc_session(pid: int) -> int | None | str:
    """Session id alone (see :func:`_proc_ids` for the sentinel contract)."""
    ids = _proc_ids(pid)
    if isinstance(ids, tuple):
        return ids[1]
    return ids


def _scan_owned_members(
    sid: int,
    leader_pid: int | None = None,
    *,
    adopted_by: int | None = None,
    known_own_children: frozenset[int] = frozenset(),
    job_token: str | None = None,
    proc_token: str | None = None,
    adopted_sink: set[tuple[int, int]] | None = None,
    teardown: bool = False,
) -> tuple[list[tuple[int, int]], bool]:
    """Enumerate every process we own, each PINNED with a pidfd.

    Ownership is the union of THREE relations, because no one of them
    covers every escape:

    - **Session** ``session == sid`` — the default for descendants of a
      leader spawned with ``start_new_session``.
    - **Ancestry** — a descendant that called ``setsid()`` left the
      session but is still ours while its parent chain reaches the
      leader (round-8 #1).
    - **Adoption + provenance** — a descendant that ALSO double-forked
      left the ancestry chain too; as a child subreaper we adopt it
      instead of PID 1 (round-9 #1). Adoption alone is NOT attribution:
      other Odin subsystems have direct children too, and killing those
      would be collateral damage (round-10). An adopted process must
      ALSO carry this job's ``ODIN_BG_JOB`` token, injected at spawn and
      inherited across fork, exec and setsid.

    Environment markers are CHILD-CONTROLLED: a descendant can delete or
    FORGE them, so they can never prove a process foreign. During normal
    operation that means ambiguity is left UNTOUCHED and makes the scan
    incomplete — never a kill, never affirmative emptiness.

    ``teardown=True`` (the shutdown barrier only) resolves that ambiguity
    the other way, on kernel facts alone: every adopted orphan is ours to
    end. There is no collateral concern at that point — the whole process
    is going away, every subsystem's children are being torn down with
    it, and the alternative is exec'"'"'ing over survivors we cannot see
    (round-13).

    The pin happens BEFORE membership is verified, so verification and
    every later signal act on the exact process the fd names. ``complete``
    is False whenever any candidate could not be inspected or pinned for
    a reason other than provable disappearance, AND whenever an ancestry
    walk exhausts its bound — uncertainty is never non-ownership
    (round-9 #3). Caller owns the returned fds.
    """
    pinned: list[tuple[int, int]] = []
    try:
        own_session = os.getsid(0)
    except OSError:
        own_session = -1
    try:
        entries = os.listdir("/proc")
    except OSError:
        return pinned, False
    ids: dict[int, tuple[int, int]] = {}
    complete = True
    candidates: list[tuple[int, int]] = []
    for entry in entries:
        if not entry.isdigit():
            continue
        pid = int(entry)
        try:
            fd = os.pidfd_open(pid)
        except ProcessLookupError:
            continue  # exited — not a member
        except OSError:
            # Could not pin: membership UNKNOWN unless provably gone.
            if _proc_ids(pid) is not None:
                complete = False
            continue
        info = _proc_ids(pid)
        if isinstance(info, tuple):
            ids[pid] = info
            candidates.append((pid, fd))
            continue
        if info == "unknown":
            complete = False
        os.close(fd)

    def _owned(pid: int) -> bool | None:
        """True/False, or None when the walk could not decide."""
        seen: set[int] = set()
        cur = pid
        for _ in range(64):  # bounded: no unbounded walk, no cycles
            if cur in seen:
                return False  # cycle — cannot be a chain to our leader
            if cur <= 1:
                return False
            entry = ids.get(cur)
            if entry is None:
                return False  # chain left our snapshot — not provably ours
            seen.add(cur)
            ppid, session = entry
            if session == sid:
                return True
            if leader_pid is not None and (cur == leader_pid or ppid == leader_pid):
                return True
            if (
                adopted_by is not None
                and ppid == adopted_by
                and cur not in known_own_children
            ):
                if job_token is None:
                    return None  # cannot attribute — ambiguous, never killed
                tokens = _read_env_tokens(cur)
                if tokens is _UNKNOWN or tokens is None:
                    return None  # unreadable — ambiguous, fail closed
                assert isinstance(tokens, dict)
                if teardown and session != own_session:
                    # Shutdown: an adopted orphan that LEFT our session is
                    # an escapee — only `setsid()` gets a process out, and
                    # no forged or deleted environment marker can buy it
                    # survival past our own teardown. Ordinary subsystem
                    # children (ssh, run_command, browser) stay IN our
                    # session, so they are never swept by this arm — the
                    # round-10 collateral-damage rule still holds.
                    if adopted_sink is not None:
                        start = _proc_starttime(cur)
                        if start is not None:
                            adopted_sink.add((cur, start))
                    return True
                if PROC_TOKEN_ENV not in tokens or (
                    proc_token is not None
                    and tokens.get(PROC_TOKEN_ENV) != proc_token
                ):
                    # No Odin process marker at all: the environment was
                    # DISCARDED (`env -i`, execve with an empty env), so
                    # "not ours" cannot be concluded — an escapee could
                    # erase its own provenance and be certified gone while
                    # alive (round-11 #1). Fail closed.
                    return None
                token = tokens.get(JOB_TOKEN_ENV)
                if token is None:
                    # Process marker present but the JOB token deleted —
                    # selective erasure (round-12). Every legitimate Odin
                    # child inherits a job token (a default one is stamped
                    # at startup), so its absence is evidence of tampering,
                    # not of foreign ownership. Fail closed.
                    return None
                if token == job_token:
                    # Record provenance NOW: a zombie has no address
                    # space, so /proc/<pid>/environ becomes unreadable the
                    # moment it dies — identification must happen while it
                    # is alive, and reaping later goes by recorded pid.
                    if adopted_sink is not None:
                        start = _proc_starttime(cur)
                        if start is not None:
                            adopted_sink.add((cur, start))
                            if not teardown:
                                # Positive ownership, proven while alive:
                                # its exit status will land on us, and the
                                # central reaper may consume it (§3.1.2).
                                # (Usually redundant with the direct-child
                                # registration below — this arm still
                                # covers an adopted ancestor reached from
                                # a descendant's walk when the ancestor's
                                # own candidate pin failed.)
                                register_reap_identity(
                                    cur, start, source="job-escapee"
                                )
                    return True  # our escapee: adopted AND provably ours
                # Carries OUR process marker but a different job (or
                # none): another Odin subsystem's child — decidedly not
                # this job's, and killing it would be collateral damage.
                return False
            cur = ppid
        return None  # bound exhausted — UNKNOWN, never "not ours"

    for pid, fd in candidates:
        verdict = _owned(pid)
        if verdict:
            pinned.append((pid, fd))
            if (
                not teardown
                and adopted_sink is not None
                and adopted_by is not None
                and pid not in known_own_children
                and ids[pid][0] == adopted_by
            ):
                # A verified-ours member that is ALREADY our direct child
                # was ADOPTED — its original parent died — so its exit
                # status will land on us and nothing else will ever wait
                # on it. Capture the identity while it is alive: a zombie
                # can no longer be attributed. (Round-15: the soak's
                # job-shell `sleep` was exactly this — killed as a
                # session member but never recorded as adopted, so its
                # zombie lingered for the process lifetime.)
                start = _proc_starttime(pid)
                if start is not None:
                    adopted_sink.add((pid, start))
                    register_reap_identity(pid, start, source="job-adopted")
            continue
        if verdict is None:
            complete = False
        os.close(fd)
    return pinned, complete


JOB_TOKEN_ENV = "ODIN_BG_JOB"
# Process-wide provenance: stamped into os.environ at startup, so EVERY
# subprocess Odin spawns inherits it — background jobs, ssh/run_command
# children, browser workers alike. It is what lets a direct child with a
# DIFFERENT job (or none) be decided "another subsystem's, not ours"
# instead of ambiguous; only a child that deliberately discarded its
# environment lacks it, and that is exactly the case that must fail
# closed (round-11 #1).
PROC_TOKEN_ENV = "ODIN_PROC"
# Default job token stamped at startup so EVERY Odin child carries one.
# It is what makes another subsystem's child DECIDABLE (its token differs
# from the background job's) while a child that deleted its job token is
# evidence of tampering and must fail closed (round-12).
DEFAULT_JOB_TOKEN = "odin-main"


def _read_env_tokens(pid: int) -> dict[str, str] | None | object:
    """This process's Odin provenance markers from /proc/<pid>/environ.

    Returns a dict with whichever of ``ODIN_PROC``/``ODIN_BG_JOB`` are
    present, ``None`` when the process is gone, or :data:`_UNKNOWN` when
    the environment could not be read — ambiguity, never absence.

    The markers are inherited across fork AND exec, so they follow a
    descendant that double-forks or calls ``setsid()``. They are NOT a
    security boundary: a child can discard its environment, which is why
    a missing process marker fails closed rather than reading as "not
    ours" (round-11 #1).
    """
    try:
        raw = Path(f"/proc/{pid}/environ").read_bytes()
    except (FileNotFoundError, ProcessLookupError):
        return None
    except OSError:
        return _UNKNOWN
    found: dict[str, str] = {}
    for key in (PROC_TOKEN_ENV, JOB_TOKEN_ENV):
        marker = key.encode() + b"="
        for item in raw.split(b"\0"):
            if item.startswith(marker):
                found[key] = item[len(marker):].decode("utf-8", "replace")
                break
    return found


def _read_job_token(pid: int) -> str | None | object:
    """Just this job's token (see :func:`_read_env_tokens`)."""
    tokens = _read_env_tokens(pid)
    if tokens is None or tokens is _UNKNOWN:
        return tokens
    assert isinstance(tokens, dict)
    return tokens.get(JOB_TOKEN_ENV)


def _reap_adopted(
    identities: set[tuple[int, int]], known_own_children: frozenset[int]
) -> None:
    """Non-blocking reap of orphans already VERIFIED as ours.

    Entries are ``(pid, starttime)``: a bare pid is not an identity after
    reuse (round-11 #2), so the incarnation is re-checked before any
    ``waitpid``. Pids we deliberately spawned are still excluded —
    asyncio's child watcher owns those statuses. Never ``waitpid(-1)``.
    Settled entries are pruned so the record cannot grow without bound.
    """
    for pid, start in list(identities):
        if pid in known_own_children:
            continue
        current = _proc_starttime(pid)
        if current is None:
            identities.discard((pid, start))  # provably gone
            continue
        if current != start:
            identities.discard((pid, start))  # pid reused — not our process
            continue
        try:
            if os.waitpid(pid, os.WNOHANG)[0]:
                identities.discard((pid, start))
        except (ChildProcessError, OSError):
            pass  # not our child, or already reaped


def _signal_pinned(pinned: list[tuple[int, int]], sig: int) -> None:
    for pid, fd in pinned:
        try:
            signal.pidfd_send_signal(fd, sig)
        except OSError:
            log.debug("pidfd signal %d to PID %d failed", sig, pid)


def _close_pinned(pinned: list[tuple[int, int]]) -> None:
    for _pid, fd in pinned:
        try:
            os.close(fd)
        except OSError:
            pass


def _pidfd_exited(fd: int) -> bool:
    """A pidfd polls readable exactly when its process has exited."""
    import select

    try:
        r, _w, _x = select.select([fd], [], [], 0)
        return bool(r)
    except OSError:
        return True


async def _terminate_session_until_empty(
    sid: int,
    *,
    grace: float = 2.0,
    timeout: float = 10.0,
    term_first: bool = True,
    settle_scans: int = 2,
    settle_delay: float = 0.2,
    adopted_by: int | None = None,
    known_own_children: frozenset[int] = frozenset(),
    containment: bool = True,
    job_token: str | None = None,
    proc_token: str | None = None,
    adopted_sink: set[tuple[int, int]] | None = None,
    teardown: bool = False,
) -> bool:
    """Drive everything we own to provably empty.

    Every pass RE-ENUMERATES (round-6 #1), so a signal handler that forks
    a fresh child — or one that changes its process group (round-7 #1) —
    is caught by the next pass. TERM is offered once per pid (when
    ``term_first``), then passes escalate to KILL, which cannot be caught
    or forked around.

    Emptiness requires ``settle_scans`` CONSECUTIVE complete-and-empty
    scans separated by ``settle_delay`` (round-8 #2): a single snapshot
    can miss a member that forked after enumeration and exited before the
    scan finished, leaving a child behind. The repeated scans also give
    any such child time to appear in /proc.

    Returns True only on that repeated affirmative observation — an
    unreadable /proc, fd exhaustion, a malformed stat, or an exhausted
    ancestry walk returns False, never a false success. ``containment``
    False (child-subreaper unavailable) means a double-fork+setsid
    escape would be undetectable, so emptiness is never claimed at all
    (round-9 #1).
    """
    deadline = time.monotonic() + timeout
    adopted: set[tuple[int, int]] = (
        adopted_sink if adopted_sink is not None else set()
    )
    termed: set[int] = set()
    escalate_at = time.monotonic() + grace if term_first else 0.0
    clean_scans = 0
    while True:
        pinned, complete = _scan_owned_members(
            sid,
            leader_pid=sid,
            adopted_by=adopted_by,
            known_own_children=known_own_children,
            job_token=job_token,
            proc_token=proc_token,
            adopted_sink=adopted,
            teardown=teardown,
        )
        try:
            if complete and not pinned and containment:
                clean_scans += 1
                if clean_scans >= settle_scans:
                    return True
            else:
                clean_scans = 0
                if term_first and time.monotonic() < escalate_at:
                    fresh = [(p, fd) for p, fd in pinned if p not in termed]
                    _signal_pinned(fresh, signal.SIGTERM)
                    termed.update(p for p, _fd in fresh)
                else:
                    _signal_pinned(pinned, signal.SIGKILL)
                    # Adopted orphans become zombies once killed — reap
                    # them so a long-running process does not accumulate
                    # entries (our own children stay with asyncio).
                    _reap_adopted(adopted, known_own_children)
        finally:
            _close_pinned(pinned)
        if time.monotonic() >= deadline:
            if not containment:
                log.error(
                    "Cannot prove session %d is empty: child-subreaper "
                    "containment is unavailable, so an escaped descendant "
                    "would be undetectable", sid,
                )
            return False
        await asyncio.sleep(settle_delay if clean_scans else 0.1)


async def _wait_leader_exit(
    proc: asyncio.subprocess.Process, timeout: float | None = None
) -> bool:
    """Pipe-independent wait for LEADER exit.

    ``Process.wait()`` resolves only after every pipe transport closes
    (asyncio ``_try_finish``), so a ``&``-descendant holding stdout blocks
    it long past leader death — the PR #244 round-1 repro. ``returncode``
    is published at SIGCHLD reap regardless of pipes, so poll it. Returns
    True when the leader exited, False on deadline. Cancellation
    propagates (the sleep is the await point).
    """
    deadline = None if timeout is None else time.monotonic() + timeout
    while proc.returncode is None:
        if deadline is not None and time.monotonic() >= deadline:
            return False
        await asyncio.sleep(0.25)
    return True


@dataclass
class ProcessInfo:
    """Metadata and handles for a managed process."""

    pid: int
    command: str
    host: str
    start_time: float
    status: str = "running"  # running | completed | failed | killed
    output_buffer: deque = field(default_factory=lambda: deque(maxlen=OUTPUT_BUFFER_LINES))
    process: asyncio.subprocess.Process | None = None
    _reader_task: asyncio.Task | None = field(default=None, repr=False)
    _exit_task: asyncio.Task | None = field(default=None, repr=False)
    exit_code: int | None = None
    # Monotonic progress signal: total bytes ever read from the process,
    # NOT bounded by the ring buffer — a full ring of repeated lines can
    # look frozen while output is still arriving; this counter cannot.
    total_output_bytes: int = 0
    # Affirmative cleanup proof (round-7 #3): True only once the owned
    # session was OBSERVED empty by a complete scan. shutdown() requires
    # this before it may report clean teardown / permit re-exec.
    session_confirmed_empty: bool = False
    # Per-job provenance (round-10): injected into the spawn environment
    # and inherited across fork/exec/setsid, so an escaped descendant is
    # attributable to THIS job and never confused with another
    # subsystem's direct child.
    job_token: str = ""
    remote: bool = False
    remote_dir: str = ""
    remote_pid: int | None = None
    remote_pgid: int | None = None
    remote_sid: int | None = None
    remote_start_id: str = ""
    remote_token: str = ""
    remote_cursor: int = 0
    remote_lease: HostLease | None = field(default=None, repr=False)
    transport_unknown: bool = False
    _remote_lock: asyncio.Lock = field(default_factory=asyncio.Lock, repr=False)


class ProcessRegistry:
    """Registry for background processes with full lifecycle management."""

    def __init__(
        self,
        workspace: str | Callable[[], str] | None = None,
        remote_exec: Callable[
            [HostTarget, str, int], Awaitable[tuple[int, str]]
        ] | None = None,
    ) -> None:
        self._processes: dict[int, ProcessInfo] = {}
        # Background starts share the foreground workspace. Without this,
        # `manage_process start` stays an alternate route to the 2026-07-27
        # incident: a bare relative path resolving against the live install
        # (29 historical background starts had no explicit cd).
        #
        # A CALLABLE is preferred: the workspace's existence, type, ownership
        # and mode are mutable, so they must be re-verified immediately before
        # each spawn rather than trusted from construction time (PR #239
        # round-3 review — a cached path accepted a directory later replaced
        # by a symlink into the install).
        self._workspace = workspace
        self._remote_exec = remote_exec
        # Public handles are namespace-separated from positive local OS PIDs.
        self._next_remote_handle = -1
        # Kernel-backed containment for escaped descendants (round-9 #1):
        # as a child subreaper the PROCESS adopts orphans instead of PID
        # 1, so a double-fork+setsid escape stays attributable. Enabled
        # once at application startup (``src/__main__``) — a library
        # constructor must not flip process-wide state — and only READ
        # here. Its absence makes the terminator refuse to claim
        # emptiness rather than report a false success.
        # Pids WE deliberately spawned here: an adopted orphan is any
        # child of ours that is NOT one of these.
        self._own_children: set[int] = set()
        # Orphans verified as OURS by provenance while alive — reaping
        # goes by recorded pid because a zombie's environment is
        # unreadable (round-10).
        self._adopted_pids: set[tuple[int, int]] = set()

    @property
    def _containment(self) -> bool:
        """Live read — containment is process state, not construction state."""
        return child_subreaper_active()

    def _resolve_workspace(self) -> str | None:
        if callable(self._workspace):
            return self._workspace()
        return self._workspace

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def start(self, host: str, command: str, timeout: int = 300) -> str:
        """Start a background process locally. Returns confirmation with PID."""
        from ..tools.ssh import is_local_address

        if not is_local_address(host):
            return "Error: remote process start requires a generation-bound host lease."

        # Enforce concurrency limit (only count running)
        running = sum(1 for p in self._processes.values() if p.status == "running")
        if running >= MAX_CONCURRENT:
            return f"Cannot start: {running} processes already running (max {MAX_CONCURRENT})."

        try:
            # start_new_session puts the shell at the head of its own process
            # group, so kill()/shutdown() can take out descendants
            # (`sh -c 'x & ...'`) instead of just the shell leader.
            workspace = self._resolve_workspace()
            job_token = secrets.token_hex(8)
            env = dict(workspace_env(Path(workspace))) if workspace else dict(os.environ)
            env[JOB_TOKEN_ENV] = job_token
        except WorkspaceError as e:
            # The workspace is unusable. This is a REFUSAL, not a spawn error:
            # it must read as a failure to the tool loop, not as a started
            # process (PR #239 round-4 — the plain string was classified ok).
            return f"Error: cannot start background process — {e}"
        try:
            proc = await asyncio.create_subprocess_shell(
                command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
                stdin=asyncio.subprocess.PIPE,
                start_new_session=True,
                cwd=workspace,
                env=env,
            )
        except Exception as e:
            return f"Failed to start process: {e}"

        pid = proc.pid
        info = ProcessInfo(
            pid=pid,
            command=command,
            host=host,
            start_time=time.time(),
            process=proc,
            job_token=job_token,
        )
        self._processes[pid] = info
        self._own_children.add(pid)

        # Drainage and terminal-state publication are SEPARATE tasks:
        # the reader drains stdout; the watcher publishes status at
        # leader exit and reaps the group (which closes the pipe).
        info._reader_task = asyncio.create_task(self._read_output(info))
        info._exit_task = asyncio.create_task(self._watch_exit(info))

        # Auto-kill after max lifetime
        from ..async_utils import fire_and_forget

        fire_and_forget(
            self._enforce_lifetime(pid, MAX_LIFETIME_SECONDS), name=f"process_lifetime:{pid}"
        )

        log.info("Started process PID %d: %s", pid, command_display(command))
        return f"Process started (PID {pid}): {safe_text(command)}"

    async def start_remote(self, lease, command: str) -> str:
        """Start a detached SSH process with remote file/FIFO-backed I/O."""
        running = sum(1 for p in self._processes.values() if p.status == "running")
        if running >= MAX_CONCURRENT:
            lease.release()
            return f"Cannot start: {running} processes already running (max {MAX_CONCURRENT})."
        if self._remote_exec is None:
            lease.release()
            return "Failed to start process: remote execution is unavailable"
        token = secrets.token_hex(16)
        encoded = base64.b64encode(command.encode("utf-8")).decode("ascii")
        root = f"/tmp/odin-process-{token}"
        supervisor = base64.b64encode(_REMOTE_SUPERVISOR.encode()).decode("ascii")
        write_supervisor = (
            "import base64,sys;"
            f"open(sys.argv[1],'wb').write(base64.b64decode({supervisor!r}))"
        )
        script = (
            "set -eu; umask 077; command -v python3 >/dev/null; "
            f"d={shlex.quote(root)}; mkdir -- \"$d\"; "
            "mkfifo \"$d/in\"; "
            f"python3 -c {shlex.quote(write_supervisor)} \"$d/supervisor.py\"; "
            f"nohup python3 \"$d/supervisor.py\" \"$d\" {shlex.quote(token)} "
            f"{shlex.quote(encoded)} {MAX_LIFETIME_SECONDS} "
            "</dev/null >/dev/null 2>&1 & "
            "i=0; while [ ! -f \"$d/ready.json\" ] && [ $i -lt 100 ]; "
            "do sleep .1; i=$((i+1)); done; "
            "test -f \"$d/ready.json\"; cat \"$d/ready.json\""
        )
        try:
            code, output = await lease.run(
                lambda: self._remote_exec(lease.target, script, 30)
            )
        except Exception as exc:
            await self._teardown_unsettled_remote(lease, root, token)
            lease.release()
            return (
                "Failed to start process: SSH transport failed after dispatch; "
                f"outcome unknown outcome_unknown=true: {safe_error(exc)}"
            )
        try:
            ready = json.loads(output.strip().splitlines()[-1])
            remote_pid = int(ready["pid"])
            remote_pgid = int(ready["pgid"])
            remote_sid = int(ready["sid"])
            remote_start_id = str(ready["start_id"])
            identity_ok = (
                ready.get("token") == token
                and remote_pid > 1
                and remote_pgid > 1
                and remote_sid > 1
                and bool(remote_start_id)
            )
        except (IndexError, KeyError, TypeError, ValueError, json.JSONDecodeError):
            identity_ok = False
        if code != 0 or not identity_ok:
            await self._teardown_unsettled_remote(lease, root, token)
            lease.release()
            return (
                "Failed to start process: SSH settlement was not observed; "
                f"outcome unknown outcome_unknown=true: {output[:500]}"
            )
        handle = self._next_remote_handle
        self._next_remote_handle -= 1
        self._processes[handle] = ProcessInfo(
            pid=handle,
            command=command,
            host=lease.target.alias,
            start_time=time.time(),
            remote=True,
            remote_dir=root,
            remote_pid=remote_pid,
            remote_pgid=remote_pgid,
            remote_sid=remote_sid,
            remote_start_id=remote_start_id,
            remote_token=token,
            remote_lease=lease,
        )
        from ..async_utils import fire_and_forget

        fire_and_forget(
            self._enforce_lifetime(handle, MAX_LIFETIME_SECONDS),
            name=f"remote_process_lifetime:{handle}",
        )
        return f"Process started (PID {handle}): {safe_text(command)}"

    async def poll(self, pid: int, wait_seconds: float = 0.0) -> str:
        """Return recent output lines from a process.

        ``wait_seconds > 0`` waits server-side until the process EXITS or
        the deadline elapses, then reports — never an error, never a wake
        on intermediate output (early-output wakeup would return almost
        immediately on a streaming build and defeat the purpose; design
        settled with Odin, 2026-07-31). A terminal process reports
        immediately. Cancellation aborts only this wait — the detached
        process is never touched.
        """
        info = self._processes.get(pid)
        if not info:
            return f"No process with PID {pid}."

        if info.remote:
            async with info._remote_lock:
                return await self._poll_remote(info, wait_seconds)

        # Exit detection must not depend on the watcher having PUBLISHED
        # yet (round-3 blocker #3): returncode is set at SIGCHLD reap, so a
        # zero-wait poll landing in the publication window still settles.
        exited = info.status != "running" or (
            info.process is not None and info.process.returncode is not None
        )
        if wait_seconds > 0 and not exited and info.process is not None:
            exited = await _wait_leader_exit(info.process, timeout=wait_seconds)
        if exited:
            # Terminal report discipline (PR #244 round-2 blocker #3): the
            # leader is gone — whether it exited during OUR wait or before
            # this poll — so give the watcher a bounded moment to publish
            # status/exit_code and reap the group (closing the pipe), then
            # the reader to drain the tail. Without this, a poll landing
            # between status publication and drain completion reports a
            # terminal process with its final output missing. Shielded —
            # our bound must not cancel either task; normally both are
            # already done and this costs nothing.
            for settling in (info._exit_task, info._reader_task):
                if settling is not None and not settling.done():
                    try:
                        await asyncio.wait_for(asyncio.shield(settling), timeout=5.0)
                    except TimeoutError:
                        pass

        lines = list(info.output_buffer)
        status_line = f"[PID {pid}] status={info.status}"
        if info.exit_code is not None:
            status_line += f" exit_code={info.exit_code}"
        elapsed = time.time() - info.start_time
        status_line += f" uptime={elapsed:.0f}s"
        status_line += f" output_bytes={info.total_output_bytes}"

        if not lines:
            return f"{status_line}\n(no output yet)"
        # Show last 50 lines by default
        recent = lines[-50:]
        return f"{status_line}\n" + "".join(recent)

    async def write(self, pid: int, text: str) -> str:
        """Write text to a process's stdin."""
        info = self._processes.get(pid)
        if not info:
            return f"No process with PID {pid}."
        if info.status != "running":
            return f"Process {pid} is not running (status: {info.status})."
        if info.remote:
            async with info._remote_lock:
                return await self._write_remote(info, text)
        if not info.process or not info.process.stdin:
            return f"Process {pid} has no stdin."

        try:
            info.process.stdin.write(text.encode())
            await info.process.stdin.drain()
            return f"Wrote {len(text)} bytes to PID {pid}."
        except Exception as e:
            return f"Failed to write to PID {pid}: {e}"

    async def kill(self, pid: int) -> str:
        """Kill a running process — and its process group when it leads one."""
        info = self._processes.get(pid)
        if not info:
            return f"No process with PID {pid}."
        if info.status != "running":
            return f"Process {pid} already {info.status}."
        if info.remote:
            async with info._remote_lock:
                return await self._kill_remote(info)

        try:
            if info.process:
                from ..tools.ssh import terminate_process_tree

                # Group-aware TERM → bounded grace → KILL → reap. Descendants
                # of the managed shell die with it instead of leaking (they
                # would otherwise outlive an in-place restart's exec).
                # No owned_pgid (round-5 blocker #2): kill() runs only
                # while status is running, so terminate_process_tree
                # discovers and VERIFIES the group against the live leader
                # rather than trusting a stale-capable number; the exit
                # watcher's race-free pidfd sweep finishes any survivors.
                await terminate_process_tree(info.process, grace=5.0)
            info.status = "killed"
            info.exit_code = info.process.returncode if info.process else info.exit_code
            log.info("Killed process PID %d", pid)
            return f"Process {pid} killed."
        except Exception as e:
            return f"Failed to kill PID {pid}: {e}"

    def list_all(self) -> str:
        """Return a formatted table of all tracked processes."""
        if not self._processes:
            return "No processes tracked."

        lines = [f"{'PID':<8} {'HOST':<16} {'STATUS':<12} {'UPTIME':<10} {'COMMAND'}"]
        lines.append("-" * 60)
        now = time.time()
        for pid, info in sorted(self._processes.items()):
            elapsed = now - info.start_time
            if elapsed < 60:
                uptime = f"{elapsed:.0f}s"
            elif elapsed < 3600:
                uptime = f"{elapsed / 60:.1f}m"
            else:
                uptime = f"{elapsed / 3600:.1f}h"
            cmd_short = safe_text(info.command)[:40]
            lines.append(
                f"{pid:<8} {info.host[:15]:<16} {info.status:<12} {uptime:<10} {cmd_short}"
            )
        return "\n".join(lines)

    async def _remote_call(
        self, info: ProcessInfo, command: str, timeout: int
    ) -> tuple[int, str]:
        lease = info.remote_lease
        if lease is None or self._remote_exec is None:
            raise RuntimeError("remote process lease is unavailable")
        remote_exec = self._remote_exec
        try:
            return await lease.run(
                lambda: remote_exec(lease.target, command, timeout)
            )
        except Exception:
            info.transport_unknown = True
            raise

    def _remote_controller_command(
        self, info: ProcessInfo, operation: str, payload: str = "", wait_seconds: float = 0
    ) -> str:
        controller = base64.b64encode(_REMOTE_CONTROLLER.encode()).decode("ascii")
        execute_controller = (
            "import base64;"
            f"exec(compile(base64.b64decode({controller!r}),"
            "'<odin-remote-controller>','exec'))"
        )
        return (
            f"python3 -c {shlex.quote(execute_controller)} "
            f"{shlex.quote(info.remote_dir)} {shlex.quote(info.remote_token)} "
            f"{shlex.quote(operation)} {shlex.quote(payload)} {float(wait_seconds)!r}"
        )

    async def _teardown_unsettled_remote(self, lease, root: str, token: str) -> None:
        """Best-effort cleanup when dispatch happened but settlement did not."""
        if self._remote_exec is None:
            return
        controller = base64.b64encode(_REMOTE_CONTROLLER.encode()).decode("ascii")
        execute_controller = (
            "import base64;"
            f"exec(compile(base64.b64decode({controller!r}),"
            "'<odin-remote-controller>','exec'))"
        )
        quoted_root = shlex.quote(root)
        command = (
            f"d={quoted_root}; if [ -f \"$d/ready.json\" ]; then "
            f"python3 -c {shlex.quote(execute_controller)} "
            f"{quoted_root} {shlex.quote(token)} kill '' 0 >/dev/null 2>&1 || true; "
            "fi; rm -rf -- \"$d\""
        )
        try:
            await self._remote_exec(lease.target, command, 15)
        except Exception:
            log.warning(
                "Could not verify cleanup of unsettled remote process on %s",
                lease.target.alias,
            )

    @staticmethod
    def _parse_remote_reply(output: str) -> dict | None:
        try:
            value = json.loads(output.strip().splitlines()[-1])
        except (IndexError, TypeError, ValueError, json.JSONDecodeError):
            return None
        return value if isinstance(value, dict) else None

    async def _poll_remote(self, info: ProcessInfo, wait_seconds: float) -> str:
        if info.status != "running" and info.remote_lease is None:
            lines = list(info.output_buffer)[-50:]
            return (
                f"[PID {info.pid}] status={info.status} exit_code={info.exit_code} "
                f"uptime={time.time() - info.start_time:.0f}s "
                f"output_bytes={info.total_output_bytes}\n"
                + ("".join(lines) or "(no output)")
            )
        deadline = max(0, min(float(wait_seconds), MAX_POLL_WAIT_SECONDS))
        command = self._remote_controller_command(
            info, "status", str(info.remote_cursor), deadline
        )
        try:
            code, output = await self._remote_call(info, command, int(deadline) + 15)
        except Exception as exc:
            return (
                f"[PID {info.pid}] status=unknown outcome_unknown=true\n"
                f"SSH transport failed: {safe_error(exc)}"
            )
        reply = self._parse_remote_reply(output)
        if code != 0 or reply is None or not reply.get("ok"):
            info.transport_unknown = True
            detail = safe_error(reply.get("error", "") if reply else output)
            return f"[PID {info.pid}] status=unknown outcome_unknown=true\n{detail}"
        try:
            text = base64.b64decode(reply.get("output", ""), validate=True).decode(
                "utf-8", "replace"
            )
        except (ValueError, TypeError):
            info.transport_unknown = True
            return f"[PID {info.pid}] status=unknown outcome_unknown=true\ninvalid reply"
        info.remote_cursor = int(reply.get("cursor", info.remote_cursor))
        info.total_output_bytes = int(reply.get("size", info.remote_cursor))
        if text:
            info.output_buffer.extend(text.splitlines(keepends=True))
        if reply.get("status") == "exited":
            exit_record = reply.get("exit") or {}
            info.exit_code = int(exit_record.get("exit_code", 1))
            if info.status != "killed":
                info.status = "completed" if info.exit_code == 0 else "failed"
            if info.remote_lease is not None:
                info.remote_lease.release()
                info.remote_lease = None
        elapsed = time.time() - info.start_time
        return (
            f"[PID {info.pid}] status={info.status}"
            + (f" exit_code={info.exit_code}" if info.exit_code is not None else "")
            + f" uptime={elapsed:.0f}s output_bytes={info.remote_cursor}\n"
            + (text or "(no new output)")
        )

    async def _write_remote(self, info: ProcessInfo, text: str) -> str:
        encoded = base64.b64encode(text.encode("utf-8")).decode("ascii")
        command = self._remote_controller_command(info, "write", encoded)
        try:
            code, output = await self._remote_call(info, command, 15)
        except Exception as exc:
            return (
                f"Failed to write to PID {info.pid}: SSH transport failed; "
                f"outcome unknown outcome_unknown=true: {safe_error(exc)}"
            )
        reply = self._parse_remote_reply(output)
        if code != 0 or reply is None or not reply.get("ok"):
            info.transport_unknown = True
            detail = safe_error(reply.get("error", "") if reply else output)
            return (
                f"Failed to write to PID {info.pid}: outcome unknown "
                f"outcome_unknown=true: {detail}"
            )
        return f"Wrote {len(text)} bytes to PID {info.pid}."

    async def _kill_remote(self, info: ProcessInfo) -> str:
        command = self._remote_controller_command(info, "kill")
        try:
            code, output = await self._remote_call(info, command, 15)
        except Exception as exc:
            return (
                f"Failed to kill PID {info.pid}: SSH transport failed; "
                f"outcome unknown outcome_unknown=true: {safe_error(exc)}"
            )
        reply = self._parse_remote_reply(output)
        if code != 0 or reply is None or not reply.get("ok"):
            info.transport_unknown = True
            detail = safe_error(reply.get("error", "") if reply else output)
            return (
                f"Failed to kill PID {info.pid}: outcome unknown "
                f"outcome_unknown=true: {detail}"
            )
        if reply.get("already_exited"):
            return f"Process {info.pid} already exited; poll to collect its outcome."
        info.status = "killed"
        exit_record = reply.get("exit") or {}
        info.exit_code = exit_record.get("exit_code")
        if info.remote_lease is not None:
            info.remote_lease.release()
            info.remote_lease = None
        return f"Process {info.pid} killed."

    async def force_revoke_host(self, alias: str) -> dict[str, int]:
        attempted = unknown = killed = 0
        for info in list(self._processes.values()):
            if info.remote and info.host == alias and info.status == "running":
                attempted += 1
                result = await self._kill_remote(info)
                if result.endswith("killed."):
                    killed += 1
                else:
                    unknown += 1
        return {"attempted": attempted, "killed": killed, "unknown": unknown}

    async def shutdown(self) -> int:
        """Terminate all managed processes and their groups before returning.

        Remote jobs are deliberately included: restart does not re-adopt
        detached remote state, so leaving one behind would turn a managed job
        into an untracked effect. A failed remote kill remains outcome-unknown
        and the remote supervisor's one-hour deadline is the final backstop.

        Returns the number of processes that were still running.

        Callers re-exec in place once this returns, so NOTHING the registry
        owns may still be alive or mid-cleanup afterwards. A leader that already
        exited on its own may have its reader task mid-reap of a TERM-immune
        descendant, with the record already marked terminal — so we must AWAIT
        every reader/reaper to completion, never cancel it out from under an
        in-flight group kill (cancellation propagates through
        terminate_process_tree and would strand the descendant across the exec).
        """
        killed = 0
        # 1) TERM/KILL every still-running leader. Its exit watcher then
        #    publishes terminal state and reaps surviving group members,
        #    which closes the pipe and unblocks the drainer.
        for pid, info in list(self._processes.items()):
            if info.status == "running":
                try:
                    await self.kill(pid)
                    killed += 1
                except Exception:
                    log.warning("Failed to kill PID %d during shutdown", pid)
        # 2) Let every reader/reaper finish so no group cleanup is left pending.
        for pid, info in list(self._processes.items()):
            for task in (info._exit_task, info._reader_task):
                if task is None or task.done():
                    continue
                try:
                    await asyncio.wait_for(
                        asyncio.shield(task), timeout=SHUTDOWN_REAP_TIMEOUT
                    )
                except TimeoutError:
                    # A wedged async reap must not strand TERM-immune
                    # descendants across re-exec. The BARRIER is ordered so
                    # that the process state — not the task — decides when
                    # shutdown may return (round-5 blocker #1): a
                    # cancellation-resistant task can never hold us, because
                    # we never await it unboundedly.
                    log.warning(
                        "Reaper for PID %d did not finish; hard-killing group "
                        "before abandoning", pid,
                    )
                    task.cancel()  # best effort; NEVER awaited unbounded
                    await self._kill_group_until_gone(info)
                except Exception:
                    log.debug(
                        "Reaper for PID %d errored during shutdown", pid, exc_info=True
                    )
        # 3) FINAL AFFIRMATIVE PROOF (round-7 #3). A completed watcher is
        #    not proof by itself: it may have recorded a FAILED reap, and
        #    the timeout fallback's verdict must not be discarded either.
        #    Every record that has not been OBSERVED session-empty is
        #    re-verified here; anything still unproven is escalated to the
        #    caller, which owns the re-exec decision.
        unproven: list[int] = []
        for pid, info in list(self._processes.items()):
            if info.session_confirmed_empty or info.process is None:
                continue
            try:
                if not await self._kill_group_until_gone(info):
                    unproven.append(pid)
            except Exception:
                log.exception("Final cleanup verification failed for PID %d", pid)
                unproven.append(pid)
        if killed:
            log.info("Shutdown: terminated %d running process(es)", killed)
        if unproven:
            raise ProcessCleanupError(
                "could not confirm the owned session is empty for "
                f"PID(s) {sorted(unproven)} — descendants may survive a "
                "re-exec"
            )
        return killed

    def cleanup(self) -> int:
        """Remove dead processes older than 1 hour. Returns count removed.

        NEVER cancels lifecycle tasks (PR #244 round-2 blocker #1): the
        exit watcher may be mid-group-reap, and cancellation propagates
        through ``terminate_process_tree`` — stranding a TERM-immune
        descendant is exactly the v3.59.1 shutdown bug reinvented. A
        record whose tasks are still running simply stays until the next
        cycle; the reap is self-terminating (TERM grace then KILL), so
        deferral is bounded by nature, not by us.
        """
        now = time.time()
        to_remove = [
            pid
            for pid, info in self._processes.items()
            if info.status != "running"
            and (now - info.start_time) > MAX_LIFETIME_SECONDS
            and all(
                t is None or t.done()
                for t in (info._reader_task, info._exit_task)
            )
        ]
        for pid in to_remove:
            self._processes.pop(pid)
        # Adopted orphans die as zombies (nothing else will wait on them);
        # sweep them here so a long-running process cannot accumulate.
        reap_adopted_zombies(self._adopted_pids)
        return len(to_remove)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _kill_group_until_gone(
        self, info: ProcessInfo, timeout: float = 8.0
    ) -> bool:
        """Bounded, race-free termination of everything we still own.

        The shutdown completion barrier: drive the owned session empty
        with repeated COMPLETE enumeration (fork-on-signal descendants
        are caught by the next pass) and reap the leader, then return
        only on an AFFIRMATIVE observation — an unreadable /proc or fd
        exhaustion yields False, never assumed success (round-6).

        A False return is LOUD (error) and is what the caller reports.
        """
        proc = info.process
        if proc is None:
            return True
        gone = await _terminate_session_until_empty(
            proc.pid,
            timeout=timeout,
            term_first=False,
            adopted_by=os.getpid(),
            known_own_children=frozenset(self._own_children),
            containment=self._containment,
            job_token=info.job_token or None,
            proc_token=os.environ.get(PROC_TOKEN_ENV),
            adopted_sink=self._adopted_pids,
            teardown=True,  # shutdown barrier: adoption is sufficient
        )
        info.session_confirmed_empty = gone
        if proc.returncode is None:
            # Reap the leader (bounded) so no zombie crosses the exec.
            await _wait_leader_exit(proc, timeout=1.0)
        if gone and proc.returncode is not None:
            return True
        log.error(
            "Shutdown could not confirm PID %d's owned group is gone "
            "(group_empty_observed=%s, leader_rc=%r) — re-exec may inherit "
            "orphaned descendants",
            info.pid, gone, proc.returncode,
        )
        return False

    async def _read_output(self, info: ProcessInfo) -> None:
        """Drain stdout into the ring buffer. Pure drainage — terminal
        status and group reaping live in ``_watch_exit`` (PR #244 round-1:
        a ``&``-descendant holding the stdout pipe kept EOF from arriving,
        so an exited leader reported ``running`` forever and the reap
        stalled behind drainage).

        Bounded RAW reads, not ``readline()``: newline-free output and
        carriage-return progress bars must still advance
        ``total_output_bytes`` (it is the wait-poll progress signal), and
        an over-limit line must not kill drainage (``readline`` raises on
        lines beyond the stream limit; ``read(n)`` cannot).
        """
        pending = b""
        try:
            while info.process and info.process.stdout:
                chunk = await info.process.stdout.read(4096)
                if not chunk:
                    break
                info.total_output_bytes += len(chunk)
                pending += chunk
                # Display buffering: split on both \n and \r so progress
                # bars render as lines; keep the unterminated tail bounded.
                segments = _SEGMENT_SPLIT.split(pending)
                pending = segments.pop()
                for seg in segments:
                    if seg:
                        info.output_buffer.append(
                            seg.decode("utf-8", errors="replace") + "\n"
                        )
                if len(pending) > 4096:
                    # Forced flush of an unterminated tail must not split a
                    # multibyte sequence (PR #244 round-2 blocker #4): cut
                    # at a UTF-8 boundary and carry the partial sequence.
                    flush, pending = _utf8_boundary_split(pending)
                    if flush:
                        info.output_buffer.append(
                            flush.decode("utf-8", errors="replace") + "\n"
                        )
        except Exception:
            pass
        if pending:
            info.output_buffer.append(pending.decode("utf-8", errors="replace") + "\n")

    async def _watch_exit(self, info: ProcessInfo) -> None:
        """Publish terminal state at LEADER exit, then reap the group.

        Separated from stdout drainage (PR #244 round-1): ``process.wait()``
        returns when the leader exits regardless of who still holds the
        pipe, so status/exit_code publication never waits on EOF, and the
        reap (which kills lingering descendants — the v3.59.1 contract:
        managed descendants are reaped when their leader exits) is what
        CLOSES the pipe and lets the drainer finish naturally.
        """
        if info.process is None:
            return
        try:
            await _wait_leader_exit(info.process)
            info.exit_code = info.process.returncode
            if info.status == "running":
                info.status = "completed" if info.exit_code == 0 else "failed"
        except Exception:
            if info.status == "running":
                info.status = "failed"

        # Reap while ownership is fresh: a non-empty group keeps the leader
        # pid from being recycled — but ONLY while a member survives, so a
        # numeric pgid is stale-capable here (round-5 blocker #2). Every
        # signal now goes through pidfds pinned BEFORE membership
        # verification: TERM, bounded grace, then KILL for survivors.
        try:
            info.session_confirmed_empty = await _terminate_session_until_empty(
                info.process.pid,
                grace=2.0,
                timeout=10.0,
                adopted_by=os.getpid(),
                known_own_children=frozenset(self._own_children),
                containment=self._containment,
                job_token=info.job_token or None,
                proc_token=os.environ.get(PROC_TOKEN_ENV),
                adopted_sink=self._adopted_pids,
            )
        except Exception:
            info.session_confirmed_empty = False
            log.debug("session reap after PID %d exit failed", info.pid, exc_info=True)
        if not info.session_confirmed_empty:
            log.error(
                "Could not confirm PID %d's owned session is empty after "
                "leader exit — shutdown will re-verify", info.pid,
            )

    async def _enforce_lifetime(self, pid: int, max_seconds: int) -> None:
        """Auto-kill process after max lifetime."""
        await asyncio.sleep(max_seconds)
        info = self._processes.get(pid)
        if info and info.status == "running":
            log.warning("Auto-killing PID %d after %ds lifetime limit", pid, max_seconds)
            await self.kill(pid)
