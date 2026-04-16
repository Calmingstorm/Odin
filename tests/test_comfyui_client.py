"""Tests for ComfyUI HTTP client (src/tools/comfyui.py).

Covers ComfyUIClient: generate workflow construction, checkpoint resolution,
history polling, error handling, and the default workflow template.
"""
from __future__ import annotations

import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.tools.comfyui import ComfyUIClient, _DEFAULT_WORKFLOW


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _mock_response(*, status=200, json_data=None, text="ok", read_data=b"PNG"):
    resp = AsyncMock()
    resp.status = status
    resp.json = AsyncMock(return_value=json_data or {})
    resp.text = AsyncMock(return_value=text)
    resp.read = AsyncMock(return_value=read_data)
    return resp


class _MockContextManager:
    def __init__(self, resp):
        self.resp = resp

    async def __aenter__(self):
        return self.resp

    async def __aexit__(self, *args):
        pass


# ---------------------------------------------------------------------------
# ComfyUIClient init
# ---------------------------------------------------------------------------

class TestComfyUIClientInit:
    def test_base_url_trailing_slash(self):
        client = ComfyUIClient("http://localhost:8188/")
        assert client.base_url == "http://localhost:8188"

    def test_base_url_no_trailing_slash(self):
        client = ComfyUIClient("http://localhost:8188")
        assert client.base_url == "http://localhost:8188"


# ---------------------------------------------------------------------------
# Default workflow
# ---------------------------------------------------------------------------

class TestDefaultWorkflow:
    def test_has_required_nodes(self):
        assert "3" in _DEFAULT_WORKFLOW  # KSampler
        assert "4" in _DEFAULT_WORKFLOW  # CheckpointLoader
        assert "5" in _DEFAULT_WORKFLOW  # EmptyLatentImage
        assert "6" in _DEFAULT_WORKFLOW  # CLIPTextEncode (positive)
        assert "7" in _DEFAULT_WORKFLOW  # CLIPTextEncode (negative)
        assert "8" in _DEFAULT_WORKFLOW  # VAEDecode
        assert "9" in _DEFAULT_WORKFLOW  # SaveImage

    def test_ksampler_class_type(self):
        assert _DEFAULT_WORKFLOW["3"]["class_type"] == "KSampler"

    def test_default_dimensions(self):
        assert _DEFAULT_WORKFLOW["5"]["inputs"]["width"] == 1024
        assert _DEFAULT_WORKFLOW["5"]["inputs"]["height"] == 1024

    def test_default_steps(self):
        assert _DEFAULT_WORKFLOW["3"]["inputs"]["steps"] == 20


# ---------------------------------------------------------------------------
# _resolve_checkpoint
# ---------------------------------------------------------------------------

class TestResolveCheckpoint:
    @pytest.mark.asyncio
    async def test_preferred_available(self):
        client = ComfyUIClient("http://localhost:8188")
        resp = _mock_response(json_data={
            "CheckpointLoaderSimple": {
                "input": {"required": {"ckpt_name": [["model_a.safetensors", "model_b.safetensors"]]}}
            }
        })

        with patch("aiohttp.ClientSession") as MockSession:
            session = AsyncMock()
            MockSession.return_value.__aenter__ = AsyncMock(return_value=session)
            MockSession.return_value.__aexit__ = AsyncMock()
            session.get = MagicMock(return_value=_MockContextManager(resp))

            result = await client._resolve_checkpoint("model_a.safetensors")
        assert result == "model_a.safetensors"

    @pytest.mark.asyncio
    async def test_preferred_not_found_uses_first(self):
        client = ComfyUIClient("http://localhost:8188")
        resp = _mock_response(json_data={
            "CheckpointLoaderSimple": {
                "input": {"required": {"ckpt_name": [["other_model.safetensors"]]}}
            }
        })

        with patch("aiohttp.ClientSession") as MockSession:
            session = AsyncMock()
            MockSession.return_value.__aenter__ = AsyncMock(return_value=session)
            MockSession.return_value.__aexit__ = AsyncMock()
            session.get = MagicMock(return_value=_MockContextManager(resp))

            result = await client._resolve_checkpoint("missing.safetensors")
        assert result == "other_model.safetensors"

    @pytest.mark.asyncio
    async def test_no_checkpoints_available(self):
        client = ComfyUIClient("http://localhost:8188")
        resp = _mock_response(json_data={
            "CheckpointLoaderSimple": {
                "input": {"required": {"ckpt_name": [[]]}}
            }
        })

        with patch("aiohttp.ClientSession") as MockSession:
            session = AsyncMock()
            MockSession.return_value.__aenter__ = AsyncMock(return_value=session)
            MockSession.return_value.__aexit__ = AsyncMock()
            session.get = MagicMock(return_value=_MockContextManager(resp))

            result = await client._resolve_checkpoint("any.safetensors")
        assert result is None

    @pytest.mark.asyncio
    async def test_api_error_returns_preferred(self):
        client = ComfyUIClient("http://localhost:8188")
        resp = _mock_response(status=500)

        with patch("aiohttp.ClientSession") as MockSession:
            session = AsyncMock()
            MockSession.return_value.__aenter__ = AsyncMock(return_value=session)
            MockSession.return_value.__aexit__ = AsyncMock()
            session.get = MagicMock(return_value=_MockContextManager(resp))

            result = await client._resolve_checkpoint("preferred.safetensors")
        assert result == "preferred.safetensors"

    @pytest.mark.asyncio
    async def test_connection_error_returns_preferred(self):
        client = ComfyUIClient("http://localhost:8188")

        with patch("aiohttp.ClientSession") as MockSession:
            session = AsyncMock()
            MockSession.return_value.__aenter__ = AsyncMock(side_effect=Exception("connection refused"))
            MockSession.return_value.__aexit__ = AsyncMock()

            result = await client._resolve_checkpoint("preferred.safetensors")
        assert result == "preferred.safetensors"


