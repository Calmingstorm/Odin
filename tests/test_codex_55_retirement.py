"""Retire 5.5 at active boundaries, migrate only persisted configuration."""
from pathlib import Path

import pytest

from src.config.schema import (
    CODEX_MODEL_INPUT_BUDGETS,
    AuxiliaryLLMConfig,
    OpenAICodexConfig,
    canonical_codex_model,
    effort_incompatibility_error,
    load_config,
)
from src.llm.errors import LLMRequestError
from src.llm.openai_codex import _reject_known_bad_pair


@pytest.mark.parametrize("model", ["gpt-5.5", " gpt-5.5 "])
def test_retired_runtime_boundaries(model):
    assert "gpt-5.5" not in CODEX_MODEL_INPUT_BUDGETS
    for construct in (
        lambda: OpenAICodexConfig(model=model),
        lambda: OpenAICodexConfig(agent_model=model),
        lambda: AuxiliaryLLMConfig(model=model),
        lambda: OpenAICodexConfig(context_budget_overrides={model: 270_001}),
        lambda: canonical_codex_model(model),
    ):
        with pytest.raises(ValueError, match="is retired"):
            construct()
    for effort in (None, "none", "low", "medium", "high", "xhigh", "max"):
        assert "is retired" in effort_incompatibility_error(model, effort)
        with pytest.raises(LLMRequestError, match="is retired"):
            _reject_known_bad_pair(model, effort)


def test_load_migrates_legacy_config_without_rewriting_operator_file(tmp_path, caplog):
    path = tmp_path / "config.yml"
    original = '''discord:
  token: test
openai_codex:
  model: ' gpt-5.5 '
  reasoning_effort: max
  agent_model: gpt-5.5
  agent_reasoning_effort: none
  auxiliary:
    model: gpt-5.5
  context_budget_overrides:
    gpt-5.5: 270001
    gpt-5.6-terra: 800000
ollama:
  model: gpt-5.5
'''
    path.write_text(original)
    cfg = load_config(path)
    assert cfg.openai_codex.model == "gpt-6-sol"
    assert cfg.openai_codex.agent_model == "gpt-6-sol"
    assert cfg.openai_codex.auxiliary.model == "gpt-6-sol"
    assert cfg.openai_codex.reasoning_effort == "max"
    assert cfg.openai_codex.agent_reasoning_effort == "none"
    assert cfg.openai_codex.context_budget_overrides == {"gpt-5.6-terra": 800000}
    assert cfg.ollama.model == "gpt-5.5"
    assert path.read_text() == original
    assert "retired" in caplog.text
    assert load_config(path).openai_codex == cfg.openai_codex


def test_environment_backed_legacy_config_migrates(tmp_path, monkeypatch):
    monkeypatch.setenv("TEST_CODEX_MODEL", "gpt-5.5")
    path = tmp_path / "config.yml"
    path.write_text("discord: {token: test}\nopenai_codex: {model: '${TEST_CODEX_MODEL}'}\n")
    assert load_config(path).openai_codex.model == "gpt-6-sol"
    assert "${TEST_CODEX_MODEL}" in path.read_text()


def test_active_ui_does_not_offer_retired_model():
    source = (Path(__file__).resolve().parents[1] / "ui/js/pages/llm-config.js").read_text()
    assert "gpt-5.5" not in source


def test_retired_image_pin_uses_established_image_successor(tmp_path, monkeypatch):
    monkeypatch.setenv("TEST_IMAGE_CARRIER", "gpt-5.5")
    path = tmp_path / "config.yml"
    original = (
        "discord: {token: test}\n"
        "image: {openai: {outer_model: '${TEST_IMAGE_CARRIER}'}}\n"
    )
    path.write_text(original)
    assert load_config(path).image.openai.outer_model == "gpt-6-astra"
    assert path.read_text() == original


def test_retired_image_pin_after_completed_image_upgrade_is_migrated(tmp_path):
    path = tmp_path / "config.yml"
    path.write_text("discord: {token: test}\n")
    load_config(path)  # Complete the independent, one-time image-default migration.
    original = "discord: {token: test}\nimage: {openai: {outer_model: gpt-5.5}}\n"
    path.write_text(original)
    assert load_config(path).image.openai.outer_model == "gpt-6-astra"
    assert path.read_text() == original  # Retirement does not overwrite the pin.


def test_image_schema_and_final_body_reject_retired_carrier():
    from types import SimpleNamespace

    from src.config.schema import ImageOpenAIConfig
    from src.tools.image.openai_backend import OpenAIImageBackend

    with pytest.raises(ValueError, match="is retired"):
        ImageOpenAIConfig(outer_model="gpt-5.5")
    stale = SimpleNamespace(openai=SimpleNamespace(outer_model="gpt-5.5"))
    with pytest.raises(ValueError, match="is retired"):
        OpenAIImageBackend._body(stale, "test")


def test_retirement_migration_leaves_policy_sentinels_and_other_models_untouched():
    from copy import deepcopy

    from src.config.model_retirement import migrate_retired_codex_selections

    for agent_model in (None, "auto", "", "gpt-5.6-luna", "future-model"):
        data = {
            "openai_codex": {
                "model": "gpt-5.6-sol", "agent_model": agent_model,
                "auxiliary": {"enabled": False, "model": "gpt-5.6-terra"},
                "context_budget_overrides": {"gpt-5.6-terra": 800000},
            },
            "image": {"openai": {"outer_model": "custom-carrier"}},
        }
        expected = deepcopy(data)
        migrate_retired_codex_selections(data)
        assert data == expected


def test_disabled_auxiliary_cannot_reintroduce_retired_model():
    from types import SimpleNamespace

    from src.discord.llm_gateway import LLMGateway

    stub = SimpleNamespace(get_config=lambda: SimpleNamespace(openai_codex=OpenAICodexConfig()))
    with pytest.raises(ValueError, match="is retired"):
        LLMGateway.prepare_auxiliary_reload(stub, {"enabled": False, "model": "gpt-5.5"})


def test_yaml_alias_does_not_migrate_another_provider_namespace(tmp_path):
    path = tmp_path / "config.yml"
    path.write_text(
        "discord: {token: test}\n"
        "openai_codex: &shared {model: gpt-5.5}\n"
        "ollama: *shared\n"
    )
    cfg = load_config(path)
    assert cfg.openai_codex.model == "gpt-6-sol"
    assert cfg.ollama.model == "gpt-5.5"
