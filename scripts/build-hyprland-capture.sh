#!/bin/sh
# Build only: no download, installation, service activation, or display access.
set -eu
if [ "$#" -ne 1 ]; then
    echo "usage: sh scripts/build-hyprland-capture.sh ABSOLUTE_BUILD_DIRECTORY" >&2
    exit 2
fi
case "$1" in /*) ;; *) echo 'build directory must be absolute' >&2; exit 2 ;; esac
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
build=$1
mkdir -p -- "$build"
protocol="$root/assets/hyprland-capture/wlr-screencopy-unstable-v1.xml"
command -v wayland-scanner >/dev/null
pkg-config --exists 'wayland-client >= 1.20'
wayland-scanner client-header "$protocol" "$build/screencopy-client.h"
wayland-scanner private-code "$protocol" "$build/screencopy-protocol.c"
# pkg-config produces compiler arguments intentionally split by the shell.
${CC:-cc} -std=c11 -O2 -Wall -Wextra -Werror -Wconversion -Wshadow \
    -fstack-protector-strong -D_FORTIFY_SOURCE=2 \
    $(pkg-config --cflags wayland-client) -I"$build" \
    "$root/assets/hyprland-capture/odin-hyprland-capture.c" \
    "$build/screencopy-protocol.c" -o "$build/odin-hyprland-capture" \
    $(pkg-config --libs wayland-client)
printf '%s\n' "$build/odin-hyprland-capture"
