#!/bin/bash
set -euo pipefail
# Executed ONLY within the disposable rootless container, after parent go.
[[ $HOME == /tmp/home && $XDG_RUNTIME_DIR == /tmp/runtime ]]
[[ -f /run/.containerenv || -f /.dockerenv ]]
[[ ${DBUS_SESSION_BUS_ADDRESS:-} == unix:* ]]
printf '%s' "$DBUS_SESSION_BUS_ADDRESS" > /tmp/lab-session-bus
mkdir -m 700 -p "$HOME" "$XDG_RUNTIME_DIR" "$XDG_CONFIG_HOME" /tmp/work
mkdir -m 1777 /tmp/.X11-unix
ulimit -c 0
export DBUS_SYSTEM_BUS_ADDRESS
DBUS_SYSTEM_BUS_ADDRESS=$(dbus-daemon --session --fork --print-address)
export XDG_SESSION_TYPE=wayland
export GDK_BACKEND=wayland
export LP_NUM_THREADS=2 OMP_NUM_THREADS=1 MAGICK_THREAD_LIMIT=1
export GSK_RENDERER=cairo
if [[ ${WAYLAND_OPERATOR_LAB:-0} == 1 ]]; then
  export NO_AT_BRIDGE=0 GTK_A11Y=atspi
fi
exec > >(tee /evidence/session.log) 2>&1
echo 'PRELIMINARY PORTAL CAPABILITY EXPERIMENT, NOT AN INDEPENDENCE PASS'
date --iso-8601=seconds
id
dpkg-query -W gnome-shell libmutter-14-0 xdg-desktop-portal \
  xdg-desktop-portal-gnome libei1 libeis1 pipewire wireplumber xwayland libgtk-3-0t64
# All processes are descendants in the private container PID namespace. No
# process-name matching, host kill, session settings, or device forwarding.
pipewire > /evidence/pipewire.log 2>&1 &
wireplumber > /evidence/wireplumber.log 2>&1 &
if [[ ${WAYLAND_OPERATOR_LAB:-0} == 1 ]]; then
  # Disposable outer display ONLY. XTEST here simulates the consenting operator;
  # it is not a product input path or a way around portal permission.
  export DISPLAY=:77
  Xvfb :77 -screen 0 1280x800x24 -nolisten tcp > /evidence/xvfb.log 2>&1 &
  sleep 1
  gnome-shell --wayland --nested --no-x11 > /evidence/compositor.log 2>&1 &
else
  gnome-shell --wayland --headless --no-x11 --virtual-monitor 1280x720 \
    > /evidence/compositor.log 2>&1 &
fi
compositor=$!
for ((i=0; i<100; i++)); do
  kill -0 "$compositor" || { echo 'UNSUPPORTED: private compositor startup failed'; exit 20; }
  # Only inspect the explicitly created container-private runtime directory.
  for socket in "$XDG_RUNTIME_DIR"/wayland-*; do
    if [[ -S $socket ]]; then export WAYLAND_DISPLAY=${socket##*/}; break 2; fi
  done
  sleep .1
done
[[ -n ${WAYLAND_DISPLAY:-} ]] || { echo 'UNSUPPORTED: no private Wayland socket'; exit 21; }
sleep 2
if [[ ${WAYLAND_OPERATOR_LAB:-0} == 1 ]]; then
  DISPLAY=:77 xdotool mousemove 400 300 click 1 key Escape
fi
dbus-update-activation-environment WAYLAND_DISPLAY XDG_CURRENT_DESKTOP XDG_RUNTIME_DIR XDG_SESSION_TYPE GDK_BACKEND DBUS_SYSTEM_BUS_ADDRESS GSK_RENDERER LP_NUM_THREADS NO_AT_BRIDGE GTK_A11Y
/usr/libexec/xdg-desktop-portal-gnome > /evidence/portal-gnome.log 2>&1 &
/usr/libexec/xdg-desktop-portal > /evidence/portal.log 2>&1 &
sleep 3
kill -0 "$compositor" || { echo 'UNSUPPORTED: compositor exited during portal startup'; exit 20; }
gdbus introspect --session --dest org.freedesktop.portal.Desktop \
  --object-path /org/freedesktop/portal/desktop > /evidence/portal-introspection.txt
if ! grep -q ConnectToEIS /evidence/portal-introspection.txt; then
  echo 'UNSUPPORTED: running public RemoteDesktop portal lacks ConnectToEIS'
  exit 22
fi
echo 'CAPABILITY PRESENT ONLY: consent, capture and actual application delivery are not yet proven.'
if [[ ${WAYLAND_OPERATOR_LAB:-0} == 1 ]]; then
  python3 /harness/wayland-receiver.py > /evidence/receiver.log 2>&1 &
  sleep 1
fi
python3 /harness/wayland-portal.py | tee /evidence/portal-client.jsonl
