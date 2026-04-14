"""Tests for OdinBot client."""



from src.discord.client import INITIAL_EXTENSIONS, OdinBot


class TestOdinBot:
    def test_class_exists(self):
        """OdinBot class is importable and named correctly."""
        assert OdinBot.__name__ == "OdinBot"

    def test_initial_extensions_defined(self):
        """All expected cog extensions are listed."""
        assert len(INITIAL_EXTENSIONS) >= 5
        assert "src.discord.cogs.moderation" in INITIAL_EXTENSIONS
        assert "src.discord.cogs.administration" in INITIAL_EXTENSIONS
        assert "src.discord.cogs.utility" in INITIAL_EXTENSIONS

    def test_bot_creation(self, odin_config):
        """Bot can be instantiated with config."""
        bot = OdinBot(odin_config)
        assert bot.config is odin_config
        assert bot.config.prefix == "!"

    def test_bot_has_intents(self, odin_config):
        """Bot configures message_content and members intents."""
        bot = OdinBot(odin_config)
        assert bot.intents.message_content is True
        assert bot.intents.members is True
