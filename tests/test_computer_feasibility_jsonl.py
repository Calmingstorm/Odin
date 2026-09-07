"""Pure receiver log framing regression, no desktop or host process work."""

import importlib.util
import json
from pathlib import Path

import pytest


def helpers():
    path = (Path(__file__).parents[1] / "scripts" / "computer-feasibility" / "x11_records.py")
    spec = importlib.util.spec_from_file_location("x11_records", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def reader():
    return helpers().complete_records


def test_partial_receiver_record_waits_for_commit_newline():
    parse = reader()
    text = '{"kind":"text","value":"a"}\n{"kind":"text","value":"ab'
    assert parse(text) == [{"kind": "text", "value": "a"}]
    assert parse(text + '"}') == [{"kind": "text", "value": "a"}]
    assert parse(text + '"}\n')[-1] == {"kind": "text", "value": "ab"}


def test_malformed_complete_record_is_not_silently_accepted():
    with pytest.raises(json.JSONDecodeError):
        reader()('{"broken":}\n')


def test_complete_records_preserve_order_and_ignore_unstructured_log_lines():
    assert reader()('GTK note\n{"n":1}\n{"n":2}\n') == [{"n": 1}, {"n": 2}]


@pytest.mark.parametrize("error", [FileNotFoundError, ProcessLookupError])
def test_vanished_process_race_requires_directory_absence(tmp_path, monkeypatch, error):
    def disappeared(_):
        raise error

    monkeypatch.setattr(Path, "read_text", disappeared)
    assert helpers().process_identity(123, tmp_path) is None
    (tmp_path / "123").mkdir()
    with pytest.raises(error):
        helpers().process_identity(123, tmp_path)


def test_process_census_permission_error_is_not_absence(tmp_path, monkeypatch):
    def denied(_):
        raise PermissionError

    monkeypatch.setattr(Path, "read_text", denied)
    with pytest.raises(PermissionError):
        helpers().process_identity(123, tmp_path)
