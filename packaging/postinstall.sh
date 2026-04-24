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
        --shell /bin/bash \
        "$SERVICE_USER"
fi

# Create FHS directories
mkdir -p "$CONFIG_DIR"
mkdir -p "$DATA_DIR"/{sessions,context,skills,search,knowledge,trajectories}
mkdir -p "$LOG_DIR"

# Enable passwordless sudo for the odin user
if [ ! -f /etc/sudoers.d/99-odin-passwordless ]; then
    printf '%s ALL=(ALL) NOPASSWD:ALL\n' "$SERVICE_USER" > /etc/sudoers.d/99-odin-passwordless
    chmod 0440 /etc/sudoers.d/99-odin-passwordless
    echo "  Passwordless sudo enabled for $SERVICE_USER"
fi

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

# Generate SSH key for the odin user if none exists
if [ ! -f "$APP_DIR/.ssh/id_ed25519" ]; then
    mkdir -p "$APP_DIR/.ssh"
    ssh-keygen -t ed25519 -f "$APP_DIR/.ssh/id_ed25519" -N "" -q
    chown -R "$SERVICE_USER:$SERVICE_GROUP" "$APP_DIR/.ssh"
    chmod 700 "$APP_DIR/.ssh"
    chmod 600 "$APP_DIR/.ssh/id_ed25519"
    echo "  SSH key generated at $APP_DIR/.ssh/id_ed25519"
fi

# Set ownership and permissions
chown -R "$SERVICE_USER:$SERVICE_GROUP" "$APP_DIR" "$DATA_DIR" "$LOG_DIR"
chown -R "$SERVICE_USER:$SERVICE_GROUP" "$CONFIG_DIR"
chmod 600 "$CONFIG_DIR/.env"
chown root:root /usr/lib/systemd/system/odin.service

# Enable systemd service
systemctl daemon-reload
systemctl enable odin.service

echo ""
echo "============================================"
echo "  Odin installed successfully."
echo "============================================"

if [ "$FRESH_INSTALL" = true ]; then
    echo ""
    echo "=== Guided Setup ==="
    echo ""

    # Step 1: Discord token
    echo "Step 1: Discord Bot Token"
    echo "  Create a bot at https://discord.com/developers/applications"
    echo "  Enable MESSAGE CONTENT INTENT under Bot settings"
    echo ""
    read -p "  Paste your Discord bot token (or press Enter to skip): " DISCORD_TOKEN_INPUT
    if [ -n "$DISCORD_TOKEN_INPUT" ]; then
        sed -i "s|^DISCORD_TOKEN=.*|DISCORD_TOKEN=$DISCORD_TOKEN_INPUT|" "$CONFIG_DIR/.env"
        echo "  Token saved to $CONFIG_DIR/.env"
    else
        echo "  Skipped — set it later: sudo editor $CONFIG_DIR/.env"
    fi
    echo ""

    # Step 2: OpenAI Codex credentials
    echo "Step 2: OpenAI Codex Credentials"
    echo "  Odin needs an OpenAI ChatGPT Plus/Team account for the LLM backend."
    echo "  Run this command to authenticate (opens a browser):"
    echo ""
    echo "    cd $APP_DIR && sudo -u $SERVICE_USER python3 scripts/codex_login.py"
    echo ""
    echo "  You can do this now or after setup completes."
    echo "  Multiple accounts can be added for rate-limit rotation."
    echo ""

    # Step 3: localhost host
    echo "Step 3: Host Configuration"
    echo "  Odin needs at least localhost configured to run shell commands."
    if grep -q "hosts:" "$CONFIG_DIR/config.yml" 2>/dev/null; then
        echo "  Hosts section already exists in config.yml"
    else
        echo "  Adding localhost to config.yml..."
        cat >> "$CONFIG_DIR/config.yml" << 'HOSTEOF'

tools:
  hosts:
    localhost:
      address: 127.0.0.1
      ssh_user: odin
      os: linux
HOSTEOF
        echo "  localhost added."
    fi
    echo ""

    # Step 4: Permissions
    echo "Step 4: Permissions"
    read -p "  Are you the only user? Set default_tier to admin? (y/N): " ADMIN_CHOICE
    if [ "$ADMIN_CHOICE" = "y" ] || [ "$ADMIN_CHOICE" = "Y" ]; then
        if grep -q "default_tier:" "$CONFIG_DIR/config.yml" 2>/dev/null; then
            sed -i 's|default_tier:.*|default_tier: admin|' "$CONFIG_DIR/config.yml"
        else
            cat >> "$CONFIG_DIR/config.yml" << 'PERMEOF'

permissions:
  default_tier: admin
PERMEOF
        fi
        echo "  Set to admin. All users have full access."
    else
        echo "  Keeping default (user tier). Grant admin per-user via web dashboard."
    fi
    echo ""

    # Summary
    echo "============================================"
    echo "  Setup Complete!"
    echo "============================================"
    echo ""
    echo "  Start Odin:    sudo systemctl start odin"
    echo "  Watch logs:    sudo journalctl -u odin -f"
    echo "  Web dashboard: http://localhost:8080"
    echo "  Config:        $CONFIG_DIR/config.yml"
    echo "  Secrets:       $CONFIG_DIR/.env"
    echo "  Codex login:   cd $APP_DIR && sudo -u $SERVICE_USER python3 scripts/codex_login.py"
    echo ""
    echo "  SSH public key (for remote hosts):"
    echo "  $(cat $APP_DIR/.ssh/id_ed25519.pub 2>/dev/null || echo '  (not generated)')"
    echo ""
else
    echo "Existing config preserved. Restart with: sudo systemctl restart odin"
fi
