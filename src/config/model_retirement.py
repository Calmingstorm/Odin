"""Upgrade persisted retired selections without changing one-off requests.

This is deliberately a load-time, in-memory migration. Operator YAML, environment
placeholders and historical usage/provenance are never rewritten. Live config
updates and explicit per-call selections still fail closed at validation.
"""
import logging
from copy import deepcopy

from .model_defaults import RETIRED_MODEL_SUCCESSOR, RETIRED_MODELS


def migrate_retired_codex_selections(data: dict) -> None:
    log = logging.getLogger("odin.config")

    def migrate(section: object, key: str, path: str, successor: str) -> None:
        if not isinstance(section, dict):
            return
        retired = str(section.get(key, "")).strip()
        if retired in RETIRED_MODELS:
            section[key] = successor
            log.warning("%s uses retired model %s; using %s on load", path, retired, successor)

    codex = data.get("openai_codex")
    if isinstance(codex, dict):
        # YAML anchors may share mappings with another provider. Migrating a
        # Codex selection must not mutate those unrelated namespaces.
        codex = data["openai_codex"] = deepcopy(codex)
        for key in ("model", "agent_model"):
            migrate(codex, key, f"openai_codex.{key}", RETIRED_MODEL_SUCCESSOR)
        migrate(
            codex.get("auxiliary"), "model",
            "openai_codex.auxiliary.model", RETIRED_MODEL_SUCCESSOR,
        )
        overrides = codex.get("context_budget_overrides")
        if isinstance(overrides, dict):
            for key in list(overrides):
                retired = str(key).strip()
                if retired in RETIRED_MODELS:
                    del overrides[key]
                    log.warning(
                        "Ignoring retired %s context budget override on load; "
                        "model-specific limits are not transferable to its successor",
                        retired,
                    )
    # ``llm_provider.model`` is the PINNED per-request serving model and it
    # overrides the Codex client's own model, so a retired value left here would
    # outrank the migrated ``openai_codex.model`` and keep failing per-request.
    provider = data.get("llm_provider")
    if isinstance(provider, dict):
        provider = data["llm_provider"] = deepcopy(provider)
        migrate(provider, "model", "llm_provider.model", RETIRED_MODEL_SUCCESSOR)
    image = data.get("image")
    agents = data.get("agents")
    if isinstance(agents, dict):
        agents = data["agents"] = deepcopy(agents)

        def successor_ref(value):
            raw = str(value).strip()
            bare = raw.removeprefix("codex:")
            if bare in RETIRED_MODELS:
                replacement = RETIRED_MODEL_SUCCESSOR
                log.warning("agents uses retired model %s; using %s on load", raw, replacement)
                return replacement
            return value

        if agents.get("model"):
            agents["model"] = successor_ref(agents["model"])
        entries = agents.get("auto_model_allowlist")
        if isinstance(entries, list):
            migrated = []
            seen = set()
            for entry in entries:
                if isinstance(entry, dict):
                    entry["model"] = successor_ref(entry.get("model", ""))
                    identity = entry["model"]
                else:
                    entry = successor_ref(entry)
                    identity = entry
                if identity not in seen:
                    migrated.append(entry)
                    seen.add(identity)
            agents["auto_model_allowlist"] = migrated
        hints = agents.get("model_selection_hints")
        if isinstance(hints, dict):
            # An explicit successor hint wins over historical retired aliases.
            for key in list(hints):
                replacement = successor_ref(key)
                if replacement != key:
                    hints.setdefault(replacement, hints[key])
                    del hints[key]
    if isinstance(image, dict):
        image = data["image"] = deepcopy(image)
        # The image path already has an established successor, distinct from
        # the balanced conversation model. Retirement also overrides old pins.
        from .image_defaults import IMAGE_MODEL_DEFAULTS

        migrate(image.get("openai"), "outer_model", "image.openai.outer_model",
                IMAGE_MODEL_DEFAULTS["outer_model"])
