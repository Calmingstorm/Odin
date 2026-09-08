FROM localhost/odin-wayland-input:r8b
USER 0
RUN apt-get update && apt-get install -y --no-install-recommends \
    bubblewrap python3-dbus-next python3-pil inkscape \
    && dpkg-query -W > /opt/r8-package-evidence/composed-packages.tsv \
    && rm -rf /var/lib/apt/lists/*
# Snapshot actual production modules, not mocked transport/evidence.
COPY --from=runtime src /work/src
COPY --from=portal src/computer/runtime/wayland_portal.py /work/src/computer/runtime/wayland_portal.py
COPY --from=runtime assets/wayland-scope /usr/share/gnome-shell/extensions/odin-scope@calmingstorm.net
COPY scripts/computer-feasibility/r8-composed-diagnostics /usr/share/gnome-shell/extensions/odin-composed-diagnostic@private.invalid
COPY --from=probe src/computer/runtime/wayland_probe.py /work/src/computer/runtime/wayland_probe.py
COPY --from=probe src/computer/runtime/assets /work/src/computer/runtime/assets
COPY --from=runtime src/computer/runtime/assets/wayland_owned_input.c /work/src/computer/runtime/assets/wayland_owned_input.c
RUN gcc -std=c11 -D_DEFAULT_SOURCE -Wall -Wextra -Werror \
      /work/src/computer/runtime/assets/wayland_owned_input.c \
      -o /usr/local/bin/wayland-owned-input $(pkg-config --cflags --libs libei-1.0 xkbcommon) -lm \
    && find /work -type f -name '*.pyc' -delete \
    && find /work/src/computer/runtime -name 'wayland*' -type f -exec sha256sum '{}' ';' > /opt/r8-package-evidence/composed-source.sha256 \
    && sha256sum /usr/local/bin/wayland-owned-input \
         /usr/share/gnome-shell/extensions/odin-scope@calmingstorm.net/extension.js \
         /usr/share/gnome-shell/extensions/odin-composed-diagnostic@private.invalid/extension.js \
         >> /opt/r8-package-evidence/composed-source.sha256 \
    && PYTHONPATH=/work python3 -B -c 'from src.computer.runtime.wayland_backend import WaylandRuntimeBackend; from src.computer.runtime.wayland_probe import GnomeSameStackQualifier'
USER 1003:1003
