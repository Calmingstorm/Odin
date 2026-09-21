from pathlib import Path


def test_llm_page_has_one_agent_model_control_and_hint_editor():
    page = Path("ui/js/pages/llm-config.js").read_text()
    assert page.count(">Agent model\n") == 1
    assert "Agent model allowlist" in page
    assert "No catalogue hint. Add an operator hint below." in page
    assert "selectedModelFacts" in page
    assert "moveAgentAutoAllowlist" in page
    assert "model_selection_hints: hints" in page
    assert "agent_unavailable_reason" in page
    assert "scope_note" in page


def test_model_selection_template_is_readable():
    page = Path("ui/js/pages/llm-config.js").read_text().splitlines()
    assert max(len(line) for line in page[48:175]) < 300
