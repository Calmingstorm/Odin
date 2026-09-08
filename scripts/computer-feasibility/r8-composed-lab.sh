#!/bin/bash
# Owned disposable target plus inner production bwrap qualifier. Never host GUI.
set -euo pipefail
here=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
[[ ${1:-} == --isolated-production-composition ]] || exit 64
image=${2:?}
[[ $image == localhost/odin-wayland-composed:* ]] || exit 64
evidence=${3:?}
source "$here/evidence-path.sh"
new_evidence_path "$evidence" r8-composed- || exit 64
mkdir -m 700 -- "$evidence"
if [[ $(id -u) == 0 ]]; then chown 1003:1003 "$evidence"; fi
[[ $(stat -c %u "$evidence") == 1003 ]] || exit 64
name="odin-r8-composed-$(date -u +%Y%m%dT%H%M%S)-$$"
label="odin.wayland.composed=$name"
cli= census=
printf '%s\n' "$name" > "$evidence/owned-name"
printf '%s\n' "$$" > "$evidence/supervisor.pid"
date -u --iso-8601=ns > "$evidence/host-start.utc"
python3 "$here/wayland-process-ledger.py" snapshot "$evidence/host-before.json"
cleanup() {
  original=$?
  trap - EXIT INT TERM
  set +e
  failure=0
  resolved=$(docker container ls -aq --no-trunc --filter "name=^/${name}$" --filter "label=$label")
  if (( $? != 0 )); then failure=1
  elif [[ -n $resolved ]]; then
    if [[ $resolved == *$'\n'* ]]; then failure=1
    else
      docker inspect "$resolved" > "$evidence/container-before-cleanup.json" 2>> "$evidence/cleanup.log" || failure=1
      docker stop --time 3 "$resolved" >> "$evidence/cleanup.log" 2>&1 || failure=1
      if [[ -n $cli ]]; then wait "$cli"; fi
      docker rm "$resolved" >> "$evidence/cleanup.log" 2>&1 || failure=1
    fi
  fi
  if [[ -n $cli ]]; then wait "$cli" 2>/dev/null; fi
  if [[ -n $census ]]; then touch "$evidence/census-stop"; wait "$census" || failure=1; fi
  remaining=$(docker container ls -aq --no-trunc --filter "name=^/${name}$")
  if (( $? != 0 )) || [[ -n $remaining ]]; then failure=1
  else echo "EXACT_CONTAINER_ABSENT $name" >> "$evidence/cleanup.log"; fi
  python3 "$here/wayland-process-ledger.py" verify "$evidence" >> "$evidence/cleanup.log" 2>&1 || failure=1
  date -u --iso-8601=ns > "$evidence/host-end.utc"
  printf 'original_exit=%s cleanup_failure=%s\n' "$original" "$failure" >> "$evidence/cleanup.log"
  (( failure == 0 )) || exit 70
  exit "$original"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
docker image inspect "$image" > "$evidence/image.json"
# Inner bwrap needs namespaces/private /proc. Relax only this disposable container.
docker create --init --name "$name" --label "$label" --cidfile "$evidence/container.cid" \
  --network=none --ipc=private --cgroupns=private \
  --user=1003:1003 --cap-drop=ALL --security-opt=no-new-privileges --read-only \
  --security-opt=seccomp=unconfined --security-opt=apparmor=unconfined --security-opt=systempaths=unconfined \
  --memory=2g --memory-swap=2g --cpus=3 --pids-limit=512 \
  --tmpfs /tmp:rw,size=768m,mode=1777 \
  --env=DISPLAY= --env=WAYLAND_DISPLAY= --env=DBUS_SESSION_BUS_ADDRESS= \
  --mount "type=bind,src=$here,dst=/harness,readonly" \
  --mount "type=bind,src=$evidence,dst=/evidence" \
  "$image" timeout --signal=TERM --kill-after=3 360 \
  bash -c 'mkdir -m 700 -p /tmp/home /tmp/runtime; exec dbus-run-session -- bash /harness/r8-composed-session.sh' > "$evidence/create.stdout"
docker inspect "$name" > "$evidence/container-created.json"
docker start --attach "$name" &
cli=$!
printf '%s\n' "$cli" > "$evidence/attach-client.pid"
sleep 1
docker inspect "$name" > "$evidence/container-running.json"
root_pid=$(docker inspect --format '{{.State.Pid}}' "$name")
full_id=$(docker inspect --format '{{.Id}}' "$name")
python3 "$here/wayland-process-ledger.py" watch "$evidence" "$root_pid" "$full_id" &
census=$!
if docker top "$name" -eo pid,ppid,stat,comm > "$evidence/owned-host-processes.txt"; then
  python3 "$here/wayland-process-ledger.py" identities "$evidence/owned-host-processes.txt" "$evidence/owned-identities.json"
fi
wait "$cli"
