"""Media/file native tool handlers (RFC-001 Phase 5b).

Verbatim moves from OdinBot: browser_screenshot, generate_file, post_file,
analyze_image (returns the ``__image_block__`` marker dict the tool loop
injects as vision content), generate_image, and the image-magic sniffing
helper. ``get_config`` is a provider callable (config hot-reload).
"""

from __future__ import annotations

import base64
import io
import os
from collections.abc import Callable

import discord

from ...odin_log import get_logger

log = get_logger("discord")

# Hard cap on a URL-fetched image so a huge or hostile body can't exhaust memory.
_ANALYZE_IMAGE_MAX_BYTES = 25 * 1024 * 1024  # 25 MiB


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

        requester_id = str(getattr(getattr(message, "author", None), "id", "")) or None
        lease = self.tool_executor.acquire_host_for_user(host_alias, requester_id)
        if not lease:
            return f"Unknown or disallowed host: {host_alias}"
        try:
            target = lease.target
            address, ssh_user = target.address, target.ssh_user

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
                try:
                    from ...tools.ssh import read_binary_file

                    file_bytes, read_error = await lease.run(
                        lambda: read_binary_file(
                            address,
                            path,
                            max_bytes=25 * 1024 * 1024 + 1,
                            ssh_key_path=target.key_path,
                            known_hosts_path=target.known_hosts_path,
                            ssh_user=ssh_user,
                            port=target.port,
                            host_key_alias=target.host_key_alias,
                        )
                    )
                    if read_error or file_bytes is None:
                        return f"Failed to fetch file: {read_error}"
                except TimeoutError:
                    return "File fetch timed out (30s)."
                except Exception as e:
                    return f"Failed to fetch file: {e}"
        finally:
            lease.release()

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
        url = inp.get("url")
        host = inp.get("host")
        path = inp.get("path")
        prompt = inp.get("prompt", "Describe this image in detail.")

        image_bytes: bytes | None = None

        if url:
            # Validate URL scheme to prevent SSRF via file://, ftp://, etc.
            if not url.startswith(("http://", "https://")):
                return "Only http:// and https:// URLs are supported."
            # Hardened transport with redirects DISABLED (images never need to
            # follow one): per-hop SSRF validation, pinned connect IP, TLS
            # verification, and a byte cap. Scheme-only validation was not
            # SSRF-safe (http://169.254.169.254/... passed it).
            from ...tools.safe_fetch import (
                BlockedAddressError,
                ResponseTooLargeError,
                safe_fetch,
            )

            try:
                resp = await safe_fetch(
                    url,
                    follow_redirects=False,
                    max_bytes=_ANALYZE_IMAGE_MAX_BYTES,
                    timeout=30.0,
                )
            except BlockedAddressError:
                return (
                    "URL blocked: targets a private, loopback, link-local, "
                    "or cloud-metadata address (SSRF protection)."
                )
            except ResponseTooLargeError:
                return f"Image too large (max {_ANALYZE_IMAGE_MAX_BYTES} bytes)."
            except Exception as e:
                return f"Failed to fetch image from URL: {e}"
            if resp.status != 200:
                return f"Failed to fetch image from URL (HTTP {resp.status})"
            ct = resp.content_type
            if not ct.startswith("image/"):
                return f"URL does not point to an image (Content-Type: {ct})"
            image_bytes = resp.body
        elif host and path:
            # Fetch from host as bounded raw bytes

            requester_id = str(getattr(getattr(message, "author", None), "id", "")) or None
            lease = self.tool_executor.acquire_host_for_user(host, requester_id)
            if not lease:
                return f"Unknown or disallowed host: {host}"
            try:
                target = lease.target
                address, ssh_user = target.address, target.ssh_user
                # Same defect as analyze_pdf: base64 over the text pipeline is
                # truncated at MAX_OUTPUT_CHARS, so any image over roughly 12KB
                # arrived corrupt (adversarial review). Raw bounded bytes instead.
                from ...tools.ssh import read_binary_file

                image_bytes, read_error = await lease.run(
                    lambda: read_binary_file(
                        address,
                        path,
                        max_bytes=_ANALYZE_IMAGE_MAX_BYTES,
                        ssh_key_path=target.key_path,
                        known_hosts_path=target.known_hosts_path,
                        ssh_user=ssh_user,
                        port=target.port,
                        host_key_alias=target.host_key_alias,
                    )
                )
            finally:
                lease.release()
            if read_error:
                return f"Failed to read image from host: {read_error}"
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

    async def _handle_generate_image(self, message, inp: dict):
        """Generate an image via the selected backend and post as a Discord
        attachment. The backend returns bytes; this tool layer owns Discord.

        Returns a ToolResult whose ``output`` is a generic user-facing string
        (never names the backend) plus ``audit_metadata`` — a bounded structured
        record so ``search_audit`` can answer "which backend?" when asked.
        """
        from ...tools.image import ImageGenError
        from ...tools.result_validator import ToolResult

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

        # Non-sensitive structured record — enums + decoded dims only.
        meta: dict = {
            "backend": result.backend,
            "route": result.route,
            "fallback_reason": result.fallback_reason,
            "decoded_width": result.width,
            "decoded_height": result.height,
        }
        try:
            file = discord.File(io.BytesIO(result.data), filename="generated.png")
            await message.channel.send(file=file)
        except discord.HTTPException as e:
            # Generation succeeded even though delivery failed — record both.
            meta["delivery_status"] = "upload_failed"
            log.info("image generated (backend=%s) but upload failed: %s", result.backend, e)
            return ToolResult(
                output=f"Failed to upload generated image to Discord: {e}",
                tool_name="generate_image",
                audit_metadata=meta,
            )

        meta["delivery_status"] = "posted"
        log.info(
            "image generated: backend=%s model=%s decoded=%dx%d route=%s",
            result.backend, result.image_model, result.width, result.height, result.route,
        )
        return ToolResult(
            output=(
                f"Image generated ({result.width}x{result.height}, "
                f"{len(result.data) / 1024:.1f} KB) and posted."
            ),
            tool_name="generate_image",
            audit_metadata=meta,
        )
