#!/usr/bin/bash
set -euo pipefail
[[ $(id -u) == 0 && "$DISPLAY" == :177 && ! -e /home/odin && ! -e /tmp/.X11-unix/X0 ]]
chown 65534:65534 /workspace /workspace/home /workspace/run /workspace/tmp
exec /usr/bin/setpriv --reuid=65534 --regid=65534 --clear-groups --bounding-set=-all --no-new-privs /usr/bin/dbus-run-session --config-file=/harness/x11-owned-bus.conf -- /usr/bin/python3 /harness/x11-owned-guardian-corpus.py
