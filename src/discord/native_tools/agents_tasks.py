"""Agents/tasks/loops native tool handlers (RFC-001 P5c, RFC-002 P3).

The fifth handler domain: background-task delegation, autonomous-loop
start/stop, agent spawn/collect, and the loop-agent bridge. These
handlers orchestrate the loop pipeline itself, so they take the
ToolLoopRunner directly (constructed before them in
``wiring.build_components``). Narrow-deps since RFC-002 P3: ``get_config``
and ``get_knowledge_store`` are provider callables (config is hot-reload
replaced; the knowledge store is swappable via reload), the LLM surface
is the gateway, and the compression config object is read live through
``get_context_compressor`` (the chat pipeline reads it the same way).
"""

from __future__ import annotations

import asyncio
from collections.abc import Callable
from dataclasses import dataclass
from typing import TYPE_CHECKING

import discord

from ...agents.manager import AGENT_BLOCKED_TOOLS, filter_agent_tools
from ...async_utils import fire_and_forget
from ...llm.recovery import generate_with_recovery, preflight_incompatible_effort
from ...llm.tool_history import normalize_tool_calls
from ...odin_log import get_logger
from ...tools.result_validator import ToolResult
from ..background_task import (
    MAX_STEPS,
    BackgroundTask,
    _send_progress,
    create_task_id,
    run_background_task,
)
from ..tool_loop import _LoopMessageProxy

if TYPE_CHECKING:
    from ...agents.loop_bridge import LoopAgentBridge
    from ...agents.manager import AgentManager
    from ...agents.trajectory import AgentTrajectorySaver
    from ...audit.logger import AuditLogger
    from ...search.embedder import LocalEmbedder
    from ...tools.autonomous_loop import LoopManager
    from ...tools.executor import ToolExecutor
    from ...tools.mcp import MCPManager
    from ...tools.skill_manager import SkillManager
    from ..channel_state import ChannelStateRegistry
    from ..llm_gateway import LLMGateway
    from ..prompts import PromptBuilder
    from ..tool_catalog import ToolCatalog
    from ..tool_loop import ToolLoopRunner
    from ..turn_recorder import TurnRecorder

log = get_logger("discord")


def _agent_llm_policy(
    config: object,
    client: object,
    *,
    model_override: str | None = None,
    effort_override: str | None = None,
) -> tuple[str | None, str | None]:
    """Resolve the spawned-agent REQUEST policy from ONE config read.

    Returns ``(agent_effort, resolved_model)``. A per-spawn override, when
    given, is FIXED for that agent's lifetime and wins over live config; when
    None, the value tracks live config at CALL time (a WebUI change reaches
    in-flight agents next iteration). ``resolved_model`` is the exact string
    passed to ``chat_with_tools(model=...)`` (``override ?? agent_model ??
    model``, ""/whitespace = inherit). For providers that pin their model (no
    ``reasoning_effort`` attr = not the Codex client) it is None: the override
    would be ignored. This helper decides what the request ASKS FOR; the
    trajectory stamp is read from the response's provenance fields.
    """
    codex_cfg = getattr(config, "openai_codex", None)
    is_codex = hasattr(client, "reasoning_effort")
    # Resolution order (Odin): accepted spawn override -> fixed agent config ->
    # main setting when the axis is null (inherit) or "auto". "auto" is config
    # policy and is NEVER sent to a provider, so it resolves to inherit-main
    # (None effort / the main model) exactly like null.
    agent_effort: str | None
    if effort_override is not None:
        agent_effort = effort_override
    else:
        cfg_effort = getattr(codex_cfg, "agent_reasoning_effort", None)
        agent_effort = None if cfg_effort in (None, "auto") else cfg_effort
    if not is_codex:
        return agent_effort, None
    resolved_model: str | None
    if model_override:
        resolved_model = model_override
    else:
        raw = getattr(codex_cfg, "agent_model", None)
        agent_model = (str(raw).strip() or None) if raw else None
        if agent_model == "auto":
            agent_model = None
        resolved_model = agent_model or getattr(codex_cfg, "model", None)
    return agent_effort, resolved_model


def _parse_spawn_overrides(
    inp: dict, *, model_mode: str = "auto", effort_mode: str = "auto"
) -> tuple[str | None, str | None, str | None]:
    """Extract per-spawn ``(model_override, effort_override, error)`` from a
    spawn/task dict, enforced at the SPAWN BOUNDARY against the axis modes.

    An axis field is only accepted when that axis is ``auto``; on a fixed or
    inherited axis it is HARD-REJECTED (a clear error, never silently dropped —
    a dropped override could run an expensive task on the wrong policy while
    appearing to succeed). The check is on KEY PRESENCE, not truthiness: the
    schema omits the field on a non-auto axis, so even a hand-built
    ``"model": null`` is outside the contract. Empty/whitespace on an accepted
    axis = inherit (None). An invalid ``reasoning_effort`` is rejected (never
    clamped) so a typo fails loudly.
    """
    from ...config.schema import CODEX_REASONING_EFFORTS

    if "model" in inp and model_mode != "auto":
        return (
            None,
            None,
            (
                "model is not accepted because Agent Model is not set to Auto — select "
                "'Auto — choose per spawn' in the WebUI to allow per-spawn model selection"
            ),
        )
    if "reasoning_effort" in inp and effort_mode != "auto":
        return (
            None,
            None,
            (
                "reasoning_effort is not accepted because Agent Reasoning is not set to Auto — "
                "select 'Auto — choose per spawn' in the WebUI to allow per-spawn effort selection"
            ),
        )

    raw_model = inp.get("model")
    model_override = (str(raw_model).strip() or None) if raw_model else None

    raw_effort = inp.get("reasoning_effort")
    if raw_effort in ("", None):
        return model_override, None, None
    effort = str(raw_effort)
    if effort not in CODEX_REASONING_EFFORTS:
        allowed = ", ".join(sorted(CODEX_REASONING_EFFORTS))
        return None, None, f"invalid reasoning_effort {effort!r} (allowed: {allowed})"
    return model_override, effort, None


def _spawn_pair_error(
    config: object, client: object, model_override: str | None, effort_override: str | None
) -> str | None:
    """Spawn boundary: the model/effort pair this spawn would run RIGHT NOW
    (override beats fixed config beats inherited-main) must not be a
    known-incompatible combination — e.g. an explicit ``model=gpt-5.5`` task
    under a ``max`` effort config. Resolved through the same policy helper the
    iteration callbacks use, so the validated pair IS the pair the first
    iteration would request. Live-config drift after spawn is caught by the
    request-construction boundary in the provider."""
    from ...config.schema import effort_incompatibility_error

    if not hasattr(client, "reasoning_effort"):
        # Non-Codex providers accept-and-ignore Codex effort semantics — a
        # model-name collision (e.g. an Ollama model tagged "gpt-5.5") must
        # not trip Codex capability rules.
        return None
    agent_effort, resolved_model = _agent_llm_policy(
        config, client, model_override=model_override, effort_override=effort_override
    )
    effort_now = (
        agent_effort if agent_effort is not None else getattr(client, "reasoning_effort", None)
    )
    model_now = resolved_model if resolved_model else getattr(client, "model", None)
    return effort_incompatibility_error(model_now, effort_now)


