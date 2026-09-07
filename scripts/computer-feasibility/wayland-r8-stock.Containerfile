FROM docker.io/library/debian:13-slim
ENV DEBIAN_FRONTEND=noninteractive
# Unmodified signed distribution packages, not a locally patched compositor.
# Compiler dependencies build only Odin's sender, not Mutter or libei.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates gnome-shell xdg-desktop-portal xdg-desktop-portal-gnome \
    dbus-daemon dbus-x11 pipewire wireplumber xwayland \
    libei-dev libglib2.0-dev gcc pkg-config python3 python3-gi python3-cairo \
    gir1.2-gtk-3.0 libgtk-3-bin libglib2.0-bin mesa-utils \
    xvfb xdotool imagemagick python3-pyatspi at-spi2-core gedit \
    gstreamer1.0-tools gstreamer1.0-pipewire gstreamer1.0-plugins-base \
    gir1.2-gstreamer-1.0 gir1.2-gst-plugins-base-1.0 \
    && mkdir /opt/r8-package-evidence \
    && dpkg-query -W > /opt/r8-package-evidence/packages.tsv \
    && cp -a /var/lib/apt/lists /opt/r8-package-evidence/apt-lists \
    && rm -rf /var/lib/apt/lists/*
ENV HOME=/tmp/home XDG_RUNTIME_DIR=/tmp/runtime XDG_CONFIG_HOME=/tmp/home/.config \
    XDG_CACHE_HOME=/tmp/home/.cache XDG_DATA_HOME=/tmp/home/.local/share \
    XDG_CURRENT_DESKTOP=GNOME GSETTINGS_BACKEND=memory \
    LIBGL_ALWAYS_SOFTWARE=1 GALLIUM_DRIVER=llvmpipe NO_AT_BRIDGE=1
RUN groupadd --gid 1003 odinlab && useradd --uid 1003 --gid 1003 --no-create-home --home-dir /tmp/home odinlab
USER 1003:1003
WORKDIR /tmp
