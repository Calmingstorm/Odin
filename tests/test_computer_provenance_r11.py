"""Receipt-safe identity without raw process arguments, titles, or paths."""
import pytest

from src.computer.provenance import (
    canonical_application_provenance,
    validate_application_provenance,
)


def private():
    return {"process": {"pid": 22, "uid": 1000, "start_ticks": 300,
                        "exe": "/home/private/bin/python3", "exe_identity": [1, 500],
                        "cmdline_digest": "a" * 64, "trusted_executable": False,
                        "cmdline": "secret", "script_identity": {
                            "interpreter": "/home/private/bin/python3", "argv_digest": "b" * 64,
                            "verified": False}}, "wm_class": "Drawing", "title": "secret"}


def test_project_both_scope_shapes_without_sensitive_extras():
    source = private()
    result = canonical_application_provenance(source)
    assert result["exe_basename"] == "python3" and result["pid"] == 22
    assert result["script_identity"]["interpreter_basename"] == "python3"
    assert result["trusted_executable"] is False
    assert "private" not in str(result) and "secret" not in str(result)
    assert "title" not in result and "cmdline" not in result
    assert validate_application_provenance(result) == result
    wayland = {"application": source["process"], "wm_class": source["wm_class"]}
    assert canonical_application_provenance(wayland) == result
    result["exe_identity"].clear()
    result["script_identity"]["argv_digest"] = "changed"
    assert source["process"]["exe_identity"] == [1, 500]
    assert source["process"]["script_identity"]["argv_digest"] == "b" * 64


@pytest.mark.parametrize("field,value", [
    ("pid", True), ("pid", 1), ("uid", -1), ("start_ticks", 0),
    ("exe_identity", [1]), ("exe_identity", [True, 5]), ("cmdline_digest", "secret"),
    ("trusted_executable", "yes"), ("exe_basename", "/home/private/bin/app"),
    ("wm_class", "bad\x00text"), ("wm_class", "\ud800"), ("wm_class", "x" * 4097),
    ("script_identity", {"interpreter": "/secret"}), ("script_identity", "unverified"),
])
def test_malformed_canonical_identity_rejected(field, value):
    result = canonical_application_provenance(private())
    result[field] = value
    assert validate_application_provenance(result) is None


def test_no_extra_fields_or_partial_evidence():
    value = canonical_application_provenance(private())
    assert validate_application_provenance(value | {"argv": "private"}) is None
    assert validate_application_provenance({"pid": 22}) is None
    for missing in value:
        reduced = {k: v for k, v in value.items() if k != missing}
        assert validate_application_provenance(reduced) is None
    for bad in (None, [], "scope", {"process": []}):
        assert canonical_application_provenance(bad) is None
