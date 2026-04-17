#!/bin/bash
set -e

echo "Odin: stopping service before removal..."

systemctl stop odin.service 2>/dev/null || true
systemctl disable odin.service 2>/dev/null || true
systemctl daemon-reload

echo "Odin service stopped and disabled."
echo "Note: config (/etc/odin/), data (/var/lib/odin/), and logs (/var/log/odin/) are preserved."
