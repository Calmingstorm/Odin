"""Configuration package for Odin.

Exports:
- ``OdinConfig`` — immutable dataclass for env-based bot config
- ``Config`` / ``load_config`` — pydantic model for config.yml
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv


def _load_env() -> None:
    """Load .env file from project root if it exists."""
    env_path = Path(__file__).resolve().parent.parent.parent / ".env"
    if env_path.exists():
        load_dotenv(env_path)


@dataclass(frozen=True)
class OdinConfig:
    """Immutable configuration from environment variables.

    Only holds values that come from .env / environment.
    Web port, API token, and all other settings live in config.yml.
    """

    token: str = ""
    log_level: str = "INFO"

    @classmethod
    def from_env(cls) -> OdinConfig:
        """Build config from environment variables."""
        _load_env()
        return cls(
            token=os.getenv("DISCORD_TOKEN", os.getenv("ODIN_TOKEN", "")),
            log_level=os.getenv("ODIN_LOG_LEVEL", "INFO"),
        )

    def validate(self) -> list[str]:
        """Return a list of validation errors (empty if valid)."""
        errors = []
        if not self.token:
            errors.append("DISCORD_TOKEN is required (set in .env or environment)")
        return errors


def __getattr__(name: str):
    if name in ("Config", "load_config"):
        from .schema import Config, load_config
        globals()["Config"] = Config
        globals()["load_config"] = load_config
        return Config if name == "Config" else load_config
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


__all__ = ["OdinConfig", "Config", "load_config"]
