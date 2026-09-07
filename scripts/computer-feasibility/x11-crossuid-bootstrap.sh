#!/usr/bin/bash
set -euo pipefail
[[ $(id -u) == 0 && "$DISPLAY" == :177 && ! -e /home/odin && ! -e /tmp/.X11-unix/X0 ]]
chmod 755 /workspace
chown 65534:65534 /workspace/home /workspace/run /workspace/tmp
install -o 0 -g 0 -m 440 /harness/x11-crossuid-sudoers /etc/sudoers
mkdir /etc/pam.d
install -o 0 -g 0 -m 444 /harness/x11-crossuid-pam /etc/pam.d/sudo
exec /usr/bin/python3 /harness/x11-crossuid-corpus.py
