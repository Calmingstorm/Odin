"""Synthetic audit result envelopes exercise bounded preview edge cases."""

import json

from src.audit.logger import _audit_preview, _cap_audit_text, _cap_tool_input


def test_preview_drops_optional_fields_to_fit_tiny_caps():
    text = "secret-free diagnostic"
    preview = _audit_preview(text, 70, source={"kind": "process_output", "pid": 99})
    assert len(json.dumps(preview)) <= 70
    assert preview["audit_clipped"] is True
    assert preview.get("original_chars") in {None, len(text)}
    assert _audit_preview(text, 5) == {}


def test_parsed_json_preview_preserves_safe_envelope_facts():
    source = json.dumps({
        "kind": "tool_output", "status": "failed", "retention": "bounded",
        "cursor": "opaque-cursor", "head": "x" * 800,
    }, separators=(",", ":"))
    result = json.loads(_cap_audit_text(source, 220))
    assert result["audit_clipped"] is True
    assert result["source"]["kind"] == "tool_output"
    assert result["source"]["status"] == "failed"
    assert result["source"]["cursor_present"] is True
    assert len(json.dumps(result)) <= 220


def test_process_retention_metadata_is_kept_separate_from_body():
    metadata = json.dumps({"kind": "process_output", "pid": 17, "retained_bytes": 900},
                          separators=(",", ":"))
    source = "line one\npassword=fixture-secret\n[output retention] " + metadata
    capped = _cap_audit_text(source, 220)
    if capped.startswith("{"):
        result = json.loads(capped)
        assert result.get("source", {}).get("kind") == "process_output"
    assert "fixture-secret" not in capped


def test_tool_input_with_unserializable_value_uses_safe_fallback():
    class Broken:
        def __str__(self):
            raise RuntimeError("cannot stringify")

    assert _cap_tool_input({"value": Broken()}, 200) == "<unserializable tool_input>"
