"""Tests for src.health.startup — boot-time diagnostic checks."""
from __future__ import annotations

import json
import sqlite3
import time

import pytest
from pathlib import Path
from unittest.mock import MagicMock

from src.health.startup import (
    DiagnosticResult,
    StartupReport,
    check_codex_credentials,
    check_codex_model,
    check_config_sections,
    check_data_directories,
    check_discord_token,
    check_knowledge_db,
    check_sessions_directory,
    check_ssh_hosts,
    run_startup_diagnostics,
    _CONFIG_CHECKS,
)


# ---------------------------------------------------------------------------
# DiagnosticResult dataclass
# ---------------------------------------------------------------------------


class TestDiagnosticResult:
    def test_basic_to_dict(self):
        r = DiagnosticResult(name="test", passed=True, detail="all good")
        d = r.to_dict()
        assert d == {"name": "test", "passed": True, "detail": "all good"}

    def test_to_dict_with_recommendation(self):
        r = DiagnosticResult(
            name="x", passed=False, detail="bad", recommendation="fix it",
        )
        d = r.to_dict()
        assert d["recommendation"] == "fix it"

    def test_to_dict_recommendation_omitted_when_empty(self):
        r = DiagnosticResult(name="x", passed=True, detail="ok")
        d = r.to_dict()
        assert "recommendation" not in d

    def test_to_dict_with_metadata(self):
        r = DiagnosticResult(
            name="x", passed=True, detail="ok", metadata={"k": "v"},
        )
        d = r.to_dict()
        assert d["metadata"] == {"k": "v"}

    def test_to_dict_metadata_omitted_when_empty(self):
        r = DiagnosticResult(name="x", passed=True, detail="ok")
        d = r.to_dict()
        assert "metadata" not in d

    def test_slots(self):
        r = DiagnosticResult(name="a", passed=True, detail="b")
        assert hasattr(type(r), "__slots__")

    def test_all_fields(self):
        r = DiagnosticResult(
            name="n", passed=False, detail="d",
            recommendation="r", metadata={"a": 1},
        )
        assert r.name == "n"
        assert r.passed is False
        assert r.detail == "d"
        assert r.recommendation == "r"
        assert r.metadata == {"a": 1}


# ---------------------------------------------------------------------------
# StartupReport
# ---------------------------------------------------------------------------


class TestStartupReport:
    def test_empty_report(self):
        r = StartupReport()
        assert r.all_passed is True
        assert r.passed_count == 0
        assert r.failed_count == 0

    def test_all_passed(self):
        r = StartupReport(results=[
            DiagnosticResult(name="a", passed=True, detail="ok"),
            DiagnosticResult(name="b", passed=True, detail="ok"),
        ])
        assert r.all_passed is True
        assert r.passed_count == 2
        assert r.failed_count == 0

    def test_some_failed(self):
        r = StartupReport(results=[
            DiagnosticResult(name="a", passed=True, detail="ok"),
            DiagnosticResult(name="b", passed=False, detail="bad"),
        ])
        assert r.all_passed is False
        assert r.passed_count == 1
        assert r.failed_count == 1

    def test_duration_ms(self):
        r = StartupReport(started_at=100.0, finished_at=100.05)
        assert r.duration_ms == 50.0

    def test_duration_ms_zero(self):
        r = StartupReport()
        assert r.duration_ms == 0.0

    def test_to_dict(self):
        r = StartupReport(
            results=[DiagnosticResult(name="x", passed=True, detail="y")],
            started_at=1.0,
            finished_at=1.01,
        )
        d = r.to_dict()
        assert d["all_passed"] is True
        assert d["passed_count"] == 1
        assert d["failed_count"] == 0
        assert d["total_checks"] == 1
        assert d["duration_ms"] == 10.0
        assert len(d["results"]) == 1
        assert d["results"][0]["name"] == "x"

    def test_to_dict_json_serializable(self):
        r = StartupReport(
            results=[
                DiagnosticResult(name="a", passed=True, detail="ok"),
                DiagnosticResult(name="b", passed=False, detail="bad", recommendation="fix"),
            ],
            started_at=0.0, finished_at=0.1,
        )
        # Should not raise
        json.dumps(r.to_dict())


# ---------------------------------------------------------------------------
# check_discord_token
# ---------------------------------------------------------------------------


