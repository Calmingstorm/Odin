"""General attached target status is bounded evidence, never an app allowlist."""
from types import SimpleNamespace

import pytest

from src.computer.manager import ComputerLifecycle
from src.config.schema import Config
from tests.test_computer_operator_auth_r5 import harness


@pytest.mark.parametrize("environment", ["existing_session", "isolated"])
def test_lifecycle_declarations_do_not_probe_or_offer_attached_apps(environment):
    config = Config(discord={"token": "fixture"})
    config.computer.environment = environment
    result = ComputerLifecycle(SimpleNamespace(config=config)).snapshot()
    assert bool(result["application_profiles"]) == (environment == "isolated")
    assert result["backend"]["readiness"] == "not_checked"
    assert result["backend"]["input_supported"] is None


async def test_attached_http_provenance_capabilities_and_public_null_app(tmp_path):
    async with harness(tmp_path) as h:
        original = h.backend.operator_status
        provenance = {"pid": 4242, "exe_basename": "custom-editor", "wm_class": "CustomEditor",
                      "trusted_executable": False, "script_identity": "editor.py",
                      "cmdline": "private", "socket": "/private/socket"}

        async def status(**actor):
            return {**await original(**actor), "app": "attached",
                    "application_provenance": provenance,
                    "backend": {"platform": "x11", "environment": "existing_session",
                                "pointer": "independent",
                                "keyboard_focus": "independent_per_window",
                                "widget_focus": "shared_within_window"},
                    "application_profiles": [{"id": "xed"}]}

        h.backend.operator_status = status
        response = await h.client.get("/api/computer", headers=h.headers)
        assert response.status == 200
        result = await response.json()
        assert result["app"] is None
        assert result["application_profiles"] == []
        assert result["application_provenance"] == {
            key: provenance[key] for key in ("pid", "exe_basename", "wm_class",
                                           "trusted_executable", "script_identity")}
        assert result["backend"]["pointer"] == "independent"
        assert result["backend"]["keyboard_focus"] == "independent_per_window"
        assert result["backend"]["widget_focus"] == "shared_within_window"
        assert h.backend.calls == ["status"]
        provenance["script_identity"] = {
            "interpreter_basename": "python3", "argv_digest": "a" * 64,
            "verified": False, "interpreter": "/private/interpreter", "argv": "private"}
        response = await h.client.get("/api/computer", headers=h.headers)
        assert response.status == 200
        assert (await response.json())["application_provenance"]["script_identity"] == {
            "interpreter_basename": "python3", "argv_digest": "a" * 64, "verified": False}


async def test_attached_http_omits_invalid_provenance_and_unknown_capabilities(tmp_path):
    async with harness(tmp_path) as h:
        original = h.backend.operator_status

        async def status(**actor):
            return {**await original(**actor),
                    "application_provenance": {"pid": True, "exe_basename": "x" * 257,
                        "wm_class": "secret\x00value", "script_identity": {"secret": "bad"},
                        "trusted_executable": "yes"},
                    "backend": {"platform": "x11", "environment": "existing_session",
                                "pointer": [], "keyboard_focus": "wishful", "widget_focus": True}}

        h.backend.operator_status = status
        response = await h.client.get("/api/computer", headers=h.headers)
        assert response.status == 200
        result = await response.json()
        assert result["application_provenance"] == {}
        assert all(result["backend"][key] == "unknown" for key in (
            "pointer", "keyboard_focus", "widget_focus"))


async def test_http_retains_isolated_fixed_launch_list_and_capability_fallback(tmp_path):
    async with harness(tmp_path) as h:
        original = h.backend.operator_status

        async def status(**actor):
            return {**await original(**actor), "app": "xed",
                    "backend": {"platform": "x11", "environment": "isolated"},
                    "backend_capabilities": {"pointer_separation": "independent"},
                    "input_limits": {"keyboard_focus": "shared",
                                     "widget_focus": "shared_within_window",
                                     "lease_seconds": 2, "max_text_chars": 400,
                                     "max_points": True, "max_scroll_count": float("inf"),
                                     "app": "private"},
                    "application_profiles": [{"id": "xed", "label": "untrusted label"},
                                             {"id": "unknown"}, {"id": "xed"}]}

        h.backend.operator_status = status
        response = await h.client.get("/api/computer", headers=h.headers)
        assert response.status == 200
        result = await response.json()
        assert result["app"] == "xed"
        assert result["input_limits"] == {"lease_seconds": 2, "max_text_chars": 400}
        assert [p["id"] for p in result["application_profiles"]] == ["xed"]
        assert result["application_profiles"][0]["label"] == "Xed"
        assert result["backend"]["pointer"] == "independent"
        assert result["backend"]["keyboard_focus"] == "shared"
        assert result["backend"]["widget_focus"] == "shared_within_window"
