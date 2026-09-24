from __future__ import annotations

import asyncio
import hashlib
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from src.agents.manager import AgentInfo, AgentManager, AgentState, _run_agent
from src.discord.completion import CompletionClassifier
from src.discord.native_tools.agents_tasks import AgentTaskTools
from src.llm.auxiliary import AuxiliaryLLMClient
from src.llm.ollama import OllamaClient
from src.llm.openai_codex import CodexChatClient
from src.llm.openai_compatible import OpenAICompatibleClient
from src.web.api.agents_loops import register_agents


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


class BlockingClassifier:
    async def classify(self, *_args, **_kwargs):
        await asyncio.Event().wait()


@pytest.mark.asyncio
async def test_incomplete_final_is_nudged_then_classified_complete():
    agent = make_agent()
    callback = AsyncMock(side_effect=[
        {"text": "", "tool_calls": [{"id": "t1", "name": "noop", "input": {}}]},
        {"text": "Now let me compute the hashes.", "tool_calls": []},
        {"text": "Hashes computed and pin tests pass.", "tool_calls": []},
    ])
    classifier = make_classifier(
        side_effect=[(False, "hashes and pin tests are still missing"), (True, "")]
    )
    await _run_agent(
        agent, "sys", [], callback, AsyncMock(return_value="ok"),
        completion_classifier=classifier,
    )
    assert agent.state is AgentState.COMPLETED
    assert callback.await_count == 3
    assert any(
        message.get("provenance") == "agent_completion_classifier"
        and "You are not done." in message["content"]
        for message in agent.messages
    )
    assert classifier.classify.await_args_list[0].args[0] == agent.goal
    assert classifier.classify.await_count == 2


@pytest.mark.asyncio
async def test_classifier_error_fails_open():
    agent = make_agent()
    callback = AsyncMock(side_effect=[
        {"text": "", "tool_calls": [{"id": "t1", "name": "noop", "input": {}}]},
        {"text": "done", "tool_calls": []},
    ])
    classifier = make_classifier(side_effect=TimeoutError("judge timed out"))
    await _run_agent(
        agent, "sys", [], callback, AsyncMock(return_value="ok"),
        completion_classifier=classifier,
    )
    assert agent.state is AgentState.COMPLETED
    assert agent.result == "done"
    assert classifier.classify.await_count == 1


@pytest.mark.asyncio
async def test_incomplete_at_iteration_budget_is_failed_and_visible():
    agent = make_agent(max_iterations=2)
    callback = AsyncMock(side_effect=[
        {"text": "", "tool_calls": [{"id": "t1", "name": "noop", "input": {}}]},
        {"text": "Now let me finish that.", "tool_calls": []},
    ])
    classifier = make_classifier(return_value=(False, "work remains"))
    await _run_agent(
        agent, "sys", [], callback, AsyncMock(return_value="ok"), max_iterations=2,
        completion_classifier=classifier,
    )
    assert agent.state is AgentState.FAILED
    assert "work remains" in agent.error
    assert agent.result == "Now let me finish that."
    assert agent.state_history[-2].to_state is AgentState.EXECUTING


@pytest.mark.asyncio
async def test_parent_steer_is_in_classifier_goal():
    agent = make_agent()
    callback = AsyncMock(side_effect=[
        {"text": "", "tool_calls": [{"id": "t1", "name": "noop", "input": {}}]},
        {"text": "done", "tool_calls": []},
    ])
    classifier = make_classifier(return_value=(True, ""))
    agent._inbox.put_nowait({"sequence": 1, "text": "Also verify the changelog."})
    await _run_agent(
        agent, "sys", [], callback, AsyncMock(return_value="ok"),
        completion_classifier=classifier,
    )
    goal = classifier.classify.await_args.args[0]
    assert "Also verify the changelog" in goal
    assert "later corrections supersede conflicting earlier requests" in goal


@pytest.mark.asyncio
async def test_pure_reasoning_final_skips_classifier():
    agent = make_agent()
    callback = AsyncMock(return_value={"text": "done", "tool_calls": []})
    classifier = make_classifier(return_value=(True, ""))
    await _run_agent(agent, "sys", [], callback, AsyncMock(), completion_classifier=classifier)
    assert agent.state is AgentState.COMPLETED
    assert classifier.classify.await_count == 0


@pytest.mark.asyncio
async def test_tool_work_final_is_classified_once():
    agent = make_agent()
    callback = AsyncMock(side_effect=[
        {"text": "", "tool_calls": [{"id": "t1", "name": "noop", "input": {}}]},
        {"text": "done", "tool_calls": []},
    ])
    classifier = make_classifier(return_value=(True, ""))
    await _run_agent(
        agent, "sys", [], callback, AsyncMock(return_value="ok"),
        completion_classifier=classifier,
    )
    assert agent.state is AgentState.COMPLETED
    assert classifier.classify.await_count == 1


