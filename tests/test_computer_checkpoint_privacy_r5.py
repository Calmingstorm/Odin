"""Private desktop images never enter unexpiring generic turn-state blobs."""

import copy
import json
from unittest.mock import Mock

from src.computer.vision import observation_image
from src.turn_state.codec import _externalize_blocks, _inline_blocks
from tests.test_computer_native_vision_r5 import frame


def test_checkpoint_retirement_keeps_call_pair_and_legacy_image_unchanged():
    native = observation_image(frame().png, frame().metadata)["__image_block__"]
    legacy = {"type": "image", "source": {
        "type": "base64", "media_type": "image/png", "data": "bGVnYWN5"}}
    messages = [
        {"role": "assistant", "content": [{"type": "tool_use", "id": "call",
         "name": "computer_observe", "input": {}}]},
        {"role": "user", "content": [{"type": "tool_result", "tool_use_id": "call",
         "content": "pixel-free receipt"}]},
        {"role": "user", "content": [native, legacy]},
    ]
    before = copy.deepcopy(messages)
    store = Mock(return_value="legacy-ref")
    checkpoint = _externalize_blocks(messages, store)
    store.assert_called_once_with(b"bGVnYWN5")
    assert native["source"]["data"] not in json.dumps(checkpoint)
    assert checkpoint[:2] == messages[:2]
    assert checkpoint[2]["content"][0]["type"] == "text"
    assert messages == before
    load = Mock(return_value=b"bGVnYWN5")
    restored = _inline_blocks(checkpoint, load)
    load.assert_called_once_with("legacy-ref")
    assert restored[2]["content"][1] == legacy
    assert restored[:2] == messages[:2]


def test_old_desktop_blob_reference_never_reads_or_restores_screenshot():
    native = observation_image(frame().png, frame().metadata)["__image_block__"]
    native["source"] = {"type": "blob_ref", "ref": "obsolete-private-blob",
                        "media_type": "image/png"}
    load = Mock(side_effect=AssertionError("private image must not be loaded"))
    restored = _inline_blocks([native], load)
    load.assert_not_called()
    assert restored[0]["type"] == "text"
    assert "obsolete-private-blob" not in json.dumps(restored)


def test_malformed_tag_still_cannot_escape_as_generic_image():
    image = {"type": "image", "__computer_frame__": None,
             "source": {"type": "base64", "data": "private-pixels"}}
    store = Mock(side_effect=AssertionError("must not externalize"))
    assert _externalize_blocks(image, store)["type"] == "text"
    store.assert_not_called()
