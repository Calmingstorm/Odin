#!/bin/sh
# Provision and qualify the native Chromium used by BrowserManager. The cache
# must be shared with the runtime user, not the installer's private home.
set -eu
: "${PLAYWRIGHT_BROWSERS_PATH:?Set the runtime browser cache path}"
python="$1"
shift
"$python" -m playwright install "$@" chromium
"$python" -c 'from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"])
    browser.close()
'
