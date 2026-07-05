"""The one blessed way to build a real OdinBot in tests (RFC-001 Phase 0).

Every characterization test constructs the bot through here so the config
baseline is shared and future decomposition phases have exactly one factory
to keep working.

Usage (typical fixture — note the cwd isolation; OdinBot hardcodes
relative ./data/... paths, so tests must chdir to tmp_path FIRST):

    @pytest.fixture
    def bot(tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        return make_bot()

    @pytest.fixture
    def bot_with_llm(tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        fake = FakeLLM([...script...])
        return make_bot(fake_llm=fake), fake
"""

from __future__ import annotations

from pathlib import Path


def _deep_merge(base: dict, override: dict) -> dict:
    out = dict(base)
    for k, v in override.items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _deep_merge(out[k], v)
        else:
            out[k] = v
    return out


def make_bot(*, config_overrides: dict | None = None, fake_llm=None):
    """Construct a real OdinBot from a minimal test Config.

    Baseline mirrors tests/test_executor_integration_smoke.py::_make_bot
    (default_tier=admin matches the live deployment so the RBAC gate does
    not deny admin-tier tools), plus:

    - search disabled: keeps construction hermetic and fast; tests that
      characterize knowledge flows opt back in via config_overrides.
    - openai_codex stays disabled (schema default) → codex_client is None
      until a FakeLLM is installed.

    If ``fake_llm`` is given it is installed at ``bot.codex_client`` — the
    single attribute BOTH pipelines resolve their provider from (the chat
    loop via the llm_client property inside _codex_call, the autonomous
    loop via self.llm_client directly).

    The caller is responsible for cwd isolation (see module docstring);
    this function only asserts it is NOT running in the repo root, so a
    forgotten chdir fails loudly instead of writing ./data into the repo.
    """
    if (Path.cwd() / "pyproject.toml").exists() and (Path.cwd() / "src" / "discord").exists():
        raise AssertionError(
            "make_bot() called with cwd == repo root. OdinBot writes relative "
            "./data/... paths; chdir to tmp_path first (monkeypatch.chdir)."
        )
    Path("./data").mkdir(exist_ok=True)

    from src.config.schema import Config
    from src.discord.client import OdinBot

    base: dict = {
        "discord": {"token": "characterization-test-token"},
        "permissions": {"default_tier": "admin"},
        "search": {"enabled": False},
    }
    cfg = Config(**_deep_merge(base, config_overrides or {}))
    bot = OdinBot(cfg)
    if fake_llm is not None:
        bot.codex_client = fake_llm
    return bot
