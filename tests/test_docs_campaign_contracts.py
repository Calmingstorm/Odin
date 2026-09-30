"""Regression checks for current operator-facing documentation claims."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_route_inventory_claim_is_registry_backed_not_a_stale_literal():
    readme = (ROOT / "README.md").read_text()
    parity = (ROOT / "tests/characterization/test_api_route_parity.py").read_text()
    assert "211 REST routes" not in readme
    assert "231" in parity and "authoritative route characterization test" in readme


def test_static_tools_and_packaged_handoffs_use_authoritative_inventory_contracts():
    from src.tools.registry import TOOLS

    package = (ROOT / "packaging/nfpm.yml").read_text()
    readme = (ROOT / "README.md").read_text()
    static_names = {tool["name"] for tool in TOOLS}
    core_names = {tool["name"] for tool in TOOLS if tool.get("is_core")}
    import yaml

    package_config = yaml.safe_load(package)
    shipped_handoffs = {
        Path(row["dst"]).name for row in package_config["contents"]
        if row.get("dst", "").startswith("/usr/share/doc/odin/computer-use/")
    }
    assert static_names and core_names and shipped_handoffs
    assert "registers 67 built-in tools" not in readme
    assert "dynamic" in readme.lower() and "static built-in tool catalog" in readme
    assert "operator handoffs listed in `packaging/nfpm.yml` ship in the package" in readme
    # Keep these values computed from the runtime/package definitions rather
    # than copying guessed totals into overview prose.
    assert len(static_names) == len(TOOLS)
    assert len(shipped_handoffs) > 0


def test_retired_model_documentation_matches_migration_and_successor():
    from src.config.model_defaults import RETIRED_MODEL_SUCCESSOR

    guide = (ROOT / "docs/configuration.md").read_text()
    assert RETIRED_MODEL_SUCCESSOR == "gpt-6-sol"
    assert (
        "explicit main, fixed-agent, and auxiliary selections migrate in memory to\n`gpt-6-sol`"
    ) in guide
    assert "`gpt-5.6-terra`, with a warning. Existing effort selections are preserved." not in guide


def test_documented_codex_effort_limits_match_authoritative_defaults():
    from src.config.schema import CODEX_MODEL_INPUT_BUDGETS, CODEX_MODEL_UNSUPPORTED_EFFORTS

    guide = (ROOT / "docs/configuration.md").read_text()
    assert "none" in CODEX_MODEL_UNSUPPORTED_EFFORTS["gpt-6.1-sol"]
    assert CODEX_MODEL_INPUT_BUDGETS["gpt-6.1-sol"] == 921_849
    assert "GPT-6.1 Sol accepts `low`, `medium`, `high`," in guide
    assert "921,849 tokens" in guide


def test_websocket_auth_docs_describe_supported_carriers_and_reject_query_tokens():
    from src.web.websocket import BEARER_SUBPROTOCOL_PREFIX

    guide = (ROOT / "docs/security.md").read_text()
    handler = (ROOT / "src/web/websocket.py").read_text()
    assert BEARER_SUBPROTOCOL_PREFIX == "odin.bearer."
    assert "Authorization:" in guide and "Bearer <token>" in guide
    assert "odin.bearer.<base64url(token, unpadded)>" in guide
    assert "`/api/ws?token=...` is explicitly rejected (close" in guide
    assert "token in URL is not accepted" in handler


def test_setup_restart_docs_distinguish_update_from_wizard():
    guide = (ROOT / "docs/configuration.md").read_text()
    onboarding = (ROOT / "src/web/onboarding.py").read_text()
    assert "does not schedule\nor perform that re-exec" in guide
    assert "restart_required" in onboarding


def test_hyprland_operator_guide_covers_bounded_managed_first_use():
    guide = (ROOT / "docs/computer-use/HYPRLAND-OPERATOR-R32.md").read_text()
    assert "first inventory or session start may discover" in guide
    assert "managed activation may load the approved" in guide
    assert "Neither\nsession start nor turn dispatch discovers an ambient target" not in guide


def test_provider_overview_includes_generic_compatible_lane():
    from src.config.schema import OpenAICompatibleConfig

    readme = (ROOT / "README.md").read_text()
    guide = (ROOT / "docs/configuration.md").read_text()
    assert OpenAICompatibleConfig is not None
    assert "OpenAI-compatible endpoints" in readme
    for name in ("DeepSeek", "OpenRouter", "vLLM", "llama.cpp", "LM Studio"):
        assert name in guide
    assert "Kimi is also available through this compatible lane" in readme


def test_tool_iteration_explanation_distinguishes_batch_and_cycle_budget():
    guide = (ROOT / "docs/configuration.md").read_text()
    loop = (ROOT / "src/discord/tool_loop.py").read_text()
    assert "not individual tool calls" in guide
    assert "per autonomous loop cycle" in guide
    assert "start_loop.max_iterations" in guide
    assert "max_tool_iterations_loop" in loop and "loop_cap" in loop


def test_docs_do_not_claim_removed_native_grafana_or_prometheus_features():
    readme = (ROOT / "README.md").read_text().lower()
    scheduling = (ROOT / "docs/scheduling.md").read_text().lower()
    assert "/metrics" not in readme
    assert "grafana alerts" not in readme
    assert "/webhook/grafana" not in scheduling
    assert "grafana remediation" not in scheduling

