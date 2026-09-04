"""The claims the config page makes about how settings apply.

Every entry in the registry is a claim about code. These tests do not check
that the claims are TRUE — only a reader with the consumer in front of them can
do that, and the CI gate forces a leaf to be classified rather than guessed.
What they do check is that no claim is malformed: a restart badge without a
reason, a live-apply badge naming no handler, or a gated field that never says
what activation means are all ways of sounding authoritative while telling the
operator nothing.
"""

from __future__ import annotations

import pytest

from src.config.apply_registry import (
    FIELDS,
    HEALTH_STATES,
    MIXED_SECTIONS,
    REDACTED,
    SECTIONS,
    ApplyMode,
    Consumer,
    FieldSpec,
    build_field_record,
    build_meta_payload,
    config_revision,
    flatten,
    has_explicit_spec,
    is_secret,
    spec_for,
)


#: Mirrors APPLY_MODE_LABELS in ui/js/pages/config.js. Read from the page
#: source rather than restated, so the two cannot drift apart quietly.
def _page_modes() -> set[str]:
    import re
    from pathlib import Path

    source = Path("ui/js/pages/config.js").read_text(encoding="utf-8")
    block = re.search(r"APPLY_MODE_LABELS\s*=\s*\{(.*?)\}", source, re.S)
    assert block, "APPLY_MODE_LABELS not found — the page contract moved"
    return set(re.findall(r"^\s*(\w+)\s*:", block.group(1), re.M))


def _page_health_states() -> tuple[str, ...]:
    import re
    from pathlib import Path

    source = Path("ui/js/config-health.js").read_text(encoding="utf-8")
    block = re.search(r"HEALTH_STATES\s*=\s*Object\.freeze\(\[(.*?)\]\)", source, re.S)
    assert block, "HEALTH_STATES not found — the page contract moved"
    return tuple(re.findall(r"['\"]([^'\"]+)['\"]", block.group(1)))


VOCABULARY = _page_modes()


class TestVocabulary:
    def test_the_registry_speaks_only_modes_the_page_renders(self):
        """The page maps any mode it does not know onto its Restart group, so
        an invented mode tells an operator that restarting activates something
        restarting cannot touch."""
        import typing

        assert set(typing.get_args(ApplyMode)) <= VOCABULARY, (
            f"modes the page cannot render: "
            f"{set(typing.get_args(ApplyMode)) - VOCABULARY}"
        )

    def test_dormant_and_activation_required_are_both_available(self):
        """They are different states — one is gated, the other is read by
        nothing — and collapsing them would send an operator hunting for a
        switch that does not exist."""
        import typing

        modes = set(typing.get_args(ApplyMode))
        assert {"dormant", "activation_required"} <= modes

    def test_every_section_uses_a_known_mode(self):
        for name, spec in SECTIONS.items():
            assert spec.apply_mode in VOCABULARY, name
            assert spec.description, f"{name} has no description"

    def test_every_field_uses_a_known_mode(self):
        for path, spec in FIELDS.items():
            if spec.apply_mode is not None:
                assert spec.apply_mode in VOCABULARY, path

    def test_every_consumer_uses_a_known_mode(self):
        for path, spec in FIELDS.items():
            for consumer in spec.consumers:
                assert consumer.apply_mode in VOCABULARY, path
                assert consumer.name and consumer.detail, path


class TestClaimsAreComplete:
    """A badge that states a conclusion and withholds the reason is the habit
    this campaign existed to break."""

    @pytest.mark.parametrize("path", sorted(FIELDS))
    def test_restart_claims_say_why(self, path):
        spec = spec_for(path)
        if spec.apply_mode == "restart":
            assert spec.restart_reason, f"{path} claims restart without a reason"

    @pytest.mark.parametrize("path", sorted(FIELDS))
    def test_live_apply_claims_name_a_handler(self, path):
        spec = spec_for(path)
        if spec.apply_mode == "live_apply":
            assert spec.apply_handler, f"{path} claims live apply with no handler"

    @pytest.mark.parametrize("path", sorted(FIELDS))
    def test_gated_claims_say_what_activation_means(self, path):
        spec = spec_for(path)
        if spec.apply_mode == "activation_required":
            assert spec.activation_policy, f"{path} is gated with no policy"

    @pytest.mark.parametrize("path", sorted(FIELDS))
    def test_unwired_claims_explain_themselves(self, path):
        """§4 requires an activation policy for dormant as well as gated
        fields. For a field nothing reads, that text has to say so plainly
        rather than describe a switch that does not exist."""
        spec = spec_for(path)
        if spec.apply_mode == "dormant":
            assert spec.description, f"{path} is unwired with no description"
            assert spec.activation_policy, (
                f"{path} is unwired and says nothing about what that means"
            )

    def test_mixed_sections_classify_every_leaf_they_own(self):
        """Declaring a section non-uniform and then letting a leaf inherit
        would publish exactly the unchecked claim the declaration denies."""
        for path in FIELDS:
            section = path.split(".", 1)[0]
            if section in MIXED_SECTIONS:
                assert has_explicit_spec(path)

    def test_disagreeing_consumers_carry_the_weakest_badge(self):
        """When consumers disagree, the badge must not promise more than the
        slowest one delivers — otherwise the page reports success for a change
        half the system has not adopted.

        Consumers marked ``activation_required`` are excluded: those do not
        read the value at all, which is a coverage gap rather than a slower
        path, and is disclosed in the consumer's own detail text.
        """
        rank = {
            "live_read": 0,
            "live_apply": 1,
            "live_for_new_work": 1,
            "restart": 2,
        }
        for path, spec in FIELDS.items():
            applying = [c for c in spec.consumers if c.apply_mode != "activation_required"]
            if not applying:
                continue
            resolved = spec_for(path)
            worst = max(rank[c.apply_mode] for c in applying)
            assert rank[resolved.apply_mode] >= worst, (
                f"{path} advertises {resolved.apply_mode} while a consumer is "
                f"slower than that"
            )


