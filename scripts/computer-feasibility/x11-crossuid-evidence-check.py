#!/usr/bin/python3
"""Read-only replay of private privileged-worker evidence and exact cgroup absence."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

path = Path(sys.argv[1])
text = path.read_text()
records = [json.loads(s) for s in text.splitlines() if s.startswith('{')]
trials = [r for r in records if r['kind']=='crossuid-lifecycle-pass']
assert {r['mode'] for r in trials} == {'complete','controller-eof','cancel','timeout','wrapper-death'}
assert len(trials)==5 and len({r['same_app'] for r in trials})==1
for r in trials:
    assert r['receipt']['released'] and r['workers_absent'] and r['receipt']['release_ms']<250
    assert len(r['identities'])==3 and r['identities'][0]['pid'] != r['identities'][1]['pid']
    assert r['recovery']=={'status':'unknown','reason':'owned_input_release_unproven'}
assert len([r for r in records if r['kind']=='crossuid-capture-lifecycle-pass'])==2
assert len([r for r in records if r['kind']=='crossuid-no-input-gate-pass'])==1
actions = [r for r in records if r['kind']=='crossuid-product-pass']
assert len(actions)==5 and all(r['receipt']['released'] and r['receipt']['status']=='executed' for r in actions)
assert any(r['action']=='type' and r['receipt']['postcondition']['actual']['before_sha256'] !=
           r['receipt']['postcondition']['actual']['after_sha256'] for r in actions)
assert any(r['kind']=='CROSSUID_PASS' for r in records)
ledger = json.loads(next(s for s in text.splitlines() if s.startswith('HOST_PROCESS_LEDGER ')).split(' ',1)[1])
assert ledger['identities'] and not ledger['survivors_including_zombies'] and not ledger['monitor_errors']
assert not ledger['cgroup_exists'] and not Path(ledger['cgroup']).exists()
for identity in ledger['identities']:
    try:
        value=Path(f'/proc/{identity["pid"]}/stat').read_text()
        assert int(value[value.rindex(')')+2:].split()[19]) != identity['start_ticks']
    except FileNotFoundError:
        pass
state=subprocess.run(['systemctl','show',ledger['unit'],'-p','ActiveState','-p','ControlGroup'],
                     capture_output=True,text=True)
assert 'ActiveState=inactive' in state.stdout and 'ControlGroup=\n' in state.stdout
print(json.dumps({'pass':True,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),
    'unit':ledger['unit'],'host_identities_rechecked':len(ledger['identities']),
    'release_ms':{r['mode']:r['receipt']['release_ms'] for r in trials}}))
