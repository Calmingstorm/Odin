#!/bin/bash
set -euo pipefail
unset DISPLAY WAYLAND_DISPLAY DBUS_SESSION_BUS_ADDRESS
export XDG_RUNTIME_DIR=/tmp/odin-smoke-runtime
mkdir -m700 "$XDG_RUNTIME_DIR"
export QT_QPA_PLATFORM=wayland LIBGL_ALWAYS_SOFTWARE=1 KWIN_COMPOSE=Q KWIN_DRM_NO_AMS=1
rpm -q kwin kwin-devel qt6-qtbase gtk3 > /evidence/packages.txt
sha256sum /usr/bin/kwin_wayland /usr/lib64/libkwin.so* /evidence/odin-scope.so > /evidence/stack.sha256
mkdir -p /usr/lib64/qt6/plugins/kwin/plugins
cp /evidence/odin-scope.so /usr/lib64/qt6/plugins/kwin/plugins/odin-scope.so
ldd /usr/lib64/qt6/plugins/kwin/plugins/odin-scope.so > /evidence/plugin-ldd.txt
getcap /usr/bin/kwin_wayland > /evidence/kwin-capabilities.txt || true
setcap -r /usr/bin/kwin_wayland
getcap /usr/bin/kwin_wayland > /evidence/kwin-capabilities-after.txt
sha256sum /usr/bin/kwin_wayland > /evidence/kwin-after-capability.sha256
exec python3 /evidence/supervisor.py --deadline 80 --grace 3 --report /evidence/inner-supervisor.json -- dbus-run-session -- python3 /evidence/smoke.py
