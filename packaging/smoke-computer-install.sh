#!/bin/bash
# Run ONLY in a disposable Debian container with an empty writable rootfs.
# Actual APT/dpkg/pip hooks run; systemd service calls are recorded, not executed.
# Desktop smoke uses the real fixed bwrap profile, with a private Xvfb, not host
# sockets. Docker must allow nested user namespaces and private proc mounts:
# --security-opt seccomp=unconfined --security-opt apparmor=unconfined
# --security-opt systempaths=unconfined (no --privileged or host devices needed).
set -euo pipefail
trap 'echo "PACKAGE_SMOKE_FAILURE line=$LINENO command=$BASH_COMMAND" >&2' ERR
test -f /.dockerenv
test "${ODIN_PACKAGE_SMOKE_DISPOSABLE:-}" = yes
test ! -e /opt/odin
test ! -e /etc/odin
test "$(id -u)" = 0
package=${1:?absolute path to a test .deb}
mode=${2:-headless}
case "$mode" in headless|desktop) ;; *) exit 64 ;; esac
export DEBIAN_FRONTEND=noninteractive
assert_unavailable() {
    # `! command -v ...` is exempt from errexit; it does not assert absence.
    if command -v "$1"; then
        echo "Unexpected installed desktop command: $1" >&2
        exit 1
    fi
}
mkdir -p /usr/local/bin
cat > /usr/local/bin/systemctl <<'EOF'
#!/bin/sh
echo "$*" >> /tmp/package-systemctl.trace
case "$1" in
  is-active) test -f /tmp/package-active ;;
  stop) rm -f /tmp/package-active ;;
  restart) touch /tmp/package-active ;;
esac
EOF
chmod 0755 /usr/local/bin/systemctl
export PATH=/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
apt-get update -qq
# debian:*-slim deliberately excludes /usr/share/doc from package extraction.
# Include just this operator handoff so its packaged paths are exercised too.
printf 'path-include=/usr/share/doc/odin/*\n' > /etc/dpkg/dpkg.cfg.d/zz-odin-smoke-docs
# dpkg sanitizes PATH for maintainer scripts, so a /usr/local/bin-only stub is
# insufficient. Divert only inside this disposable container after systemd lands.
apt-get install -y --no-install-recommends systemd
dpkg-divert --local --rename --add /usr/bin/systemctl
cp /usr/local/bin/systemctl /usr/bin/systemctl
# Optional pre-computer package exercises APT's upgrade dependency resolution,
# not just reinstalling a package that already had every new recommendation.
if [ -n "${ODIN_LEGACY_PACKAGE:-}" ]; then
    # Legacy packaging assumed sudo without declaring it. Establish that old
    # prerequisite so this case measures upgrade, not its unrelated old failure.
    apt-get install -y --no-install-recommends sudo
    apt-get install -y --no-install-recommends "$ODIN_LEGACY_PACKAGE"
    test ! -e /var/lib/odin/computer
    assert_unavailable Xvfb
    legacy_config=$(sha256sum /etc/odin/config.yml | cut -d' ' -f1)
    touch /tmp/package-active
fi
if [ "$mode" = headless ]; then
    apt-get install -y --no-install-recommends "$package"
else
    apt-get install -y "$package"
fi
stat -c '%a:%U:%G %n' /var/lib/odin/computer /usr/libexec/odin-computer-wayland-input
test "$(stat -c '%a:%U' /var/lib/odin/computer)" = 700:odin
if [ -n "${ODIN_LEGACY_PACKAGE:-}" ]; then
    test -e /tmp/package-active
    test "$legacy_config" = "$(sha256sum /etc/odin/config.yml | cut -d' ' -f1)"
else
    test ! -e /tmp/package-active
fi
test "$(stat -c '%a:%U:%G' /usr/libexec/odin-computer-wayland-input)" = 755:root:root
test -f /usr/share/gnome-shell/extensions/odin-scope@calmingstorm.net/extension.js
test -f /usr/share/doc/odin/computer-use/PACKAGING.md
/opt/odin/.venv/bin/python -I -c \
    'import PIL, Xlib, dbus_next; from importlib.resources import files; assert files("src.computer.runtime").joinpath("assets/services/org.a11y.Bus.service").is_file()'
