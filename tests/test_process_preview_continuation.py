"""A process poll offers a continuation only when retained bytes were not delivered."""
from __future__ import annotations

import json

import pytest

from src.tools.process_manager import ProcessInfo, ProcessRegistry


def _info(*, status: str, retained: int, emitted: int | None = None) -> ProcessInfo:
    return ProcessInfo(
        pid=7, generation="gen", command="printf harmless", host="localhost",
        start_time=1, status=status, exit_code=0 if status == "completed" else None,
        total_output_bytes=retained if emitted is None else emitted,
        retained_bytes=retained,
    )


def _meta(page: str) -> dict:
    if page.startswith("{"):
        return json.loads(page)
    return json.loads(page.rsplit("[output retention] ", 1)[1])


@pytest.mark.parametrize("status", ["completed", "running"])
def test_preview_that_shows_everything_has_no_cursor(status):
    page = ProcessRegistry._output_page(
        _info(status=status, retained=11), b"job-1-done\n", 0, 4000, 8000, preview=True,
    )

    meta = _meta(page)
    assert meta["shown_intervals"] == [[0, 11]]
    assert meta["truncated"] is False
    assert meta["cursor"] is None
    assert meta["retrieval"] is None


def test_preview_of_only_the_tail_still_offers_the_head():
    tail = b"last lines\n"
    page = ProcessRegistry._output_page(
        _info(status="completed", retained=5000), tail, 5000 - len(tail), 4000, 8000,
        preview=True,
    )

    meta = _meta(page)
    assert meta["truncated"] is True
    assert meta["cursor"] == "gen:0"
    assert meta["retrieval"]["arguments"]["cursor"] == "gen:0"


def test_preview_clipped_by_the_delivery_budget_offers_the_head():
    data = b"".join(b"line %04d of retained output\n" % i for i in range(400))
    page = ProcessRegistry._output_page(
        _info(status="completed", retained=len(data)), data, 0, 4000, 2000, preview=True,
    )

    meta = _meta(page)
    assert meta["shown_intervals"][0][0] > 0
    assert meta["truncated"] is True
    assert meta["cursor"] == "gen:0"


def test_withheld_tail_keeps_its_retrieval():
    page = ProcessRegistry._output_page(
        _info(status="completed", retained=11), b"job-1-done\n", 0, 4000, 8000,
        preview=True, tail_withheld=True,
    )

    meta = _meta(page)
    assert meta["tail_status"] == "unavailable"
    assert meta["truncated"] is True
    assert meta["cursor"] == "gen:0"


def test_no_output_has_no_cursor():
    page = ProcessRegistry._output_page(
        _info(status="running", retained=0), b"", 0, 4000, 8000, preview=True,
    )

    assert _meta(page)["cursor"] is None


@pytest.mark.parametrize("end,more", [(11, False), (6, True)])
def test_cursor_pages_are_unchanged(end, more):
    data = b"job-1-done\n"[:end]
    page = ProcessRegistry._output_page(
        _info(status="completed", retained=11), data, 0, 4000, 8000, preview=False,
    )

    meta = json.loads(page)
    assert meta["truncated"] is more
    assert meta["cursor"] == (f"gen:{end}" if more else None)


def test_capture_loss_is_reported_separately_from_pagination():
    page = ProcessRegistry._output_page(
        _info(status="completed", retained=11, emitted=50), b"job-1-done\n", 0, 4000, 8000,
        preview=True,
    )

    meta = _meta(page)
    assert meta["not_retained_bytes"] == 39
    assert meta["truncated"] is False
