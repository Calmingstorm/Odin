"""Upgrade persisted retired selections without changing one-off requests.

This is deliberately a load-time, in-memory migration. Operator YAML, environment
placeholders and historical usage/provenance are never rewritten. Live config
updates and explicit per-call selections still fail closed at validation.
"""
import logging
from copy import deepcopy


def migrate_retired_codex_selections(data: dict) -> None:
    log = logging.getLogger("odin.config")

    def migrate(section: object, key: str, path: str, successor: str) -> None:
        if isinstance(section, dict) and str(section.get(key, "")).strip() == "gpt-5.5":
            section[key] = successor
            log.warning("%s uses retired model gpt-5.5; using %s on load", path, successor)

    codex = data.get("openai_codex")
    if isinstance(codex, dict):
        # YAML anchors may share mappings with another provider. Migrating a
        # Codex selection must not mutate those unrelated namespaces.
        codex = data["openai_codex"] = deepcopy(codex)
        for key in ("model", "agent_model"):
            migrate(codex, key, f"openai_codex.{key}", "gpt-5.6-terra")
        migrate(codex.get("auxiliary"), "model", "openai_codex.auxiliary.model", "gpt-5.6-terra")
        overrides = codex.get("context_budget_overrides")
        if isinstance(overrides, dict):
            for key in list(overrides):
                if str(key).strip() == "gpt-5.5":
                    del overrides[key]
                    log.warning(
                        "Ignoring retired gpt-5.5 context budget override on load; "
                        "model-specific limits are not transferable to its successor"
                    )
    image = data.get("image")
    if isinstance(image, dict):
        image = data["image"] = deepcopy(image)
        # The image path already has an established successor, distinct from
        # the balanced conversation model. Retirement also overrides old pins.
        from .image_defaults import IMAGE_MODEL_DEFAULTS

        migrate(image.get("openai"), "outer_model", "image.openai.outer_model",
                IMAGE_MODEL_DEFAULTS["outer_model"])
