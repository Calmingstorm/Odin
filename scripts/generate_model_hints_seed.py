#!/usr/bin/env python3
# ruff: noqa: E501,E402
import json

rows = {m["id"]: m for m in json.load(open("or_models.json"))}
AS_OF = "2026-09-19"


def facts(or_id):
    m = rows.get(or_id)
    if not m:
        return {}
    tp = m.get("top_provider") or {}
    sp = m.get("supported_parameters") or []
    return {
        "context_tokens": m.get("context_length"),
        "max_output_tokens": tp.get("max_completion_tokens"),
        "tools": "tools" in sp,
        "parallel_tool_calls": "parallel_tool_calls" in sp,
    }


# hint = "when to use this", written in the voice of the existing Codex tiering.
# evidence = why, so a stale claim is auditable rather than anonymous.
E = [
    # --- DeepSeek (direct API ids VERIFIED by probe 2026-09-19) ---
    (
        "deepseek",
        "deepseek-flash",
        "deepseek/deepseek-v4.1-flash",
        "cheapest near-frontier model; best default for bulk and mechanical agent work, and for wide fan-out where many agents run at once",
        "LLM Stats 51.8 at $0.24/M — lowest price in the near-frontier tier. Context 1,048,576 and max_tokens range [1,393216] measured directly against api.deepseek.com.",
        {
            "dialect": "thinking",
            "values": ["adaptive", "enabled", "disabled"],
            "direct_api_verified": True,
            "note": "reasoning_effort is SILENTLY IGNORED on the direct API (measured); OpenRouter declares support because it normalizes reasoning itself. thinking:disabled cut output from ~270 to 3 tokens but got test problems wrong.",
        },
    ),
    (
        "deepseek",
        "deepseek-v4-pro",
        "deepseek/deepseek-v4-pro",
        "DeepSeek's strongest tier; use for hard multi-step or ambiguous work when flash is not enough but Codex is not warranted",
        "LLM Stats 52.0 at $0.46/M, 57 tok/s. SWE-bench Verified 80.6% for the V4-Pro-Max variant — top open-weights score. Same 1,048,576 context, measured.",
        {
            "dialect": "thinking",
            "values": ["adaptive", "enabled", "disabled"],
            "direct_api_verified": True,
        },
    ),
    # --- Z.ai GLM ---
    (
        "zai",
        "glm-5.3",
        "z-ai/glm-5.3",
        "near-frontier at low cost with the largest context here; good for long-context analysis and repo-wide reading, and it supports parallel tool calls",
        "LLM Stats 52.7 at $1.33/M. Context 1,310,720. Declares parallel_tool_calls.",
        {
            "dialect": "thinking",
            "values": ["enabled", "disabled"],
            "direct_api_verified": False,
            "note": "GLM supports Preserved Thinking (clear_thinking:false) — reasoning_content from prior turns is fed BACK. Transcript policy must be 'preserve', unlike DeepSeek.",
        },
    ),
    (
        "zai",
        "glm-5.2",
        "z-ai/glm-5.2",
        "previous GLM generation; solid balanced choice when 5.3 is unavailable",
        "SWE-bench Pro 62.1%. Declares supported_efforts ['xhigh','high'] and parallel_tool_calls.",
        {"dialect": "thinking", "values": ["enabled", "disabled"], "direct_api_verified": False},
    ),
    # --- Moonshot ---
    (
        "moonshot",
        "kimi-k3",
        "moonshotai/kimi-k3",
        "strongest open-weights reasoning available; reach for it on the hardest analysis, at the highest cost and slowest speed of the open tier",
        "Leads open-weights on LLM Stats at 53.0, GPQA 93.5%, but $3.39/M and 44 tok/s — the slowest and priciest here.",
        {
            "dialect": "reasoning_effort",
            "values": ["low", "high", "max"],
            "direct_api_verified": False,
        },
    ),
    (
        "moonshot",
        "kimi-k2.6",
        "moonshotai/kimi-k2.6",
        "strong coding model with parallel tool calls; good for mechanical multi-file edits",
        "SWE-bench Verified 80.2%. Context 262,144, declares parallel_tool_calls.",
        {"dialect": "none", "values": [], "direct_api_verified": False},
    ),
    # --- Qwen ---
    (
        "qwen",
        "qwen3.8-max",
        "qwen/qwen3.8-max-0902",
        "fastest of the top tier; use when throughput matters more than the last few points of capability",
        "LLM Stats 52.0 at 76 tok/s — fastest in the leading group — $1.81/M. Context 1,000,000.",
        {
            "dialect": "qwen_legacy",
            "values": ["fast", "auto", "thinking"],
            "direct_api_verified": False,
            "note": "DashScope: reasoning.effort takes precedence over the legacy enable_thinking flag; the OpenAI-compat proxy maps reasoning_effort none/minimal->fast, low/medium->auto, high/xhigh/max->thinking.",
        },
    ),
    (
        "qwen",
        "qwen3.8-flash",
        "qwen/qwen3.8-flash",
        "cheap high-throughput worker for simple lookups and mechanical work",
        "Context 1,000,000. No reasoning_effort declared.",
        {
            "dialect": "qwen_legacy",
            "values": ["fast", "auto", "thinking"],
            "direct_api_verified": False,
        },
    ),
    # --- xAI ---
    (
        "xai",
        "grok-4.6",
        "x-ai/grok-4.6",
        "large context with a full effort ladder; good general-purpose alternative when you want effort control on a non-Codex model",
        "Context 500,000, declares supported_efforts ['xhigh','high','medium','low'].",
        {
            "dialect": "reasoning_effort",
            "values": ["low", "medium", "high", "xhigh"],
            "direct_api_verified": False,
        },
    ),
    (
        "xai",
        "grok-4.3",
        "x-ai/grok-4.3",
        "million-token context with a full effort ladder including 'none'; use for very long inputs",
        "Context 1,000,000, supported_efforts ['high','medium','low','none'].",
        {
            "dialect": "reasoning_effort",
            "values": ["none", "low", "medium", "high"],
            "direct_api_verified": False,
        },
    ),
    # --- Mistral ---
    (
        "mistral",
        "mistral-medium-3-5",
        "mistralai/mistral-medium-3-5",
        "balanced European-hosted option with strict JSON-schema support; good when structured output matters",
        "Context 262,144, declares reasoning_effort. Mistral offers strict json_schema modes that DeepSeek does not.",
        {
            "dialect": "reasoning_effort",
            "values": ["low", "medium", "high"],
            "direct_api_verified": False,
        },
    ),
    (
        "mistral",
        "devstral-2512",
        "mistralai/devstral-2512",
        "code-specialised; use for mechanical code edits rather than open-ended reasoning",
        "Context 262,144. Coding-tuned line.",
        {"dialect": "none", "values": [], "direct_api_verified": False},
    ),
    # --- Meta / local-friendly ---
    (
        "ollama",
        "llama-3.3-70b",
        "meta-llama/llama-3.3-70b-instruct",
        "solid local workhorse with native tool-calling templates; the default choice for self-hosted agent work",
        "Context 131,072 served; real local window is set at server start (-c / --max-model-len / --context-length), so confirm it per install.",
        {"dialect": "none", "values": [], "direct_api_verified": False},
    ),
    (
        "ollama",
        "llama-4-scout",
        "meta-llama/llama-4-scout",
        "very large context for a local model; use for long-document reading when you can afford the memory",
        "Context 1,310,720 served upstream. Local window depends entirely on how the runtime was started.",
        {"dialect": "none", "values": [], "direct_api_verified": False},
    ),
    (
        "ollama",
        "qwen3.6-35b-a3b",
        "qwen/qwen3.6-35b-a3b",
        "efficient MoE local model; good throughput per GB of VRAM for mechanical work",
        "Context 262,144 upstream. MoE architecture keeps active parameters low.",
        {
            "dialect": "qwen_legacy",
            "values": ["fast", "auto", "thinking"],
            "direct_api_verified": False,
        },
    ),
    (
        "ollama",
        "nemotron-3-nano-30b-a3b",
        "nvidia/nemotron-3-nano-30b-a3b",
        "small tool-calling local model for simple, high-volume steps",
        "Context 262,144 upstream, declares tools.",
        {"dialect": "none", "values": [], "direct_api_verified": False},
    ),
]

