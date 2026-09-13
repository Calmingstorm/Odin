"""Matrix coverage for the pure D3 bootstrap bind policy."""

from __future__ import annotations

import pytest

from src.web.bootstrap_policy import (
    BindReason,
    CredentialInventory,
    decide_bind,
    may_remove_last_credential,
    numeric_loopback,
)


@pytest.mark.parametrize(
    ("configured", "effective"),
    [
        ("0.0.0.0", "127.0.0.1"),
        ("192.168.1.10", "127.0.0.1"),
        ("::", "::1"),
        ("2001:db8::10", "::1"),
        ("localhost", "127.0.0.1"),
        ("example.test", "127.0.0.1"),
    ],
)
def test_no_usable_auth_always_selects_numeric_loopback(configured: str, effective: str) -> None:
    decision = decide_bind(
        configured_host=configured,
        credentials=CredentialInventory(),
        persisted_restriction=False,
        explicit_widening=True,
    )

    assert decision.configured_host == configured
    assert decision.effective_host == effective
    assert decision.reason is BindReason.NO_USABLE_AUTH
    assert numeric_loopback(decision.effective_host)


def test_dynamic_only_valid_auth_preserves_existing_unrestricted_configured_bind() -> None:
    decision = decide_bind(
        configured_host="2001:db8::5",
        credentials=CredentialInventory(dynamic_usable=1),
        persisted_restriction=False,
        explicit_widening=False,
    )

    assert decision.effective_host == "2001:db8::5"
    assert decision.reason is BindReason.CONFIGURED


def test_static_auth_preserves_wildcard_for_existing_unrestricted_install() -> None:
    decision = decide_bind(
        configured_host="0.0.0.0",
        credentials=CredentialInventory(static_usable=2),
        persisted_restriction=False,
        explicit_widening=False,
    )

    assert decision.effective_host == "0.0.0.0"
    assert decision.reason is BindReason.CONFIGURED


@pytest.mark.parametrize("configured", ["127.0.0.1", "127.0.0.2", "::1"])
def test_no_auth_preserves_an_already_numeric_loopback_listener(configured: str) -> None:
    decision = decide_bind(
        configured_host=configured,
        credentials=CredentialInventory(),
        persisted_restriction=False,
        explicit_widening=False,
    )

    assert decision.effective_host == configured
    assert decision.reason is BindReason.NO_USABLE_AUTH


def test_auth_added_does_not_widen_a_persisted_restriction_without_consent() -> None:
    decision = decide_bind(
        configured_host="0.0.0.0",
        credentials=CredentialInventory(static_usable=1),
        persisted_restriction=True,
        explicit_widening=False,
    )

    assert decision.effective_host == "127.0.0.1"
    assert decision.reason is BindReason.PERSISTED_RESTRICTION


def test_explicit_widening_with_auth_restores_configured_host() -> None:
    decision = decide_bind(
        configured_host="::",
        credentials=CredentialInventory(static_usable=1),
        persisted_restriction=True,
        explicit_widening=True,
    )

    assert decision.effective_host == "::"
    assert decision.reason is BindReason.CONFIGURED


@pytest.mark.parametrize("host", ["127.0.0.1", "::1"])
def test_last_credential_removal_allows_actual_numeric_loopback(host: str) -> None:
    assert may_remove_last_credential(
        credentials_after_removal=CredentialInventory(), actual_listener_host=host
    )


@pytest.mark.parametrize("host", ["0.0.0.0", "::", "192.168.1.10", "localhost", "example.test"])
def test_last_credential_removal_rejects_broad_or_unverifiable_actual_listener(host: str) -> None:
    assert not may_remove_last_credential(
        credentials_after_removal=CredentialInventory(), actual_listener_host=host
    )


def test_last_credential_removal_is_safe_when_another_dynamic_credential_remains() -> None:
    assert may_remove_last_credential(
        credentials_after_removal=CredentialInventory(dynamic_usable=1),
        actual_listener_host="0.0.0.0",
    )


@pytest.mark.parametrize("value", [-1, True, 1.5])
def test_inventory_rejects_invalid_nonsecret_counts(value: object) -> None:
    with pytest.raises(ValueError):
        CredentialInventory(dynamic_usable=value)  # type: ignore[arg-type]


@pytest.mark.parametrize("host", ["localhost", "[::1]", "::", "0.0.0.0", "not-an-ip"])
def test_only_unbracketed_numeric_loopback_is_considered_safe(host: str) -> None:
    assert not numeric_loopback(host)


@pytest.mark.parametrize("host", ["", " 127.0.0.1", "127.0.0.1 ", "127.0.0.1\n", "bad\ud800host"])
def test_configured_host_rejects_ambiguous_or_non_utf8_input(host: str) -> None:
    with pytest.raises(ValueError, match="configured_host"):
        decide_bind(
            configured_host=host,
            credentials=CredentialInventory(),
            persisted_restriction=False,
            explicit_widening=False,
        )


def test_ipv4_mapped_ipv6_is_conservatively_narrowed() -> None:
    decision = decide_bind(
        configured_host="::ffff:127.0.0.1",
        credentials=CredentialInventory(),
        persisted_restriction=False,
        explicit_widening=False,
    )

    assert decision.effective_host == "::1"
