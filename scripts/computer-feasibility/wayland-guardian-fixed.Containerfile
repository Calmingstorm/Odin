# Add current guardian (and explicitly separate safe-loss fixture) to the exact
# already-built causal-fixed compositor image. No host installation.
FROM localhost/odin-wayland-mutter-fixed:r5
USER 0
COPY wayland-owned-input.c /tmp/wayland-owned-input.c
RUN gcc -std=c11 -D_DEFAULT_SOURCE -Wall -Wextra -Werror /tmp/wayland-owned-input.c -o /usr/local/bin/wayland-owned-input $(pkg-config --cflags --libs libei-1.0) && gcc -std=c11 -D_DEFAULT_SOURCE -DWAYLAND_FIXTURE_FAULTS -Wall -Wextra -Werror /tmp/wayland-owned-input.c -o /usr/local/bin/wayland-owned-input-fault-fixture $(pkg-config --cflags --libs libei-1.0) && rm /tmp/wayland-owned-input.c
USER 1003:1003
