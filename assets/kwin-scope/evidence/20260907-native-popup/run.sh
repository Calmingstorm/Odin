#!/bin/bash
set -uo pipefail
cd /tmp/cu-r11-kwin-menu-20260907T1555
podman --cgroup-manager=cgroupfs run --name cu-r11-kwin-menu-1555 --network=none --ipc=private --pid=private --security-opt label=disable --volume "$PWD:/evidence:rw" localhost/cu-r11-kde-stock:fedora43-kwin6.7.4 bash /evidence/entry.sh > container.log 2>&1
code=$?
podman --cgroup-manager=cgroupfs inspect cu-r11-kwin-menu-1555 --format '{{json .State}}' > container-final-state.json
podman --cgroup-manager=cgroupfs rm -f cu-r11-kwin-menu-1555 > container-remove.log 2>&1
exit "$code"