class TestCheckDiscordToken:
    def test_token_present(self):
        cfg = MagicMock()
        cfg.token = "MTIzNDU2Nzg5.example.token"
        result = check_discord_token(cfg)
        assert result.passed is True
        assert result.name == "discord_token"
        assert result.metadata["token_length"] == len(cfg.token)
        assert "MTIzN" in result.metadata["token_prefix"]

    def test_token_empty(self):
        cfg = MagicMock()
        cfg.token = ""
        result = check_discord_token(cfg)
        assert result.passed is False
        assert "missing" in result.detail.lower()
        assert "DISCORD_TOKEN" in result.recommendation

    def test_token_missing_attr(self):
        cfg = MagicMock(spec=[])
        result = check_discord_token(cfg)
        assert result.passed is False

    def test_short_token(self):
        cfg = MagicMock()
        cfg.token = "abc"
        result = check_discord_token(cfg)
        assert result.passed is True
        assert result.metadata["token_prefix"] == "abc"


# ---------------------------------------------------------------------------
# check_codex_credentials
# ---------------------------------------------------------------------------


class TestCheckCodexCredentials:
    def test_codex_disabled(self):
        cfg = MagicMock()
        cfg.enabled = False
        result = check_codex_credentials(cfg)
        assert result.passed is True
        assert "disabled" in result.detail.lower()

    def test_empty_path(self):
        cfg = MagicMock()
        cfg.enabled = True
        cfg.credentials_path = ""
        result = check_codex_credentials(cfg)
        assert result.passed is False
        assert "empty" in result.detail.lower()

    def test_file_not_found(self, tmp_path):
        cfg = MagicMock()
        cfg.enabled = True
        cfg.credentials_path = str(tmp_path / "nonexistent.json")
        result = check_codex_credentials(cfg)
        assert result.passed is False
        assert "not found" in result.detail.lower()
        assert "codex_login" in result.recommendation

    def test_invalid_json(self, tmp_path):
        bad_file = tmp_path / "bad.json"
        bad_file.write_text("not json{{{")
        cfg = MagicMock()
        cfg.enabled = True
        cfg.credentials_path = str(bad_file)
        result = check_codex_credentials(cfg)
        assert result.passed is False
        assert "parse" in result.detail.lower()

    def test_valid_single_credential(self, tmp_path):
        cred_file = tmp_path / "auth.json"
        cred_file.write_text(json.dumps({
            "access_token": "tok_abc",
            "refresh_token": "ref_abc",
            "expires_at": int(time.time()) + 3600,
        }))
        cfg = MagicMock()
        cfg.enabled = True
        cfg.credentials_path = str(cred_file)
        result = check_codex_credentials(cfg)
        assert result.passed is True
        assert result.metadata["format"] == "single"
        assert result.metadata["expired"] is False

    def test_expired_with_refresh(self, tmp_path):
        cred_file = tmp_path / "auth.json"
        cred_file.write_text(json.dumps({
            "access_token": "tok_abc",
            "refresh_token": "ref_abc",
            "expires_at": int(time.time()) - 3600,
        }))
        cfg = MagicMock()
        cfg.enabled = True
        cfg.credentials_path = str(cred_file)
        result = check_codex_credentials(cfg)
        assert result.passed is True
        assert "expired" in result.detail.lower()
        assert result.metadata["expired"] is True

    def test_expired_without_refresh(self, tmp_path):
        cred_file = tmp_path / "auth.json"
        cred_file.write_text(json.dumps({
            "access_token": "tok_abc",
            "expires_at": int(time.time()) - 3600,
        }))
        cfg = MagicMock()
        cfg.enabled = True
        cfg.credentials_path = str(cred_file)
        result = check_codex_credentials(cfg)
        assert result.passed is False
        assert "expired" in result.detail.lower()
        assert "no refresh" in result.detail.lower()

    def test_pool_format_valid(self, tmp_path):
        cred_file = tmp_path / "auth.json"
        cred_file.write_text(json.dumps([
            {"access_token": "tok_1", "expires_at": int(time.time()) + 3600},
            {"access_token": "tok_2", "expires_at": int(time.time()) + 3600},
        ]))
        cfg = MagicMock()
        cfg.enabled = True
        cfg.credentials_path = str(cred_file)
        result = check_codex_credentials(cfg)
        assert result.passed is True
        assert result.metadata["accounts"] == 2
        assert result.metadata["format"] == "pool"

    def test_pool_format_no_valid_entries(self, tmp_path):
        cred_file = tmp_path / "auth.json"
        cred_file.write_text(json.dumps([
            {"no_token": True},
            {"also_no_token": True},
        ]))
        cfg = MagicMock()
        cfg.enabled = True
        cfg.credentials_path = str(cred_file)
        result = check_codex_credentials(cfg)
        assert result.passed is False
        assert "none have access_token" in result.detail

    def test_missing_access_token(self, tmp_path):
        cred_file = tmp_path / "auth.json"
        cred_file.write_text(json.dumps({"refresh_token": "ref_only"}))
        cfg = MagicMock()
        cfg.enabled = True
        cfg.credentials_path = str(cred_file)
        result = check_codex_credentials(cfg)
        assert result.passed is False
        assert "access_token" in result.detail


