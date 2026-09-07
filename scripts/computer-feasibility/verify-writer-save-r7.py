#!/usr/bin/env python3
"""Read-only independent Writer ZIP/XML and exact fixture-cleanup verification."""
import argparse
import hashlib
import json
import re
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path


def verify(root, supervisor):
    root = root.resolve(strict=True)
    assert root.parent == Path('/tmp') and root.name.startswith('attached-apps-r6-')
    lines = (root / 'runner.log').read_text().splitlines()
    rows = [json.loads(line) for line in lines if line.startswith('{')]
    ledgers = [json.loads(line.split(' ', 1)[1]) for line in lines
               if line.startswith('HOST_PROCESS_LEDGER ')]
    assert len(ledgers) == 1
    ledger = ledgers[0]
    unit = ledger['unit']
    assert re.fullmatch(r'odin-xi2-feasibility-[a-f0-9]{32}\.service', unit)
    group = Path('/sys/fs/cgroup/system.slice') / unit
    assert ledger['cgroup'] == str(group)
    assert ledger['cgroup_exists'] is False and not group.exists()
    assert ledger['monitor_errors'] == [] and ledger['survivors_including_zombies'] == []
    identities = ledger['identities']
    assert identities
    for original in identities:
        try:
            data = (Path('/proc') / str(original['pid']) / 'stat').read_bytes()
        except FileNotFoundError:
            continue
        assert int(data.rsplit(b') ', 1)[1].split()[19]) != original['start_ticks']
    for filename, key in [('outer.json', 'outer_cleanup'), ('workspace/inner.json', 'cleanup')]:
        value = json.loads((root / filename).read_text())
        assert value[key]['remaining_children'] == 0
        assert value.get('exit_code', 0) == 0 and value.get('passed', True) is True
    owned = json.loads(supervisor.read_text())
    assert owned['primary_returncode'] == 0 and owned['completed'] is True
    assert owned['cleanup_ok'] is True and owned['residuals'] == []
    assert owned['census_complete'] is True and owned['deadline_exceeded'] is False
    refused = [row for row in rows if row['kind'] == 'policy_refused']
    assert {(row['operation'], row['key']) for row in refused} == {
        ('click', None), ('drag', None), ('key', 'ctrl+o'), ('key', 'ctrl+n')}
    assert len(refused) == 4
    assert all(row['reason'] == 'application_task_not_offered'
               and row['native_input_calls'] == 0 for row in refused)
    receipts = [row['receipt'] for row in rows if row['kind'] == 'native_receipt']
    assert len(receipts) == 9
    assert all(r['status'] == 'executed' and r['injected'] and r['released'] for r in receipts)
    assert not any(row['kind'] in {'failure', 'native_error'} for row in rows)
    completed = [row for row in rows if row['kind'] == 'task_complete']
    assert len(completed) == 1
    assert completed[0]['reopened'] is False and completed[0]['close_reopen'] == 'not_offered'
    target = root / 'workspace/home/result.odt'
    digest = hashlib.sha256(target.read_bytes()).hexdigest()
    assert completed[0]['sha256'] == digest
    with zipfile.ZipFile(target) as archive:
        assert archive.testzip() is None
        assert archive.read('mimetype') == b'application/vnd.oasis.opendocument.text'
        document = ET.fromstring(archive.read('content.xml'))
        styles = ET.fromstring(archive.read('styles.xml'))
    ns = {'text': 'urn:oasis:names:tc:opendocument:xmlns:text:1.0',
          'style': 'urn:oasis:names:tc:opendocument:xmlns:style:1.0',
          'fo': 'urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0'}
    paragraphs = document.findall('.//text:p', ns)
    texts = [''.join(p.itertext()) for p in paragraphs]
    assert texts == ['R6 private note.', 'Save verified.']
    mapping = {s.get('{'+ns['style']+'}name'): s for tree in (document, styles)
               for s in tree.findall('.//style:style', ns)}
    style_name = paragraphs[1].get('{'+ns['text']+'}style-name')
    seen = set()
    while style_name:
        assert style_name not in seen
        seen.add(style_name)
        current = mapping[style_name]
        properties = current.find('style:text-properties', ns)
        weight = None if properties is None else properties.get('{'+ns['fo']+'}font-weight')
        if weight is not None:
            assert weight == 'bold'
            break
        style_name = current.get('{'+ns['style']+'}parent-style-name')
    else:
        raise AssertionError('second paragraph bold inheritance not verified')
    final_frame = root / f"workspace/frame-{completed[0]['final_frame']:03}.png"
    assert final_frame.read_bytes().startswith(b'\x89PNG\r\n\x1a\n')
    return {'result': 'pass', 'task': 'writer_keyboard_note_paragraph_bold_gui_odt_save',
            'gui_reopened': False, 'close_reopen': 'not_offered',
            'artifact': str(target), 'bytes': target.stat().st_size, 'sha256': digest,
            'paragraphs': texts, 'second_paragraph_bold': True,
            'native_dispatches': len(receipts), 'native_released': True,
            'policy_refusals_before_native_input': len(refused),
            'action_statuses': [r['status'] for r in rows if r['kind'] == 'action'],
            'unit': unit, 'sampled_process_identities_absent': len(identities),
            'cgroup_absent': True, 'inner_outer_children_remaining': 0,
            'supervisor_cleanup_ok': True, 'final_frame': str(final_frame)}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('root', type=Path)
    parser.add_argument('supervisor', type=Path)
    args = parser.parse_args()
    print(json.dumps(verify(args.root, args.supervisor), indent=2))