@pytest.mark.asyncio
async def test_completion_continuations_stop_classifying_after_fixed_limit():
    from src.agents.manager import MAX_AGENT_COMPLETION_CONTINUATIONS

    agent = make_agent(max_iterations=20)
    responses = []
    call_id = 0
    for index in range(MAX_AGENT_COMPLETION_CONTINUATIONS + 2):
        call_id += 1
        responses.append({
            "text": "", "tool_calls": [{
                "id": f"t{call_id}", "name": "noop", "input": {"iteration": index}
            }]
        })
        responses.append({"text": f"candidate {index}", "tool_calls": []})
    callback = AsyncMock(side_effect=responses)
    classifier = make_classifier(return_value=(False, "still missing"))
    executor = AsyncMock(side_effect=lambda _name, args: f"ok {args['iteration']}")
    await _run_agent(
        agent, "sys", [], callback, executor,
        max_iterations=20, completion_classifier=classifier,
    )
    assert agent.state is AgentState.COMPLETED
    assert classifier.classify.await_count == MAX_AGENT_COMPLETION_CONTINUATIONS
    assert callback.await_count == 2 * (MAX_AGENT_COMPLETION_CONTINUATIONS + 1)


@pytest.mark.asyncio
async def test_rejected_candidate_then_tool_iteration_at_cap_transitions_to_failed():
    agent = make_agent(max_iterations=3)
    callback = AsyncMock(side_effect=[
        {"text": "", "tool_calls": [{"id": "t1", "name": "noop", "input": {}}]},
        {"text": "I still need to check one thing.", "tool_calls": []},
        {"text": "", "tool_calls": [{"id": "t2", "name": "noop", "input": {}}]},
    ])
    classifier = make_classifier(return_value=(False, "verification remains"))
    await _run_agent(
        agent, "sys", [], callback, AsyncMock(return_value="ok"),
        max_iterations=3, completion_classifier=classifier,
    )
    assert agent.state is AgentState.FAILED
    assert "incomplete at iteration cap" in agent.state_history[-1].reason
    assert agent.state_history[-2].to_state is AgentState.EXECUTING
    assert "verification remains" in agent.error
    assert agent.iteration_count == 3
    assert callback.await_count == 3


@pytest.mark.asyncio
async def test_completion_judge_is_bounded_by_remaining_lifetime():
    agent = make_agent()
    callback = AsyncMock(side_effect=[
        {"text": "", "tool_calls": [{"id": "t1", "name": "noop", "input": {}}]},
        {"text": "answer", "tool_calls": []},
    ])

    async def expires_during_judge(*_args, **kwargs):
        assert kwargs["timeout_seconds"] > 1
        # Expire the agent deterministically while the judge is running. No
        # wall-clock sleep or scheduler timing is involved.
        agent.created_at -= agent.max_lifetime + 1
        return True, ""

    classifier = make_classifier(side_effect=expires_during_judge)
    agent.max_lifetime = 60
    await _run_agent(
        agent, "sys", [], callback, AsyncMock(return_value="ok"),
        completion_classifier=classifier,
    )
    assert agent.state is AgentState.TIMEOUT
    assert callback.await_count == 2


@pytest.mark.asyncio
async def test_parent_inbox_drain_after_judging_supersedes_stale_classification():
    agent = make_agent(max_iterations=4)
    callback = AsyncMock(side_effect=[
        {"text": "", "tool_calls": [{"id": "t1", "name": "noop", "input": {}}]},
        {"text": "Old target is not done.", "tool_calls": []},
        {"text": "Correction is done.", "tool_calls": []},
    ])

    async def steer_during_judge(*_args, **_kwargs):
        if classifier.classify.await_count == 1:
            agent._inbox.put_nowait(
                {"sequence": 1, "text": "Ignore the old target; verify the new report."}
            )
            agent._inbox_event.set()
            return False, "old target remains incomplete"
        return True, ""

    classifier = make_classifier(side_effect=steer_during_judge)
    await _run_agent(
        agent, "sys", [], callback, AsyncMock(return_value="ok"),
        completion_classifier=classifier,
    )
    assert agent.state is AgentState.COMPLETED
    assert callback.await_count == 3
    assert any(
        message.get("provenance") == "agent_parent"
        and "new report" in message["content"]
        for message in agent.messages
    )
    assert classifier.classify.await_count == 2
    assert not any(
        message.get("provenance") == "agent_completion_classifier"
        for message in agent.messages
    )