# ---------------------------------------------------------------------------
# check_ssh_hosts
# ---------------------------------------------------------------------------


class TestCheckSSHHosts:
    def test_no_hosts(self):
        cfg = MagicMock()
        cfg.hosts = {}
        result = check_ssh_hosts(cfg)
        assert result.passed is True
        assert "no ssh" in result.detail.lower()

    def test_hosts_with_valid_paths(self, tmp_path):
        key = tmp_path / "id_ed25519"
        key.write_text("key")
        known = tmp_path / "known_hosts"
        known.write_text("hosts")
        cfg = MagicMock()
        cfg.hosts = {"web1": MagicMock(address="10.0.0.1")}
        cfg.ssh_key_path = str(key)
        cfg.ssh_known_hosts_path = str(known)
        result = check_ssh_hosts(cfg)
        assert result.passed is True
        assert result.metadata["ssh_key_exists"] is True
        assert result.metadata["known_hosts_exists"] is True
        assert result.metadata["host_count"] == 1

    def test_missing_ssh_key(self, tmp_path):
        cfg = MagicMock()
        cfg.hosts = {"web1": MagicMock()}
        cfg.ssh_key_path = str(tmp_path / "nonexistent_key")
        cfg.ssh_known_hosts_path = ""
        result = check_ssh_hosts(cfg)
        assert result.passed is False
        assert "SSH key not found" in result.detail
        assert result.metadata["ssh_key_exists"] is False

    def test_missing_known_hosts(self, tmp_path):
        key = tmp_path / "id_ed25519"
        key.write_text("key")
        cfg = MagicMock()
        cfg.hosts = {"web1": MagicMock()}
        cfg.ssh_key_path = str(key)
        cfg.ssh_known_hosts_path = str(tmp_path / "nonexistent_known")
        result = check_ssh_hosts(cfg)
        assert result.passed is False
        assert "Known hosts" in result.detail

    def test_both_missing(self, tmp_path):
        cfg = MagicMock()
        cfg.hosts = {"web1": MagicMock()}
        cfg.ssh_key_path = str(tmp_path / "nokey")
        cfg.ssh_known_hosts_path = str(tmp_path / "noknown")
        result = check_ssh_hosts(cfg)
        assert result.passed is False
        assert "SSH key" in result.detail
        assert "Known hosts" in result.detail

    def test_host_names_in_metadata(self):
        cfg = MagicMock()
        cfg.hosts = {"web1": MagicMock(), "db1": MagicMock()}
        cfg.ssh_key_path = ""
        cfg.ssh_known_hosts_path = ""
        result = check_ssh_hosts(cfg)
        assert "web1" in result.metadata["hosts"]
        assert "db1" in result.metadata["hosts"]


# ---------------------------------------------------------------------------
# check_sessions_directory
# ---------------------------------------------------------------------------


