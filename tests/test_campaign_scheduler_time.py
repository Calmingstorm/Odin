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


TRAILING_NOW = datetime(2026, 9, 29, 23, 30, tzinfo=ZoneInfo("America/New_York"))


@pytest.mark.parametrize("expression", [
    "2:30 tomorrow afternoon", "2:30 xyz", "2:30 please",
    "friday at 2:30 xyz", "tomorrow at 14:30 please", "14:30 tomorrow please",
    "at 14:30 please", "today at 14:30 please", "next friday at 14:30 please",
    "in 2 days at 14:30 please", "14:30 friday please", "14:30 on friday please",
    "14:30 next friday please", "14:30 tomorrow friday", "14:30 on tomorrow",
    "tomorrow at 14:30 friday", "14:30, please", "14:30tomorrow",
])
def test_bare_clock_rejects_trailing_prose_on_every_path(expression):
    with pytest.raises(ValueError, match="Cannot parse time expression"):
        parse_time(expression, now=TRAILING_NOW)


@pytest.mark.parametrize("expression, expected", [
    ("2:30 in the afternoon", "2026-09-30T14:30:00-04:00"),
    ("tomorrow at 2:30 in the afternoon", "2026-09-30T14:30:00-04:00"),
    ("2:30 this afternoon", "2026-09-30T14:30:00-04:00"),
    ("8:00 tonight", "2026-09-30T20:00:00-04:00"),
    ("friday at 7:00 in the evening", "2026-10-02T19:00:00-04:00"),
])
def test_bare_clock_recognized_dayparts_have_exact_instants(expression, expected):
    assert parse_time(expression, now=TRAILING_NOW) == expected


@pytest.mark.parametrize("marker", ["a.m.", "a.m", "am.", "p.m.", "p.m", "pm."])
@pytest.mark.parametrize("case", ["lower", "upper", "title"])
@pytest.mark.parametrize("space", ["", " "])
@pytest.mark.parametrize("template", ["2:30{}", "tomorrow 2:30{}", "at 2:30{} tomorrow"])
def test_dotted_meridiem_is_a_clock_marker(marker, case, space, template):
    expression = template.format(space + getattr(marker, case)())
    hour = "02" if marker.startswith("a") else "14"
    assert parse_time(expression, now=TRAILING_NOW) == f"2026-09-30T{hour}:30:00-04:00"


def test_dotted_meridiem_without_minutes():
    assert parse_time("5 P.M.", now=TRAILING_NOW) == "2026-09-30T17:00:00-04:00"


@pytest.mark.parametrize("marker", ["p.m.", "P.M.", "p.m", "a.m.", "A.M"])
@pytest.mark.parametrize("prefix", ["", "tomorrow ", "at ", "friday at "])
def test_dotted_meridiem_enforces_twelve_hour_range(marker, prefix):
    with pytest.raises(ValueError, match="AM/PM clock hours must be between 1 and 12"):
        parse_time(f"{prefix}14:30 {marker}", now=TRAILING_NOW)


@pytest.mark.parametrize("expression,expected", [
    ("14:30", "2026-09-30T14:30:00-04:00"),
    ("at 14:30", "2026-09-30T14:30:00-04:00"),
    ("14:30 tomorrow", "2026-09-30T14:30:00-04:00"),
    ("14:30 friday", "2026-10-02T14:30:00-04:00"),
    ("14:30 on friday", "2026-10-02T14:30:00-04:00"),
    ("14:30 next friday", "2026-10-02T14:30:00-04:00"),
    ("tomorrow 14:30", "2026-09-30T14:30:00-04:00"),
    ("tomorrow at 14:30", "2026-09-30T14:30:00-04:00"),
    ("next friday at 14:30", "2026-10-02T14:30:00-04:00"),
    ("today at 14:30", "2026-09-29T14:30:00-04:00"),
    ("in 2 days at 14:30", "2026-10-01T14:30:00-04:00"),
    ("9am please", "2026-09-30T09:00:00-04:00"),
    ("9:15am, thanks", "2026-09-30T09:15:00-04:00"),
    ("3pm in the afternoon", "2026-09-30T15:00:00-04:00"),
])
def test_trailing_fix_preserves_exact_clock_instants(expression, expected):
    assert parse_time(expression, now=TRAILING_NOW) == expected


@pytest.mark.parametrize("zone", ["ET", "EST", "America/New_York", "in America/New_York", "in ET"])
@pytest.mark.parametrize("clock", ["14:30", "2:30 PM", "2:30 P.M."])
def test_trailing_fix_preserves_explicit_zones(clock, zone):
    assert parse_time(f"{clock} {zone}", now=TRAILING_NOW) == "2026-09-30T14:30:00-04:00"


@pytest.mark.parametrize("zone", ["EDT", "PST"])
@pytest.mark.parametrize("clock", ["14:30", "2:30 PM", "2:30 P.M."])
def test_trailing_fix_preserves_ambiguous_zone_rejection(clock, zone):
    with pytest.raises(ValueError, match="ambiguous or unsupported"):
        parse_time(f"{clock} {zone}", now=TRAILING_NOW)


@pytest.mark.parametrize("clock", ["1:30", "1:30 a.m.", "1:30 A.M."])
@pytest.mark.parametrize("fold,minute,offset", [
    (0, 15, "-04:00"), (0, 45, "-05:00"), (1, 15, "-05:00"),
])
def test_trailing_fix_preserves_fold_instants(clock, fold, minute, offset):
    now = datetime(2026, 11, 1, 1, minute, tzinfo=ZoneInfo("America/New_York"), fold=fold)
    assert parse_time(clock, now=now) == f"2026-11-01T01:30:00{offset}"


@pytest.mark.parametrize("suffix", ["am", "AM", "Am", "aM", "pm", "PM", "Pm", "pM"])
@pytest.mark.parametrize("clock,hour,minute", [
    ("2", 2, "00"), ("2:30", 2, "30"), ("12", 12, "00"), ("12:15", 12, "15"),
])
@pytest.mark.parametrize("space", ["", " "])
def test_trailing_fix_preserves_prior_meridiem_forms(suffix, clock, hour, minute, space):
    hour = hour % 12 + (12 if suffix.lower() == "pm" else 0)
    assert parse_time(f"{clock}{space}{suffix}", now=TRAILING_NOW) == (
        f"2026-09-30T{hour:02d}:{minute}:00-04:00"
    )
