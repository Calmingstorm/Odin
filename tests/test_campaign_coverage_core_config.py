"""Exercise config upgrades and partial writes against isolated real stores."""
import sys
from pathlib import Path

import pytest
import yaml
from pydantic import BaseModel, Field

from src.config import migrations, package_migrations, persistence
from src.config import schema as schema_module
from src.config.initialization import InitializationMode, InitializationRecoveryRequiredError
from src.config.schema import Config, LLMProviderConfig, PersonalityConfig, PersonalityPreset
from src.config.startup_context import provision_initialization_parent, resolve_startup_context


@pytest.mark.parametrize("legacy,expected", [(-5, 10), (9000, 3600)])
def test_legacy_timeout_bounds_are_persisted_without_losing_other_fields(
    tmp_path, legacy, expected
):
    path = tmp_path / "config.yml"
    raw = f"openai_compatible:\n  timeout: {legacy}\n  model: custom # retained\n"
    path.write_text(raw)
    migrations.apply_compatible_timeout_migration(yaml.safe_load(raw), path, raw)
    assert yaml.safe_load(path.read_text())["openai_compatible"] == {
        "model": "custom", "request_timeout_seconds": 3600,
        "stream_stall_timeout_seconds": expected,
    }
    assert "# retained" in path.read_text()


@pytest.mark.parametrize("errno", [13, 30])
def test_image_upgrade_readonly_marker_uses_runtime_defaults_without_config_write(
    tmp_path, monkeypatch, caplog, errno
):
    path = tmp_path / "config.yml"
    raw = "image: {openai: {image_model: gpt-image-2, outer_model: gpt-5.5}}\n"
    path.write_text(raw)
    data = yaml.safe_load(raw)

    def unavailable_marker(*args, **kwargs):
        raise OSError(errno, "isolated marker storage unavailable")

    monkeypatch.setattr(migrations, "_atomic_write_marker", unavailable_marker)
    migrations.apply_image_defaults_migration(data, path, raw)
    assert data["image"]["openai"] == {
        "image_model": "gpt-image-2.5-flare", "outer_model": "gpt-6-astra",
    }
    assert path.read_text() == raw
    assert not migrations.image_defaults_marker_path(path).exists()
    assert "using runtime defaults" in caplog.text


def test_root_config_rejects_nonconcrete_preconstructed_provider():
    # Pydantic accepts existing nested model instances without revalidation.
    # The root guard must still reject a caller's subsequently mutated selector.
    provider = LLMProviderConfig(model="gpt-6-luna")
    provider.model = ""
    with pytest.raises(ValueError, match="main model must select a concrete"):
        Config(discord={"token": "fixture"}, llm_provider=provider)


def test_personality_model_entries_and_tombstones_keep_leaf_scope(tmp_path):
    preset = PersonalityPreset(name="Replacement", description="New", content="New text")
    cfg = PersonalityConfig(user_presets={"new": preset})
    submitted = {"user_presets": {"new": preset, "old": {"$delete": True}}}
    leaves = persistence.submitted_leaves(submitted, cfg.model_dump(), PersonalityConfig)
    assert leaves == [
        (("user_presets", "new"), preset.model_dump()),
        (("user_presets", "old"), persistence.DELETE_CONFIG_PATH),
    ]
    path = tmp_path / "config.yml"
    path.write_text("user_presets: {old: {content: old}, other: {content: '${KEEP}'}}\n")
    persistence.patch_config_paths(leaves, path=path)
    document = yaml.safe_load(path.read_text())
    assert document["user_presets"]["new"] == preset.model_dump()
    assert "old" not in document["user_presets"]
    assert document["user_presets"]["other"] == {"content": "${KEEP}"}


