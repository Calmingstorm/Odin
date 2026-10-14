# Managed-host platform compatibility

Managed targets declare `os: linux` or `os: macos`. These values select target
probes, not the platform of the machine running Odin. Shell commands still use
the remote account's login shell.

## Files

Raw `read_file` and both `apply_patch` transports use `chmod -- 600 FILES`, which
works with GNU and BSD chmod. The standalone patch runner supports Python 3.9
and newer, including Apple's `/usr/bin/python3` 3.9 when developer tools are
installed. Odin itself retains its separate Python requirement. A missing or
developer-tools installer stub is not a working Python interpreter.

Patches require a native atomic no-replace rename primitive: Linux
`renameat2(RENAME_NOREPLACE)` with glibc 2.28 or newer, or macOS
`renameatx_np(RENAME_EXCL)`. Unsupported filesystems fail explicitly; there is no
unsafe copy/delete fallback. A case-only move on a case-insensitive volume is
allowed when the destination is an alias of the source directory entry, not a
separate existing file or hard link. Publication and rollback retain no-overwrite
protection. A concurrent destination that blocks rollback is preserved, with
private recovery artifacts reported rather than a false success.

## Validation

For Linux targets, port and service commands remain GNU `timeout` plus Bash
`/dev/tcp`, and `systemctl is-active`. Log probes capture the output and exit
status of a **single** journalctl query in a private temporary file. Failed reads
never establish absence. Permission warnings continue to yield partial evidence.

For macOS targets:

- Port probes bound the same Bash `/dev/tcp` connection using Perl `alarm`, so
  stock hosts do not need GNU coreutils.
- Service probes use `launchctl print`. A bare label selects `system/LABEL`;
  explicit `system/LABEL` and `gui/UID/LABEL` are supported. Specify the actual
  graphical user's UID for GUI jobs, not necessarily the SSH user's UID. The
  default expected `active` maps to launchd's `running`; explicit launchd states
  and lists are also accepted. An unavailable/unreadable job is an error.
- Log probes use `log show --last Ns --style compact`. `unit=NAME:PATTERN` scopes
  the query to `process == "NAME" OR subsystem == "NAME"`. The same single-query
  exit-status rule applies. A successful query proves only the readable unified
  log view, not access to private or unavailable log records.

## SSH trust and enrollment

Trust filenames containing whitespace or quote/backslash characters are quoted
for OpenSSH's own `UserKnownHostsFile` tokenizer, not merely for subprocess argv.
Ordinary filenames retain their previous option text. NUL and line breaks are
refused clearly. This applies to one-shot commands, pooled masters, binary file
reads, and enrollment tests.

Failed enrollment reports leave `platform` empty unless the probe's own
`odin-host-test ` prefix returned. Discarding or pruning an abandoned tested
candidate removes its temporary trust file without deleting files still owned by
pending candidates, committed hosts, or draining leased generations. Cleanup is
best effort on filesystem errors and retries on a later lifecycle operation.

## Reproducing native patch checks

`scripts/testing/probe_managed_patch.py` captures the production plain,
compressed, and raw transports in a development environment, then runs them and
case-insensitive move/rollback fixtures in an explicitly supplied temporary
directory on a Mac. It never accesses a profile, service, GUI, or live data. Run
the native phase with Apple's interpreter and stock system PATH to distinguish
system compatibility from a Homebrew environment.
