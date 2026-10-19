"""One fixed-size timing summary per executed housekeeping pass.

The summary reports what ran (or was skipped, failed or never reached) and never
changes the pass itself: same eligibility, same swallowed component failures, and an
exception that escapes the pass is still the original one.
"""
import logging
import re
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from src.discord import housekeeping as hk_module
from src.discord.housekeeping import Housekeeping

SUMMARY = re.compile(
    r"^Housekeeping pass (\d+): \d+\.\d\ds total; channel indexing (.+) "
    r"\(indexed_count=(.+)\); turn-state sweeps (.+)$")


@pytest.fixture(autouse=True)
def no_attachment_cleanup(monkeypatch):
    monkeypatch.setattr("src.discord.attachments.AttachmentProcessor.cleanup_old_workspaces",
                        lambda self: None)


def make(*, logger=None, fts=None, store=None, channel_state=None):
    cfg = SimpleNamespace(attachments=None, turn_state=SimpleNamespace(
        resume_ttl_hours=24.0, payload_retention_days=7.0, ledger_retention_days=90.0))
    return Housekeeping(
        get_config=lambda: cfg, sessions=MagicMock(ids=lambda: []),
        channel_state=channel_state or MagicMock(), prompt_builder=MagicMock(),
        agent_manager=None, channel_logger=logger, fts_index=fts, turn_store=store)


def summaries(caplog):
    return [SUMMARY.match(r.getMessage()) for r in caplog.records
            if r.getMessage().startswith("Housekeeping pass ")]


def store(*, fail=False):
    if fail:
        return SimpleNamespace(sweep_expired_active_sync=MagicMock(side_effect=RuntimeError("x")),
                               ttl_sweep_sync=MagicMock(return_value={}))
    return SimpleNamespace(sweep_expired_active_sync=lambda: {}, ttl_sweep_sync=lambda **kw: {})


def test_each_executed_pass_reports_its_components(caplog):
    caplog.set_level(logging.INFO)
    logger = SimpleNamespace(index_to_fts=lambda fts: 5)
    hk = make(logger=logger, fts=object(), store=store())
    hk.cleanup_stale()
    hk.cleanup_stale()
    (first, second) = summaries(caplog)
    assert first and second
    assert (first[1], second[1]) == ("1", "2")
    assert re.fullmatch(r"\d+\.\d\ds", first[2]) and first[3] == "5"
    assert re.fullmatch(r"\d+\.\d\ds", first[4])


def test_components_that_do_not_run_are_named(caplog):
    caplog.set_level(logging.INFO)
    make().cleanup_stale()
    (line,) = summaries(caplog)
    assert line.group(2, 3, 4) == ("skipped", "n/a", "skipped")


def test_failed_components_stay_swallowed_and_are_reported(caplog):
    caplog.set_level(logging.INFO)

    def broken(fts):
        raise RuntimeError("fixture indexing failure")

    make(logger=SimpleNamespace(index_to_fts=broken), fts=object(),
         store=store(fail=True)).cleanup_stale()
    (line,) = summaries(caplog)
    assert line[2].startswith("failed after ") and line[3] == "n/a"
    assert line[4].startswith("failed after ")


def test_an_escaping_exception_is_the_original_one(caplog, monkeypatch):
    caplog.set_level(logging.INFO)
    channel_state = MagicMock()
    channel_state.cleanup.side_effect = ValueError("fixture early failure")
    hk = make(logger=SimpleNamespace(index_to_fts=lambda fts: 1), fts=object(),
              store=store(), channel_state=channel_state)
    with pytest.raises(ValueError, match="fixture early failure"):
        hk.cleanup_stale()
    (line,) = summaries(caplog)
    assert line.group(2, 3, 4) == ("not run", "n/a", "not run")

    def refuse(*args, **kwargs):
        raise OSError("fixture logging failure")

    monkeypatch.setattr(hk_module.log, "info", refuse)
    with pytest.raises(ValueError, match="fixture early failure"):
        hk.cleanup_stale()
    channel_state.cleanup.side_effect = None
    hk.cleanup_stale()  # a failing summary never fails a clean pass either


def test_maybe_cleanup_eligibility_is_unchanged(caplog):
    caplog.set_level(logging.INFO)
    state = MagicMock(last_cleanup=0.0, cleanup_interval=300.0)
    hk = make(channel_state=state)
    hk.maybe_cleanup()
    hk.maybe_cleanup()  # within the interval: no second pass
    assert len(summaries(caplog)) == 1
    state.last_cleanup = 0.0
    hk.maybe_cleanup()
    assert [m[1] for m in summaries(caplog)] == ["1", "2"]


def test_an_unavailable_index_is_reported_as_unavailable(caplog, tmp_path):
    from src.discord.channel_logger import ChannelLogger
    from src.search.fts import FullTextIndex

    caplog.set_level(logging.INFO)
    index = FullTextIndex(str(tmp_path / "fts.db"))
    index._conn.close()
    index._conn = None  # the same state as a failed initialization
    assert index.available is False
    logger = ChannelLogger(tmp_path / "logs")
    calls = []
    real = logger.index_to_fts

    def spy(fts):
        calls.append(fts)
        return real(fts)

    logger.index_to_fts = spy
    make(logger=logger, fts=index).cleanup_stale()
    (line,) = summaries(caplog)
    assert calls == [index]  # the maintenance call itself is unchanged
    assert line.group(2, 3) == ("unavailable", "n/a")


class Interrupt(BaseException):
    pass


@pytest.mark.parametrize("component", ["indexing", "turn_state"])
def test_an_interrupted_component_is_reported_with_its_time(caplog, component):
    caplog.set_level(logging.INFO)
    raised = Interrupt()

    def interrupt(*args, **kwargs):
        raise raised

    if component == "indexing":
        hk = make(logger=SimpleNamespace(index_to_fts=interrupt), fts=object(), store=store())
    else:
        hk = make(store=SimpleNamespace(sweep_expired_active_sync=interrupt,
                                        ttl_sweep_sync=lambda **kw: {}))
    with pytest.raises(Interrupt) as caught:
        hk.cleanup_stale()
    assert caught.value is raised
    (line,) = summaries(caplog)
    state = line[2] if component == "indexing" else line[4]
    assert re.fullmatch(r"interrupted after \d+\.\d\ds", state)
