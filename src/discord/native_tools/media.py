"""Media/file native tool handlers (RFC-001 Phase 5b).

Verbatim moves from OdinBot: browser_screenshot, generate_file, post_file,
analyze_image (returns the ``__image_block__`` marker dict the tool loop
injects as vision content), generate_image, and the image-magic sniffing
helper. ``get_config`` is a provider callable (config hot-reload).
"""

from __future__ import annotations

import asyncio
import base64
import io
import os
from collections.abc import Callable

import discord

from ...odin_log import get_logger

log = get_logger("discord")


class MediaTools:
    def __init__(
        self,
        *,
        get_config: Callable,
        browser_manager,
        tool_executor,
        image_selector=None,
    ) -> None:
        self.get_config = get_config
        self.browser_manager = browser_manager
        self.tool_executor = tool_executor
        self.image_selector = image_selector

    @staticmethod
    def _detect_image_type(data: bytes) -> str | None:
        """Detect image media type from file magic bytes."""
        if data[:8] == b"\x89PNG\r\n\x1a\n":
            return "image/png"
        if data[:2] == b"\xff\xd8":
            return "image/jpeg"
        if data[:4] == b"GIF8":
            return "image/gif"
        if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
            return "image/webp"
        return None

    async def _handle_browser_screenshot(self, message, inp: dict) -> str:
        """Take a browser screenshot and post it as a Discord image."""
        if not self.browser_manager:
            return "Browser automation is not enabled. Set browser.enabled=true in config."
        from ...tools.browser import handle_browser_screenshot

        try:
            text, screenshot_bytes = await handle_browser_screenshot(self.browser_manager, inp)
            if screenshot_bytes:
                discord_file = discord.File(
                    io.BytesIO(screenshot_bytes), filename="screenshot.png"
                )
                await message.channel.send(file=discord_file)
            return text
        except Exception as e:
            return f"Browser screenshot failed: {e}"

    async def _handle_generate_file(self, message, inp: dict) -> str:
        """Generate a file from content and post it as a Discord attachment."""
        filename = inp.get("filename", "output.txt")
        content = inp.get("content", "")
        caption = inp.get("caption", "")

        file_bytes = content.encode("utf-8")
        discord_file = discord.File(io.BytesIO(file_bytes), filename=filename)
        try:
            await message.channel.send(content=caption or None, file=discord_file)
            return f"File `{filename}` ({len(file_bytes)} bytes) attached to channel."
        except Exception as e:
            return f"Failed to post file: {e}"

    async def _handle_post_file(self, message, inp: dict) -> str:
        """Fetch a file from a host and post it to Discord.

        For localhost this reads directly from the local filesystem; for any
        other host it falls back to SSH + base64 stream (handles binary safely).
        Bypassing SSH for localhost avoids the host-key / ssh_key_path gauntlet
        when Odin wants to post its own files.
        """
        host_alias = inp.get("host")
        path = inp.get("path")
        caption = inp.get("caption", "")

        if not host_alias or not path:
            return "Both 'host' and 'path' are required."

        resolved = self.tool_executor._resolve_host(host_alias)
        if not resolved:
            return f"Unknown or disallowed host: {host_alias}"
        address, ssh_user, _os = resolved

        # Local fast path — no SSH gymnastics needed.
        from ...tools.ssh import is_local_address

        if is_local_address(address):
            try:
                with open(path, "rb") as f:
                    file_bytes = f.read()
            except FileNotFoundError:
                return f"File not found: {path}"
            except PermissionError:
                return f"Permission denied reading file: {path}"
            except OSError as exc:
                return f"Failed to read file: {exc}"
        else:
            # Fetch file as base64 via SSH (handles binary safely)
            import shlex

            config = self.get_config()
            safe_path = shlex.quote(path)
            ssh_args = [
                "ssh",
                "-i",
                config.tools.ssh_key_path,
                "-o",
                f"UserKnownHostsFile={config.tools.ssh_known_hosts_path}",
                "-o",
                "StrictHostKeyChecking=yes",
                "-o",
                "ConnectTimeout=10",
                "-o",
                "BatchMode=yes",
                f"{ssh_user}@{address}",
                f"base64 {safe_path}",
            ]
            try:
                proc = await asyncio.create_subprocess_exec(
                    *ssh_args,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )
                stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=30)
                if proc.returncode != 0:
                    return (
                        "Failed to fetch file: "
                        f"{stderr.decode('utf-8', errors='replace').strip()}"
                    )
                file_bytes = base64.b64decode(stdout)
            except TimeoutError:
                return "File fetch timed out (30s)."
            except Exception as e:
                return f"Failed to fetch file: {e}"

        if not file_bytes:
            return f"File not found or empty: {path}"

        # Size check (Discord limit: 25MB for non-boosted servers)
        if len(file_bytes) > 25 * 1024 * 1024:
            return (
                f"File too large to post ({len(file_bytes) / 1024 / 1024:.1f} MB). "
                "Discord limit is 25 MB."
            )

        filename = os.path.basename(path)
        try:
            file = discord.File(io.BytesIO(file_bytes), filename=filename)
            await message.channel.send(content=caption or None, file=file)
            return f"Posted `{filename}` ({len(file_bytes) / 1024:.1f} KB) to channel."
        except discord.HTTPException as e:
            return f"Failed to upload to Discord: {e}"

    async def _handle_analyze_image(self, message, inp: dict) -> str | dict:
        """Fetch an image and return a vision block for the LLM to analyze.

        Returns either an error string or a dict with ``__image_block__`` key
        that the tool loop injects as a vision content block.
        """
        import aiohttp

        url = inp.get("url")
        host = inp.get("host")
        path = inp.get("path")
        prompt = inp.get("prompt", "Describe this image in detail.")

        image_bytes: bytes | None = None

        if url:
            # Validate URL scheme to prevent SSRF via file://, ftp://, etc.
            if not url.startswith(("http://", "https://")):
                return "Only http:// and https:// URLs are supported."
            # DNS-rebind-aware SSRF guard — scheme-only validation let this
            # reach 169.254.169.254 / internal hosts.
            from ...tools.url_safety import is_url_blocked

            if is_url_blocked(url):
                return (
                    "URL blocked: targets a private, loopback, link-local, "
                    "or cloud-metadata address (SSRF protection)."
                )
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.get(
                        url, timeout=aiohttp.ClientTimeout(total=30), allow_redirects=False
                    ) as resp:
                        if resp.status != 200:
                            return f"Failed to fetch image from URL (HTTP {resp.status})"
                        ct = resp.headers.get("Content-Type", "")
                        if not ct.startswith("image/"):
                            return f"URL does not point to an image (Content-Type: {ct})"
                        image_bytes = await resp.read()
            except Exception as e:
                return f"Failed to fetch image from URL: {e}"
        elif host and path:
            # Use executor to fetch from host via base64
            import shlex

            resolved = self.tool_executor._resolve_host(host)
            if not resolved:
                return f"Unknown or disallowed host: {host}"
            address, ssh_user, _os = resolved
            safe_path = shlex.quote(path)
            code, output = await self.tool_executor._exec_command(
                address,
                f"base64 -w0 {safe_path}",
                ssh_user,
            )
            if code != 0:
                return f"Failed to read image from host: {output}"
            try:
                image_bytes = base64.b64decode(output.strip())
            except Exception as e:
                return f"Failed to decode image data: {e}"
        else:
            return "Provide either 'url' or both 'host' and 'path'."

        if not image_bytes:
            return "No image data retrieved."

        # Enforce 5MB limit (same as Discord attachment limit)
        if len(image_bytes) > 5 * 1024 * 1024:
            return "Image exceeds 5MB size limit."

        media_type = self._detect_image_type(image_bytes)
        if not media_type:
            return "Unsupported image format. Supported: PNG, JPEG, GIF, WEBP."

        b64 = base64.b64encode(image_bytes).decode("ascii")

        # Return a special marker dict that the tool loop will inject as a
        # vision content block.  The tool result text sent to the LLM will be
        # the prompt, while the image block gets appended to the next user
        # message so Codex can see it.
        return {
            "__image_block__": {
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": media_type,
                    "data": b64,
                },
            },
            "__prompt__": prompt,
        }

    async def _handle_generate_image(self, message, inp: dict) -> str:
        """Generate an image via the selected backend and post as a Discord
        attachment. The backend returns bytes; this tool layer owns Discord."""
        from ...tools.image import ImageGenError

        if self.image_selector is None:
            return "Image generation is not available."

        prompt_text = inp.get("prompt", "")
        if not prompt_text:
            return "A 'prompt' describing the image is required."

        try:
            result = await self.image_selector.generate(
                prompt=prompt_text,
                size=inp.get("size"),
                negative=inp.get("negative", ""),
                model=inp.get("model", ""),
                width=inp.get("width"),
                height=inp.get("height"),
            )
        except ImageGenError as e:
            # These messages are constructed to carry no payload/account data.
            return f"Image generation failed: {e}"
        except Exception:
            # Never surface a raw provider payload; log without the body.
            log.warning("image generation raised unexpectedly", exc_info=True)
            return "Image generation failed unexpectedly."

        try:
            file = discord.File(io.BytesIO(result.data), filename="generated.png")
            await message.channel.send(file=file)
            # The selected backend is recorded internally (here + selector logs)
            # but never surfaced in the user-facing result.
            log.info(
                "image generated: backend=%s model=%s decoded=%dx%d",
                result.backend,
                result.image_model,
                result.width,
                result.height,
            )
            return (
                f"Image generated ({result.width}x{result.height}, "
                f"{len(result.data) / 1024:.1f} KB) and posted."
            )
        except discord.HTTPException as e:
            return f"Failed to upload generated image to Discord: {e}"
