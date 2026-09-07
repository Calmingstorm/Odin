#!/bin/bash
# No host desktop discovery. prepare never starts a compositor or session bus.
set -euo pipefail
here=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
image=localhost/odin-wayland-feasibility:r1
case ${1:-} in
  prepare-operator)
    exec docker build --tag localhost/odin-wayland-operator:r1 \
      --file "$here/wayland-operator.Containerfile" "$here"
    ;;
  prepare)
    exec podman --cgroup-manager=cgroupfs build --tag "$image" \
      --file "$here/wayland.Containerfile" "$here"
    ;;
  versions)
    exec podman --cgroup-manager=cgroupfs run --rm --network=none \
      --cap-drop=all --security-opt=no-new-privileges --read-only \
      --env=DISPLAY= --env=WAYLAND_DISPLAY= --env=DBUS_SESSION_BUS_ADDRESS= \
      "$image" dpkg-query -W gnome-shell libmutter-14-0 \
      xdg-desktop-portal xdg-desktop-portal-gnome libei1 libeis1 \
      pipewire wireplumber xwayland libgtk-3-0t64
    ;;
  experiment)
    # This literal flag is an intentional human/parent authorization boundary,
    # not a proof of independent input. Do not pass it during preparation.
    [[ ${2:-} == --parent-authorized-after-contract-correction ]] || {
      echo 'Refusing experiment: explicit parent go after contract correction required.' >&2
      exit 64
    }
    evidence=${3:?Provide new absolute evidence directory below /home/odin/tmp}
    [[ $evidence == /home/odin/tmp/wayland-* && ! -e $evidence ]] || exit 64
    mkdir -m 700 -- "$evidence"
    # keep-id maps this process to the image's unprivileged UID. No host devices,
    # home, session sockets, network, or host IPC/PID namespaces are exposed.
    exec podman --cgroup-manager=cgroupfs run --rm \
      --name "odin-wayland-r1-$$" --network=none --ipc=private --pid=private \
      --userns=keep-id:uid=1003,gid=1003 --user=1003:1003 \
      --cap-drop=all --security-opt=no-new-privileges --read-only \
      --memory=1g --cpus=1 --pids-limit=128 \
      --tmpfs /tmp:rw,size=512m,mode=1777 \
      --env=DISPLAY= --env=WAYLAND_DISPLAY= --env=DBUS_SESSION_BUS_ADDRESS= \
      --mount "type=bind,src=$here,dst=/harness,ro=true" \
      --mount "type=bind,src=$evidence,dst=/evidence,rw=true" \
      "$image" timeout --signal=TERM --kill-after=3 240 \
      bash -c 'mkdir -m 700 -p /tmp/home /tmp/runtime; exec dbus-run-session -- bash /harness/wayland-session.sh'
    ;;
  import-docker)
    # Existing daemon only; imports our single image, no daemon/config changes.
    podman --cgroup-manager=cgroupfs save "$image" | docker load
    ;;
  experiment-docker|experiment-operator)
    [[ ${2:-} == --parent-authorized-after-contract-correction ]] || exit 64
    evidence=${3:?Provide new absolute evidence directory below /home/odin/tmp}
    [[ $evidence == /home/odin/tmp/wayland-* && ! -e $evidence ]] || exit 64
    mkdir -m 700 -- "$evidence"
    # Existing rootful daemon; workload is an unprivileged UID with no caps.
    # This path enforces resource ceilings despite absent rootless delegation.
    operator=0
    if [[ $1 == experiment-operator ]]; then
      image=localhost/odin-wayland-operator:r1
      operator=1
    fi
    exec docker run --rm --name "odin-wayland-r1-$$" \
      --network=none --ipc=private --cgroupns=private \
      --user="$(id -u):$(id -g)" --cap-drop=ALL \
      --security-opt=no-new-privileges --read-only \
      --memory=1g --memory-swap=1g --cpus=1 --pids-limit=128 \
      --tmpfs /tmp:rw,size=512m,mode=1777 \
      --env="WAYLAND_OPERATOR_LAB=$operator" \
      --env=DISPLAY= --env=WAYLAND_DISPLAY= --env=DBUS_SESSION_BUS_ADDRESS= \
      --mount "type=bind,src=$here,dst=/harness,readonly" \
      --mount "type=bind,src=$evidence,dst=/evidence" \
      "$image" timeout --signal=TERM --kill-after=3 240 \
      bash -c 'mkdir -m 700 -p /tmp/home /tmp/runtime; exec dbus-run-session -- bash /harness/wayland-session.sh'
    ;;
  *) echo 'Usage: wayland-lab.sh prepare[-operator]|versions|import-docker|experiment[-docker|-operator] --parent-authorized-after-contract-correction /home/odin/tmp/wayland-NEW' >&2; exit 64 ;;
esac