class TestResolution:
    def test_discord_precedence_copy_matches_intake_policy(self):
        section_copy = SECTIONS["discord"].description
        assert "absolute global" in section_copy
        assert "cannot bypass" in section_copy
        assert "Prefix commands use their own authorization" in section_copy
        assert "test-webhook path bypasses the user gate" in section_copy
        assert "explicit mention bypasses" in section_copy

        allowed_users = spec_for("discord.allowed_users").description
        channels = spec_for("discord.channels").description
        ignored_bots = spec_for("discord.ignore_bot_ids").description
        assert "cannot readmit" in allowed_users
        assert "cannot readmit" in channels
        assert "explicit mention bypasses" in ignored_bots
        assert "may override" in spec_for("discord.require_mention").description
        assert "may override" in spec_for("discord.respond_to_bots").description

    def test_removed_noop_switches_are_absent_and_siblings_require_restart(self):
        from src.config.apply_registry import schema_facts

        facts = schema_facts()
        assert len(facts) == 273
        assert "graceful_degradation.enabled" not in facts
        assert "grafana_alerts.enabled" not in facts
        for path in (
            "graceful_degradation.degraded_threshold",
            "graceful_degradation.unavailable_threshold",
            "grafana_alerts.auto_remediate",
            "grafana_alerts.rules",
            "grafana_alerts.cooldown_seconds",
            "grafana_alerts.max_concurrent_remediations",
        ):
            spec = spec_for(path)
            assert spec.apply_mode == "restart", path
            assert spec.restart_reason, path

    def test_explicit_leaf_beats_the_section_default(self):
        assert SECTIONS["turn_state"].apply_mode == "restart"
        assert spec_for("turn_state.payload_retention_days").apply_mode == "live_read"

    def test_leaf_without_an_entry_inherits_its_section(self):
        assert spec_for("browser.viewport_width").apply_mode == (
            SECTIONS["browser"].apply_mode
        )

    def test_unknown_section_is_treated_as_restart_not_as_live(self):
        """An unclassified path must never render as applied. The CI gate stops
        this reaching a release; the fallback decides what happens if it ever
        slips through."""
        spec = spec_for("brand_new_section.some_field")
        assert spec.apply_mode == "restart"
        assert spec.restart_reason

    def test_restart_leaf_inherits_the_section_reason(self):
        assert spec_for("sessions.max_history").restart_reason == (
            SECTIONS["sessions"].restart_reason
        )

    def test_gated_leaf_inherits_the_section_policy(self):
        assert spec_for("usage.enabled").activation_policy == (
            SECTIONS["usage"].activation_policy
        )

    def test_live_apply_leaf_inherits_the_section_handler(self):
        assert spec_for("ollama.host").apply_handler == (
            SECTIONS["ollama"].apply_handler
        )


