# Documentation campaign: issues #434–#442

Worktree: `/home/odin/campaign-v410-worktrees/docs` (`work/v410-docs`).

| Issue | Change / verified behavior | Commit | Tests |
|---|---|---|---|
| #434 | Clarified update self-re-exec versus setup wizard save; wizard reports operator restart requirement and does not schedule re-exec. | `150e491` | `tests/test_docs_campaign_contracts.py::test_setup_restart_docs_distinguish_update_from_wizard` |
| #435 | Replaced rejected WebSocket query-token guidance with browser bearer subprotocol, Authorization header option and query-token rejection. | `150e491` | `...::test_websocket_auth_docs_describe_supported_carriers_and_reject_query_tokens` |
| #436 | Corrected Hyprland first-use description with bounded identity discovery and managed plugin activation conditions. | `150e491` | `...::test_hyprland_operator_guide_covers_bounded_managed_first_use` |
| #437 | Documented Sol/Luna versus GPT-6.1 Sol effort and input-budget differences. | `150e491` | `...::test_documented_codex_effort_limits_match_authoritative_defaults` |
| #438 | Removed weekly manual Codex login claim; documented automatic refresh and reauthorization on genuine failure without fixed lifetime claims. | `150e491` | Test file verifies docs contract and key claims; no independent refresh-flow assertion. |
| #439 | Expanded provider overview to Codex, generic OpenAI-compatible endpoints (including Kimi) and Ollama. | `150e491` | `...::test_provider_overview_includes_generic_compatible_lane` |
| #440 | Removed stale overview counts and obsolete metrics/Grafana claims. Overview refers to source registries/characterization tests and package manifest rather than guessed literals. Parent owns final generated reference and final route/tool/handoff inventory counts after integration. | `150e491` | `...::test_route_inventory_claim_is_registry_backed_not_a_stale_literal`, `...::test_static_tools_and_packaged_handoffs_use_authoritative_inventory_contracts`, `...::test_docs_do_not_claim_removed_native_grafana_or_prometheus_features` |
| #441 | Clarified tool iteration caps count model/tool batches, with the loop cap per cycle and `start_loop.max_iterations` as lifetime cycle count. | `150e491` | `...::test_tool_iteration_explanation_distinguishes_batch_and_cycle_budget` |
| #442 | Corrected retired-model successor to `gpt-6-sol`; verified migration source of truth. | `150e491` | `...::test_retired_model_documentation_matches_migration_and-successor` |

Validation run from this worktree:

```text
/home/odin/odin-dev/.venv/bin/python -m pytest tests/test_docs_campaign_contracts.py -q
10 passed, 1 warning (third-party audioop deprecation)
```

Generated `docs/reference/*` and `CHANGELOG.md` intentionally untouched; parent will regenerate references/counts during integration. No live calls, deployment, service changes, or destructive commands.
