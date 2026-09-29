#!/bin/sh
set -eu

config_dir="${ODIN_COMPOSE_CONFIG_DIR:-/app/config}"
legacy_config="${ODIN_COMPOSE_LEGACY_CONFIG:-/app/config.yml}"
target="$config_dir/config.yml"

mkdir -p "$config_dir"
if [ ! -e "$target" ] && [ -f "$legacy_config" ]; then
    # One-time, non-overwriting migration enables atomic config replacement
    # through the writable directory mount without discarding legacy settings.
    cp -p "$legacy_config" "$target"
fi

if [ -f "$target" ]; then
    exec python -m src "$target"
fi
exec python -m src
