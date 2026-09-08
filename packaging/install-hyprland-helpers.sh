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
plugin_name=$(python3 - "$build" <<'PY'
import hashlib
import json
import pathlib
import re
import sys
try:
    root = pathlib.Path(sys.argv[1])
    identity = json.loads((root / 'build-identity.json').read_text())
    digest = hashlib.sha256((root / 'odin-hyprland-scope.so').read_bytes()).hexdigest()
    name = 'odin-hyprland-scope-' + digest + '.so'
    if (identity['plugin_sha256'] != digest or identity['plugin_filename'] != name
            or not re.fullmatch('[0-9a-f]{64}', identity['companion_build_id'])):
        raise ValueError('identity mismatch')
    artifact = root / name
    if (not artifact.is_file() or artifact.is_symlink()
            or hashlib.sha256(artifact.read_bytes()).hexdigest() != digest):
        raise ValueError('artifact mismatch')
except (OSError, ValueError, KeyError, TypeError):
    print('invalid build identity or versioned plugin artifact', file=sys.stderr)
    sys.exit(2)
print(name)
PY
) || exit 2
if [ -n "$dest" ]; then
    case "$dest" in /*) ;; *) echo "DESTDIR must be absolute" >&2; exit 2 ;; esac
fi
install -d -m 0755 "$dest/usr/local/libexec" "$dest/usr/local/lib/odin" \
    "$dest/usr/local/share/doc/odin-hyprland"
install -m 0755 "$build/odin-hyprland-input" "$dest/usr/local/libexec/odin-hyprland-input"
install -m 0755 "$build/odin-hyprland-capture" "$dest/usr/local/libexec/odin-hyprland-capture"
# Publish with no-clobber hard link. Never overwrite an existing mapped ELF.
target="$dest/usr/local/lib/odin/$plugin_name"
if [ -e "$target" ] || [ -L "$target" ]; then
    [ ! -L "$target" ] && cmp "$build/$plugin_name" "$target" || exit 2
else
    tmp=$(mktemp "$dest/usr/local/lib/odin/.scope.XXXXXXXX")
    trap 'rm -f -- "$tmp"' EXIT HUP INT TERM
    install -m 0644 "$build/$plugin_name" "$tmp"
    ln "$tmp" "$target"
    rm -f -- "$tmp"
    trap - EXIT HUP INT TERM
fi
# Compatibility name is an atomic pointer update, never an ELF write. Loading
# through it is NOT recommended: dlopen may cache this unchanged pathname.
tmpdir=$(mktemp -d "$dest/usr/local/lib/odin/.scope-link.XXXXXXXX")
trap 'rm -rf -- "$tmpdir"' EXIT HUP INT TERM
ln -s "$plugin_name" "$tmpdir/odin-hyprland-scope.so"
mv -Tf "$tmpdir/odin-hyprland-scope.so" "$dest/usr/local/lib/odin/odin-hyprland-scope.so"
rmdir "$tmpdir"
trap - EXIT HUP INT TERM
install -m 0644 "$build/build-identity.json" \
    "$dest/usr/local/share/doc/odin-hyprland/build-identity.json"
echo "Installed inert helpers. Explicit operator plugin setup and qualification still required."
echo "Recommended immutable plugin load path: /usr/local/lib/odin/$plugin_name"
