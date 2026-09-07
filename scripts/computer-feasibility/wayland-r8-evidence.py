"""Independent receiver evidence and owned-cgroup cleanup, not API success."""
import hashlib
import json
from pathlib import Path
import sys


def rows(path):
    return [json.loads(line) for line in path.read_text().splitlines() if line.startswith('{')]


def analyze(root):
    root = Path(root)
    session = rows(root / 'session.log')
    receiver = rows(root / 'receiver.log')
    trials = json.loads((root / 'lifecycle-driver.json').read_text())
    assert len(trials) == 6 and len({r['mode'] for r in trials}) == 6
    results = []
    for trial in trials:
        mode = trial['mode']
        observation = next(r for r in session if r.get('kind') == 'release_observation' and r['mode'] == mode)
        guardian = rows(root / ('guardian-' + mode + '.jsonl'))
        portal = rows(root / ('portal-' + mode + '.jsonl'))
        start = (next(r for r in portal if r['event'] == 'guardian_controller_trigger')['monotonic']
                 if mode == 'guardian-revoke' else
                 next(r for r in guardian if r['event'] in ('release_begin', 'guardian_loss'))['monotonic_us'] / 1e6)
        before, after = observation['held'], observation['released']
        assert {65505, 65508}.issubset(before['keys'])
        assert before['buttons'] == [1] and before['state'] & 261 == 261
        assert 65505 not in after['keys'] and 65508 in after['keys']
        assert not after['buttons'] and after['state'] & 261 == 4
        events = [r for r in receiver if r['kind'] == 'event' and start <= r['monotonic'] <= after['monotonic']]
        key = next(r for r in events if 'KEY_RELEASE' in r['type'] and r['key'] == 65505)
        button = next(r for r in events if 'BUTTON_RELEASE' in r['type'] and r['button'] == 1)
        assert not any('KEY_RELEASE' in r['type'] and r['key'] == 65508 for r in events)
        survivor = next(r for r in session if r.get('kind') == 'receiver_survived_close' and r['mode'] == mode)
        assert survivor['pid'] == before['pid'] and 'afterclose' + mode in survivor['sample']['text']
        assert any(r['event'] == 'owned_session_closed' for r in portal)
        results.append(dict(mode=mode, key_release_ms=(key['monotonic']-start)*1000,
            button_release_ms=(button['monotonic']-start)*1000, sample_clear_ms=(after['monotonic']-start)*1000,
            receiver_pid=survivor['pid'], human_control_retained=True))
    markers = [r for r in session if r.get('kind') == 'real_application_marker']
    assert len(markers) == 8 and len({r['pid'] for r in markers}) == 1 and all(r['alive'] for r in markers)
    assert not any(r['kind'] == 'telemetry_error' for r in receiver)
    cleanup = json.loads((root / 'host-cleanup.json').read_text())
    assert cleanup['scan_complete'] and cleanup['baseline_complete'] and not cleanup['owned_residuals']
    assert cleanup['owned_cgroup_absent'] and not cleanup['census_errors']
    identity = json.loads((root / 'compositor-identity.json').read_text())
    report = dict(schema=1, trials=results, same_editor_pid=markers[0]['pid'], editor_markers=len(markers),
                  backend=identity['backend'], owned_cleanup_complete=True,
                  new_global_helpers=cleanup['new_helpers'], physical_input_tested=False,
                  complete_production_backend_tested=False)
    (root / 'r8-analysis.json').write_text(json.dumps(report, indent=2) + '\n')
    inventory = {p.name: dict(bytes=p.stat().st_size, sha256=hashlib.sha256(p.read_bytes()).hexdigest())
                 for p in root.iterdir() if p.is_file() and p.name != 'r8-inventory.json'}
    (root / 'r8-inventory.json').write_text(json.dumps(inventory, indent=2) + '\n')
    print(json.dumps(report, indent=2))


if __name__ == '__main__': analyze(sys.argv[1])