out = {
    "as_of": AS_OF,
    "note": (
        "Seed hints for agent model selection. 'hint' answers 'what is this model for'. "
        "Structural facts are sourced, not typed. A capability is scoped to the endpoint it "
        "was established on: direct_api_verified=true means measured against the vendor's own "
        "API; false means declared by an aggregator or vendor docs and NOT yet confirmed "
        "on the direct endpoint. Operator text always wins over anything here."
    ),
    "models": {},
}
for preset, served_id, or_id, hint, evidence, reasoning in E:
    out["models"][f"{preset}/{served_id}"] = {
        "hint": hint,
        "evidence": evidence,
        "reasoning": reasoning,
        "as_of": AS_OF,
        "structural_source": f"openrouter:{or_id}" if or_id in rows else "manual",
        **facts(or_id),
    }

# Codex family — the EXISTING prose, verbatim, both surfaces (they differ today).
out["models"].update(
    {
        "codex/gpt-6-astra": {
            "clause_hint": "GPT-6 generation: the strongest reasoning tier, for the hardest multi-step work; rejects effort 'none'",
            "property_hint": "GPT-6 generation, the strongest reasoning tier, for the hardest multi-step work (rejects effort 'none')",
            "as_of": AS_OF,
            "structural_source": "shipped",
            "note": "verbatim from defs/agents.py — byte-identical parity required",
        },
        "codex/gpt-6-sol": {
            "clause_hint": "complex coding and agentic workflows",
            "property_hint": "complex coding and agentic workflows",
            "as_of": "2026-09-22",
            "structural_source": "shipped",
        },
        "codex/gpt-6-luna": {
            "clause_hint": "focused, high-volume tasks with a clear goal",
            "property_hint": "focused, high-volume tasks with a clear goal",
            "as_of": "2026-09-22",
            "structural_source": "shipped",
        },
        "codex/gpt-5.6-sol": {
            "clause_hint": "deepest 5.6 reasoning, for hard/ambiguous work",
            "property_hint": "deepest 5.6 reasoning, best for hard multi-step or ambiguous work",
            "as_of": AS_OF,
            "structural_source": "shipped",
        },
        "codex/gpt-5.6-terra": {
            "clause_hint": "balanced default",
            "property_hint": "balanced, a solid default for most tasks",
            "as_of": AS_OF,
            "structural_source": "shipped",
        },
        "codex/gpt-5.6-luna": {
            "clause_hint": "fastest, for simple/mechanical work",
            "property_hint": "fastest/cheapest, good for simple lookups and mechanical work",
            "as_of": AS_OF,
            "structural_source": "shipped",
        },
    }
)
json.dump(out, open("model_hints_seed.json", "w"), indent=2)
print(f"{len(out['models'])} entries written")
for k, v in list(out["models"].items()):
    ctx = v.get("context_tokens")
    print(f"  {k:32} ctx={str(ctx):>9} {'hint' if 'hint' in v else 'clause+property'}")

