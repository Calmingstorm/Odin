"""Retired spark fails at config, budget and final outbound boundaries."""
import pytest

from src.config.schema import (
    CODEX_MODEL_INPUT_BUDGETS,
    OpenAICodexConfig,
    effort_incompatibility_error,
    input_budget_floor_for_model,
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


@pytest.mark.parametrize("model", ["gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "future-model"])
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
