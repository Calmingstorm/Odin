"""Runbook pattern detection — mine the audit log for repeated workflows.

A "runbook" here is a consecutive sequence of successful tool invocations
that the same actor re-runs on the same set of hosts more than once. When
we see one happen several times, it's probably a procedure worth naming:
a reboot sequence, a deploy, a recovery dance.

Principles:
- **Observe, don't intervene**. This module only detects and reports.
  Creating a skill from a suggestion is an explicit, operator-approved
  step somewhere else.
- **Frequency + recency + concentration** drives the score. A pattern
  that fired four times in the last week beats one that fired eight
  times two months ago.
- **Failed steps break the sequence**. A successful procedure doesn't
  include mistakes; if an audit entry has a non-null ``error`` field it
  ends the current session window.
"""

from __future__ import annotations

import json
from collections import Counter, defaultdict
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Iterable

from ..odin_log import get_logger

log = get_logger("learning.runbook_detector")

DEFAULT_MIN_FREQUENCY = 3
DEFAULT_MIN_LENGTH = 2
DEFAULT_MAX_LENGTH = 5
DEFAULT_SESSION_GAP_SECONDS = 300  # 5-minute idle gap starts a new session
DEFAULT_LOOKBACK_DAYS = 30


@dataclass(slots=True)
class AuditEntry:
    timestamp: str
    ts_epoch: float
    tool_name: str
    host: str | None
    actor: str
    channel: str
    error: bool
    raw: dict

    @classmethod
    def from_line(cls, line: str) -> AuditEntry | None:
        try:
            data = json.loads(line)
        except json.JSONDecodeError:
            return None
        name = data.get("tool_name")
        if not name:
            return None  # only tool-execution entries participate in runbooks
        ts = data.get("timestamp", "")
        try:
            epoch = datetime.fromisoformat(ts.replace("Z", "+00:00")).timestamp()
        except ValueError:
            return None
        inp = data.get("tool_input") or {}
        host = inp.get("host") if isinstance(inp, dict) else None
        channel = data.get("channel_id", "") or ""
        actor = data.get("user_id", "") or data.get("user_name", "") or ""
        err = bool(data.get("error"))
        return cls(
            timestamp=ts, ts_epoch=epoch, tool_name=name, host=host,
            actor=actor, channel=channel, error=err, raw=data,
        )


