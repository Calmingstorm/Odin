"""Numeric settings: strict saves, read-only startup compatibility."""

from __future__ import annotations

from typing import get_args

import pytest
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer
from pydantic import ValidationError

from src.config import schema
from src.config.schema import Config, ObservabilityConfig, load_config
from src.web.api.config_admin import register_discord_config


def _numeric_fields():
    from pydantic import BaseModel

    result = []
    for name, model in vars(schema).items():
        if not isinstance(model, type) or not issubclass(model, BaseModel):
            continue
        for field_name, field in model.model_fields.items():
            annotation = field.annotation
            args = get_args(annotation)
            if annotation in (int, float) or int in args or float in args:
                kind = float if annotation is float or float in args else int
                result.append(pytest.param(model, field_name, field, kind,
                                           id=f"{name}.{field_name}"))
    return result


NUMERIC_FIELDS = _numeric_fields()


def _model_data(model):
    if model is schema.ToolHost:
        return {"address": "127.0.0.1"}
    if model is schema.OpenAICompatibleModelProfile:
        return {"total_window_tokens": 100_000, "max_output_tokens": 10_000}
    return {}


@pytest.mark.parametrize("model,name,field,kind", NUMERIC_FIELDS)
def test_every_numeric_setting_has_strict_bounded_metadata(model, name, field, kind):
    assert any(getattr(item, "strict", False) for item in field.metadata)
    assert any(getattr(item, "ge", None) is not None for item in field.metadata)
    assert any(getattr(item, "le", None) is not None for item in field.metadata)


@pytest.mark.parametrize("model,name,field,kind", NUMERIC_FIELDS)
def test_every_numeric_setting_rejects_booleans_and_out_of_range(model, name, field, kind):
    lower = next(item.ge for item in field.metadata if getattr(item, "ge", None) is not None)
    upper = next(item.le for item in field.metadata if getattr(item, "le", None) is not None)
    invalid = [True, False, kind(lower - 1), kind(upper + 1), "1"]
    if kind is int:
        invalid.append(float(max(1, lower)))
    else:
        invalid.extend([float("nan"), float("inf"), -float("inf")])
    for value in invalid:
        with pytest.raises(ValidationError):
            model.model_validate({**_model_data(model), name: value})


@pytest.mark.parametrize("model,name,field,kind", NUMERIC_FIELDS)
def test_all_nonsensitive_numeric_settings_keep_legacy_startup_values(
    model, name, field, kind, caplog
):
    # Computer identity fields predate this change and remain fail-closed.
    if model is schema.ComputerUseConfig:
        return
    upper = next(item.le for item in field.metadata if getattr(item, "le", None) is not None)
    value = kind(upper + 1)
    with caplog.at_level("WARNING"):
        config = model.model_validate(
            {**_model_data(model), name: value}, context={"startup": True}
        )
    assert getattr(config, name) == value
    assert name in caplog.text and "Startup compatibility" in caplog.text


@pytest.mark.parametrize("value", [True, False, 2000.0, "2000"])
def test_startup_retains_legacy_integer_coercion_with_warning(value, caplog):
    config = ObservabilityConfig.model_validate(
        {"max_tool_result_chars": value}, context={"startup": True}
    )
    assert type(config.max_tool_result_chars) is int
    assert config.max_tool_result_chars == int(value)
    assert "max_tool_result_chars" in caplog.text


@pytest.mark.parametrize("section,field,values", [
    ("sessions", "context_budget_overrides", {"channel": True}),
    ("sessions", "context_budget_overrides", {"channel": 0}),
    ("sessions", "context_budget_overrides", {"channel": 10**12}),
    ("tools", "tool_timeouts", {"fetch_url": "30"}),
    ("tools", "tool_timeouts", {"fetch_url": True}),
    ("tools", "tool_timeouts", {"fetch_url": 10**12}),
    ("agents", "final_warning_iterations", [True]),
    ("agents", "final_warning_iterations", [1.0]),
    ("agents", "final_warning_iterations", [10**12]),
    ("openai_codex", "context_budget_overrides", {"gpt-6-luna": 60000.0}),
    ("openai_codex", "context_budget_overrides", {"gpt-6-luna": True}),
])
def test_numeric_container_entries_are_strict_and_bounded(section, field, values):
    with pytest.raises(ValidationError):
        Config.model_validate({"discord": {"token": "fixture"}, section: {field: values}})


@pytest.mark.parametrize("value", [True, 300.0, "300", -1, 0, 10**12])
def test_legacy_timeout_alias_cannot_bypass_save_validation(value):
    with pytest.raises(ValidationError):
        schema.OpenAICompatibleConfig(timeout=value)


