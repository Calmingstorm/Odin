"""System-prompt assembly (RFC-001 Phase 3).

``PromptBuilder`` owns the full and chat system-prompt construction plus
the prompt-layer caches (hosts, skills text, per-user memory TTL cache).
Bodies are verbatim moves from ``OdinBot`` with dependency access adjusted.

Two dependencies are provider callables rather than captured references,
because the underlying objects are REPLACED at runtime: the config by
the web API's config hot-reload and the codex client by live auth
reloads (both live on the gateway/bot as live roots).

Cache-name note: the fields here deliberately carry no leading underscore
(``cached_hosts``, ``memory_cache``…) — the old bot-attribute spellings are
covered by the RFC-001 Appendix B negative contract and its source-scan
test. ``cached_skills_text`` is additionally reachable through the OdinBot
facade property ``_cached_skills_text`` (web/api.py writes it).
"""

from __future__ import annotations

import time
from collections.abc import Callable

from ..llm.system_prompt import build_chat_system_prompt, build_system_prompt
from ..odin_log import get_logger

log = get_logger("discord")


class PromptBuilder:
    def __init__(
        self,
        *,
        get_config: Callable,
        context_loader,
        reflector,
        skill_manager,
        tool_executor,
        channel_state,
        get_codex_client: Callable,
    ) -> None:
        self.get_config = get_config
        self.context_loader = context_loader
        self.reflector = reflector
        self.skill_manager = skill_manager
        self.tool_executor = tool_executor
        self.channel_state = channel_state
        self.get_codex_client = get_codex_client
        # Cached host string dict — invalidated on context reload
        self.cached_hosts: dict[str, str] | None = None
        # Cached skills list text — invalidated on skill create/edit/delete
        self.cached_skills_text: str | None = None
        # The default (no-channel) system prompt — set by rebuild_default()
        self.default_prompt: str = ""
        # TTL cache for per-user memory (avoids file I/O per message)
        self.memory_cache: dict[str | None, tuple[float, dict[str, str]]] = {}
        self.memory_cache_ttl: float = 60.0  # seconds

    # -- caches ---------------------------------------------------------------

    def cached_hosts_map(self) -> dict[str, str]:
        """Return cached host string dict. Rebuilt on config reload."""
        if self.cached_hosts is None:
            self.cached_hosts = {
                alias: f"{h.ssh_user}@{h.address}"
                for alias, h in self.get_config().tools.hosts.items()
            }
        return self.cached_hosts

    def cached_skills_list_text(self) -> str:
        """Return cached skills list text. Invalidated on skill create/edit/delete."""
        if self.cached_skills_text is None:
            if self.skill_manager is not None:
                skills = self.skill_manager.list_skills()
                if skills:
                    self.cached_skills_text = "\n".join(
                        f"- `{s['name']}`: {s['description']}" for s in skills
                    )
                else:
                    self.cached_skills_text = ""
            else:
                self.cached_skills_text = ""
        return self.cached_skills_text

    def cached_memory_for(self, user_id: str | None) -> dict[str, str]:
        """Return cached per-user memory with TTL to avoid file I/O per message."""
        now = time.time()
        cached = self.memory_cache.get(user_id)
        if cached and now - cached[0] < self.memory_cache_ttl:
            return cached[1]
        memory = self.tool_executor._load_memory_for_user(user_id)
        self.memory_cache[user_id] = (now, memory)
        return memory

    def reflector_section(self, user_id: str | None, query: str | None = None, trace=None) -> str:
        """Learned Context for the prompt — query-aware relevance selection.

        File parsing is mtime-cached inside the reflector, so calling per
        message is cheap; selection is fast over <=150 entries.
        """
        if self.reflector is None:
            return ""
        return self.reflector.get_prompt_section(user_id=user_id, query=query, trace=trace)

    def invalidate(self) -> None:
        """Invalidate all prompt-related caches. Called on config/context reload."""
        self.cached_hosts = None
        self.cached_skills_text = None
        self.memory_cache.clear()
        if self.reflector is not None:
            self.reflector.invalidate_cache()

    def rebuild_default(self) -> str:
        """Rebuild and store the default (no-channel) system prompt.

        The stored value is the fallback the tool loop uses when a turn has
        no channel-specific override; the web layer rebuilds it after
        config/context/personality changes (RFC-002 P6 — this replaced the
        old rebuild-and-reassign dance on the bot).
        """
        self.default_prompt = self.build_full_prompt()
        return self.default_prompt

    def prune_expired_memory(self, now: float) -> None:
        """Drop expired per-user memory entries (periodic housekeeping)."""
        ttl = self.memory_cache_ttl
        self.memory_cache = {k: v for k, v in self.memory_cache.items() if now - v[0] < ttl}

    # -- prompt assembly --------------------------------------------------------

    def build_full_prompt(
        self,
        channel=None,
        user_id: str | None = None,
        query: str | None = None,
        trace=None,
    ) -> str:
        config = self.get_config()

        p_cfg = config.personality if hasattr(config, "personality") else None
        prompt = build_system_prompt(
            context=self.context_loader.context,
            hosts=self.cached_hosts_map(),
            tz=config.timezone,
            personality_preset=p_cfg.preset if p_cfg else "odin",
            personality_name=p_cfg.custom_name if p_cfg else "",
            personality_identity=p_cfg.custom_identity if p_cfg else "",
            personality_voice=p_cfg.custom_voice if p_cfg else "",
        )

        if trace is not None:
            trace.section("base", tokens=len(prompt) // 4)

        # Inject persistent memory into the system prompt (per-user + global)
        memory = self.cached_memory_for(user_id)
        if memory:
            memory_text = "\n".join(f"- **{k}**: {v}" for k, v in memory.items())
            prompt += f"\n\n## Persistent Memory\n{memory_text}"
            if trace is not None:
                trace.section("persistent_memory", tokens=len(memory_text) // 4, keys=len(memory))

        # Inject learned context from cross-conversation reflection
        # (per-user filtered, relevance-ranked against the current query).
        # The reflector records its own selection decisions on the trace.
        learned = self.reflector_section(user_id, query, trace=trace)
        if learned:
            prompt += f"\n\n{learned}"

        # Inject user-created skills list (cached, invalidated on skill CRUD)
        skills_text = self.cached_skills_list_text()
        if skills_text:
            prompt += f"\n\n## User-Created Skills\n{skills_text}"
            if trace is not None:
                trace.section("skills_list", tokens=len(skills_text) // 4)

        # Inject recent tool executions for this channel only
        if channel is not None:
            channel_id = str(channel.id)
            channel_actions = self.channel_state.recent_entries(channel_id)
            if channel_actions:
                actions_text = "\n".join(channel_actions[-10:])
                prompt += f"\n\n## Recent Actions\n{actions_text}"
                if trace is not None:
                    trace.section(
                        "recent_actions",
                        tokens=len(actions_text) // 4,
                        entries=len(channel_actions[-10:]),
                    )

        # Surface degradation state so the LLM can adapt
        degradation_notes = []
        codex = self.get_codex_client()
        if codex and hasattr(codex, "breaker"):
            breaker_state = codex.breaker.state
            if breaker_state == "open":
                degradation_notes.append(
                    "LLM backend circuit breaker is OPEN — API calls will fail. "
                    "Use cached/local approaches."
                )
            elif breaker_state == "half_open":
                degradation_notes.append(
                    "LLM backend circuit breaker is recovering (half-open) — "
                    "requests may be slow or fail."
                )
        if degradation_notes:
            prompt += "\n\n## System Health Warnings\n" + "\n".join(
                f"- {n}" for n in degradation_notes
            )
            if trace is not None:
                trace.section("health_warnings", tokens=20, notes=len(degradation_notes))

        return prompt

    def build_chat_prompt(
        self,
        channel=None,
        user_id: str | None = None,
        query: str | None = None,
    ) -> str:
        """Build a lightweight system prompt for chat-routed messages.

        Includes identity, rules, memory, and personality but omits
        infrastructure details, tool docs, host lists, and PromQL to
        save input tokens on casual conversation.
        """
        config = self.get_config()

        p_cfg = config.personality if hasattr(config, "personality") else None
        prompt = build_chat_system_prompt(
            tz=config.timezone,
            personality_preset=p_cfg.preset if p_cfg else "odin",
            personality_name=p_cfg.custom_name if p_cfg else "",
            personality_identity=p_cfg.custom_identity if p_cfg else "",
            personality_voice=p_cfg.custom_voice if p_cfg else "",
        )

        # Inject persistent memory (per-user + global, personalization matters for chat)
        memory = self.cached_memory_for(user_id)
        if memory:
            memory_text = "\n".join(f"- **{k}**: {v}" for k, v in memory.items())
            prompt += f"\n\n## Persistent Memory\n{memory_text}"

        # Inject learned context (per-user filtered, relevance-ranked)
        learned = self.reflector_section(user_id, query)
        if learned:
            prompt += f"\n\n{learned}"

        return prompt
