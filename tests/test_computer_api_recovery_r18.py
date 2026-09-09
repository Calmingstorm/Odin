"""R18 HTTP recovery contracts; no live store, host or desktop access."""
import pytest

from src.computer.models import ComputerError
from tests.test_computer_api import Controller, client


class RecoveryController(Controller):
    failure = None

    async def operator_status(self, **actor):
        result = await super().operator_status(**actor)
        return {**result, "state": "quarantined", "generation": 2,
                "session_generation": 8, "recovery": {
                    "status": "operator_reconciliation_required",
                    "reason": "controller_lost", "complete": False}}

    async def operator_recover(self, session_id, generation, **actor):
        self.check(**actor)
        self.calls.append(("recover", session_id, generation))
        if self.failure:
            raise self.failure
        return await self.operator_status(**actor)

    async def operator_acknowledge_legacy(self, acknowledgment, **kwargs):
        return await self.operator_recover(**kwargs)

    async def operator_reconcile(self, acknowledgment, **kwargs):
        self.calls.append(("acknowledgment", acknowledgment))
        result = await self.operator_recover(**kwargs)
        return {**result, "state": "closed", "session_generation": 9, "recovery": {
            "status": "operator_acknowledged_unverified", "reason": "controller_lost",
            "complete": False}}


def body_for(route):
    body = {"session_id": "computer-session", "generation": 8}
    if route != "recover":
        body["acknowledgment"] = "ACKNOWLEDGE UNVERIFIED CLEANUP computer-session"
    return body


@pytest.mark.asyncio
@pytest.mark.parametrize("route", ["recover", "acknowledge_legacy", "reconcile"])
@pytest.mark.parametrize("error,status,code", [
    (ComputerError("not_found"), 404, "not_found"),
    (ComputerError("stale_generation"), 409, "stale_generation"),
    (ComputerError("recovery_unavailable"), 409, "recovery_unavailable"),
    (ComputerError("runtime_identity_required"), 409, "runtime_identity_required"),
    (ComputerError("legacy_acknowledgment_unavailable"), 409,
     "legacy_acknowledgment_unavailable"),
    (ComputerError("/private/path secret text"), 409, "computer_operation_unavailable"),
    (ValueError("/private/path secret text"), 409, "computer_operation_unavailable"),
    (TypeError("/private/path secret text"), 409, "computer_operation_unavailable"),
])
async def test_correct_body_preserves_safe_controller_failure(route, error, status, code):
    controller = RecoveryController()
    controller.failure = error
    async with client(controller) as c:
        response = await c.post("/api/computer/" + route, json=body_for(route))
        result = await response.json()
        assert response.status == status
        assert result.get("code") == code
        assert "/private/path" not in str(result) and "secret text" not in str(result)
        assert response.headers["Cache-Control"] == "no-store, private"
        if code:
            assert result["next_action"]
        if code == "stale_generation":
            assert "session_generation" in result["error"]
    assert ("recover", "computer-session", 8) in controller.calls


@pytest.mark.asyncio
async def test_quarantined_status_exposes_generations_despite_optional_probe_failure(monkeypatch):
    async def unavailable(*_):
        raise AttributeError("diagnostic unavailable")

    monkeypatch.setattr("src.computer.accessibility_status.read_accessibility_status", unavailable)
    async with client(RecoveryController(), enabled=False) as c:
        response = await c.get("/api/computer")
        result = await response.json()
        assert response.status == 200
        assert result["generation"] == 2 and result["session_generation"] == 8
        assert result["recovery"]["complete"] is False
        assert result["accessibility"]["enabled"] is None
        assert result["accessibility"]["reason"] == "read_unavailable"


@pytest.mark.asyncio
async def test_quarantined_status_keeps_live_accessibility_indicator(monkeypatch):
    async def enabled(*_):
        return {"enabled": True, "state": "enabled", "reason": "property_read"}
    monkeypatch.setattr("src.computer.accessibility_status.read_accessibility_status", enabled)
    async with client(RecoveryController()) as c:
        response = await c.get("/api/computer")
        result = await response.json()
        assert response.status == 200
        assert result["state"] == "quarantined"
        assert result["accessibility"]["enabled"] is True


@pytest.mark.asyncio
@pytest.mark.parametrize("failure,status", [(AttributeError("display_name private"), 200),
                                            (PermissionError("private"), 404)])
async def test_optional_accessibility_failure_keeps_status_safe(monkeypatch, failure, status):
    async def unavailable(*_):
        raise failure

    monkeypatch.setattr("src.computer.accessibility_status.read_accessibility_status", unavailable)
    async with client(Controller()) as c:
        response = await c.get("/api/computer")
        assert response.status == status
        result = await response.json()
        assert "display_name" not in str(result)
        if status == 200:
            assert result["state"] == "active"
            assert result["accessibility"]["reason"] == "read_unavailable"


@pytest.mark.asyncio
@pytest.mark.parametrize("body", [
    {}, [], {"session_id": "computer-session", "generation": True},
    {**body_for("reconcile"), "generation": -1},
    {**body_for("reconcile"), "owner_id": "bob"},
    {**body_for("reconcile"), "acknowledgment": "yes"},
])
async def test_reconcile_body_validation_never_dispatches(body):
    controller = RecoveryController()
    async with client(controller) as c:
        response = await c.post("/api/computer/reconcile", json=body)
        assert response.status == 400
    assert controller.calls == []


@pytest.mark.asyncio
async def test_reconcile_works_disabled_and_does_not_claim_verified_cleanup():
    controller = RecoveryController()
    async with client(controller, enabled=False) as c:
        response = await c.post("/api/computer/reconcile", json=body_for("reconcile"))
        result = await response.json()
        assert response.status == 200
        assert result["state"] == "closed"
        assert result["session_generation"] == 9
        assert result["recovery"]["status"] == "operator_acknowledged_unverified"
        assert result["recovery"]["complete"] is False


@pytest.mark.asyncio
@pytest.mark.parametrize("kwargs,status", [
    ({"user": None}, 401), ({"tier": "user"}, 403), ({"session": None}, 401),
    ({"session": "other-session"}, 404),
])
async def test_reconcile_preserves_operator_auth(kwargs, status):
    async with client(RecoveryController(), **kwargs) as c:
        response = await c.post("/api/computer/reconcile", json=body_for("reconcile"))
        assert response.status == status
