#!/bin/bash
# Disposable Docker fixture only. Never discovers a host desktop or bus.
set -euo pipefail
here=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
image=localhost/odin-wayland-feasibility:r1
case ${1:-} in
  prepare-operator)
    exec docker build --tag localhost/odin-wayland-operator:r1 \
      --file "$here/wayland-operator.Containerfile" "$here" ;;
  prepare|versions|experiment|import-docker)
    echo 'Podman paths suspended: host-helper cleanup must be resolved explicitly.' >&2
    exit 64 ;;
  experiment-docker|experiment-operator|experiment-lifecycle|experiment-guardian|experiment-baseline|experiment-fixed|experiment-guardian-fixed) ;;
  *) echo 'Usage: wayland-lab.sh prepare-operator|experiment-{docker,operator,lifecycle,guardian,baseline,fixed,guardian-fixed} --parent-authorized-after-contract-correction /home/odin/tmp/wayland-NEW' >&2; exit 64 ;;
esac
[[ ${2:-} == --parent-authorized-after-contract-correction ]] || exit 64
evidence=${3:?Provide new absolute evidence directory below /home/odin/tmp}
[[ $evidence == /home/odin/tmp/wayland-* && $evidence != *'/../'* && ! -e $evidence ]] || exit 64
[[ $(dirname -- "$evidence") == /home/odin/tmp ]] || exit 64
mkdir -m 700 -- "$evidence"
if [[ $(id -u) == 0 ]]; then chown 1003:1003 "$evidence"; fi
[[ $(stat -c %u "$evidence") == 1003 ]] || { echo 'Evidence must be owned/writable by fixture UID1003' >&2; exit 64; }
name="odin-wayland-r2-$(date -u +%Y%m%dT%H%M%S)-$$"
label="odin.wayland.fixture=$name"
cli= census= cleanup_done=0
printf '%s\n' "$name" > "$evidence/owned-name"
printf '%s\n' "$$" > "$evidence/supervisor.pid"
date -u --iso-8601=ns > "$evidence/host-start.utc"
python3 "$here/wayland-process-ledger.py" snapshot "$evidence/host-before.json"

