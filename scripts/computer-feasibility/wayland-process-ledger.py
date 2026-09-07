"""Read-only host process accounting, never kill/reap an unrelated process."""
import json
import pathlib
import sys
import time


def processes():
    found = {}
    errors = []
    for path in pathlib.Path('/proc').glob('[0-9]*/stat'):
        try:
            text = path.read_text()
            head, tail = text.rsplit(')', 1)
            fields = tail.split()
            pid = int(path.parent.name)
            found[pid] = dict(pid=pid, comm=head.split('(', 1)[1],
                              state=fields[0], ppid=int(fields[1]), start=fields[19])
        except FileNotFoundError:
            # Normal exit race only if the exact proc entry is now absent.
            if path.parent.exists():
                errors.append(dict(path=str(path), error='stat vanished but proc directory remains'))
        except (OSError, ValueError, IndexError) as exc:
            errors.append(dict(path=str(path), error=type(exc).__name__))
    return found, errors


def helpers(all_processes):
    return [v for v in all_processes.values()
            if v['comm'] in ('conmon', 'pause', 'catatonit', 'podman', 'docker', 'docker-init')
            or 'containerd-shim' in v['comm'] or v['state'] == 'Z']


def write(path, value):
    pathlib.Path(path).write_text(json.dumps(value, indent=2) + '\n')


def owned_group_path(rows, container_id):
    """Bind census ownership to daemon-returned full ID, not PID/name alone."""
    if len(container_id) != 64 or any(c not in '0123456789abcdef' for c in container_id):
        raise ValueError('full canonical container ID required')
    row = next(line for line in rows if line.startswith('0::'))
    group = row[3:]
    if group not in ('/system.slice/docker-' + container_id + '.scope',
                     '/docker/' + container_id):
        raise ValueError('process cgroup does not match exact owned Docker ID')
    return group


def watch(evidence, pid, container_id):
    """Exact container cgroup census, not a host-name ownership inference."""
    evidence = pathlib.Path(evidence)
    rows = pathlib.Path('/proc', str(pid), 'cgroup').read_text().splitlines()
    group = owned_group_path(rows, container_id)
    path = pathlib.Path('/sys/fs/cgroup') / group.lstrip('/')
    write(evidence / 'owned-cgroup.json', dict(group=group, path=str(path), root_pid=pid,
                                             container_id=container_id))
    identities = {}
    errors = []
    while path.exists() and not (evidence / 'census-stop').exists():
        for file in [path / 'cgroup.procs', *path.glob('**/cgroup.procs')]:
            try:
                pids = [int(value) for value in file.read_text().split()]
            except FileNotFoundError:
                if file.parent.exists(): errors.append('present cgroup unreadable: ' + str(file))
                continue
            except OSError as exc:
                errors.append(type(exc).__name__ + ': ' + str(file))
                continue
            for current in pids:
                proc = pathlib.Path('/proc', str(current))
                try:
                    head, tail = (proc / 'stat').read_text().rsplit(')', 1)
                    fields = tail.split()
                    item = dict(pid=current, comm=head.split('(', 1)[1],
                                state=fields[0], ppid=int(fields[1]), start=fields[19])
                    identities[(current, item['start'])] = item
                except (FileNotFoundError, ProcessLookupError):
                    if proc.exists(): errors.append('present process unreadable: ' + str(proc))
                except (OSError, ValueError, IndexError) as exc:
                    errors.append(type(exc).__name__ + ': ' + str(proc))
        time.sleep(.02)
    write(evidence / 'census-identities.json', list(identities.values()))
    write(evidence / 'census-errors.json', errors)
    return int(bool(errors))


def main(args):
    mode = args[0]
    if mode == 'watch':
        return watch(args[1], int(args[2]), args[3])
    elif mode == 'snapshot':
        found, errors = processes()
        write(args[1], dict(helpers=helpers(found), complete=not errors, errors=errors))
        return int(bool(errors))
    elif mode == 'identities':
        pids = []
        for line in pathlib.Path(args[1]).read_text().splitlines():
            if line.split() and line.split()[0].isdigit():
                pids.append(int(line.split()[0]))
        all_processes, errors = processes()
        previous = json.loads(pathlib.Path(args[2]).read_text()) if pathlib.Path(args[2]).exists() else []
        identities = {(p['pid'], p['start']): p for p in previous}
        for p in pids:
            if p in all_processes:
                identities[(p, all_processes[p]['start'])] = all_processes[p]
        write(args[2], list(identities.values()))
        if errors:
            write(str(args[2]) + '.errors.json', errors)
            return 1
    elif mode == 'verify':
        evidence = pathlib.Path(args[1])
        baseline = json.loads((evidence / 'host-before.json').read_text())
        # Preserve historical evidence readability, but do not silently turn a
        # legacy inventory without completeness metadata into new proof.
        before = baseline if isinstance(baseline, list) else baseline['helpers']
        baseline_complete = isinstance(baseline, dict) and baseline.get('complete') is True
        identities = evidence / 'owned-identities.json'
        owned = json.loads(identities.read_text()) if identities.exists() else []
        census = evidence / 'census-identities.json'
        if census.exists(): owned += json.loads(census.read_text())
        group_file = evidence / 'owned-cgroup.json'
        group = json.loads(group_file.read_text()) if group_file.exists() else None
        cgroup_absent = not pathlib.Path(group['path']).exists() if group else None
        census_errors = (json.loads((evidence / 'census-errors.json').read_text())
                         if census.exists() else [])
        # Bounded grace for shim shutdown; never infer success from container ls.
        for _ in range(30):
            current, errors = processes()
            residual = [current[p['pid']] for p in owned if p['pid'] in current
                        and p['start'] == current[p['pid']]['start']]
            after = helpers(current)
            old_ids = {(p['pid'], p['start']) for p in before}
            new_helpers = [p for p in after if (p['pid'], p['start']) not in old_ids]
            if not residual and not new_helpers and not errors:
                break
            time.sleep(.1)
        report = dict(owned_residuals=residual, new_helpers=new_helpers,
                      preexisting_helpers=before, after_helpers=after,
                      baseline_complete=baseline_complete, scan_complete=not errors,
                      scan_errors=errors,
                      owned_cgroup_absent=cgroup_absent, census_errors=census_errors,
                      note='New global helpers are unattributed, possibly concurrent work; no ownership inferred or repair attempted.')
        write(evidence / 'host-cleanup.json', report)
        print(json.dumps(report))
        return int(bool(residual or new_helpers or errors or not baseline_complete
                        or cgroup_absent is False or census_errors
                        or pathlib.Path(str(identities) + '.errors.json').exists()))
    else:
        return 64
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
