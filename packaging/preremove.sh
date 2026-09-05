#!/bin/bash
set -e

STATE_FILE="/var/lib/odin/.package-service-state"
case "${1:-remove}" in
    upgrade|failed-upgrade)
        # prerm runs before postinst: preserve the pre-stop state across retries.
        if [ ! -f "$STATE_FILE" ]; then
            umask 077
            mkdir -p /var/lib/odin
            if systemctl is-active --quiet odin.service; then
                printf 'active\n' > "$STATE_FILE.tmp"
            else
                printf 'inactive\n' > "$STATE_FILE.tmp"
            fi
            mv "$STATE_FILE.tmp" "$STATE_FILE"
        fi
        echo "Odin: stopping service for upgrade (enablement preserved)..."
        systemctl stop odin.service
        ;;
    remove|deconfigure)
        echo "Odin: stopping and disabling service before removal..."
        systemctl stop odin.service
        systemctl disable odin.service
        systemctl daemon-reload
        # Removal ends this upgrade transaction; never replay its restart intent
        # during a later install. Configuration and application history stay put.
        rm -f "$STATE_FILE" "$STATE_FILE.tmp"
        echo "Config, data, and logs are preserved."
        ;;
    *)
        echo "Odin: no pre-remove action for ${1:-unknown}."
        ;;
esac
