"""Verifier unit fixtures do not qualify any real desktop."""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path

import pytest
from PIL import Image

SCRIPT = Path(__file__).parents[1] / 'scripts/computer-feasibility/r8-composed-evidence.py'
spec = importlib.util.spec_from_file_location('r8_composed_evidence', SCRIPT)
evidence = importlib.util.module_from_spec(spec)
spec.loader.exec_module(evidence)


@pytest.fixture
def successful_evidence(tmp_path):
    svg = b'<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="20"/></svg>'
    (tmp_path / 'r8-composed-scratch.svg').write_bytes(svg)
    Image.new('RGB', (20, 20), 'white').save(tmp_path / 'after-save.png')
    admission = dict(state='eligible', code='same_stack_button_release_verified',
                     probe_scope='same_stack_disposable', checks=['fixture_only'],
                     compositor={'name': 'fixture_not_real_evidence'})
    rows = [dict(kind='started', result=dict(input_supported=True, input_admission=admission))]
    rows.extend(dict(kind='action', label=label, result=dict(status='executed', released=True))
                for label in ['rectangle-tool', 'rectangle', 'deselect', 'save'])
    rows += [dict(kind='saved_artifact', sha256=hashlib.sha256(svg).hexdigest()),
             dict(kind='stopped', task_ok=True, result=dict(stopped=True, released=True)),
             dict(kind='application_preserved', alive_same_process=True)]
    cleanup = dict(owned_residuals=[], new_helpers=[], census_errors=[],
                   baseline_complete=True, scan_complete=True, owned_cgroup_absent=True)
    (tmp_path / 'host-cleanup.json').write_text(json.dumps(cleanup))

    def save(new_rows=rows):
        (tmp_path / 'composition.jsonl').write_text(
            ''.join(json.dumps(row) + '\n' for row in new_rows))

    save()
    return tmp_path, copy.deepcopy(rows), save


def test_complete_fixture_is_verifier_input_only(successful_evidence):
    root, _, _ = successful_evidence
    result = evidence.analyze(root)
    assert result['saved_rectangles'] == 1
    assert 'operator-opened existing empty' in result['task']
    assert 'reopen' in result['limit']


def test_capture_only_is_not_task_success(successful_evidence):
    root, rows, save = successful_evidence
    rows[0]['result']['input_supported'] = False
    save(rows)
    with pytest.raises(ValueError, match='actual_production_qualification_required'):
        evidence.analyze(root)


def test_logged_failure_remains_failure(successful_evidence):
    root, rows, save = successful_evidence
    rows.append(dict(kind='failure', error='unknown_outcome'))
    save(rows)
    with pytest.raises(ValueError, match='failed_task_not_qualified'):
        evidence.analyze(root)


def test_release_receipt_required(successful_evidence):
    root, rows, save = successful_evidence
    rows[2]['result']['released'] = False
    save(rows)
    with pytest.raises(ValueError, match='execution_and_release_required'):
        evidence.analyze(root)


def test_blank_svg_not_task_success(successful_evidence):
    root, _, _ = successful_evidence
    (root / 'r8-composed-scratch.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg"/>')
    with pytest.raises(ValueError, match='valid_gui_saved_rectangle_required'):
        evidence.analyze(root)


def test_changed_artifact_rejected(successful_evidence):
    root, _, _ = successful_evidence
    with (root / 'r8-composed-scratch.svg').open('ab') as stream:
        stream.write(b'\n')
    with pytest.raises(ValueError, match='valid_gui_saved_rectangle_required'):
        evidence.analyze(root)


def test_missing_final_image_rejected(successful_evidence):
    root, _, _ = successful_evidence
    (root / 'after-save.png').unlink()
    with pytest.raises(FileNotFoundError):
        evidence.analyze(root)


def test_cleanup_residuals_rejected(successful_evidence):
    root, _, _ = successful_evidence
    path = root / 'host-cleanup.json'
    cleanup = json.loads(path.read_text())
    cleanup['owned_residuals'] = [{'pid': 123}]
    path.write_text(json.dumps(cleanup))
    with pytest.raises(ValueError, match='exact_owned_cleanup_required'):
        evidence.analyze(root)


def test_missing_real_app_preservation_rejected(successful_evidence):
    root, rows, save = successful_evidence
    save([row for row in rows if row['kind'] != 'application_preserved'])
    with pytest.raises(ValueError, match='actual_same_application_preserved_required'):
        evidence.analyze(root)