if [ "$mode" = headless ]; then
    for tool in Xvfb bwrap xdotool openbox inkscape gnome-shell; do
        assert_unavailable "$tool"
    done
else
    for tool in Xvfb bwrap xdotool openbox drawing inkscape libreoffice; do
        command -v "$tool"
    done
    /usr/bin/python3 -c 'import Xlib, gi; gi.require_version("Atspi", "2.0"); gi.require_version("Gtk", "3.0"); gi.require_version("Gst", "1.0"); gi.require_version("GstApp", "1.0"); from gi.repository import Atspi, Gtk, Gst, GstApp'
    status=0
    /usr/libexec/odin-computer-wayland-input || status=$?
    test "$status" -eq 64
    assert_unavailable gnome-shell
    timeout 90 /opt/odin/.venv/bin/python -I \
        "$(dirname "$0")/smoke-computer-runtime.py"
fi
# A fresh install must actually start. systemctl is stubbed above, so run the
# unit's ExecStart as systemd would and wait for the loopback setup UI. Without
# this, a shipped template that could not load (a required ${VAR} inside a
# comment, v3.78.0 to v4.27.5) crash-looped every fresh install unnoticed.
if [ -z "${ODIN_LEGACY_PACKAGE:-}" ]; then
    (
        cd /opt/odin
        set -a
        . /etc/odin/.env
        set +a
        exec setpriv --reuid=odin --regid=odin --init-groups env \
            HOME="$(getent passwd odin | cut -d: -f6)" \
            ODIN_ENV_FILE=/etc/odin/.env \
            PLAYWRIGHT_BROWSERS_PATH=/opt/odin/.cache/ms-playwright \
            ODIN_INITIALIZATION_STATE=/var/lib/odin/initialization/state.json \
            /opt/odin/.venv/bin/python -m src /etc/odin/config.yml \
            --env-file /etc/odin/.env \
            --initialization-state /var/lib/odin/initialization/state.json
    ) > /tmp/odin-first-start.log 2>&1 &
    odin_pid=$!
    setup=''
    for _ in $(seq 1 120); do
        kill -0 "$odin_pid" 2>/dev/null || break
        setup=$(/opt/odin/.venv/bin/python -I -c 'import urllib.request; print(urllib.request.urlopen("http://127.0.0.1:3000/api/setup/status", timeout=2).read().decode())' 2>/dev/null) && break
        sleep 1
    done
    kill "$odin_pid" 2>/dev/null || true
    for _ in $(seq 1 30); do kill -0 "$odin_pid" 2>/dev/null || break; sleep 1; done
    kill -KILL "$odin_pid" 2>/dev/null || true
    wait "$odin_pid" 2>/dev/null || true
    if [ -z "$setup" ]; then
        tail -n 40 /tmp/odin-first-start.log >&2
        echo "Odin's first start never served /api/setup/status" >&2
        exit 1
    fi
    /opt/odin/.venv/bin/python -I -c 'import json, sys; status = json.loads(sys.argv[1]); assert status["needed"] is True, status' "$setup"
    echo "first start served setup: $setup"
fi
# Reinstallation exercises the actual upgrade hook and prior running state.
printf 'package smoke evidence\n' > /var/lib/odin/computer/receipt
before=$(sha256sum /etc/odin/config.yml | cut -d' ' -f1)
touch /tmp/package-active
dpkg -i "$package"
test -f /tmp/package-active
test "$(stat -c '%a:%U' /var/lib/odin/computer)" = 700:odin
test "$(cat /var/lib/odin/computer/receipt)" = 'package smoke evidence'
test "$before" = "$(sha256sum /etc/odin/config.yml | cut -d' ' -f1)"
test ! -e /var/lib/odin/.package-service-state
grep '^restart odin.service$' /tmp/package-systemctl.trace
if [ "$mode" = desktop ]; then
    timeout 90 /opt/odin/.venv/bin/python -I \
        "$(dirname "$0")/smoke-computer-runtime.py"
fi
printf 'PACKAGE_SMOKE_PASS mode=%s install+first-start+reinstall imports assets state ownership no-host-desktop-activation\n' "$mode"