@pytest.mark.asyncio
async def test_iteration_cap_failure_visible_to_wait_results_and_agents_api():
    manager = AgentManager()
    manager.set_completion_classifier(make_classifier(side_effect=[(False, "checks remain")]))
    callback = AsyncMock(side_effect=[
        {"text": "", "tool_calls": [{"id": "t1", "name": "noop", "input": {}}]},
        {"text": "not done yet", "tool_calls": []},
        {"text": "", "tool_calls": [{"id": "t2", "name": "noop", "input": {}}]},
    ])
    aid = manager.spawn(
        label="bounded", goal="finish the requested task", channel_id="c",
        requester_id="u", requester_name="user", iteration_callback=callback,
        tool_executor_callback=AsyncMock(return_value="ok"), max_iterations=3,
    )
    waited = await manager.wait_for_agents([aid], timeout=1, poll_interval=0.01)
    assert waited[aid]["state"] == "failed"
    assert waited[aid]["status"] == "failed"
    assert "incomplete at iteration cap" in waited[aid]["state_history"][-1]["reason"]
    result = manager.get_results(aid)
    assert result is not None and result["state"] == "failed"
    assert result["result"]

    tools = object.__new__(AgentTaskTools)
    tools._agent_manager = manager
    tools._agent_trajectory_saver = None
    tools._tool_executor = SimpleNamespace(
        config=SimpleNamespace(tools=SimpleNamespace(tool_output_max_chars=12000)),
        _permission_manager=None,
    )
    collected = json.loads(
        await tools._handle_get_agent_results({"agent_id": aid}, user_id="u", channel_id="c")
    )
    assert collected["status"] == "failed"
    assert "checks remain" in collected["preview"]

    bot = SimpleNamespace(agent_manager=manager)
    routes = web.RouteTableDef()
    register_agents(routes, bot)
    app = web.Application()
    app.router.add_routes(routes)
    async with TestClient(TestServer(app)) as client:
        listing = await (await client.get("/api/agents")).json()
        detail = await (await client.get(f"/api/agents/{aid}")).json()
    listed = next(row for row in listing if row["id"] == aid)
    assert listed["state"] == "failed" and listed["status"] == "failed"
    assert detail["state"] == "failed" and detail["error"]


@pytest.mark.asyncio
async def test_completion_classifier_uses_live_auxiliary_client_without_output_cap():
    auxiliary = SimpleNamespace(chat=AsyncMock(return_value="INCOMPLETE: one check remains"))
    primary = SimpleNamespace(chat=AsyncMock(return_value="COMPLETE"))
    current_aux = {"client": auxiliary}
    classifier = CompletionClassifier(
        get_llm_client=lambda: primary,
        get_auxiliary_llm_client=lambda: current_aux["client"],
    )
    is_complete, reason = await classifier.classify(
        "finish this", "partial", ["run_command"], timeout_seconds=2.5
    )
    assert (is_complete, reason) == (False, "one check remains")
    auxiliary.chat.assert_awaited_once()
    assert auxiliary.chat.await_args.kwargs["task"] == "completion_classifier"
    assert "max_tokens" not in auxiliary.chat.await_args.kwargs
    primary.chat.assert_not_awaited()

    current_aux["client"] = None
    is_complete, reason = await classifier.classify("finish", "done", ["run_command"])
    assert (is_complete, reason) == (True, "")
    primary.chat.assert_awaited_once()


class _JudgeTestAuth:
    async def get_access_token(self):
        return "test-only"

    def get_account_id(self):
        return None


