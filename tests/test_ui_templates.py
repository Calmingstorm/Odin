"""Pytest shim for the strict WebUI template validation.

The real check is scripts/check-vue-templates.mjs (Node + @vue/compiler-dom),
run as a required step in the WebUI CI workflow. Locally it runs only when
the JS toolchain is present, so Python-only environments aren't forced to
install Node — set ODIN_REQUIRE_UI_CHECK=1 to make a missing toolchain fail
instead of skip.
"""
from __future__ import annotations

import os
import re
import shutil
import subprocess
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent
REQUIRE = os.environ.get("ODIN_REQUIRE_UI_CHECK") == "1"


def _toolchain_ready() -> bool:
    return (
        shutil.which("node") is not None
        and (REPO_ROOT / "node_modules" / "@vue" / "compiler-dom").is_dir()
    )


@pytest.mark.skipif(
    not REQUIRE and not _toolchain_ready(),
    reason="JS toolchain not installed — run 'npm ci' (ODIN_REQUIRE_UI_CHECK=1 to require)",
)
def test_all_vue_templates_compile_strict():
    if REQUIRE and not _toolchain_ready():
        pytest.fail("ODIN_REQUIRE_UI_CHECK=1 but the JS toolchain is missing — run 'npm ci'")
    result = subprocess.run(
        ["node", str(REPO_ROOT / "scripts" / "check-vue-templates.mjs")],
        capture_output=True, text=True, timeout=120,
    )
    assert result.returncode == 0, (
        f"Template validation failed:\n{result.stdout}\n{result.stderr}"
    )


def test_auxiliary_debounce_cancelled_on_unmount():
    """Blocker-4 pin (no JS test harness): the auxiliary save debounce must be
    cancelled on component unmount alongside the other providers, so a pending
    edit can't fire its PUT after navigation (the #224 lifecycle guard)."""
    src = (REPO_ROOT / "ui" / "js" / "pages" / "llm-config.js").read_text()
    unmount = src[src.index("onUnmounted("):]
    unmount = unmount[: unmount.index("});") + 3]
    assert "saveAuxConfigDebounced.cancel()" in unmount, (
        "saveAuxConfigDebounced.cancel() missing from onUnmounted"
    )


def test_llm_config_polls_only_while_active_and_preserves_drafts():
    """The keep-alive LLM tab must see out-of-band policy changes without
    overwriting an operator's focused, dirty, pending, modal, or saving form."""
    src = (REPO_ROOT / "ui" / "js" / "pages" / "llm-config.js").read_text()
    assert "const POLL_MS = 15000" in src
    assert "window.setInterval(pollLiveConfig, POLL_MS)" in src
    assert "onActivated(armPolling)" in src
    assert "onDeactivated(disarmPolling)" in src
    assert "onUnmounted(() => {\n      disarmPolling();" in src
    assert "if (poll && hasUnsavedDraft()) return;" in src
    assert "focused || allowlistModalOpen.value || editingLabel.value !== null" in src
    for pending in (
        "saveCodexConfigDebounced.pending()",
        "saveOllamaConfigDebounced.pending()",
        "saveCompatibleConfigDebounced.pending()",
        "saveAuxConfigDebounced.pending()",
    ):
        assert pending in src


def test_llm_config_poll_request_cost_is_bounded():
    """A timer tick may refresh six live status/config endpoints, never the
    heavyweight model catalogues. Keep the request count explicit so another
    innocent-looking addition cannot walk the page back into its own limiter."""
    src = (REPO_ROOT / "ui" / "js" / "pages" / "llm-config.js").read_text()
    start = src.index("    async function pollLiveConfig()")
    end = src.index("\n    async function fetchLLMStatus", start)
    poll = src[start:end]
    calls = [
        "fetchLLMStatus({ poll: true })",
        "fetchOllamaStatus({ refreshModels: false })",
        "fetchCompatibleStatus({ refreshModels: false })",
        "fetchAgentsConfig({ poll: true })",
        "fetchCodexStatus()",
        "fetchContextWindows({ poll: true })",
    ]
    invoked_fetches = re.findall(r"^\s+(fetch[A-Za-z]+)\(", poll, re.MULTILINE)
    assert len(invoked_fetches) == len(calls)
    for call in calls:
        assert poll.count(call) == 1
    for expensive_endpoint in (
        "/api/openrouter/catalogue",
        "/api/openai-compatible/models",
        "/api/ollama/models",
        "/api/ollama/probe-models",
    ):
        assert expensive_endpoint not in poll


def test_llm_provider_credentials_resist_browser_autofill():
    """Provider credentials must not be mistaken for browser-saved secrets."""
    page = (REPO_ROOT / "ui" / "js" / "pages" / "llm-config.js").read_text()
    css = (REPO_ROOT / "ui" / "css" / "style.css").read_text()
    assert page.count('type="password"') == 2
    assert page.count('autocomplete="new-password"') == 2
    assert page.count('class="hm-input credential-input') == 2
    assert ".credential-input:-webkit-autofill" in css
    assert "-webkit-text-fill-color: var(--hm-text)" in css


def test_codex_quota_column_renders_reported_windows_and_remaining_bar():
    page = (REPO_ROOT / "ui" / "js" / "pages" / "llm-config.js").read_text()
    css = (REPO_ROOT / "ui" / "css" / "style.css").read_text()
    assert '<th>Quota</th>' in page
    assert 'quotaBlocks(a)' in page
    assert "{{ block.remaining }}% remaining" in page
    assert "block.remaining + '%'" in page
    assert "['primary', 'secondary']" in page
    assert "100 - used" in page
    assert "Weekly usage limit" in page
    assert "5-hour usage limit" in page
    assert "Limit reached · " in page
    assert "checked {{ quotaAge(a.quota.observed_at) }} ago" in page
    assert "Quota check failed" in page and "a.quota_check_failed" in page
    assert ".codex-quota-track" in css and ".codex-quota-fill" in css
    assert "width: block.remaining + '%'" in page
