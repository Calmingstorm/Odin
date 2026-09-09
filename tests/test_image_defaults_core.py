import asyncio
import json
import os
import stat

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


@pytest.mark.parametrize('record', ['null', '[]', '{}', '{', '', 'true'])
def test_corrupt_marker_fails_closed(tmp_path, record):
    path = tmp_path / 'config.yml'
    text = 'image: {openai: {image_model: gpt-image-2}}\n'
    path.write_text(text)
    marker = image_defaults_marker_path(path)
    marker.parent.mkdir(parents=True)
    marker.write_text(record)
    with pytest.raises(MigrationCompletionError):
        migrate(path)
    assert path.read_text() == text
    assert marker.read_text() == record


@pytest.mark.parametrize('completed', [False, True])
def test_entire_concurrent_revision_reconciled(tmp_path, monkeypatch, completed):
    path = tmp_path / 'config.yml'
    initial = 'image: {openai: {image_model: custom}}\nother: old\n'
    path.write_text(initial)
    if completed:
        migrate(path)
    stale = yaml.safe_load(initial)
    monkeypatch.setenv('MODEL', 'true')
    latest = 'image: {openai: {image_model: "${MODEL}"}}\nother: new\nadded: yes\n'
    path.write_text(latest)
    apply_image_defaults_migration(stale, path, initial)
    assert stale == yaml.safe_load(latest.replace('${MODEL}', 'true'))
    assert stale['image']['openai']['image_model'] == 'true'
    assert path.read_text() == latest


def test_loader_reconciles_save_between_migrations(tmp_path, monkeypatch):
    from src.config import migrations
    from src.config.schema import load_config
    path = tmp_path / 'config.yml'
    path.write_text('discord: {token: test}\nimage: {openai: {image_model: custom}}\n')
    def concurrent_save(*args):
        path.write_text('discord: {token: test}\nimage: {openai: {image_model: newer}}\n')
    monkeypatch.setattr(migrations, 'apply_legacy_ceiling_migration', concurrent_save)
    assert load_config(path).image.openai.image_model == 'newer'


def test_config_identity_aliases_and_distinct_files(tmp_path):
    paths = [tmp_path / 'one.yml', tmp_path / 'two.yml']
    raw = 'image: {openai: {image_model: gpt-image-2}}\n'
    for path in paths:
        path.write_text(raw)
    migrate(paths[0])
    paths[0].write_text(raw)
    for name in ['alias-one', 'alias-two']:
        directory = tmp_path / name
        directory.mkdir()
        alias = directory / 'config.yml'
        alias.symlink_to(paths[0])
        migrate(alias)
        assert alias.is_symlink()
        assert alias.read_text() == raw
    migrate(paths[1])
    assert paths[1].read_text() != raw


@pytest.mark.parametrize('text', [
    'defaults: &x {image_model: custom}\nimage: {openai: *x}\n',
    'defaults: &x {image_model: custom}\nimage: {openai: {<<: *x}}\n',
])
def test_metadata_inherited_pins(tmp_path, text):
    path = tmp_path / 'config.yml'
    path.write_text(text)
    meta = read_image_model_metadata(path, Config(discord={'token': 'test'}))
    assert meta['image_model']['status'] == 'pin'
    assert meta['outer_model']['status'] == 'follow'
    assert path.read_text() == text


def test_crlf_and_config_permissions(tmp_path):
    path = tmp_path / 'config.yml'
    raw = b'# keep\r\nimage: {openai: {image_model: gpt-image-2}}\r\n'
    path.write_bytes(raw)
    path.chmod(0o640)
    before = path.stat()
    migrate(path)
    assert path.read_bytes() == raw.replace(b'gpt-image-2', b'gpt-image-2.5-flare')
    after = path.stat()
    assert stat.S_IMODE(after.st_mode) == 0o640
    assert (after.st_uid, after.st_gid) == (before.st_uid, before.st_gid)


@pytest.mark.parametrize('hazard', [
    'directory-symlink', 'directory-mode', 'file-symlink', 'file-mode', 'hardlink', 'fifo',
])
def test_unsafe_lock_paths_refused(tmp_path, monkeypatch, hazard):
    from src.config import persistence
    from src.config.migrations import _config_identity
    monkeypatch.setattr(persistence.tempfile, 'gettempdir', lambda: str(tmp_path))
    path = tmp_path / 'config.yml'
    path.write_text('image: {}\n')
    directory = tmp_path / f'odin-config-locks-{os.geteuid()}'
    if hazard == 'directory-symlink':
        destination = tmp_path / 'destination'
        destination.mkdir(mode=0o700)
        directory.symlink_to(destination)
    else:
        directory.mkdir(mode=0o700)
    lock = directory / _config_identity(path)
    if hazard == 'directory-mode':
        directory.chmod(0o755)
    elif hazard == 'file-symlink':
        lock.symlink_to(path)
    elif hazard == 'file-mode':
        lock.touch(mode=0o644)
    elif hazard == 'hardlink':
        source = tmp_path / 'source'
        source.touch(mode=0o600)
        os.link(source, lock)
    elif hazard == 'fifo':
        os.mkfifo(lock, 0o600)
    with pytest.raises((ConfigPersistError, OSError)):
        patch_config_paths([(('image', 'enabled'), True)], path=path)
    assert path.read_text() == 'image: {}\n'


