"""Repeated model-local IDs cannot replace another invocation's stream (#530)."""
import pytest

from src.tools.output_streamer import (
    ToolOutputStreamer,
    current_call_id,
    current_stream_attribution,
)


@pytest.mark.parametrize("same_channel", [False, True])
async def test_reused_call_ids_keep_registry_and_wire_ownership(same_channel):
    streamer = ToolOutputStreamer(chunk_interval=0.1)
    chunks = []

    async def listener(chunk):
        chunks.append(chunk.to_dict())

    streamer.add_listener(listener)
    callbacks = []
    for index in range(2):
        call = current_call_id.set("model-local-id")
        attribution = current_stream_attribution.set({
            "turn_id": f"turn-{index}", "agent_id": f"agent-{index}", "iteration": index,
        })
        try:
            callbacks.append(streamer.create_callback(
                "run_command", "same" if same_channel else str(index)
            ))
        finally:
            current_call_id.reset(call)
            current_stream_attribution.reset(attribution)
    first, second = callbacks
    assert first[0] != second[0]
    assert len(streamer._active_streams) == 2
    await first[1]("first buffered tail")
    await second[1]("second buffered tail")
    assert await streamer.abandon_streams([first[0]]) == 1
    assert len(streamer._active_streams) == 1
    await second[2]()
    assert not streamer._active_streams
    for index, text in enumerate(["first buffered tail", "second buffered tail"]):
        owned = [chunk for chunk in chunks if chunk["turn_id"] == f"turn-{index}"]
        assert "".join(chunk["chunk"] for chunk in owned) == text
        assert sum(chunk["finished"] for chunk in owned) == 1
        assert all(chunk["call_id"] == "model-local-id" for chunk in owned)
        assert all(
            chunk["agent_id"] == f"agent-{index}" and chunk["iteration"] == index for chunk in owned
        )
