FROM localhost/odin-wayland-feasibility:r1
USER 0
RUN apt-get update && apt-get install -y --no-install-recommends \
    xvfb xdotool imagemagick python3-pyatspi at-spi2-core gstreamer1.0-tools gstreamer1.0-pipewire \
    gstreamer1.0-plugins-base gir1.2-gstreamer-1.0 gir1.2-gst-plugins-base-1.0 \
    && rm -rf /var/lib/apt/lists/*
COPY wayland-ei.c /tmp/wayland-ei.c
RUN gcc -Wall /tmp/wayland-ei.c -o /usr/local/bin/wayland-ei $(pkg-config --cflags --libs libei-1.0) && rm /tmp/wayland-ei.c
USER 1003:1003
