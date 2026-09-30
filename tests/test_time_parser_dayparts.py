"""C4 day-part grammar, exact local instants, and legacy grammar boundaries."""
from datetime import UTC, datetime
from zoneinfo import ZoneInfo

import pytest

from src.tools.time_parser import parse_time

NY = ZoneInfo("America/New_York")
NOW = datetime(2026, 3, 18, 10, tzinfo=NY)


@pytest.mark.parametrize("expression, expected", [
    ("noon", "2026-03-18T12:00:00-04:00"),
    ("midnight", "2026-03-19T00:00:00-04:00"),
    ("8 tonight", "2026-03-18T20:00:00-04:00"),
    ("8 this evening", "2026-03-18T20:00:00-04:00"),
    ("8 in the evening", "2026-03-18T20:00:00-04:00"),
    ("3 this afternoon", "2026-03-18T15:00:00-04:00"),
    ("3 in the afternoon", "2026-03-18T15:00:00-04:00"),
    ("11 this morning", "2026-03-18T11:00:00-04:00"),
    ("11 in the morning", "2026-03-18T11:00:00-04:00"),
    ("this evening at 8", "2026-03-18T20:00:00-04:00"),
    ("at 8:30 tonight", "2026-03-18T20:30:00-04:00"),
    ("12 in the morning", "2026-03-19T00:00:00-04:00"),
    ("12 this afternoon", "2026-03-18T12:00:00-04:00"),
    ("20:00 tonight", "2026-03-18T20:00:00-04:00"),
    ("08:00 in the morning", "2026-03-19T08:00:00-04:00"),
    ("8 P.M. tonight", "2026-03-18T20:00:00-04:00"),
    ("noon this afternoon", "2026-03-18T12:00:00-04:00"),
    ("midnight tonight", "2026-03-19T00:00:00-04:00"),
    ("midnight in the morning", "2026-03-19T00:00:00-04:00"),
    ("tomorrow at noon", "2026-03-19T12:00:00-04:00"),
    ("tomorrow at midnight", "2026-03-20T00:00:00-04:00"),
    ("today at midnight", "2026-03-19T00:00:00-04:00"),
    ("friday midnight", "2026-03-21T00:00:00-04:00"),
    ("next friday at noon", "2026-03-20T12:00:00-04:00"),
    ("noon tomorrow", "2026-03-19T12:00:00-04:00"),
    ("midnight on friday", "2026-03-21T00:00:00-04:00"),
    ("tomorrow at 8 in the evening", "2026-03-19T20:00:00-04:00"),
    ("8 in the evening tomorrow", "2026-03-19T20:00:00-04:00"),
    ("8 tonight on friday", "2026-03-20T20:00:00-04:00"),
    ("friday this evening at 8", "2026-03-20T20:00:00-04:00"),
    ("in 2 days at noon", "2026-03-20T12:00:00-04:00"),
    ("in 2 days at midnight", "2026-03-21T00:00:00-04:00"),
    ("in 2 days at 8 in the evening", "2026-03-20T20:00:00-04:00"),
])
def test_day_parts_and_days(expression, expected):
    assert parse_time(expression, NOW) == expected


@pytest.mark.parametrize("zone", [
    "ET", "EST", "America/New_York", "in America/New_York", "New York time",
])
@pytest.mark.parametrize("expression, expected", [
    ("8 tonight", "2026-03-18T20:00:00-04:00"),
    ("tomorrow at noon", "2026-03-19T12:00:00-04:00"),
    ("tomorrow at midnight", "2026-03-20T00:00:00-04:00"),
    ("tomorrow at 8 in the evening", "2026-03-19T20:00:00-04:00"),
])
def test_explicit_zone_composition(expression, expected, zone):
    assert parse_time(f"{expression} {zone}", NOW.astimezone(UTC)) == expected


@pytest.mark.parametrize("day, date", [
    ("tomorrow", "2026-03-19"),
    ("next friday", "2026-03-20"),
])
@pytest.mark.parametrize("part, hour", [
    ("morning", "08"),
    ("afternoon", "20"),
    ("evening", "20"),
])
@pytest.mark.parametrize("zone", [None, "ET"])
def test_day_before_leading_daypart_and_clock(day, date, part, hour, zone):
    expression = f"{day} in the {part} at 8"
    if zone:
        expression += f" {zone}"
    expected = f"{date}T{hour}:00:00-04:00"
    now = NOW.astimezone(UTC) if zone else NOW
    assert parse_time(expression, now) == expected


@pytest.mark.parametrize("expression", [
    "8am tonight", "8 A.M. this evening", "20:00 in the morning",
    "tomorrow at 8am in the evening", "8pm this morning", "0:00 tonight",
    "8 this morning in the evening", "noon in the morning", "13:00 this morning",
    "tomorrow in the morning at 8pm", "next friday in the afternoon at 8am",
])
def test_contradictions_are_rejected(expression):
    with pytest.raises(ValueError, match="[Cc]ontradict"):
        parse_time(expression, NOW)


@pytest.mark.parametrize("expression", [
    "8:00 please", "8:00 tonight please", "8:00 at 9pm",
    "8:00 tonight tomorrow friday", "tomorrow at 8:00 tonight friday", "noon please",
    "8", "13 tonight", "24:00", "24:01", "8:60 tonight", "0am", "13pm",
    "8 in the evening in Mars Standard Time", "8 tonight CST", "noon PST",
    "8 tonight in NotAReal/Zone", "8 tonight XYZ",
])
def test_closed_grammar_and_zone_rejection(expression):
    with pytest.raises(ValueError):
        parse_time(expression, NOW)


def test_uppercase_named_clocks_are_not_zone_abbreviations():
    assert parse_time("at NOON", NOW) == "2026-03-18T12:00:00-04:00"
    assert parse_time("at MIDNIGHT", NOW) == "2026-03-19T00:00:00-04:00"


@pytest.mark.parametrize("tail", ["tonight", "in the morning", "this afternoon"])
def test_duration_tails_do_not_turn_duration_components_into_clocks(tail):
    assert parse_time(f"in 1 hour 30 minutes {tail}", NOW) == (
        "2026-03-18T11:30:00-04:00"
    )
    with pytest.raises(ValueError, match="Unknown time unit: fortnights"):
        parse_time(f"in 1 hour 30 fortnights {tail}", NOW)


def test_explicit_zone_uses_local_day_before_midnight_rollover():
    now = datetime(2026, 3, 18, 1, tzinfo=UTC)
    assert parse_time("midnight ET", now) == "2026-03-18T00:00:00-04:00"


@pytest.mark.parametrize("expression, now, expected", [
    ("midnight", datetime(2026, 3, 8, 0, 30, tzinfo=NY), "2026-03-09T00:00:00-04:00"),
    ("noon", datetime(2026, 3, 8, 0, 30, tzinfo=NY), "2026-03-08T12:00:00-04:00"),
    ("1:30 in the morning", datetime(2026, 11, 1, 1, 45, tzinfo=NY),
     "2026-11-01T01:30:00-05:00"),
    ("tomorrow at 2:30 in the morning", datetime(2026, 3, 7, 12, tzinfo=NY),
     "2026-03-08T03:30:00-04:00"),
])
def test_dst_rules_still_apply(expression, now, expected):
    assert parse_time(expression, now) == expected