cleanup() {
  original=$?
  (( cleanup_done == 0 )) || return
  cleanup_done=1
  trap - EXIT INT TERM
  set +e
  failure=0
  # Create can be interrupted after the daemon committed but before stdout/cidfile.
  # Discover only our exact name AND verify the ownership label.
  resolved=$(docker container ls -aq --no-trunc --filter "name=^/${name}$" --filter "label=$label")
  query_rc=$?
  if (( query_rc != 0 )); then
    echo 'CLEANUP UNKNOWN: daemon inventory failed' >> "$evidence/cleanup.log"
    failure=1
  elif [[ -n $resolved ]]; then
    if [[ $resolved == *$'\n'* ]]; then
      echo 'CLEANUP REFUSED: ambiguous identity' >> "$evidence/cleanup.log"
      failure=1
    else
      docker inspect "$resolved" > "$evidence/container-before-cleanup.json" 2>> "$evidence/cleanup.log"
      if docker top "$resolved" -eo pid,ppid,stat,comm > "$evidence/owned-host-processes-final.txt" 2>> "$evidence/cleanup.log"; then
        python3 "$here/wayland-process-ledger.py" identities "$evidence/owned-host-processes-final.txt" "$evidence/owned-identities.json" || failure=1
      fi
      docker stop --time 3 "$resolved" >> "$evidence/cleanup.log" 2>&1 || failure=1
      if [[ -n $cli ]]; then wait "$cli"; fi
      docker rm "$resolved" >> "$evidence/cleanup.log" 2>&1 || failure=1
    fi
  fi
  # Always reap our foreground attachment process, even on interruption.
  if [[ -n $cli ]]; then wait "$cli" 2>/dev/null; fi
  if [[ -n $census ]]; then
    touch "$evidence/census-stop"
    wait "$census" || failure=1
  fi
  remaining=$(docker container ls -aq --no-trunc --filter "name=^/${name}$")
  if (( $? != 0 )) || [[ -n $remaining ]]; then
    echo 'CLEANUP FAILED: exact container absent not established' >> "$evidence/cleanup.log"
    failure=1
  else
    echo "EXACT_CONTAINER_ABSENT $name" >> "$evidence/cleanup.log"
  fi
  python3 "$here/wayland-process-ledger.py" verify "$evidence" >> "$evidence/cleanup.log" 2>&1 || failure=1
  date -u --iso-8601=ns > "$evidence/host-end.utc"
  printf 'original_exit=%s cleanup_failure=%s\n' "$original" "$failure" >> "$evidence/cleanup.log"
  (( failure == 0 )) || exit 70
  exit "$original"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
operator=0 lifecycle=0 guardian=0 faults=0
if [[ $1 != experiment-docker ]]; then image=localhost/odin-wayland-operator:r1; operator=1; fi
if [[ $1 == experiment-lifecycle ]]; then lifecycle=1; fi
if [[ $1 == experiment-guardian ]]; then lifecycle=1; guardian=1; fi
if [[ $1 == experiment-baseline ]]; then lifecycle=1; image=localhost/odin-wayland-mutter-baseline:r5; fi
if [[ $1 == experiment-fixed ]]; then lifecycle=1; image=localhost/odin-wayland-mutter-fixed:r5; fi
if [[ $1 == experiment-guardian-fixed ]]; then
  lifecycle=1; guardian=1; faults=1; image=localhost/odin-wayland-guardian-fixed:r5
fi
# --init is the fixture's PID1 reaper. The shell waits for the foreground attach
# client and removes only the recorded labelled container. No detached workload.
docker create --init --name "$name" --label "$label" --cidfile "$evidence/container.cid" \
  --network=none --ipc=private --cgroupns=private \
  --user=1003:1003 --cap-drop=ALL --security-opt=no-new-privileges --read-only \
  --memory=1g --memory-swap=1g --cpus=1 --pids-limit=128 \
  --tmpfs /tmp:rw,size=512m,mode=1777 \
  --env="WAYLAND_OPERATOR_LAB=$operator" --env="WAYLAND_LIFECYCLE_LAB=$lifecycle" \
  --env="WAYLAND_GUARDIAN_LAB=$guardian" \
  --env="WAYLAND_GUARDIAN_FAULTS=$faults" \
  --env=DISPLAY= --env=WAYLAND_DISPLAY= --env=DBUS_SESSION_BUS_ADDRESS= \
  --mount "type=bind,src=$here,dst=/harness,readonly" \
  --mount "type=bind,src=$evidence,dst=/evidence" \
  "$image" timeout --signal=TERM --kill-after=3 240 \
  bash -c 'mkdir -m 700 -p /tmp/home /tmp/runtime; exec dbus-run-session -- bash /harness/wayland-session.sh' \
  > "$evidence/create.stdout"
docker inspect "$name" > "$evidence/container-created.json"
docker start --attach "$name" &
cli=$!
printf '%s\n' "$cli" > "$evidence/attach-client.pid"
sleep 1
docker inspect "$name" > "$evidence/container-running.json"
if [[ $guardian == 1 || $1 == experiment-baseline || $1 == experiment-fixed ]]; then
  root_pid=$(docker inspect --format '{{.State.Pid}}' "$name")
  full_id=$(docker inspect --format '{{.Id}}' "$name")
  python3 "$here/wayland-process-ledger.py" watch "$evidence" "$root_pid" "$full_id" &
  census=$!
fi
if docker top "$name" -eo pid,ppid,stat,comm > "$evidence/owned-host-processes.txt"; then
  python3 "$here/wayland-process-ledger.py" identities "$evidence/owned-host-processes.txt" "$evidence/owned-identities.json"
fi
wait "$cli"
