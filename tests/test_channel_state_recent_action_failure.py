from src.discord.channel_state import ChannelStateRegistry


def test_track_action_marks_authoritative_failure_error():
    state = ChannelStateRegistry()
    state.track_action("run_command", {}, "blocked", 1, channel_id="123", failed=True)
    assert "→ ERROR" in state.recent_entries("123")[0]


def test_track_action_success_stays_ok():
    state = ChannelStateRegistry()
    state.track_action("run_command", {}, "completed", 1, channel_id="123")
    assert "→ OK" in state.recent_entries("123")[0]