def test_lock_modes_and_alias_rendezvous(tmp_path, monkeypatch):
    from src.config import persistence
    from src.config.migrations import _config_identity
    monkeypatch.setattr(persistence.tempfile, 'gettempdir', lambda: str(tmp_path))
    path = tmp_path / 'config.yml'
    path.write_text('image: {}\n')
    alias = tmp_path / 'alias.yml'
    alias.symlink_to(path)
    patch_config_paths([(('image', 'enabled'), True)], path=alias)
    directory = tmp_path / f'odin-config-locks-{os.geteuid()}'
    assert stat.S_IMODE(directory.stat().st_mode) == 0o700
    files = list(directory.iterdir())
    assert [p.name for p in files] == [_config_identity(path)]
    assert stat.S_IMODE(files[0].stat().st_mode) == 0o600


@pytest.mark.parametrize('kind', ['directory', 'file'])
def test_foreign_lock_owner_refused(tmp_path, monkeypatch, kind):
    from src.config import persistence
    from src.config.migrations import _config_identity
    monkeypatch.setattr(persistence.tempfile, 'gettempdir', lambda: str(tmp_path))
    path = tmp_path / 'config.yml'
    path.write_text('image: {}\n')
    directory = tmp_path / f'odin-config-locks-{os.geteuid()}'
    directory.mkdir(mode=0o700)
    lock = directory / _config_identity(path)
    lock.touch(mode=0o600)
    original = persistence.os.fstat
    def foreign(fd):
        result = original(fd)
        if (kind == 'directory') == stat.S_ISDIR(result.st_mode):
            values = list(result)
            values[4] = result.st_uid + 1
            return os.stat_result(values)
        return result
    monkeypatch.setattr(persistence.os, 'fstat', foreign)
    with pytest.raises(ConfigPersistError, match='ownership'):
        patch_config_paths([(('image', 'enabled'), True)], path=path)


def test_concurrent_save_serializes_migration(tmp_path):
    import threading

    from src.config.persistence import _config_file_lock
    path = tmp_path / 'config.yml'
    raw = 'image: {openai: {image_model: gpt-image-2}}\nother: old\n'
    path.write_text(raw)
    data = yaml.safe_load(raw)
    started = threading.Event()
    finished = threading.Event()
    errors = []
    def loader():
        started.set()
        try:
            apply_image_defaults_migration(data, path, raw)
        except Exception as exc:
            errors.append(exc)
        finally:
            finished.set()
    with _config_file_lock(path):
        thread = threading.Thread(target=loader)
        thread.start()
        assert started.wait(2)
        assert not finished.wait(0.05)
        path.write_text('image: {openai: {image_model: operator}}\nother: new\n')
    thread.join(3)
    assert finished.is_set()
    assert not errors
    assert data == yaml.safe_load(path.read_text())
    assert data['other'] == 'new'


def test_reconcile_rejects_nonmapping(tmp_path):
    path = tmp_path / 'config.yml'
    initial = 'image: {}\n'
    path.write_text(initial)
    migrate(path)
    path.write_text('[]\n')
    with pytest.raises(MigrationCompletionError, match='mapping'):
        apply_image_defaults_migration({}, path, initial)


def test_pin_requires_value_and_follow_overrides_value(tmp_path):
    path = tmp_path / 'config.yml'
    path.write_text('image: {}\n')
    with pytest.raises(ConfigPersistError, match='explicit'):
        patch_config_paths([], path=path, image_model_intent={'image_model': 'pin'})
    patch_config_paths(
        [(('image', 'openai', 'image_model'), 'custom')], path=path,
        image_model_intent={'image_model': 'follow'},
    )
    assert 'image_model' not in path.read_text()


def test_cancelled_pin_settles_before_return(tmp_path, monkeypatch):
    import threading

    from src.config import persistence
    path = tmp_path / 'config.yml'
    path.write_text('image: {}\n')
    entered = threading.Event()
    release = threading.Event()
    original = persistence.patch_config_paths
    def delayed(*args, **kwargs):
        entered.set()
        assert release.wait(3)
        return original(*args, **kwargs)
    monkeypatch.setattr(persistence, 'patch_config_paths', delayed)
    async def run():
        task = asyncio.create_task(persist_config_paths_locked(
            [(('image', 'openai', 'image_model'), 'operator')], path=path,
            image_model_intent={'image_model': 'pin'},
        ))
        await asyncio.to_thread(entered.wait, 2)
        task.cancel()
        release.set()
        assert await task == (None, True)
    asyncio.run(run())
    assert yaml.safe_load(path.read_text())['image']['openai']['image_model'] == 'operator'
