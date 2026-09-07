"""Pure harness contract tests. No model, auth file, display, or live service."""
import base64
import hashlib
import importlib.util
import json
from pathlib import Path

import pytest

PATH = Path(__file__).resolve().parents[1] / "scripts/computer-feasibility/model-gui-smoke.py"
spec = importlib.util.spec_from_file_location("model_gui_smoke", PATH)
smoke = importlib.util.module_from_spec(spec)
spec.loader.exec_module(smoke)


def wire():
    data = b"test-pixels"
    return {"input": [{"content": [{"type": "input_image", "image_url":
        "data:image/png;base64," + base64.b64encode(data).decode()}]}],
        "tools": [{"name": n, "strict": False} for n in smoke.COMPUTER_TOOLS],
        "store": False}, hashlib.sha256(data).hexdigest()


def test_wire_checks_latest_pixels_and_never_retains_encoded_image():
    body, digest = wire()
    summary = smoke.wire_summary(json.dumps(body).encode(), digest)
    assert summary["png_sha256"] == [digest]
    assert "data:image" not in json.dumps(summary)
    assert summary["native_images"] == 1
    with pytest.raises(RuntimeError, match="Latest native pixels"):
        smoke.wire_summary(json.dumps(body).encode(), "wrong-digest")


def test_wire_denies_extra_tool_and_duplicate_text_pixels():
    body, digest = wire()
    body["tools"].append({"name": "run_command"})
    with pytest.raises(RuntimeError, match="tool authority"):
        smoke.wire_summary(json.dumps(body).encode(), digest)
    body, digest = wire()
    body["input"].append({"content": [{"type": "input_text", "text":
        body["input"][0]["content"][0]["image_url"].split(",")[1]}]})
    with pytest.raises(RuntimeError, match="duplicated"):
        smoke.wire_summary(json.dumps(body).encode(), digest)


def test_uses_unchanged_production_definitions_with_explicit_non_strict():
    tools = smoke.computer_definitions()
    assert {t["name"] for t in tools} == smoke.COMPUTER_TOOLS
    assert all(t["strict"] is False for t in tools)
    assert "anyOf" not in tools[2]["input_schema"]


def test_wire_requires_production_non_strict_flag():
    body, digest = wire()
    body["tools"][0].pop("strict")
    with pytest.raises(RuntimeError, match="non-strict"):
        smoke.wire_summary(json.dumps(body).encode(), digest)


def test_retiring_pixels_preserves_tool_correlation_and_text():
    call = {"type": "tool_use", "id": "1"}
    result = {"type": "tool_result", "tool_use_id": "1", "content": "receipt"}
    messages = [{"role": "assistant", "content": [call]},
                {"role": "user", "content": [result, {"type": "image", "source": {}}]}]
    smoke.without_old_pixels(messages)
    assert messages[0]["content"] == [call]
    assert messages[1]["content"] == [result]
