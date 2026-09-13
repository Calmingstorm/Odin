"""Recovery lineage is optional, Hyprland-only and never an action binding."""

from src.tools.defs.computer import computer_definitions


def test_recovery_lineage_fields_are_optional_start_metadata():
    tools = {tool["name"]: tool for tool in computer_definitions()}
    session = tools["computer_session"]
    schema = session["input_schema"]
    assert schema["required"] == ["operation"]
    assert "reconcile" in schema["properties"]["operation"]["enum"]
    assert "bounded release-only recovery" in session["description"]
    assert "Status remains read-only" in session["description"]
    assert schema["properties"]["recovery_generation"]["minimum"] == 1
    assert schema["properties"]["recovery_session_id"]["maxLength"] == 128
    assert "Hyprland start only" in schema["properties"]["recovery_session_id"]["description"]
    assert "do not clear unknown release" in session["description"]
    assert "Never auto-replay" in session["description"]
    for name in ("computer_act", "computer_observe"):
        assert "recovery_session_id" not in tools[name]["input_schema"]["properties"]
        assert "recovery_generation" not in tools[name]["input_schema"]["properties"]


def test_recovery_schema_is_deep_copied():
    first = computer_definitions()[0]["input_schema"]["properties"]
    first["recovery_session_id"]["description"] = "not authority"
    assert "Hyprland start only" in computer_definitions()[0]["input_schema"]["properties"][
        "recovery_session_id"]["description"]
