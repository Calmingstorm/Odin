import json
from datetime import UTC, datetime

from src.learning.reflector import ConversationReflector
from src.observability.aggregates import context_aggregates
from src.observability.context_trace import ContextTraceCollector


def test_real_injected_learned_block_conserves_prompt_tokens(tmp_path):
    path = tmp_path / "learned.json"
    path.write_text(json.dumps({"version": 2, "entries": [
        {"key": "lesson", "category": "operational", "content": "durable lesson " * 20},
    ]}))
    reflector = ConversationReflector(str(path))
    trace = ContextTraceCollector()
    trace.section("base", tokens=100)
    learned = reflector.get_prompt_section(trace=trace)
    trace.history(budget=1000, used=80, candidates=1, kept_recent=1, kept_relevant=0,
                  dropped_relevance=0, dropped_budget=0)
    finalized = trace.finalize()
    assert finalized["learned"]["tokens"] == len(learned) // 4
    expected_system = 100 + len(learned) // 4
    assert finalized["summary"]["system_tokens"] == expected_system
    # Same block represented as a section must not count twice.
    other = ContextTraceCollector()
    other.section("base", tokens=100)
    other.section("learned", tokens=len(learned) // 4)
    reflector.get_prompt_section(trace=other)
    assert other.finalize()["summary"]["system_tokens"] == expected_system
    now = datetime.now(UTC)
    legacy = json.loads(json.dumps(finalized))
    legacy["summary"].pop("system_includes_learned")
    legacy["summary"]["system_tokens"] = 100
    trajectory = tmp_path / f"{now.date().isoformat()}.jsonl"
    trajectory.write_text("".join(
        json.dumps({"timestamp": now.isoformat(), "context_trace": data}) + "\n"
        for data in (finalized, legacy)
    ))
    result = context_aggregates(str(tmp_path))
    assert result["prompt_tokens_avg"] == expected_system + 80
    assert result["prompt_tokens_p95"] == expected_system + 80
    assert result["by_section"]["learned"]["avg_tokens"] == len(learned) // 4