@pytest.mark.parametrize("value", [True, 90000.0, "90000", -1, 0, 10**12])
def test_legacy_profile_alias_cannot_bypass_strict_save_validation(value):
    with pytest.raises(ValidationError):
        schema.OpenAICompatibleModelProfile(usable_input_tokens=value, max_output_tokens=10000)


def test_legacy_profile_strings_remain_startup_compatible(caplog):
    config = schema.OpenAICompatibleModelProfile.model_validate(
        {"usable_input_tokens": "90000", "max_output_tokens": "10000"},
        context={"startup": True},
    )
    assert config.total_window_tokens == 100000
    assert config.max_output_tokens == 10000
    assert "Startup compatibility" in caplog.text


def test_default_roundtrip_is_unchanged_without_numeric_warnings(caplog):
    data = Config(discord={"token": "fixture"}).model_dump()
    assert Config.model_validate(data, context={"startup": True}).model_dump() == data
    assert "numeric save constraints" not in caplog.text


def test_real_nested_config_load_retains_outliers(tmp_path, monkeypatch, caplog):
    path = tmp_path / "nested.yml"
    text = (
        "discord:\n  token: fixture\n"
        "tools:\n  bulkhead:\n    ssh_max_concurrent: 1000000000000\n"
        "  streaming:\n    max_chunk_chars: true\n"
        "sessions:\n  context_budget_overrides:\n    channel: -1\n"
        "mcp:\n  servers:\n    fixture:\n      timeout_seconds: -1\n"
    )
    path.write_text(text)
    monkeypatch.setattr(schema, "_ACTIVE_CONFIG_PATH", None)
    monkeypatch.setattr(schema, "_LAUNCH_CONFIG_PATH", None)
    config = load_config(path)
    assert config.tools.bulkhead.ssh_max_concurrent == 10**12
    assert config.tools.streaming.max_chunk_chars == 1
    assert config.sessions.context_budget_overrides == {"channel": -1}
    assert config.mcp.servers["fixture"].timeout_seconds == -1
    assert path.read_text() == text
    for field in ("ssh_max_concurrent", "max_chunk_chars", "context_budget_overrides",
                  "timeout_seconds"):
        assert field in caplog.text


def test_numeric_startup_does_not_bypass_other_validation():
    with pytest.raises(ValidationError):
        schema.OpenAICodexConfig.model_validate(
            {"context_budget_overrides": {"": -1}}, context={"startup": True}
        )
    with pytest.raises(ValidationError):
        schema.ToolHost.model_validate(
            {"address": "localhost", "host_id": "not-a-uuid", "port": -1},
            context={"startup": True},
        )


@pytest.mark.parametrize("value", [-1, 0, 10**12, True, False, 2000.0, "2000"])
def test_tool_result_save_rejects_invalid_numeric(value):
    with pytest.raises(ValidationError):
        ObservabilityConfig(max_tool_result_chars=value)


def test_existing_out_of_range_config_file_loads_with_warning(tmp_path, caplog, monkeypatch):
    # Real loader and an actual pre-upgrade YAML file, not model_validate alone.
    path = tmp_path / "existing.yml"
    text = "discord:\n  token: fixture\nobservability:\n  max_tool_result_chars: -1\n"
    path.write_text(text)
    monkeypatch.setattr(schema, "_ACTIVE_CONFIG_PATH", None)
    monkeypatch.setattr(schema, "_LAUNCH_CONFIG_PATH", None)
    with caplog.at_level("WARNING"):
        config = load_config(path)
    assert config.observability.max_tool_result_chars == -1
    assert path.read_text() == text
    assert "max_tool_result_chars" in caplog.text
    assert "startup" in caplog.text.lower()


@pytest.mark.parametrize("value", [-1, 0, 10**12, True])
async def test_settings_api_rejects_invalid_numeric_without_write(
    tmp_path, monkeypatch, value
):
    from types import SimpleNamespace

    path = tmp_path / "config.yml"
    text = "discord:\n  token: fixture\n"
    path.write_text(text)
    monkeypatch.setattr(schema, "_ACTIVE_CONFIG_PATH", path)
    monkeypatch.setattr(schema, "_LAUNCH_CONFIG_PATH", path)
    config = Config(discord={"token": "fixture"})
    bot = SimpleNamespace(config=config)
    routes = web.RouteTableDef()
    register_discord_config(routes, bot)
    app = web.Application()
    app.router.add_routes(routes)
    async with TestClient(TestServer(app)) as client:
        response = await client.put(
            "/api/config", json={"observability": {"max_tool_result_chars": value}}
        )
        assert response.status == 400
    assert bot.config is config
    assert path.read_text() == text
