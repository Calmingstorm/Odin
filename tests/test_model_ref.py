import pytest

from src.config.schema import Config, canonical_codex_model
from src.config.sensitivity import PUBLIC_NON_SECRET_KEYS
from src.llm.model_ref import ModelRefProvider, parse_model_ref


def test_model_ref_grammar_and_inheritance():
    assert parse_model_ref(None).provider is ModelRefProvider.INHERIT
    assert parse_model_ref("  ").render() is None
    assert parse_model_ref("auto").provider is ModelRefProvider.AUTO
    assert parse_model_ref("gpt-5.6-sol").render() == "gpt-5.6-sol"
    assert parse_model_ref(" compat: deepseek-v4 ").render() == "compat:deepseek-v4"
    assert parse_model_ref("ollama: llama3.1:8b").render() == "ollama:llama3.1:8b"


@pytest.mark.parametrize("value", ["compat:", "ollama:", "auto"])
def test_non_concrete_refs_rejected_from_allowlist(value):
    with pytest.raises(ValueError):
        Config(discord={"token": "x"}, agents={"auto_model_allowlist": [value]})


def test_codex_canonicalizer_rejects_non_codex_refs():
    with pytest.raises(ValueError, match="bare Codex"):
        canonical_codex_model("compat:deepseek")
    assert canonical_codex_model(" codex-auto-review ") == "gpt-5.6-luna"


def test_agent_model_legacy_adaptation_and_new_key_wins():
    cfg = Config(discord={"token": "x"}, openai_codex={"agent_model": "gpt-5.6-terra"})
    assert cfg.agents.model == "gpt-5.6-terra"
    cfg = Config(
        discord={"token": "x"},
        openai_codex={"agent_model": "gpt-5.6-terra"},
        agents={"model": "compat:foo"},
    )
    assert cfg.agents.model == "compat:foo"


def test_safe_budget_profile_fields_are_public():
    assert {"usable_input_tokens", "max_output_tokens"} <= PUBLIC_NON_SECRET_KEYS