class TestSensitivity:
    @pytest.mark.parametrize(
        "path",
        [
            "discord.token",
            "web.api_token",
            "audit.hmac_key",
            "email.smtp.password",
            "tools.ssh_key_path",
            "openai_codex.credentials_path",
        ],
    )
    def test_credentials_are_secret(self, path):
        assert is_secret(path)

    @pytest.mark.parametrize(
        "path",
        [
            "mcp.servers.thing.headers",
            "mcp.servers.thing.env",
            "outbound_webhooks.targets.alerts.secret",
        ],
    )
    def test_user_created_credential_containers_are_secret(self, path):
        """These leaves only exist once someone adds a server or a target, so
        they cannot be enumerated in advance — they have to be matched."""
        assert is_secret(path)

    def test_target_safety_overrides_do_not_claim_an_activation_step(self):
        """The dedicated endpoint applies these to the running dispatcher
        immediately. Advertising an acknowledgement step that no route asks
        for would be a safety theatre the code does not perform."""
        spec = spec_for("outbound_webhooks.targets.alerts.verify_ssl")
        assert spec.apply_mode != "activation_required"
        assert spec.activation_policy is None

    def test_ordinary_settings_are_not_secret(self):
        assert not is_secret("browser.viewport_width")
        assert not is_secret("discord.channels")

    def test_no_credential_shaped_schema_leaf_is_public(self):
        """Use the shared compound-key rule, not an exact-segment shortlist.

        ``default_webhook_url`` was leaked by the old exact list even though
        GET /api/config already knew that webhook_url is credential-shaped.
        """
        from src.config.apply_registry import schema_facts
        from src.config.sensitivity import is_sensitive_key

        for path in schema_facts():
            if is_sensitive_key(path.rsplit(".", 1)[-1]):
                assert is_secret(path), f"{path} would be served as a value"

    def test_compound_webhook_url_is_redacted(self):
        record = build_field_record(
            "slack.default_webhook_url", "https://hooks.slack.invalid/secret"
        )
        assert record["sensitivity"] == "sensitive"
        assert record["desired"] == REDACTED

    def test_arbitrary_key_inside_webhook_url_map_is_redacted(self):
        record = build_field_record(
            "slack.webhook_urls.ops", "https://hooks.slack.invalid/secret"
        )
        assert record["sensitivity"] == "sensitive"
        assert record["desired"] == REDACTED


class TestFlatten:
    def test_nested_paths_are_reached(self):
        flat = dict(flatten({"a": {"b": {"c": 1}}}))
        assert flat == {"a.b.c": 1}

    def test_empty_mapping_is_itself_a_leaf(self):
        """A cleared credential container must not vanish from the page —
        disappearing is indistinguishable from 'no such setting'."""
        flat = dict(flatten({"mcp": {"servers": {}}}))
        assert flat == {"mcp.servers": {}}

    def test_list_of_plain_values_stays_one_leaf(self):
        """It is edited as a single value, so splitting it into indexed leaves
        would make the page unusable for allowlists."""
        flat = dict(flatten({"a": [1, 2]}))
        assert flat == {"a": [1, 2]}

    def test_empty_list_stays_one_leaf(self):
        flat = dict(flatten({"a": []}))
        assert flat == {"a": []}

    def test_list_of_records_is_descended_into(self):
        flat = dict(flatten({"targets": [{"name": "a"}, {"name": "b"}]}))
        assert flat == {"targets.0.name": "a", "targets.1.name": "b"}


class TestSecretsInsideListRecords:
    """The leak this class of flattening exists to prevent.

    ``web.api_tokens`` and ``outbound_webhooks.targets`` are lists whose every
    entry carries a credential. Treated as single leaves they are 'public'
    lists, and the whole list — tokens included — is serialized into the
    payload. A default config has both lists empty, which is why a payload-wide
    secret scan over default config passes while real installs leak.
    """

    POPULATED = {
        "web": {"api_tokens": [{"name": "ops", "token": "WEB-TOKEN-LEAK"}]},
        "outbound_webhooks": {
            "targets": [
                {"name": "a", "url": "https://x", "secret": "SIGNING-LEAK"},
            ]
        },
    }

    def test_no_credential_from_a_list_record_reaches_the_payload(self):
        import json

        raw = json.dumps(build_meta_payload(self.POPULATED))
        assert "WEB-TOKEN-LEAK" not in raw
        assert "SIGNING-LEAK" not in raw

    def test_each_record_credential_is_its_own_redacted_field(self):
        fields = {
            f["path"]: f for f in build_meta_payload(self.POPULATED)["fields"]
        }
        token = fields["web.api_tokens.0.token"]
        assert token["sensitivity"] == "sensitive"
        assert token["desired"] == REDACTED
        assert token["configured"] is True

    def test_public_siblings_stay_readable(self):
        """Redacting the whole record would make targets unmanageable."""
        fields = {
            f["path"]: f for f in build_meta_payload(self.POPULATED)["fields"]
        }
        assert fields["web.api_tokens.0.name"]["desired"] == "ops"
        assert fields["outbound_webhooks.targets.0.url"]["desired"] == "https://x"
        assert fields["outbound_webhooks.targets.0.secret"]["desired"] == REDACTED

    def test_target_records_are_still_matched_by_index(self):
        payload = build_meta_payload(
            {"outbound_webhooks": {"targets": [{"verify_ssl": False}]}}
        )
        record = payload["fields"][0]
        assert record["path"] == "outbound_webhooks.targets.0.verify_ssl"
        assert record["description"]


