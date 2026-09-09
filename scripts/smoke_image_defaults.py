#!/usr/bin/env python3
"""Opt-in branch image smoke, including real Discord delivery and readback.

Run from a development checkout, never the live deployment. Uses the actual
load_config -> selector -> native backend -> MediaTools -> discord.py path.
No gateway connection, live config writes, or credential rotation. Access
credentials are snapshotted privately and never logged. Existing evidence
refuses replay: reconcile any interrupted operation before another generation.
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import io
import json
import logging
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def credential_snapshot(path: Path, required_lifetime: int) -> dict:
    """Select a valid access token without refreshing any single-use token."""
    raw = json.loads(path.read_text())
    accounts = raw if isinstance(raw, list) else [raw]
    candidates = []
    for index, account in enumerate(accounts):
        if not isinstance(account, dict):
            continue
        shadow_path = path.parent / f"codex_auth_{index}.json"
        if isinstance(raw, list) and shadow_path.is_file():
            shadow = json.loads(shadow_path.read_text())
            if (
                isinstance(shadow, dict)
                and account.get("account_id")
                and shadow.get("account_id") == account["account_id"]
                and shadow.get("expires_at", 0) > account.get("expires_at", 0)
            ):
                account = shadow
        if account.get("access_token") and account.get("expires_at", 0) > (
            time.time() + required_lifetime
        ):
            candidates.append(account)
    if not candidates:
        raise RuntimeError("No sufficiently fresh access token; no refresh attempted")
    account = max(candidates, key=lambda item: item["expires_at"])
    return {
        key: account[key]
        for key in ("access_token", "expires_at", "account_id")
        if key in account
    }


async def smoke(args) -> None:
    from dotenv import dotenv_values
    from PIL import Image

    import discord
    from src.config.schema import load_config
    from src.discord.native_tools.media import MediaTools
    from src.llm.codex_auth import CodexAuthPool
    from src.tools.image import ComfyUIImageBackend, ImageBackendSelector, OpenAIImageBackend

    if ROOT == Path("/opt/odin"):
        raise RuntimeError("Run this smoke from a development checkout")
    os.umask(0o077)
    args.output.mkdir(parents=True, exist_ok=True)
    evidence_path = args.output / "image-smoke.json"
    # Claim before ANY network operation. A partial run must not auto-replay.
    with evidence_path.open("x") as target:
        json.dump({"state": "prepared"}, target)
    evidence = {
        "state": "prepared",
        "revision": subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=ROOT, text=True,
        ).strip(),
        "dirty": bool(subprocess.check_output(
            ["git", "status", "--porcelain"], cwd=ROOT, text=True,
        ).strip()),
    }

    def record(**fields):
        evidence.update(fields)
        evidence_path.write_text(json.dumps(evidence, indent=2) + "\n")

    token = os.environ.get("DISCORD_TOKEN")
    if args.env_file:
        token = dotenv_values(args.env_file).get("DISCORD_TOKEN") or token
    if not token:
        raise RuntimeError("DISCORD_TOKEN is required, never pass it on the command line")
    client = discord.Client(intents=discord.Intents.none())
    backend = None
    try:
        with tempfile.TemporaryDirectory(prefix="odin-image-smoke-") as tmp:
            tmp_path = Path(tmp)
            config_path = tmp_path / "config.yml"
            config_path.write_text(
                "discord: {token: smoke-only}\n"
                "openai_codex: {enabled: true}\n"
                "llm_provider: {active_provider: codex}\n"
            )
            cfg = load_config(config_path)
            pair = cfg.image.openai
            assert (pair.outer_model, pair.image_model) == (
                "gpt-6-astra", "gpt-image-2.5-flare",
            )
            record(
                outer_model=pair.outer_model, image_model=pair.image_model,
                timeout_seconds=pair.request_timeout_seconds,
                source_model_leaves_absent=True,
            )
            auth_path = tmp_path / "auth.json"
            auth_path.write_text(json.dumps(credential_snapshot(
                args.credentials, pair.request_timeout_seconds + 600,
            )))
            pool = CodexAuthPool(str(auth_path))
            backend = OpenAIImageBackend(get_auth=lambda: pool, get_config=lambda: cfg)
            selector = ImageBackendSelector(
                get_config=lambda: cfg, openai_backend=backend,
                comfyui_backend=ComfyUIImageBackend(get_config=lambda: cfg),
            )
            await client.login(token)
            channel = await client.fetch_channel(args.channel)
            posted = []

            class ValidatingChannel:
                async def send(self, *, file):
                    data = file.fp.getvalue()
                    with Image.open(io.BytesIO(data)) as image:
                        image.verify()
                    with Image.open(io.BytesIO(data)) as image:
                        image.load()
                        dimensions = list(image.size)
                    (args.output / "generated.png").write_bytes(data)
                    record(
                        state="generated", generation_seconds=round(time.monotonic() - start, 3),
                        output_bytes=len(data), dimensions=dimensions,
                        sha256=hashlib.sha256(data).hexdigest(),
                    )
                    message = await channel.send(file=file)
                    posted.append(message)
                    record(state="posted", discord_message_id=str(message.id))
                    return message

            tools = MediaTools(
                get_config=lambda: cfg, browser_manager=None, tool_executor=None,
                image_selector=selector,
            )
            start = time.monotonic()
            record(state="generating")
            result = await tools._handle_generate_image(
                SimpleNamespace(channel=ValidatingChannel()),
                {"prompt": "An elegant copper observatory above a sea of clouds at dawn, "
                           "painterly architectural concept art, warm sunlight, no text."},
            )
            metadata = getattr(result, "audit_metadata", {})
            if not posted or metadata.get("delivery_status") != "posted":
                raise RuntimeError("Generation/delivery incomplete; inspect saved state")
            delivered = await channel.fetch_message(posted[0].id)
            if len(delivered.attachments) != 1:
                raise RuntimeError("Discord readback did not contain one attachment")
            uploaded = await delivered.attachments[0].read()
            if hashlib.sha256(uploaded).hexdigest() != evidence["sha256"]:
                raise RuntimeError("Discord attachment bytes differ from generated output")
            with Image.open(io.BytesIO(uploaded)) as image:
                image.load()
            record(
                state="verified", delivery_status="posted-and-read-back",
                elapsed_seconds=round(time.monotonic() - start, 3),
                within_existing_generation_deadline=(
                    evidence["generation_seconds"] < pair.request_timeout_seconds
                ),
                route=result.audit_metadata["route"],
            )
            print(json.dumps(evidence, indent=2))
    except BaseException as exc:
        record(error_type=type(exc).__name__)
        raise
    finally:
        if backend is not None:
            await backend.close()
        await client.close()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--credentials", type=Path, required=True)
    parser.add_argument("--env-file", type=Path)
    parser.add_argument("--channel", type=int, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--confirm", action="store_true", help="Generate once and post to Discord")
    args = parser.parse_args()
    if not args.confirm:
        parser.error("--confirm is required for quota consumption and Discord delivery")
    logging.disable(logging.CRITICAL)
    try:
        asyncio.run(smoke(args))
    except BaseException as exc:
        # Never stringify exceptions from auth/network code.
        print(f"Smoke incomplete: {type(exc).__name__}; inspect local evidence", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
