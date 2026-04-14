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
    """Immutable configuration for the Odin bot."""

    # Discord
    token: str = ""
    prefix: str = "!"
    log_level: str = "INFO"

    # Database
    database_url: str = "sqlite+aiosqlite:///odin.db"

    # Web dashboard
    web_port: int = 8080
    web_secret: str = "change-me"

    # OAuth2
    oauth_client_id: str = ""
    oauth_client_secret: str = ""
    oauth_redirect_uri: str = "http://localhost:8080/auth/callback"

    @classmethod
    def from_env(cls) -> OdinConfig:
        """Build config from environment variables."""
        _load_env()
        return cls(
            token=os.getenv("ODIN_TOKEN", ""),
            prefix=os.getenv("ODIN_PREFIX", "!"),
            log_level=os.getenv("ODIN_LOG_LEVEL", "INFO"),
            database_url=os.getenv(
                "ODIN_DATABASE_URL", "sqlite+aiosqlite:///odin.db"
            ),
            web_port=int(os.getenv("ODIN_WEB_PORT", "8080")),
            web_secret=os.getenv("ODIN_WEB_SECRET", "change-me"),
            oauth_client_id=os.getenv("ODIN_OAUTH_CLIENT_ID", ""),
            oauth_client_secret=os.getenv("ODIN_OAUTH_CLIENT_SECRET", ""),
            oauth_redirect_uri=os.getenv(
                "ODIN_OAUTH_REDIRECT_URI", "http://localhost:8080/auth/callback"
            ),
        )

    def validate(self) -> list[str]:
        """Return a list of validation errors (empty if valid)."""
        errors = []
        if not self.token:
            errors.append("ODIN_TOKEN is required")
        if self.web_secret == "change-me":
            errors.append("ODIN_WEB_SECRET should be changed from default")
        return errors


def __getattr__(name: str):
    if name in ("Config", "load_config"):
        from .schema import Config, load_config
        globals()["Config"] = Config
        globals()["load_config"] = load_config
        return Config if name == "Config" else load_config
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


__all__ = ["OdinConfig", "Config", "load_config"]
