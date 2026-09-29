from datetime import UTC, datetime
from zoneinfo import ZoneInfo

import pytest

from src.tools.time_parser import parse_time


@pytest.mark.parametrize("fold,minute,expected", [
    (0, 15, "-04:00"), (1, 15, "-05:00"), (0, 45, "-05:00"),
])
def test_next_clock_selects_future_instant_in_repeated_hour(fold, minute, expected):
    now = datetime(2026, 11, 1, 1, minute, tzinfo=ZoneInfo("America/New_York"), fold=fold)
    result = datetime.fromisoformat(parse_time("at 1:30am", now=now))
    assert result.isoformat() == f"2026-11-01T01:30:00{expected}"
    assert result.astimezone(UTC) > now.astimezone(UTC)


def test_next_clock_after_both_folds_moves_to_next_day():
    now = datetime(2026, 11, 1, 1, 45, tzinfo=ZoneInfo("America/New_York"), fold=1)
    assert parse_time("1:30am", now=now) == "2026-11-02T01:30:00-05:00"


@pytest.mark.parametrize("hour", [0, 13, 23])
@pytest.mark.parametrize("suffix", ["am", "pm"])
def test_invalid_twelve_hour_clocks_rejected(hour, suffix):
    with pytest.raises(ValueError, match="between 1 and 12"):
        parse_time(f"today at {hour}{suffix}", now=datetime(2026, 9, 29, tzinfo=UTC))


@pytest.mark.parametrize("expression,expected", [
    ("today at 12am", "00:00"), ("today at 12pm", "12:00"),
    ("today at 1am", "01:00"), ("today at 1pm", "13:00"),
])
def test_twelve_hour_clock_boundaries(expression, expected):
    result = parse_time(expression, now=datetime(2026, 9, 29, tzinfo=UTC))
    assert result == f"2026-09-29T{expected}:00+00:00"


@pytest.mark.parametrize("clock", ["17:00", "09:30"])
@pytest.mark.parametrize("day", ["tomorrow", "friday", "next friday"])
@pytest.mark.parametrize("prefix", ["", "at "])
def test_twenty_four_hour_clock_before_day(clock, day, prefix):
    now = datetime(2026, 9, 29, 12, tzinfo=UTC)
    assert parse_time(f"{prefix}{clock} {day}", now=now) == parse_time(f"{day} at {clock}", now=now)