def _observer_clamp(observer, model) -> int | None:
    """Total clamp lookup — a broken observer never breaks a spawn."""
    if observer is None:
        return None
    try:
        return observer.active_clamp(model)
    except Exception:
        log.exception("active_clamp failed (non-fatal); treating as unclamped")
        return None


def _agent_scope(agent_id: str | None):
    """This agent's own calibration lineage.

    Keyed on the INDIVIDUAL agent id, never ``root_id``: a child agent has its
    own message history, so importing a parent's density would republish one
    workload's measurement to another. Once a child's result lands in the
    parent's messages, the parent's next accepted generation measures the
    resulting payload itself.
    """
    from ...llm.context_budget import WorkloadScope

    return WorkloadScope("agent", str(agent_id)) if agent_id else None


def _observer_density(observer, scope, model) -> int | None:
    """Total density lookup — a broken observer never breaks a spawn."""
    if observer is None or not model or scope is None:
        return None
    try:
        return observer.density_for(scope, model)
    except Exception:
        log.exception("density_for failed (non-fatal); treating as uncalibrated")
        return None


def _generation_budget_snapshot(
    cfg,
    client,
    resolved_model,
    compressor,
    observer=None,
    *,
    is_codex: bool | None = None,
    scope=None,
):
    """The frozen generation's budget snapshot, from the SAME identity capture
    as the request (collision-gated: non-Codex clients get unknown-model
    math regardless of what their model is named)."""
    from ...llm.context_budget import snapshot_for_codex_config

    if is_codex is None:
        # Compatibility callers predate immutable serving identities; their
        # client shape remains the conservative fallback. Production passes
        # the captured provider decision explicitly below.
        is_codex = hasattr(client, "reasoning_effort")
    if is_codex:
        model_for_budget = resolved_model or getattr(client, "model", None)
    else:
        model_for_budget = None
    return snapshot_for_codex_config(
        model_for_budget,
        getattr(cfg, "openai_codex", None),
        max_context_chars=(getattr(compressor, "max_context_chars", None) if compressor else None),
        observed_clamp=_observer_clamp(observer, model_for_budget),
        density_milli=_observer_density(observer, scope, model_for_budget),
    )


def _gateway_serving_for_config(gateway, config):
    """Resolve one serving identity against an already-read root config.

    Production gateways return the immutable provider/client/model/effort
    tuple. Narrow test doubles retain their historical ``active_client`` shape;
    the generation-plan builder normalizes that legacy value conservatively.
    """
    capture = getattr(gateway, "capture_serving_identity", None)
    if capture is not None:
        return capture(config)
    return gateway.active_client


def _capture_agent_generation_plan(
    get_config,
    get_serving,
    get_compressor,
    *,
    model_override: str | None,
    effort_override: str | None,
    observer=None,
    agent_id_cell=None,
) -> dict:
    """Capture one immutable agent-generation identity and budget plan.

    The root configuration is read exactly once. Request policy and the
    context-budget snapshot are therefore derived from the same config object,
    rather than straddling a live config replacement. ``effort`` is the
    resolved effective value for Codex-shaped clients; the ``None`` inherit
    sentinel never enters a frozen Codex plan, where a later in-place client
    mutation could otherwise change a rescue retry.
    """
    cfg = get_config()
    serving = get_serving(cfg)
    if hasattr(serving, "client") and hasattr(serving, "provider"):
        provider = serving.provider
        client = serving.client
    else:
        client = serving
        provider = (
            "codex"
            if client is None or hasattr(client, "reasoning_effort")
            else str(getattr(client, "provider_name", "unknown"))
        )
    requested_effort, resolved_model = _agent_llm_policy(
        cfg,
        client,
        model_override=model_override,
        effort_override=effort_override,
    )
    effective_effort = requested_effort
    if effective_effort is None and hasattr(client, "reasoning_effort"):
        effective_effort = getattr(client, "reasoning_effort", None)
    if effective_effort is None and hasattr(client, "reasoning_effort"):
        raise ValueError("Codex client has no resolved reasoning effort")
    # Provider identity, captured beside this generation's client/model,
    # is authoritative. Model names and Codex-shaped client attributes are
    # not evidence that a non-Codex response carries Codex usage semantics.
    is_codex = provider == "codex" and client is not None
    workload_scope = _agent_scope(
        agent_id_cell.get("id") if isinstance(agent_id_cell, dict) else None
    )
    return {
        "provider": provider,
        "client": client,
        "effort": effective_effort,
        "model": resolved_model,
        # Predictive pre-send admission is Codex-only: no other provider
        # supplies the accepted-token evidence contract calibration needs.
        "is_codex": is_codex,
        "workload_scope": workload_scope,
        "snapshot": _generation_budget_snapshot(
            cfg,
            client,
            resolved_model,
            get_compressor(),
            observer=observer,
            scope=workload_scope,
            is_codex=is_codex,
        ),
    }


def _make_budget_snapshot_provider(
    get_config, get_client, get_compressor, model_override, observer=None, agent_id_cell=None
):
    """Per-generation context-budget snapshot for a spawned agent.

    Resolves the EFFECTIVE agent model exactly like the iteration callback
    (override fixed for life; None tracks live config at call time) and
    derives the budget snapshot the manager compacts against. Overrides and
    utilization are live reads; the explicit character ceiling comes from the
    boot-frozen compression object so its restart-bound classification stays
    truthful. Total: any resolution failure surfaces in the manager as the
    documented fallback, never as an agent failure.
    """

    def provider():
        from ...llm.context_budget import snapshot_for_codex_config

        cfg = get_config()
        client = get_client()
        _, resolved_model = _agent_llm_policy(
            cfg, client, model_override=model_override, effort_override=None
        )
        compressor = get_compressor()
        # Provider identity gates the registry: a non-Codex client whose
        # model happens to be NAMED like a Codex slug (an Ollama model tagged
        # "gpt-5.6-sol") must get conservative unknown-model math, never a
        # Codex capability floor.
        if hasattr(client, "reasoning_effort"):
            model_for_budget = resolved_model or getattr(client, "model", None)
        else:
            model_for_budget = None
        return snapshot_for_codex_config(
            model_for_budget,
            getattr(cfg, "openai_codex", None),
            max_context_chars=(
                getattr(compressor, "max_context_chars", None) if compressor else None
            ),
            observed_clamp=_observer_clamp(observer, model_for_budget),
            density_milli=_observer_density(
                observer,
                _agent_scope(agent_id_cell.get("id") if isinstance(agent_id_cell, dict) else None),
                model_for_budget,
            ),
        )

    return provider


