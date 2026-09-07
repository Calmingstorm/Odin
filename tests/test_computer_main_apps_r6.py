"""Standalone process fixtures only. Never access an existing graphical session."""
import importlib.util
import json
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
SUPERVISOR = ROOT / 'scripts/computer-feasibility/owned-test-supervisor-r6.py'
HARNESS = SUPERVISOR.with_name('main-session-app-smoke-r6.py')


def harness_module():
    sys.path.insert(0, str(HARNESS.parent))
    spec = importlib.util.spec_from_file_location('scratch_apps_r6', HARNESS)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_svg_semantic_validation_no_external_entities():
    module = harness_module()
    valid = b'<svg xmlns="http://www.w3.org/2000/svg"><text><tspan>test</tspan></text></svg>'
    assert module.verify_svg(valid, 'test')['text_elements'] == 1
    with pytest.raises(RuntimeError, match='mismatch'):
        module.verify_svg(valid, 'other')
    with pytest.raises(RuntimeError, match='unexpected_svg_encoding'):
        module.verify_svg(b'<!DOCTYPE svg>' + valid, 'test')


def test_harness_refuses_without_authorization_before_display(monkeypatch):
    from types import SimpleNamespace
    module = harness_module()
    with pytest.raises(RuntimeError, match='authorization_required'):
        module.validate_args(SimpleNamespace(confirm_scratch_only=False))


def test_fixed_inkscape_exec_preserves_xed_launcher():
    text = HARNESS.with_name('main_scratch_launcher.py').read_text()
    assert "os.execve('/usr/bin/inkscape', ['inkscape'], os.environ)" in text
    assert "['xed', '--standalone', '--new-window']" in text
    assert 'shell=True' not in text


def test_harness_preflight_failure_purges_content_and_records_stages(tmp_path, monkeypatch, capsys):
    import asyncio
    from types import SimpleNamespace
    module = harness_module()
    monkeypatch.setattr(module, 'validate_args', lambda _: None)
    monkeypatch.setattr(module, 'validate_journal', lambda _: tmp_path)
    monkeypatch.setattr(module.pwd, 'getpwnam',
        lambda _: SimpleNamespace(pw_uid=1000, pw_gid=1000))
    monkeypatch.setattr(module.os, 'chown', lambda *_: None)
    monkeypatch.setattr(module, 'command', lambda *_: '')
    closed = []
    monkeypatch.setattr(module.display, 'Display',
        lambda _: SimpleNamespace(close=lambda: closed.append(True)))

    def unsupported(_):
        raise RuntimeError('private_topology_unsupported')

    monkeypatch.setattr(module.randr, 'capture', unsupported)
    monkeypatch.setenv('DISPLAY', ':987')
    monkeypatch.setenv('XAUTHORITY', '/tmp/private-fake-authority')
    args = SimpleNamespace(display=':987', xauthority='/tmp/private-fake-authority',
        session_user='fake', journal=str(tmp_path), monitor='screen', private_qualification=False)
    old = module.os.umask(0o077)
    try:
        assert asyncio.run(module.run(args)) == 1
    finally:
        module.os.umask(old)
    report = json.loads(capsys.readouterr().out)
    assert not report['passed'] and report['screenshots_purged']
    assert report['failure']['code'] == 'private_topology_unsupported'
    assert closed and not (tmp_path / 'home').exists()
    assert [row['stage'] for row in report['stages']] == [
        'task', 'terminate_inkscape', 'terminate_bus', 'close_x_connection',
        'remove_private-state', 'remove_home']


def supervisor_module():
    spec = importlib.util.spec_from_file_location('owned_supervisor_test', SUPERVISOR)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_unreadable_proc_census_fails_closed(monkeypatch):
    module = supervisor_module()
    monkeypatch.setattr(module.Path, 'iterdir', lambda _: [Path('/proc/999999')])

    def denied(_):
        raise PermissionError('denied')

    monkeypatch.setattr(module, 'metadata', denied)
    rows, complete = module.tree(123)
    assert rows == {} and not complete
    with pytest.raises(RuntimeError, match='standalone_process_required'):
        module.become_subreaper()


def test_exited_proc_is_normal_census_race(monkeypatch):
    module = supervisor_module()
    monkeypatch.setattr(module.Path, 'iterdir', lambda _: [Path('/proc/999999')])

    def gone(_):
        raise FileNotFoundError('gone')

    monkeypatch.setattr(module, 'metadata', gone)
    assert module.tree(123) == ({}, True)


def test_failed_preflight_never_reports_clean_if_final_scan_recovers(tmp_path, monkeypatch):
    module = supervisor_module()

    def incomplete():
        raise RuntimeError('standalone_process_required')

    monkeypatch.setattr(module, 'become_subreaper', incomplete)
    monkeypatch.setattr(module, 'tree', lambda _: ({}, True))
    report = tmp_path / 'result.json'
    assert module.supervise(['must-not-launch'], 1, 1, report) == 125
    result = json.loads(report.read_text())
    assert result['primary_pid'] is None and not result['cleanup_ok']


def run_owned(tmp_path, code, deadline=3):
    report = tmp_path / 'report.json'
    proc = subprocess.run([sys.executable, str(SUPERVISOR), '--deadline', str(deadline),
        '--grace', '.2', '--report', str(report), '--', sys.executable, '-c', code],
        capture_output=True, text=True, timeout=10)
    return proc, json.loads(report.read_text())