class TestCheckSessionsDirectory:
    def test_no_persist_dir(self):
        cfg = MagicMock()
        cfg.persist_directory = ""
        result = check_sessions_directory(cfg)
        assert result.passed is True
        assert "in-memory" in result.detail.lower()

    def test_existing_writable(self, tmp_path):
        cfg = MagicMock()
        cfg.persist_directory = str(tmp_path)
        result = check_sessions_directory(cfg)
        assert result.passed is True
        assert result.metadata["writable"] is True

    def test_creates_missing_dir(self, tmp_path):
        new_dir = tmp_path / "sessions_new"
        cfg = MagicMock()
        cfg.persist_directory = str(new_dir)
        result = check_sessions_directory(cfg)
        assert result.passed is True
        assert result.metadata.get("created") is True
        assert new_dir.is_dir()

    def test_read_only_dir(self, tmp_path):
        ro_dir = tmp_path / "readonly"
        ro_dir.mkdir()
        ro_dir.chmod(0o444)
        cfg = MagicMock()
        cfg.persist_directory = str(ro_dir)
        result = check_sessions_directory(cfg)
        assert result.passed is False
        assert "not writable" in result.detail
        # Cleanup
        ro_dir.chmod(0o755)

    def test_cannot_create_dir(self, tmp_path):
        # Parent directory that doesn't allow creation
        blocked = tmp_path / "blocked"
        blocked.mkdir()
        blocked.chmod(0o444)
        cfg = MagicMock()
        cfg.persist_directory = str(blocked / "subdir")
        result = check_sessions_directory(cfg)
        assert result.passed is False
        assert "Cannot create" in result.detail
        # Cleanup
        blocked.chmod(0o755)


# ---------------------------------------------------------------------------
# check_knowledge_db
# ---------------------------------------------------------------------------


class TestCheckKnowledgeDB:
    def test_disabled(self):
        cfg = MagicMock()
        cfg.enabled = False
        result = check_knowledge_db(cfg)
        assert result.passed is True
        assert "disabled" in result.detail.lower()

    def test_empty_path(self):
        cfg = MagicMock()
        cfg.enabled = True
        cfg.search_db_path = ""
        result = check_knowledge_db(cfg)
        assert result.passed is False
        assert "empty" in result.detail.lower()

    def test_existing_dir_with_sqlite(self, tmp_path):
        # Create a valid SQLite DB
        db_file = tmp_path / "knowledge.db"
        conn = sqlite3.connect(str(db_file))
        conn.execute("CREATE TABLE test (id INTEGER)")
        conn.close()
        cfg = MagicMock()
        cfg.enabled = True
        cfg.search_db_path = str(tmp_path)
        result = check_knowledge_db(cfg)
        assert result.passed is True

    def test_creates_missing_dir(self, tmp_path):
        new_dir = tmp_path / "search_new"
        cfg = MagicMock()
        cfg.enabled = True
        cfg.search_db_path = str(new_dir)
        result = check_knowledge_db(cfg)
        assert result.passed is True
        assert result.metadata.get("created") is True

    def test_sqlite_accessible(self, tmp_path):
        cfg = MagicMock()
        cfg.enabled = True
        cfg.search_db_path = str(tmp_path)
        result = check_knowledge_db(cfg)
        assert result.passed is True
        assert "accessible" in result.detail.lower()


# ---------------------------------------------------------------------------
# check_config_sections
# ---------------------------------------------------------------------------


