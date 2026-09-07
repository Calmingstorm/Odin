# R2 correction: container inventory was not process cleanup

Observed at 2026-09-07 00:27–00:31 UTC. No host desktop interaction.

The earlier cleanup statement was too broad. The container inventory checks
were true, but they did not test surviving host-side runtime helpers or zombies.
An inactive systemd fixture unit says nothing about an unrelated Podman helper
living in the parent service's cgroup. Shell exit 0 is not a semantic assertion.

## Exact initial state

| PID | Name | State | Parent PID | Interpretation |
| --- | --- | --- | --- | --- |
| 3326474 | catatonit -P | S | 3254906 | live rootless Podman pause namespace helper |
| 3335865 | conmon | Zs | 3254906 | already exited; unreaped zombie |
| 3336516 | conmon | Zs | 3254906 | already exited; unreaped zombie |
| 3339721 | conmon | Zs | 3254906 | already exited; unreaped zombie |

All are UID1003 (`odin`), parented to the active Odin process. The pause helper
was in `/system.slice/odin.service`, not an experiment unit. It had no children.
Podman container and pod inventories were both empty. Docker had no owned
Wayland fixture containers; unrelated Docker containers were left alone.

## Action and outcome

After preventing concurrent Podman use by the feasibility agents and checking
the empty Podman inventories, ran its supported `podman --cgroup-manager=cgroupfs
system migrate` cleanup. This stopped the namespace helper without deleting
cached images or touching unrelated Docker workloads. PID3326474 became Z;
the three conmon PIDs remained Zs. There are now **no live processes among these
four identities, but all four zombie process-table entries remain**.

The post-action bundle `computer_leftover_cleanup_truth` deliberately returned
**DEGRADED**, not a clean pass: four checks passed (no live work among the recorded
PIDs, no original Wayland Docker containers, Odin still active, operator session
still active); the separate complete-reaping assertion failed.

Only the owning parent can wait/reap these already-adopted children. An external
shell cannot do so; signalling a zombie does not reap it. The development source
of `AdoptedZombieReaper` requires witnessed adoption or explicit prior registration,
not merely zombie age. That explains why a broad inventory is insufficient, but
does not prove the exact live reaper's internal eligibility state. No live
introspection hook, code injection, service restart, or edit was used to force it.
These entries remain a documented cleanup residual, not running containers.

## Revised validation requirements

### R3 recheck, 2026-09-07 00:49 UTC

The four exact reported identities still exist, all in state `Z`/`Zs` under
PID3254906 (the active Odin service), UID1003. They are not running containers or
live helpers. An additional interrupted inventory command, Podman PID3389007,
is also a zombie under that same parent. No signals were sent to the parent,
no code was injected into it, and no restart was performed. A mistaken runtime
directory on a read-only inventory attempt was rejected; it provided no inventory
evidence and was not retried by creating another rootless runtime helper.

Validation `computer_R3_existing_leftovers` is **DEGRADED (4/5)**: no live work
among those identities, no leftover Wayland Docker fixture and service activity
passed; complete reaping failed. The process-state record is a separate check.
Only the owning parent can wait for these children. The inspected development
reaper has positive-provenance requirements and no operator reaping endpoint;
this is not proof of its live internal candidate state. External cleanup cannot
honestly claim complete removal under the no-live-service-change boundary.

Further experiments use owned foreground clients with explicit reaping and
container-local PID1 supervision, not Podman daemonization beneath the live bot.
This prevents adding the same kind of residue; it cannot reap old children owned
by another process. The existing residual remains open until parent-owned reaping
or a separately authorized service lifecycle operation resolves it.

The parent attempted `waitpid(pid, WNOHANG)` for only the five exact inspected
dead identities from a cleanup subprocess. Every call returned ECHILD, confirming
that process cannot reap them. No signal or parent-process modification followed.

- Record exact owned unit/container names and host process identities, including
  process start time, before running. Include the runtime helper owner.
- Assert workload/container removal, unit inactivity and empty cgroup separately.
- Assert no matching live helpers AND no unreaped owned children. Unknown process
  inventory fails closed; an empty name-filter result alone is not full cleanup.
- Keep new daemonizing rootless tools beneath an explicit owned subreaper with
  private runroot/store, wait its children, and stop its pause helper before exit;
  do not adopt arbitrary processes or change the live service reaper policy.
- Existing Docker experiments must wait their foreground CLI, finally stop only
  the unique owned container, and verify exact container and host process absence.
- Record intentional retained artifacts/images separately. No broad process kill,
  container prune, live restart, or destruction of evidence to improve the verdict.

## Dependency ledger

No host packages were installed or upgraded during R2 work as of this correction.
The existing rootless and Docker images/evidence from R1 remain intentionally
cached. Later contained image changes are recorded in FEASIBILITY-WAYLAND.md;
any host installation must be added here with package/version and reversal notes.
