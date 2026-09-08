"""Admission evidence must survive the real authenticated HTTP projection."""
import pytest

from src.computer.admission import CompositorIdentity, InputAdmission, public_admission
from tests.test_computer_operator_auth_r5 import harness


def evidence():
    return InputAdmission("refused", "owned_button_release_failed",
                          "The receiver did not receive button release after sender EOF.",
                          "Install a fixed compositor build and start a new session.",
                          CompositorIdentity("Mutter", "46.2", "nested-x11", "fixture-build"),
                          "same_stack_disposable", ("eof_button_failed",)).public()


def test_projection_drops_private_native_fields():
    record = evidence()
    record["pid"] = 4242
    record["socket"] = "/private/socket"
    record["compositor"]["mapped_libraries"] = ["/private/library"]
    assert public_admission(record) == evidence()


@pytest.mark.parametrize("change", [
    {"checks": "string"}, {"checks": ["x"] * 17}, {"compositor": "name"},
    {"compositor": {}}, {"state": "anything"}, {"reason": "\ud800"},
    {"remedy": "x" * 769}, {"code": None}, {"probe_scope": "assumed"},
])
def test_projection_omits_invalid_evidence(change):
    assert public_admission({**evidence(), **change}) is None
    assert public_admission(None) is None


async def test_http_exposes_bounded_reason_and_remedy_with_actual_auth(tmp_path):
    async with harness(tmp_path) as h:
        original = h.backend.operator_status

        async def status(**actor):
            result = await original(**actor)
            return {**result, "input_admission": evidence(),
                    "backend": {"platform": "wayland", "environment": "existing_session",
                                "input_supported": False}, "native_private": "do not serialize"}

        h.backend.operator_status = status
        response = await h.client.get("/api/computer", headers=h.headers)
        assert response.status == 200
        record = await response.json()
        assert record["input_admission"] == evidence()
        assert record["backend"]["input_supported"] is False
        assert "native_private" not in record
        assert h.backend.calls == ["status"]


async def test_http_attached_has_no_application_allowlist(tmp_path):
    async with harness(tmp_path) as h:
        original = h.backend.operator_status

        async def status(**actor):
            return {**await original(**actor),
                    "backend": {"platform": "x11", "environment": "existing_session"},
                    "application_profiles": [{"id": "xed", "label": "private title"},
                                             {"id": "xed"}, {"id": "calc"},
                                             {"id": "unknown"}, {"id": []}, "invalid"]}

        h.backend.operator_status = status
        response = await h.client.get("/api/computer", headers=h.headers)
        assert response.status == 200
        profiles = (await response.json())["application_profiles"]
        assert profiles == []
