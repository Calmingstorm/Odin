#!/bin/sh
# Build only. Never connects to a display, installs, or loads the plugin.
set -eu
if [ "$#" -lt 1 ] || [ "$#" -gt 2 ]; then
    echo 'usage: sh scripts/build-hyprland-input.sh ABS_BUILD_DIR [--guardian-only]' >&2
    exit 2
fi
case "$1" in /*) ;; *) echo 'build directory must be absolute' >&2; exit 2 ;; esac
case "${2:-}" in ''|--guardian-only) ;; *) exit 2 ;; esac
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
build=$1
mkdir -p -- "$build"
pkg-config --exists 'wayland-client >= 1.20' xkbcommon
wayland-scanner client-header "$root/assets/hyprland-input/wlr-virtual-pointer-unstable-v1.xml" "$build/wlr-virtual-pointer-client.h"
wayland-scanner private-code "$root/assets/hyprland-input/wlr-virtual-pointer-unstable-v1.xml" "$build/wlr-virtual-pointer-protocol.c"
wayland-scanner client-header "$root/assets/hyprland-input/virtual-keyboard-unstable-v1.xml" "$build/virtual-keyboard-client.h"
wayland-scanner private-code "$root/assets/hyprland-input/virtual-keyboard-unstable-v1.xml" "$build/virtual-keyboard-protocol.c"
${CC:-cc} -std=c11 -O2 -Wall -Wextra -Werror -fstack-protector-strong -D_FORTIFY_SOURCE=2 \
    $(pkg-config --cflags wayland-client xkbcommon) -I"$build" \
    "$root/assets/hyprland-input/guardian.c" "$build/wlr-virtual-pointer-protocol.c" "$build/virtual-keyboard-protocol.c" \
    -o "$build/odin-hyprland-input" $(pkg-config --libs wayland-client xkbcommon) -lm
if [ "${2:-}" = --guardian-only ]; then
    printf '%s\n' "$build/odin-hyprland-input"
    exit 0
fi
sh "$root/scripts/build-hyprland-capture.sh" "$build"
pkg-config --exists 'hyprland = 0.55.2' json-c
# Verify installed development headers, never the active desktop. Exact plugin
# ABI pin must match the headers used by the compiler, not merely pkg-config.
pin=39d7e209c79d451efab1b21151d5938289da838d
actual=$(printf '#include <hyprland/src/version.h>\nGIT_COMMIT_HASH\n' | ${CXX:-c++} -E -P -x c++ $(pkg-config --cflags hyprland) - | tail -n 1 | tr -d '"[:space:]')
if [ "$actual" != "$pin" ]; then
    echo 'Hyprland headers do not match qualified plugin ABI' >&2
    exit 1
fi
# Source identity is independent of scratch paths, not runtime qualification.
build_id=$(cd "$root" && sha256sum scripts/build-hyprland-input.sh \
    assets/hyprland-input/scope-plugin.cpp assets/hyprland-input/scope-deadline.hpp | sha256sum | cut -d ' ' -f 1)
${CXX:-c++} -std=c++23 -shared -fPIC -fno-gnu-unique -O2 -Wall -Wextra -Werror \
    -DODIN_SCOPE_BUILD_ID=\"$build_id\" \
    $(pkg-config --cflags hyprland json-c) "$root/assets/hyprland-input/scope-plugin.cpp" \
    -o "$build/odin-hyprland-scope.so" $(pkg-config --libs json-c)
plugin_sha=$(sha256sum "$build/odin-hyprland-scope.so" | cut -d ' ' -f 1)
plugin_name=odin-hyprland-scope-$plugin_sha.so
if [ -e "$build/$plugin_name" ]; then
    cmp "$build/odin-hyprland-scope.so" "$build/$plugin_name"
else
    cp "$build/odin-hyprland-scope.so" "$build/$plugin_name"
fi
printf '{"schema":1,"hyprland_version":"0.55.2","hyprland_commit":"%s","runtime_qualified":false,"companion_build_id":"%s","plugin_sha256":"%s","plugin_filename":"%s"}\n' "$pin" "$build_id" "$plugin_sha" "$plugin_name" > "$build/build-identity.json"
printf '%s\n' "$build/odin-hyprland-input" "$build/$plugin_name"
