"""Reject shared-XTEST release claims for private devices without native queries."""

from unittest.mock import Mock

import pytest

from src.computer.runtime.x11_owned_device import ExistingXTest


@pytest.mark.parametrize("independent,prefix", [
    (True, "Virtual core"),
    (False, "private-session"),
    (True, "private-session"),
])
def test_shared_release_proof_refuses_nonshared_endpoints_before_query(independent, prefix):
    # Bypass native construction entirely; only the eligibility predicate runs.
    device = object.__new__(ExistingXTest)
    device.independent_pointer = independent
    device.prefix = prefix
    device.held = Mock(side_effect=AssertionError("private endpoints must not be queried"))
    assert device.shared_release_all_up() is False
    device.held.assert_not_called()
