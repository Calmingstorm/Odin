"""Coverage for src/health/checker.py probe branches (RFC-006 P16, safe).

The provider-configured paths of check_ollama/check_kimi (all circuit-breaker
states + error arm), check_codex's lazy-session branch, and the exception arms
of check_browser/check_loops/check_agents, plus check_all's crashed-checker
handling. SAFE: fake bot namespaces + real (un-connected) Ollama/Kimi client
objects — no network, no LLM call; only breaker-state inspection and pool_stats.
"""
from __future__ import annotations

from types import SimpleNamespace
from typing import Any
from unittest.mock import MagicMock, patch

from src.health import checker
from src.health.checker import (
    check_agents,
    check_all,
    check_browser,
    check_codex,
    check_kimi,
    check_loops,
    check_ollama,
)
from src.llm.kimi import KimiClient
from src.llm.ollama import OllamaClient


def _bot(**kw) -> Any:
    return SimpleNamespace(**kw)


def _gw(**kw) -> Any:
    return SimpleNamespace(llm_gateway=SimpleNamespace(**kw))


class TestCheckOllama:
    def _client(self, state):
        c = OllamaClient(base_url="http://x", model="m")
        c.breaker = SimpleNamespace(state=state)  # type: ignore[assignment]
        return c

    def test_closed_is_ok(self):
        r = check_ollama(_gw(ollama_client=self._client("closed")))
        assert r.status == "ok" and r.healthy is True

    def test_open_is_down(self):
        r = check_ollama(_gw(ollama_client=self._client("open")))
        assert r.status == "down" and r.healthy is False

    def test_half_open_is_degraded(self):
        r = check_ollama(_gw(ollama_client=self._client("half_open")))
        assert r.status == "degraded" and r.healthy is True

    def test_error_probing(self):
        c = self._client("closed")
        c.pool_stats = MagicMock(side_effect=RuntimeError("boom"))  # type: ignore[method-assign]
        r = check_ollama(_gw(ollama_client=c))
        assert r.status == "down" and "Error probing Ollama" in r.detail


class TestCheckKimi:
    def _client(self, state):
        c = KimiClient(api_key="x", model="kimi-k2")
        c.breaker = SimpleNamespace(state=state)  # type: ignore[assignment]
        return c

    def test_closed_is_ok(self):
        r = check_kimi(_gw(kimi_client=self._client("closed")))
        assert r.status == "ok" and r.healthy is True

    def test_open_is_down(self):
        r = check_kimi(_gw(kimi_client=self._client("open")))
        assert r.status == "down"

    def test_half_open_is_degraded(self):
        r = check_kimi(_gw(kimi_client=self._client("half_open")))
        assert r.status == "degraded"

    def test_error_probing(self):
        c = self._client("closed")
        c.pool_stats = MagicMock(side_effect=RuntimeError("boom"))  # type: ignore[method-assign]
        r = check_kimi(_gw(kimi_client=c))
        assert r.status == "down" and "Error probing Kimi" in r.detail


class TestCheckCodexLazySession:
    def test_none_session_is_ok_lazy(self):
        codex = SimpleNamespace(breaker=SimpleNamespace(state="closed"),
                                get_pool_metrics=lambda: {}, _session=None)
        r = check_codex(_gw(codex_client=codex))
        assert r.status == "ok" and "lazy" in r.detail


class TestExceptionArms:
    def test_browser_probe_error(self):
        browser = SimpleNamespace(is_connected=MagicMock(side_effect=RuntimeError("x")))
        executor = SimpleNamespace(_browser_manager=SimpleNamespace(_browser=browser))
        r = check_browser(_bot(tool_executor=executor))
        assert r.status == "down" and "Error" in r.detail

    def test_loops_probe_error(self):
        class _LM:
            @property
            def active_count(self):
                raise RuntimeError("boom")
        r = check_loops(_bot(loop_manager=_LM()))
        assert r.status == "down"

    def test_agents_probe_error(self):
        class _A:
            @property
            def status(self):
                raise RuntimeError("boom")
        r = check_agents(_bot(agent_manager=SimpleNamespace(_agents={"a": _A()})))
        assert r.status == "down"


class TestCheckAllCrashedChecker:
    def test_crashed_checker_recorded(self):
        def _boom(bot):
            raise RuntimeError("crashed")

        with patch.object(checker, "_ALL_CHECKERS", [_boom]):
            out = check_all(_bot())
        comp = out["components"][0]
        assert comp["status"] == "down" and "crashed" in comp["detail"]
        assert out["overall"] == "unhealthy" and out["total"] == 1