def _make_evidence_recorder(observer):
    """Adapter feeding an agent rescue's (overflow, response-dict) pair to
    the observer. The agent callback returns a plain dict, so the acceptance
    facts are lifted into the attribute shape ``record_rescue`` reads.
    Total — evidence never fails the iteration that just succeeded."""
    if observer is None:
        return None

    async def recorder(
        overflow,
        response,
        rejected_attempt=None,
        accepted_chars=None,
        accepted_images=None,
        workload_scope=None,
    ):
        try:
            if isinstance(response, dict):
                # Accepted-response provenance is authoritative. A non-Codex
                # provider may use a Codex-looking model slug and expose token
                # counts; neither makes it Codex window evidence.
                if response.get("provider") != "codex":
                    return
                from types import SimpleNamespace

                response = SimpleNamespace(
                    account_key=response.get("account_key"),
                    server_input_tokens=response.get("server_input_tokens"),
                    provenance_provider=response.get("provider"),
                    provenance_model=response.get("model"),
                )
            elif getattr(response, "provenance_provider", None) != "codex":
                return
            await observer.record_rescue(
                overflow=overflow,
                response=response,
                rejected_attempt=rejected_attempt,
                accepted_chars=accepted_chars,
                accepted_images=accepted_images,
                workload_scope=workload_scope,
            )
        except Exception:
            log.exception("agent window-evidence recording failed (non-fatal)")

    return recorder


def _make_density_recorder(observer, agent_id_cell=None):
    """Adapter folding one accepted agent request into the density EMA.

    The agent callback returns a plain dict, so provenance and usage are
    lifted out here. Total — calibration never disturbs a succeeded request.
    """
    if observer is None:
        return None

    def recorder(response, chars_sent, images_sent):
        try:
            if not isinstance(response, dict):
                return
            # Immutable response provenance is the authority. A non-Codex
            # provider may legally use a Codex-looking model slug and may even
            # expose a token count; neither may contaminate Codex calibration.
            if response.get("provider") != "codex":
                return
            observer.record_density(
                scope=_agent_scope(
                    agent_id_cell.get("id") if isinstance(agent_id_cell, dict) else None
                ),
                model=response.get("model"),
                chars_sent=chars_sent,
                images_sent=images_sent,
                server_input_tokens=response.get("server_input_tokens"),
            )
        except Exception:
            log.exception("agent density recording failed (non-fatal)")

    return recorder


def _provenance_stamp(resp: object, client: object) -> dict:
    """Execution-provenance fields for an iteration record, from the response.

    The response is the only layer that stays truthful across routing,
    retries, and live reloads. Missing provenance is recorded as UNKNOWN
    (empty/None) — never substituted with a call-site guess, which would
    silently reintroduce false attribution.
    """
    model = getattr(resp, "provenance_model", "") or ""
    if not model:
        log.warning(
            "LLM response from %s carried no execution provenance — "
            "recording iteration model as unknown",
            getattr(client, "provider_name", "?"),
        )
    return {
        "provider": getattr(resp, "provenance_provider", "") or "",
        "model": model,
        "reasoning_effort": getattr(resp, "provenance_reasoning_effort", None),
    }


@dataclass(frozen=True)
class AgentTaskDeps:
    """The true dependency surface of the agents/tasks/loops handlers."""

    get_config: Callable  # live root — replaced by config hot-reload
    llm_gateway: LLMGateway  # owns the swappable provider clients
    channel_state: ChannelStateRegistry  # background-task registry + caps
    tool_executor: ToolExecutor
    skill_manager: SkillManager
    get_knowledge_store: Callable  # swappable via bot.knowledge reloads
    embedder: LocalEmbedder | None
    audit: AuditLogger
    agent_manager: AgentManager
    loop_manager: LoopManager
    loop_agent_bridge: LoopAgentBridge
    agent_trajectory_saver: AgentTrajectorySaver | None
    get_context_compressor: Callable  # live read — tests swap it on the bot
    tool_loop: ToolLoopRunner  # loop iterations + tool dispatch
    turn_recorder: TurnRecorder  # lifecycle webhook emission
    prompt_builder: PromptBuilder
    tool_catalog: ToolCatalog
    # Passive window observer (phase 5): clamp source for agent budget
    # snapshots + evidence sink for agent rescues. None = feature-inert.
    window_observer: object | None = None
    # MCP control plane (P3) — background tasks dispatch published MCP tools
    # through the shared seam. None keeps the branch inert (tests).
    mcp_manager: MCPManager | None = None


