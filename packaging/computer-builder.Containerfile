# The qualified distribution's public libraries; never a patched compositor.
FROM debian:13-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libc6-dev pkg-config libei-dev libxkbcommon-dev ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /source
ENTRYPOINT ["bash", "packaging/build-computer-helper.sh"]
