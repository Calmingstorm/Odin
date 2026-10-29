from src.tools import get_tool_definitions


def test_wait_description_advertises_ceiling_and_complete_output_retrieval():
    tool = next(t for t in get_tool_definitions() if t["name"] == "wait_for_agents")
    assert "up to 8,000 UTF-8 bytes per agent" in tool["description"]
    assert "as much of the agent's result as the aggregate budget" in tool["description"]
    assert "return_when='any'" in tool["description"]
    assert "get_agent_results" in tool["description"]
    assert "until truncated=false" in tool["description"]
