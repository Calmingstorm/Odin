"""Tests for OdinBot client."""



from src.discord.client import INITIAL_EXTENSIONS, OdinBot


class TestOdinBot:
    def test_class_exists(self):
        """OdinBot class is importable and named correctly."""
        assert OdinBot.__name__ == "OdinBot"

    def test_initial_extensions_defined(self):
        """Only the scheduled-report reaction listener remains registered."""
        assert INITIAL_EXTENSIONS == ("src.discord.cogs.scheduled_report_pagination",)

    def test_bot_creation(self, odin_config):
        """Bot can be instantiated with the executor-shape pydantic Config."""
        bot = OdinBot(odin_config)
        assert bot.config is odin_config
        # Prefix is resolved at runtime via _resolve_prefix (Heimdall pattern),
        # not as a top-level Config field.
        assert callable(bot._resolve_prefix)

    def test_bot_has_intents(self, odin_config):
        """Bot configures message_content and members intents."""
        bot = OdinBot(odin_config)
        assert bot.intents.message_content is True
        assert bot.intents.members is True
