FROM localhost/odin-wayland-feasibility:r1
USER 0
RUN apt-get update && apt-get install -y --no-install-recommends \
    xvfb xdotool imagemagick python3-pyatspi at-spi2-core gedit gstreamer1.0-tools gstreamer1.0-pipewire \
    gstreamer1.0-plugins-base gir1.2-gstreamer-1.0 gir1.2-gst-plugins-base-1.0 \
    && rm -rf /var/lib/apt/lists/*
COPY wayland-ei.c /tmp/wayland-ei.c
RUN gcc -Wall /tmp/wayland-ei.c -o /usr/local/bin/wayland-ei $(pkg-config --cflags --libs libei-1.0) && rm /tmp/wayland-ei.c
COPY wayland-owned-input.c /tmp/wayland-owned-input.c
RUN gcc -std=c11 -D_DEFAULT_SOURCE -Wall -Wextra -Werror /tmp/wayland-owned-input.c -o /usr/local/bin/wayland-owned-input $(pkg-config --cflags --libs libei-1.0) && gcc -std=c11 -D_DEFAULT_SOURCE -DWAYLAND_FIXTURE_FAULTS -Wall -Wextra -Werror /tmp/wayland-owned-input.c -o /usr/local/bin/wayland-owned-input-fault-fixture $(pkg-config --cflags --libs libei-1.0) && rm /tmp/wayland-owned-input.c
USER 1003:1003
