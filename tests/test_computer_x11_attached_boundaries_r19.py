"""Attached field dispatch and release boundaries through inert worker transports.

Observe/act, coordinate translation, consumption and evidence validation are real;
only the native worker boundary is replaced. No display or process is opened.
"""

import asyncio
import copy
import ctypes
import subprocess
from unittest.mock import AsyncMock

import pytest

from src.computer.models import ComputerError
from src.computer.runtime.x11_attached import AttachedFailure
from tests.test_computer_adapters_r11 import backend, capture


@pytest.fixture(autouse=True)
def no_native_calls(monkeypatch):
    def forbidden(*args, **kwargs):
        pytest.fail("Native process/display access is forbidden in boundary tests")

    monkeypatch.setattr(asyncio, "create_subprocess_exec", forbidden)
    monkeypatch.setattr(subprocess, "Popen", forbidden)
    monkeypatch.setattr(ctypes, "CDLL", forbidden)


async def observed(monkeypatch, *, field=True, crop=None, receipt=None):
    b = backend()
    reply = capture(crop)
    if field:
        reply["accessibility"] = [{"handle": "field", "capabilities": ["replace_field"]}]
        reply["accessibility_private"] = {
            "field": {
                "observation_id": "native-observation",
                "metadata": {"capabilities": ["replace_field"]},
            }
        }
    read = AsyncMock(return_value=reply)
    monkeypatch.setattr(b, "_read_worker", read)
    frame = await b.observe(crop=crop)
    inject = AsyncMock(return_value=receipt or {"released": True, "status": "executed"})
    monkeypatch.setattr(b, "_input_worker", inject)
    binding = {
        "source_id": frame.source.source_id,
        "source_revision": frame.source.source_revision,
        "consent_generation": frame.source.consent_generation,
    }
    return b, frame, binding, read, inject


@pytest.mark.asyncio
@pytest.mark.parametrize("fault", [None, "incomplete", "wrong_target", "failed", "unreleased"])
async def test_identity_readback_requires_matching_complete_released_field(monkeypatch, fault):
    receipt = {
        "released": fault != "unreleased",
        "status": "failed" if fault == "failed" else "executed",
        "field_observation": {
            "target": "other" if fault == "wrong_target" else "field",
            "text": "replacement",
            "text_complete": fault != "incomplete",
        },
    }
    b, frame, binding, read, inject = await observed(monkeypatch, receipt=receipt)
    saved = copy.deepcopy(b._accessibility_private["field"])
    result = await b.act(
        {
            **binding,
            "type": "replace_field",
            "target": "field",
            "text": "replacement",
            "expected": {"type": "field_text_equals", "target": "field", "text": "replacement"},
        }
    )
    request = inject.call_args.args[0]
    assert request["action"] == {
        "type": "replace_field",
        "target": "field",
        "text": "replacement",
        "observation_id": "native-observation",
    }
    assert request["accessible_reference"] == saved
    assert b._frame is None and b._accessibility_private == {}
    assert "field_observation" not in result
    assert result["targeting_path"] == "native_atspi_identity"
    assert result["postcondition"]["status"] == ("observed" if fault is None else "unavailable")
    if fault is None:
        assert result["postcondition"]["actual"] == {"text": "replacement", "text_complete": True}
        assert result["postcondition"]["target_application_matches"] is True
    assert read.await_count == 1  # Pixel recapture cannot substitute for field identity.
    assert b._paused is (fault == "unreleased")
    assert b._release_failed is (fault == "unreleased")


@pytest.mark.asyncio
@pytest.mark.parametrize("fault", ["missing", "capability", "expectation"])
async def test_field_refusals_do_not_dispatch_or_consume_observation(monkeypatch, fault):
    b, frame, binding, read, inject = await observed(monkeypatch, field=fault != "missing")
    if fault == "capability":
        b._accessibility_private["field"]["metadata"]["capabilities"] = ["focus"]
    expected = {"type": "field_text_equals", "target": "field", "text": ""}
    if fault == "expectation":
        expected = {"type": "visual_change"}
    reason = (
        "field_text_verification_required"
        if fault == "expectation"
        else "accessible_target_unavailable"
    )
    with pytest.raises(AttachedFailure, match=reason):
        await b.act(
            {
                **binding,
                "type": "replace_field",
                "target": "field",
                "text": "",
                "expected": expected,
            }
        )
    inject.assert_not_awaited()
    assert b._frame is frame and not b._paused and not b._release_failed


@pytest.mark.asyncio
async def test_pixel_field_translates_cropped_region_and_requires_new_observation(monkeypatch):
    crop = {"x": 10, "y": 20, "width": 30, "height": 40}
    b, frame, binding, read, inject = await observed(monkeypatch, field=False, crop=crop)
    action = {
        **binding,
        "type": "replace_field_pixels",
        "text": "",
        "region": {"x": 2, "y": 3, "width": 7, "height": 8},
        "expected": {"type": "region_changed", "x": 2, "y": 3, "width": 7, "height": 8},
    }
    result = await b.act(action)
    assert inject.call_args.args[0]["action"] == {
        "type": "replace_field_pixels",
        "text": "",
        "region": {"x": 112, "y": 223, "width": 7, "height": 8},
    }
    assert "accessible_reference" not in inject.call_args.args[0]
    assert result["targeting_path"] == "explicit_pixel_region"
    assert result["postcondition"]["method"] == "raster_digest_after_release"
    assert read.call_args.kwargs["crop"] == crop
    assert b._frame is None
    with pytest.raises(AttachedFailure):
        await b.act(action)
    assert inject.await_count == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("text", ["line\nbreak", "tab\tvalue", "\ud800", "\x7f"])
async def test_pixel_field_rejects_unsafe_text_before_worker(monkeypatch, text):
    b, frame, binding, read, inject = await observed(monkeypatch, field=False)
    with pytest.raises(ComputerError, match="invalid_text"):
        await b.act(
            {
                **binding,
                "type": "replace_field_pixels",
                "text": text,
                "region": {"x": 1, "y": 1, "width": 10, "height": 10},
                "expected": {"type": "visual_change"},
            }
        )
    inject.assert_not_awaited()
    assert b._frame is frame
