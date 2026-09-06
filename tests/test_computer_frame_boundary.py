"""Neutral frame delivery binding; tiny generated rasters, no desktop access."""

import copy

import pytest

from src.computer.integration import ComputerIntegration
from src.computer.vision import FrameMetadata, VisionError
from tests.test_computer_vision import png


@pytest.mark.parametrize("source_size,scale", [
    ((1920, 1080), (1, 480)), ((2560, 1440), (1, 640)),
    ((3840, 2160), (1, 960)), ((7920, 2520), (1, 1980)),
])
def test_neutral_frame_adapter_does_not_mislabel_downsampled_overview(source_size, scale):
    width, height = source_size
    dw = (2 * width * scale[0] + scale[1]) // (2 * scale[1])
    dh = (2 * height * scale[0] + scale[1]) // (2 * scale[1])
    metadata = FrameMetadata(
        observation_id="observation", generation=1, captured_monotonic_ns=10,
        width=dw, height=dh, session_id="session", source_id="source", source_revision=1,
        consent_generation=1, source_width=width, source_height=height, resize_scale=scale,
    )
    result = {
        "observation_id": "observation", "session_id": "session", "generation": 1,
        "captured_monotonic_ns": 10, "consent_generation": 1, "width": dw, "height": dh,
        "frame_metadata": metadata.public(),
        "delivered_to_source": metadata.delivered_to_source.public(),
        "source": {"source_id": "source", "source_revision": 1, "consent_generation": 1,
                   "pixel_width": width, "pixel_height": height},
        "image_bytes": png(dw, dh),
    }
    image = ComputerIntegration.output_image(result)
    assert image["__computer_frame__"]["kind"] == "full"
    assert image["__computer_frame__"]["crop"] is None
    tampered = copy.deepcopy(result)
    tampered["source"]["source_revision"] += 1
    with pytest.raises(VisionError, match="binding"):
        ComputerIntegration.output_image(tampered)
