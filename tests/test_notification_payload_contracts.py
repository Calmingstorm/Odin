"""Exercise final delivery seams, not just notification formatters."""

import json
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.notifications.outbound_webhooks import (
    MAX_PAYLOAD_CHARS,
    DeliveryResult,
    OutboundWebhookDispatcher,
    WebhookTarget,
)
from src.notifications.slack import SlackNotifier


@pytest.mark.parametrize(
    "field", ["password", "Authorization", "api_key", "refresh_token", "accessToken"],
)
async def test_final_secret_key_values_scrubbed_on_both_transports(monkeypatch, field):
    monkeypatch.setattr("src.tools.url_safety.is_url_blocked", lambda _: False)
    payload = {"metadata": [{field: "shortvalue", "ordinary": "keep me", "input_tokens": 123}]}
    dispatcher = OutboundWebhookDispatcher()
    dispatcher.register(name="test", url="https://example.com")
    deliver = AsyncMock(return_value=DeliveryResult("test", "test", "alert", success=True))
    monkeypatch.setattr(OutboundWebhookDispatcher, "_deliver_one", deliver)
    await dispatcher.dispatch("alert", payload)
    webhook = json.loads(deliver.call_args.args[1])
    assert webhook["data"]["metadata"][0][field] == "[REDACTED]"
    assert webhook["data"]["metadata"][0]["ordinary"] == "keep me"
    assert webhook["data"]["metadata"][0]["input_tokens"] == 123

    notifier = SlackNotifier(default_webhook_url="https://example.com")
    session = MagicMock()
    session.post.return_value.__aenter__ = AsyncMock(return_value=MagicMock(status=200))
    monkeypatch.setattr(notifier, "_get_session", AsyncMock(return_value=session))
    assert await notifier.send("hello", payload=payload)
    slack = session.post.call_args.kwargs["json"]
    assert slack["metadata"][0][field] == "[REDACTED]"
    assert slack["metadata"][0]["ordinary"] == "keep me"
    assert slack["metadata"][0]["input_tokens"] == 123
    assert payload["metadata"][0][field] == "shortvalue"


@pytest.mark.parametrize("events", [["bogus"], ["alert", "bogus"], "alert", [1]])
def test_invalid_stored_target_diagnosed(events):
    with pytest.raises(ValueError, match="event filter"):
        WebhookTarget(id="test", name="test", url="https://example.com", events=events)


def test_explicit_all():
    target = WebhookTarget(id="test", name="test", url="https://example.com", events=["all"])
    assert target.accepts_event("alert")
    assert target.to_dict()["events"] == ["all"]


def test_mixed_all_rejected_before_update_publication(monkeypatch):
    monkeypatch.setattr("src.tools.url_safety.is_url_blocked", lambda _: False)
    dispatcher = OutboundWebhookDispatcher()
    with pytest.raises(ValueError, match="used alone"):
        dispatcher.register(name="bad", url="https://example.com", events=["all", "alert"])
    assert dispatcher.list_webhooks() == []
    target = dispatcher.register(name="good", url="https://example.com", events=["alert"])
    with pytest.raises(ValueError, match="used alone"):
        dispatcher.update(target.id, name="rejected", events=["all", "alert"])
    assert target.name == "good"
    assert target.events == ["alert"]


def test_omission_metadata_never_silently_exceeds_budget(monkeypatch):
    from src.notifications.outbound_webhooks import _truncate_payload

    monkeypatch.setattr("src.notifications.outbound_webhooks.MAX_PAYLOAD_CHARS", 2)
    with pytest.raises(ValueError, match="cannot hold omission metadata"):
        _truncate_payload(json.dumps({"text": "long"}))


async def test_webhook_final_json_scrub_and_bounded_omissions(monkeypatch):
    monkeypatch.setattr("src.tools.url_safety.is_url_blocked", lambda _: False)
    monkeypatch.setattr(
        "src.notifications.outbound_webhooks.scrub_output_secrets",
        lambda text: text.replace("SYNTHETIC", '["removed"]'),
    )
    dispatcher = OutboundWebhookDispatcher()
    dispatcher.register(name="test", url="https://example.com")
    deliver = AsyncMock(return_value=DeliveryResult("test", "test", "alert", success=True))
    monkeypatch.setattr(OutboundWebhookDispatcher, "_deliver_one", deliver)
    await dispatcher.dispatch("alert", {"nested": [{"text": "SYNTHETIC"}]}, source="SYNTHETIC")
    body = deliver.call_args.args[1]
    assert "SYNTHETIC" not in body.decode()
    assert json.loads(body)["data"]["nested"][0]["text"] == '["removed"]'
    dispatcher._last_sent.clear()
    await dispatcher.dispatch("alert", {"nested": ["\u2603" * MAX_PAYLOAD_CHARS]})
    body = deliver.call_args.args[1]
    assert len(body) <= MAX_PAYLOAD_CHARS
    assert json.loads(body)["_omission"]["fields"] >= 1


async def test_slack_final_metadata_and_nested_scrub(monkeypatch):
    monkeypatch.setattr(
        "src.notifications.slack.scrub_output_secrets",
        lambda text: text.replace("SYNTHETIC", "removed"),
    )
    notifier = SlackNotifier(default_webhook_url="https://example.com")
    session = MagicMock()
    session.post.return_value.__aenter__ = AsyncMock(return_value=MagicMock(status=200))
    monkeypatch.setattr(notifier, "_get_session", AsyncMock(return_value=session))
    assert await notifier.send_formatted("title", "message", source="SYNTHETIC")
    assert "SYNTHETIC" not in json.dumps(session.post.call_args.kwargs["json"])
    notifier._last_sent.clear()
    payload = {"attachments": [{"fields": [{"value": "SYNTHETIC"}]}]}
    assert await notifier.send("hello", payload=payload)
    assert "SYNTHETIC" not in json.dumps(session.post.call_args.kwargs["json"])
    assert payload["attachments"][0]["fields"][0]["value"] == "SYNTHETIC"