class TestFieldRecord:
    def test_public_value_is_returned_as_it_is(self):
        record = build_field_record("browser.viewport_width", 1280)
        assert record["desired"] == 1280
        assert record["type"] == "integer"
        assert record["configured"] is True

    def test_secret_value_never_appears(self):
        record = build_field_record("discord.token", "a-real-token")
        assert record["desired"] == REDACTED
        assert record["configured"] is True
        assert "a-real-token" not in repr(record)

    def test_redaction_is_a_fixed_width_regardless_of_the_secret(self):
        """A mask that tracked length would hand out the length."""
        short = build_field_record("discord.token", "x")
        long = build_field_record("discord.token", "x" * 400)
        assert short["desired"] == long["desired"] == REDACTED

    def test_unset_secret_reports_unset_not_redacted(self):
        record = build_field_record("discord.token", "")
        assert record["desired"] == ""
        assert record["configured"] is False
        assert record["provenance"] == "unset"

    def test_secret_container_is_emptied_not_masked(self):
        record = build_field_record(
            "mcp.servers.thing.headers", {"Authorization": "Bearer x"}
        )
        assert record["desired"] == {}
        assert "Bearer x" not in repr(record)
        assert record["configured"] is True

    def test_restart_field_reports_the_boot_value_as_effective(self):
        record = build_field_record(
            "sessions.max_history", 500, boot_value=100, has_boot=True
        )
        assert record["desired"] == 500
        assert record["effective"] == 100
        assert record["pending_restart"] is True
        assert record["apply_state"] == "pending_restart"

    def test_unchanged_restart_field_is_applied(self):
        record = build_field_record(
            "sessions.max_history", 100, boot_value=100, has_boot=True
        )
        assert record["pending_restart"] is False
        assert record["apply_state"] == "applied"

    def test_live_field_is_never_pending_a_restart(self):
        record = build_field_record(
            "turn_state.payload_retention_days", 30, boot_value=7, has_boot=True
        )
        assert record["effective"] == 30
        assert record["pending_restart"] is False
        assert record["apply_state"] == "applied"

    def test_without_a_boot_snapshot_effective_is_unknown_not_guessed(self):
        record = build_field_record("sessions.max_history", 500)
        assert record["pending_restart"] is False
        assert record["effective"] is None
        assert record["apply_state"] == "unknown"

    def test_usage_directory_is_restart_bound(self):
        record = build_field_record(
            "usage.directory", "./data/usage", boot_value="./data/usage", has_boot=True
        )
        assert record["apply_state"] == "applied"
        assert record["apply_mode"] == "restart"
        assert record["restart_reason"]

    def test_consumers_survive_to_the_record(self):
        record = build_field_record("timezone", "UTC")
        modes = {c["apply_mode"] for c in record["consumers"]}
        assert modes == {"live_read", "restart"}


class TestApplyState:
    """The state a field reports, in precedence order.

    ``invalid`` and ``drift`` are not produced yet — validation and runtime
    comparison land later — but the page already renders them, so the
    precedence is pinned now rather than discovered by whoever wires them.
    """

    def test_invalid_outranks_every_other_state(self):
        from src.config.apply_registry import _apply_state

        state = _apply_state(
            apply_mode="restart", pending_restart=True, drift=True, valid=False,
            effective_known=True,
        )
        assert state == "invalid"

    def test_pending_restart_outranks_drift(self):
        from src.config.apply_registry import _apply_state

        state = _apply_state(
            apply_mode="restart", pending_restart=True, drift=True, valid=True,
            effective_known=True,
        )
        assert state == "pending_restart"

    def test_drift_outranks_dormant(self):
        from src.config.apply_registry import _apply_state

        state = _apply_state(
            apply_mode="activation_required",
            pending_restart=False,
            drift=True,
            valid=True,
            effective_known=True,
        )
        assert state == "drift"

    def test_secret_list_is_emptied_not_masked(self):
        record = build_field_record("outbound_webhooks.webhook_urls", ["https://x"])
        assert record["desired"] == []
        assert "https://x" not in repr(record)