@pytest.mark.asyncio
@pytest.mark.parametrize("aux_failure", ["none", "empty", "error"])
async def test_codex_judge_wire_bytes_unchanged_auxiliary_and_fallback(
    monkeypatch, aux_failure,
):
    """Pin actual HTTP request bytes captured from the pre-fix judge on both routes.

    SHA-256 constants were recorded from the 128-token-cap baseline before
    removing it. They include the prompt, input, ordering and JSON serialization.
    """
    from src.llm import openai_codex

    captured = []

    async def respond(request):
        captured.append(await request.read())
        if aux_failure == "error" and len(captured) == 1:
            return web.Response(status=400, text="invalid auxiliary request")
        result = "" if aux_failure == "empty" and len(captured) == 1 else "COMPLETE"
        event = {"type": "response.completed", "response": {
            "output": ([{"type": "message", "content": [{"text": result}]}]
                       if result else []),
        }}
        return web.Response(
            text=f"data: {json.dumps(event)}\n\ndata: [DONE]\n\n",
            content_type="text/event-stream",
        )

    app = web.Application()
    app.router.add_post("/responses", respond)
    async with TestServer(app) as server:
        monkeypatch.setattr(openai_codex, "CODEX_API_URL", str(server.make_url("/responses")))
        auxiliary_client = CodexChatClient(
            _JudgeTestAuth(), model="gpt-6-luna", reasoning_effort="high", max_retries=1,
        )
        primary_client = CodexChatClient(
            _JudgeTestAuth(), model="gpt-6-sol", reasoning_effort="medium", max_retries=1,
        )
        auxiliary = AuxiliaryLLMClient(auxiliary_client, primary_client)
        classifier = CompletionClassifier(
            get_llm_client=lambda: primary_client,
            get_auxiliary_llm_client=lambda: auxiliary,
        )
        try:
            assert await classifier.classify("finish this", "done", ["run_command"]) == (True, "")
        finally:
            await auxiliary_client.close()
            await primary_client.close()

    assert [hashlib.sha256(body).hexdigest() for body in captured] == (
        ["a9ac2b229cb52b4e62e8293bf9d0e3a75133fd5354c08f849f48f83a4a8689e6",
         "6c21e5c550a70cd5dd7c2c1299ea81d56c6a8ec94f2606c9f3e770f9eaed323a"]
        if aux_failure != "none" else
        ["a9ac2b229cb52b4e62e8293bf9d0e3a75133fd5354c08f849f48f83a4a8689e6"]
    )
    assert all("max_tokens" not in json.loads(body) for body in captured)


@pytest.mark.asyncio
@pytest.mark.parametrize("backend", ["compat", "ollama"])
@pytest.mark.parametrize("fallback", [False, True])
async def test_judge_uses_endpoint_normal_output_budget_for_aux_and_fallback(
    monkeypatch, backend, fallback,
):
    """Both routes reach provider body generation with no 128-token cap."""
    bodies = []
    if backend == "compat":
        def make_client(model):
            client = OpenAICompatibleClient(
                api_key="test-only", model=model, max_tokens=4096,
            )

            async def capture(body):
                bodies.append(body)
                return {"choices": [{"message": {"content": "COMPLETE"}}]}

            monkeypatch.setattr(client, "_request_with_retry", capture)
            return client

        def budget(body):
            return body["max_tokens"]
    else:
        def make_client(model):
            client = OllamaClient(model=model, max_tokens=4096)

            async def capture(body):
                bodies.append(body)
                return {"message": {"content": "COMPLETE"}}

            monkeypatch.setattr(client, "_request_with_retry", capture)
            return client

        def budget(body):
            return body["options"]["num_predict"]

    aux_client = make_client("reasoning-aux")
    primary = make_client("reasoning-primary")
    if fallback:
        async def empty(body):
            bodies.append(body)
            return ({"choices": [{"message": {"content": ""}}]}
                    if backend == "compat" else {"message": {"content": ""}})
        monkeypatch.setattr(aux_client, "_request_with_retry", empty)
    auxiliary = AuxiliaryLLMClient(
        aux_client, primary, provider=backend, model="reasoning-aux",
    )
    classifier = CompletionClassifier(
        get_llm_client=lambda: primary,
        get_auxiliary_llm_client=lambda: auxiliary,
    )
    assert await classifier.classify("finish this", "done", ["run_command"]) == (True, "")
    assert [budget(body) for body in bodies] == ([4096, 4096] if fallback else [4096])
    assert [body["model"] for body in bodies] == (
        ["reasoning-aux", "reasoning-primary"] if fallback else ["reasoning-aux"]
    )


def test_ambiguous_and_empty_judge_answers_warn_without_changing_verdict(caplog):
    classifier = CompletionClassifier(get_llm_client=lambda: None)
    for response in ("", "unknown"):
        with caplog.at_level("WARNING"):
            assert classifier.parse_response(response) == (True, "")
        assert "Completion classifier: ambiguous response, treating as COMPLETE" in caplog.text
        caplog.clear()


