"""F12 regressions: dynamic token stores are all-or-nothing auth state."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from src.permissions.token_manager import ApiTokenManager, _hash_token


def _entry(user_id: str = "owner", raw_token: str = "known-secret") -> dict[str, object]:
    return {
        "user_id": user_id,
        "username": "Owner",
        "token_hash": _hash_token(raw_token),
        "token_prefix": "known-se",
        "tier": "admin",
        "allowed_tools": [],
        "allowed_hosts": None,
        "default_host": "",
        "label": "",
    }


def _manager(tmp_path: Path, data: object) -> tuple[ApiTokenManager, Path]:
    path = tmp_path / "api_tokens.json"
    path.write_text(data if isinstance(data, str) else json.dumps(data))
    return ApiTokenManager(str(path)), path


@pytest.mark.parametrize(
    "data",
    [
        "{ malformed",
        '[{"user_id":"first","user_id":"second"}]',
        {"not": "a list"},
        ["not an object"],
        [{"user_id": "owner"}],
        [{**_entry(), "token_hash": "not-a-sha256"}],
        [{**_entry(), "tier": "wizard"}],
        [{**_entry(), "allowed_tools": ["safe", 7]}],
        [{**_entry(), "allowed_hosts": "localhost"}],
        [_entry(), {"user_id": "broken"}],
        [_entry(), _entry()],
        [_entry("one"), {**_entry("two"), "token_hash": _entry("one")["token_hash"]}],
    ],
)
def test_malformed_store_is_not_partially_resolved_or_counted(tmp_path: Path, data: object) -> None:
    """Every malformed record invalidates all dynamic credentials, not just itself."""
    manager, _path = _manager(tmp_path, data)

    assert manager.credential_store_status == "malformed"
    assert manager.credential_store_auth_required is True
    assert manager.dynamic_auth_required is False
    assert manager.credential_inventory.dynamic_usable == 0
    assert manager.resolve("known-secret") is None
    assert manager.get("owner") is None
    assert manager.list_tokens() == []


def test_runtime_corruption_invalidates_a_previously_valid_cache(tmp_path: Path) -> None:
    manager, path = _manager(tmp_path, [_entry()])
    assert manager.resolve("known-secret") is not None

    path.write_text("{ truncated")

    assert manager.resolve("known-secret") is None
    assert manager.credential_store_status == "malformed"
    assert manager.credential_store_auth_required is True
    assert manager.list_tokens() == []


def test_runtime_deletion_is_not_tokenless_bootstrap(tmp_path: Path) -> None:
    manager, path = _manager(tmp_path, [_entry()])
    path.unlink()
    assert manager.credential_store_auth_required is True
    assert manager.resolve("known-secret") is None


@pytest.mark.asyncio
async def test_bad_store_cannot_be_overwritten_by_a_credential_mutation(tmp_path: Path) -> None:
    manager, path = _manager(tmp_path, "{ truncated")

    with pytest.raises(RuntimeError, match="must be repaired"):
        await manager.create_token("new-owner")

    assert path.read_text() == "{ truncated"


def test_unchanged_store_uses_stat_signature_without_reloading_contents(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    manager, path = _manager(tmp_path, [_entry()])
    reads = 0
    original_read_text = Path.read_text

    def count_reads(candidate: Path, *args: object, **kwargs: object) -> str:
        nonlocal reads
        if candidate == path:
            reads += 1
        return original_read_text(candidate, *args, **kwargs)

    monkeypatch.setattr(Path, "read_text", count_reads)

    assert manager.resolve("known-secret") is not None
    assert manager.credential_store_status == "valid"
    assert manager.credential_inventory.dynamic_usable == 1
    assert manager.list_tokens()[0]["user_id"] == "owner"
    assert reads == 0

    path.write_text(json.dumps([_entry(), _entry("second", "other-secret")]))
    assert manager.resolve("other-secret") is not None
    assert reads == 1


def test_unreadable_store_requires_auth_without_secret_logging(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    manager, path = _manager(tmp_path, [_entry(raw_token="never-log-this")])

    def deny_read(_path: Path, *args: object, **kwargs: object) -> str:
        raise PermissionError("denied")

    monkeypatch.setattr(Path, "read_text", deny_read)
    path.write_text("changed")

    assert manager.resolve("never-log-this") is None
    assert manager.credential_store_status == "unreadable"
    assert manager.credential_store_auth_required is True
    assert "never-log-this" not in caplog.text
