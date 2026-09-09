"""Image model defaults and raw-document intent; never config provenance fields."""
from pathlib import Path
from typing import Any

IMAGE_MODEL_DEFAULTS = {"image_model": "gpt-image-2.5-flare", "outer_model": "gpt-6-astra"}
LEGACY_IMAGE_MODEL_DEFAULTS = {"image_model": "gpt-image-2", "outer_model": "gpt-5.5"}
IMAGE_MODEL_PREFIX = ("image", "openai")


def read_image_model_metadata(
    config_path: str | Path | None, config: Any,
) -> dict[str, dict[str, str]]:
    """Raw explicit, alias, and merge-inherited leaves are pins; absence follows."""
    from .persistence import _load_document, _resolve_path

    document, _ = _load_document(_resolve_path(config_path))
    node = document
    for segment in IMAGE_MODEL_PREFIX:
        node = node.get(segment, {}) if isinstance(node, dict) else {}
    return {
        leaf: {
            "effective": getattr(config.image.openai, leaf),
            "default": default,
            "status": "pin" if isinstance(node, dict) and leaf in node else "follow",
        }
        for leaf, default in IMAGE_MODEL_DEFAULTS.items()
    }
