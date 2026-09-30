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
_TIME_12H = re.compile(r"(\d{1,2})(?::(\d{2}))?\s*([ap]\.?m\.?)")
_TIME_24H = re.compile(r"(\d{1,2}):(\d{2})(?!\d)")
_BARE_CLOCK_TAIL = re.compile(
    r"(?:\s+(?:tomorrow|(?:on\s+|next\s+)?(?:" + _DAY_WORDS + r")))?\s*"
)
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

# Abbreviations are not reliable identifiers for time zones. EST/ET are
# explicitly treated as the colloquial US Eastern zone (including DST); other
# common abbreviations are rejected rather than guessed or silently ignored.
_ZONE_ALIASES = {"est": "America/New_York", "et": "America/New_York"}
_ZONE_ALIASES.update({"utc": "UTC", "gmt": "UTC"})
_AMBIGUOUS_ZONE_ABBREVIATIONS = {
    "ast", "bst", "cst", "ist", "mst", "pst", "adt", "cdt", "edt", "mdt", "pdt"
}
_IANA_ZONE_SUFFIX = re.compile(
    r"(?:\s+in)?\s+([a-z_+-]+(?:/[a-z0-9_+.-]+)+)$", re.IGNORECASE
)
_NAMED_ZONE_SUFFIX = re.compile(
    r"\s+(?:in\s+)?(new\s+york|eastern)(?:\s+time)?$", re.IGNORECASE
)
_ABBREVIATION_SUFFIX = re.compile(r"\s+(?:in\s+)?([a-z]{2,5})$", re.IGNORECASE)
_EXPLICIT_ZONE_PHRASE = re.compile(r"\s+in\s+([a-z][a-z0-9_+./ -]*)$", re.IGNORECASE)


def _extract_explicit_timezone(expression: str) -> tuple[str, ZoneInfo | None]:
    """Remove a recognized trailing zone, rejecting explicit but unsafe zones."""
    text = expression.strip()
    match = _IANA_ZONE_SUFFIX.search(text)
    if match:
        zone_name = match.group(1)
        try:
            zone = ZoneInfo(zone_name)
        except (KeyError, ValueError) as exc:
            raise ValueError(f"Unknown timezone: {zone_name}") from exc
        return text[: match.start()].strip(), zone

    match = _NAMED_ZONE_SUFFIX.search(text)
    if match:
        return text[: match.start()].strip(), ZoneInfo("America/New_York")

    match = _ABBREVIATION_SUFFIX.search(text)
    if match:
        abbreviation = match.group(1).lower()
        if abbreviation in _ZONE_ALIASES:
            return text[: match.start()].strip(), ZoneInfo(_ZONE_ALIASES[abbreviation])
        # Only uppercase source tokens are presumed to be explicit abbreviations;
        # ordinary prose tails retain the parser's historical behavior.
        # AM/PM are clock markers in every case, not timezone abbreviations.
        source_token = text[match.start(1) : match.end(1)]
        if abbreviation not in {"am", "pm"} and (
            source_token.isupper() or abbreviation in _AMBIGUOUS_ZONE_ABBREVIATIONS
        ):
            raise ValueError(
                f"Timezone abbreviation '{source_token}' is ambiguous or unsupported; "
                "use an IANA zone such as America/New_York"
            )

    # An explicit "in <zone>" clause is not harmless trailing prose. If it
    # was not one of the supported aliases or a valid IANA identifier, fail
    # closed instead of silently scheduling in the configured default zone.
    # Conventional time-of-day prose isn't a zone request: let the clock
    # parser give its normal actionable time-format error instead.
    if re.search(r"\s+in\s+the\s+(?:morning|afternoon|evening|night)$", text, re.IGNORECASE):
        return text, None
    match = _EXPLICIT_ZONE_PHRASE.search(text)
    if match:
        raise ValueError(
            f"Unrecognized timezone '{match.group(1).strip()}'; use an IANA zone "
            "such as America/New_York"
        )
    return text, None


def _split_time_of_day(text: str) -> tuple[tuple[int, int], str] | None:
    """Return a leading clock time and the unconsumed text."""
    text = text.strip().lower()

    # 12-hour: 9am, 9:30pm, 9:30 am, 9:30 a.m.
    m = _TIME_12H.match(text)
    if m:
        hour = int(m.group(1))
        minute = int(m.group(2) or 0)
        if not 1 <= hour <= 12:
            raise ValueError("AM/PM clock hours must be between 1 and 12")
        meridiem = m.group(3).replace(".", "")
        if meridiem == "pm" and hour != 12:
            hour += 12
        elif meridiem == "am" and hour == 12:
            hour = 0
        return (hour, minute), text[m.end() :]

    # 24-hour: 17:00, 09:30
    m = _TIME_24H.match(text)
    if m:
        rest = text[m.end() :]
        # Bare clocks must not inherit the historical 12-hour prose tolerance:
        # e.g. ignoring "tonight" after 8:00 schedules the wrong half of the day.
        # Validate here so every caller enforces the same closed tail grammar;
        # callers still reject a second day after an already selected day.
        if _BARE_CLOCK_TAIL.fullmatch(rest) is None:
            raise ValueError(f"Cannot parse time expression: '{text}'")
        return (int(m.group(1)), int(m.group(2))), rest

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
    if result.astimezone(UTC) > now.astimezone(UTC):
        return result
    # A clock-only request means the next occurrence, including the second
    # occurrence of a repeated DST hour. Compare instants, not same-zone wall
    # times (datetime's latter comparison deliberately ignores fold).
    repeated = _local(result.replace(fold=1), now.tzinfo)
    if repeated.astimezone(UTC) > now.astimezone(UTC):
        return repeated
    return _at_clock(now + timedelta(days=1), hour, minute)


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
    expression, explicit_tz = _extract_explicit_timezone(expression)
    tz = explicit_tz or _default_tz
    if now is None:
        now = datetime.now(tz)
    elif now.tzinfo is None:
        now = now.replace(tzinfo=tz)
    elif explicit_tz is not None:
        now = now.astimezone(explicit_tz)
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
            lead = _CLOCK_LEAD.match(text, pos)
            clock = _split_time_of_day(text[lead.end() :]) if lead is not None else None
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
