import asyncio
import json

import pytest
import yaml

from src.config.image_defaults import IMAGE_MODEL_DEFAULTS, read_image_model_metadata
from src.config.migrations import (
    MigrationCompletionError,
    apply_image_defaults_migration,
    image_defaults_marker_path,
)
from src.config.persistence import (
    ConfigPersistError,
    config_transaction,
    patch_config_paths,
    persist_config_paths_locked,
)
from src.config.schema import Config


def migrate(path):
    raw = path.read_text()
    data = yaml.safe_load(raw)
    apply_image_defaults_migration(data, path, raw)
    return data


@pytest.mark.parametrize("image", [None, "gpt-image-2", "custom", "${MODEL}"])
@pytest.mark.parametrize("outer", [None, "gpt-5.5", "custom", "${OUTER}"])
def test_independent_byte_preserving_matrix(tmp_path, image, outer):
    path = tmp_path / "config.yml"
    text = '# heading\nimage:\n  openai:\n    quality: high # untouched\n'
    if image is not None:
        text += f'    image_model: "{image}" # image\n'
    if outer is not None:
        text += f"    outer_model: '{outer}' # outer\n"
    text += 'extra: &x {abc: "${UNCHANGED}"}\nother: *x\n'
    path.write_text(text)
    data = migrate(path)
    expected = text.replace('"gpt-image-2"', '"gpt-image-2.5-flare"')
    expected = expected.replace("'gpt-5.5'", "'gpt-6-astra'")
    assert path.read_text() == expected
    assert data == yaml.safe_load(expected)
    migrate(path)
    assert path.read_text() == expected


def test_later_operator_pin_and_alias_identity(tmp_path):
    path = tmp_path / 'config.yml'
    original = 'image: {openai: {image_model: gpt-image-2}}\n'
    path.write_text(original)
    migrate(path)
    path.write_text(original)
    alias = tmp_path / 'alias.yml'
    alias.symlink_to(path)
    migrate(alias)
    assert path.read_text() == original
    assert alias.is_symlink()


@pytest.mark.parametrize('text', [
    'image: &x {openai: {image_model: gpt-image-2}}\nother: *x\n',
    'image: {openai: {image_model: &x gpt-image-2}}\nother: *x\n',
])
def test_shared_anchor_refusal(tmp_path, text):
    path = tmp_path / 'config.yml'
    path.write_text(text)
    with pytest.raises(MigrationCompletionError):
        migrate(path)
    assert path.read_text() == text
    assert not image_defaults_marker_path(path).exists()


def test_generic_roundtrip_and_explicit_intent(tmp_path):
    path = tmp_path / 'config.yml'
    original = 'image: {openai: {quality: high}} # keep\n'
    path.write_text(original)
    changes = [(('image', 'openai', leaf), value) for leaf, value in IMAGE_MODEL_DEFAULTS.items()]
    patch_config_paths(changes, path=path)
    assert path.read_text() == original
    patch_config_paths(changes, path=path, image_model_intent={'image_model': 'pin'})
    raw = yaml.safe_load(path.read_text())
    assert raw['image']['openai']['image_model'] == IMAGE_MODEL_DEFAULTS['image_model']
    assert 'outer_model' not in raw['image']['openai']
    patch_config_paths([], path=path, image_model_intent={'image_model': 'follow'})
    assert 'image_model' not in yaml.safe_load(path.read_text())['image']['openai']


def test_env_pin_metadata_and_flatten_only_explicit(tmp_path, monkeypatch):
    path = tmp_path / 'config.yml'
    text = 'image: {openai: {image_model: "${MODEL}"}}\n'
    path.write_text(text)
    monkeypatch.setenv('MODEL', IMAGE_MODEL_DEFAULTS['image_model'])
    config = Config(discord={'token': 'test'})
    meta = read_image_model_metadata(path, config)
    assert meta['image_model']['status'] == 'pin'
    assert meta['outer_model']['status'] == 'follow'
    changes = [(('image', 'openai', 'image_model'), config.image.openai.image_model)]
    patch_config_paths(changes, path=path)
    assert path.read_text() == text
    patch_config_paths(changes, path=path, image_model_intent={'image_model': 'pin'})
    assert '${MODEL}' not in path.read_text()


