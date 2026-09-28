"""Coverage for src/tools/time_parser.py (RFC-006 P6).

Pure-logic natural-language time parsing. Every test injects an explicit ``now``
(a fixed Wednesday noon UTC) so results are fully deterministic — no wall clock.
"""
from __future__ import annotations

from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

from src.tools import time_parser
from src.tools.time_parser import (
    _next_weekday,
    _split_time_of_day,
    parse_time,
    set_default_timezone,
)

# 2026-03-18 is a Wednesday.
NOW = datetime(2026, 3, 18, 12, 0, tzinfo=ZoneInfo("UTC"))


class TestParseTimeOfDay:
    def test_12_hour(self):
        assert _split_time_of_day("9am")[0] == (9, 0)
        assert _split_time_of_day("9:30pm")[0] == (21, 30)
        assert _split_time_of_day("12am")[0] == (0, 0)   # midnight
        assert _split_time_of_day("12pm")[0] == (12, 0)  # noon

    def test_24_hour(self):
        assert _split_time_of_day("17:00")[0] == (17, 0)
        assert _split_time_of_day("09:30")[0] == (9, 30)

    def test_bare_hour_is_none(self):
        assert _split_time_of_day("9") is None


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


NY = ZoneInfo("America/New_York")


def _elapsed(expression: str, now: datetime) -> timedelta:
    result = datetime.fromisoformat(parse_time(expression, now))
    return result.astimezone(UTC) - now.astimezone(UTC)


class TestCompoundDurations:
    @pytest.mark.parametrize("expression", [
        "in 1 hour 30 minutes", "in 1 hour and 30 minutes", "in 1 hour, 30 minutes"
    ])
    def test_compound_hours_and_minutes(self, expression):
        assert parse_time(expression, NOW).startswith("2026-03-18T13:30")

    def test_days_weeks_and_elapsed_units(self):
        assert parse_time("in 2 days 3 hours", NOW).startswith("2026-03-20T15:00")
        assert parse_time("in 1 week 2 days", NOW).startswith("2026-03-27T12:00")

    @pytest.mark.parametrize("expression", ["in 2 days at 9am", "in 2 days 9am"])
    def test_days_then_clock(self, expression):
        assert parse_time(expression, NOW).startswith("2026-03-20T09:00")

    def test_unknown_later_unit(self):
        with pytest.raises(ValueError, match="Unknown time unit: fortnights"):
            parse_time("in 1 hour 30 fortnights", NOW)

    @pytest.mark.parametrize("expression", [
        "in 1 hour 30m", "in 1 hour and a half", "in 2 hours tomorrow",
        "in 2 hours at 5pm", "in 2 days on friday", "in 0 hours at 5pm",
    ])
    def test_rejects_unconsumed_time_words(self, expression):
        with pytest.raises(ValueError, match="Cannot parse time expression"):
            parse_time(expression, NOW)

    @pytest.mark.parametrize("tail", [
        " please", " from now", " or so", " at the latest", " to check the 3 servers",
        " tonight", " today",
    ])
    def test_harmless_tails(self, tail):
        assert parse_time("in 2 hours" + tail, NOW) == parse_time("in 2 hours", NOW)
        assert parse_time("at 5pm" + tail, NOW) == parse_time("at 5pm", NOW)


class TestClockTimeWithDay:
    @pytest.mark.parametrize("expression", ["at 5pm tomorrow", "5pm tomorrow"])
    def test_tomorrow_after_time(self, expression):
        assert parse_time(expression, NOW).startswith("2026-03-19T17:00")

    @pytest.mark.parametrize("expression, expected", [
        ("at 9am on monday", "2026-03-23T09:00"),
        ("3pm friday", "2026-03-20T15:00"),
        ("friday 3pm", "2026-03-20T15:00"),
        ("next friday 3pm", "2026-03-20T15:00"),
        ("sat at 3pm", "2026-03-21T15:00"),
    ])
    def test_day_and_time_orders(self, expression, expected):
        assert parse_time(expression, NOW).startswith(expected)


class TestDaylightSaving:
    def test_elapsed_hours_across_spring_forward(self):
        assert _elapsed("in 24 hours", datetime(2026, 3, 7, 12, tzinfo=NY)) == timedelta(hours=24)
        assert _elapsed("in 2 hours", datetime(2026, 3, 8, 1, 30, tzinfo=NY)) == timedelta(hours=2)

    def test_elapsed_hours_across_fall_back(self):
        now = datetime(2026, 11, 1, 1, 30, tzinfo=NY)
        assert parse_time("in 1 hour", now) == "2026-11-01T01:30:00-05:00"
        assert _elapsed("in 24 hours", datetime(2026, 10, 31, 12, tzinfo=NY)) == timedelta(hours=24)

    def test_days_keep_wall_clock(self):
        now = datetime(2026, 3, 7, 12, tzinfo=NY)
        assert parse_time("in 1 day", now) == "2026-03-08T12:00:00-04:00"
        assert parse_time("tomorrow at 9am", now) == "2026-03-08T09:00:00-04:00"

    def test_skipped_and_repeated_clock_times(self):
        assert parse_time("tomorrow at 2:30am", datetime(2026, 3, 7, 12, tzinfo=NY)) == (
            "2026-03-08T03:30:00-04:00"
        )
        assert parse_time("tomorrow at 1:30am", datetime(2026, 10, 31, 12, tzinfo=NY)) == (
            "2026-11-01T01:30:00-04:00"
        )

    def test_configured_zone_when_now_omitted(self, monkeypatch):
        class FixedClock(datetime):
            @classmethod
            def now(cls, tz=None):
                return datetime(2026, 3, 8, 6, 30, tzinfo=UTC).astimezone(tz)

        monkeypatch.setattr(time_parser, "_default_tz", NY)
        monkeypatch.setattr(time_parser, "datetime", FixedClock)
        result = datetime.fromisoformat(parse_time("in 2 hours"))
        assert result.astimezone(UTC) == datetime(2026, 3, 8, 8, 30, tzinfo=UTC)


class TestExplicitTimezone:
    @pytest.mark.parametrize("expression", [
        "tomorrow at 9am in America/New_York",
        "tomorrow at 9am EST",
        "tomorrow at 9am ET",
        "tomorrow at 9am New York time",
    ])
    def test_explicit_new_york_zone_overrides_default_and_obeys_dst(self, expression):
        now = datetime(2026, 3, 18, 12, tzinfo=UTC)
        assert parse_time(expression, now) == "2026-03-19T09:00:00-04:00"

    def test_explicit_zone_converts_now_before_resolving_relative_dates(self):
        # 01:00 UTC on Wednesday is still Tuesday evening in New York.
        now = datetime(2026, 3, 18, 1, tzinfo=UTC)
        assert parse_time("tomorrow at 9am America/New_York", now) == (
            "2026-03-18T09:00:00-04:00"
        )

    @pytest.mark.parametrize("expression", [
        "tomorrow at 9am in NotAReal/Zone",
        "tomorrow at 9am in Mars Standard Time",
        "tomorrow at 9am CST",
        "tomorrow at 9am in CST",
        "tomorrow at 9am PST",
    ])
    def test_rejects_unknown_or_ambiguous_explicit_zone(self, expression):
        with pytest.raises(ValueError, match="timezone|Timezone"):
            parse_time(expression, NOW)

    def test_utc_alias_is_explicit(self):
        assert parse_time("tomorrow at 9am UTC", NOW) == "2026-03-19T09:00:00+00:00"
