"""Keep the still-shipped constants module in the coverage inventory."""

from src import constants


def test_legacy_constants_are_importable_and_keep_public_limits():
    assert constants.BOT_NAME == "Odin"
    assert constants.MAX_MESSAGE_LENGTH == 2000
    assert constants.PAGINATOR_PAGE_SIZE == 10
    assert constants.CONFIRMATION_TIMEOUT > 0
    assert "administrator" in constants.ADMIN_PERMISSIONS
    assert "message_delete" in constants.LOG_EVENTS
