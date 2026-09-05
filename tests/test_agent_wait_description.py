from src.tools import get_tool_definitions


def test_wait_description_advertises_ceiling_and_complete_output_retrieval():
    tool = next(t for t in get_tool_definitions() if t["name"] == "wait_for_agents")
    assert "up to 800 UTF-8 bytes" in tool["description"]
    assert "possibly less under the aggregate budget" in tool["description"]
    assert "get_agent_results" in tool["description"]
    assert "until truncated=false" in tool["description"]
