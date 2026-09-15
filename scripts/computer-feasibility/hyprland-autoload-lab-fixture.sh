#!/usr/bin/env bash
# Disposable KVM guest fixture only. Never run against a workstation.
set -euo pipefail
test "$(hostname)" = odin-hyprland-lab
test "$(id -u)" = 1000
R=/home/lab/qualification-848de637-test-checkout
P=/home/lab/lab-build/prefix
mkdir -p /home/lab/qualification-evidence /home/lab/qualification-receiver-build
chmod 700 /home/lab/qualification-evidence
export PATH="$P/bin:/usr/bin:/bin"
export PKG_CONFIG_PATH="$P/lib/pkgconfig:$P/lib/x86_64-linux-gnu/pkgconfig:$P/share/pkgconfig"
export LD_LIBRARY_PATH="$P/lib:$P/lib/x86_64-linux-gnu"
wayland-scanner client-header "$P/share/wayland-protocols/stable/xdg-shell/xdg-shell.xml" /home/lab/qualification-receiver-build/xdg-shell-client-protocol.h
wayland-scanner private-code "$P/share/wayland-protocols/stable/xdg-shell/xdg-shell.xml" /home/lab/qualification-receiver-build/xdg-shell-protocol.c
clang-19 -O2 -Wall -Wextra -Werror $(pkg-config --cflags wayland-client) -I/home/lab/qualification-receiver-build "$R/scripts/computer-feasibility/hyprland-wire-receiver.c" /home/lab/qualification-receiver-build/xdg-shell-protocol.c -o /home/lab/qualification-receiver-build/receiver $(pkg-config --libs wayland-client) -lm
cp /home/lab/hyprland-guest.conf /home/lab/qualification-hyprland.conf
cat >>/home/lab/qualification-hyprland.conf <<'CONF'
windowrule {
    name = qualification-receiver-float
    match:class = ^odin-lab-.*$
    float = on
    size = 640 480
    center = on
}
CONF
sudo tee /etc/systemd/system/odin-qualification-compositor.service >/dev/null <<'UNIT'
[Unit]
Description=Disposable guest qualification compositor fixture
After=systemd-user-sessions.service seatd.service
[Service]
User=lab
Group=lab
SupplementaryGroups=video
WorkingDirectory=/home/lab
Environment=XDG_RUNTIME_DIR=/run/user/1000
Environment=LD_LIBRARY_PATH=/home/lab/lab-build/prefix/lib:/home/lab/lab-build/prefix/lib/x86_64-linux-gnu
Environment=PATH=/home/lab/lab-build/prefix/bin:/usr/bin:/bin
Environment=LIBSEAT_BACKEND=seatd
Environment=AQ_DRM_DEVICES=/dev/dri/card0
Environment=XDG_DATA_DIRS=/home/lab/lab-build/prefix/share:/usr/local/share:/usr/share
ExecStart=/usr/bin/dbus-run-session /home/lab/lab-build/prefix/bin/Hyprland --config /home/lab/qualification-hyprland.conf
StandardOutput=append:/home/lab/qualification-evidence/compositor.log
StandardError=append:/home/lab/qualification-evidence/compositor.log
[Install]
WantedBy=multi-user.target
UNIT
sudo loginctl enable-linger lab
sudo systemctl daemon-reload
sudo systemctl enable --now odin-qualification-compositor.service
