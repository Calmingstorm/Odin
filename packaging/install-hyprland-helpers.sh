#!/bin/sh
# Explicit file installation only. No activation, reload, session or config I/O.
set -eu
if [ "$#" -ne 1 ]; then
    echo "usage: $0 QUALIFIED_BUILD_DIRECTORY (optional DESTDIR staging root)" >&2
    exit 2
fi
build=$1
for name in odin-hyprland-input odin-hyprland-capture odin-hyprland-scope.so; do
    if [ ! -f "$build/$name" ] || [ -L "$build/$name" ] || [ ! -s "$build/$name" ]; then
        echo "missing regular nonempty qualified artifact: $name" >&2
        exit 2
    fi
done
if [ ! -f "$build/build-identity.json" ] || [ -L "$build/build-identity.json" ]; then
    echo "qualified build-identity.json is required; refusing unlabelled plugin" >&2
    exit 2
fi
dest=${DESTDIR:-}
if [ -n "$dest" ]; then
    case "$dest" in /*) ;; *) echo "DESTDIR must be absolute" >&2; exit 2 ;; esac
fi
install -d -m 0755 "$dest/usr/local/libexec" "$dest/usr/local/lib/odin" \
    "$dest/usr/local/share/doc/odin-hyprland"
install -m 0755 "$build/odin-hyprland-input" "$dest/usr/local/libexec/odin-hyprland-input"
install -m 0755 "$build/odin-hyprland-capture" "$dest/usr/local/libexec/odin-hyprland-capture"
install -m 0644 "$build/odin-hyprland-scope.so" "$dest/usr/local/lib/odin/odin-hyprland-scope.so"
install -m 0644 "$build/build-identity.json" \
    "$dest/usr/local/share/doc/odin-hyprland/build-identity.json"
echo "Installed inert helpers. Explicit operator plugin setup and qualification still required."
