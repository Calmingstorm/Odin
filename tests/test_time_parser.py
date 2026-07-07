"""Coverage for src/tools/time_parser.py (RFC-006 P6).

Pure-logic natural-language time parsing. Every test injects an explicit ``now``
(a fixed Wednesday noon UTC) so results are fully deterministic — no wall clock.
"""
from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

import pytest

from src.tools import time_parser
from src.tools.time_parser import (
    _next_weekday,
    _parse_time_of_day,
    parse_time,
    set_default_timezone,
)

# 2026-03-18 is a Wednesday.
NOW = datetime(2026, 3, 18, 12, 0, tzinfo=ZoneInfo("UTC"))


class TestParseTimeOfDay:
    def test_12_hour(self):
        assert _parse_time_of_day("9am") == (9, 0)
        assert _parse_time_of_day("9:30pm") == (21, 30)
        assert _parse_time_of_day("12am") == (0, 0)   # midnight
        assert _parse_time_of_day("12pm") == (12, 0)  # noon

    def test_24_hour(self):
        assert _parse_time_of_day("17:00") == (17, 0)
        assert _parse_time_of_day("09:30") == (9, 30)

    def test_bare_hour_is_none(self):
        assert _parse_time_of_day("9") is None


class TestNextWeekday:
    def test_wraps_to_next_week(self):
        # NOW is Wednesday (2). Next Wednesday is +7 days.
        assert _next_weekday(NOW, 2).day == 25
        # Next Friday (4) is +2 days.
        assert _next_weekday(NOW, 4).day == 20


class TestRelative:
    def test_in_units(self):
        assert parse_time("in 30 minutes", NOW).startswith("2026-03-18T12:30")
        assert parse_time("in 2 hours", NOW).startswith("2026-03-18T14:00")
        assert parse_time("in 1 day", NOW).startswith("2026-03-19T12:00")

    def test_in_unknown_unit(self):
        with pytest.raises(ValueError, match="Unknown time unit"):
            parse_time("in 5 fortnights", NOW)


class TestTomorrowToday:
    def test_tomorrow_default_and_timed(self):
        assert parse_time("tomorrow", NOW).startswith("2026-03-19T09:00")
        assert parse_time("tomorrow at 3pm", NOW).startswith("2026-03-19T15:00")

    def test_tomorrow_bad_time(self):
        with pytest.raises(ValueError, match="Cannot parse time"):
            parse_time("tomorrow at bogus", NOW)

    def test_today_timed_and_requires_time(self):
        assert parse_time("today at 5pm", NOW).startswith("2026-03-18T17:00")
        with pytest.raises(ValueError, match="requires a time"):
            parse_time("today", NOW)

    def test_today_bad_time(self):
        with pytest.raises(ValueError, match="Cannot parse time"):
            parse_time("today at nope", NOW)


class TestWeekdays:
    def test_next_dayname(self):
        assert parse_time("next Monday", NOW).startswith("2026-03-23T09:00")
        assert parse_time("next Monday at 3pm", NOW).startswith("2026-03-23T15:00")

    def test_next_dayname_bad_time(self):
        with pytest.raises(ValueError, match="Cannot parse time"):
            parse_time("next Monday at zzz", NOW)

    def test_bare_dayname(self):
        assert parse_time("friday", NOW).startswith("2026-03-20T09:00")
        assert parse_time("friday at 10am", NOW).startswith("2026-03-20T10:00")

    def test_bare_dayname_bad_time(self):
        with pytest.raises(ValueError, match="Cannot parse time"):
            parse_time("friday at ???", NOW)


class TestAtAndBareTime:
    def test_at_future_today(self):
        assert parse_time("at 5pm", NOW).startswith("2026-03-18T17:00")

    def test_at_past_rolls_to_tomorrow(self):
        # 9am is before NOW (noon) → tomorrow
        assert parse_time("at 9am", NOW).startswith("2026-03-19T09:00")

    def test_at_bad_time(self):
        with pytest.raises(ValueError, match="Cannot parse time"):
            parse_time("at half-past-something", NOW)

    def test_bare_time_future_and_past(self):
        assert parse_time("5pm", NOW).startswith("2026-03-18T17:00")
        assert parse_time("9am", NOW).startswith("2026-03-19T09:00")  # past → tomorrow

    def test_unparseable(self):
        with pytest.raises(ValueError, match="Cannot parse time expression"):
            parse_time("sometime next century", NOW)


class TestDefaults:
    def test_now_none_uses_wall_clock(self):
        # No now → uses the module default tz; just assert it produces ISO output.
        out = parse_time("in 1 hour")
        assert "T" in out and out.count(":") >= 2

    def test_naive_now_gets_tz(self):
        naive = datetime(2026, 3, 18, 12, 0)  # no tzinfo
        assert parse_time("in 1 hour", naive).startswith("2026-03-18T13:00")

    def test_set_default_timezone(self):
        try:
            set_default_timezone("America/New_York")
            assert time_parser._default_tz.key == "America/New_York"
        finally:
            set_default_timezone("UTC")  # restore
