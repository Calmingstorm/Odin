"""Malformed legacy profile values fail closed without touching services."""

from types import SimpleNamespace

from src.llm.context_budget import compatible_usable_input_tokens


def test_legacy_profile_value_with_value_error_returns_unknown():
    class InvalidLegacyValue:
        def __int__(self):
            raise ValueError("not an integer-like value")

    profile = SimpleNamespace(usable_input_tokens=InvalidLegacyValue())

    assert compatible_usable_input_tokens(profile) is None


def test_total_window_with_unusable_output_reserve_returns_unknown():
    profile = SimpleNamespace(total_window_tokens=100_000, max_output_tokens=0)

    assert compatible_usable_input_tokens(profile) is None
