#!/bin/bash
set -e

SERVICE_USER="odin"
SERVICE_GROUP="odin"
APP_DIR="/opt/odin"
CONFIG_DIR="/etc/odin"
DATA_DIR="/var/lib/odin"
LOG_DIR="/var/log/odin"

echo "Odin postinstall: setting up..."

# Create system user/group if they don't exist
if ! getent group "$SERVICE_GROUP" > /dev/null 2>&1; then
    groupadd --system "$SERVICE_GROUP"
fi
if ! id "$SERVICE_USER" > /dev/null 2>&1; then
    useradd --system --gid "$SERVICE_GROUP" \
        --home-dir "$APP_DIR" --no-create-home \
        --shell /usr/sbin/nologin \
        "$SERVICE_USER"
fi

# Create FHS directories
mkdir -p "$CONFIG_DIR"
mkdir -p "$DATA_DIR"/{sessions,context,skills,search,knowledge,trajectories}
mkdir -p "$LOG_DIR"

# Install config templates (preserve existing on upgrade)
FRESH_INSTALL=false
if [ ! -f "$CONFIG_DIR/config.yml" ]; then
    if [ -f "$APP_DIR/config.yml.default" ]; then
        cp "$APP_DIR/config.yml.default" "$CONFIG_DIR/config.yml"
    fi
    FRESH_INSTALL=true
fi

if [ ! -f "$CONFIG_DIR/.env" ]; then
    if [ -f "$APP_DIR/.env.example" ]; then
        cp "$APP_DIR/.env.example" "$CONFIG_DIR/.env"
    else
        cat > "$CONFIG_DIR/.env" << 'ENVEOF'
# Odin environment — set your Discord bot token here
DISCORD_TOKEN=
ENVEOF
    fi
    FRESH_INSTALL=true
fi

# Create symlinks so the app sees config/data in its working directory
ln -sf "$CONFIG_DIR/config.yml" "$APP_DIR/config.yml"
ln -sf "$CONFIG_DIR/.env" "$APP_DIR/.env"
ln -sfn "$DATA_DIR" "$APP_DIR/data"
ln -sfn "$LOG_DIR" "$APP_DIR/logs"

# Set up Python virtual environment
if [ ! -d "$APP_DIR/.venv" ]; then
    echo "  Creating Python virtual environment..."
    python3 -m venv "$APP_DIR/.venv"
    "$APP_DIR/.venv/bin/pip" install --quiet --upgrade pip
fi

# Install Python dependencies from pyproject.toml
echo "  Installing Python dependencies..."
if [ -f "$APP_DIR/pyproject.toml" ]; then
    "$APP_DIR/.venv/bin/pip" install --quiet "$APP_DIR" 2>/dev/null || \
        echo "  Warning: pip install from pyproject.toml failed — install dependencies manually"
fi

# Install Playwright browsers for native browser support
"$APP_DIR/.venv/bin/playwright" install chromium 2>/dev/null || \
    echo "  Warning: playwright install failed — browser tools may not work"

# Set ownership and permissions
chown -R "$SERVICE_USER:$SERVICE_GROUP" "$APP_DIR" "$DATA_DIR" "$LOG_DIR"
chown -R "$SERVICE_USER:$SERVICE_GROUP" "$CONFIG_DIR"
chmod 600 "$CONFIG_DIR/.env"
chown root:root /usr/lib/systemd/system/odin.service

# Enable systemd service
systemctl daemon-reload
systemctl enable odin.service

echo ""
echo "Odin installed successfully."
if [ "$FRESH_INSTALL" = true ]; then
    echo ""
    echo "Next steps:"
    echo "  1. Set your Discord token:  sudo editor $CONFIG_DIR/.env"
    echo "     (config.yml uses \${DISCORD_TOKEN} from this file)"
    echo "  2. Review settings:         sudo editor $CONFIG_DIR/config.yml"
    echo "  3. Start the service:       sudo systemctl start odin"
    echo "  4. Check logs:              sudo journalctl -u odin -f"
else
    echo "Existing config preserved. Restart with: sudo systemctl restart odin"
fi