@dataclass(slots=True)
class RunbookSuggestion:
    sequence: list[str]
    frequency: int                  # total ngram occurrences (may include within-session repeats)
    session_count: int = 0          # distinct sessions the sequence appeared in — used for scoring
    hosts: list[str] = field(default_factory=list)
    actors: list[str] = field(default_factory=list)
    first_seen: str = ""
    last_seen: str = ""
    sample_inputs: list[dict] = field(default_factory=list)
    # Session-context enrichment (Odin's Task 1 critique): a pattern is
    # more useful when we know what user intent produced it and whether
    # those sessions tended to succeed. These are optional and come from
    # the trajectory store; patterns detected without a trajectory
    # index keep the fields empty.
    user_queries: list[str] = field(default_factory=list)       # first user_content per session, max 5
    error_session_fraction: float = 0.0                         # 0..1 of linked sessions that ended is_error
    linked_session_count: int = 0                               # how many sessions had a trajectory match

    @property
    def length(self) -> int:
        return len(self.sequence)

    def score(self, *, now: datetime | None = None) -> float:
        """Higher score = better candidate. Session-presence (not raw n-gram
        count) drives the frequency term, then we weight by tool
        diversity, host diversity, recency, and actor concentration —
        and heavily damp trivial self-repetition patterns so
        ``run_command x 5`` can't drown out real diagnostic workflows.

        Formula::

            base = session_count or frequency
            score = base
                  * length_bonus
                  * recency_weight
                  * concentration_bonus
                  * diversity_bonus
                  * host_diversity_bonus
                  * trivial_repetition_penalty

        Each multiplier is documented inline so tuning stays visible."""
        if not self.sequence:
            return 0.0
        now = now or datetime.now(timezone.utc)
        if now.tzinfo is None:
            now = now.replace(tzinfo=timezone.utc)
        try:
            last = datetime.fromisoformat(self.last_seen.replace("Z", "+00:00"))
        except ValueError:
            last = now - timedelta(days=DEFAULT_LOOKBACK_DAYS)
        if last.tzinfo is None:
            last = last.replace(tzinfo=timezone.utc)
        recency_days = max(0.0, (now - last).total_seconds() / 86400.0)
        recency_weight = max(0.1, 1.0 - (recency_days / DEFAULT_LOOKBACK_DAYS))
        length_bonus = 1.0 + 0.2 * (self.length - 1)
        concentration_bonus = 1.0 if len(self.actors) <= 2 else 0.75
        base = self.session_count or self.frequency

        # Tool-diversity bonus: a mixed-tool sequence (e.g.
        # search_audit → read_file → http_probe) is a better
        # candidate than N steps of the same tool. Scales from 1.0
        # (all steps same tool) up to 1.5 (all steps distinct).
        distinct_tools = len(set(self.sequence))
        if self.length >= 1:
            diversity_fraction = (distinct_tools - 1) / max(1, self.length - 1)
        else:
            diversity_fraction = 0.0
        diversity_bonus = 1.0 + 0.5 * diversity_fraction

        # Host-diversity bonus: a pattern observed on multiple hosts
        # is more likely to be a real procedure than a single-host
        # habit. 1.0 for ≤1 host, up to 1.3 for 3+ hosts.
        host_count = len(self.hosts)
        host_diversity_bonus = 1.0 + 0.15 * min(2, max(0, host_count - 1))

        # Trivial-repetition penalty: damp sequences dominated by a
        # single tool. If the most-common tool is >50% of the sequence
        # we scale the penalty linearly; at 100% dominance (pure
        # self-repeat like run_command × 5) the score is multiplied by
        # 0.1 so even a high-frequency habit can't out-rank a real
        # mixed-tool diagnostic workflow.
        if self.sequence:
            most_common_count = max(self.sequence.count(t) for t in set(self.sequence))
            dominance = most_common_count / self.length
        else:
            dominance = 0.0
        if dominance > 0.5:
            # Linear falloff from 1.0 at dominance=0.5 to 0.1 at 1.0.
            trivial_penalty = max(0.1, 1.0 - 1.8 * (dominance - 0.5))
        else:
            trivial_penalty = 1.0

        return (
            base
            * length_bonus
            * recency_weight
            * concentration_bonus
            * diversity_bonus
            * host_diversity_bonus
            * trivial_penalty
        )

    def to_dict(self) -> dict:
        d = asdict(self)
        d["length"] = self.length
        d["score"] = round(self.score(), 3)
        return d


@dataclass(slots=True)
class _TrajectoryRecord:
    """Minimal shape we need from a trajectory JSONL entry to enrich
    runbook suggestions with session context."""
    ts_epoch: float
    channel: str
    actor: str
    user_content: str
    is_error: bool


def load_trajectory_index(
    trajectories_dir: str | Path,
    *, since_epoch: float | None = None,
) -> dict[tuple[str, str], list[_TrajectoryRecord]]:
    """Index trajectory turns by (channel_id, actor) for fast session
    lookup. Each value is sorted by timestamp ascending.

    Returns an empty dict on missing directory / read failure — callers
    should fall back to zero-context suggestions rather than raising.
    """
    path = Path(trajectories_dir)
    out: dict[tuple[str, str], list[_TrajectoryRecord]] = defaultdict(list)
    if not path.exists() or not path.is_dir():
        return dict(out)
    try:
        files = sorted(f for f in path.iterdir() if f.is_file() and f.suffix == ".jsonl")
    except OSError as e:
        log.error("Failed to list trajectories dir %s: %s", path, e)
        return dict(out)
    for filepath in files:
        try:
            with filepath.open("r") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        entry = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    ts = entry.get("timestamp", "")
                    try:
                        epoch = datetime.fromisoformat(
                            ts.replace("Z", "+00:00")
                        ).timestamp()
                    except ValueError:
                        continue
                    if since_epoch is not None and epoch < since_epoch:
                        continue
                    rec = _TrajectoryRecord(
                        ts_epoch=epoch,
                        channel=str(entry.get("channel_id", "") or ""),
                        actor=str(entry.get("user_id", "") or entry.get("user_name", "") or ""),
                        user_content=str(entry.get("user_content", "") or ""),
                        is_error=bool(entry.get("is_error")),
                    )
                    out[(rec.channel, rec.actor)].append(rec)
        except OSError as e:
            log.error("Failed to read trajectory file %s: %s", filepath, e)
            continue
    for recs in out.values():
        recs.sort(key=lambda r: r.ts_epoch)
    return dict(out)


