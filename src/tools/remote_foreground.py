"""A remote foreground command ends when its SSH channel closes.

A remote command runs under the login shell on the far side of an SSH
channel with no terminal, so closing the channel (a cancelled turn, a
timeout, Odin stopping) sends it no hangup: it ran on until it ended by
itself or wrote to the dead channel. ``remote_foreground_command`` wraps a
user command in a POSIX bootstrap that runs it under a small Python
coordinator. The coordinator owns the command's process group and relays its
output. The local SSH client keeps the channel's stdin open and never writes
to it, so that stdin reaching EOF means the channel has closed.

The contract (agreed with Odin in design reviews 02-08, 2026-10-21):

- The command is owned until it has exited AND its output has reached EOF
  (settlement). Before settlement, a closed channel, a broken output side, a
  catchable stop signal or an error ends the command's original process
  group: TERM, a grace period, then KILL. The leader is not reaped before the
  last group signal, so the group id cannot be reused under us. After
  settlement no group signal is ever sent: buffered output is still
  delivered, and background work whose output went elsewhere keeps running.
- Output is relayed without blocking (a bounded buffer and exact partial
  writes), so a stalled reader can never stop the coordinator from seeing the
  channel close.
- Outside the contract: descendants that start their own process group or
  session, SIGKILL of the coordinator, host failure and kernel faults. A
  network partition delays cleanup until sshd sees the channel close.
  Closing or reaping the local client is never evidence that the remote
  group has ended.
- Without python3 the command runs as it always did, without that cleanup,
  after a one-line notice on stderr. On macOS, ``/usr/bin/python3`` is only an
  installer stub until the developer tools are installed (running it fails and
  asks to install them), so it counts only when ``xcode-select -p`` succeeds. A
  coordinator that started and then failed never falls back to a second run.
- The command still runs under the account's login shell (``$SHELL -c``);
  that shell's non-interactive startup files run once more than before.
"""

from __future__ import annotations

import base64
import shlex

# Seconds between the remote group's TERM and KILL (terminate_process_tree's
# default grace).
REMOTE_FOREGROUND_GRACE_SECONDS = 3

MISSING_PYTHON_NOTICE = (
    "odin: python3 is not available on this host, so this command will not be "
    "stopped if the connection closes."
)

# The remote program: argv is (shell, command, grace). Python 3.6+, standard
# library only, the same requirement as the remote job supervisor.
_COORDINATOR = r'''import errno, os, select, signal, subprocess, sys, time

BUFFER_LIMIT = 1 << 20  # output held while the reader is slow
shell, command, grace = sys.argv[1], sys.argv[2], float(sys.argv[3])
stop_requested = False


def request_stop(_signum, _frame):
    global stop_requested
    stop_requested = True


for _sig in (signal.SIGTERM, signal.SIGHUP, signal.SIGINT, signal.SIGQUIT):
    signal.signal(_sig, request_stop)


class Owner:
    """The single owner of the command's process group."""

    def __init__(self, child):
        self.child = child
        self.group = child.pid  # a new session: the leader's pid is the group id
        self.settled = False  # exited + output EOF: group signalling is retired for good
        self.ended = False

    def settle(self):
        # Only after output EOF: reap an exited leader and retire group signalling.
        if self.child.poll() is None:
            return False
        self.settled = True
        return True

    def end_group(self):
        # TERM, the full grace (the unreaped leader anchors the group id), KILL,
        # then reap. Never after settlement, never twice; a stop signal during
        # the grace only sets the flag again.
        # macOS answers EPERM, not ESRCH, when nothing in the group is left to
        # signal (only the unreaped leader): that is the same "nothing left".
        if self.settled or self.ended:
            return
        self.ended = True
        try:
            os.killpg(self.group, signal.SIGTERM)
        except (ProcessLookupError, PermissionError):
            pass
        deadline = time.monotonic() + grace
        while time.monotonic() < deadline:
            time.sleep(0.05)
        try:
            os.killpg(self.group, signal.SIGKILL)
        except (ProcessLookupError, PermissionError):
            pass
        self.child.wait()


def relay(owner):
    channel = sys.stdin.fileno()
    out = owner.child.stdout.fileno()
    os.set_blocking(out, False)
    os.set_blocking(1, False)
    pending = bytearray()
    output_open = True
    while True:
        if stop_requested:
            return "stop"
        if not output_open and not owner.settled:
            owner.settle()
        if owner.settled and not pending:
            return "done"
        readers = [channel]
        if output_open and len(pending) < BUFFER_LIMIT:
            readers.append(out)
        writers = [1] if pending else []
        ready_r, ready_w, _ = select.select(readers, writers, [], 0.2)
        if channel in ready_r:
            try:
                data = os.read(channel, 4096)
            except BlockingIOError:
                data = b"x"
            if not data:
                return "channel"
        if out in ready_r:
            try:
                data = os.read(out, min(65536, BUFFER_LIMIT - len(pending)))
            except BlockingIOError:
                data = None
            if data == b"":
                output_open = False
            elif data:
                pending.extend(data)
        if 1 in ready_w and pending:
            try:
                written = os.write(1, pending[:65536])
            except BlockingIOError:
                written = 0
            except OSError as exc:
                if exc.errno in (errno.EPIPE, errno.ECONNRESET, errno.EBADF):
                    return "channel"
                raise
            del pending[:written]


try:
    child = subprocess.Popen(
        [shell, "-c", command], stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT, start_new_session=True, close_fds=True,
    )
except OSError as exc:
    sys.stderr.write("odin: the command could not be started: %s\n" % exc)
    sys.exit(126)

owner = Owner(child)
try:
    outcome = relay(owner)
except BaseException:
    owner.end_group()  # a no-op once settled
    raise
if outcome != "done":
    owner.end_group()  # before settlement the command is ended; after it, delivery just stops
    sys.exit(129)
code = child.returncode
sys.exit(128 - code if code < 0 else code)
'''

# A fixed decoder: the coordinator travels as one base64 argument, never as
# shell-quoted source.
_DECODER = (
    'import base64,sys;exec(compile(base64.b64decode(sys.argv.pop(1)),"odin-fg","exec"))'
)
_ENCODED_COORDINATOR = base64.b64encode(_COORDINATOR.encode("utf-8")).decode("ascii")
_LOGIN_SHELL = '"${SHELL:-/bin/sh}"'


# python3 on PATH, unless it is the macOS stub of a Mac without developer tools.
_HAS_PYTHON3 = (
    "command -v python3 >/dev/null 2>&1 && "
    '{ [ "$(command -v python3)" != /usr/bin/python3 ] || [ "$(uname)" != Darwin ] '
    "|| xcode-select -p >/dev/null 2>&1; }"
)


def remote_foreground_command(
    command: str, grace: float = REMOTE_FOREGROUND_GRACE_SECONDS
) -> str:
    """The remote command line that runs *command* under the coordinator.

    POSIX shell syntax, like the remote job supervisor's start script. The
    command is quoted once into a shell variable; ``exec`` hands the channel
    to python3 (or, without python3, to the login shell, after the notice).
    """
    return (
        f"odin_fg_command={shlex.quote(command)}; "
        f"if {_HAS_PYTHON3}; then "
        f"exec python3 -c {shlex.quote(_DECODER)} {_ENCODED_COORDINATOR} "
        f'{_LOGIN_SHELL} "$odin_fg_command" {grace}; '
        f"else echo {shlex.quote(MISSING_PYTHON_NOTICE)} >&2; "
        f'exec {_LOGIN_SHELL} -c "$odin_fg_command"; fi'
    )
