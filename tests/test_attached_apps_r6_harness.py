"""Static safety contract of the explicitly disposable R6 experiment."""
import ast
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT/'scripts/computer-feasibility/attached-apps-r6.py'


def test_parse_and_private_gate():
    source = SCRIPT.read_text()
    ast.parse(source)
    assert 'if not args.execute_isolated:' in source
    assert "os.environ.get('DISPLAY') == ':177'" in source
    assert "not Path('/tmp/.X11-unix/X0').exists()" in source
    assert '--crossuid-guardian' in source


def test_real_controller_no_shell_document_generation():
    source = SCRIPT.read_text()
    assert 'await ctl.act(ctx,payload)' in source
    assert 'await ctl.validate_observation_delivery' in source
    for node in ast.walk(ast.parse(source)):
        if isinstance(node,ast.Call) and isinstance(node.func,ast.Attribute):
            if isinstance(node.func.value,ast.Name) and node.func.value.id == 'target':
                assert node.func.attr not in {'write_text','write_bytes','open'}
    assert 'uncertain_action_no_replay' in source


def test_local_reapers():
    source = SCRIPT.read_text()
    assert source.count('reaper = Reaper()') == 2
    assert source.count('reaper.close()') == 2
    assert 'p.wait(timeout=260)' in source
    reaper = (SCRIPT.parent/'r6_reaper.py').read_text()
    assert 'os.pidfd_open(pid)' in reaper
    assert 'if pid in self.children():' in reaper
    assert 'os.waitpid(-1, os.WNOHANG)' in reaper


def test_partial_not_full_qualification():
    source = SCRIPT.read_text()
    assert "record('task_partial',saved=True,reopened=False)" in source
    assert 'gtk-cursor-blink=false' in source
