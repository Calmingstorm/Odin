#!/bin/bash
set -euo pipefail
[[ -f /.dockerenv && $HOME == /tmp/home && $XDG_RUNTIME_DIR == /tmp/runtime ]]
[[ ${DBUS_SESSION_BUS_ADDRESS:-} == unix:* ]]
mkdir -m 700 -p "$HOME" "$XDG_RUNTIME_DIR" "$XDG_CONFIG_HOME" /tmp/work
ulimit -c 0
export DBUS_SYSTEM_BUS_ADDRESS
DBUS_SYSTEM_BUS_ADDRESS=$(dbus-daemon --session --fork --print-address)
export XDG_SESSION_TYPE=wayland GDK_BACKEND=wayland LP_NUM_THREADS=2 OMP_NUM_THREADS=1
export MAGICK_THREAD_LIMIT=1 GSK_RENDERER=cairo NO_AT_BRIDGE=0 GTK_A11Y=atspi
export GSETTINGS_BACKEND=keyfile
export PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=/work
gsettings set org.gnome.shell enabled-extensions "['odin-scope@calmingstorm.net']"
gsettings set org.gnome.shell disable-user-extensions false
exec > >(tee /evidence/session.log) 2>&1
date --iso-8601=seconds
id
cp /opt/r8-package-evidence/composed-source.sha256 /evidence/
cp /opt/r8-package-evidence/composed-packages.tsv /evidence/
pipewire > /evidence/pipewire.log 2>&1 &
wireplumber > /evidence/wireplumber.log 2>&1 &
unset DISPLAY
gnome-shell --wayland --headless --no-x11 --virtual-monitor 1280x900 > /evidence/compositor.log 2>&1 &
compositor=$!
for ((i=0; i<100; i++)); do
  kill -0 "$compositor" || exit 20
  for socket in "$XDG_RUNTIME_DIR"/wayland-*; do
    if [[ -S $socket ]]; then export WAYLAND_DISPLAY=${socket##*/}; break 2; fi
  done
  sleep .1
done
[[ -n ${WAYLAND_DISPLAY:-} ]] || exit 21
sleep 2
python3 /harness/wayland-r8-identity.py "$compositor" native-headless /evidence/compositor-identity.json
gdbus call --session --dest org.gnome.Shell.Extensions.OdinScope --object-path /org/gnome/Shell/Extensions/OdinScope --method org.gnome.Shell.Extensions.OdinScope.Identity aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa > /evidence/scope-identity.txt
dbus-update-activation-environment WAYLAND_DISPLAY XDG_CURRENT_DESKTOP XDG_RUNTIME_DIR XDG_SESSION_TYPE GDK_BACKEND DBUS_SYSTEM_BUS_ADDRESS GSK_RENDERER LP_NUM_THREADS NO_AT_BRIDGE GTK_A11Y
/usr/libexec/xdg-desktop-portal-gnome > /evidence/portal-gnome.log 2>&1 &
sleep 2
/usr/libexec/xdg-desktop-portal > /evidence/portal.log 2>&1 &
sleep 3
gdbus introspect --session --dest org.freedesktop.portal.Desktop --object-path /org/freedesktop/portal/desktop > /evidence/portal-introspection.txt
grep -q ConnectToEIS /evidence/portal-introspection.txt
# Operator opens an existing EMPTY scratch SVG. No shapes or save result seeded.
# A normal Ctrl+S saves this existing document without a refused file dialog.
printf '%s\n' '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600"></svg>' > /tmp/work/r8-composed-scratch.svg
inkscape /tmp/work/r8-composed-scratch.svg > /evidence/inkscape.log 2>&1 &
printf '%s\n' "$!" > /evidence/inkscape.pid
sleep 5
python3 /harness/wayland-r8-consent.py escape > /evidence/operator-escape.log 2>&1
python3 /harness/r8-composed-controller.py
