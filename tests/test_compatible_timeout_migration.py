"""Upgrade persisted timeouts without overwriting explicit values or secrets."""
import logging
import os

import pytest
import yaml

from src.config.migrations import apply_compatible_timeout_migration
from src.config.schema import OpenAICompatibleConfig, load_config


@pytest.mark.parametrize("new,expected", [
    ({}, (3600, 300)),
    ({"request_timeout_seconds": 7200}, (7200, 300)),
    ({"stream_stall_timeout_seconds": 90}, (3600, 90)),
    ({"request_timeout_seconds": 7200, "stream_stall_timeout_seconds": 90}, (7200, 90)),
])
def test_schema_legacy_and_independent_new_field_precedence(new, expected):
    value = OpenAICompatibleConfig(timeout=300, **new)
    assert (value.request_timeout_seconds, value.stream_stall_timeout_seconds) == expected
    assert "timeout" not in value.model_dump()
    assert OpenAICompatibleConfig.model_validate(value.model_dump()) == value


def test_invalid_new_values_do_not_fall_back_to_legacy():
    for new in ({"request_timeout_seconds": 0}, {"stream_stall_timeout_seconds": 0}):
        with pytest.raises(ValueError):
            OpenAICompatibleConfig(timeout=300, **new)


def test_load_migrates_atomic_leafs_preserves_placeholders_comments_mode_and_symlink(
    tmp_path, monkeypatch, caplog
):
    monkeypatch.setenv("COMPAT_STALL", "210")
    raw = (
        "# retain this comment\ndiscord: {token: test}\n"
        "openai_compatible:\n  timeout: ${COMPAT_STALL} # chosen value\n"
        "  api_key: ${COMPAT_KEY}\n  enabled: false\n"
    )
    monkeypatch.setenv("COMPAT_KEY", "test-only-secret")
    target = tmp_path / "config.yml"
    target.write_text(raw)
    target.chmod(0o640)
    alias = tmp_path / "alias.yml"
    alias.symlink_to(target)
    with caplog.at_level(logging.WARNING):
        cfg = load_config(alias)
    assert cfg.openai_compatible.request_timeout_seconds == 3600
    assert cfg.openai_compatible.stream_stall_timeout_seconds == 210
    assert alias.is_symlink()
    text = target.read_text()
    assert "${COMPAT_STALL}" in text and "${COMPAT_KEY}" in text
    assert "test-only-secret" not in text
    assert "retain this comment" in text
    assert "timeout:" not in text
    assert os.stat(target).st_mode & 0o777 == 0o640
    assert "Migrated openai_compatible.timeout=210" in caplog.text
    before = target.read_bytes()
    assert load_config(alias).openai_compatible == cfg.openai_compatible
    assert target.read_bytes() == before


def test_write_failure_retains_file_and_runtime_migration(tmp_path, monkeypatch, caplog):
    path = tmp_path / "config.yml"
    raw = "openai_compatible:\n  timeout: 300\n"
    path.write_text(raw)
    data = yaml.safe_load(raw)
    monkeypatch.setattr(
        "src.config.persistence._patch_config_paths",
        lambda *args, **kwargs: (_ for _ in ()).throw(PermissionError("denied")),
    )
    apply_compatible_timeout_migration(data, path, raw)
    assert path.read_text() == raw
    assert OpenAICompatibleConfig(**data["openai_compatible"]).stream_stall_timeout_seconds == 300
    assert "retrying migration on next load" in caplog.text


def test_persisted_new_fields_win_and_legacy_removed(tmp_path):
    raw = (
        "openai_compatible:\n  timeout: 300\n  request_timeout_seconds: 7200\n"
        "  stream_stall_timeout_seconds: 75\n"
    )
    path = tmp_path / "config.yml"
    path.write_text(raw)
    apply_compatible_timeout_migration(yaml.safe_load(raw), path, raw)
    assert yaml.safe_load(path.read_text())["openai_compatible"] == {
        "request_timeout_seconds": 7200, "stream_stall_timeout_seconds": 75,
    }


def test_concurrent_newer_timeout_save_is_never_overwritten(tmp_path, caplog):
    raw = "openai_compatible:\n  timeout: 300\n"
    path = tmp_path / "config.yml"
    newer = raw + "  stream_stall_timeout_seconds: 80\n"
    path.write_text(newer)
    apply_compatible_timeout_migration(yaml.safe_load(raw), path, raw)
    assert path.read_text() == newer
    assert "newer file untouched" in caplog.text


@pytest.mark.parametrize("body,expected", [
    ({"timeout": 230}, (3600, 230)),
    ({"timeout": 230, "request_timeout_seconds": 7200,
      "stream_stall_timeout_seconds": 90}, (7200, 90)),
])
async def test_dedicated_api_migrates_old_input_and_persists_explicit_fields(body, expected):
    from aiohttp.test_utils import TestClient, TestServer

    from src.web.api.llm_admin import register_provider_config
    from tests.test_web_api_llm_admin import _app, _gw

    app, bot = _app(register_provider_config)
    _gw(bot)
    async with TestClient(TestServer(app)) as client:
        response = await client.put("/api/openai-compatible/config", json=body)
        assert response.status == 200, await response.text()
    cfg = bot.config.openai_compatible
    assert (cfg.request_timeout_seconds, cfg.stream_stall_timeout_seconds) == expected
