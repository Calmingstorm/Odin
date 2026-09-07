"""Analyze retained private fixture evidence; never substitutes API for delivery."""
import hashlib
import json
from pathlib import Path
import sys


def rows(path):
    return [json.loads(line) for line in path.read_text().splitlines()
            if line.startswith('{')]


def analyze(root):
    root = Path(root)
    session = rows(root / 'session.log')
    receiver = rows(root / 'receiver.log')
    results = []
    for event in session:
        if event['kind'] != 'release_observation': continue
        mode = event['mode']
        if mode.startswith('guardian-'):
            sender = rows(root / ('guardian-' + mode + '.jsonl'))
            if mode == 'guardian-revoke':
                portal = rows(root / ('portal-' + mode + '.jsonl'))
                start = next(r for r in portal if r['event'] == 'guardian_controller_trigger')['monotonic']
            else:
                begin = next(r for r in sender if r['event'] in ('release_begin', 'guardian_loss'))
                start = begin['monotonic_us'] / 1e6
            held_start = next(r for r in sender if r['event'] == 'held')['monotonic_us'] / 1e6
        else:
            portal = rows(root / ('portal-' + mode + '.jsonl'))
            stdout = next(r for r in portal if r['event'] == 'libei_probe_output')['stdout']
            marker = 'ORDERLY_RELEASE_BEGIN' if mode == 'orderly' else 'CLIENT_EOF_WITH_HELD_INPUT'
            value = next(line for line in stdout.splitlines() if line.startswith(marker))
            start = int(value.split('monotonic_us=')[1]) / 1e6
            held_start = None
        events = [r for r in receiver if r['kind'] == 'event'
                  and start <= r['monotonic'] <= event['released']['monotonic']]
        key = next(r for r in events if 'KEY_RELEASE' in r['type'] and r['key'] == 65505)
        button = next(r for r in events if 'BUTTON_RELEASE' in r['type'] and r['button'] == 1)
        assert not any('KEY_RELEASE' in r['type'] and r['key'] == 65508 for r in events)
        results.append(dict(mode=mode, start=start,
            key_release_ms=(key['monotonic'] - start) * 1000,
            button_release_ms=(button['monotonic'] - start) * 1000,
            sample_clear_ms=(event['released']['monotonic'] - start) * 1000,
            lease_dispatch_delta_ms=(start-held_start)*1000 if held_start else None,
            human_control_retained=True, held=event['held'], released=event['released']))
    samples = [r for r in receiver if r['kind'] == 'sample']
    cleanup = json.loads((root / 'host-cleanup.json').read_text())
    report = dict(trials=results,
        telemetry_errors=[r for r in receiver if r['kind'] == 'telemetry_error'],
        sample_count=len(samples),
        sample_max_gap_ms=max((b['monotonic']-a['monotonic'])*1000 for a,b in zip(samples,samples[1:])),
        same_receiver_post_close=[dict(mode=r['mode'], pid=r['pid'], text=r['sample']['text'])
            for r in session if r['kind'] == 'receiver_survived_close'],
        editor_markers=[dict(pid=r['pid'], marker=r['marker'], alive=r['alive'])
            for r in session if r['kind'] == 'real_application_marker'],
        owned_residuals=cleanup['owned_residuals'], scan_complete=cleanup['scan_complete'],
        cgroup_absent=cleanup.get('owned_cgroup_absent'),
        census_errors=cleanup.get('census_errors'), new_helpers=cleanup['new_helpers'])
    (root / 'r5-analysis.json').write_text(json.dumps(report, indent=2) + '\n')
    inventory = {p.name: dict(bytes=p.stat().st_size, sha256=hashlib.sha256(p.read_bytes()).hexdigest())
                 for p in root.iterdir() if p.is_file() and p.name != 'artifact-inventory.json'}
    (root / 'artifact-inventory.json').write_text(json.dumps(inventory, indent=2) + '\n')
    print(json.dumps(report, indent=2))


if __name__ == '__main__': analyze(sys.argv[1])
