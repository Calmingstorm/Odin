#!/bin/bash
# Deploy Odin in an Incus system container
#
# Usage: ./scripts/incus-deploy.sh [instance-name]
#
# Prerequisites:
#   - Incus installed and initialized (incus admin init)
#   - .env file configured (copy from .env.example)
#   - config.yml configured
#   - SSH keys in ssh/ directory (for remote host management)
#
# This creates an Ubuntu 24.04 system container, installs Python 3.12+
# and all dependencies, then copies the Odin bot code into it.
#
# After deployment, start the bot with:
#   incus exec <instance> -- systemctl start odin
# Or manually:
#   incus exec <instance> -- su - odin -c "cd /app && python -m src"

set -euo pipefail

INSTANCE="${1:-odin}"
IMAGE="${ODIN_INCUS_IMAGE:-ubuntu:24.04}"
SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== Deploying Odin to Incus instance: $INSTANCE ==="

# Check prerequisites
if ! command -v incus &>/dev/null; then
    echo "Error: incus not found. Install Incus first."
    exit 1
fi

if [ ! -f "$SCRIPT_DIR/.env" ]; then
    echo "Error: .env file not found. Copy .env.example and configure it."
    exit 1
fi

if [ ! -f "$SCRIPT_DIR/config.yml" ]; then
    echo "Error: config.yml not found."
    exit 1
fi

# Create or reuse instance
if incus info "$INSTANCE" &>/dev/null; then
    echo "Instance '$INSTANCE' already exists. Updating..."
    incus start "$INSTANCE" 2>/dev/null || true
else
    echo "Creating instance '$INSTANCE' from $IMAGE..."
    incus launch "$IMAGE" "$INSTANCE"
    echo "Waiting for instance to be ready..."
    sleep 5
    # Wait for cloud-init
    incus exec "$INSTANCE" -- cloud-init status --wait 2>/dev/null || sleep 10
fi

# Install system dependencies
echo "Installing system dependencies..."
incus exec "$INSTANCE" -- bash -c "
    apt-get update -qq && \
    apt-get install -y -qq --no-install-recommends \
        python3 python3-pip python3-venv \
        openssh-client curl build-essential \
        ffmpeg libffi-dev libsodium-dev libopus0 \
        > /dev/null 2>&1
"

# Create odin user and app directory
echo "Setting up odin user and directories..."
incus exec "$INSTANCE" -- bash -c "
    id odin &>/dev/null || useradd -m -s /bin/bash odin
    mkdir -p /app/src /app/data/context /app/data/sessions /app/data/logs \
             /app/data/usage /app/data/skills /app/data/chromadb /app/.ssh
    chown -R odin:odin /app
    chmod 700 /app/.ssh
"

# Push project files
echo "Pushing project files..."
incus file push "$SCRIPT_DIR/pyproject.toml" "$INSTANCE/app/pyproject.toml"
incus file push "$SCRIPT_DIR/config.yml" "$INSTANCE/app/config.yml"
incus file push -r "$SCRIPT_DIR/src" "$INSTANCE/app/"

# Push .env as environment file
incus file push "$SCRIPT_DIR/.env" "$INSTANCE/app/.env"

# Push SSH keys if they exist
if [ -d "$SCRIPT_DIR/ssh" ] && [ "$(ls -A "$SCRIPT_DIR/ssh" 2>/dev/null)" ]; then
    echo "Pushing SSH keys..."
    for f in "$SCRIPT_DIR/ssh"/*; do
        incus file push "$f" "$INSTANCE/app/.ssh/$(basename "$f")"
    done
    incus exec "$INSTANCE" -- bash -c "chown -R odin:odin /app/.ssh && chmod 600 /app/.ssh/*"
fi

# Push data templates if they exist
for tmpl in "$SCRIPT_DIR"/data/context/*.template "$SCRIPT_DIR"/data/skills/*.template; do
    [ -f "$tmpl" ] && incus file push "$tmpl" "$INSTANCE/app/data/$(dirname "${tmpl#$SCRIPT_DIR/data/"}")/$(basename "$tmpl")"
done

# Install Python dependencies
echo "Installing Python dependencies..."
incus exec "$INSTANCE" -- bash -c "
    cd /app && pip install --no-cache-dir --break-system-packages . > /dev/null 2>&1
"

# Set ownership
incus exec "$INSTANCE" -- chown -R odin:odin /app

# Create systemd service
echo "Creating systemd service..."
incus exec "$INSTANCE" -- bash -c 'cat > /etc/systemd/system/odin.service << EOF
[Unit]
Description=Odin Discord Bot
After=network.target

[Service]
Type=simple
User=odin
WorkingDirectory=/app
EnvironmentFile=/app/.env
ExecStart=/usr/bin/python3 -m src
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable odin
'

echo ""
echo "=== Deployment complete ==="
echo ""
echo "Start the bot:"
echo "  incus exec $INSTANCE -- systemctl start odin"
echo ""
echo "View logs:"
echo "  incus exec $INSTANCE -- journalctl -u odin -f"
echo "  # or"
echo "  incus exec $INSTANCE -- tail -f /app/data/logs/odin.log"
echo ""
echo "Update config:"
echo "  incus file push config.yml $INSTANCE/app/config.yml"
echo "  incus exec $INSTANCE -- systemctl restart odin"
echo ""
echo "Shell access:"
echo "  incus exec $INSTANCE -- su - odin"
