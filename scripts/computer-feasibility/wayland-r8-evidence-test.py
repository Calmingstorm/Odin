"""R8 evidence regressions, no desktop/input/network side effects."""
import importlib.util
import json
from pathlib import Path

import pytest

spec = importlib.util.spec_from_file_location('r8_evidence', Path(__file__).with_name('wayland-r8-evidence.py'))
evidence = importlib.util.module_from_spec(spec)
spec.loader.exec_module(evidence)


def test_empty_six_case_claim_rejected(tmp_path):
    (tmp_path / 'session.log').write_text('')
    (tmp_path / 'receiver.log').write_text('')
    (tmp_path / 'lifecycle-driver.json').write_text('[]')
    with pytest.raises(AssertionError): evidence.analyze(tmp_path)


def test_malformed_json_never_silently_filtered(tmp_path):
    p = tmp_path / 'evidence'
    p.write_text('informational line\n{invalid}\n')
    with pytest.raises(json.JSONDecodeError): evidence.rows(p)


def test_shell_does_not_bind_host_desktop_or_devices():
    script = Path(__file__).with_name('wayland-r8-lab.sh').read_text()
    for required in ('--init', '--network=none', '--cap-drop=ALL', '--read-only', '--pids-limit=256',
                     '--cgroupns=private', 'wayland-process-ledger.py', 'wait "$cli"'):
        assert required in script
    for forbidden in ('--privileged', '--device=', '--pid=host', '--network=host', '--ipc=host', 'DISPLAY=:0'):
        assert forbidden not in script


def test_sole_owner_loss_is_separate_fault_binary():
    script = Path(__file__).with_name('wayland-r8-portal.py').read_text()
    assert "'-fault-fixture' if mode == 'guardian-loss'" in script
    assert 'os.close(fd)' in script
    assert "parent_returned_fd_closed=True" in script
    assert "'guardian-lease': 2" in script
