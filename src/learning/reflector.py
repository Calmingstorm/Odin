from __future__ import annotations

import asyncio
import json
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime, timedelta, timezone
from pathlib import Path
from typing import TYPE_CHECKING

from ..odin_log import get_logger

if TYPE_CHECKING:
    from ..sessions.manager import Message, Session

# Type alias: async (messages: list[dict], system: str) -> str
TextFn = Callable[[list[dict], str], Awaitable[str]]

log = get_logger("learning")

# Content length policy. The soft limit is prompt guidance to the LLM; the
# hard limit is enforced at storage time — but never as a silent chop.
# Oversized content is clipped at a sentence boundary, suffixed with
# _TRUNCATION_MARKER, and flagged damaged=True so it can be resummarized
# rather than degrading further through future consolidation cycles.
_SOFT_CONTENT_CHARS = 700
_HARD_CONTENT_CHARS = 1000
_TRUNCATION_MARKER = " [truncated: needs resummary]"
_SENTENCE_TERMINATORS = (".", "!", "?", "…", '"', "'", ")", "]", "`")

_LEARNED_SCHEMA_VERSION = 2

# Category-aware expiry: corrections and preferences never auto-expire
# (removed only via supersession); operational/fact entries go stale when
# neither used nor updated within the window.
_CATEGORY_EXPIRY_DAYS: dict[str, int] = {"operational": 180, "fact": 180}

_REFLECTION_HEADER = """\
Extract clear, explicit lessons from this conversation. Return a JSON array.
Each element: {"key": "snake_case_id", "category": "correction|preference|operational|fact",
"content": "ONE lesson, max 700 chars", "topic": "short-project-or-area-slug", "tags": ["optional"]}
Rules:
- Max 5 insights per reflection
- ONE lesson per entry — never combine unrelated lessons into a single entry
- Reuse existing keys when updating a known fact
- Return [] if nothing worth learning
- Categories: correction (user corrected the bot), preference (how user likes things done), operational (system/infra knowledge), fact (general truth)
Anti-hallucination rules:
- ONLY record preferences the user EXPLICITLY stated — never infer unstated preferences
- Never generalize a specific correction into a broad prohibition (e.g. user corrects a refusal to discuss earthquakes → record "do not refuse news requests", NOT "avoid political topics")
- If a user corrects the bot's refusal to do something, the lesson is "do not refuse [specific thing]" — never "avoid [broad topic]"
- Never invent behavioral rules the user did not ask for
- When in doubt, return [] — a missed insight is better than a hallucinated one"""

_CONSOLIDATION_HEADER = """\
Consolidate these learned entries to """


def _clip_content(entry: dict) -> dict:
    """Enforce the hard content limit without silent data loss.

    Content over _HARD_CONTENT_CHARS is clipped at the latest sentence
    boundary, suffixed with an explicit marker, and the entry is flagged
    damaged=True so consolidation leaves it alone until resummarized.
    """
    content = entry.get("content", "")
    if len(content) <= _HARD_CONTENT_CHARS:
        return entry
    limit = _HARD_CONTENT_CHARS - len(_TRUNCATION_MARKER)
    clipped = content[:limit]
    boundary = -1
    for term in _SENTENCE_TERMINATORS:
        boundary = max(boundary, clipped.rfind(term))
    if boundary > limit // 2:
        clipped = clipped[: boundary + 1]
    else:
        last_space = clipped.rfind(" ")
        if last_space > 0:
            clipped = clipped[:last_space]
    entry["content"] = clipped.rstrip() + _TRUNCATION_MARKER
    entry["damaged"] = True
    log.warning(
        "Learned entry %r exceeded %d chars; clipped at sentence boundary and flagged damaged",
        entry.get("key"), _HARD_CONTENT_CHARS,
    )
    return entry


def _looks_chopped(content: str) -> bool:
    """Heuristic for legacy entries damaged by the old silent [:800] chop."""
    stripped = content.rstrip()
    if len(stripped) < 780:
        return False
    return not stripped.endswith(_SENTENCE_TERMINATORS)