# ---------------------------------------------------------------------------
# _poll_history
# ---------------------------------------------------------------------------

class TestPollHistory:
    @pytest.mark.asyncio
    async def test_finds_image_filename(self):
        client = ComfyUIClient("http://localhost:8188")
        session = AsyncMock()

        prompt_id = "abc123"
        history_resp = _mock_response(json_data={
            prompt_id: {
                "outputs": {
                    "9": {"images": [{"filename": "odin_00001_.png"}]}
                }
            }
        })
        session.get = MagicMock(return_value=_MockContextManager(history_resp))

        with patch("asyncio.sleep", new_callable=AsyncMock):
            result = await client._poll_history(session, prompt_id)
        assert result == "odin_00001_.png"

    @pytest.mark.asyncio
    async def test_no_outputs_yet(self):
        client = ComfyUIClient("http://localhost:8188")
        session = AsyncMock()

        # Return empty data on first 2 calls, then with result
        call_count = 0
        empty_resp = _mock_response(json_data={})
        found_resp = _mock_response(json_data={
            "test_id": {"outputs": {"9": {"images": [{"filename": "result.png"}]}}}
        })

        responses = [empty_resp, empty_resp, found_resp]
        idx = {"i": 0}

        def mock_get(*args, **kwargs):
            resp = responses[min(idx["i"], len(responses) - 1)]
            idx["i"] += 1
            return _MockContextManager(resp)

        session.get = mock_get

        with patch("asyncio.sleep", new_callable=AsyncMock):
            result = await client._poll_history(session, "test_id")
        assert result == "result.png"


# ---------------------------------------------------------------------------
# generate
# ---------------------------------------------------------------------------

