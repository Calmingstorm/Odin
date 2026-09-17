"""Legacy authentication adapters retain fail-closed credential inventory semantics."""
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from src.web.api.security import _auth_snapshot, _dynamic_auth_required


@pytest.mark.parametrize("usable", [True, False])
def test_legacy_inventory_is_used_without_calling_token_listing(usable):
    listing = Mock(side_effect=AssertionError("inventory must be authoritative"))
    manager = SimpleNamespace(
        credential_inventory=SimpleNamespace(has_usable_auth=usable), list_tokens=listing,
    )
    assert _auth_snapshot(manager) is manager
    assert _dynamic_auth_required(manager) is usable
    listing.assert_not_called()


@pytest.mark.parametrize("tokens", [[], [{"user_id": "fixture"}]])
def test_legacy_list_only_adapter_preserves_auth_requirement(tokens):
    listing = Mock(return_value=tokens)
    manager = SimpleNamespace(list_tokens=listing)
    assert _dynamic_auth_required(_auth_snapshot(manager)) is bool(tokens)
    listing.assert_called_once_with()


def test_absent_or_unusable_legacy_inventory_does_not_invent_credentials():
    assert _auth_snapshot(None) is None
    assert not _dynamic_auth_required(None)
    assert not _dynamic_auth_required(SimpleNamespace(list_tokens="not callable"))