def _default_confidence(category: str) -> str:
    """Explicit user signals are high-confidence; inferred lessons are medium."""
    return "high" if category in ("correction", "preference") else "medium"


class ConversationReflector:
    """Reviews conversations after they end and extracts reusable insights."""

    def __init__(
        self,
        learned_path: str,
        *,
        max_entries: int = 150,
        consolidation_target: int = 120,
        injection_token_budget: int = 4000,
        enabled: bool = True,
    ) -> None:
        self._path = Path(learned_path)
        self._lock = asyncio.Lock()
        self._max_entries = max_entries
        self._consolidation_target = consolidation_target
        self._injection_token_budget = injection_token_budget
        self._enabled = enabled
        self._text_fn: TextFn | None = None
        self._injection_cache: tuple[float, dict] | None = None
        self._use_stamps: dict[str, str] = {}

    def set_text_fn(self, fn: TextFn) -> None:
        """Register an async callable for LLM text generation.

        The callable signature is ``async (messages, system) -> str``.
        When set, ``_reflect()`` and ``_consolidate()`` use this instead
        of direct API calls.
        """
        self._text_fn = fn

    def _load(self) -> dict:
        if self._path.exists():
            try:
                data = json.loads(self._path.read_text())
                return self._migrate(data)
            except (json.JSONDecodeError, OSError) as e:
                log.error("Failed to load learned.json: %s", e)
        return {
            "version": _LEARNED_SCHEMA_VERSION,
            "last_reflection": None,
            "entries": [],
        }

    def _migrate(self, data: dict) -> dict:
        """One-time v1→v2 migration: flag legacy chop damage, backfill metadata.

        Idempotent — guarded by the stored schema version. Entries silently
        truncated by the old [:800] policy are detected heuristically (long
        content not ending at a sentence boundary), marked damaged, and given
        an explicit truncation marker so the loss is visible and they are
        excluded from further consolidation until resummarized.
        """
        if data.get("version", 1) >= _LEARNED_SCHEMA_VERSION:
            return data
        damaged_count = 0
        for entry in data.get("entries", []):
            content = entry.get("content", "")
            if not entry.get("damaged") and _looks_chopped(content):
                entry["content"] = content.rstrip() + _TRUNCATION_MARKER
                entry["damaged"] = True
                damaged_count += 1
            entry.setdefault("confidence", _default_confidence(entry.get("category", "")))
            entry.setdefault("source", {"created_by": "legacy"})
        data["version"] = _LEARNED_SCHEMA_VERSION
        try:
            self._save(data)
        except OSError as e:
            log.error("Failed to persist learned.json migration: %s", e)
        log.info(
            "Migrated learned.json to schema v%d (%d entries, %d flagged damaged)",
            _LEARNED_SCHEMA_VERSION, len(data.get("entries", [])), damaged_count,
        )
        return data

    def _save(self, data: dict) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        # Atomic temp+replace — a crash mid-write must never corrupt the
        # learned store (the whole point of this subsystem is integrity).
        tmp = self._path.with_suffix(".tmp")
        tmp.write_text(json.dumps(data, indent=2))
        tmp.replace(self._path)

    def get_all_entries(self) -> list[dict]:
        return self._load().get("entries", [])

    def get_metadata(self) -> dict:
        data = self._load()
        return {
            "count": len(data.get("entries", [])),
            "last_reflection": data.get("last_reflection"),
            "version": data.get("version", 1),
        }

    def delete_entry(self, key: str) -> bool:
        data = self._load()
        entries = data.get("entries", [])
        before = len(entries)
        data["entries"] = [e for e in entries if e.get("key") != key]
        if len(data["entries"]) < before:
            self._save(data)
            return True
        return False

    def update_entry(self, key: str, content: str | None = None, category: str | None = None) -> dict | None:
        data = self._load()
        for e in data.get("entries", []):
            if e.get("key") == key:
                if content is not None:
                    e["content"] = content
                if category is not None:
                    e["category"] = category
                e["updated_at"] = datetime.now(timezone.utc).isoformat()
                self._save(data)
                return e
        return None

    # Injection selection caps, applied only when the corpus exceeds the
    # token budget. Corrections and the requester's preferences are pinned;
    # operational/fact entries compete on relevance to the current query.
    _PIN_CORRECTIONS_CAP = 30
    _PIN_PREFERENCES_CAP = 25
    _OPERATIONAL_TOP_K = 12
    _FACTS_TOP_K = 5

    def _read_for_injection(self) -> dict:
        """mtime-cached read for the hot injection path.

        Write paths always use _load() directly for fresh data; this cache
        only avoids re-parsing the file on every message.
        """
        try:
            mtime = self._path.stat().st_mtime
        except OSError:
            mtime = 0.0
        cached = getattr(self, "_injection_cache", None)
        if cached and cached[0] == mtime:
            return cached[1]
        data = self._load()
        self._injection_cache = (mtime, data)
        return data

    def invalidate_cache(self) -> None:
        self._injection_cache = None

    def get_prompt_section(
        self, user_id: str | None = None, query: str | None = None,
        trace=None,
    ) -> str:
        """Format learned entries for injection into the system prompt.

        Scope: global entries plus entries tagged for *user_id*; other
        users' entries are excluded.

        Selection: when the whole scoped corpus fits the injection token
        budget, ALL of it is included — relevance gating only engages when
        the corpus outgrows the budget. Gated selection pins corrections
        and the requester's preferences, then fills with the operational
        and fact entries most relevant to *query*.
        """
        from ..relevance import rank as relevance_rank

        data = self._read_for_injection()
        entries = data.get("entries", [])
        if not entries:
            return ""
        filtered = []
        for e in entries:
            entry_uid = e.get("user_id")
            if entry_uid is None:
                # Global entry — always include
                filtered.append(e)
            elif user_id and entry_uid == user_id:
                # Entry belongs to the requesting user
                filtered.append(e)
            # else: entry belongs to another user — skip
        if not filtered:
            return ""

        def fmt(e: dict) -> str:
            return f"- [{e['category']}] {e['content']}"

        corrections_available = [
            e["key"] for e in filtered if e["category"] == "correction"
        ]
        total_tokens = sum(len(fmt(e)) for e in filtered) // 4
        if total_tokens <= self._injection_token_budget or not query:
            selected = filtered
            selection_mode = "include_all"
            gated_records: list[dict] = []
        else:
            def entry_text(e: dict) -> str:
                return " ".join([
                    e.get("content", ""), e.get("topic", ""),
                    " ".join(e.get("tags", [])), e.get("key", ""),
                ])

            corrections = [e for e in filtered if e["category"] == "correction"]
            corrections = corrections[-self._PIN_CORRECTIONS_CAP:]
            preferences = [e for e in filtered if e["category"] == "preference"]
            preferences = preferences[-self._PIN_PREFERENCES_CAP:]
            operational = relevance_rank(
                query,
                [e for e in filtered if e["category"] == "operational"],
                entry_text, top_k=self._OPERATIONAL_TOP_K,
            )
            facts = relevance_rank(
                query,
                [e for e in filtered if e["category"] == "fact"],
                entry_text, top_k=self._FACTS_TOP_K,
            )
            # Preserve original corpus order for stable prompts
            chosen = {id(e) for e in (*corrections, *preferences, *operational, *facts)}
            selected = [e for e in filtered if id(e) in chosen]
            selection_mode = "gated"
            gated_records = []
            if trace is not None:
                pin_capped = {id(e) for e in filtered
                              if e["category"] in ("correction", "preference")} - chosen
                for e in filtered:
                    if id(e) in chosen:
                        continue
                    reason = "pin_cap" if id(e) in pin_capped else "low_relevance"
                    gated_records.append({"key": trace.key(e["key"]), "reason": reason})
            log.debug(
                "Learned injection gated: %d/%d entries selected",
                len(selected), len(filtered),
            )

        self._note_used(selected)
        lines = [fmt(e) for e in selected]
        section_text = "## Learned Context\n" + "\n".join(lines)
        if trace is not None:
            injected_correction_keys = [
                e["key"] for e in selected if e["category"] == "correction"
            ]
            trace.learned(
                available=len(filtered),
                injected_keys=[trace.key(e["key"]) for e in selected],
                pinned_available=[trace.key(k) for k in corrections_available],
                pinned_injected=[trace.key(k) for k in injected_correction_keys],
                gated_out=gated_records,
                tokens=len(section_text) // 4,
                mode=selection_mode,
            )
        return section_text

    _REFLECTION_CONTEXT_TOP_K = 30

    @staticmethod
    def _relevant_existing_text(entries: list[dict], context_text: str) -> str:
        """Render the existing entries most relevant to *context_text* for a
        reflection prompt. Embedding the whole corpus made every reflection
        pay for (and be biased by) all stored knowledge; the model only
        needs nearby entries to reuse keys and avoid duplicates."""
        if not entries:
            return "(none)"
        if len(entries) > ConversationReflector._REFLECTION_CONTEXT_TOP_K:
            from ..relevance import rank as relevance_rank
            ranked = relevance_rank(
                context_text, entries,
                lambda e: " ".join([
                    e.get("content", ""), e.get("topic", ""),
                    " ".join(e.get("tags", [])), e.get("key", ""),
                ]),
                top_k=ConversationReflector._REFLECTION_CONTEXT_TOP_K,
            )
            chosen = {id(e) for e in ranked}
            entries = [e for e in entries if id(e) in chosen]
        return "\n".join(
            f"- [{e['category']}] {e['key']}: {e['content']}"
            for e in entries
        )

    def _note_used(self, entries: list[dict]) -> None:
        """Record injection usage in memory; persisted opportunistically by
        the next locked write (merge/consolidation). last_used_at only feeds
        the 180-day staleness window, so eventual persistence is fine."""
        now = datetime.now(UTC).isoformat(timespec="seconds")
        for e in entries:
            self._use_stamps[e.get("key", "")] = now

    def _apply_use_stamps(self, entries: list[dict]) -> None:
        """Fold pending in-memory usage stamps into entries (call under lock)."""
        if not self._use_stamps:
            return
        for e in entries:
            stamp = self._use_stamps.get(e.get("key", ""))
            if stamp:
                e["last_used_at"] = stamp
        self._use_stamps.clear()

    async def reflect_on_operation(
        self,
        user_request: str,
        tools_used: list[str],
        tool_details: list[dict],
        final_response: str,
        is_error: bool = False,
        user_id: str | None = None,
    ) -> None:
        """Post-operation reflection using structured tool call data.

        Runs after a tool loop completes. Extracts durable operational
        lessons from what actually happened — tool calls, results, errors,
        and the final response — rather than raw conversation text.
        """
        if not self._enabled or not self._text_fn:
            return
        if not tools_used:
            return

        detail_lines = []
        for d in tool_details[:15]:
            tool = d.get("tool", "?")
            inp = d.get("input", "")
            result = d.get("result", "")
            if isinstance(inp, dict):
                inp = json.dumps(inp)
            inp_preview = str(inp)[:120]
            result_preview = str(result)[:120]
            status = "ERROR" if d.get("error") else "OK"
            detail_lines.append(f"  {tool}({inp_preview}) → {status}: {result_preview}")

        operation_summary = (
            f"User request: {user_request[:300]}\n"
            f"Tools used: {', '.join(tools_used[:20])}\n"
            f"Outcome: {'ERROR' if is_error else 'SUCCESS'}\n"
            f"Tool call details:\n" + "\n".join(detail_lines) + "\n"
            f"Final response: {final_response[:500]}"
        )

        existing = self._load().get("entries", [])
        existing_text = self._relevant_existing_text(existing, operation_summary)

        prompt = (
            "Review this completed operation and extract ONLY durable operational "
            "lessons worth remembering for future similar tasks. Focus on:\n"
            "- Corrections the results revealed (wrong assumptions, unexpected behavior)\n"
            "- Operational facts discovered (API formats, file locations, tool quirks)\n"
            "- What worked well that should be repeated\n"
            "- What failed and why\n\n"
            "Do NOT record:\n"
            "- Ephemeral task details (file paths in /tmp, one-time actions)\n"
            "- Things already known (check existing entries below)\n"
            "- Generic knowledge the bot already has\n\n"
            "Return a JSON array. Each entry: {\"key\": \"snake_case_id\", "
            "\"category\": \"correction|operational|preference\", "
            "\"content\": \"ONE concise lesson, max 700 chars\", "
            "\"topic\": \"short-project-or-area-slug\", \"tags\": [\"optional\"]}\n"
            "ONE lesson per entry — never combine unrelated lessons.\n"
            "Return [] if nothing worth remembering.\n\n"
            "Currently known:\n" + existing_text + "\n\n"
            "Operation:\n" + operation_summary
        )

        user_ids = [user_id] if user_id else []
        try:
            raw = await self._text_fn(
                [{"role": "user", "content": prompt}],
                "You extract operational lessons from tool execution results. "
                "Only record what the operation actually revealed. Return valid JSON.",
            )
            new_entries = self._parse_entries(raw.strip())
            if not new_entries:
                return

            single_user = user_ids[0] if len(user_ids) == 1 else None
            for entry in new_entries:
                entry.setdefault("source", {"created_by": "operation"})
                if entry["category"] in ("preference", "correction") and single_user:
                    if "user_id" not in entry:
                        entry["user_id"] = single_user

            async with self._lock:
                data = await asyncio.to_thread(self._load)
                existing = data.get("entries", [])
                self._apply_use_stamps(existing)
                merged = self._merge_entries(existing, new_entries)
                if len(merged) > self._max_entries:
                    merged = await self._consolidate(merged)
                data["entries"] = merged
                data["last_reflection"] = datetime.now(timezone.utc).isoformat()
                await asyncio.to_thread(self._save, data)
                self.invalidate_cache()
                log.info("Operational reflection: %d new entries merged", len(new_entries))
        except Exception as e:
            log.error("Operational reflection failed: %s", e)

    async def reflect_on_session(
        self, session: Session, *, user_id: str | None = None,
        user_ids: list[str] | None = None,
    ) -> None:
        """Full reflection on a completed session."""
        if not self._enabled:
            return
        messages = session.messages
        if len(messages) < 3:
            return

        # Prefer explicit user_ids list; fall back to legacy single user_id
        effective_ids = user_ids if user_ids is not None else ([user_id] if user_id else [])
        conversation = self._format_conversation(messages, session.summary)
        await self._reflect(conversation, full=True, user_ids=effective_ids)

    async def reflect_on_compacted(
        self, messages: list[Message], summary: str,
        *, user_id: str | None = None,
        user_ids: list[str] | None = None,
    ) -> None:
        """Lighter reflection on messages about to be discarded during compaction."""
        if not self._enabled:
            return
        if len(messages) < 5:
            return

        effective_ids = user_ids if user_ids is not None else ([user_id] if user_id else [])
        conversation = self._format_conversation(messages, summary)
        await self._reflect(conversation, full=False, user_ids=effective_ids)

    def _format_conversation(
        self, messages: list[Message], summary: str = "",
    ) -> str:
        parts = []
        if summary:
            parts.append(f"[Summary of earlier conversation]: {summary[:500]}")
        for m in messages:
            uid = getattr(m, "user_id", None)
            if uid:
                parts.append(f"{m.role} [user_id={uid}]: {m.content[:500]}")
            else:
                parts.append(f"{m.role}: {m.content[:500]}")
        return "\n".join(parts)

    async def _reflect(
        self, conversation: str, *, full: bool,
        user_ids: list[str] | None = None,
    ) -> None:
        async with self._lock:
            data = await asyncio.to_thread(self._load)
            existing = data.get("entries", [])

            existing_text = self._relevant_existing_text(existing, conversation)

            # When multiple users participated, instruct the LLM to attribute entries
            user_hint = ""
            if user_ids and len(user_ids) > 1:
                user_hint = (
                    "\nMultiple users participated. For preference/correction entries, "
                    "include a \"user_id\" field with the user's ID from the conversation. "
                    "Participant IDs: " + ", ".join(user_ids) + "\n"
                )

            prompt = (
                _REFLECTION_HEADER + user_hint
                + "\n\nCurrently known:\n" + existing_text
                + "\n\nConversation:\n" + conversation
            )

            system_instruction = (
                "You extract explicit lessons from conversations. "
                "Only record what the user clearly stated or corrected. "
                "Never infer unstated preferences. Return only valid JSON."
            )

            try:
                if not self._text_fn:
                    log.warning("No text completion backend configured for reflection")
                    return
                raw_text = await self._text_fn(
                    [{"role": "user", "content": prompt}],
                    system_instruction,
                )
            except Exception as e:
                log.error("Reflection API call failed: %s", e)
                return

            raw = raw_text.strip()
            new_entries = self._parse_entries(raw)
            if not new_entries:
                log.debug("Reflection produced no new insights")
                return

            # If not full reflection, only keep corrections and operational
            if not full:
                new_entries = [
                    e for e in new_entries
                    if e["category"] in ("correction", "operational")
                ]
                if not new_entries:
                    return

            # Tag user-specific entries with user_id.
            # If the LLM already assigned a user_id (multi-user case), keep it.
            # If only one user participated, tag preference/correction entries.
            effective_ids = user_ids or []
            single_user = effective_ids[0] if len(effective_ids) == 1 else None
            for entry in new_entries:
                entry.setdefault("source", {"created_by": "reflection"})
                if entry["category"] in ("preference", "correction"):
                    if single_user and "user_id" not in entry:
                        entry["user_id"] = single_user
                    # If multi-user, the LLM should have set user_id via _parse_entries
                    # If it didn't and we have multiple users, leave untagged (global)
                # operational and fact entries stay global (no user_id)

            self._apply_use_stamps(existing)
            merged = self._merge_entries(existing, new_entries)

            # Consolidate if over limit
            if len(merged) > self._max_entries:
                merged = await self._consolidate(merged)

            data["entries"] = merged
            data["last_reflection"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
            await asyncio.to_thread(self._save, data)
            self.invalidate_cache()
            log.info(
                "Reflection complete: %d new insights, %d total entries",
                len(new_entries), len(merged),
            )

    @staticmethod
    def _merge_entries(existing: list[dict], new_entries: list[dict]) -> list[dict]:
        now = datetime.now(timezone.utc).isoformat(timespec="seconds")
        by_key = {e["key"]: e for e in existing}
        for entry in new_entries:
            _clip_content(entry)
            entry.setdefault("confidence", _default_confidence(entry.get("category", "")))
            # A new entry may explicitly supersede older ones — remove them,
            # keeping the list on the new entry for provenance.
            for superseded_key in entry.get("supersedes", []):
                if superseded_key in by_key and superseded_key != entry["key"]:
                    by_key.pop(superseded_key)
                    log.info(
                        "Learned entry %r superseded by %r", superseded_key, entry["key"],
                    )
            if entry["key"] in by_key:
                current = by_key[entry["key"]]
                current["content"] = entry["content"]
                current["category"] = entry["category"]
                current["updated_at"] = now
                # Fresh full-length content repairs a previously damaged entry
                if entry.get("damaged"):
                    current["damaged"] = True
                else:
                    current.pop("damaged", None)
                for field in ("user_id", "topic", "tags", "confidence", "source", "supersedes"):
                    if field in entry:
                        current[field] = entry[field]
            else:
                entry["created_at"] = now
                entry["updated_at"] = now
                by_key[entry["key"]] = entry
        return list(by_key.values())

    def _expire_entries(self, entries: list[dict]) -> list[dict]:
        """Category-aware expiry.

        Corrections and preferences never auto-expire (only supersession
        removes them). Operational and fact entries go stale when neither
        used nor updated within their _CATEGORY_EXPIRY_DAYS window.
        """
        now = datetime.now(timezone.utc)
        kept = []
        expired = 0
        for e in entries:
            days = _CATEGORY_EXPIRY_DAYS.get(e.get("category", ""))
            if days is None:
                kept.append(e)
                continue
            ref = e.get("last_used_at") or e.get("updated_at") or e.get("created_at")
            if not ref:
                kept.append(e)
                continue
            try:
                ref_dt = datetime.fromisoformat(ref)
            except ValueError:
                kept.append(e)
                continue
            if now - ref_dt <= timedelta(days=days):
                kept.append(e)
            else:
                expired += 1
        if expired:
            log.info("Reflector: expired %d stale operational/fact entries", expired)
        return kept

    @staticmethod
    def _compact_for_prompt(entries: list[dict]) -> str:
        """Serialize entries with only the fields the LLM needs for consolidation.

        Strips timestamps, source, last_used_at, and other metadata that
        bloats the prompt without helping the LLM make merge/drop decisions.
        """
        compact = []
        for e in entries:
            item: dict = {
                "key": e.get("key", ""),
                "category": e.get("category", ""),
                "content": e.get("content", ""),
            }
            if e.get("topic"):
                item["topic"] = e["topic"]
            if e.get("tags"):
                item["tags"] = e["tags"]
            if e.get("confidence"):
                item["confidence"] = e["confidence"]
            if e.get("user_id"):
                item["user_id"] = e["user_id"]
            compact.append(item)
        return json.dumps(compact, indent=2)

    async def _consolidate(self, entries: list[dict]) -> list[dict]:
        """Ask the LLM to merge same-topic duplicates down to the target.

        Damaged entries are passed through unmerged — consolidating already
        clipped text compounds the damage. Unrelated topics are never packed
        together to hit the target count; dropping low-value entries is the
        sanctioned way to shrink.
        """
        import time as _time
        t0 = _time.monotonic()

        entries = self._expire_entries(entries)
        if not entries:
            return []

        damaged = [e for e in entries if e.get("damaged")]
        candidates = [e for e in entries if not e.get("damaged")]
        if not candidates:
            return damaged

        target = max(1, self._consolidation_target - len(damaged))

        if len(candidates) <= target:
            log.info(
                "Consolidation skipped: %d candidates already within target %d (+%d damaged)",
                len(candidates), target, len(damaged),
            )
            return candidates + damaged

        entries_text = self._compact_for_prompt(candidates)
        prompt_chars = len(entries_text)
        prompt = (
            _CONSOLIDATION_HEADER + str(target)
            + " or fewer.\nSTRICT RULES:\n"
            "- Merge ONLY entries that cover the same topic/key/meaning "
            "(true duplicates or updates of the same fact).\n"
            "- NEVER combine unrelated lessons into one entry to reduce "
            "the count — one lesson per entry.\n"
            "- Prefer DROPPING stale or low-value entries over merging unrelated ones.\n"
            "- If the target cannot be reached without merging unrelated "
            "topics, return more entries than the target instead.\n"
            f"- Keep each content under {_SOFT_CONTENT_CHARS} characters.\n"
            "- Preserve key, user_id, topic, tags, and confidence fields "
            "exactly as-is (null if absent).\n"
            " Return a JSON array with the same schema:"
            ' [{"key": ..., "category": ..., "content": ..., "user_id": ...,'
            ' "topic": ..., "tags": ..., "confidence": ...}]'
            "\n\nEntries:\n" + entries_text
        )

        system_instruction = "You consolidate learned entries. Return only valid JSON array."

        def _fallback() -> list[dict]:
            candidates.sort(key=lambda e: e.get("updated_at", ""), reverse=True)
            elapsed = _time.monotonic() - t0
            log.warning(
                "Consolidation fallback: kept newest %d of %d candidates "
                "(prompt was %d chars, elapsed %.1fs, %d damaged passed through)",
                target, len(candidates), prompt_chars, elapsed, len(damaged),
            )
            return candidates[:target] + damaged

        try:
            if not self._text_fn:
                log.warning("No text completion backend configured for consolidation")
                return _fallback()
            raw_text = await self._text_fn(
                [{"role": "user", "content": prompt}],
                system_instruction,
            )
        except Exception as e:
            log.error(
                "Consolidation API call failed (%s): %s",
                type(e).__name__, e,
            )
            return _fallback()

        raw = raw_text.strip()
        consolidated = self._parse_entries(raw)
        if not consolidated:
            log.warning("Consolidation returned no entries, keeping originals trimmed")
            return _fallback()

        # Preserve timestamps and metadata from originals where possible
        orig_by_key = {e["key"]: e for e in candidates}
        now = datetime.now(timezone.utc).isoformat(timespec="seconds")
        for entry in consolidated:
            _clip_content(entry)
            if entry["key"] in orig_by_key:
                orig = orig_by_key[entry["key"]]
                entry["created_at"] = orig.get("created_at", now)
                entry["updated_at"] = now
                for field in ("user_id", "topic", "tags", "confidence", "source", "last_used_at"):
                    if field not in entry and field in orig:
                        entry[field] = orig[field]
            else:
                entry["created_at"] = now
                entry["updated_at"] = now
                entry.setdefault("confidence", _default_confidence(entry.get("category", "")))
                entry.setdefault("source", {"created_by": "consolidation"})

        elapsed = _time.monotonic() - t0
        log.info(
            "Consolidated %d entries down to %d (+%d damaged) in %.1fs (prompt %d chars)",
            len(candidates), len(consolidated), len(damaged), elapsed, prompt_chars,
        )
        return consolidated + damaged

    @staticmethod
    def _parse_entries(raw: str) -> list[dict]:
        """Parse JSON array from LLM response, tolerating markdown fences."""
        # Strip markdown code fences if present
        if "```" in raw:
            lines = raw.split("\n")
            filtered = []
            inside = False
            for line in lines:
                if line.strip().startswith("```"):
                    inside = not inside
                    continue
                if inside:
                    filtered.append(line)
            raw = "\n".join(filtered)

        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            # Try to find a JSON array in the response
            start = raw.find("[")
            end = raw.rfind("]")
            if start != -1 and end != -1:
                try:
                    parsed = json.loads(raw[start : end + 1])
                except json.JSONDecodeError:
                    log.warning("Could not parse reflection response: %s", raw[:200])
                    return []
            else:
                log.warning("No JSON array found in reflection response: %s", raw[:200])
                return []

        if not isinstance(parsed, list):
            return []

        valid = []
        for item in parsed:
            if (
                isinstance(item, dict)
                and "key" in item
                and "category" in item
                and "content" in item
                and item["category"] in ("correction", "preference", "operational", "fact")
            ):
                entry = {
                    "key": str(item["key"]),
                    "category": item["category"],
                    "content": str(item["content"]),
                }
                if item.get("user_id"):
                    entry["user_id"] = str(item["user_id"])
                if item.get("topic"):
                    entry["topic"] = str(item["topic"])
                if isinstance(item.get("tags"), list):
                    entry["tags"] = [str(t) for t in item["tags"] if t][:8]
                if item.get("confidence") in ("high", "medium", "low"):
                    entry["confidence"] = item["confidence"]
                if isinstance(item.get("supersedes"), list):
                    entry["supersedes"] = [str(k) for k in item["supersedes"] if k]
                valid.append(entry)
        return valid
