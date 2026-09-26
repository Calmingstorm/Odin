"""Natural language time expression parser.

Converts expressions like 'in 2 hours', 'tomorrow at 9am', 'next Monday at 3pm'
to ISO datetime strings. Used as a helper for the LLM when scheduling reminders.
"""

from __future__ import annotations

import re
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

_default_tz = ZoneInfo("UTC")


def set_default_timezone(tz_name: str) -> None:
    """Set the default timezone used by parse_time when no explicit time is given."""
    global _default_tz
    _default_tz = ZoneInfo(tz_name)


# Day name → weekday number (Monday=0)
DAY_NAMES = {
    "monday": 0,
    "tuesday": 1,
    "wednesday": 2,
    "thursday": 3,
    "friday": 4,
    "saturday": 5,
    "sunday": 6,
    "mon": 0,
    "tue": 1,
    "tues": 1,
    "wed": 2,
    "thu": 3,
    "thur": 3,
    "thurs": 3,
    "fri": 4,
    "sat": 5,
    "sun": 6,
}

UNIT_SECONDS = {
    "second": 1,
    "seconds": 1,
    "sec": 1,
    "secs": 1,
    "s": 1,
    "minute": 60,
    "minutes": 60,
    "min": 60,
    "mins": 60,
    "m": 60,
    "hour": 3600,
    "hours": 3600,
    "hr": 3600,
    "hrs": 3600,
    "h": 3600,
    "day": 86400,
    "days": 86400,
    "d": 86400,
    "week": 604800,
    "weeks": 604800,
    "w": 604800,
}

_DAY_WORDS = "|".join(sorted(DAY_NAMES, key=len, reverse=True))
_MONTHS = (
    "january|february|march|april|june|july|august|september|october|november|december"
)
_TIME_12H = re.compile(r"(\d{1,2})(?::(\d{2}))?\s*(am|pm)")
_TIME_24H = re.compile(r"(\d{1,2}):(\d{2})$")
_MORE_DURATION = re.compile(r"\s*(?:,\s*)?(?:and\s+)?(\d+)\s+(\w+)")
_CLOCK_LEAD = re.compile(r"[\s,]*(?:at\s+)?")
_DAY_AFTER_TIME = re.compile(
    r"[\s,]*(?:on\s+)?(?:(tomorrow)|(?:next\s+)?(" + _DAY_WORDS + r"))\b"
)
_CONTINUES_TIME = re.compile(
    r"[\s,]*(?:(?:and|at|on|by)\s+)?(?:the\s+)?"
    + r"(?:\d|(?:an?\s+)?(?:half|quarter)\b|(?:tomorrow|noon|midnight)\b"
    + r"|(?:(?:next|this)\s+)?(?:" + _DAY_WORDS + r")\b"
    + r"|(?:next|this)\s+(?:week|weekend|month|year)\b|(?:" + _MONTHS
    + r")\b|may\s+\d)"
)


def _split_time_of_day(text: str) -> tuple[tuple[int, int], str] | None:
    """Return a leading clock time and the unconsumed text."""
    text = text.strip().lower()

    # 12-hour: 9am, 9:30pm, 9:30 am
    m = _TIME_12H.match(text)
    if m:
        hour = int(m.group(1))
        minute = int(m.group(2) or 0)
        if m.group(3) == "pm" and hour != 12:
            hour += 12
        elif m.group(3) == "am" and hour == 12:
            hour = 0
        return (hour, minute), text[m.end() :]

    # 24-hour: 17:00, 09:30
    m = _TIME_24H.match(text)
    if m:
        return (int(m.group(1)), int(m.group(2))), ""

    # Bare hour: "9" — too ambiguous, skip
    return None


def _local(instant: datetime, tz) -> datetime:
    return instant.astimezone(UTC).astimezone(tz)


def _at_clock(day: datetime, hour: int, minute: int) -> datetime:
    local_time = day.replace(hour=hour, minute=minute, second=0, microsecond=0, fold=0)
    return _local(local_time, day.tzinfo)


def _reject_unused(rest: str, expression: str) -> None:
    if _CONTINUES_TIME.match(rest):
        raise ValueError(
            f"Cannot parse time expression: '{expression}' — could not use "
            f"'{rest.strip(' ,')}'. Try formats like: 'in 1 hour 30 minutes', "
            "'tomorrow at 9am', 'next Monday at 3pm', 'at 5pm tomorrow'"
        )


def _clock_then_day(now: datetime, hit, expression: str) -> datetime:
    (hour, minute), rest = hit
    day = _DAY_AFTER_TIME.match(rest)
    if day:
        target = (
            now + timedelta(days=1)
            if day.group(1)
            else _next_weekday(now, DAY_NAMES[day.group(2)])
        )
        _reject_unused(rest[day.end() :], expression)
        return _at_clock(target, hour, minute)
    _reject_unused(rest, expression)
    result = _at_clock(now, hour, minute)
    return _at_clock(now + timedelta(days=1), hour, minute) if result <= now else result