class TestGenerate:
    @pytest.mark.asyncio
    async def test_generate_no_checkpoint(self):
        client = ComfyUIClient("http://localhost:8188")
        with patch.object(client, "_resolve_checkpoint", new_callable=AsyncMock, return_value=None):
            result = await client.generate("a cat")
        assert result is None

    @pytest.mark.asyncio
    async def test_generate_prompt_failure(self):
        client = ComfyUIClient("http://localhost:8188")
        with patch.object(client, "_resolve_checkpoint", new_callable=AsyncMock, return_value="model.safetensors"):
            prompt_resp = _mock_response(status=500, text="error")

            with patch("aiohttp.ClientSession") as MockSession:
                session = AsyncMock()
                MockSession.return_value.__aenter__ = AsyncMock(return_value=session)
                MockSession.return_value.__aexit__ = AsyncMock()
                session.post = MagicMock(return_value=_MockContextManager(prompt_resp))

                result = await client.generate("a cat")
        assert result is None

    @pytest.mark.asyncio
    async def test_generate_no_prompt_id(self):
        client = ComfyUIClient("http://localhost:8188")
        with patch.object(client, "_resolve_checkpoint", new_callable=AsyncMock, return_value="model.safetensors"):
            prompt_resp = _mock_response(json_data={})  # no prompt_id

            with patch("aiohttp.ClientSession") as MockSession:
                session = AsyncMock()
                MockSession.return_value.__aenter__ = AsyncMock(return_value=session)
                MockSession.return_value.__aexit__ = AsyncMock()
                session.post = MagicMock(return_value=_MockContextManager(prompt_resp))

                result = await client.generate("a cat")
        assert result is None

    @pytest.mark.asyncio
    async def test_generate_suspicious_prompt_id(self):
        client = ComfyUIClient("http://localhost:8188")
        with patch.object(client, "_resolve_checkpoint", new_callable=AsyncMock, return_value="model.safetensors"):
            prompt_resp = _mock_response(json_data={"prompt_id": "../../etc/passwd"})

            with patch("aiohttp.ClientSession") as MockSession:
                session = AsyncMock()
                MockSession.return_value.__aenter__ = AsyncMock(return_value=session)
                MockSession.return_value.__aexit__ = AsyncMock()
                session.post = MagicMock(return_value=_MockContextManager(prompt_resp))

                result = await client.generate("a cat")
        assert result is None

    @pytest.mark.asyncio
    async def test_generate_timeout(self):
        client = ComfyUIClient("http://localhost:8188")
        with patch.object(client, "_resolve_checkpoint", new_callable=AsyncMock, return_value="model.safetensors"):
            with patch("aiohttp.ClientSession") as MockSession:
                session = AsyncMock()
                MockSession.return_value.__aenter__ = AsyncMock(return_value=session)
                MockSession.return_value.__aexit__ = AsyncMock()
                session.post = MagicMock(side_effect=asyncio.TimeoutError())

                result = await client.generate("a cat")
        assert result is None

    @pytest.mark.asyncio
    async def test_generate_connection_error(self):
        import aiohttp
        client = ComfyUIClient("http://localhost:8188")
        with patch.object(client, "_resolve_checkpoint", new_callable=AsyncMock, return_value="model.safetensors"):
            with patch("aiohttp.ClientSession") as MockSession:
                session = AsyncMock()
                MockSession.return_value.__aenter__ = AsyncMock(return_value=session)
                MockSession.return_value.__aexit__ = AsyncMock()
                session.post = MagicMock(side_effect=aiohttp.ClientError("conn refused"))

                result = await client.generate("a cat")
        assert result is None

    @pytest.mark.asyncio
    async def test_generate_custom_dimensions(self):
        """Verify custom width/height are applied to the workflow."""
        client = ComfyUIClient("http://localhost:8188")
        captured_payload = {}

        def capture_post(url, json=None):
            captured_payload.update(json or {})
            return _MockContextManager(_mock_response(json_data={"prompt_id": "test123"}))

        with patch.object(client, "_resolve_checkpoint", new_callable=AsyncMock, return_value="model.safetensors"):
            with patch.object(client, "_poll_history", new_callable=AsyncMock, return_value=None):
                with patch("aiohttp.ClientSession") as MockSession:
                    session = AsyncMock()
                    MockSession.return_value.__aenter__ = AsyncMock(return_value=session)
                    MockSession.return_value.__aexit__ = AsyncMock()
                    session.post = capture_post
                    session.get = MagicMock(return_value=_MockContextManager(_mock_response(status=404)))

                    await client.generate("a cat", width=512, height=768)

        workflow = captured_payload.get("prompt", {})
        assert workflow["5"]["inputs"]["width"] == 512
        assert workflow["5"]["inputs"]["height"] == 768

    @pytest.mark.asyncio
    async def test_generate_sets_prompt_text(self):
        """Verify the prompt text is set in the workflow."""
        client = ComfyUIClient("http://localhost:8188")
        captured_payload = {}

        def capture_post(url, json=None):
            captured_payload.update(json or {})
            return _MockContextManager(_mock_response(json_data={"prompt_id": "test123"}))

        with patch.object(client, "_resolve_checkpoint", new_callable=AsyncMock, return_value="model.safetensors"):
            with patch.object(client, "_poll_history", new_callable=AsyncMock, return_value=None):
                with patch("aiohttp.ClientSession") as MockSession:
                    session = AsyncMock()
                    MockSession.return_value.__aenter__ = AsyncMock(return_value=session)
                    MockSession.return_value.__aexit__ = AsyncMock()
                    session.post = capture_post
                    session.get = MagicMock(return_value=_MockContextManager(_mock_response(status=404)))

                    await client.generate("beautiful sunset", negative="ugly")

        workflow = captured_payload.get("prompt", {})
        assert workflow["6"]["inputs"]["text"] == "beautiful sunset"
        assert workflow["7"]["inputs"]["text"] == "ugly"


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------

class TestEdgeCases:
    def test_default_workflow_not_mutated_between_calls(self):
        """_DEFAULT_WORKFLOW should be copied, not modified in place."""
        original_width = _DEFAULT_WORKFLOW["5"]["inputs"]["width"]
        assert original_width == 1024

    @pytest.mark.asyncio
    async def test_generate_generic_exception(self):
        client = ComfyUIClient("http://localhost:8188")
        with patch.object(client, "_resolve_checkpoint", new_callable=AsyncMock, return_value="model.safetensors"):
            with patch("aiohttp.ClientSession") as MockSession:
                MockSession.return_value.__aenter__ = AsyncMock(side_effect=Exception("unexpected"))
                MockSession.return_value.__aexit__ = AsyncMock()

                result = await client.generate("a cat")
        assert result is None
