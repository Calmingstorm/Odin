"""Boundary regressions for Campaign A's retained reliability surfaces."""
from __future__ import annotations

from types import SimpleNamespace

import pytest

from src.discord.delivery import ResponseDelivery
from src.discord.turn_resume import TurnResumeManager
from src.setup_wizard import PLACEHOLDER_TOKEN, build_env, is_setup_needed, validate_token_format
from src.web.api_common import _contains_blocked_fields, _deep_merge, _redact_config


def test_setup_detects_placeholder_blank_unreadable_and_real_token(tmp_path, monkeypatch):
    config = tmp_path / "config.yml"
    env = tmp_path / ".env"
    config.write_text("web: {}\n")
    env.write_text(f"DISCORD_TOKEN={PLACEHOLDER_TOKEN}\n")
    assert is_setup_needed(config, env)
    env.write_text("DISCORD_TOKEN=   \n")
    assert is_setup_needed(config, env)
    env.write_text("OTHER=value\n")
    assert is_setup_needed(config, env)
    env.write_text("DISCORD_TOKEN=actual-value\n")
    assert not is_setup_needed(config, env)
    monkeypatch.setattr(type(env), "read_text", lambda _: (_ for _ in ()).throw(OSError("denied")))
    assert is_setup_needed(config, env)


def test_setup_token_whitespace_and_extra_env_are_precisely_handled():
    assert validate_token_format("  a.b.c  ")
    assert not validate_token_format("a..c")
    assert build_env("x", {"A": "1", "B": "2"}).endswith("A=1\nB=2\n")


def test_api_common_recurses_lists_masks_operator_keys_and_stops_at_depth_limit():
    assert _contains_blocked_fields({"items": [{"token": "secret"}]}, frozenset({"token"}))
    base = {"nested": {"one": 1}}
    _deep_merge(base, {"nested": {"two": 2}})
    assert base == {"nested": {"one": 1, "two": 2}}
    deep = value = {}
    for _ in range(12):
        child = {}
        value["child"] = child
        value = child
    value["secret"] = "must not traverse forever"
    assert _redact_config(deep)["child"]


@pytest.mark.asyncio
async def test_delivery_presence_failure_is_nonfatal_and_chunk_first_file_is_attached(monkeypatch):
    state = SimpleNamespace(pending_files={"1": [(b"bytes", "proof.txt")]})
    delivery = ResponseDelivery(channel_state=state, change_presence=lambda **_: None)
    async def broken_presence(**_kwargs):
        raise RuntimeError("discord unavailable")
    delivery.change_presence = broken_presence
    await delivery.set_status("working", task_start=True)
    sent = []
    async def capture(_message, text, as_reply=True, files=None):
        sent.append((text, as_reply, files))
    delivery.send_with_retry = capture
    message = SimpleNamespace(channel=SimpleNamespace(id=1))
    await delivery.send_chunked(message, "x" * 1995 + "\n" + "y" * 30)
    assert len(sent) == 2
    assert sent[0][2] and sent[0][2][0].filename == "proof.txt"
    assert sent[1][1] is False


def test_resume_trigger_and_mention_candidate_stay_anchored():
    manager = object.__new__(TurnResumeManager)
    manager._get_bot_user = lambda: SimpleNamespace(id=42)
    assert manager.is_resume_trigger(" Continue!!. ")
    assert not manager.is_resume_trigger("please resume")
    assert manager._resume_candidate(" <@!42> resume") == " resume"
    assert manager._resume_candidate("resume <@42>") == "resume <@42>"


def test_unresolved_effect_free_observation_does_not_block_resume():
    from src.tools.effect_classifier import ToolEffectClass
    from src.turn_state.store import OpState
    assert TurnResumeManager._unresolved_ops({"operations": [
        {"state": OpState.RUNNING, "effect_class": ToolEffectClass.EFFECT_FREE_OBSERVATION},
        {"state": OpState.RUNNING, "effect_class": "mutating"},
    ]}) == [{"state": OpState.RUNNING, "effect_class": "mutating"}]