# --- Derived tier: honest characterizations computed from catalogue facts only.
# No benchmark claims, no invented ranking. Price/context/tool support are data.
PRESET_BY_VENDOR = {
    "deepseek": "deepseek",
    "z-ai": "zai",
    "moonshotai": "moonshot",
    "qwen": "qwen",
    "mistralai": "mistral",
    "x-ai": "xai",
    "meta-llama": "ollama",
    "nvidia": "ollama",
    "google": "gemini",
    "microsoft": "ollama",
}


def price_in(m):
    try:
        return float((m.get("pricing") or {}).get("prompt") or 0) * 1_000_000
    except (TypeError, ValueError):
        return None


derived = 0
for or_id, m in rows.items():
    vendor, _, slug = or_id.partition("/")
    preset = PRESET_BY_VENDOR.get(vendor)
    if not preset or ":" in slug:  # skip :free/:batch variants
        continue
    sp = m.get("supported_parameters") or []
    if "tools" not in sp:  # agents need tool calling
        continue
    ctx = m.get("context_length") or 0
    if ctx < 63_000:  # below our agent-eligibility gate
        continue
    key = f"{preset}/{slug}"
    if key in out["models"]:  # never overwrite an authored hint
        continue
    p = price_in(m)
    band = (
        "very cheap"
        if p is not None and p < 0.30
        else "cheap"
        if p is not None and p < 1.0
        else "mid-priced"
        if p is not None and p < 3.0
        else "premium"
        if p is not None
        else "unpriced"
    )
    size = (
        "very large context"
        if ctx >= 900_000
        else "large context"
        if ctx >= 250_000
        else "standard context"
    )
    par = ", supports parallel tool calls" if "parallel_tool_calls" in sp else ""
    eff = (m.get("reasoning") or {}).get("supported_efforts")
    out["models"][key] = {
        "hint_derived": f"{band}, {size} ({ctx:,} tokens), tool-calling{par}.",
        "hint": None,
        "evidence": "Derived from catalogue facts only — price band, context and declared "
        "capabilities. No benchmark claim. Replace with an authored hint when known.",
        "reasoning": {"dialect": None, "values": eff or [], "direct_api_verified": False},
        "as_of": AS_OF,
        "structural_source": f"openrouter:{or_id}",
        **facts(or_id),
    }
    derived += 1

json.dump(out, open("model_hints_seed.json", "w"), indent=2)
authored = sum(1 for v in out["models"].values() if v.get("hint") or v.get("clause_hint"))
print(
    f"\nTOTAL {len(out['models'])} entries: {authored} authored/shipped, {derived} derived-from-data"
)
import collections

c = collections.Counter(k.split("/")[0] for k in out["models"])
print("  by preset:", dict(c))
