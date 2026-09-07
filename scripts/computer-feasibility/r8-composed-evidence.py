"""Strict artifact/task evidence, separate from startup or input receipts."""
import hashlib
import json
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

REQUIRED_CHECKS = {
    'held_button_received', 'held_key_received', 'sole_sender_eof',
    'button_release_received', 'key_release_received', 'same_receiver_fresh_input',
    'private_compositor_survived', 'exact_mapped_stack', 'private_cleanup_reaped',
}


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
            or not REQUIRED_CHECKS.issubset(admission['checks'])):
        raise ValueError('actual_production_qualification_required')
    if any(row['kind'] == 'failure' for row in rows):
        raise ValueError('failed_task_not_qualified')
    if [row['label'] for row in actions] != ['rectangle-tool', 'rectangle', 'deselect', 'save']:
        raise ValueError('complete_actual_gui_actions_required')
    for row in actions:
        if (row['result']['status'] not in {'executed', 'verified', 'not_satisfied'}
                or row['result']['execution']['released'] is not True
                or row['result']['execution']['injected'] is not True
                or row.get('entrypoint') != 'ComputerController.act'):
            raise ValueError('execution_and_release_required')
    controller_stops = [row for row in rows if row['kind'] == 'controller_stopped']
    if len(controller_stops) != 1 or controller_stops[0]['result']['state'] != 'closed':
        raise ValueError('controller_cleanup_required')
    stop = stops[0]
    if not (stop['task_ok'] and stop['result']['stopped'] and stop['result']['released']):
        raise ValueError('production_cleanup_required')
    preserved = [row for row in rows if row['kind'] == 'application_preserved']
    if len(preserved) != 1 or preserved[0]['alive_same_process'] is not True:
        raise ValueError('actual_same_application_preserved_required')
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
