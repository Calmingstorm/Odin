#!/bin/bash
set -euo pipefail
[[ ${XI2_PRIVATE_SANDBOX:-} == 1 && ${XI2_SAFE_LIFECYCLE:-} == 1 && ${DISPLAY:-} == :177 && $UID != 0 ]]
[[ ! -e /proc/self && ! -e /opt/odin && ! -e /tmp/.X11-unix/X0 ]]
# /home is an empty sandbox directory; reject every account, including dotfiles.
(shopt -s nullglob dotglob; entries=(/home/*); [[ -d /home && -r /home && -x /home ]] && (( ${#entries[@]} == 0 )))
echo "ISOLATION uid=$UID display=$DISPLAY private_bus=$DBUS_SESSION_BUS_ADDRESS"
echo 'ISOLATION private user/mount/pid/net/ipc namespaces; no host proc, display, home, devices or bus'
pkg-config --modversion x11 xi xtst gtk+-3.0
gcc -Wall -Wextra -Werror -O2 /harness/x11-lifecycle.c -o /workspace/lifecycle $(pkg-config --cflags --libs x11 xi xtst)
exec /usr/bin/python3 /harness/x11-lifecycle-corpus.py
