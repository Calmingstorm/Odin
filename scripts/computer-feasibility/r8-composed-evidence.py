"""Strict artifact/task evidence, separate from startup or input receipts."""
import hashlib
import json
from pathlib import Path
import sys
import xml.etree.ElementTree as ET


def analyze(directory):
    directory = Path(directory)
    rows = [json.loads(line) for line in (directory / 'composition.jsonl').read_text().splitlines()]
    starts = [row['result'] for row in rows if row['kind'] == 'started']
    stops = [row for row in rows if row['kind'] == 'stopped']
    actions = [row for row in rows if row['kind'] == 'action']
    saved = [row for row in rows if row['kind'] == 'saved_artifact']
    if len(starts) != 1 or len(stops) != 1 or len(saved) != 1:
        raise ValueError('complete_single_task_evidence_required')
    started = starts[0]
    admission = started['input_admission']
    if (started['input_supported'] is not True or admission['state'] != 'eligible'
            or admission['probe_scope'] != 'same_stack_disposable'
            or admission['code'] != 'same_stack_button_release_verified'
            or not admission['checks']):
        raise ValueError('actual_production_qualification_required')
    if any(row['kind'] == 'failure' for row in rows):
        raise ValueError('failed_task_not_qualified')
    if [row['label'] for row in actions] != ['rectangle-tool', 'rectangle', 'deselect', 'save']:
        raise ValueError('complete_actual_gui_actions_required')
    for row in actions:
        if row['result']['status'] != 'executed' or row['result']['released'] is not True:
            raise ValueError('execution_and_release_required')
    stop = stops[0]
    if not (stop['task_ok'] and stop['result']['stopped'] and stop['result']['released']):
        raise ValueError('production_cleanup_required')
    data = (directory / 'r8-composed-scratch.svg').read_bytes()
    root = ET.fromstring(data)
    rects = [node for node in root.iter() if node.tag == '{http://www.w3.org/2000/svg}rect'
             and float(node.get('width', '0')) > 0 and float(node.get('height', '0')) > 0]
    if not rects or hashlib.sha256(data).hexdigest() != saved[0]['sha256']:
        raise ValueError('valid_gui_saved_rectangle_required')
    image = directory / 'after-save.png'
    from PIL import Image
    with Image.open(image) as screenshot:
        screenshot.verify()
    cleanup = json.loads((directory / 'host-cleanup.json').read_text())
    if (cleanup['owned_residuals'] or cleanup['new_helpers'] or cleanup['census_errors']
            or not cleanup['baseline_complete'] or not cleanup['scan_complete']
            or cleanup['owned_cgroup_absent'] is not True):
        raise ValueError('exact_owned_cleanup_required')
    return {'passed': True, 'application': 'inkscape',
            'task': 'rectangle and Ctrl+S into operator-opened existing empty scratch SVG',
            'saved_rectangles': len(rects), 'saved_sha256': saved[0]['sha256'],
            'source': admission['compositor'],
            'limit': 'No save-as dialog, new-document creation or reopen is qualified.'}


if __name__ == '__main__':
    print(json.dumps(analyze(sys.argv[1]), sort_keys=True))