class AgentTaskTools:
    def __init__(self, deps: AgentTaskDeps) -> None:
        self._get_config = deps.get_config
        self._window_observer = deps.window_observer
        self._mcp_manager = deps.mcp_manager
        self._llm_gateway = deps.llm_gateway
        self._channel_state = deps.channel_state
        self._tool_executor = deps.tool_executor
        self._skill_manager = deps.skill_manager
        self._get_knowledge_store = deps.get_knowledge_store
        self._embedder = deps.embedder
        self._audit = deps.audit
        self._agent_manager = deps.agent_manager
        self._loop_manager = deps.loop_manager
        self._loop_agent_bridge = deps.loop_agent_bridge
        self._agent_trajectory_saver = deps.agent_trajectory_saver
        self._get_context_compressor = deps.get_context_compressor
        self._tool_loop = deps.tool_loop
        self._turn_recorder = deps.turn_recorder
        self._prompt_builder = deps.prompt_builder
        self._tool_catalog = deps.tool_catalog

    # --- Background task delegation ---

    async def _handle_delegate_task(self, message: discord.Message, inp: dict) -> str:
        """Create and start a background task."""
        description = inp.get("description", "Background task")
        steps = inp.get("steps", [])

        if not steps or not isinstance(steps, list):
            return "No steps provided."
        if len(steps) > MAX_STEPS:
            return f"Too many steps ({len(steps)}). Maximum is {MAX_STEPS}."

        # Validate all steps have tool_name and required tool_input fields
        required_fields = {
            "run_command": "command",
            "run_script": "script",
        }
        for i, step in enumerate(steps):
            if not isinstance(step, dict) or "tool_name" not in step:
                return f"Step {i}: must have 'tool_name'."
            tn = step["tool_name"]
            req = required_fields.get(tn)
            if req:
                tool_input = step.get("tool_input", {})
                if req not in tool_input:
                    return (
                        f"Step {i + 1} ({tn}): missing '{req}' in tool_input. "
                        f"Each {tn} step MUST include tool_input with "
                        f"'{req}': 'your_shell_command'. "
                        f"Rebuild the steps with proper tool_input and retry."
                    )

        task = BackgroundTask(
            task_id=create_task_id(),
            description=description,
            steps=steps,
            channel=message.channel,
            requester=str(message.author),
            requester_id=str(message.author.id),
        )

        # Prune old completed tasks
        completed = [
            tid
            for tid, t in self._channel_state.background_tasks.items()
            if t.status in ("completed", "failed", "cancelled")
        ]
        while len(completed) > self._channel_state.background_tasks_max:
            old = completed.pop(0)
            del self._channel_state.background_tasks[old]

        self._channel_state.background_tasks[task.task_id] = task

        # Build Codex callback for conversational follow-up. Resolves the
        # auxiliary pointer at CALL TIME so a live reload swap is honored: the
        # background follow-up routes to the aux model when it's enabled and
        # Codex is active; otherwise the active client handles it.
        codex_cb = None
        if self._llm_gateway.active_client:

            async def _codex_followup(messages: list[dict], system: str, max_tokens: int) -> str:
                aux = getattr(self._llm_gateway, "auxiliary_llm_client", None)
                provider_cfg = getattr(self._get_config(), "llm_provider", None)
                active = provider_cfg.active_provider if provider_cfg else "codex"
                if aux is not None and active == "codex":
                    return await aux.chat(
                        messages, system, task="background_followup", max_tokens=max_tokens
                    )
                return await self._llm_gateway.active_client.chat(
                    messages=messages,
                    system=system,
                    max_tokens=max_tokens,
                )

            codex_cb = _codex_followup

        # Launch in background
        async def _run():
            try:
                await run_background_task(
                    task,
                    self._tool_executor,
                    self._skill_manager,
                    knowledge_store=self._get_knowledge_store(),
                    embedder=self._embedder,
                    audit_logger=self._audit,
                    codex_callback=codex_cb,
                    mcp_manager=self._mcp_manager,
                )
            except asyncio.CancelledError:
                # cancel_task interrupted a step mid-run: request_cancel already
                # set status='cancelled'. The loop unwound before its own
                # completion path, so post one final progress line (shielded so
                # it isn't re-cancelled), skip summary + follow-up, and re-raise
                # so the task settles as cancelled.
                task.status = "cancelled"
                try:
                    await asyncio.shield(_send_progress(task, None))
                except Exception:
                    pass
                raise
            except Exception as e:
                log.error("Background task %s crashed: %s", task.task_id, e, exc_info=True)
                # Never overwrite a cancellation that already won with 'failed'.
                if task.status != "cancelled":
                    task.status = "failed"

        task._asyncio_task = asyncio.create_task(_run())

        return (
            f"Background task started (ID: `{task.task_id}`): **{description}** "
            f"({len(steps)} steps). Progress will be posted to this channel."
        )

    def _handle_list_tasks(self, inp: dict | None = None) -> str:
        """List background tasks, or get detailed results for a specific task."""
        if not self._channel_state.background_tasks:
            return "No background tasks."

        task_id = (inp or {}).get("task_id")

        # Detailed view for a specific task
        if task_id:
            task = self._channel_state.background_tasks.get(task_id)
            if not task:
                return f"No task found with ID `{task_id}`."
            lines = [
                f"**{task.description}** [{task.status}]",
                f"ID: `{task.task_id}` | {len(task.results)}/{len(task.steps)} steps",
                "",
            ]
            for r in task.results:
                icon = {"ok": "+", "error": "!", "skipped": "-", "cancelled": "x"}.get(
                    r.status, "?"
                )
                lines.append(
                    f"[{icon}] **Step {r.index + 1} ({r.description})** ({r.elapsed_ms}ms):"
                )
                lines.append(r.output if r.output else "(no output)")
                lines.append("")
            text = "\n".join(lines)
            if len(text) > 3800:
                text = (
                    text[:3800]
                    + "\n... (truncated, full results were posted in the progress message)"
                )
            return text

        # Overview of all tasks
        lines = []
        for tid, t in self._channel_state.background_tasks.items():
            done = len(t.results)
            total = len(t.steps)
            ok = sum(1 for r in t.results if r.status == "ok")
            errors = sum(1 for r in t.results if r.status == "error")
            lines.append(
                f"- `{tid}` [{t.status}] **{t.description}** "
                f"({done}/{total} steps, {ok} ok, {errors} errors)"
            )
        return "\n".join(lines)

    async def _handle_cancel_task(self, inp: dict) -> str:
        """Cancel a running background task and wait for it to actually stop.

        Uses ``request_cancel`` (not the cooperative ``cancel``) so an in-flight
        step is interrupted rather than run to completion; returns only after
        the task has settled as cancelled.
        """
        task_id = inp.get("task_id", "")
        task = self._channel_state.background_tasks.get(task_id)
        if not task:
            return f"No task found with ID `{task_id}`."
        cancelled = await task.request_cancel()
        if not cancelled:
            return f"Task `{task_id}` is not running (status: {task.status})."
        return f"Task `{task_id}` cancelled."

    def _handle_start_loop(self, message: discord.Message, inp: dict) -> str:
        """Start an autonomous loop."""
        goal = inp.get("goal", "")
        if not goal:
            return "A 'goal' is required to start a loop."

        interval = inp.get("interval_seconds", 60)
        mode = inp.get("mode", "notify")
        stop_condition = inp.get("stop_condition")
        max_iterations = inp.get("max_iterations", 50)

        # Build iteration callback that runs through Codex with tools
        async def _iteration_cb(
            prompt: str,
            channel: object,
            prev_context: str | None,
            cancel_event: asyncio.Event,
        ) -> str:
            return await self._tool_loop.run_autonomous(
                prompt,
                channel,
                prev_context,
                str(message.author.id),
                cancel_event=cancel_event,
            )

        result = self._loop_manager.start_loop(
            goal=goal,
            channel=message.channel,
            requester_id=str(message.author.id),
            requester_name=str(message.author),
            iteration_callback=_iteration_cb,
            interval_seconds=interval,
            mode=mode,
            stop_condition=stop_condition,
            max_iterations=max_iterations,
        )

        # If result is a loop ID (short hex), format success message
        if result.startswith("Error"):
            return result
        # Lifecycle webhook: loop.started
        fire_and_forget(
            self._turn_recorder._emit_lifecycle_event(
                "loop.started",
                {
                    "loop_id": result,
                    "goal": goal[:200],
                    "interval_seconds": interval,
                    "mode": mode,
                    "max_iterations": max_iterations,
                    "channel_id": str(getattr(message.channel, "id", "")),
                    "requester_id": str(message.author.id),
                },
            ),
            name="lifecycle:loop.started",
        )
        return (
            f"Loop started (ID: `{result}`): **{goal[:100]}** "
            f"(every {max(10, interval)}s, mode={mode}, max {max_iterations} iterations)"
        )

    async def _handle_stop_loop(self, inp: dict) -> str:
        """Stop an autonomous loop."""
        loop_id = inp.get("loop_id", "")
        if not loop_id:
            return "A 'loop_id' is required."
        result = await self._loop_manager.stop_loop(loop_id)
        # Lifecycle webhook: loop.stopped
        fire_and_forget(
            self._turn_recorder._emit_lifecycle_event(
                "loop.stopped",
                {
                    "loop_id": loop_id,
                    "result": result,
                },
            ),
            name="lifecycle:loop.stopped",
        )
        return result

    def _handle_list_loops(self) -> str:
        """List all autonomous loops."""
        return self._loop_manager.list_loops()

    # --- Agent tool handlers ---

    async def _agent_generate(
        self,
        client,
        *,
        messages: list[dict],
        sys_prompt: str,
        tool_defs: list[dict],
        agent_effort: str,
        resolved_model,
        provider: str = "codex",
    ):
        """One agent LLM generation through the shared recovery policy.

        Replaces the old manager-level bare-``except`` single retry: transient
        classes (capacity/transport/open breaker) recover here for up to the
        generation deadline; auth/malformed/quota-exhausted fail fast. The
        model-scoped breaker is keyed on the agent's EFFECTIVE model, so a
        fleet mixing models coordinates capacity per model. The manager's
        iteration wall (wait_for) hard-bounds this call INCLUDING recovery
        waits; cancellation propagates and releases any held probe.
        """
        # ONE immutable effective effort per generation: the value preflight
        # approves IS the value every attempt of this generation carries (an
        # inherited None used to re-resolve the client's live effort inside
        # each attempt, so a legal live change during an open-breaker wait —
        # xhigh→max — could turn an approved gpt-5.5@xhigh into a rejected
        # gpt-5.5@max at request build). Live config still reaches agents on
        # their NEXT iteration, the contract these callbacks document.
        effective_effort = agent_effort
        # The production callback contract always supplies a concrete resolved
        # effort for Codex-shaped clients; accepting the inherit sentinel here
        # would reintroduce live client reads on later physical retries.
        if effective_effort is None and hasattr(client, "reasoning_effort"):
            raise ValueError("agent generation plan has unresolved reasoning effort")
        # Pre-admission: validate the exact pair this generation will request
        # before touching the breaker — never wait out an open breaker's
        # deadline (or count a capacity failure) for a request that could not
        # legally be sent.
        preflight_incompatible_effort(client, model=resolved_model, effort=effective_effort)
        breaker = self._llm_gateway.capacity_breaker_for(resolved_model, provider=provider)
        policy = self._llm_gateway.recovery_policy()

        async def _attempt():
            return await client.chat_with_tools(
                messages=messages,
                system=sys_prompt,
                tools=tool_defs,
                reasoning_effort=effective_effort,
                model=resolved_model,
            )

        resp = await generate_with_recovery(_attempt, policy=policy, breaker=breaker)
        # Bypass-path success clears a latched llm_* guard key — provenance
        # only, never the post-await active provider.
        self._llm_gateway.notify_generation_success(getattr(resp, "provenance_provider", None))
        return resp

    async def _handle_spawn_agent(self, message: object, inp: dict) -> str:
        """Spawn an autonomous agent for a sub-task.

        Supports nested spawning up to ``AgentsConfig.max_nesting_depth``
        (default 2). The caller can pass ``parent_id`` in ``inp`` to nest
        under a parent; child agents inherit an elevated depth via
        AgentManager.spawn(). Each spawned agent's tool_executor_callback
        captures the agent's own id, so if the child itself calls spawn_agent
        the grandchild is correctly nested.
        """
        label = inp.get("label", "")
        goal = inp.get("goal", "")
        parent_id_arg = inp.get("parent_id")
        if not label or not goal:
            return "Both 'label' and 'goal' are required."

        from ...tools.agent_tool_policy import agent_axis_modes

        _model_mode, _effort_mode = agent_axis_modes(self._get_config())
        model_override, effort_override, ovr_err = _parse_spawn_overrides(
            inp, model_mode=_model_mode, effort_mode=_effort_mode
        )
        if ovr_err:
            return f"Error: {ovr_err}"

        if not self._llm_gateway.active_client:
            return "Error: LLM provider not available."

        pair_err = _spawn_pair_error(
            self._get_config(), self._llm_gateway.active_client, model_override, effort_override
        )
        if pair_err:
            return f"Error: {pair_err}"

        channel = getattr(message, "channel", message)
        author = getattr(message, "author", None)
        user_id = str(getattr(author, "id", "0"))
        user_name = str(author) if author else "agent"

        system_prompt = self._prompt_builder.build_full_prompt(channel=channel, user_id=user_id)
        all_tools = (
            self._tool_catalog.merged_definitions() if self._get_config().tools.enabled else []
        )
        # Depth-aware filter: root spawn uses depth 0; nested spawns compute
        # the expected child depth from the parent so terminal children don't
        # even see spawn_agent in their tool list.
        parent_depth = 0
        parent = None
        if parent_id_arg:
            parent = self._agent_manager._agents.get(parent_id_arg)
            if parent is not None:
                parent_depth = parent.depth + 1
        configured_max_depth = getattr(
            getattr(self._get_config(), "agents", None),
            "max_nesting_depth",
            2,
        )
        # A nested tree keeps the root's snapshot in both enforcement and its
        # visible tool catalogue. Using live config here could hide spawn_agent
        # from a tree whose original limit still permits it.
        effective_max_depth = (
            getattr(parent, "max_depth", configured_max_depth)
            if parent is not None
            else configured_max_depth
        )
        tools = filter_agent_tools(all_tools, depth=parent_depth, max_depth=effective_max_depth)

        def _live_agent_tools() -> list[dict]:
            # Freshness at request assembly (MCP P3): dynamic tools (MCP) can
            # publish/unpublish mid-flight, so every newly assembled request
            # re-pulls the live catalog instead of the spawn-time snapshot.
            # The depth filter is identity-stable for the agent's life.
            if not self._get_config().tools.enabled:
                return []
            return filter_agent_tools(
                self._tool_catalog.merged_definitions(),
                depth=parent_depth,
                max_depth=effective_max_depth,
            )

        # Iteration callback — wraps Codex chat_with_tools, returns dict
        async def _iteration_cb(
            messages: list[dict],
            sys_prompt: str,
            tool_defs: list[dict],
            *,
            generation_state: dict,
        ) -> dict:
            # ONE capture per logical generation: client, model, effort, and
            # budget snapshot are resolved together on the FIRST attempt and
            # reused verbatim by every rescue retry (R2 frozen-generation
            # identity — a live reload between attempts must never split the
            # budget from the request it governs). Live config reaches the
            # NEXT generation, which starts with a fresh state dict.
            plan = generation_state.get("plan")
            if plan is None:
                plan = _capture_agent_generation_plan(
                    self._get_config,
                    lambda config: _gateway_serving_for_config(self._llm_gateway, config),
                    self._get_context_compressor,
                    model_override=model_override,
                    effort_override=effort_override,
                    observer=self._window_observer,
                )
                generation_state["plan"] = plan
            client = plan["client"]
            resp = await self._agent_generate(
                client,
                messages=messages,
                sys_prompt=sys_prompt,
                tool_defs=_live_agent_tools(),
                agent_effort=plan["effort"],
                resolved_model=plan["model"],
                provider=plan["provider"],
            )
            return {
                "text": resp.text,
                "tool_calls": normalize_tool_calls(resp.tool_calls),
                "stop_reason": resp.stop_reason,
                # Phase 5: server acceptance evidence rides the callback dict
                # so a rescued iteration can qualify a window clamp.
                "input_tokens": getattr(resp, "input_tokens", 0) or 0,
                "output_tokens": getattr(resp, "output_tokens", 0) or 0,
                "server_input_tokens": getattr(resp, "server_input_tokens", None),
                "server_output_tokens": getattr(resp, "server_output_tokens", None),
                "estimated_input_tokens": getattr(resp, "estimated_input_tokens", None),
                "cached_tokens": getattr(resp, "cached_tokens", None),
                "cache_write_tokens": getattr(resp, "cache_write_tokens", None),
                "input_token_provenance": getattr(resp, "input_token_provenance", "") or "",
                "output_token_provenance": getattr(resp, "output_token_provenance", "") or "",
                "account_key": getattr(resp, "account_key", None),
                **_provenance_stamp(resp, client),
            }

        msg_proxy = _LoopMessageProxy(channel, user_id, user_name)

        # Mutable container so the callback can learn its own agent_id
        # AFTER agent_manager.spawn() returns and use it as parent_id when
        # this agent itself calls spawn_agent.
        _self_id: dict[str, str | None] = {"id": None}

        async def _tool_exec_cb(tool_name: str, tool_input: dict) -> str | ToolResult:
            if tool_name == "spawn_agent":
                # Nested spawn — forward this agent's id so AgentManager.spawn
                # enforces max_nesting_depth and children linkage.
                if _self_id["id"]:
                    # Invocation ancestry is authoritative. Chat-level callers
                    # may still choose parent_id, but an agent invoking the tool
                    # cannot select a different active tree to evade limits.
                    tool_input = {**tool_input, "parent_id": _self_id["id"]}
            elif tool_name in AGENT_BLOCKED_TOOLS:
                # Other agent-management tools (kill/send_to/wait_for/get_results/
                # list) remain available from within a parent, because they
                # operate on already-spawned agents and aren't the same as
                # spawning new ones.
                pass
            result = await self._tool_loop.dispatch_loop_tool(
                tool_name,
                tool_input,
                msg_proxy,
                user_id,
            )
            if isinstance(result, ToolResult):
                return result
            return str(result) if result is not None else ""

        # Determine iteration cap from config — scheduled spawns get a higher budget
        agents_cfg = getattr(self._get_config(), "agents", None)
        hard_max = getattr(agents_cfg, "hard_max_iterations", 300) if agents_cfg else 300
        if inp.get("_scheduled"):
            iter_cap = min(
                getattr(agents_cfg, "scheduled_max_iterations", 180) if agents_cfg else 180,
                hard_max,
            )
        else:
            iter_cap = min(
                getattr(agents_cfg, "max_iterations", 120) if agents_cfg else 120, hard_max
            )
        warnings = (
            list(getattr(agents_cfg, "final_warning_iterations", [20, 10, 5, 1]))
            if agents_cfg
            else [20, 10, 5, 1]
        )
        # Snapshotted at spawn: a live config change must not move the
        # deadline of an agent already mid-run.
        iteration_timeout = (
            getattr(agents_cfg, "iteration_timeout_seconds", 900) if agents_cfg else 900
        )
        max_lifetime = getattr(agents_cfg, "max_lifetime_seconds", 14400) if agents_cfg else 14400

        message_turn_id = str(getattr(message, "id", "") or "") or None
        agent_id = self._agent_manager.spawn(
            label=label,
            goal=goal,
            channel_id=str(getattr(channel, "id", "0")),
            requester_id=user_id,
            requester_name=user_name,
            iteration_callback=_iteration_cb,
            tool_executor_callback=_tool_exec_cb,
            tools=tools,
            system_prompt=system_prompt,
            parent_id=parent_id_arg,
            max_depth=configured_max_depth,
            # Root snapshot: config read at spawn time; descendants inherit
            # the root's value inside the manager. Fallback stays the
            # manager's constant for omitted/None.
            max_children=getattr(agents_cfg, "max_children_per_agent", None)
            if agents_cfg
            else None,
            tool_timeouts=self._get_config().tools.tool_timeouts,
            trajectory_saver=self._agent_trajectory_saver,
            max_iterations=iter_cap,
            budget_warnings=warnings,
            iteration_timeout=iteration_timeout,
            max_lifetime=max_lifetime,
            model_override=model_override,
            reasoning_effort_override=effort_override,
            turn_id=message_turn_id,
            context_compression_enabled=bool(self._get_context_compressor()),
            max_context_chars=self._get_context_compressor().resolved_max_context_chars
            if self._get_context_compressor()
            else 750000,
            keep_recent_iterations=self._get_context_compressor().keep_recent_iterations
            if self._get_context_compressor()
            else 30,
            generation_plan_provider=lambda: _capture_agent_generation_plan(
                self._get_config,
                lambda config: _gateway_serving_for_config(self._llm_gateway, config),
                self._get_context_compressor,
                model_override=model_override,
                effort_override=effort_override,
                observer=self._window_observer,
                agent_id_cell=_self_id,
            ),
            evidence_recorder=_make_evidence_recorder(self._window_observer),
            density_recorder=_make_density_recorder(self._window_observer, _self_id),
        )

        if agent_id.startswith("Error"):
            return agent_id
        _self_id["id"] = agent_id
        depth_note = f" (depth {parent_depth})" if parent_id_arg else ""
        return f"Agent '{label}' spawned (ID: `{agent_id}`){depth_note}. Working on: {goal[:100]}"

    async def _collect_agent_result(
        self,
        agent_id: str,
        timeout: float | None = None,
    ) -> tuple[str, dict]:
        """Wait for an agent to complete and return (formatted_text, raw_data).

        When ``timeout`` is None it resolves to the agent's SNAPSHOTTED
        max_lifetime + 60s — the lifetime deadline guarantees termination, so
        this wait always resolves (a fresh config read could disagree with
        the deadline the agent was actually spawned with).

        The raw_data dict contains status, error, result, and empty_result
        so callers can make ok/fail decisions based on structured state
        rather than parsing markdown.
        """
        if timeout is None:
            agent = self._agent_manager._agents.get(agent_id)
            if agent is not None:
                timeout = agent.max_lifetime + 60
            else:
                agents_cfg = getattr(self._get_config(), "agents", None)
                timeout = (
                    getattr(agents_cfg, "max_lifetime_seconds", 3600) if agents_cfg else 3600
                ) + 60
        results = await self._agent_manager.wait_for_agents([agent_id], timeout=timeout)
        r = results.get(agent_id, {})
        status = r.get("status", "unknown")
        label = r.get("label", agent_id)
        runtime = r.get("runtime_seconds", 0)
        iterations = r.get("iteration_count", 0)
        tools_used = r.get("tools_used", [])
        result_text = r.get("result", "")
        error_text = r.get("error", "")

        parts = [f"**Agent: {label}** ({status})", f"Runtime: {runtime}s, Iterations: {iterations}"]
        if tools_used:
            parts.append(f"Tools: {', '.join(tools_used[:15])}")
        if result_text:
            if len(result_text) > 1500:
                result_text = result_text[:1500] + "..."
            parts.append(f"Result:\n{result_text}")
        if error_text:
            parts.append(f"Error: {error_text}")

        raw = {
            "status": status,
            "error": error_text,
            "result": r.get("result", ""),
            "empty_result": not r.get("result"),
        }
        return "\n".join(parts), raw

    def _handle_send_to_agent(self, inp: dict) -> str:
        """Send a message to a running agent."""
        agent_id = inp.get("agent_id", "")
        message = inp.get("message", "")
        if not agent_id:
            return "'agent_id' is required."
        if not message:
            return "'message' is required."
        return self._agent_manager.send(agent_id, message)

    def _handle_list_agents(self, message: object) -> str:
        """List all agents, optionally filtered by channel."""
        channel = getattr(message, "channel", message)
        channel_id = str(getattr(channel, "id", "0"))
        agents = self._agent_manager.list(channel_id)
        if not agents:
            return "No agents running."
        lines = []
        for a in agents:
            lines.append(
                f"`{a['id']}` | **{a['label']}** | {a['status']} | "
                f"{a['iteration_count']} iters | {a['runtime_seconds']}s"
                + (f" | {a['activity']}" if a.get("activity") else "")
            )
        return f"**Agents ({len(agents)}):**\n" + "\n".join(lines)

    def _handle_kill_agent(self, inp: dict) -> str:
        """Kill a running agent."""
        agent_id = inp.get("agent_id", "")
        if not agent_id:
            return "'agent_id' is required."
        return self._agent_manager.kill(agent_id)

    def _handle_get_agent_results(self, inp: dict) -> str:
        """Get results of a completed agent."""
        agent_id = inp.get("agent_id", "")
        if not agent_id:
            return "'agent_id' is required."
        results = self._agent_manager.get_results(agent_id)
        if results is None:
            return f"Agent '{agent_id}' not found."
        if results["status"] == "running":
            return (
                f"Agent '{results['label']}' is still running "
                f"({results['iteration_count']} iterations, "
                f"{results['runtime_seconds']}s elapsed)."
            )
        parts = [
            f"**Agent: {results['label']}** ({results['status']})",
            f"Runtime: {results['runtime_seconds']}s, Iterations: {results['iteration_count']}",
        ]
        if results["tools_used"]:
            parts.append(f"Tools: {', '.join(results['tools_used'])}")
        if results["result"]:
            result_text = results["result"]
            if len(result_text) > 1500:
                result_text = result_text[:1500] + "..."
            parts.append(f"Result:\n{result_text}")
        if results["error"]:
            parts.append(f"Error: {results['error']}")
        return "\n".join(parts)

    async def _handle_wait_for_agents(self, inp: dict) -> str | ToolResult:
        """Wait for agents to complete and return collected results."""
        agent_ids = inp.get("agent_ids", [])
        timeout = inp.get("timeout", 300)
        if not agent_ids:
            return "'agent_ids' list is required."
        if not isinstance(agent_ids, list):
            return "'agent_ids' must be a list of agent ID strings."

        results = await self._agent_manager.wait_for_agents(
            agent_ids,
            timeout=float(timeout),
        )

        lines: list[str] = []
        for aid in agent_ids:
            r = results.get(aid, {})
            status = r.get("status", "unknown")
            label = r.get("label", aid)
            result_text = r.get("result", "")
            error_text = r.get("error", "")
            content = result_text or error_text or "(no output)"
            if len(content) > 800:
                content = content[:800] + "..."
            # iterations is the stable progress marker for the wait-class
            # stuck signature (PR #244 round-1): a silently-progressing
            # agent must not render identically to a hung one. Runtime
            # stays excluded — hashing elapsed time would make a hung
            # agent immortal.
            iters = r.get("iteration_count", 0)
            lines.append(f"**{label}** (`{aid}`): {status} [iterations={iters}]\n{content}")

        text = "\n\n".join(lines) if lines else "No results."
        if any(r.get("wait_interrupted") == "parent_message" for r in results.values()):
            return ToolResult(
                "Wait interrupted by parent message; children continue.\n\n" + text,
                audit_metadata={"wait_interrupted": "parent_message"},
            )
        return text

    # --- Loop-Agent bridge tool handlers ---

    async def _handle_spawn_loop_agents(self, message: object, inp: dict) -> str:
        """Spawn agents from within a loop iteration via the loop-agent bridge."""
        loop_id = inp.get("loop_id", "")
        tasks = inp.get("tasks", [])
        if not loop_id:
            return "A 'loop_id' is required."
        if not tasks:
            return "A 'tasks' list is required."

        # Validate the loop exists
        loop_info = self._loop_manager._loops.get(loop_id)
        if not loop_info:
            return f"Error: Loop '{loop_id}' not found."
        if loop_info.status != "running":
            return f"Error: Loop '{loop_id}' is not running (status: {loop_info.status})."

        if not self._llm_gateway.active_client:
            return "Error: LLM provider not available."

        channel = getattr(message, "channel", message)
        channel_id = str(getattr(channel, "id", "0"))

        # Build system prompt and tools for the agents (no agent tools — prevents nesting)
        system_prompt = self._prompt_builder.build_full_prompt(
            channel=channel,
            user_id=loop_info.requester_id,
        )
        all_tools = (
            self._tool_catalog.merged_definitions() if self._get_config().tools.enabled else []
        )
        tools = filter_agent_tools(all_tools)

        def _live_loop_agent_tools() -> list[dict]:
            # Freshness at request assembly (MCP P3) — see _live_agent_tools.
            if not self._get_config().tools.enabled:
                return []
            return filter_agent_tools(self._tool_catalog.merged_definitions())

        # Validate + normalize each task's optional per-agent model/effort
        # override — a single bad or non-eligible override rejects the WHOLE
        # batch (nothing spawns) rather than silently running the wrong policy.
        from ...tools.agent_tool_policy import agent_axis_modes

        _model_mode, _effort_mode = agent_axis_modes(self._get_config())
        validated_tasks = []
        for t in tasks:
            if not isinstance(t, dict):
                return "Error: each task must be an object with 'label' and 'goal'."
            mo, eo, err = _parse_spawn_overrides(
                t, model_mode=_model_mode, effort_mode=_effort_mode
            )
            if err:
                return f"Error: task '{t.get('label', '?')}': {err}"
            pair_err = _spawn_pair_error(
                self._get_config(), self._llm_gateway.active_client, mo, eo
            )
            if pair_err:
                return f"Error: task '{t.get('label', '?')}': {pair_err}"
            validated_tasks.append(
                {
                    "label": t.get("label", ""),
                    "goal": t.get("goal", ""),
                    "model_override": mo,
                    "reasoning_effort_override": eo,
                }
            )
        tasks = validated_tasks

        # Per-task iteration callback FACTORY (same pattern as
        # _handle_spawn_agent): each agent gets a callback closed over ITS OWN
        # model/effort override, so a fleet can mix models. Overrides are fixed
        # for the agent's life; None fields track live config at call time.
        def _make_iteration_cb(model_override, effort_override):
            async def _iteration_cb(messages, sys, tool_defs, *, generation_state: dict):
                # Same frozen-generation capture as the direct spawn path.
                plan = generation_state.get("plan")
                if plan is None:
                    plan = _capture_agent_generation_plan(
                        self._get_config,
                        lambda config: _gateway_serving_for_config(self._llm_gateway, config),
                        self._get_context_compressor,
                        model_override=model_override,
                        effort_override=effort_override,
                        observer=self._window_observer,
                    )
                    generation_state["plan"] = plan
                client = plan["client"]
                resp = await self._agent_generate(
                    client,
                    messages=messages,
                    sys_prompt=sys,
                    tool_defs=_live_loop_agent_tools(),
                    agent_effort=plan["effort"],
                    resolved_model=plan["model"],
                    provider=plan["provider"],
                )
                return {
                    "text": resp.text or "",
                    "tool_calls": normalize_tool_calls(resp.tool_calls),
                    "stop_reason": resp.stop_reason or "end_turn",
                    "input_tokens": getattr(resp, "input_tokens", 0) or 0,
                    "output_tokens": getattr(resp, "output_tokens", 0) or 0,
                    "server_input_tokens": getattr(resp, "server_input_tokens", None),
                    "server_output_tokens": getattr(resp, "server_output_tokens", None),
                    "estimated_input_tokens": getattr(resp, "estimated_input_tokens", None),
                    "cached_tokens": getattr(resp, "cached_tokens", None),
                    "cache_write_tokens": getattr(resp, "cache_write_tokens", None),
                    "input_token_provenance": getattr(resp, "input_token_provenance", "") or "",
                    "output_token_provenance": getattr(resp, "output_token_provenance", "") or "",
                    "account_key": getattr(resp, "account_key", None),
                    **_provenance_stamp(resp, client),
                }

            return _iteration_cb

        async def _tool_cb(tool_name, tool_input):
            return await self._tool_loop.dispatch_loop_tool(
                tool_name,
                tool_input,
                _LoopMessageProxy(channel, loop_info.requester_id, loop_info.requester_name),
                loop_info.requester_id,
            )

        # The compression config object (None when disabled) — read live via
        # the provider; config.context_compression never existed, and the old
        # attribute access raised AttributeError on EVERY spawn_loop_agents
        # call since the tool shipped (soak round-2 finding, 2026-07-05). Same
        # pattern as _handle_spawn_agent above.
        cc = self._get_context_compressor()
        agent_ids = self._loop_agent_bridge.spawn_agents_for_loop(
            loop_id=loop_id,
            iteration=loop_info.iteration_count,
            loop_goal=loop_info.goal,
            tasks=tasks,
            channel_id=channel_id,
            requester_id=loop_info.requester_id,
            requester_name=loop_info.requester_name,
            turn_id=str(getattr(message, "id", "") or "") or None,
            iteration_callback=_make_iteration_cb(None, None),
            iteration_callback_factory=_make_iteration_cb,
            tool_executor_callback=_tool_cb,
            tools=tools,
            system_prompt=system_prompt,
            tool_timeouts=self._get_config().tools.tool_timeouts,
            # Honor the configured agent iteration cap; without this the
            # bridge passed None and agents fell back to the module default,
            # ignoring agents.max_iterations.
            max_iterations=self._get_config().agents.max_iterations,
            iteration_timeout=self._get_config().agents.iteration_timeout_seconds,
            max_lifetime=self._get_config().agents.max_lifetime_seconds,
            # Close the loop-path gap: depth and child limits now reach
            # loop-spawned agents too, instead of silently using built-ins.
            max_depth=getattr(self._get_config().agents, "max_nesting_depth", None),
            max_children=getattr(self._get_config().agents, "max_children_per_agent", None),
            context_compression_enabled=bool(cc),
            max_context_chars=cc.resolved_max_context_chars if cc else 750000,
            keep_recent_iterations=cc.keep_recent_iterations if cc else 30,
            generation_plan_provider_factory=lambda mo, eo, cell: (
                lambda: _capture_agent_generation_plan(
                    self._get_config,
                    lambda config: _gateway_serving_for_config(self._llm_gateway, config),
                    self._get_context_compressor,
                    model_override=mo,
                    effort_override=eo,
                    observer=self._window_observer,
                    agent_id_cell=cell,
                )
            ),
            evidence_recorder=_make_evidence_recorder(self._window_observer),
            density_recorder_factory=lambda cell: _make_density_recorder(
                self._window_observer, cell
            ),
        )

        # Format response
        errors = [a for a in agent_ids if a.startswith("Error")]
        successes = [a for a in agent_ids if not a.startswith("Error")]

        parts = []
        if successes:
            parts.append(f"Spawned {len(successes)} agent(s): {', '.join(successes)}")
        if errors:
            parts.append(f"Errors: {'; '.join(errors)}")
        return "\n".join(parts) or "No agents spawned."

    async def _handle_collect_loop_agents(self, inp: dict) -> str:
        """Collect results from agents spawned by a loop."""
        loop_id = inp.get("loop_id", "")
        agent_ids = inp.get("agent_ids", None)
        timeout = inp.get("timeout", 300)
        if not loop_id:
            return "A 'loop_id' is required."

        # Validate the loop exists
        if loop_id not in self._loop_manager._loops:
            return f"Error: Loop '{loop_id}' not found."

        results = await self._loop_agent_bridge.wait_and_collect(
            loop_id=loop_id,
            agent_ids=agent_ids if isinstance(agent_ids, list) else None,
            timeout=float(timeout),
        )

        if not results:
            return "No agents to collect for this loop."

        return self._loop_agent_bridge.format_agent_results_for_context(results)
