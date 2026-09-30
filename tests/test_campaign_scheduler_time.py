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


NEW_YORK_NOW = datetime(2026, 9, 29, 10, tzinfo=ZoneInfo("America/New_York"))


@pytest.mark.parametrize("case", ["lower", "upper", "title", "mixed"])
@pytest.mark.parametrize("expression,expected", [
    ("2:30 pm", "2026-09-29T14:30:00-04:00"),
    ("2 pm", "2026-09-29T14:00:00-04:00"),
    ("12:15 pm", "2026-09-29T12:15:00-04:00"),
    ("at 5 pm", "2026-09-29T17:00:00-04:00"),
    ("tomorrow 2:30 pm", "2026-09-30T14:30:00-04:00"),
    ("12 am", "2026-09-30T00:00:00-04:00"),
    ("12 pm", "2026-09-29T12:00:00-04:00"),
    ("2:30pm", "2026-09-29T14:30:00-04:00"),
    ("2 am", "2026-09-30T02:00:00-04:00"),
])
def test_meridiem_suffix_is_not_a_timezone(expression, expected, case):
    # Change only the meridiem token, including both mixed-case spellings.
    token = expression[-2:]
    token = token[0] + token[1].upper() if case == "mixed" else getattr(token, case)()
    expression = expression[:-2] + token
    assert parse_time(expression, now=NEW_YORK_NOW) == expected


@pytest.mark.parametrize("suffix", ["am", "AM", "Am", "aM", "pm", "PM", "Pm", "pM"])
@pytest.mark.parametrize("clock", ["13", "13:00"])
def test_spaced_invalid_meridiem_clock_reaches_hour_validation(clock, suffix):
    with pytest.raises(ValueError) as exc:
        parse_time(f"{clock} {suffix}", now=NEW_YORK_NOW)
    assert str(exc.value) == "AM/PM clock hours must be between 1 and 12"


@pytest.mark.parametrize("meridiem", ["pm", "PM"])
@pytest.mark.parametrize("clock,zone", [
    ("5", "ET"), ("5", "EST"), ("5:00", "America/New_York"),
])
def test_meridiem_with_explicit_timezone(clock, zone, meridiem):
    assert parse_time(f"{clock} {meridiem} {zone}", now=NEW_YORK_NOW) == (
        "2026-09-29T17:00:00-04:00"
    )


@pytest.mark.parametrize("meridiem", ["pm", "PM"])
@pytest.mark.parametrize("zone", ["EDT", "PST", "edt", "pst"])
def test_meridiem_does_not_allow_ambiguous_timezone(meridiem, zone):
    with pytest.raises(ValueError) as exc:
        parse_time(f"5 {meridiem} {zone}", now=NEW_YORK_NOW)
    assert str(exc.value) == (
        f"Timezone abbreviation '{zone}' is ambiguous or unsupported; "
        "use an IANA zone such as America/New_York"
    )


@pytest.mark.parametrize("zone", ["Atlantis", "am", "AM", "pm", "PM"])
def test_unknown_explicit_zone_phrase_still_fails_closed(zone):
    with pytest.raises(ValueError, match="(?:Unrecognized timezone|Timezone abbreviation)"):
        parse_time(f"5 PM in {zone}", now=NEW_YORK_NOW)


@pytest.mark.parametrize("expression", ["14:30 tomorrow", "tomorrow 14:30"])
def test_twenty_four_hour_day_orders_keep_exact_instant(expression):
    assert parse_time(expression, now=NEW_YORK_NOW) == "2026-09-30T14:30:00-04:00"