def test_generic_nested_mapping_patch_does_not_copy_unsubmitted_siblings(tmp_path):
    class MappingConfig(BaseModel):
        entries: dict[str, dict[str, dict[str, int]]]

    validated = MappingConfig(entries={"a": {"nested": {"port": 12, "keep": 7}}})
    leaves = persistence.submitted_leaves(
        {"entries": {"a": {"nested": {"port": "12"}}}},
        validated.model_dump(), MappingConfig,
    )
    assert leaves == [(("entries", "a", "nested", "port"), 12)]
    path = tmp_path / "config.yml"
    path.write_text("entries: {a: {nested: {port: 1, keep: '${KEEP}'}}}\n")
    persistence.patch_config_paths(leaves, path=path)
    assert yaml.safe_load(path.read_text()) == {
        "entries": {"a": {"nested": {"port": 12, "keep": "${KEEP}"}}},
    }


def test_mapping_tombstone_cannot_delete_missing_or_scalar_parent():
    current = {"user_presets": None, "name": "operator"}
    persistence.remove_submitted_mapping_entries(
        current, {"user_presets": {"old": {"$delete": True}}}, PersonalityConfig,
    )
    assert current == {"user_presets": None, "name": "operator"}


def test_unrequested_webhook_row_cannot_be_inserted_as_an_implicit_create(tmp_path):
    path = tmp_path / "config.yml"
    original = "outbound_webhooks: {targets: []}\n"
    path.write_text(original)
    with pytest.raises(persistence.ConfigPersistError, match="target changed on disk"):
        persistence.patch_webhook_targets(
            [{"id": "fixture", "url": "https://fixture.invalid"}],
            changed_fields={}, path=path,
        )
    assert path.read_text() == original


@pytest.mark.parametrize("raw", ["[]\n", "tools: false\n"])
def test_packaged_key_repair_preserves_nonmapping_config(tmp_path, raw):
    path, key, legacy = (tmp_path / name for name in ("config.yml", "key", "legacy"))
    path.write_text(raw)
    key.write_text("inert key fixture")
    assert not package_migrations.migrate_packaged_ssh_key(path, key, legacy)
    assert path.read_text() == raw


@pytest.mark.parametrize("pinned", [False, True])
def test_compose_relocation_refuses_corrupt_destination_or_pinned_state(
    tmp_path, monkeypatch, pinned
):
    configs = [tmp_path / name / "config.yml" for name in ("old", "new")]
    monkeypatch.delenv("ODIN_INITIALIZATION_STATE", raising=False)
    for config in configs:
        config.parent.mkdir()
        config.write_text("web: {}\n")
    state_path = str(tmp_path / "pinned/state.json") if pinned else None
    if pinned:
        monkeypatch.setenv("ODIN_INITIALIZATION_STATE", state_path)
    old = resolve_startup_context(configs[0], initialization_state=state_path)
    provision_initialization_parent(old.initialization_state_path)
    old.onboarding_store().provision_fresh()
    new = resolve_startup_context(configs[1], initialization_state=state_path)
    provision_initialization_parent(new.initialization_state_path)
    new.initialization_state_path.write_text("not a state record")
    new.initialization_state_path.chmod(0o600)
    before = new.initialization_state_path.read_bytes()
    with pytest.raises(InitializationRecoveryRequiredError):
        package_migrations.migrate_compose_initialization(*configs)
    assert new.initialization_state_path.read_bytes() == before
    assert new.onboarding_store().state().mode is InitializationMode.RECOVERY