class TestSchemaDerivedFacts:
    """Type, enum, constraints, and default come from Pydantic.

    §4 of the plan says these are "derived from pydantic where possible, never
    hand-duplicated". The fixture hand-wrote them and got two wrong — it
    claimed viewport_width accepted 100..7680 and command_timeout_seconds
    10..3600, neither of which the schema says. Deriving cannot drift.
    """

    def test_enum_comes_from_the_literal_annotation(self):
        record = build_field_record("llm_provider.active_provider", "codex")
        assert record["enum"] == ["codex", "ollama", "kimi"]

    def test_type_comes_from_the_annotation_not_the_current_value(self):
        """An unset optional string must still say 'string', or the page has
        no idea which widget to render."""
        record = build_field_record("openai_codex.agent_model", None)
        assert record["type"] == "string"

    def test_default_comes_from_the_schema(self):
        assert build_field_record("sessions.max_history", 999)["default"] == 50

    def test_declared_bounds_are_published(self):
        record = build_field_record("turn_state.payload_retention_days", 7.0)
        assert record["constraints"] == {"minimum": 1.0, "maximum": 90.0}

    def test_bounds_that_live_only_in_a_validator_are_not_invented(self):
        """Restating a validator's numbers is how the page ends up offering a
        range the schema stopped accepting."""
        record = build_field_record("browser.viewport_width", 1920)
        assert record["constraints"] == {}

    def test_unknown_paths_fall_back_to_the_value_shape(self):
        record = build_field_record("not_a_section.not_a_field", 5)
        assert record["type"] == "integer"
        assert record["default"] is None

    def test_only_schema_free_containers_get_read_only_summary_marker(self):
        assert build_field_record("tools.hosts", {})["structured_container"] is True
        assert build_field_record("mcp.servers", {})["structured_container"] is True
        assert not build_field_record(
            "agents.final_warning_iterations", [20, 10]
        )["structured_container"]
        assert not build_field_record(
            "tools.skill_allowed_urls", ["https://x"]
        )["structured_container"]
        assert not build_field_record(
            "discord.allowed_users", ["123"]
        )["structured_container"]

    def test_populated_container_children_get_the_read_only_marker(self):
        records = build_meta_payload(
            {
                "tools": {
                    "hosts": {
                        "prod": {
                            "address": "10.0.0.8",
                            "ssh_user": "deploy",
                            "os": "linux",
                        }
                    }
                }
            }
        )["fields"]
        host_children = [
            record for record in records
            if record["path"].startswith("tools.hosts.prod.")
        ]
        assert len(host_children) == 3
        assert all(record["structured_container_child"] for record in host_children)
        assert all(not record["structured_container"] for record in host_children)
        assert not build_field_record(
            "tools.ssh_retry.max_retries", 2
        )["structured_container_child"]

        # This is schema ancestry, not a tools.hosts allowlist. A populated
        # record-list container must acquire the same marker through its
        # arbitrary index segment.
        token_records = build_meta_payload(
            {
                "web": {
                    "api_tokens": [
                        {"token": "secret", "tier": "admin", "label": "ops"}
                    ]
                }
            }
        )["fields"]
        token_children = [
            record for record in token_records
            if record["path"].startswith("web.api_tokens.0.")
        ]
        assert len(token_children) == 3
        assert all(record["structured_container_child"] for record in token_children)

    def test_list_entry_paths_resolve_to_their_record_field(self):
        """An entry's fields are schema, so web.api_tokens.0.tier must pick up
        the tier field's facts rather than be treated as an unknown path — and
        an unset one must still know it is a string with a default."""
        record = build_field_record("web.api_tokens.0.tier", None)
        assert record["type"] == "string"
        assert record["default"] == "admin"

    def test_credentials_in_list_entries_are_known_to_the_schema_walk(self):
        from src.config.apply_registry import schema_facts

        facts = schema_facts()
        assert "web.api_tokens.token" in facts
        assert "outbound_webhooks.targets.secret" in facts


class TestEffectiveIsNeverGuessed:
    """What the running bot uses, or an explicit unknown.

    The first version of this module set effective = desired for everything
    except restart, so `agents.max_children_per_agent = 9` reported effective
    9 while the runtime went on using its hardcoded 3. That is the original
    defect of this page wearing a more authoritative JSON shape.
    """

    def test_concurrent_limit_reports_per_channel_new_spawn_semantics(self):
        record = build_field_record("agents.max_concurrent_agents", 6)
        assert record["label"] == "Maximum concurrent agents per channel"
        assert "concurrently running agents per channel" in record["description"]
        assert record["apply_mode"] == "live_for_new_work"
        assert record["effective"] == 6
        assert record["constraints"] == {"minimum": 1, "maximum": 25}

    def test_the_wired_child_limit_reports_next_tree_semantics(self):
        """Was THE dormant exemplar; the spawn path consults it now — root
        snapshot, descendants inherit, so live_for_new_work is the truth."""
        record = build_field_record("agents.max_children_per_agent", 5)
        assert record["apply_mode"] == "live_for_new_work"
        assert record["effective"] == 5
        assert record["apply_state"] == "applied"

    def test_usage_directory_reports_boot_effective_value(self):
        record = build_field_record(
            "usage.directory",
            "/srv/new-usage",
            boot_value="/srv/boot-usage",
            has_boot=True,
        )
        assert record["effective"] == "/srv/boot-usage"
        assert record["apply_state"] == "pending_restart"

    def test_a_handler_applied_field_reports_no_effective_value(self):
        """Whether the named handler has run is not visible from config."""
        record = build_field_record("openai_codex.model", "gpt-5.6-sol")
        assert record["apply_mode"] == "live_apply"
        assert record["effective"] is None
        assert record["apply_state"] == "unknown"

    def test_a_re_read_field_is_effective_immediately(self):
        record = build_field_record("discord.respond_to_bots", True)
        assert record["effective"] is True
        assert record["apply_state"] == "applied"

    def test_next_work_fields_report_the_value_the_next_unit_will_use(self):
        record = build_field_record("agents.max_iterations", 200)
        assert record["apply_mode"] == "live_for_new_work"
        assert record["effective"] == 200

    @pytest.mark.parametrize(
        "path,value",
        [
            ("agents.hard_max_iterations", 250),
            ("agents.final_warning_iterations", [10, 2]),
        ],
    )
    def test_non_adopting_consumer_makes_effective_unknown(self, path, value):
        """spawn_loop_agents ignores these, so the next unit of work is not a
        single knowable value despite the broad live_for_new_work mode."""
        record = build_field_record(path, value)
        assert record["apply_mode"] == "live_for_new_work"
        assert record["effective"] is None
        assert record["apply_state"] == "unknown"

    def test_nesting_depth_is_knowable_now_both_paths_consult_it(self):
        """Was in the non-adopting set; the loop path passes it since the
        wiring PR, so the next unit of work IS the configured value."""
        record = build_field_record("agents.max_nesting_depth", 3)
        assert record["effective"] == 3
        assert record["apply_state"] == "applied"

    @pytest.mark.parametrize("path", ["scrub_secrets", "verify_ssl"])
    def test_dropped_webhook_target_boot_value_is_not_reported_effective(self, path):
        record = build_field_record(
            f"outbound_webhooks.targets.0.{path}",
            False,
            boot_value=False,
            has_boot=True,
        )
        assert record["desired"] is False
        assert record["effective"] is None
        assert record["pending_restart"] is False
        assert record["apply_state"] == "unknown"

    def test_restart_field_still_reports_the_boot_value(self):
        record = build_field_record(
            "sessions.max_history", 500, boot_value=100, has_boot=True
        )
        assert record["effective"] == 100
        assert record["apply_state"] == "pending_restart"


