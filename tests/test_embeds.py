"""Tests for embed helpers."""


from src.constants import BOT_NAME, COLOR_ERROR, COLOR_SUCCESS, COLOR_WARNING
from src.discord.helpers.embeds import (
    error_embed,
    info_embed,
    log_embed,
    moderation_embed,
    odin_embed,
    success_embed,
    warning_embed,
)


class TestOdinEmbed:
    def test_base_embed(self):
        embed = odin_embed(title="Test", description="Hello")
        assert embed.title == "Test"
        assert embed.description == "Hello"
        assert embed.footer.text == BOT_NAME

    def test_success_embed(self):
        embed = success_embed("Done!")
        assert embed.color.value == COLOR_SUCCESS
        assert "Done!" in embed.description

    def test_error_embed(self):
        embed = error_embed("Failed!")
        assert embed.color.value == COLOR_ERROR
        assert "Failed!" in embed.description

    def test_warning_embed(self):
        embed = warning_embed("Careful!")
        assert embed.color.value == COLOR_WARNING

    def test_info_embed_with_fields(self):
        embed = info_embed("Info", {"Key": "Value", "Foo": "Bar"})
        assert embed.title == "Info"
        assert len(embed.fields) == 2
        assert embed.fields[0].name == "Key"
        assert embed.fields[0].value == "Value"

    def test_info_embed_no_fields(self):
        embed = info_embed("Info")
        assert len(embed.fields) == 0

    def test_log_embed(self):
        embed = log_embed("Message Deleted", "Some details")
        assert "Message Deleted" in embed.title
        assert embed.description == "Some details"


class TestModerationEmbed:
    def test_moderation_embed(self, mock_member):
        from unittest.mock import MagicMock

        moderator = MagicMock()
        moderator.__str__ = lambda self: "Mod#0001"
        embed = moderation_embed("Ban", moderator, mock_member, "Spam")
        assert "Ban" in embed.title
        assert len(embed.fields) == 3
        assert embed.fields[2].value == "Spam"

    def test_moderation_embed_no_reason(self, mock_member):
        from unittest.mock import MagicMock

        moderator = MagicMock()
        embed = moderation_embed("Kick", moderator, mock_member)
        assert embed.fields[2].value == "No reason provided"