@pytest.mark.parametrize('code', [0, 7])
def test_owner_status_preserved(tmp_path, code):
    proc, report = run_owned(tmp_path, f'raise SystemExit({code})')
    assert proc.returncode == code
    assert report['primary_returncode'] == code
    assert report['cleanup_ok'] and not report['residuals']


def test_adopted_descendant_reaped_and_unrelated_child_untouched(tmp_path):
    sibling = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(30)'])
    try:
        code = ('import os,time,signal; p=os.fork(); '
                'signal.signal(signal.SIGTERM, signal.SIG_IGN) if p==0 else None; '
                'time.sleep(30) if p==0 else time.sleep(.15); os._exit(9)')
        proc, report = run_owned(tmp_path, code)
        assert proc.returncode == 9 and report['primary_returncode'] == 9
        assert report['cleanup_ok'] and not report['residuals']
        assert report['reaped']
        assert any(row['signal'] == 9 for row in report['signals'])
        assert sibling.poll() is None
        for row in report['reaped']:
            assert not Path(f"/proc/{row['identity']['pid']}").exists()
    finally:
        sibling.terminate()
        sibling.wait(timeout=3)


def test_deadline_is_finite_and_reaps_primary_and_child(tmp_path):
    proc, report = run_owned(tmp_path,
        'import os,time,signal; signal.signal(signal.SIGTERM, signal.SIG_IGN); '
        'os.fork(); time.sleep(30)', deadline=.2)
    assert proc.returncode == 124
    assert report['deadline_exceeded'] and report['primary_returncode'] == -9
    assert report['cleanup_ok'] and report['seconds'] < 5
    assert report['reaped']


def test_no_existing_journal_overwrite_or_launch(tmp_path):
    report = tmp_path / 'report.json'
    report.write_text('original')
    proc = subprocess.run([sys.executable, str(SUPERVISOR), '--deadline', '1',
        '--report', str(report), '--', sys.executable, '-c', 'print("LAUNCHED")'],
        capture_output=True, text=True, timeout=5)
    assert proc.returncode != 0 and 'LAUNCHED' not in proc.stdout
    assert report.read_text() == 'original'


def test_invalid_deadline_does_not_launch(tmp_path):
    proc = subprocess.run([sys.executable, str(SUPERVISOR), '--deadline', 'nan',
        '--report', str(tmp_path / 'report'), '--', sys.executable, '-c', 'print("LAUNCHED")'],
        capture_output=True, text=True, timeout=5)
    assert proc.returncode != 0 and 'LAUNCHED' not in proc.stdout
    assert not (tmp_path / 'report').exists()


def test_unqualified_main_task_is_disabled(monkeypatch):
    from types import SimpleNamespace
    module = harness_module()
    monkeypatch.setattr(module, 'PRIVATE_TASK_QUALIFIED', False)
    with pytest.raises(RuntimeError, match='not_privately_qualified'):
        module.validate_args(SimpleNamespace(confirm_scratch_only=True))


def test_main_journal_cannot_target_existing_home_or_relative_path():
    module = harness_module()
    for path in ('/home/odin', '/tmp', '.', '/tmp/cu-r6-other/../home'):
        with pytest.raises(RuntimeError, match='scratch_journal_required'):
            module.validate_journal(path)


def test_drawing_points_use_latest_crop_scale_and_monitor_origin():
    from types import SimpleNamespace

    from src.computer.geometry import AffineTransform
    module = harness_module()
    obs = SimpleNamespace(delivered_to_source=AffineTransform(2, 0, 100, 0, 2, 50),
                          width=600, height=400)
    points = module.delivered_points(obs, {'x': 2000, 'y': 0},
        (2140, 90, 1200, 840), [[530, 310]])
    assert points == [[285, 175]]
    with pytest.raises(RuntimeError, match='outside_scratch_client'):
        module.delivered_points(obs, {'x': 2000, 'y': 0},
            (2140, 90, 1200, 840), [[1300, 310]])


def test_shape_artifact_verifier_checks_native_nonempty_shapes():
    module = harness_module()
    blob = (b'<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="20"/>'
            b'<ellipse rx="10" ry="15"/></svg>')
    assert module.verify_shapes(blob)['rectangles'] == 1
    with pytest.raises(RuntimeError, match='empty_native_shape'):
        module.verify_shapes(blob.replace(b'width="10"', b'width="0"'))


def test_power_restoration_only_restores_recorded_state(monkeypatch):
    module = harness_module()
    commands = []
    states = iter(['On', 'Off'])
    monkeypatch.setattr(module, 'power_state', lambda: next(states))
    monkeypatch.setattr(module, 'command', lambda *args: commands.append(args))
    assert module.restore_power('Off') == {'power': 'Off', 'changed': True}
    assert commands == [('xset', 'dpms', 'force', 'off')]


def test_power_restoration_noop_and_unknown_refusal(monkeypatch):
    module = harness_module()
    commands = []
    monkeypatch.setattr(module, 'command', lambda *args: commands.append(args))
    monkeypatch.setattr(module, 'power_state', lambda: 'Off')
    assert module.restore_power('Off')['changed'] is False
    with pytest.raises(RuntimeError, match='unavailable'):
        module.restore_power('unavailable')
    assert not commands