class TestRevisionIsNotAnOracle:
    """A published revision must not let anyone test secret guesses offline.

    The first version hashed the resolved config with plain SHA-256 and
    published the digest. With the rest of the config known, a low-entropy
    secret falls to a handful of guesses — Odin recovered one that way.
    """

    def test_the_revision_cannot_be_recomputed_off_box(self):
        import hashlib
        import json

        config = {"discord": {"token": "guessable"}}
        canonical = json.dumps(config, sort_keys=True, default=str)
        unkeyed = hashlib.sha256(canonical.encode()).hexdigest()[:16]
        assert config_revision(config) != unkeyed

    def test_guessing_a_secret_does_not_reproduce_the_revision(self):
        """The exact attack: same config shape, candidate secrets, compare."""
        published = config_revision({"discord": {"token": "hunter2"}})
        candidates = ["hunter1", "hunter2", "hunter3", "password"]
        recomputed = {
            candidate: __import__("hashlib")
            .sha256(
                __import__("json")
                .dumps({"discord": {"token": candidate}}, sort_keys=True)
                .encode()
            )
            .hexdigest()[:16]
            for candidate in candidates
        }
        assert published not in recomputed.values()

    def test_a_changed_secret_still_changes_the_revision(self):
        """Opacity must not cost change detection, or a revision-bound write
        could miss a credential rotation."""
        left = config_revision({"discord": {"token": "one"}})
        right = config_revision({"discord": {"token": "two"}})
        assert left != right

    def test_effective_revision_is_not_published_as_a_raw_boot_diff(self):
        """It used to hash the boot dump, so any live change made the two
        revisions disagree while every field correctly said applied."""
        payload = build_meta_payload(
            {"discord": {"respond_to_bots": True}},
            boot_dump={"discord": {"respond_to_bots": False}},
        )
        assert payload["status"]["effective_revision"] is None
        record = payload["fields"][0]
        assert record["apply_state"] == "applied"


class TestContainerSensitivity:
    """An empty credential container is still a credential container."""

    @pytest.mark.parametrize(
        "path", ["web.api_tokens", "outbound_webhooks.targets", "mcp.servers"]
    )
    def test_empty_secret_containers_are_not_public_json_controls(self, path):
        """Rendered as a public container, the generic editor becomes a place
        to type a credential into."""
        assert spec_for(path).sensitivity == "secret_container"

    def test_a_container_without_credentials_stays_public(self):
        assert spec_for("tools.hosts").sensitivity == "public"

    def test_secret_route_is_null_until_the_route_exists(self):
        assert build_field_record("discord.token", "x")["secret_route"] is None


class TestRevision:
    def test_same_configuration_has_the_same_revision(self):
        assert config_revision({"a": 1}) == config_revision({"a": 1})

    def test_key_order_does_not_change_the_revision(self):
        assert config_revision({"a": 1, "b": 2}) == config_revision({"b": 2, "a": 1})

    def test_a_changed_value_changes_the_revision(self):
        assert config_revision({"a": 1}) != config_revision({"a": 2})

    def test_a_changed_secret_changes_the_revision(self):
        """Excluding secrets would let two genuinely different configurations
        report the same revision."""
        left = config_revision({"discord": {"token": "one"}})
        right = config_revision({"discord": {"token": "two"}})
        assert left != right

    def test_unserialisable_values_do_not_raise(self):
        assert config_revision({"a": object()})


