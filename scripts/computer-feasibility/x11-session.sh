#!/bin/bash
set -euo pipefail
[[ ${XI2_PRIVATE_SANDBOX:-} == 1 && ${DISPLAY:-} == :177 && $UID != 0 ]]
[[ ! -e /proc/self && ! -e /home/odin && ! -e /opt/odin ]]
echo "ISOLATION uid=$UID display=$DISPLAY bus=$DBUS_SESSION_BUS_ADDRESS"
echo 'ISOLATION procfs intentionally absent; bwrap --unshare-all --unshare-user mandatory'
pkg-config --modversion x11 xi xtst gtk+-3.0
gcc -Wall -Wextra -O2 /harness/x11-inject.c -o /workspace/inject $(pkg-config --cflags --libs x11 xi xtst)
mkdir -m 1777 /tmp/.X11-unix
Xvfb :177 -screen 0 900x500x24 -nolisten tcp -noreset -extension GLX > /workspace/xvfb.log 2>&1 &
xvfb=$!
human= robot=
cleanup() {
    echo '=== XVFB LOG AT CLEANUP ==='; cat /workspace/xvfb.log || true
    for pid in "$human" "$robot" "$xvfb"; do
        if [[ -n $pid ]]; then kill "$pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true; fi
    done
    echo 'CLEANUP owned children waited; private namespace exits with service'
}
trap cleanup EXIT
for i in {1..50}; do if xdpyinfo -display :177 >/dev/null 2>&1; then break; fi; sleep .05; done
xdpyinfo -display :177 | sed -n '1,22p'
if [[ ${XI2_SAME_PROCESS:-} == 1 ]]; then
    /usr/bin/python3 /harness/x11-same-target.py > /workspace/human.log 2>&1 & human=$!
    robot=
    : > /workspace/robot.log
else
    /usr/bin/python3 /harness/x11-target.py human > /workspace/human.log 2>&1 & human=$!
    /usr/bin/python3 /harness/x11-target.py robot > /workspace/robot.log 2>&1 & robot=$!
fi
for i in {1..50}; do [[ -f /workspace/human.xid && -f /workspace/robot.xid ]] && break; sleep .1; done
set +e
/workspace/inject "$(cat /workspace/human.xid)" "$(cat /workspace/robot.xid)"
result=$?
set -e
echo 'POST_DETACH application liveness'
if kill -0 "$human" && { [[ -z $robot ]] || kill -0 "$robot"; }; then
    echo "pre-existing disposable application PIDs remain alive: $human $robot"
else
    echo 'FAIL pre-existing disposable application exited before fixture cleanup'
    result=6
fi
echo '=== HUMAN GTK EVENTS ==='; cat /workspace/human.log
echo '=== ROBOT GTK EVENTS ==='; cat /workspace/robot.log
if grep -Eq 'Traceback|XERROR|X Window System error|XI_BadDevice' /workspace/human.log /workspace/robot.log; then result=6; fi
echo '=== XVFB LOG ==='; cat /workspace/xvfb.log
exit "$result"
