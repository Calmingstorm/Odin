"""Canonical parsing for provider-qualified agent model references."""
from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum


class ModelRefProvider(StrEnum):
    CODEX = "codex"
    COMPAT = "compat"
    OLLAMA = "ollama"
    INHERIT = "inherit"
    AUTO = "auto"


@dataclass(frozen=True, slots=True)
class ModelRef:
    provider: ModelRefProvider
    model: str | None = None

    @property
    def is_concrete(self) -> bool:
        return self.provider not in {ModelRefProvider.INHERIT, ModelRefProvider.AUTO}

    def render(self) -> str | None:
        if self.provider is ModelRefProvider.INHERIT:
            return None
        if self.provider is ModelRefProvider.AUTO:
            return "auto"
        if self.provider is ModelRefProvider.CODEX:
            return self.model
        return f"{self.provider.value}:{self.model}"


def parse_model_ref(value: str | None, *, allow_auto: bool = True) -> ModelRef:
    """Parse blank/inherit, auto, bare Codex, compat and Ollama references."""
    if value is None:
        return ModelRef(ModelRefProvider.INHERIT)
    text = str(value).strip()
    if not text:
        return ModelRef(ModelRefProvider.INHERIT)
    if text == "auto":
        if not allow_auto:
            raise ValueError("'auto' is not permitted in this model reference")
        return ModelRef(ModelRefProvider.AUTO)
    for prefix, provider in (
        ("compat:", ModelRefProvider.COMPAT),
        ("ollama:", ModelRefProvider.OLLAMA),
    ):
        if text.startswith(prefix):
            opaque = text[len(prefix):].strip()
            if not opaque:
                raise ValueError(f"{prefix[:-1]} model reference requires a model name")
            return ModelRef(provider, opaque)
    return ModelRef(ModelRefProvider.CODEX, text)
