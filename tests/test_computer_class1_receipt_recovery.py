"""AST census exercises a superset of every raiser's literal reason codes."""
import ast
import re
from pathlib import Path

import pytest

from src.computer.effects import execution_receipt
from src.computer.error_guidance import failure_guidance, guidance


def reason_census():
    root = Path(__file__).resolve().parents[1] / "src/computer"
    codes = set()
    for path in ["controller.py", "sequences.py", "runtime/hyprland_backend.py",
                 "runtime/hyprland_guardian.py"]:
        found = set()
        for node in ast.walk(ast.parse((root / path).read_text())):
            if isinstance(node, ast.Constant) and isinstance(node.value, str):
                code = node.value.split(":", 1)[0]
                if re.fullmatch(r"[a-z][a-z0-9_]{0,95}", code):
                    found.add(code)
        assert found, path
        codes.update(found)
    return sorted(codes)


@pytest.mark.parametrize("reason", reason_census())
def test_every_code_with_receipt_and_with_contradiction(reason):
    for execution in ({"released": True}, {"injected": False}):
        raw = {"status": "not_satisfied", "reason": reason, "execution": execution}
        safe = failure_guidance(raw)
        assert safe["recoverable"] and not safe["terminal"]
        assert not safe["replay_permitted"]
        assert "CONTINUE" in safe["instruction"]
        raw["verification"] = {"cleanup": {"complete": True, "receipt": {"released": False}}}
        assert failure_guidance(raw)["terminal"]


RISKS = [{"released": False}, {"release_confirmed": False}, {"held_input": True},
         {"unknown_release": True}, {"uncertain_outcome": True}, {"terminal": True},
         {"status": "unknown"}, {"state": "quarantined"}, {"state": "unknown"},
         {"state": "future_state"}, {"status": "future_status"},
         {"release": "unknown"}, {"cleanup": {"complete": False}},
         {"cleanup": {"complete": True, "status": "failed"}},
         {"cleanup": {"complete": True, "release": "unknown"}}, {"cleanup": "incomplete"}]


@pytest.mark.parametrize("risk", RISKS)
@pytest.mark.parametrize("location", ["execution", "verification", "cleanup", "steps"])
def test_nested_negative_dominates_aggregate_and_later_not_sent(risk, location):
    raw = {"status": "not_satisfied", "released": True, "next_action": "continue"}
    raw[location] = ([{"execution": risk}, {"released": True, "injected": False}]
                     if location == "steps" else {"complete": True, "receipt": risk}
                     if location == "cleanup" else risk)
    assert failure_guidance(raw)["terminal"]
    assert failure_guidance(raw)["next_action"] == "operator_intervention_required"


@pytest.mark.parametrize("risk", RISKS)
def test_effect_normalization_preserves_nested_safety_for_new_codes(risk):
    normalized = execution_receipt({"released": True, "injected": False,
        "reason": "new_code", "verification": risk}, {"status": "not_satisfied"})
    assert failure_guidance(normalized)["terminal"]


def test_unknown_without_evidence_fails_closed():
    assert guidance("new_code")["terminal"]
    assert failure_guidance({"reason": "new_code"})["terminal"]
    safe = failure_guidance({"reason": "new_code", "injected": False})
    assert safe["recoverable"] and "was not sent" in safe["instruction"]
    assert "is cleanly released" not in safe["instruction"]


@pytest.mark.parametrize("reason", reason_census())
def test_reason_alone_never_manufactures_dispatch_or_release_proof(reason):
    assert guidance(reason)["terminal"]
    assert failure_guidance({"reason": reason})["terminal"]


@pytest.mark.parametrize("change", [{"fresh_session_required": True}, {"state": "closed"},
    {"state": "cancelled"}, {"verification": {"status": "interrupted"}}])
def test_continuity_is_not_held_input(change):
    assert failure_guidance({"released": True, "reason": "new_code", **change})["recoverable"]


@pytest.mark.parametrize("source", ["top", "verification", "diagnostics"])
def test_preserve_machinery_action(source):
    raw = {"status": "not_satisfied", "execution": {"released": True}}
    action = "inspect_interruption_then_plan_new_action_ids"
    if source == "top":
        raw["next_action"] = action
    else:
        raw[source] = {"status": "interrupted", "next_action": action}
    assert failure_guidance(raw)["next_action"] == action


def test_ack_explained_locally_not_by_sibling_step():
    assert failure_guidance({"release_ack": False})["terminal"]
    assert failure_guidance({"execution": {"released": True},
                            "verification": {"release_ack": False}})["recoverable"]
    assert failure_guidance({"released": True, "steps": [
        {"released": True}, {"release_ack": False}]})["terminal"]


@pytest.mark.parametrize("execution", [
    {"injected": True, "sent": True}, {"injected": None}, {"sent": "false"},
])
def test_contradictory_or_unknown_dispatch_cannot_prove_not_sent(execution):
    result = {"status": "not_satisfied", "injected": False, "execution": execution}
    assert failure_guidance(result)["terminal"]
    # Independent release proves safety without claiming non-dispatch.
    recovered = failure_guidance({**result, "released": True})
    assert recovered["recoverable"]
    assert "was not sent" not in recovered["instruction"]


@pytest.mark.parametrize("negative", [
    {"released": 0}, {"release_confirmed": "true"}, {"release_ack": None},
    {"held_input": 1}, {"unknown_release": "false"}, {"terminal": None},
    {"release": "future_release_state"}, {"release": None},
])
def test_malformed_or_new_release_evidence_fails_closed(negative):
    assert failure_guidance({"released": True, "verification": negative})["terminal"]