class TestMetaPayload:
    def test_health_vocabulary_matches_the_page(self):
        """A server-only state must not disappear from the page totals."""
        payload = build_meta_payload({"browser": {"viewport_width": 1280}})
        assert tuple(payload["status"]["counts"]) == HEALTH_STATES
        assert HEALTH_STATES == _page_health_states()

    def test_unrecognised_health_state_fails_instead_of_disappearing(
        self, monkeypatch
    ):
        import src.config.apply_registry as registry

        monkeypatch.setattr(
            registry,
            "build_field_record",
            lambda *args, **kwargs: {"apply_state": "future_state"},
        )
        with pytest.raises(ValueError, match="unsupported config health state"):
            build_meta_payload({"browser": {"viewport_width": 1280}})

    def test_envelope_shape(self):
        payload = build_meta_payload({"browser": {"viewport_width": 1280}})
        assert payload["schema_version"] == 1
        assert payload["revision"] == payload["status"]["desired_revision"]
        assert payload["status"]["effective_revision"] is None
        assert [f["path"] for f in payload["fields"]] == ["browser.viewport_width"]

    def test_counts_cover_every_field(self):
        payload = build_meta_payload(
            {
                "browser": {"viewport_width": 1280},
                "usage": {"directory": "./x"},
                "sessions": {"max_history": 10},
            }
        )
        counts = payload["status"]["counts"]
        assert set(counts) == {
            "applied", "pending_restart", "dormant", "invalid", "drift", "unknown",
        }
        assert sum(counts.values()) == len(payload["fields"])
        assert counts["dormant"] == 0
        assert counts["unknown"] == 3

    def test_boot_snapshot_makes_pending_restart_visible(self):
        payload = build_meta_payload(
            {"sessions": {"max_history": 500}},
            boot_dump={"sessions": {"max_history": 100}},
        )
        assert payload["status"]["counts"]["pending_restart"] == 1
        assert payload["status"]["effective_revision"] != payload["revision"]

    def test_a_field_absent_at_boot_is_not_reported_pending(self):
        """A setting added since startup has no boot value to compare against;
        inventing one would manufacture a restart prompt."""
        payload = build_meta_payload(
            {"sessions": {"max_history": 500}}, boot_dump={"sessions": {}}
        )
        record = payload["fields"][0]
        assert record["pending_restart"] is False

    def test_persistence_error_is_carried_to_the_page(self):
        payload = build_meta_payload({"a": {"b": 1}}, persistence_error="disk full")
        assert payload["status"]["persistence_error"] == "disk full"


class TestSpecConstruction:
    def test_specs_are_immutable(self):
        with pytest.raises(Exception):
            FIELDS["timezone"].apply_mode = "live_read"

    def test_consumer_is_immutable(self):
        consumer = Consumer("x", "live_read", "y")
        with pytest.raises(Exception):
            consumer.name = "z"

    def test_default_spec_carries_no_claims(self):
        blank = FieldSpec()
        assert blank.apply_mode is None
        assert blank.consumers == ()
        assert blank.constraints == {}


