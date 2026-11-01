"""Selected lifecycle requests and scoped cleanup proof, with a fake service only."""

from unittest.mock import AsyncMock

import pytest

from tests.test_computer_api import client

SESSION_ID = "selected-session"


def service(state="active", **extra):
    from types import SimpleNamespace

    result = {
        "owner_id": "alice", "session_id": SESSION_ID, "state": state,
        "session_generation": 7, **extra,
    }
    return SimpleNamespace(
        operator_status=AsyncMock(return_value=result),
        operator_stop=AsyncMock(return_value={**result, "state": "cancelled"}),
        operator_pause=AsyncMock(return_value={**result, "state": "paused"}),
    )


@pytest.fixture(autouse=True)
def fake_accessibility(monkeypatch):
    read = AsyncMock(return_value={"enabled": False, "state": "disabled"})
    monkeypatch.setattr(
        "src.computer.accessibility_status.read_accessibility_status", read,
    )
    return read


async def test_selected_status_passes_only_validated_id_to_service(fake_accessibility):
    adapter = service()
    async with client(adapter, enabled=False) as http:
        response = await http.get("/api/computer", params={"session_id": SESSION_ID})
        assert response.status == 200
        body = await response.json()
        assert body["session_id"] == SESSION_ID
        assert body["session_generation"] == 7
        assert body["accessibility"] == {"enabled": False, "state": "disabled"}
        assert response.headers["Cache-Control"] == "no-store, private"
    adapter.operator_status.assert_awaited_once_with(
        owner_id="alice", web_session_id="private-session", session_id=SESSION_ID,
    )
    fake_accessibility.assert_awaited_once_with(None)


@pytest.mark.parametrize("identifier", ["short", "../private-session", "x" * 129])
async def test_invalid_selected_status_never_dispatches(identifier, fake_accessibility):
    adapter = service()
    async with client(adapter) as http:
        response = await http.get("/api/computer", params={"session_id": identifier})
        assert response.status == 400
        assert await response.json() == {"error": "Invalid computer request or response"}
    adapter.operator_status.assert_not_awaited()
    fake_accessibility.assert_not_awaited()


@pytest.mark.parametrize("operation,state", [("stop", "cancelled"), ("pause", "paused")])
@pytest.mark.parametrize("generation", [0, 7])
async def test_selected_emergency_lifecycle_forwards_exact_generation(operation, state, generation):
    adapter = service()
    async with client(adapter, enabled=False) as http:
        response = await http.post(
            f"/api/computer/{operation}",
            json={"session_id": SESSION_ID, "generation": generation},
        )
        assert response.status == 200
        body = await response.json()
        assert body["state"] == state
        if operation == "stop":
            assert body == {"state": "cancelled"}
        else:
            assert body["session_id"] == SESSION_ID
        assert "private-session" not in str(body)
    getattr(adapter, f"operator_{operation}").assert_awaited_once_with(
        owner_id="alice", web_session_id="private-session",
        session_id=SESSION_ID, generation=generation,
    )
    other = "pause" if operation == "stop" else "stop"
    getattr(adapter, f"operator_{other}").assert_not_awaited()


@pytest.mark.parametrize("operation", ["stop", "pause"])
@pytest.mark.parametrize("body", [
    ["selected-session", 7],
    {"session_id": SESSION_ID},
    {"session_id": SESSION_ID, "generation": 7, "owner_id": "other"},
    {"session_id": "../invalid", "generation": 7},
    {"session_id": SESSION_ID, "generation": True},
    {"session_id": SESSION_ID, "generation": "7"},
    {"session_id": SESSION_ID, "generation": 7.0},
    {"session_id": SESSION_ID, "generation": -1},
])
async def test_malformed_selected_lifecycle_is_rejected_before_dispatch(operation, body):
    adapter = service()
    async with client(adapter, enabled=False) as http:
        response = await http.post(f"/api/computer/{operation}", json=body)
        assert response.status == 400
        assert await response.json() == {"error": "Invalid computer request or response"}
    adapter.operator_stop.assert_not_awaited()
    adapter.operator_pause.assert_not_awaited()


@pytest.mark.parametrize("cleanup,published", [
    ({"release_proof_scope": "recorded_synthetic_devices_only",
      "physical_release_proven": False, "private_native_detail": "do-not-publish"}, True),
    ({"release_proof_scope": "recorded_synthetic_devices_only",
      "physical_release_proven": True}, False),
    ({"release_proof_scope": "recorded_synthetic_devices_only",
      "physical_release_proven": 0}, False),
    ({"release_proof_scope": "all_input", "physical_release_proven": False}, False),
    ({"release_proof_scope": "recorded_synthetic_devices_only"}, False),
    (None, False),
])
async def test_status_only_publishes_narrow_synthetic_release_proof(cleanup, published):
    adapter = service(state="closed", cleanup=cleanup)
    async with client(adapter) as http:
        response = await http.get("/api/computer")
        assert response.status == 200
        body = await response.json()
    assert ("release_proof_scope" in body) is published
    assert ("physical_release_proven" in body) is published
    if published:
        assert body["release_proof_scope"] == "recorded_synthetic_devices_only"
        assert body["physical_release_proven"] is False
    assert "cleanup" not in body
    assert "do-not-publish" not in str(body)
