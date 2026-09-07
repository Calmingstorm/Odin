# R8 real per-session same-stack qualification

`src/computer/runtime/wayland_probe.py` supplies `async qualify(identity)` and
`GnomeSameStackQualifier(record_spawn=None)`, an async callable returning the
parent `InputAdmission`. No editable evidence file, boolean bypass, version
allowlist, rebuild or foreign container stack substitutes for measurement.

## Runtime integration

The input is the runtime's `CompositorRuntimeIdentity`: authenticated Shell owner,
EIS peer PID/UID, compositor PID/start/boot/session, version/backend, executable,
and mapped library device/inode/SHA256 records. The caller authenticates current
portal consent and Shell scope, captures this identity, invokes the qualifier,
and authenticates/revalidates identity again afterward. The qualifier separately
checks the measured active `/proc` identity and installed bytes before and after.
An eligible admission includes `identity_sha256:<binding_digest>` and
`probe_scope=same_stack_disposable`, never `active_session`.

The optional `record_spawn` callback is **async callback(pid: int)**, called after
the inert launcher says READY and its pidfd is opened, before any namespace launch
command is sent. A backend may assign `.record_spawn` before use to durably record
that owned supervisor. There is no arbitrary user command or path interface.

## Isolation and lifetime

The outer parent-death-bound supervisor is a subreaper. Its fixed bwrap child
unshares PID, mount, network, IPC/user namespaces and mounts installed `/usr` and
library aliases read-only. `/run`, `/tmp`, `/home`, `/dev`, buses and Xvfb are
private; no host display socket, human home, physical input or GPU device is
mounted. A read-only nonce marker binds outer namespace IDs. Helpers check that
their PID/mount/network namespaces differ, fixed private paths are used, and the
marker and peer are private before connecting or triggering sender EOF.

The native case uses the installed GNOME `--headless` native backend. The nested
case uses its own Xvfb and `--nested`. It requires exact mapped executable/input/
render/vendor library bytes, device and inode. A native hardware stack that loads
different vendor libraries than headless llvmpipe is **refused**, not inferred
equivalent. Root-owned mappings show overflow UID in the unprivileged namespace;
only read-only exact objects, already verified as UID0 outside, are accepted.

The qualifier has an 86-second absolute deadline with bounded cleanup; private
behavior has a 70-second limit. Normal stock runs take roughly 6 to 15 seconds.
Cancellation uses the supervisor pidfd, never a recycled numeric PID or PGID.
The outer and inner subreapers independently reap owned descendants, including
activation daemons and double forks. bwrap's namespace death is the final fence.

## Measured behavior

The isolated helper alone uses Mutter's internal EIS connection; **production
input remains public-portal-only**. It authenticates private Shell/RemoteDesktop
D-Bus PID ownership and EI `SO_PEERCRED`. GLib `steal_fds()` transfers ownership,
all helper duplicates close before handoff, and sender checks duplicate absence.

One unchanged GTK3 native Wayland receiver must:

1. Receive actual baseline input and have measured focus.
2. Receive button1 and Shift down callbacks and a held ledger/pointer mask.
3. Receive both release callbacks after the sole EI sender exits without sending
   releases. A neutral state mask alone never establishes this.
4. Survive and receive a fresh sender's full click and key press/release pair.

The compositor also survives; mappings are rechecked, all subprocesses are
reaped, then the active identity is revalidated. Losing focus when an EI device
is removed does not erase callback requirements. Refocus is allowed only after
release callbacks, before fresh input, within the private test compositor.

## Installed dependencies and packaging

Package this module and all sibling `assets/wayland_probe_*.py` assets. Required:
Linux pidfds/user namespaces, root-owned `/usr/bin/bwrap`, `dbus-daemon`,
`gnome-shell`, system Python3 with GI/Gtk3, and `libei.so.1`. Nested additionally
requires installed Xvfb and xdotool. No compiler is used at runtime. The package
installer, not a session-start shell command, should install these dependencies.

Docker is **only an execution fixture**, not the production runner. Running the
same production bwrap path inside the stock image needs unconfined seccomp,
AppArmor and systempaths for the inner namespace/proc mount, with no network,
no device forwarding, bounded pids/memory/CPU, and only source mounted read-only.
The test fixture supplies an owned active compositor identity rather than a
real operator's consent. This does not prove the composed production transport.

## Recorded limitations

The same-stack disposable test does not test the active compositor's mutable
internal state, physical-device concurrency or unrelated hardware execution
paths. Unsupported identities/dependencies/backend mismatch and any incomplete
measurement preserve capture-only refusal, naming compositor/version and remedy.
This module cannot grant consent, authorize a source or application, or turn a
qualification failure into input authority.

Initial isolated host bwrap smoke command, before the production supervisor was
implemented, left one adopted dead bwrap PID3867396. It is historical test debt;
no service restart/injection was used to hide it. Final production tests use
the independent supervisors and verify no additional owned descendants remain.