def test_prepared_failure_fences_retry(tmp_path, monkeypatch):
    from src.config import persistence
    path = tmp_path / 'config.yml'
    text = 'image: {openai: {image_model: gpt-image-2}}\n'
    path.write_text(text)
    def fail(*a, **kw):
        raise OSError('disk')
    monkeypatch.setattr(persistence, '_dump_atomic', fail)
    with pytest.raises(MigrationCompletionError):
        migrate(path)
    assert path.read_text() == text
    assert json.loads(image_defaults_marker_path(path).read_text())['state'] == 'prepared'
    with pytest.raises(MigrationCompletionError, match='interrupted'):
        migrate(path)


def test_persistence_settlement(tmp_path):
    path = tmp_path / 'config.yml'
    path.write_text('image: {openai: {image_model: custom}}\n')
    async def run():
        async with config_transaction():
            result = await persist_config_paths_locked(
                [], path=path, image_model_intent={'image_model': 'follow'},
            )
        assert result == (None, False)
    asyncio.run(run())
    assert 'image_model' not in path.read_text()


def test_invalid_intent_no_mutation(tmp_path):
    path = tmp_path / 'config.yml'
    path.write_text('image: {}\n')
    with pytest.raises(ConfigPersistError):
        patch_config_paths([], path=path, image_model_intent={'oops': 'follow'})
    assert path.read_text() == 'image: {}\n'


def test_concurrent_loader_snapshot(tmp_path):
    path = tmp_path / 'config.yml'
    raw = 'image: {openai: {image_model: gpt-image-2}}\n'
    path.write_text(raw)
    stale = yaml.safe_load(raw)
    migrate(path)
    apply_image_defaults_migration(stale, path, raw)
    assert stale['image']['openai']['image_model'] == IMAGE_MODEL_DEFAULTS['image_model']


@pytest.mark.parametrize('value', [
    '!!str gpt-image-2', '"gpt-image-\\x32"', '>-\n      gpt-image-2\n',
])
def test_special_string_spellings(tmp_path, value):
    path = tmp_path / 'config.yml'
    path.write_text(f'image:\n  openai:\n    image_model: {value}\n')
    migrate(path)
    actual = yaml.safe_load(path.read_text())['image']['openai']['image_model']
    assert actual == IMAGE_MODEL_DEFAULTS['image_model']


def test_loader_new_defaults_and_later_old_pin(tmp_path):
    from src.config.schema import load_config
    path = tmp_path / 'config.yml'
    text = 'discord: {token: test}\nimage: {openai: {image_model: gpt-image-2}}\n'
    path.write_text(text)
    assert load_config(path).image.openai.image_model == IMAGE_MODEL_DEFAULTS['image_model']
    path.write_text(text)
    assert load_config(path).image.openai.image_model == 'gpt-image-2'


def test_completion_failure_recovers_postimage(tmp_path, monkeypatch):
    from src.config import migrations
    path = tmp_path / 'config.yml'
    path.write_text('image: {openai: {image_model: gpt-image-2}}\n')
    real = migrations._atomic_write_marker
    def fail_completed(marker, record):
        if record['state'] == 'completed':
            raise OSError('disk')
        real(marker, record)
    monkeypatch.setattr(migrations, '_atomic_write_marker', fail_completed)
    with pytest.raises(MigrationCompletionError):
        migrate(path)
    assert 'gpt-image-2.5-flare' in path.read_text()
    monkeypatch.setattr(migrations, '_atomic_write_marker', real)
    migrate(path)
    assert json.loads(image_defaults_marker_path(path).read_text())['state'] == 'completed'
