#!/bin/bash
# R8 stock-package native-headless or nested compositor, container only.
set -euo pipefail
[[ -f /.dockerenv && $HOME == /tmp/home && $XDG_RUNTIME_DIR == /tmp/runtime ]]
[[ ${R8_BACKEND:-} == native-headless || ${R8_BACKEND:-} == nested-x11 ]]
[[ ${DBUS_SESSION_BUS_ADDRESS:-} == unix:* ]]
mkdir -m 700 -p "$HOME" "$XDG_RUNTIME_DIR" "$XDG_CONFIG_HOME" /tmp/work
mkdir -m 1777 /tmp/.X11-unix
ulimit -c 0
export DBUS_SYSTEM_BUS_ADDRESS
DBUS_SYSTEM_BUS_ADDRESS=$(dbus-daemon --session --fork --print-address)
export XDG_SESSION_TYPE=wayland GDK_BACKEND=wayland LP_NUM_THREADS=2 OMP_NUM_THREADS=1
export MAGICK_THREAD_LIMIT=1 GSK_RENDERER=cairo NO_AT_BRIDGE=0 GTK_A11Y=atspi
export GSETTINGS_BACKEND=keyfile
gsettings set org.gnome.shell enabled-extensions "['odin-scope@calmingstorm.net']"
gsettings set org.gnome.shell disable-user-extensions false
export WAYLAND_OPERATOR_LAB=1 WAYLAND_LIFECYCLE_LAB=1 WAYLAND_GUARDIAN_LAB=1 WAYLAND_GUARDIAN_FAULTS=1
exec > >(tee /evidence/session.log) 2>&1
date --iso-8601=seconds
id
dpkg-query -W gnome-shell libmutter-16-0 libei1 libeis1 xdg-desktop-portal xdg-desktop-portal-gnome pipewire wireplumber libgtk-3-0t64
pipewire > /evidence/pipewire.log 2>&1 &
wireplumber > /evidence/wireplumber.log 2>&1 &
if [[ $R8_BACKEND == nested-x11 ]]; then
  export DISPLAY=:77
  Xvfb :77 -screen 0 1280x800x24 -nolisten tcp > /evidence/xvfb.log 2>&1 &
  sleep 1
  gnome-shell --wayland --nested --no-x11 > /evidence/compositor.log 2>&1 &
else
  unset DISPLAY
  gnome-shell --wayland --headless --no-x11 --virtual-monitor 800x600 > /evidence/compositor.log 2>&1 &
fi
compositor=$!
for ((i=0; i<100; i++)); do
  kill -0 "$compositor" || { echo 'Private compositor startup failed'; exit 20; }
  for socket in "$XDG_RUNTIME_DIR"/wayland-*; do
    if [[ -S $socket ]]; then export WAYLAND_DISPLAY=${socket##*/}; break 2; fi
  done
  sleep .1
done
[[ -n ${WAYLAND_DISPLAY:-} ]] || exit 21
sleep 2
python3 /harness/wayland-r8-identity.py "$compositor" "$R8_BACKEND" /evidence/compositor-identity.json
gdbus call --session --dest org.gnome.Shell.Extensions.OdinScope --object-path /org/gnome/Shell/Extensions/OdinScope --method org.gnome.Shell.Extensions.OdinScope.Identity aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa > /evidence/scope-identity.txt
dbus-update-activation-environment WAYLAND_DISPLAY XDG_CURRENT_DESKTOP XDG_RUNTIME_DIR XDG_SESSION_TYPE GDK_BACKEND DBUS_SYSTEM_BUS_ADDRESS GSK_RENDERER LP_NUM_THREADS NO_AT_BRIDGE GTK_A11Y
/usr/libexec/xdg-desktop-portal-gnome > /evidence/portal-gnome.log 2>&1 &
sleep 2
/usr/libexec/xdg-desktop-portal > /evidence/portal.log 2>&1 &
sleep 3
gdbus introspect --session --dest org.freedesktop.portal.Desktop --object-path /org/freedesktop/portal/desktop > /evidence/portal-introspection.txt
grep -q ConnectToEIS /evidence/portal-introspection.txt
python3 /harness/wayland-receiver.py > /evidence/receiver.log 2>&1 &
receiver=$!
printf '%s\n' "$receiver" > /evidence/receiver.pid
sleep 1
python3 /harness/wayland-r8-lifecycle.py
