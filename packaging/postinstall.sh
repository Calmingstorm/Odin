#!/bin/bash
# Odin .deb post-installation script.
#
# Debian policy forbids interactive prompts in maintainer scripts (they run
# non-interactively under apt/dpkg, cloud-init, Ansible, CI, etc.). This
# script is therefore fully non-interactive: it provisions the service and
# prints next-steps. First-time configuration (Discord token, Codex login)
# is done by the operator afterwards — see the printed instructions and the
# README "First-time setup" section.
set -e

case "${1:-configure}" in
    configure|abort-upgrade|abort-remove|abort-deconfigure) ;;
    *) echo "Odin: no post-install action for $1."; exit 0 ;;
esac

SERVICE_USER="odin"
SERVICE_GROUP="odin"
APP_DIR="/opt/odin"
CONFIG_DIR="/etc/odin"
DATA_DIR="/var/lib/odin"
STATE_FILE="$DATA_DIR/.package-service-state"
# Working directory for local user commands (tools.local_working_dir).
# A SIBLING of DATA_DIR, never inside it: local commands run here so a bare
# relative path cannot resolve against the install or the live data.
WORKSPACE_DIR="/var/lib/odin-workspace"
LOG_DIR="/var/log/odin"
WEB_PORT="3000"  # matches config.yml default web.port

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
# Computer evidence must never follow a symlink, including on upgrades. Check
# before mkdir/chown can touch an unexpected target. Existing receipts are kept.
for directory in /var /var/lib "$DATA_DIR" "$DATA_DIR/computer" "$DATA_DIR/initialization"; do
    if [ -L "$directory" ] || { [ -e "$directory" ] && [ ! -d "$directory" ]; }; then
        echo "Odin: unsafe computer state directory: $directory" >&2
        exit 1
    fi
done
mkdir -p "$CONFIG_DIR"
mkdir -p "$DATA_DIR"/{sessions,context,skills,search,knowledge,trajectories,computer,initialization}
chmod 0700 "$DATA_DIR/computer" "$DATA_DIR/initialization"
mkdir -p "$LOG_DIR"
mkdir -p "$WORKSPACE_DIR"

# Enable passwordless sudo for the odin user (Odin runs privileged host
# operations; scope this down in /etc/sudoers.d/99-odin-passwordless if you
# want to restrict what it can run — see docs/security.md).
if [ ! -f /etc/sudoers.d/99-odin-passwordless ]; then
    printf '%s ALL=(ALL) NOPASSWD:ALL\n' "$SERVICE_USER" > /etc/sudoers.d/99-odin-passwordless
    chmod 0440 /etc/sudoers.d/99-odin-passwordless
    echo "  Passwordless sudo enabled for $SERVICE_USER (restrict in /etc/sudoers.d/99-odin-passwordless)"
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
echo "  Installing Python dependencies (this can take a few minutes)..."
if [ -f "$APP_DIR/pyproject.toml" ]; then
    # Optional Python runtimes are small and safe on headless machines. Install
    # them on BOTH fresh installs and upgrades; missing extras must not silently
    # hide documented tools. OS desktop packages remain APT Recommends. Installing
    # dependencies is not an authorization grant and never enables computer use.
    "$APP_DIR/.venv/bin/pip" install --quiet "$APP_DIR[pdf,computer]"
else
    echo "Odin: mandatory application metadata is missing." >&2
    exit 1
fi
# A successful dependency command alone does not prove the installed app imports.
(cd "$APP_DIR" && "$APP_DIR/.venv/bin/python" -c \
    'import src.__main__; import src.discord.client; import pymupdf; import PIL; import Xlib; import dbus_next')

# Install Playwright browsers for native browser support (optional feature)
"$APP_DIR/.venv/bin/playwright" install chromium 2>/dev/null || \
    echo "  Note: playwright browser install skipped — the browser_* tools stay disabled until you run '$APP_DIR/.venv/bin/playwright install chromium'"

# Generate SSH key for the odin user if none exists
if [ ! -f "$APP_DIR/.ssh/id_ed25519" ]; then
    mkdir -p "$APP_DIR/.ssh"
    ssh-keygen -t ed25519 -f "$APP_DIR/.ssh/id_ed25519" -N "" -q
    chmod 700 "$APP_DIR/.ssh"
    chmod 600 "$APP_DIR/.ssh/id_ed25519"
    echo "  SSH key generated at $APP_DIR/.ssh/id_ed25519"