def _match_session_to_trajectory(
    session: list[AuditEntry],
    index: dict[tuple[str, str], list[_TrajectoryRecord]],
    *, max_skew_seconds: int = 900,
) -> _TrajectoryRecord | None:
    """Given a session (list of audit entries from the same actor+channel,
    sorted by time), find the trajectory turn most likely to have
    produced it. Heuristic: the most recent trajectory in the same
    (channel, actor) bucket whose timestamp is <= the session's first
    tool call AND within ``max_skew_seconds`` of it.

    Returns None when there's no credible match — callers use that
    signal to leave user_queries empty rather than inventing one.
    """
    if not session:
        return None
    first = session[0]
    recs = index.get((first.channel, first.actor)) or []
    if not recs:
        return None
    # Binary-search style scan: recs is time-sorted. We want the latest
    # rec with ts_epoch <= first.ts_epoch, then check skew.
    best: _TrajectoryRecord | None = None
    for r in recs:
        if r.ts_epoch > first.ts_epoch:
            break
        best = r
    if best is None:
        return None
    if first.ts_epoch - best.ts_epoch > max_skew_seconds:
        return None
    return best


def _iter_audit_entries(path: Path, *, since_epoch: float | None) -> Iterable[AuditEntry]:
    try:
        with path.open("r") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                entry = AuditEntry.from_line(line)
                if entry is None:
                    continue
                if since_epoch is not None and entry.ts_epoch < since_epoch:
                    continue
                yield entry
    except FileNotFoundError:
        return
    except OSError as e:
        log.error("Failed to read audit log %s: %s", path, e)
        return


def group_into_sessions(
    entries: Iterable[AuditEntry],
    *,
    gap_seconds: int = DEFAULT_SESSION_GAP_SECONDS,
) -> list[list[AuditEntry]]:
    """Group a per-actor+channel stream of audit entries into sessions.

    A session is a run of entries by the same (actor, channel) with <=gap
    seconds between consecutive entries and no failed entry between them.
    A failed entry breaks the current session (it is not included).
    """
    by_bucket: dict[tuple[str, str], list[AuditEntry]] = defaultdict(list)
    for e in entries:
        by_bucket[(e.actor, e.channel)].append(e)

    sessions: list[list[AuditEntry]] = []
    for bucket_entries in by_bucket.values():
        bucket_entries.sort(key=lambda e: e.ts_epoch)
        current: list[AuditEntry] = []
        last_ts: float | None = None
        for e in bucket_entries:
            gap = (e.ts_epoch - last_ts) if last_ts is not None else 0.0
            if e.error:
                if len(current) >= 1:
                    sessions.append(current)
                current = []
                last_ts = None
                continue
            if last_ts is not None and gap > gap_seconds:
                if len(current) >= 1:
                    sessions.append(current)
                current = [e]
            else:
                current.append(e)
            last_ts = e.ts_epoch
        if current:
            sessions.append(current)
    return sessions


def _extract_ngrams(
    session: list[AuditEntry], *, min_len: int, max_len: int,
) -> list[tuple[tuple[str, ...], int, int]]:
    """Return list of (sequence_tuple, start_idx, end_idx_exclusive)."""
    tokens = [e.tool_name for e in session]
    n = len(tokens)
    out: list[tuple[tuple[str, ...], int, int]] = []
    for length in range(min_len, max_len + 1):
        if length > n:
            break
        for i in range(n - length + 1):
            seq = tuple(tokens[i : i + length])
            out.append((seq, i, i + length))
    return out