def test_package_repair_cli_publishes_ssh_change_and_compose_state(
    tmp_path, monkeypatch, capsys
):
    monkeypatch.delenv("ODIN_INITIALIZATION_STATE", raising=False)
    path, key = tmp_path / "old/config.yml", tmp_path / "key"
    path.parent.mkdir()
    path.write_text("tools: {ssh_key_path: /app/.ssh/id_ed25519}\n")
    key.write_text("inert key fixture")
    # Redirect the default legacy identity existence check, not the writer.
    original_lexists = package_migrations.os.path.lexists
    monkeypatch.setattr(
        package_migrations.os.path, "lexists",
        lambda p: False if Path(p) == Path("/app/.ssh/id_ed25519") else original_lexists(p),
    )
    monkeypatch.setattr(sys, "argv", ["repair", str(path), str(key)])
    package_migrations.main()
    assert yaml.safe_load(path.read_text())["tools"]["ssh_key_path"] == str(key)
    assert "migrated the unused shipped SSH key" in capsys.readouterr().out
    original = path.read_bytes()
    package_migrations.main()
    assert path.read_bytes() == original
    assert capsys.readouterr().out == ""
    old = resolve_startup_context(path)
    provision_initialization_parent(old.initialization_state_path)
    old.onboarding_store().provision_fresh()
    target = tmp_path / "new/config.yml"
    target.parent.mkdir()
    target.write_bytes(original)
    monkeypatch.setattr(sys, "argv", ["repair", str(path), str(target), "--compose-initialization"])
    package_migrations.main()
    state = resolve_startup_context(target).onboarding_store().state()
    assert state.mode is InitializationMode.PENDING
    assert state.binding.config_path == target.resolve()
    assert state.loopback_restricted


@pytest.mark.parametrize("field,value", [
    ("description", "fixture\ncontrol"),
    ("host_id", "123456781234123412341234567890ab"),
    ("host_keys", ["ssh-ed25519 fixture\nextra"]),
])
def test_host_identity_rejects_control_or_noncanonical_material(field, value):
    with pytest.raises(ValueError):
        schema_module.ToolHost(address="fixture.invalid", **{field: value})


@pytest.mark.parametrize("field,value", [
    ("hyprland_runtime_dir", "relative/fixture"),
    ("hyprland_output_name", "fixture/output"),
    ("hyprland_compositor_sha256", "A" * 64),
    ("hyprland_compositor_commit", "invalid"),
    ("hyprland_compositor_version", "version with spaces"),
    ("wayland_bus_address", "tcp:host=fixture.invalid"),
    ("wayland_guardian_binary", "relative-executable"),
    ("storage_dir", "   "),
])
def test_computer_configuration_rejects_ambiguous_local_authority(field, value):
    with pytest.raises(ValueError):
        schema_module.ComputerUseConfig(**{field: value})


@pytest.mark.parametrize("legacy,effort", [("disabled", "none"), ("adaptive", "medium"),
                                          ("enabled", "high")])
def test_compatible_legacy_thinking_mode_adapts_without_overriding_explicit_effort(legacy, effort):
    assert schema_module.OpenAICompatibleConfig(thinking_mode=legacy).reasoning_effort == effort
    assert schema_module.OpenAICompatibleConfig(
        thinking_mode=legacy, reasoning_effort="low",
    ).reasoning_effort == "low"


def test_mcp_transport_validation_preserves_supported_lanes_only():
    for transport in ("stdio", "http"):
        assert schema_module.MCPServerConfig(transport=transport).transport == transport
    with pytest.raises(ValueError, match="Invalid transport"):
        schema_module.MCPServerConfig(transport="fixture-unknown")


def test_agent_fixed_axis_classifies_opaque_provider_model_without_rewriting():
    assert schema_module.agent_axis_mode("ollama:fixture-model") == "fixed"


def test_unknown_config_warning_recognizes_schema_aliases(monkeypatch, caplog):
    # Exercise the schema-aware warning with a real aliased Pydantic field,
    # rather than a dictionary pretending to be model metadata.
    class AliasedConfig(Config):
        fixture: str = Field(default="", alias="fixture_legacy")

    monkeypatch.setattr(schema_module, "Config", AliasedConfig)
    schema_module._warn_unknown_config_keys({"fixture_legacy": "operator", "typo_fixture": 1})
    assert "Ignoring unknown config key(s): typo_fixture" in caplog.text
    assert "Ignoring unknown config key(s): fixture_legacy" not in caplog.text
