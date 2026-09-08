#!/bin/bash
set -euo pipefail
[[ ${XI2_PRIVATE_SANDBOX:-} == 1 && ${DISPLAY:-} == :177 && $UID != 0 ]]
[[ ! -e /proc/self && ! -e /opt/odin && ! -e /tmp/.X11-unix/X0 ]]
# /home is an empty sandbox directory; reject every account, including dotfiles.
(shopt -s nullglob dotglob; entries=(/home/*); [[ -d /home && -r /home && -x /home ]] && (( ${#entries[@]} == 0 )))
exec /usr/bin/python3 /harness/x11-send-event-probe.py
