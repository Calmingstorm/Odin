#!/usr/bin/env python3
"""Opt-in real native-vision smoke with generated pixels and read-only credentials.

Never captures a screen. Does not refresh, write, print or copy credentials. The
ordinary development client is used with a bounded deadline and a single attempt.
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import hashlib
import io
import json
import logging
import random
import sys
import time
from pathlib import Path

import aiohttp
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from src.computer.capabilities import native_transport_evidence  # noqa: E402
from src.computer.vision import FrameMetadata, observation_image  # noqa: E402
from src.llm.codex_auth import CodexAuth  # noqa: E402
from src.llm.openai_codex import CodexChatClient  # noqa: E402


class ReadOnlyAuth(CodexAuth):
    async def get_access_token(self):
        credentials = self._load()
        if time.time() >= credentials.get("expires_at", 0) - 180:
            raise RuntimeError("Read-only credential unavailable or near expiry")
        return credentials["access_token"]

    async def force_refresh(self, stale_token=None):
        return False

    def _save(self, credentials):
        raise RuntimeError("Credential writes forbidden in smoke")


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--credentials", required=True)
    parser.add_argument("--model", required=True)
    args = parser.parse_args()
    logging.disable(logging.CRITICAL)
    palette = {
        "red": (255, 0, 0),
        "green": (0, 160, 0),
        "blue": (0, 0, 255),
        "yellow": (255, 255, 0),
        "magenta": (255, 0, 255),
        "cyan": (0, 255, 255),
        "black": (0, 0, 0),
        "white": (255, 255, 255),
    }
    selected = random.SystemRandom().sample(list(palette), 6)
    image = Image.new("RGB", (480, 320))
    for index, name in enumerate(selected):
        x, y = (index % 3) * 160, (index // 3) * 160
        image.paste(palette[name], (x, y, x + 160, y + 160))
    output = io.BytesIO()
    image.save(output, format="PNG")
    png = output.getvalue()
    metadata = FrameMetadata(
        observation_id="synthetic-live-smoke",
        session_id="synthetic-live-smoke",
        generation=1,
        captured_monotonic_ns=time.monotonic_ns(),
        width=480,
        height=320,
        source_id="synthetic",
        source_revision=1,
        consent_generation=1,
        source_width=480,
        source_height=320,
    )
    native = observation_image(png, metadata)
    encoded = native["__image_block__"]["source"]["data"]
    wire = []
    trace = aiohttp.TraceConfig()

    async def sent(_session, _context, params):
        # The trace sees the actual JSON-serialized request chunk before sending;
        # only digest and contract facts are retained, never body or headers.
        body = json.loads(params.chunk)
        images = [
            block
            for item in body["input"]
            for block in item.get("content", [])
            if block.get("type") == "input_image"
        ]
        valid = (
            len(images) == 1 and images[0].get("image_url") == "data:image/png;base64," + encoded
        )
        if not valid:
            raise RuntimeError("Native pixels absent from final serialized request")
        decoded = base64.b64decode(images[0]["image_url"].split(",", 1)[1], validate=True)
        images[0]["image_url"] = "native-image-redacted"
        if encoded in json.dumps(body):
            raise RuntimeError("Pixels duplicated as request text")
        wire.append(
            {
                "model": body["model"],
                "native_images": 1,
                "png_sha256": hashlib.sha256(decoded).hexdigest(),
                "serialized_bytes": len(params.chunk),
                "store": body["store"],
            }
        )

    trace.on_request_chunk_sent.append(sent)
    client = CodexChatClient(
        ReadOnlyAuth(args.credentials),
        model=args.model,
        reasoning_effort="low",
        max_retries=0,
        request_timeout=90,
        stream_stall_timeout=60,
    )
    from types import SimpleNamespace

    native_transport_evidence(SimpleNamespace(provider="codex", client=client, model=args.model))
    async with aiohttp.ClientSession(
        trace_configs=[trace], auto_decompress=False, headers={"Accept-Encoding": "identity"}
    ) as session:
        client._session = session
        started = time.monotonic()
        try:
            response = await asyncio.wait_for(
                client.chat_with_tools(
                    [
                        {
                            "role": "user",
                            "content": [
                                {
                                    "type": "text",
                                    "text": "This generated test image has six colored tiles, "
                                    "three columns and two rows. Return only a JSON array "
                                    "naming the six colors in row-major order, left to right, "
                                    "top row first. Names: red, green, blue, yellow, magenta, "
                                    "cyan, black, white. No tools, no explanation.",
                                },
                                native["__image_block__"],
                            ],
                        }
                    ],
                    "Interpret the actual supplied pixels. Do not guess from metadata.",
                    [],
                ),
                100,
            )
            try:
                actual = json.loads(response.text)
            except (ValueError, TypeError):
                actual = None
            passed = actual == selected and len(wire) == 1
            print(
                json.dumps(
                    {
                        "passed": passed,
                        "synthetic_only": True,
                        "provider_image_response_received": True,
                        "visual_answer_correct": actual == selected,
                        "elapsed_seconds": round(time.monotonic() - started, 3),
                        "wire": wire,
                        "credential_writes": False,
                    },
                    sort_keys=True,
                ),
                flush=True,
            )
            return 0 if passed else 1
        except Exception as error:
            # Exception messages may include remote output. Print type only.
            print(
                json.dumps(
                    {
                        "passed": False,
                        "error_type": type(error).__name__,
                        "wire": wire,
                        "credential_writes": False,
                    }
                ),
                flush=True,
            )
            return 1
        finally:
            await client.close()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