def _time_after_day(rest: str, expression: str) -> tuple[int, int]:
    lead = re.match(r"\s+(?:at\s+)?", rest)
    hit = _split_time_of_day(rest[lead.end() :]) if lead else None
    if hit is None:
        found = re.search(r"at\s+(.+)", rest)
        if found:
            hit = _split_time_of_day(found.group(1))
            if hit is None:
                raise ValueError(f"Cannot parse time: {found.group(1)}")
    if hit is None:
        _reject_unused(rest, expression)
        return 9, 0
    _reject_unused(hit[1], expression)
    return hit[0]


def _next_weekday(now: datetime, target_weekday: int) -> datetime:
    """Return the next occurrence of target_weekday after now."""
    days_ahead = target_weekday - now.weekday()
    if days_ahead <= 0:
        days_ahead += 7
    return now + timedelta(days=days_ahead)


def parse_time(expression: str, now: datetime | None = None) -> str:
    """Parse a natural language time expression into an ISO datetime string."""
    if now is None:
        now = datetime.now(_default_tz)
    elif now.tzinfo is None:
        now = now.replace(tzinfo=_default_tz)
    text = expression.strip().lower()

    m = re.match(r"in\s+(\d+)\s+(\w+)", text)
    if m:
        days = seconds = 0
        clock = None
        elapsed_units = False
        while m:
            amount, unit = int(m.group(1)), m.group(2)
            if unit not in UNIT_SECONDS:
                raise ValueError(f"Unknown time unit: {unit}")
            if UNIT_SECONDS[unit] >= 86400:
                days += amount * UNIT_SECONDS[unit] // 86400
            else:
                elapsed_units = True
                seconds += amount * UNIT_SECONDS[unit]
            pos = m.end()
            clock = _split_time_of_day(text[_CLOCK_LEAD.match(text, pos).end() :])
            if clock:
                break
            m = _MORE_DURATION.match(text, pos)
        if clock:
            if elapsed_units:
                raise ValueError(
                    f"Cannot parse time expression: '{expression}' — a clock time can "
                    "follow days or weeks ('in 2 days at 9am'), not hours or minutes"
                )
            _reject_unused(clock[1], expression)
            return _at_clock(now + timedelta(days=days), *clock[0]).isoformat()
        _reject_unused(text[pos:], expression)
        result = now
        if days:
            result = _local((now + timedelta(days=days)).replace(fold=0), now.tzinfo)
        if seconds:
            result = _local(result.astimezone(UTC) + timedelta(seconds=seconds), now.tzinfo)
        return result.isoformat()

    if text.startswith("tomorrow"):
        time_part = re.sub(r"^tomorrow\s*(at\s*)?", "", text).strip()
        if time_part:
            hit = _split_time_of_day(time_part)
            if hit is None:
                raise ValueError(f"Cannot parse time: {time_part}")
            _reject_unused(hit[1], expression)
            hour, minute = hit[0]
        else:
            hour, minute = 9, 0
        return _at_clock(now + timedelta(days=1), hour, minute).isoformat()

    if text.startswith("today"):
        time_part = re.sub(r"^today\s*(at\s*)?", "", text).strip()
        if time_part:
            hit = _split_time_of_day(time_part)
            if hit is None:
                raise ValueError(f"Cannot parse time: {time_part}")
            _reject_unused(hit[1], expression)
            hour, minute = hit[0]
        else:
            raise ValueError("'today' requires a time (e.g. 'today at 5pm')")
        return _at_clock(now, hour, minute).isoformat()

    m = re.match(r"next\s+(\w+)", text)
    if m and m.group(1) in DAY_NAMES:
        target_day = _next_weekday(now, DAY_NAMES[m.group(1)])
        rest = text[m.end() :]
        at = re.match(r"\s+at\s+(.+)", rest)
        if at:
            hit = _split_time_of_day(at.group(1))
            if hit is None:
                raise ValueError(f"Cannot parse time: {at.group(1)}")
            _reject_unused(hit[1], expression)
            hour, minute = hit[0]
        else:
            hour, minute = _time_after_day(rest, expression)
        return _at_clock(target_day, hour, minute).isoformat()

    first_word = text.split()[0] if text.split() else ""
    if first_word in DAY_NAMES:
        target_day = _next_weekday(now, DAY_NAMES[first_word])
        hour, minute = _time_after_day(text[len(first_word) :], expression)
        return _at_clock(target_day, hour, minute).isoformat()

    m = re.match(r"at\s+(.+)", text)
    if m:
        hit = _split_time_of_day(m.group(1))
        if hit is None:
            raise ValueError(f"Cannot parse time: {m.group(1)}")
        return _clock_then_day(now, hit, expression).isoformat()

    hit = _split_time_of_day(text)
    if hit:
        return _clock_then_day(now, hit, expression).isoformat()

    raise ValueError(
        f"Cannot parse time expression: '{expression}'. "
        "Try formats like: 'in 30 minutes', 'tomorrow at 9am', "
        "'next Monday at 3pm', 'at 5pm'"
    )