class TestCheckConfigSections:
    def test_clean_config(self):
        cfg = MagicMock()
        cfg.discord = MagicMock()
        cfg.discord.token = "some_token"
        cfg.web = MagicMock()
        cfg.web.enabled = True
        cfg.web.api_token = "secret123"
        cfg.monitoring = MagicMock()
        cfg.monitoring.enabled = False
        cfg.webhook = MagicMock()
        cfg.webhook.enabled = False
        result = check_config_sections(cfg)
        assert result.passed is True

    def test_missing_discord(self):
        cfg = MagicMock(spec=[])
        result = check_config_sections(cfg)
        assert result.passed is False
        assert "discord" in result.detail.lower()

    def test_empty_discord_token(self):
        cfg = MagicMock()
        cfg.discord = MagicMock()
        cfg.discord.token = ""
        cfg.web = MagicMock()
        cfg.web.enabled = False
        cfg.monitoring = MagicMock()
        cfg.monitoring.enabled = False
        cfg.webhook = MagicMock()
        cfg.webhook.enabled = False
        result = check_config_sections(cfg)
        assert result.passed is False
        assert "discord.token" in result.detail

    def test_web_no_auth(self):
        cfg = MagicMock()
        cfg.discord = MagicMock()
        cfg.discord.token = "tok"
        cfg.web = MagicMock()
        cfg.web.enabled = True
        cfg.web.api_token = ""
        cfg.monitoring = MagicMock()
        cfg.monitoring.enabled = False
        cfg.webhook = MagicMock()
        cfg.webhook.enabled = False
        result = check_config_sections(cfg)
        assert result.passed is False
        assert "api_token" in result.detail

    def test_monitoring_no_checks(self):
        cfg = MagicMock()
        cfg.discord = MagicMock()
        cfg.discord.token = "tok"
        cfg.web = MagicMock()
        cfg.web.enabled = False
        cfg.monitoring = MagicMock()
        cfg.monitoring.enabled = True
        cfg.monitoring.checks = []
        cfg.monitoring.alert_channel_id = "123"
        cfg.webhook = MagicMock()
        cfg.webhook.enabled = False
        result = check_config_sections(cfg)
        assert result.passed is False
        assert "no checks" in result.detail

    def test_monitoring_no_alert_channel(self):
        cfg = MagicMock()
        cfg.discord = MagicMock()
        cfg.discord.token = "tok"
        cfg.web = MagicMock()
        cfg.web.enabled = False
        cfg.monitoring = MagicMock()
        cfg.monitoring.enabled = True
        cfg.monitoring.checks = [MagicMock()]
        cfg.monitoring.alert_channel_id = ""
        cfg.webhook = MagicMock()
        cfg.webhook.enabled = False
        result = check_config_sections(cfg)
        assert result.passed is False
        assert "alert_channel_id" in result.detail

    def test_webhook_no_secret(self):
        cfg = MagicMock()
        cfg.discord = MagicMock()
        cfg.discord.token = "tok"
        cfg.web = MagicMock()
        cfg.web.enabled = False
        cfg.monitoring = MagicMock()
        cfg.monitoring.enabled = False
        cfg.webhook = MagicMock()
        cfg.webhook.enabled = True
        cfg.webhook.secret = ""
        result = check_config_sections(cfg)
        assert result.passed is False
        assert "webhook" in result.detail.lower()

    def test_multiple_issues(self):
        cfg = MagicMock()
        cfg.discord = MagicMock()
        cfg.discord.token = ""
        cfg.web = MagicMock()
        cfg.web.enabled = True
        cfg.web.api_token = ""
        cfg.monitoring = MagicMock()
        cfg.monitoring.enabled = False
        cfg.webhook = MagicMock()
        cfg.webhook.enabled = False
        result = check_config_sections(cfg)
        assert result.passed is False
        assert len(result.metadata["issues"]) >= 2


# ---------------------------------------------------------------------------
# check_data_directories
# ---------------------------------------------------------------------------


