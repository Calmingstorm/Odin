"""Direct edge coverage for API security snapshot compatibility helpers."""

from types import SimpleNamespace

from src.web.api.security import _auth_snapshot, _dynamic_auth_required


def test_auth_snapshot_supports_none_legacy_and_classmethod_manager():
    assert _auth_snapshot(None) is None
    legacy = SimpleNamespace()
    assert _auth_snapshot(legacy) is legacy

    class Manager:
        def auth_snapshot(self):
            return "snapshot"

    assert _auth_snapshot(Manager()) == "snapshot"


def test_dynamic_auth_required_supports_snapshot_shapes():
    assert _dynamic_auth_required(None) is False
    assert _dynamic_auth_required(SimpleNamespace(dynamic_auth_required=True)) is True
    assert _dynamic_auth_required(SimpleNamespace(dynamic_auth_required=False)) is False
    assert _dynamic_auth_required(
        SimpleNamespace(
            dynamic_auth_required=None,
            credential_inventory=SimpleNamespace(has_usable_auth=True),
        )
    ) is True
    assert _dynamic_auth_required(
        SimpleNamespace(
            dynamic_auth_required=None,
            credential_inventory=SimpleNamespace(has_usable_auth=False),
        )
    ) is False

    class TokenSnapshot:
        dynamic_auth_required = None
        credential_inventory = None

        def list_tokens(self):
            return ["token"]

    assert _dynamic_auth_required(TokenSnapshot()) is True
    TokenSnapshot.list_tokens = lambda self: []
    assert _dynamic_auth_required(TokenSnapshot()) is False
    assert _dynamic_auth_required(SimpleNamespace()) is False
