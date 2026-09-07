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


def main(args):
    mode = args[0]
    if mode == 'snapshot':
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
                      note='New global helpers are unattributed, possibly concurrent work; no ownership inferred or repair attempted.')
        write(evidence / 'host-cleanup.json', report)
        print(json.dumps(report))
        return int(bool(residual or new_helpers or errors or not baseline_complete
                        or pathlib.Path(str(identities) + '.errors.json').exists()))
    else:
        return 64
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
