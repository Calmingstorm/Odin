#!/bin/bash
# Odin Discord Monitor
# Usage: ./monitor.sh [messages|logs|both] [count]
# Reads recent Discord messages and/or bot logs
#
# Supports Docker, Incus, and bare metal deployments.
# Auto-detects deployment type, or set ODIN_DEPLOY=docker|incus|local
# For Incus: set ODIN_INCUS_INSTANCE (default: odin)
# Odin logs to standard output/error, not a file: the systemd journal for a
# service (journalctl -u odin), docker logs for Docker, or a source-run terminal.
# Set ODIN_LOG_FILE to tail a file you explicitly redirect that output to.

set -e

MODE="${1:-both}"
COUNT="${2:-20}"

# Load bot token from .env
SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
if [ -f "$SCRIPT_DIR/.env" ]; then
    DISCORD_TOKEN=$(grep DISCORD_TOKEN "$SCRIPT_DIR/.env" | cut -d= -f2)
fi
CHANNEL_ID="${MONITOR_CHANNEL_ID:-}"

if [ -z "$CHANNEL_ID" ]; then
    echo "Set MONITOR_CHANNEL_ID environment variable to use message monitoring."
    [ "$MODE" = "messages" ] || [ "$MODE" = "msg" ] || [ "$MODE" = "m" ] && exit 1
fi

# Auto-detect deployment type
detect_deploy() {
    if [ -n "$ODIN_DEPLOY" ]; then
        echo "$ODIN_DEPLOY"
    elif command -v docker &>/dev/null && docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^odin-bot$'; then
        echo "docker"
    elif command -v incus &>/dev/null && incus list -f csv -c n 2>/dev/null | grep -q "^${ODIN_INCUS_INSTANCE:-odin}$"; then
        echo "incus"
    else
        echo "local"
    fi
}

DEPLOY=$(detect_deploy)

discord_messages() {
    echo "=== Recent Discord Messages (last $COUNT) ==="
    echo ""
    curl -s -H "Authorization: Bot $DISCORD_TOKEN" \
        "https://discord.com/api/v10/channels/$CHANNEL_ID/messages?limit=$COUNT" \
    | python3 -c "
import sys, json
msgs = json.load(sys.stdin)
if isinstance(msgs, dict) and 'message' in msgs:
    print(f'API Error: {msgs}')
    sys.exit(1)
for msg in reversed(msgs):
    author = msg['author']['username']
    is_bot = ' [BOT]' if msg['author'].get('bot') else ''
    content = msg.get('content', '')
    ts = msg['timestamp'][:19].replace('T', ' ')
    print(f'[{ts}] {author}{is_bot}: {content[:500]}')
    # Show embeds if present
    for embed in msg.get('embeds', []):
        desc = embed.get('description', '')
        if desc:
            print(f'  [embed] {desc[:200]}')
    print()
"
}

bot_logs() {
    echo "=== Bot Logs (last $COUNT lines) [deploy=$DEPLOY] ==="
    echo ""
    case "$DEPLOY" in
        docker)
            docker logs odin-bot 2>&1 | tail -"$COUNT"
            ;;
        incus)
            INSTANCE="${ODIN_INCUS_INSTANCE:-odin}"
            if [ -n "${ODIN_LOG_FILE:-}" ]; then
                incus exec "$INSTANCE" -- tail -"$COUNT" "$ODIN_LOG_FILE"
            else
                incus exec "$INSTANCE" -- journalctl -u odin -n "$COUNT" --no-pager
            fi
            ;;
        local)
            if [ -n "${ODIN_LOG_FILE:-}" ]; then
                if [ -f "$ODIN_LOG_FILE" ]; then
                    tail -"$COUNT" "$ODIN_LOG_FILE"
                else
                    echo "Log file not found: $ODIN_LOG_FILE"
                    echo "Set ODIN_LOG_FILE to the correct log path"
                fi
            elif command -v journalctl >/dev/null 2>&1 && systemctl cat odin.service >/dev/null 2>&1; then
                journalctl -u odin -n "$COUNT" --no-pager
            else
                echo "Odin logs to standard output/error, not to a file."
                echo "For a source run, check the terminal where Odin was started."
                echo "For a service, use journalctl -u odin; for Docker, use docker logs odin-bot."
                echo "Set ODIN_LOG_FILE to a file you redirected stdout/stderr to."
            fi
            ;;
    esac
}

case "$MODE" in
    messages|msg|m)
        discord_messages
        ;;
    logs|log|l)
        bot_logs
        ;;
    both|all|b)
        discord_messages
        echo ""
        bot_logs
        ;;
    *)
        echo "Usage: $0 [messages|logs|both] [count]"
        exit 1
        ;;
esac