def detect_patterns(
    audit_path: str | Path,
    *,
    min_frequency: int = DEFAULT_MIN_FREQUENCY,
    min_length: int = DEFAULT_MIN_LENGTH,
    max_length: int = DEFAULT_MAX_LENGTH,
    lookback_days: int = DEFAULT_LOOKBACK_DAYS,
    session_gap_seconds: int = DEFAULT_SESSION_GAP_SECONDS,
    ignore_tools: Iterable[str] = (),
    now: datetime | None = None,
    trajectories_dir: str | Path | None = None,
) -> list[RunbookSuggestion]:
    """Scan the audit log and return candidate runbook sequences.

    min_frequency: minimum repetitions of the same sequence to surface.
    min_length/max_length: n-gram length bounds (2..5 default).
    lookback_days: ignore entries older than this window.
    ignore_tools: tool names that should never appear in a detected sequence
        (e.g. trivial reads you don't want cluttering the output).
    """
    min_length = max(2, min_length)
    max_length = max(min_length, max_length)
    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    since_epoch = (now - timedelta(days=lookback_days)).timestamp()
    ignore_set = set(ignore_tools)

    path = Path(audit_path)
    entries = [
        e for e in _iter_audit_entries(path, since_epoch=since_epoch)
        if e.tool_name not in ignore_set
    ]
    if not entries:
        return []

    sessions = group_into_sessions(entries, gap_seconds=session_gap_seconds)
    if not sessions:
        return []

    # Optionally enrich with trajectory-turn context: match each session
    # to the turn that most likely started it so we can surface the user
    # query and outcome alongside the tool sequence.
    trajectory_index: dict[tuple[str, str], list[_TrajectoryRecord]] = {}
    if trajectories_dir is not None:
        trajectory_index = load_trajectory_index(
            trajectories_dir, since_epoch=since_epoch,
        )
    session_to_traj: dict[int, _TrajectoryRecord | None] = {}
    for session_idx, session in enumerate(sessions):
        session_to_traj[session_idx] = _match_session_to_trajectory(
            session, trajectory_index,
        ) if trajectory_index else None

    # Collect occurrences of every n-gram across all sessions. Each occurrence
    # is tagged with its session id so we can require distinct-session
    # repetition later (not just within-session bursts).
    counter: Counter[tuple[str, ...]] = Counter()
    occurrences: dict[tuple[str, ...], list[tuple[int, list[AuditEntry]]]] = defaultdict(list)
    for session_idx, session in enumerate(sessions):
        ngrams = _extract_ngrams(session, min_len=min_length, max_len=max_length)
        for seq, start, end in ngrams:
            counter[seq] += 1
            occurrences[seq].append((session_idx, session[start:end]))

    # Suppress sequences whose occurrences are all inside a single session
    # (we want recurring patterns, not one bursty session).
    suggestions: list[RunbookSuggestion] = []
    for seq, freq in counter.items():
        if freq < min_frequency:
            continue
        seq_occurrences = [occ for _, occ in occurrences[seq]]
        distinct_sessions = {sid for sid, _ in occurrences[seq]}
        if len(distinct_sessions) < 2:
            continue

        hosts = sorted({o.host for occ in seq_occurrences for o in occ if o.host})
        actors = sorted({o.actor for occ in seq_occurrences for o in occ if o.actor})
        timestamps = [o.timestamp for occ in seq_occurrences for o in occ]
        first_seen = min(timestamps) if timestamps else ""
        last_seen = max(timestamps) if timestamps else ""
        sample = _build_sample_inputs(seq_occurrences[0])

        # Session-context enrichment from the trajectory index (if the
        # caller passed a trajectories_dir). We keep only the first five
        # distinct user queries so the output doesn't balloon, and
        # compute error_session_fraction across matched sessions only.
        linked_trajs: list[_TrajectoryRecord] = []
        for sid in distinct_sessions:
            rec = session_to_traj.get(sid)
            if rec is not None:
                linked_trajs.append(rec)
        seen_queries: list[str] = []
        for rec in linked_trajs:
            q = (rec.user_content or "").strip()
            if not q:
                continue
            if q in seen_queries:
                continue
            seen_queries.append(q)
            if len(seen_queries) >= 5:
                break
        error_fraction = (
            sum(1 for r in linked_trajs if r.is_error) / len(linked_trajs)
            if linked_trajs else 0.0
        )

        suggestions.append(RunbookSuggestion(
            sequence=list(seq),
            frequency=freq,
            session_count=len(distinct_sessions),
            hosts=hosts,
            actors=actors,
            first_seen=first_seen,
            last_seen=last_seen,
            sample_inputs=sample,
            user_queries=[q[:200] for q in seen_queries],
            error_session_fraction=round(error_fraction, 3),
            linked_session_count=len(linked_trajs),
        ))

    # Suppress a shorter sequence only if a longer sequence whose strict
    # prefix matches the shorter has at least as many distinct sessions —
    # otherwise the shorter sequence is an independent pattern that shows
    # up in more places and deserves to surface on its own.
    kept: list[RunbookSuggestion] = []
    by_len = sorted(suggestions, key=lambda s: s.length, reverse=True)
    seq_index = {tuple(s.sequence): s for s in by_len}
    shadowed: set[tuple[str, ...]] = set()
    for s in by_len:
        seq_t = tuple(s.sequence)
        if seq_t in shadowed:
            continue
        kept.append(s)
        for L in range(s.length - 1, min_length - 1, -1):
            prefix = seq_t[:L]
            shorter = seq_index.get(prefix)
            if shorter is None:
                continue
            # Only shadow the shorter when the longer actually covers it —
            # i.e. the shorter isn't repeating in sessions the longer doesn't.
            if shorter.session_count <= s.session_count:
                shadowed.add(prefix)

    kept.sort(key=lambda s: s.score(now=now), reverse=True)
    return kept


