"""Hermetic ratchet coverage for managed-host schema and prompt consumers."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from pydantic import ValidationError

from src.config import schema
from src.config.schema import Config, GovernorConfig, ToolHost, ToolsConfig
from src.discord.prompts import PromptBuilder


def _host(**overrides) -> ToolHost:
    values = {"address": "example.invalid", "ssh_user": "deploy"}
    values.update(overrides)
    return ToolHost(**values)


def _config(*, hosts=None, governor=None, default_host=""):
    return Config(
        discord={"token": "test-token"},
        tools=ToolsConfig(
            hosts=hosts or {},
            governor=governor or GovernorConfig(),
            default_host=default_host,
        ),
    )


class TestManagedHostSchemaRatchet:
    @pytest.mark.parametrize(
        ("field", "value", "message"),
        [
            ("address", "a" * 254, "too long"),
            ("description", "line\nbreak", "control characters"),
            ("address", "-unsafe", "invalid"),
            ("ssh_user", "", "invalid"),
        ],
    )
    def test_host_text_rejects_unsafe_values(self, field, value, message):
        with pytest.raises(ValidationError, match=message):
            _host(**{field: value})

    def test_host_key_and_uuid_validation_reject_bad_material(self):
        with pytest.raises(ValidationError, match="malformed key material"):
            _host(host_keys=["ssh-ed25519 bad\x7fkey"])
        with pytest.raises(ValidationError, match="must be a UUID"):
            _host(host_id="not-a-uuid")
        with pytest.raises(ValidationError, match="canonical UUID form"):
            _host(host_id="{06eebf65-8f6e-4c36-9acc-ce393fb34642}")

    def test_governor_rejects_unsafe_override_alias(self):
        with pytest.raises(ValidationError, match="invalid host alias"):
            GovernorConfig(host_overrides={"-not-an-alias": "allow"})

    @pytest.mark.parametrize(
        ("hosts", "governor", "default_host", "message"),
        [
            ({"-bad": _host()}, GovernorConfig(), "", "invalid tools.hosts alias"),
            (
                {"build": _host(trust_mode="pinned", host_keys=[])},
                GovernorConfig(),
                "",
                "requires public host_keys",
            ),
            (
                {"build": _host()},
                GovernorConfig(host_overrides={"missing": "allow"}),
                "",
                "names unknown host",
            ),
            ({"build": _host()}, GovernorConfig(), "missing", "must name a configured host"),
        ],
    )
    def test_config_rejects_incoherent_host_inventory(self, hosts, governor, default_host, message):
        with pytest.raises(ValidationError, match=message):
            _config(hosts=hosts, governor=governor, default_host=default_host)

    def test_unknown_config_key_warning_handles_a_field_alias(self, monkeypatch):
        warning = Mock()
        logger = SimpleNamespace(warning=warning)
        monkeypatch.setattr(
            schema,
            "Config",
            SimpleNamespace(
                model_fields={
                    "discord": SimpleNamespace(alias="discord_config"),
                }
            ),
        )
        monkeypatch.setattr("src.odin_log.get_logger", lambda _name: logger)

        schema._warn_unknown_config_keys({"discord_config": {}})

        warning.assert_not_called()


class _Trace:
    def __init__(self):
        self.calls = []

    def section(self, name, **kwargs):
        self.calls.append((name, kwargs))


def _builder(
    *,
    hosts=None,
    registry=None,
    access=None,
    skills=None,
    memory=None,
    reflector=None,
    breaker=None,
):
    host_map = hosts if hosts is not None else {}
    config = _config(hosts=host_map)
    executor = SimpleNamespace(_load_memory_for_user=Mock(return_value=memory or {}))
    return PromptBuilder(
        get_config=lambda: config,
        context_loader=SimpleNamespace(context="context"),
        reflector=reflector,
        skill_manager=skills,
        tool_executor=executor,
        channel_state=SimpleNamespace(recent_entries=Mock(return_value=[])),
        get_codex_client=lambda: (
            SimpleNamespace(breaker=SimpleNamespace(state=breaker)) if breaker else None
        ),
        host_registry=registry,
        host_access_manager=access,
    )


class TestPromptBuilderRatchet:
    def test_legacy_hosts_are_rendered_and_cached(self):
        builder = _builder(hosts={"build": _host(description="build host")})

        assert builder.cached_hosts_map() == {"build": "deploy@example.invalid — build host"}
        assert builder.cached_hosts_map() == {"build": "deploy@example.invalid — build host"}

    def test_registry_hosts_are_scoped_and_skip_disappeared_alias(self):
        allowed = Mock(return_value=["allowed", "gone"])
        access = SimpleNamespace(get_allowed_hosts=allowed)
        registry = SimpleNamespace(
            generation=7,
            get=lambda alias: (
                SimpleNamespace(
                    ssh_user="deploy",
                    address="example.invalid",
                    description="first\nsecond",
                )
                if alias == "allowed"
                else None
            ),
            active_aliases=Mock(return_value=["not-used"]),
        )
        builder = _builder(registry=registry, access=access)

        assert builder.cached_hosts_map("user-1") == {
            "allowed": "deploy@example.invalid — first second"
        }
        allowed.assert_called_once_with("user-1")
        registry.active_aliases.assert_not_called()

    def test_registry_uses_active_aliases_without_requester_policy(self):
        registry = SimpleNamespace(
            generation=3,
            get=lambda _alias: _host(),
            active_aliases=Mock(return_value=("build",)),
        )
        assert _builder(registry=registry).cached_hosts_map() == {"build": "deploy@example.invalid"}
        registry.active_aliases.assert_called_once_with()

    def test_skills_none_and_populated_results_are_cached(self):
        assert _builder(skills=None).cached_skills_list_text() == ""

        skills = SimpleNamespace(
            list_skills=Mock(
                return_value=[
                    {
                        "name": "deploy",
                        "description": "Release safely",
                    }
                ]
            )
        )
        builder = _builder(skills=skills)
        assert builder.cached_skills_list_text() == "- `deploy`: Release safely"
        assert builder.cached_skills_list_text() == "- `deploy`: Release safely"
        skills.list_skills.assert_called_once_with()

    def test_reflector_none_and_invalidation_are_safe(self):
        assert _builder(reflector=None).reflector_section("u") == ""

        reflector = SimpleNamespace(invalidate_cache=Mock())
        builder = _builder(reflector=reflector)
        builder.cached_hosts[(1, ())] = {}
        builder.cached_skills_text = "cached"
        builder.memory_cache[None] = (0, {})
        builder.invalidate()
        assert builder.cached_hosts == {}
        assert builder.cached_skills_text is None
        assert builder.memory_cache == {}
        reflector.invalidate_cache.assert_called_once_with()

    @pytest.mark.parametrize(
        ("breaker", "expected"),
        [
            ("open", "circuit breaker is OPEN"),
            ("half_open", "circuit breaker is recovering"),
        ],
    )
    def test_full_prompt_includes_dynamic_sections_and_trace(self, breaker, expected):
        reflector = SimpleNamespace(get_prompt_section=Mock(return_value="## Learned\nUseful"))
        builder = _builder(memory={"fact": "remembered"}, reflector=reflector, breaker=breaker)
        trace = _Trace()

        prompt = builder.build_full_prompt(user_id="u", query="question", trace=trace)

        assert "## Persistent Memory\n- **fact**: remembered" in prompt
        assert "## Learned\nUseful" in prompt
        assert expected in prompt
        assert {name for name, _kwargs in trace.calls} >= {
            "base",
            "persistent_memory",
            "health_warnings",
        }
        reflector.get_prompt_section.assert_called_once_with(
            user_id="u", query="question", trace=trace
        )

    def test_chat_prompt_includes_memory_and_learned_context(self):
        reflector = SimpleNamespace(get_prompt_section=Mock(return_value="## Learned\nChat fact"))
        prompt = _builder(memory={"preference": "brief"}, reflector=reflector).build_chat_prompt(
            user_id="u", query="hello"
        )

        assert "## Persistent Memory\n- **preference**: brief" in prompt
        assert "## Learned\nChat fact" in prompt
        reflector.get_prompt_section.assert_called_once_with(user_id="u", query="hello", trace=None)
