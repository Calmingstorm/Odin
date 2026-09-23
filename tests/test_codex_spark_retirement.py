"""Retired spark fails at config, budget and final outbound boundaries."""
import pytest

from src.config.schema import (
    CODEX_MODEL_INPUT_BUDGETS,
    OpenAICodexConfig,
    effort_incompatibility_error,
    input_budget_floor_for_model,
    load_config,
)
from src.llm.context_budget import resolve_context_budget

SPARK = "gpt-5.3-codex-spark"


@pytest.mark.parametrize("model", [SPARK, f" {SPARK} "])
@pytest.mark.parametrize("field", ["model", "agent_model"])
def test_config_rejects_retired_model_even_with_auto_agent_effort(field, model):
    with pytest.raises(ValueError, match="is retired.*choose a supported model explicitly"):
        OpenAICodexConfig(**{field: model})


def test_override_cannot_resurrect_retired_model():
    with pytest.raises(ValueError, match="is retired"):
        OpenAICodexConfig(context_budget_overrides={SPARK: 124_001})


def test_retired_model_never_gets_unknown_budget_or_override():
    assert SPARK not in CODEX_MODEL_INPUT_BUDGETS
    for call in (
        lambda: input_budget_floor_for_model(SPARK),
        lambda: resolve_context_budget(SPARK),
        lambda: resolve_context_budget(SPARK, overrides={SPARK: 124_001}),
    ):
        with pytest.raises(ValueError, match="is retired"):
            call()


@pytest.mark.parametrize("effort", [None, "auto", "none", "medium", "max"])
def test_shared_outbound_validation_rejects_regardless_of_effort(effort):
    assert "is retired" in effort_incompatibility_error(SPARK, effort)


@pytest.mark.parametrize("model", ["gpt-5.6-terra", "gpt-5.4", "gpt-5.4-mini", "future-model"])
def test_other_models_unchanged(model):
    assert OpenAICodexConfig(model=model).model == model
    assert effort_incompatibility_error(model, "medium") is None


def test_migration_source_retained():
    from src.config.image_defaults import LEGACY_IMAGE_MODEL_DEFAULTS
    assert LEGACY_IMAGE_MODEL_DEFAULTS["outer_model"] == "gpt-5.5"


def test_final_request_boundary_rejects_retirement_as_nonretryable():
    from src.llm.errors import LLMRequestError
    from src.llm.openai_codex import _reject_known_bad_pair

    with pytest.raises(LLMRequestError, match="is retired"):
        _reject_known_bad_pair(SPARK, "medium")


def test_load_migrates_persisted_spark_without_rewriting_operator_file(tmp_path, caplog):
    path = tmp_path / "config.yml"
    original = f"""discord:
  token: test
openai_codex:
  model: ' {SPARK} '
  agent_model: {SPARK}
  auxiliary:
    model: {SPARK}
  context_budget_overrides:
    {SPARK}: 124001
    gpt-5.6-terra: 800000
"""
    path.write_text(original)

    cfg = load_config(path)

    assert cfg.openai_codex.model == "gpt-6-sol"
    assert cfg.openai_codex.agent_model == "gpt-6-sol"
    assert cfg.openai_codex.auxiliary.model == "gpt-6-sol"
    assert cfg.openai_codex.context_budget_overrides == {"gpt-5.6-terra": 800000}
    assert path.read_text() == original
    assert SPARK in caplog.text
    assert "using gpt-6-sol on load" in caplog.text


def test_environment_backed_persisted_spark_migrates(tmp_path, monkeypatch):
    monkeypatch.setenv("TEST_CODEX_MODEL", SPARK)
    path = tmp_path / "config.yml"
    original = "discord: {token: test}\nopenai_codex: {model: '${TEST_CODEX_MODEL}'}\n"
    path.write_text(original)

    assert load_config(path).openai_codex.model == "gpt-6-sol"
    assert path.read_text() == original


def test_persisted_spark_image_carrier_uses_established_successor(tmp_path):
    path = tmp_path / "config.yml"
    original = f"discord: {{token: test}}\nimage: {{openai: {{outer_model: {SPARK}}}}}\n"
    path.write_text(original)

    assert load_config(path).image.openai.outer_model == "gpt-6-astra"
    assert path.read_text() == original