@pytest.mark.asyncio
async def test_completion_classifier_clamps_rpc_timeout_to_remaining_lifetime(monkeypatch):
    client = SimpleNamespace(chat=AsyncMock(return_value="COMPLETE"))
    classifier = CompletionClassifier(get_llm_client=lambda: client)
    seen = {}

    async def wait_for(awaitable, *, timeout):
        seen["timeout"] = timeout
        return await awaitable

    monkeypatch.setattr("src.discord.completion.asyncio.wait_for", wait_for)
    assert await classifier.classify("goal", "done", ["tool"], timeout_seconds=0.25) == (True, "")
    assert seen["timeout"] == 0.25


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("provider", "auxiliary", "expected"),
    [
        ("compat", False, 60.0),
        ("ollama", True, 60.0),
        ("codex", True, 10.0),
    ],
)
async def test_completion_classifier_provider_timeout(monkeypatch, provider, auxiliary, expected):
    from src.llm.openai_codex import CodexChatClient

    seen = {}

    async def wait_for(awaitable, *, timeout):
        seen["timeout"] = timeout
        return await awaitable

    monkeypatch.setattr("src.discord.completion.asyncio.wait_for", wait_for)
    primary = (
        CodexChatClient(_JudgeTestAuth(), model="test")
        if provider == "codex" and not auxiliary
        else SimpleNamespace(chat=AsyncMock(return_value="COMPLETE"))
    )
    if auxiliary:
        judge = SimpleNamespace(
            provider=provider,
            chat=AsyncMock(return_value="COMPLETE"),
        )
        classifier = CompletionClassifier(
            get_llm_client=lambda: primary,
            get_auxiliary_llm_client=lambda: judge,
        )
    else:
        classifier = CompletionClassifier(get_llm_client=lambda: primary)

    assert await classifier.classify("goal", "done", ["tool"]) == (True, "")
    assert seen["timeout"] == expected


@pytest.mark.asyncio
async def test_codex_main_judge_keeps_ten_second_timeout(monkeypatch):
    from src.llm.openai_codex import CodexChatClient

    primary = CodexChatClient(_JudgeTestAuth(), model="test")
    # Replace chat to avoid any provider I/O while retaining concrete Codex identity.
    primary.chat = AsyncMock(return_value="COMPLETE")
    seen = {}

    async def wait_for(awaitable, *, timeout):
        seen["timeout"] = timeout
        return await awaitable

    monkeypatch.setattr("src.discord.completion.asyncio.wait_for", wait_for)
    classifier = CompletionClassifier(get_llm_client=lambda: primary)
    assert await classifier.classify("goal", "done", ["tool"]) == (True, "")
    assert seen["timeout"] == 10.0


@pytest.mark.asyncio
async def test_completion_classifier_timeout_fails_open_within_lifetime_bound():
    started = asyncio.get_running_loop().time()

    async def slow_chat(*_args, **_kwargs):
        await asyncio.sleep(1)
        return "INCOMPLETE: not reached"

    classifier = CompletionClassifier(
        get_llm_client=lambda: SimpleNamespace(chat=slow_chat),
    )
    assert await classifier.classify("goal", "answer", ["tool"], timeout_seconds=0.01) == (
        True,
        "",
    )
    assert asyncio.get_running_loop().time() - started < 0.2


@pytest.mark.asyncio
async def test_completion_classifier_nonpositive_timeout_fails_open_without_clients():
    classifier = CompletionClassifier(
        get_llm_client=lambda: pytest.fail("primary client should not be resolved"),
        get_auxiliary_llm_client=lambda: pytest.fail("auxiliary client should not be resolved"),
    )

    assert await classifier.classify("goal", "answer", ["tool"], timeout_seconds=0) == (
        True,
        "",
    )


@pytest.mark.asyncio
async def test_completion_classifier_auxiliary_lookup_error_falls_back_to_primary():
    primary = SimpleNamespace(chat=AsyncMock(return_value="COMPLETE"))

    def broken_auxiliary_lookup():
        raise RuntimeError("auxiliary unavailable")

    classifier = CompletionClassifier(
        get_llm_client=lambda: primary,
        get_auxiliary_llm_client=broken_auxiliary_lookup,
    )

    assert await classifier.classify("goal", "answer", ["tool"]) == (True, "")
    primary.chat.assert_awaited_once()
    assert "task" not in primary.chat.await_args.kwargs


@pytest.mark.asyncio
async def test_completion_classifier_fails_open_when_no_client_is_configured():
    classifier = CompletionClassifier(
        get_llm_client=lambda: None,
        get_auxiliary_llm_client=lambda: None,
    )

    assert await classifier.classify("goal", "answer", ["tool"]) == (True, "")


def test_agent_manager_receives_completion_classifier_from_composition_root():
    from src.config.schema import Config
    from src.discord.client import OdinBot

    bot = OdinBot(Config(discord={"token": "[REDACTED]"}))
    assert bot.agent_manager._completion_classifier is bot.completion_classifier
    assert (
        bot.completion_classifier.get_auxiliary_llm_client()
        is bot.llm_gateway.auxiliary_llm_client
    )
