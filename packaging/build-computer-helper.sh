#!/bin/bash
# Build in a Debian 13 builder, never in a maintainer hook or live service.
# Requires gcc, pkg-config, libei-dev >= 1.3.901, libxkbcommon-dev.
set -euo pipefail
cd "$(dirname "$0")/.."
pkg-config --atleast-version=1.3.901 libei-1.0
mkdir -p build/computer
output=build/computer/odin-computer-wayland-input
temporary=$(mktemp build/computer/.guardian.XXXXXXXX)
trap 'rm -f "$temporary"' EXIT
# pkg-config emits compiler/linker words, intentionally split here.
# shellcheck disable=SC2046
cc -std=c11 -O2 -Wall -Wextra -Werror -fPIE -pie \
    -fstack-protector-strong -Wl,-z,relro,-z,now \
    src/computer/runtime/assets/wayland_owned_input.c \
    $(pkg-config --cflags --libs libei-1.0 xkbcommon) -lm -o "$temporary"
chmod 0755 "$temporary"
# This invocation has no fd, portal or display and must reject usage with 64.
status=0
"$temporary" || status=$?
test "$status" -eq 64
mv -f "$temporary" "$output"
sha256sum src/computer/runtime/assets/wayland_owned_input.c "$output"