def _build_sample_inputs(sample_entries: list[AuditEntry]) -> list[dict]:
    """Build a per-step sample input list with secret-bearing values scrubbed.

    We intentionally include only a small allowlist of input keys (host,
    command, path, script, target), then scrub those values through the
    standard secret scrubber before they leave the detector. This prevents
    runbook suggestions from becoming a secret-exfiltration side channel
    when audit entries capture tool inputs that contain tokens or creds.
    """
    try:
        from ..llm.secret_scrubber import scrub_output_secrets as _scrub
    except Exception:  # pragma: no cover - scrubber is a normal runtime dep
        def _scrub(s: str) -> str:
            return s

    ALLOWED_KEYS = ("host", "command", "path", "script", "target")
    out: list[dict] = []
    for entry in sample_entries:
        raw_inp = entry.raw.get("tool_input") or {}
        clean: dict = {}
        if isinstance(raw_inp, dict):
            for key in ALLOWED_KEYS:
                val = raw_inp.get(key)
                if val is None:
                    continue
                if isinstance(val, str):
                    clean[key] = _scrub(val)
                else:
                    clean[key] = val
        out.append({
            "tool_name": entry.tool_name,
            "host": entry.host,
            "input": clean,
        })
    return out


def format_suggestions(
    suggestions: list[RunbookSuggestion], *, limit: int = 10,
) -> str:
    if not suggestions:
        return "No runbook candidates found in the current audit window."
    lines = [f"Top {min(limit, len(suggestions))} runbook candidates (by score):"]
    for i, s in enumerate(suggestions[:limit], start=1):
        arrow = " -> ".join(s.sequence)
        hosts = ",".join(s.hosts) if s.hosts else "(no host)"
        header = (
            f"{i:2d}. [{s.frequency}x, score={s.score():.2f}] {arrow} "
            f"on {hosts} (last: {s.last_seen[:19]})"
        )
        lines.append(header)
        # Session-context lines only appear when a trajectory index was
        # supplied at detection time and actually matched something;
        # otherwise the pattern is still shown but without intent hints.
        if s.user_queries:
            err_hint = (
                f", err_sessions={s.error_session_fraction:.0%}"
                if s.error_session_fraction > 0 else ""
            )
            lines.append(
                f"      intent ({s.linked_session_count} sessions{err_hint}):"
            )
            for q in s.user_queries[:3]:
                q_trim = q if len(q) <= 100 else q[:97] + "..."
                lines.append(f"        - {q_trim}")
    return "\n".join(lines)


def suggestions_as_json(suggestions: list[RunbookSuggestion]) -> str:
    return json.dumps([s.to_dict() for s in suggestions], indent=2, default=str)
