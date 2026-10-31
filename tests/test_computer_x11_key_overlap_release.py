"""Offline-only shared XTEST release proof. No display or real process access."""

from copy import deepcopy
from types import SimpleNamespace

import pytest

from src.computer.effects import execution_receipt
from src.computer.error_guidance import failure_guidance
from src.computer.integration import ComputerIntegration
from src.computer.runtime import x11_guardian, x11_owned_device
from src.computer.runtime.x11_attached import AttachedFailure
from tests.test_computer_keyboard_grounding_r6 import fixture
from tests.test_computer_x11_guardian_r5 import observed as observed_backend
from tests.test_computer_x11_guardian_r5 import rig
from tests.test_computer_x11_owned_device_r5 import native as native_device  # noqa: F401


@pytest.fixture(autouse=True)
def no_live_resources(monkeypatch):
    def forbidden(*args, **kwargs):
        pytest.fail("offline overlap test attempted a real process or native display")

    monkeypatch.setattr(x11_guardian.subprocess, "Popen", forbidden)
    monkeypatch.setattr(x11_owned_device, "_load_native", forbidden)


def overlap_receipt(*, fail=None, synthetic_key=False, held_key=True):
    native, helper, guard = rig()

    def proof():
        assert helper.fenced and not guard.ledger.keys and not guard.ledger.buttons
        native.calls.append(("shared_all_up_query",))
        if fail == "query_error":
            raise RuntimeError("native query failed")
        if fail == "late_button_tap":
            native.events.extend([("buttons", 1, True), ("buttons", 1, False)])
        if fail == "late_button_hold":
            native.physical_buttons.add(1)
        if fail == "late_stream_error":
            native.physical_events = lambda: (_ for _ in ()).throw(RuntimeError("lost cookie"))
        return fail != "not_all_up"

    native.shared_release_all_up = proof
    if fail == "no_native_proof":
        del native.shared_release_all_up
    if fail == "independent":
        native.independent_pointer = True
    if fail == "fence":
        helper.fence_result = False
    if fail == "release":
        native.fail_release = True

    def interrupt():
        native.events.extend([("keys", 50, True), ("keys", 50, False)])
        if held_key:
            native.physical_keys.add(50)
        if fail == "button_tap":
            native.events.extend([("buttons", 1, True), ("buttons", 1, False)])
        if fail == "button_hold":
            native.physical_buttons.add(1)
        if fail == "mapping":
            native.events.append(("mapping", 0, True))
        if fail == "helper_eof":
            helper.exitcode = -9
        if fail == "stream_error":
            native.physical_events = lambda: (_ for _ in ()).throw(RuntimeError("overflow"))

    helper.after_send = interrupt
    steps = [("button", 1, True), ("move", 30, 40), ("button", 1, False)]
    if synthetic_key:
        steps.insert(0, ("key", 50, True))
    raw = guard.run(steps)
    return raw, native, helper, guard


@pytest.mark.parametrize("held_key", [True, False])
def test_key_overlap_reports_only_synthetic_release_and_keeps_effect_unknown(held_key):
    raw, native, helper, guard = overlap_receipt(held_key=held_key)
    assert raw["released"] is True and raw["status"] == "unknown"
    assert raw["overlap_uncertain"] is True
    assert raw["reason"] == "human_input_overlap"
    assert raw["diagnostics"]["release"] == "confirmed"
    assert native.physical_keys == ({50} if held_key else set())
    assert native.calls == [("button", 1, True), ("fence",),
                            ("button", 1, False), ("shared_all_up_query",)]
    normalized = failure_guidance(execution_receipt(raw, {"status": "unknown"}))
    assert normalized["status"] == "interrupted"
    assert normalized["recoverable"] is True and normalized["terminal"] is False
    assert normalized["next_action"] == "observe_and_reconcile"
    assert normalized["replay_permitted"] is False


@pytest.mark.parametrize("fail", [
    "query_error", "not_all_up", "no_native_proof", "independent", "fence", "release",
    "late_button_tap", "late_button_hold", "late_stream_error", "button_tap", "button_hold",
    "mapping", "helper_eof", "stream_error",
])
def test_missing_or_ambiguous_release_proof_retains_unknown_guard(fail):
    raw, native, helper, guard = overlap_receipt(fail=fail)
    assert raw["released"] is False
    assert "overlap_release_proof" not in raw
    result = failure_guidance(execution_receipt(raw, {"status": "unknown"}))
    assert result["terminal"] is True and result["recoverable"] is False


def test_same_key_overlap_and_synthetic_modifiers_remain_unknown():
    raw, *_ = overlap_receipt(synthetic_key=True)
    assert raw["released"] is False and "overlap_release_proof" not in raw


@pytest.mark.parametrize("field", [
    "kind", "helper_fenced", "ledger_empty", "synthetic_endpoints_all_up", "key_only_overlap",
])
def test_proof_field_missing_or_false_cannot_make_unknown_recoverable(field):
    raw, *_ = overlap_receipt()
    raw["overlap_release_proof"].pop(field)
    result = failure_guidance(execution_receipt(raw, {"status": "unknown"}))
    assert result["terminal"] is True


