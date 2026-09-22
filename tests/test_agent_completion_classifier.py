from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from src.agents.manager import AgentInfo, AgentState, _run_agent


def make_agent(max_iterations=5):
    agent = AgentInfo(
        id="judge", label="judge", goal="finish the requested task",
        channel_id="c", requester_id="u", requester_name="user",
        max_iterations=max_iterations,
    )
    agent.messages = [{"role": "user", "content": agent.goal}]
    return agent


def make_classifier(*, return_value=None, side_effect=None):
    judge = type("Judge", (), {})()
    judge.classify = AsyncMock(return_value=return_value, side_effect=side_effect)
    return judge


@pytest.mark.asyncio
async def test_incomplete_final_is_nudged_then_classified_complete():
    agent = make_agent()
    callback = AsyncMock(side_effect=[
        {"text": "Now let me compute the hashes.", "tool_calls": []},
        {"text": "Hashes computed and pin tests pass.", "tool_calls": []},
    ])
    classifier = make_classifier(
        side_effect=[(False, "hashes and pin tests are still missing"), (True, "")]
    )
    await _run_agent(agent, "sys", [], callback, AsyncMock(), completion_classifier=classifier)
    assert agent.state is AgentState.COMPLETED
    assert callback.await_count == 2
    assert "You are not done." in agent.messages[-2]["content"]
    assert classifier.classify.await_args_list[0].args[0] == agent.goal
    assert classifier.classify.await_count == 2


@pytest.mark.asyncio
async def test_classifier_error_fails_open():
    agent = make_agent()
    callback = AsyncMock(return_value={"text": "done", "tool_calls": []})
    classifier = make_classifier(side_effect=TimeoutError("judge timed out"))
    await _run_agent(agent, "sys", [], callback, AsyncMock(), completion_classifier=classifier)
    assert agent.state is AgentState.COMPLETED
    assert agent.result == "done"
    assert classifier.classify.await_count == 1


@pytest.mark.asyncio
async def test_incomplete_at_iteration_budget_is_failed_and_visible():
    agent = make_agent(max_iterations=1)
    callback = AsyncMock(return_value={"text": "Now let me finish that.", "tool_calls": []})
    classifier = make_classifier(return_value=(False, "work remains"))
    await _run_agent(
        agent, "sys", [], callback, AsyncMock(), max_iterations=1,
        completion_classifier=classifier,
    )
    assert agent.state is AgentState.FAILED
    assert "work remains" in agent.error
    assert agent.result == "Now let me finish that."


@pytest.mark.asyncio
async def test_parent_steer_is_in_classifier_goal():
    agent = make_agent()
    callback = AsyncMock(return_value={"text": "done", "tool_calls": []})
    classifier = make_classifier(return_value=(True, ""))
    agent._inbox.put_nowait({"sequence": 1, "text": "Also verify the changelog."})
    await _run_agent(agent, "sys", [], callback, AsyncMock(), completion_classifier=classifier)
    goal = classifier.classify.await_args.args[0]
    assert "Also verify the changelog" in goal


@pytest.mark.asyncio
async def test_normal_finish_uses_one_classifier_call():
    agent = make_agent()
    callback = AsyncMock(return_value={"text": "done", "tool_calls": []})
    classifier = make_classifier(return_value=(True, ""))
    await _run_agent(agent, "sys", [], callback, AsyncMock(), completion_classifier=classifier)
    assert agent.state is AgentState.COMPLETED
    assert classifier.classify.await_count == 1
