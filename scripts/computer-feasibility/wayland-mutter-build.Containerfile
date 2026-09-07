# Contained causal comparison ONLY. Named mutter-src is the unpacked, patched
# Ubuntu source matching the recorded binary; original and one-line fix builds
# use identical options and runtime dependencies. Never install onto the host.
FROM localhost/odin-wayland-operator:r1 AS builder
USER 0
RUN printf 'deb-src http://archive.ubuntu.com/ubuntu noble main universe\ndeb-src http://archive.ubuntu.com/ubuntu noble-updates main universe\ndeb-src http://security.ubuntu.com/ubuntu noble-security main universe\n' > /etc/apt/sources.list.d/odin-source.list && apt-get update && apt-get build-dep -y mutter && apt-get install -y ninja-build
COPY --from=mutter-src / /src
WORKDIR /src
RUN meson setup /build --prefix=/usr --libdir=lib/x86_64-linux-gnu --buildtype=release -Dauto_features=enabled -Degl_device=true -Dremote_desktop=true -Dwayland_eglstream=true -Dlibdisplay_info=disabled -Dtests=false -Dinstalled_tests=false -Dprofiler=false -Ddocs=false && ninja -j2 -C /build && DESTDIR=/stage ninja -C /build install
FROM localhost/odin-wayland-operator:r1
USER 0
COPY --from=builder /stage/usr/lib/x86_64-linux-gnu/libmutter-14.so.0.0.0 /usr/lib/x86_64-linux-gnu/libmutter-14.so.0.0.0
COPY --from=builder /stage/usr/lib/x86_64-linux-gnu/mutter-14/ /usr/lib/x86_64-linux-gnu/mutter-14/
RUN sha256sum /usr/lib/x86_64-linux-gnu/libmutter-14.so.0.0.0 /usr/lib/x86_64-linux-gnu/mutter-14/libmutter-clutter-14.so.0.0.0
USER 1003:1003
