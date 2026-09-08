"""Shared input cannot call a stranded legacy independent seat clean."""
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from src.computer.runtime import x11_attached_worker as worker
from src.computer.runtime import x11_owned_device as devices


@pytest.mark.parametrize("operation", ["input_capabilities", "verify_shared_identity"])
@pytest.mark.parametrize("prefix", ["Odin session abc", "Odin persistent 1003"])
def test_reserved_master_refused_without_mutation(monkeypatch, operation, prefix):
    close = Mock()
    native = SimpleNamespace(
        _topology=lambda: [(2, "Virtual core pointer", 1, 3, True),
                           (18, prefix + " pointer", 1, 19, True)],
        close=close, identity=Mock(), owned_release_state=Mock())
    monkeypatch.setattr(devices, "ExistingXTest", lambda _: native)
    result = worker.safe_run({"operation": operation, "display_name": ":991",
                              "xauthority": "/dev/null", "monitor_names": ["screen"]})
    assert result["ok"] is False
    native.identity.assert_not_called()
    native.owned_release_state.assert_not_called()
    close.assert_called_once()
