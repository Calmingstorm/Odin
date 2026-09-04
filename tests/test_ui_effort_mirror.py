"""The WebUI's per-model effort exclusions are a MIRROR of the schema table.

``ui/js/pages/llm-config.js`` keeps a static ``UNSUPPORTED_EFFORTS`` map so the
Model / Agent Model / effort dropdowns never offer a pair one of the four
server-side boundaries would reject. There is no JS test harness, so this pin
parses the constant out of the source and compares it with
``config.schema.CODEX_MODEL_UNSUPPORTED_EFFORTS`` — the single authority.
"""
from __future__ import annotations

import re
from pathlib import Path

from src.config.schema import CODEX_MODEL_INPUT_BUDGETS, CODEX_MODEL_UNSUPPORTED_EFFORTS

REPO_ROOT = Path(__file__).resolve().parents[1]
SRC = (REPO_ROOT / "ui" / "js" / "pages" / "llm-config.js").read_text()


def _js_effort_map() -> dict[str, set[str]]:
    block = re.search(r"const UNSUPPORTED_EFFORTS = \{(.*?)\};", SRC, re.S)
    assert block, "UNSUPPORTED_EFFORTS map missing from llm-config.js"
    out: dict[str, set[str]] = {}
    for model, efforts in re.findall(r"'([^']+)':\s*\[([^\]]*)\]", block.group(1)):
        out[model] = set(re.findall(r"'([^']+)'", efforts))
    return out


def _js_models() -> list[str]:
    match = re.search(r"const CODEX_MODELS = \[([^\]]*)\];", SRC)
    assert match, "CODEX_MODELS list missing from llm-config.js"
    return re.findall(r"'([^']+)'", match.group(1))


def test_ui_effort_exclusions_mirror_the_schema_exactly():
    assert _js_effort_map() == {m: set(v) for m, v in CODEX_MODEL_UNSUPPORTED_EFFORTS.items()}


def test_astra_is_offered_first_and_every_dropdown_model_has_a_budget_floor():
    models = _js_models()
    assert models[0] == "gpt-6-astra"
    assert {"gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna", "gpt-5.5"} <= set(models)
    missing = [m for m in models if m not in CODEX_MODEL_INPUT_BUDGETS]
    assert not missing, f"dropdown models without a probed input budget: {missing}"


def test_no_hand_kept_max_exclusion_list_remains():
    # The old MAX_EXCLUDED_MODELS list was a second source of truth; the
    # generalized map replaces it for every effort, not just "max".
    assert "MAX_EXCLUDED_MODELS" not in SRC
    for effort in ("none", "low", "medium", "high", "xhigh", "max"):
        assert f"mainEffortAllowed('{effort}')" in SRC
        assert f"agentEffortAllowed('{effort}')" in SRC
