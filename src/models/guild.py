"""Guild settings model."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class GuildSettings:
    """Per-guild configuration."""

    guild_id: int
    prefix: str = "!"
    log_channel_id: int | None = None
    autorole_id: int | None = None
    welcome_message: str | None = None
    spam_filter_enabled: bool = False
    link_filter_enabled: bool = False
    word_filter_enabled: bool = False
    filtered_words: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "guild_id": self.guild_id,
            "prefix": self.prefix,
            "log_channel_id": self.log_channel_id,
            "autorole_id": self.autorole_id,
            "welcome_message": self.welcome_message,
            "spam_filter_enabled": self.spam_filter_enabled,
            "link_filter_enabled": self.link_filter_enabled,
            "word_filter_enabled": self.word_filter_enabled,
            "filtered_words": self.filtered_words,
        }

    @classmethod
    def from_dict(cls, data: dict) -> GuildSettings:
        return cls(**{k: v for k, v in data.items() if k in cls.__dataclass_fields__})