@pytest.mark.parametrize("value", [1, "true", None, False])
def test_proof_booleans_require_true_not_truthy_values(value):
    raw, *_ = overlap_receipt()
    raw["overlap_release_proof"]["helper_fenced"] = value
    result = failure_guidance(execution_receipt(raw, {"status": "unknown"}))
    assert result["terminal"] is True


@pytest.mark.parametrize("negative", [
    {"released": False}, {"held_input": True}, {"verification": {"terminal": True}},
    {"release_confirmed": False}, {"cleanup": {"complete": False}},
])
def test_proof_never_overrides_negative_safety_evidence(negative):
    raw, *_ = overlap_receipt()
    raw.update(negative)
    result = failure_guidance(execution_receipt(raw, {"status": "unknown"}))
    assert result["terminal"] is True


def test_native_all_up_is_exact_shared_slaves_not_physical_or_master(native_device):  # noqa: F811
    fake, dev = native_device
    assert dev.shared_release_all_up() is False
    fake.states[4] = {"buttons": set()}
    fake.states[5] = {"keys": set()}
    # Physical keys/buttons remain down. They are not queried or released here.
    before = list(fake.calls)
    assert dev.shared_release_all_up() is True
    assert fake.calls == before
    fake.rows[3] = (9, "Virtual core XTEST keyboard", 4, 3, True)
    with pytest.raises(x11_owned_device.X11DeviceError, match="topology_changed"):
        dev.shared_release_all_up()


@pytest.mark.parametrize("failure", ["query", "missing_class", "post_query_topology"])
def test_native_all_up_query_fails_closed_on_incomplete_or_changed_evidence(
    native_device, monkeypatch, failure  # noqa: F811
):
    fake, dev = native_device
    fake.states[4] = {"buttons": set()}
    fake.states[5] = {"keys": set()}
    if failure == "query":
        monkeypatch.setattr(fake.xi, "XQueryDeviceState", lambda *_: None)
    elif failure == "missing_class":
        fake.states[5] = {"buttons": set()}
    else:
        original = fake.xi.XQueryDeviceState

        def query(display, device):
            result = original(display, device)
            if device.contents.device_id == 5:
                fake.rows[3] = (5, "Virtual core XTEST keyboard", 4, 2, True)
            return result

        monkeypatch.setattr(fake.xi, "XQueryDeviceState", query)
    with pytest.raises(x11_owned_device.X11DeviceError):
        dev.shared_release_all_up()


async def test_new_proof_does_not_clear_an_existing_quarantine(monkeypatch):
    backend, state, frame = await observed_backend(monkeypatch)
    backend._release_failed = True
    backend._paused = True
    with pytest.raises(AttachedFailure, match="owned_release_unverified"):
        await backend.resume(consent_generation=2)
    assert backend._release_failed and backend._paused


async def test_controller_keeps_session_and_integration_never_replays(tmp_path, monkeypatch):
    from tests.test_computer_native_vision_r5 import client, serving

    async with fixture(tmp_path, monkeypatch) as (controller, context, action, state, calls):
        action.update(operation="polyline", points=[[2, 2], [10, 7]], duration=0.2)
        backend = controller._live[action["session_id"]].backend
        raw, *_ = overlap_receipt()

        async def partial(payload):
            calls.append(deepcopy(payload))
            return deepcopy(raw)

        monkeypatch.setattr(backend, "_input_worker", partial)
        bot = SimpleNamespace(
            config=SimpleNamespace(computer=SimpleNamespace(enabled=True)),
            host_access_manager=SimpleNamespace(is_host_allowed=lambda *_: True),
            tool_executor=SimpleNamespace(check_permission=lambda *_: None),
        )
        service = ComputerIntegration(bot, controller=controller)
        monkeypatch.setattr(service, "_context", lambda _: context)
        turn = SimpleNamespace(user_id=context.owner_id,
                               message=SimpleNamespace(channel=SimpleNamespace(id=context.channel_id)),
                               _computer_serving=serving(client()))
        block = SimpleNamespace(id="overlap", name="computer_act", input=action)
        with service.foreground(turn, block):
            result = await service._tool(block.name, action)
        # It can be an inline fresh-view envelope; inspect the actual receipt.
        receipt = result.get("__computer_action_receipt__", result)
        assert receipt["status"] == "not_satisfied"
        assert receipt["native_status"] == "interrupted"
        assert receipt["execution"]["released"] is True
        assert receipt["terminal"] is False and receipt["recoverable"] is True
        assert receipt["replay_permitted"] is False
        assert action["session_id"] in controller._live
        assert not backend._release_failed and not backend._paused
        assert action["session_id"] not in controller._delivered_observations
        replay = await controller.act(context, action)
        assert replay["status"] == "interrupted"
        assert len(calls) == 1
