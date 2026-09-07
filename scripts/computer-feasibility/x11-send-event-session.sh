#!/bin/bash
set -euo pipefail
[[ ${XI2_PRIVATE_SANDBOX:-} == 1 && ${DISPLAY:-} == :177 && $UID != 0 ]]
[[ ! -e /proc/self && ! -e /home/odin && ! -e /opt/odin && ! -e /tmp/.X11-unix/X0 ]]
exec /usr/bin/python3 /harness/x11-send-event-probe.py
