from pathlib import Path


def test_llm_page_has_one_agent_model_control_and_hint_editor():
    page = Path("ui/js/pages/llm-config.js").read_text()
    assert page.count('>Agent model') == 1
    assert 'class="hidden"' not in page[page.index('Codex (OpenAI)'):page.index('OpenAI-compatible')]
    assert 'Shipped hint:' in page
    assert 'Unknown model. Add an operator hint.' in page
    assert 'moveAgentAutoAllowlist' in page
    assert "model_selection_hints: hints" in page
