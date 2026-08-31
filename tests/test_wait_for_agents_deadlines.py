from src.agents.wait_deadlines import (
    WAIT_FOR_AGENTS_NATIVE_GRACE_SECONDS,
    WAIT_FOR_AGENTS_NESTED_GRACE_SECONDS,
    wait_for_agents_handler_deadline,
    wait_for_agents_wrapper_timeout,
)


def test_native_grace_tracks_default_and_explicit_handler_deadlines():
    assert wait_for_agents_wrapper_timeout(
        "wait_for_agents", {}, 17, grace_seconds=WAIT_FOR_AGENTS_NATIVE_GRACE_SECONDS
    ) == 315
    assert wait_for_agents_wrapper_timeout(
        "wait_for_agents",
        {"timeout": 42},
        17,
        grace_seconds=WAIT_FOR_AGENTS_NATIVE_GRACE_SECONDS,
    ) == 57


def test_nested_grace_is_distinct_and_non_wait_tools_are_unchanged():
    assert wait_for_agents_wrapper_timeout(
        "wait_for_agents",
        {"timeout": 42},
        17,
        grace_seconds=WAIT_FOR_AGENTS_NESTED_GRACE_SECONDS,
    ) == 72
    assert wait_for_agents_wrapper_timeout(
        "run_command", {"timeout": 42}, 17,
        grace_seconds=WAIT_FOR_AGENTS_NESTED_GRACE_SECONDS,
    ) == 17


def test_invalid_handler_timeout_preserves_outer_fallback():
    assert wait_for_agents_handler_deadline({"timeout": "bad"}) is None
    assert wait_for_agents_wrapper_timeout(
        "wait_for_agents", {"timeout": "bad"}, 91, grace_seconds=15
    ) == 91


def test_truthy_non_mapping_input_preserves_outer_fallback():
    for malformed in (
        ["not", "an", "object"], "wrong-shape",
        {"timeout": float("inf")}, {"timeout": -1},
    ):
        assert wait_for_agents_handler_deadline(malformed) is None
        assert wait_for_agents_wrapper_timeout(
            "wait_for_agents", malformed, 91, grace_seconds=15
        ) == 91
