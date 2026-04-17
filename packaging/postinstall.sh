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
if [ ! -f "$CONFIG_DIR/config.yml" ]; then
    if [ -f "$APP_DIR/config.yml.default" ]; then
        cp "$APP_DIR/config.yml.default" "$CONFIG_DIR/config.yml"
    fi
    echo "  Fresh install: edit $CONFIG_DIR/config.yml before starting"
fi

if [ ! -f "$CONFIG_DIR/.env" ]; then
    if [ -f "$APP_DIR/.env.example" ]; then
        cp "$APP_DIR/.env.example" "$CONFIG_DIR/.env"
    else
        echo "DISCORD_TOKEN=" > "$CONFIG_DIR/.env"
    fi
    echo "  Fresh install: set DISCORD_TOKEN in $CONFIG_DIR/.env"
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
"$APP_DIR/.venv/bin/pip" install --quiet -e "$APP_DIR" 2>/dev/null || \
    "$APP_DIR/.venv/bin/pip" install --quiet "$APP_DIR" 2>/dev/null || \
    echo "  Warning: pip install failed — install dependencies manually"

# Install Playwright browsers for native browser support
"$APP_DIR/.venv/bin/playwright" install chromium 2>/dev/null || \
    echo "  Warning: playwright install failed — browser tools may not work"

# Set ownership and permissions
chown -R "$SERVICE_USER:$SERVICE_GROUP" "$APP_DIR" "$DATA_DIR" "$LOG_DIR"
chown -R root:root /usr/lib/systemd/system/odin.service
chmod 600 "$CONFIG_DIR/.env"

# Enable systemd service
systemctl daemon-reload
systemctl enable odin.service

echo ""
echo "Odin installed successfully."
if [ ! -s "$CONFIG_DIR/.env" ] || ! grep -q 'DISCORD_TOKEN=.' "$CONFIG_DIR/.env"; then
    echo ""
    echo "Next steps:"
    echo "  1. Set your Discord token: edit $CONFIG_DIR/.env"
    echo "  2. Configure settings:     edit $CONFIG_DIR/config.yml"
    echo "  3. Start the service:      sudo systemctl start odin"
else
    echo "Existing config preserved. Restart with: sudo systemctl restart odin"
fi
