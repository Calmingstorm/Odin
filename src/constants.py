"""Bot-wide constants for Odin."""

# Branding
BOT_NAME = "Odin"
BOT_TAGLINE = "All-seeing moderation for Discord"
BOT_URL = "https://github.com/odin-bot/odin"

# Embed colors (hex)
COLOR_PRIMARY = 0x5865F2   # Discord blurple
COLOR_SUCCESS = 0x57F287   # Green
COLOR_WARNING = 0xFEE75C   # Yellow
COLOR_ERROR = 0xED4245     # Red
COLOR_INFO = 0x5865F2      # Blurple

# Limits
MAX_EMBED_DESCRIPTION = 4096
MAX_EMBED_FIELDS = 25
MAX_MESSAGE_LENGTH = 2000
PAGINATOR_PAGE_SIZE = 10

# Timeouts (seconds)
CONFIRMATION_TIMEOUT = 30
PAGINATION_TIMEOUT = 120

# Permissions
MOD_PERMISSIONS = [
    "kick_members",
    "ban_members",
    "manage_messages",
    "mute_members",
]
ADMIN_PERMISSIONS = [
    "administrator",
    "manage_guild",
]

# Logging event types
LOG_EVENTS = [
    "message_delete",
    "message_edit",
    "member_join",
    "member_leave",
    "member_ban",
    "member_unban",
    "role_change",
    "channel_change",
    "voice_state",
]