class TestCheckDataDirectories:
    def test_all_exist(self, tmp_path, monkeypatch):
        # The function uses relative paths from CWD
        monkeypatch.chdir(tmp_path)
        for d in ["data", "data/sessions", "data/trajectories", "data/skills", "data/logs"]:
            (tmp_path / d).mkdir(parents=True, exist_ok=True)
        result = check_data_directories()
        assert result.passed is True
        assert "present" in result.detail.lower()

    def test_creates_missing(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        result = check_data_directories()
        assert result.passed is True
        # Should have created at least some
        assert (tmp_path / "data").is_dir()
        assert (tmp_path / "data" / "sessions").is_dir()

    def test_partial_existing(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        (tmp_path / "data").mkdir()
        result = check_data_directories()
        assert result.passed is True


# ---------------------------------------------------------------------------
# check_codex_model
# ---------------------------------------------------------------------------


class TestCheckCodexModel:
    def test_disabled(self):
        cfg = MagicMock()
        cfg.enabled = False
        result = check_codex_model(cfg)
        assert result.passed is True
        assert "disabled" in result.detail.lower()

    def test_model_set(self):
        cfg = MagicMock()
        cfg.enabled = True
        cfg.model = "gpt-4o"
        result = check_codex_model(cfg)
        assert result.passed is True
        assert result.metadata["model"] == "gpt-4o"
        assert "gpt-4o" in result.detail

    def test_model_empty(self):
        cfg = MagicMock()
        cfg.enabled = True
        cfg.model = ""
        result = check_codex_model(cfg)
        assert result.passed is False
        assert "empty" in result.detail.lower()


# ---------------------------------------------------------------------------
# run_startup_diagnostics — integration
# ---------------------------------------------------------------------------


class TestRunStartupDiagnostics:
    def test_no_config(self):
        report = run_startup_diagnostics()
        assert isinstance(report, StartupReport)
        # All checks should be skipped → pass
        assert report.all_passed is True
        assert len(report.results) > 0

    def test_with_odin_config_only(self):
        odin_cfg = MagicMock()
        odin_cfg.token = "test_token_123"
        report = run_startup_diagnostics(odin_config=odin_cfg)
        assert isinstance(report, StartupReport)
        names = [r.name for r in report.results]
        assert "discord_token" in names
        # discord_token check should pass
        tok_result = next(r for r in report.results if r.name == "discord_token")
        assert tok_result.passed is True

    def test_with_yaml_config(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        # Create a minimal mock YAML config
        yaml_cfg = MagicMock()
        yaml_cfg.openai_codex = MagicMock()
        yaml_cfg.openai_codex.enabled = False
        yaml_cfg.tools = MagicMock()
        yaml_cfg.tools.hosts = {}
        yaml_cfg.sessions = MagicMock()
        yaml_cfg.sessions.persist_directory = str(tmp_path / "sessions")
        yaml_cfg.search = MagicMock()
        yaml_cfg.search.enabled = False
        yaml_cfg.discord = MagicMock()
        yaml_cfg.discord.token = "tok"
        yaml_cfg.web = MagicMock()
        yaml_cfg.web.enabled = False
        yaml_cfg.monitoring = MagicMock()
        yaml_cfg.monitoring.enabled = False
        yaml_cfg.webhook = MagicMock()
        yaml_cfg.webhook.enabled = False

        report = run_startup_diagnostics(yaml_config=yaml_cfg)
        assert isinstance(report, StartupReport)
        assert len(report.results) >= 7  # 7 config checks + data_directories

    def test_with_both_configs(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        odin_cfg = MagicMock()
        odin_cfg.token = "tok"

        yaml_cfg = MagicMock()
        yaml_cfg.openai_codex = MagicMock()
        yaml_cfg.openai_codex.enabled = False
        yaml_cfg.tools = MagicMock()
        yaml_cfg.tools.hosts = {}
        yaml_cfg.sessions = MagicMock()
        yaml_cfg.sessions.persist_directory = ""
        yaml_cfg.search = MagicMock()
        yaml_cfg.search.enabled = False
        yaml_cfg.discord = MagicMock()
        yaml_cfg.discord.token = "tok"
        yaml_cfg.web = MagicMock()
        yaml_cfg.web.enabled = False
        yaml_cfg.monitoring = MagicMock()
        yaml_cfg.monitoring.enabled = False
        yaml_cfg.webhook = MagicMock()
        yaml_cfg.webhook.enabled = False

        report = run_startup_diagnostics(odin_config=odin_cfg, yaml_config=yaml_cfg)
        assert report.all_passed is True
        # Should have discord_token from odin_config + others from yaml
        names = [r.name for r in report.results]
        assert "discord_token" in names
        assert "codex_credentials" in names

    def test_timing_recorded(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        report = run_startup_diagnostics()
        assert report.started_at > 0
        assert report.finished_at >= report.started_at
        assert report.duration_ms >= 0

    def test_check_crash_handled(self, tmp_path, monkeypatch):
        """A crashing check should not prevent others from running."""
        monkeypatch.chdir(tmp_path)
        # Pass a yaml_config where a sub-config raises on attribute access
        yaml_cfg = MagicMock()
        yaml_cfg.openai_codex = MagicMock()
        type(yaml_cfg.openai_codex).enabled = property(
            lambda self: (_ for _ in ()).throw(RuntimeError("boom"))
        )
        yaml_cfg.tools = MagicMock()
        yaml_cfg.tools.hosts = {}
        yaml_cfg.sessions = MagicMock()
        yaml_cfg.sessions.persist_directory = ""
        yaml_cfg.search = MagicMock()
        yaml_cfg.search.enabled = False
        yaml_cfg.discord = MagicMock()
        yaml_cfg.discord.token = "tok"
        yaml_cfg.web = MagicMock()
        yaml_cfg.web.enabled = False
        yaml_cfg.monitoring = MagicMock()
        yaml_cfg.monitoring.enabled = False
        yaml_cfg.webhook = MagicMock()
        yaml_cfg.webhook.enabled = False

        report = run_startup_diagnostics(yaml_config=yaml_cfg)
        # Should still have results for other checks
        assert len(report.results) > 1
        # The crashing check should be recorded as failed
        crashed = [r for r in report.results if "crashed" in r.detail.lower()]
        assert len(crashed) >= 1

    def test_report_to_dict_serializable(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        report = run_startup_diagnostics()
        d = report.to_dict()
        json.dumps(d)  # Should not raise


# ---------------------------------------------------------------------------
# _CONFIG_CHECKS registry
# ---------------------------------------------------------------------------


class TestConfigChecksRegistry:
    def test_all_entries_have_callable(self):
        for name, fn, _ in _CONFIG_CHECKS:
            assert callable(fn), f"{name} check is not callable"

    def test_unique_names(self):
        names = [name for name, _, _ in _CONFIG_CHECKS]
        assert len(names) == len(set(names)), "Duplicate check names"

    def test_check_count(self):
        assert len(_CONFIG_CHECKS) == 7


# ---------------------------------------------------------------------------
# Edge cases & parametrized tests
# ---------------------------------------------------------------------------


class TestEdgeCases:
    def test_codex_creds_nondict_nonnlist(self, tmp_path):
        """Credentials file that is neither dict nor list."""
        f = tmp_path / "auth.json"
        f.write_text('"just a string"')
        cfg = MagicMock()
        cfg.enabled = True
        cfg.credentials_path = str(f)
        result = check_codex_credentials(cfg)
        assert result.passed is False

    def test_codex_creds_pool_with_mixed(self, tmp_path):
        """Pool format with some valid and some invalid entries."""
        f = tmp_path / "auth.json"
        f.write_text(json.dumps([
            {"access_token": "tok_1"},
            {"invalid": True},
            {"access_token": "tok_3"},
        ]))
        cfg = MagicMock()
        cfg.enabled = True
        cfg.credentials_path = str(f)
        result = check_codex_credentials(cfg)
        assert result.passed is True
        assert result.metadata["accounts"] == 2

    def test_ssh_hosts_empty_paths(self):
        """SSH hosts configured but paths are empty strings."""
        cfg = MagicMock()
        cfg.hosts = {"web1": MagicMock()}
        cfg.ssh_key_path = ""
        cfg.ssh_known_hosts_path = ""
        result = check_ssh_hosts(cfg)
        # Empty paths don't trigger file-not-found
        assert result.passed is True

    def test_knowledge_db_file_path(self, tmp_path):
        """Knowledge path that is a file, not directory."""
        db_file = tmp_path / "direct.db"
        conn = sqlite3.connect(str(db_file))
        conn.execute("SELECT 1")
        conn.close()
        cfg = MagicMock()
        cfg.enabled = True
        cfg.search_db_path = str(db_file)
        result = check_knowledge_db(cfg)
        assert result.passed is True

    def test_diagnostic_result_default_metadata(self):
        r1 = DiagnosticResult(name="a", passed=True, detail="ok")
        r2 = DiagnosticResult(name="b", passed=True, detail="ok")
        # Ensure they don't share the same dict
        r1.metadata["x"] = 1
        assert "x" not in r2.metadata


class TestRealWorldScenarios:
    """Tests mimicking realistic config patterns."""

    def test_full_production_config(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)

        # Create credential files
        cred_file = tmp_path / "codex_auth.json"
        cred_file.write_text(json.dumps({
            "access_token": "prod_token",
            "refresh_token": "prod_refresh",
            "expires_at": int(time.time()) + 7200,
        }))
        ssh_key = tmp_path / "id_ed25519"
        ssh_key.write_text("ssh key content")
        known_hosts = tmp_path / "known_hosts"
        known_hosts.write_text("10.0.0.1 ssh-ed25519 AAAA...")
        sessions_dir = tmp_path / "sessions"
        sessions_dir.mkdir()
        search_dir = tmp_path / "search"
        search_dir.mkdir()

        odin_cfg = MagicMock()
        odin_cfg.token = "MTIzNDU2Nzg5.example"

        yaml_cfg = MagicMock()
        yaml_cfg.openai_codex = MagicMock()
        yaml_cfg.openai_codex.enabled = True
        yaml_cfg.openai_codex.credentials_path = str(cred_file)
        yaml_cfg.openai_codex.model = "gpt-4o"
        yaml_cfg.tools = MagicMock()
        yaml_cfg.tools.hosts = {"web1": MagicMock(), "db1": MagicMock()}
        yaml_cfg.tools.ssh_key_path = str(ssh_key)
        yaml_cfg.tools.ssh_known_hosts_path = str(known_hosts)
        yaml_cfg.sessions = MagicMock()
        yaml_cfg.sessions.persist_directory = str(sessions_dir)
        yaml_cfg.search = MagicMock()
        yaml_cfg.search.enabled = True
        yaml_cfg.search.search_db_path = str(search_dir)
        yaml_cfg.discord = MagicMock()
        yaml_cfg.discord.token = "MTIzNDU2Nzg5.example"
        yaml_cfg.web = MagicMock()
        yaml_cfg.web.enabled = True
        yaml_cfg.web.api_token = "supersecret"
        yaml_cfg.monitoring = MagicMock()
        yaml_cfg.monitoring.enabled = True
        yaml_cfg.monitoring.checks = [MagicMock()]
        yaml_cfg.monitoring.alert_channel_id = "123456"
        yaml_cfg.webhook = MagicMock()
        yaml_cfg.webhook.enabled = False

        report = run_startup_diagnostics(odin_config=odin_cfg, yaml_config=yaml_cfg)
        assert report.all_passed is True
        assert report.failed_count == 0

    def test_minimal_dev_config(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)

        odin_cfg = MagicMock()
        odin_cfg.token = "dev_token"

        yaml_cfg = MagicMock()
        yaml_cfg.openai_codex = MagicMock()
        yaml_cfg.openai_codex.enabled = False
        yaml_cfg.tools = MagicMock()
        yaml_cfg.tools.hosts = {}
        yaml_cfg.sessions = MagicMock()
        yaml_cfg.sessions.persist_directory = ""
        yaml_cfg.search = MagicMock()
        yaml_cfg.search.enabled = False
        yaml_cfg.discord = MagicMock()
        yaml_cfg.discord.token = "dev_token"
        yaml_cfg.web = MagicMock()
        yaml_cfg.web.enabled = False
        yaml_cfg.monitoring = MagicMock()
        yaml_cfg.monitoring.enabled = False
        yaml_cfg.webhook = MagicMock()
        yaml_cfg.webhook.enabled = False

        report = run_startup_diagnostics(odin_config=odin_cfg, yaml_config=yaml_cfg)
        assert report.all_passed is True

    def test_misconfigured_everything(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)

        odin_cfg = MagicMock()
        odin_cfg.token = ""  # Missing

        yaml_cfg = MagicMock()
        yaml_cfg.openai_codex = MagicMock()
        yaml_cfg.openai_codex.enabled = True
        yaml_cfg.openai_codex.credentials_path = "/nonexistent/creds.json"
        yaml_cfg.openai_codex.model = ""
        yaml_cfg.tools = MagicMock()
        yaml_cfg.tools.hosts = {"web1": MagicMock()}
        yaml_cfg.tools.ssh_key_path = "/nonexistent/key"
        yaml_cfg.tools.ssh_known_hosts_path = "/nonexistent/known"
        yaml_cfg.sessions = MagicMock()
        yaml_cfg.sessions.persist_directory = str(tmp_path / "sessions")
        yaml_cfg.search = MagicMock()
        yaml_cfg.search.enabled = True
        yaml_cfg.search.search_db_path = str(tmp_path / "search")
        yaml_cfg.discord = MagicMock()
        yaml_cfg.discord.token = ""
        yaml_cfg.web = MagicMock()
        yaml_cfg.web.enabled = True
        yaml_cfg.web.api_token = ""
        yaml_cfg.monitoring = MagicMock()
        yaml_cfg.monitoring.enabled = True
        yaml_cfg.monitoring.checks = []
        yaml_cfg.monitoring.alert_channel_id = ""
        yaml_cfg.webhook = MagicMock()
        yaml_cfg.webhook.enabled = False

        report = run_startup_diagnostics(odin_config=odin_cfg, yaml_config=yaml_cfg)
        assert report.all_passed is False
        # Should have multiple failures
        assert report.failed_count >= 4
        # Each failure should have a recommendation
        for r in report.results:
            if not r.passed:
                assert r.recommendation, f"{r.name} failed without recommendation"


class TestImports:
    def test_all_public_symbols(self):
        from src.health import startup
        assert hasattr(startup, "DiagnosticResult")
        assert hasattr(startup, "StartupReport")
        assert hasattr(startup, "run_startup_diagnostics")
        assert hasattr(startup, "check_discord_token")
        assert hasattr(startup, "check_codex_credentials")
        assert hasattr(startup, "check_ssh_hosts")
        assert hasattr(startup, "check_sessions_directory")
        assert hasattr(startup, "check_knowledge_db")
        assert hasattr(startup, "check_config_sections")
        assert hasattr(startup, "check_data_directories")
        assert hasattr(startup, "check_codex_model")