fi

# Set ownership and permissions
chown -R "$SERVICE_USER:$SERVICE_GROUP" "$APP_DIR" "$DATA_DIR" "$LOG_DIR"
# Odin refuses to run local commands unless this is 0700 and owned by the
# service account — validation fails closed rather than falling back to the
# install directory, which is what allowed the 2026-07-27 data wipe.
chown "$SERVICE_USER:$SERVICE_GROUP" "$WORKSPACE_DIR"
chmod 0700 "$WORKSPACE_DIR"
chown -R "$SERVICE_USER:$SERVICE_GROUP" "$CONFIG_DIR"
chmod 600 "$CONFIG_DIR/.env"
chown root:root /usr/lib/systemd/system/odin.service

# Provision pending only for a genuinely fresh installation. Upgrades do not
# invent state: a missing legacy record migrates to complete at runtime only
# after Odin has verified the live credential inventory. The store requires the
# service account to own its record, hence this runs as odin rather than root.
if [ "$FRESH_INSTALL" = true ]; then
    (cd "$APP_DIR" && runuser -u "$SERVICE_USER" -- "$APP_DIR/.venv/bin/python" -m src.config.startup_context \
        "$CONFIG_DIR/config.yml" \
        --env-file "$CONFIG_DIR/.env" \
        --initialization-state "$DATA_DIR/initialization/state.json" \
        --provision-fresh-initialization)
fi

# Fresh installs have a durable pending state before start. Runtime derives an
# effective loopback listener and exposes only bootstrap routes. Missing Discord
# credentials must not leave the WebUI stranded. Upgrade restart intent remains
# governed solely by the pre-removal state marker.
systemctl daemon-reload
if [ "$FRESH_INSTALL" = true ]; then
    systemctl enable --now odin.service >/dev/null
elif [ -f "$STATE_FILE" ]; then
    case "$(cat "$STATE_FILE")" in
        active) systemctl restart odin.service ;;
        inactive) : ;;
        *) echo "Odin: invalid saved package service state." >&2; exit 1 ;;
    esac
    rm "$STATE_FILE"
elif systemctl is-active --quiet odin.service; then
    systemctl restart odin.service
fi

echo ""
echo "============================================================"
echo "  Odin installed."
echo "============================================================"
echo "  Computer Python runtime and private state are provisioned; existing enablement is preserved."
echo "  Desktop packages are APT recommendations (headless: --no-install-recommends)."
echo "  Screen access, target configuration and GNOME extension enablement require your consent."
echo "  Computer setup: /usr/share/doc/odin/computer-use/PACKAGING.md"

if [ "$FRESH_INSTALL" = true ]; then
    SSH_PUB="$(cat "$APP_DIR/.ssh/id_ed25519.pub" 2>/dev/null || echo '(key not generated)')"
    cat << SETUPEOF

First-time setup: open the local WebUI and complete the guided setup:

  http://127.0.0.1:$WEB_PORT

The service is running in a loopback-only bootstrap context until setup is
complete. Enter the Discord token in the WebUI, then finish the existing
provider device authorization there. A valid Discord token attaches Odin to
Discord without a second service start.

For a remote host, use SSH port forwarding and open the same loopback URL
locally. Do not expose bootstrap setup through a public reverse proxy.

To inspect startup: sudo journalctl -u odin -f

Manual device-login fallback, if the WebUI flow is unavailable:
       sudo -u $SERVICE_USER $APP_DIR/.venv/bin/python $APP_DIR/scripts/codex_login.py \\
            --credentials-path $DATA_DIR/codex_auth.json
     Add --device on a headless server. Repeat to add more accounts for
     rate-limit rotation. (Or configure Kimi/Ollama in the web UI instead.)

Manual configuration notes:
       sudoedit $CONFIG_DIR/config.yml   # hosts, permissions, etc. (optional)

  Config file:    $CONFIG_DIR/config.yml
  Secrets (.env): $CONFIG_DIR/.env
  Full guide:     https://github.com/Calmingstorm/Odin#first-time-setup

  This host's SSH public key (add to remote hosts Odin should manage):
  $SSH_PUB

SETUPEOF
else
    echo ""
    echo "  Existing config preserved in $CONFIG_DIR."
    echo "  If the service was not running, start it with: sudo systemctl start odin"
fi
