"""A fixed-time cron job fires once when clocks fall back (cron(8) semantics)."""
from __future__ import annotations

from datetime import UTC, datetime
from unittest import mock

import pytest

import src.scheduler.scheduler as scheduler
from src.scheduler.scheduler import _cron_next_run, _is_fixed_time_cron


def _next_at(now_utc: datetime, expr: str, tz: str | None) -> str:
    class FrozenDatetime(datetime):
        @classmethod
        def now(cls, tz=None):
            return now_utc.astimezone(tz) if tz else now_utc.replace(tzinfo=None)

    with mock.patch.object(scheduler, "datetime", FrozenDatetime):
        return _cron_next_run(expr, tz)


def _utc(*args) -> datetime:
    return datetime(*args, tzinfo=UTC)


NEW_YORK = "America/New_York"


@pytest.mark.parametrize(
    "now,expr,tz,expected",
    [
        # 2026-11-01 New York: 01:30 EDT is 05:30Z, 01:30 EST is 06:30Z.
        (_utc(2026, 11, 1, 4, 10), "30 1 * * *", NEW_YORK, "2026-11-01T05:30:00+00:00"),
        (_utc(2026, 11, 1, 5, 30, 5), "30 1 * * *", NEW_YORK, "2026-11-02T06:30:00+00:00"),
        (_utc(2026, 11, 1, 5, 30), "30 1 * * *", NEW_YORK, "2026-11-02T06:30:00+00:00"),
        (_utc(2026, 11, 1, 5, 30, 5), "0,30 1 * * *", NEW_YORK, "2026-11-02T06:00:00+00:00"),
        (_utc(2026, 11, 1, 5, 30, 5), "30 1-2 * * *", NEW_YORK, "2026-11-01T07:30:00+00:00"),
        # A list that starts with a number is fixed even with a later wildcard.
        (_utc(2026, 11, 1, 5, 55, 30), "0,*/5 1 * * *", NEW_YORK, "2026-11-02T06:00:00+00:00"),
        (_utc(2026, 11, 1, 5, 55, 30), "30 1,*/2 * * *", NEW_YORK, "2026-11-01T07:30:00+00:00"),
        # 2026-10-25 London: 01:15 BST is 00:15Z, 01:15 GMT is 01:15Z.
        (_utc(2026, 10, 25, 0, 15, 10), "15 1 * * *", "Europe/London",
         "2026-10-26T01:15:00+00:00"),
        # 2027-04-04 Lord Howe falls back 30 minutes: 01:45 +11:00, then 01:45 +10:30.
        (_utc(2027, 4, 3, 14, 45, 10), "45 1 * * *", "Australia/Lord_Howe",
         "2027-04-04T15:15:00+00:00"),
    ],
)
def test_fixed_time_job_skips_the_repeated_copy(now, expr, tz, expected):
    assert _next_at(now, expr, tz) == expected


@pytest.mark.parametrize(
    "now,expr,expected",
    [
        (_utc(2026, 11, 1, 5, 30, 5), "30 * * * *", "2026-11-01T06:30:00+00:00"),
        (_utc(2026, 11, 1, 5, 55, 30), "*/5 1 * * *", "2026-11-01T06:00:00+00:00"),
        (_utc(2026, 11, 1, 5, 30, 5), "@hourly", "2026-11-01T06:00:00+00:00"),
    ],
)
def test_wildcard_job_keeps_both_copies(now, expr, expected):
    assert _next_at(now, expr, NEW_YORK) == expected


def test_spring_forward_is_unchanged():
    # 02:30 does not exist on 2027-03-14 in New York; croniter fires at 03:00 EDT.
    assert _next_at(_utc(2027, 3, 14, 6, 0), "30 2 * * *", NEW_YORK) == (
        "2027-03-14T07:00:00+00:00"
    )


@pytest.mark.parametrize("tz", [None, "UTC"])
def test_utc_evaluation_is_unchanged(tz):
    assert _next_at(_utc(2026, 11, 1, 5, 30, 5), "30 1 * * *", tz) == (
        "2026-11-02T01:30:00+00:00"
    )


@pytest.mark.parametrize("expr", ["30 1 * * *", "*/5 1 * * *", "0,30 1 * * *", "30 * * * *",
                                  "0,*/5 1 * * *", "30 1,*/2 * * *"])
def test_fires_through_the_fall_back_night_strictly_increase(expr):
    now = _utc(2026, 11, 1, 3, 0)
    for _ in range(40):
        nxt = datetime.fromisoformat(_next_at(now, expr, NEW_YORK))
        assert nxt > now
        now = nxt


@pytest.mark.parametrize(
    "expr,fixed",
    [
        ("30 1 * * *", True), ("0,30 1-2 * * 1-5", True), ("0-59/5 1 * * *", True),
        ("0,*/5 1 * * *", True), ("30 1,*/2 * * *", True),
        ("@daily", True), ("@weekly", True), ("@hourly", False),
        ("*/5 1 * * *", False), ("30 * * * *", False), ("* * * * *", False),
        ("0 */2 * * *", False),
        ("H 1 * * *", False), ("30", False), ("", False),
    ],
)
def test_fixed_time_classification(expr, fixed):
    assert _is_fixed_time_cron(expr) is fixed


@pytest.mark.parametrize(
    "now,expr,expected",
    [
        # Seconds resolution: 3600 second copies in the repeated hour. The next
        # run is the first second of the following day's 01:00.
        (_utc(2026, 11, 1, 5, 59, 59), "0-59 1 * * * */1", "2026-11-02T06:00:00+00:00"),
        (_utc(2026, 11, 1, 5, 59, 30), "30 1 * * * 15", "2026-11-02T06:30:15+00:00"),
    ],
)
def test_second_copies_are_skipped_at_any_resolution(now, expr, expected):
    result = _next_at(now, expr, NEW_YORK)

    assert result == expected
    assert not scheduler._is_repeated_wall_time(
        datetime.fromisoformat(result).astimezone(scheduler.ZoneInfo(NEW_YORK)), now,
    )


@pytest.mark.parametrize(
    "alias,fixed",
    [("@yearly", True), ("@annually", True), ("@monthly", True), ("@midnight", True),
     ("@daily", True), ("@weekly", True), ("@hourly", False), ("@reboot", False),
     ("@nonsense", False)],
)
def test_aliases_are_read_through_croniter(alias, fixed):
    assert _is_fixed_time_cron(alias) is fixed
