"""Regression pins through production native serialization and delivery guard."""
import json

import pytest

from src.agents.results import result_page, serialize_page
from src.discord.response_guards import truncate_tool_output
from src.llm.secret_scrubber import scrub_output_secrets


@pytest.mark.parametrize("text", ["\x00\n\t\\\"" * 9000, "🌍é水\x01" * 9000])
def test_escape_heavy_pages_survive_real_guard_and_reconstruct(text):
    snapshot = {"id": "worker", "status": "completed", "result": text,
                "tools_used": ["\x00" * 200] * 400, "label": "\x00" * 200}
    pieces, cursor, end = [], "", 0
    while True:
        page = result_page(snapshot, cursor, 8000, max_chars=12000)
        serialized = serialize_page(page)
        delivered = truncate_tool_output(serialized, max_chars=12000)
        assert delivered == serialized
        assert json.loads(delivered) == page
        assert len(serialized) <= 12000
        assert page["offset"] == end
        assert page["end"] > end
        assert page["tools_omitted"] + len(page["tools_used"]) == 400
        assert len(serialize_page({"tools_used": page["tools_used"]})) <= 2000
        end = page["end"]
        pieces.append(page["preview"])
        cursor = page["cursor"]
        if not page["truncated"]:
            break
        assert cursor.endswith(f":{end}")
        # One additional code point must exceed the exact delivery budget,
        # unless the caller's independent byte ceiling is already exhausted.
        next_char = text.encode()[end:].decode()[0]
        if len(page["preview"].encode()) + len(next_char.encode()) <= 8000:
            enlarged = {**page, "preview": page["preview"] + next_char,
                        "end": end + len(next_char.encode()),
                        "cursor": cursor.split(":")[0] + f":{end + len(next_char.encode())}"}
            assert len(serialize_page(enlarged)) > 12000
    assert "".join(pieces) == text
    assert end == len(text.encode())


def test_default_four_thousand_and_terminal_cursor_size_drop():
    snapshot = {"id": "a", "status": "completed", "result": "x" * 9000}
    assert result_page(snapshot, max_chars=12000)["end"] == 4000
    short = {**snapshot, "result": "🌍"}
    page = result_page(short, limit=4, max_chars=12000)
    assert result_page(short, limit=4, max_chars=len(serialize_page(page))) == page


def test_minimal_envelope_fails_explicitly_without_nonadvancing_cursor():
    with pytest.raises(ValueError, match="exceeds delivery budget"):
        result_page({"id": "x" * 2000, "status": "completed", "result": "🌍"},
                    max_chars=300)


def test_old_byte_only_page_fails_real_guard_negative_control():
    # Mutation control: a byte-only page reproduces the original corrupted JSON.
    page = result_page({"id": "a", "status": "completed", "result": "\x00" * 9000},
                       limit=8000, max_chars=100000)
    serialized = serialize_page(page)
    assert len(serialized) > 12000
    assert truncate_tool_output(serialized, max_chars=12000) != serialized


def test_full_body_secret_scrub_precedes_paging_and_preserves_source_totals():
    raw = "prefix password=synthetic-fixture-value end\n" * 100
    expected = scrub_output_secrets(raw)
    snapshot = {"id": "a", "status": "completed", "result": raw}
    pages, cursor = [], ""
    while True:
        page = result_page(snapshot, cursor, limit=7, max_chars=12000)
        assert page["original_bytes"] == len(expected.encode())
        assert page["source_original_bytes"] == len(raw.encode())
        assert json.loads(truncate_tool_output(scrub_output_secrets(serialize_page(page)))) == page
        pages.append(page["preview"])
        if not page["truncated"]:
            break
        cursor = page["cursor"]
    assert "".join(pages) == expected
