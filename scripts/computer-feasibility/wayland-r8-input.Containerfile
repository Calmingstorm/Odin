FROM localhost/odin-wayland-stock:r8
USER 0
RUN apt-get update && apt-get install -y --no-install-recommends libxkbcommon-dev && rm -rf /var/lib/apt/lists/*
# Required build context: --build-context runtime=<production-runtime-worktree>
COPY --from=runtime src/computer/runtime/assets/wayland_owned_input.c /opt/wayland_owned_input.c
COPY --from=runtime assets/wayland-scope /usr/share/gnome-shell/extensions/odin-scope@calmingstorm.net
RUN gcc -std=c11 -D_DEFAULT_SOURCE -Wall -Wextra -Werror /opt/wayland_owned_input.c -o /usr/local/bin/wayland-owned-input $(pkg-config --cflags --libs libei-1.0 xkbcommon) -lm \
    && gcc -std=c11 -D_DEFAULT_SOURCE -DWAYLAND_FIXTURE_FAULTS -Wall -Wextra -Werror /opt/wayland_owned_input.c -o /usr/local/bin/wayland-owned-input-fault-fixture $(pkg-config --cflags --libs libei-1.0 xkbcommon) -lm \
    && sha256sum /opt/wayland_owned_input.c /usr/local/bin/wayland-owned-input* > /opt/r8-package-evidence/guardian.sha256
USER 1003:1003