class TestPlainLanguageEffects:
    """The two sentences an operator needs, replacing 'Activation required'.

    The settled copy is exact for the gated states; drift in those words is
    drift in meaning, so they are pinned verbatim.
    """

    def test_usage_directory_says_restart_required(self):
        record = build_field_record(
            "usage.directory", "./x", boot_value="./data/usage", has_boot=True
        )
        assert "restart" in record["save_effect"].lower()
        assert record["runtime_effect"] == record["restart_reason"]

    def test_restart_fields_carry_their_reason_as_runtime_effect(self):
        record = build_field_record("sessions.max_history", 50)
        assert "startup value" in record["save_effect"]
        assert record["runtime_effect"] == record["restart_reason"]

    def test_dedicated_live_apply_does_not_claim_generic_reload(self):
        record = build_field_record("openai_codex.model", "sol")
        assert record["save_effect"] == (
            "Saving through Config updates config.yml but does not reload the "
            "running provider."
        )
        assert "PUT /api/llm/codex/config" in record["runtime_effect"]
        assert "unchanged until that endpoint succeeds" in record["runtime_effect"]

    def test_generic_live_apply_keeps_its_real_apply_claim(self):
        record = build_field_record("personality.user_presets", {})
        assert record["save_effect"] == (
            "Saving updates config.yml and reconfigures the running process."
        )
        assert "PUT /api/config" in record["runtime_effect"]

    def test_issue_tracker_copy_names_visibility_without_usability(self):
        enabled = build_field_record("issue_tracker.enabled", True)
        assert enabled["apply_mode"] == "live_read"
        assert enabled["effective"] is None
        assert "tool catalog" in enabled["description"]
        assert "answers 'not configured'" in enabled["description"]
        assert "planned for the next campaign" in enabled["description"]
        assert {consumer["name"] for consumer in enabled["consumers"]} == {
            "Tool catalog visibility",
            "Tool execution",
        }
        provider = build_field_record("issue_tracker.provider", "linear")
        assert provider["apply_mode"] == "dormant"
        assert "no production issue-tracker client" in provider["description"]

    def test_logging_directory_names_only_the_workspace_fence(self):
        record = build_field_record("logging.directory", "/srv/not-a-log-sink")
        assert record["apply_mode"] == "restart"
        assert "workspace" in record["description"].lower()
        assert "does not write logs" in record["description"].lower()
        assert {consumer["name"] for consumer in record["consumers"]} == {
            "Local command workspace fence",
        }
        assert all(
            "handler" not in consumer["name"].lower()
            for consumer in record["consumers"]
        )

    def test_every_workspace_protected_config_path_publishes_restart_truth(self):
        from src.config.workspace_paths import WORKSPACE_PROTECTED_CONFIG_PATH_NAMES
        from src.tools.workspace import _DECLARED_STATE_PATHS

        assert WORKSPACE_PROTECTED_CONFIG_PATH_NAMES == {
            path for path, _is_file in _DECLARED_STATE_PATHS
        }
        assert len(WORKSPACE_PROTECTED_CONFIG_PATH_NAMES) == 13

        for path in WORKSPACE_PROTECTED_CONFIG_PATH_NAMES:
            spec = spec_for(path)
            fence = [
                consumer
                for consumer in spec.consumers
                if consumer.name == "Local command workspace fence"
            ]
            assert len(fence) == 1, path
            assert fence[0].apply_mode == "restart", path
            assert "captured" in fence[0].detail, path
            assert spec.apply_mode == "restart", path
            assert spec.restart_reason, path

    @pytest.mark.parametrize(
        "path",
        [
            "tools.audit_log_path",
            "tools.trajectory_path",
            "attachments.temp_directory",
            "usage.directory",
        ],
    )
    def test_missed_workspace_paths_report_boot_effective_pending_restart(self, path):
        record = build_field_record(
            path,
            "/srv/new-state",
            boot_value="/srv/boot-state",
            has_boot=True,
        )
        assert record["effective"] == "/srv/boot-state"
        assert record["pending_restart"] is True
        assert record["apply_state"] == "pending_restart"
        assert any(
            consumer["name"] == "Local command workspace fence"
            and consumer["apply_mode"] == "restart"
            for consumer in record["consumers"]
        )

    def test_live_path_consumers_remain_visible_alongside_the_fence(self):
        paths = (
            "tools.audit_log_path",
            "tools.trajectory_path",
            "attachments.temp_directory",
        )
        for path in paths:
            assert {c.apply_mode for c in spec_for(path).consumers} == {
                "live_read",
                "restart",
            }

    def test_every_record_carries_both_sentences(self):
        from src.config.schema import Config

        payload = build_meta_payload(Config(discord={"token": "x"}).model_dump())
        assert all(f["save_effect"] for f in payload["fields"])

    def test_action_buttons_are_honest_off_until_one_exists(self):
        """No activation endpoints exist yet — a rendered button would be the
        disabled ritual switch the redesign bans."""
        record = build_field_record("mcp.enabled", False)
        assert record["action_available"] is False
        assert record["action_label"] is None
        assert record["action_endpoint"] is None


class TestGroupDescriptions:
    """Subgroup cards carry their OWN heading copy.

    The first cut of the page stole the first child's description as the
    group heading — 'Ssh Retry: SSH retry attempts.' — so the copy now lives
    server-side, one entry per subgroup, CI-gated for completeness.
    """

    def test_subgroup_records_carry_the_group_heading(self):
        record = build_field_record("tools.ssh_retry.max_retries", 2)
        assert record["group_description"] == "How failed SSH connections are retried."

    def test_the_heading_is_not_a_child_description(self):
        from src.config.apply_registry import GROUP_DESCRIPTIONS

        record = build_field_record("tools.bulkhead.ssh_max_concurrent", 10)
        assert record["group_description"] == GROUP_DESCRIPTIONS["tools.bulkhead"]
        assert record["group_description"] != record["description"]

    def test_top_level_leaves_carry_none(self):
        assert build_field_record("timezone", "UTC")["group_description"] is None

    def test_every_schema_subgroup_has_an_entry(self):
        from src.config.apply_registry import GROUP_DESCRIPTIONS, schema_facts

        subgroups = {
            ".".join(k.split(".")[:2])
            for k in schema_facts()
            if k.count(".") >= 2
        }
        missing = subgroups - set(GROUP_DESCRIPTIONS)
        assert missing == set(), f"subgroups without heading copy: {missing}"
