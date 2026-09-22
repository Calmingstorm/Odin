"""Fresh-install Codex model defaults and retired-model successors.

One named source of truth for the model a FRESH install starts on and for the
model a retired persisted selection migrates to. Both the schema field defaults
and every hardcoded fallback read these constants, so "what does a new install
run" is answerable without grepping for model names.

The distinction that matters for upgrades:

* A *fresh-install default* (``DEFAULT_MAIN_MODEL`` / ``DEFAULT_AUXILIARY_MODEL``
  / ``DEFAULT_AGENT_MODEL``) applies only when nothing persisted a value. An
  existing install that never wrote a leaf inherits the default, so these
  constants are not an upgrade path — see ``model_compat_defaults`` below.
* A *retirement successor* (``RETIRED_MODEL_SUCCESSOR``) is the deliberate
  exception: an install sitting on a retired model is moved on load, because
  that model can no longer be requested at all.
"""

# --- Fresh-install defaults (new users only) --------------------------------
# The GPT-6 tier is the out-of-the-box working set: a balanced main model and a
# cheaper GPT-6 auxiliary. Named so the schema, the WebUI fallbacks, and the
# agent fallbacks cannot drift apart.
DEFAULT_MAIN_MODEL = "gpt-6-sol"
DEFAULT_AUXILIARY_MODEL = "gpt-6-luna"
DEFAULT_AGENT_MODEL = "gpt-6-luna"

# --- Retired models ---------------------------------------------------------
# Requests for these fail closed at every runtime boundary; only a persisted
# selection migrates, and it moves to the current balanced tier.
RETIRED_MODELS: frozenset[str] = frozenset({"gpt-5.3-codex-spark", "gpt-5.5"})
RETIRED_MODEL_SUCCESSOR = "gpt-6-sol"

# --- Upgrade-compatibility defaults (everyone else) -------------------------
# ``OpenAICodexConfig.model`` / ``AuxiliaryLLMConfig.model`` are read directly by
# the live Codex client and the auxiliary client. An existing install whose YAML
# never wrote those leaves inherits the field default, so raising them to the
# GPT-6 tier would silently move a running install onto a different model on
# upgrade. These constants therefore stay at the model existing installs already
# run. Only a fresh install should start on the GPT-6 tier, and a fresh install
# writes the leaves explicitly (see ``setup_wizard._DEFAULT_CONFIG``).
COMPAT_MAIN_MODEL = "gpt-5.6-sol"
COMPAT_AUXILIARY_MODEL = "gpt-5.6-terra"

# ``LLMProviderConfig.model`` is the PINNED per-request serving model and it
# overrides the Codex client's own model, so this is a third place an existing
# install can silently move from. It is materialized from ``openai_codex.model``
# only when an ``llm_provider`` block exists and lacks ``model``; a config with
# no ``llm_provider`` block at all falls through to this default. Both paths must
# therefore keep an existing install on the model it runs today, so this stays
# aligned with ``COMPAT_MAIN_MODEL`` rather than the fresh-install tier.
#
# A fresh install still reaches the GPT-6 tier because it writes the model
# leaves explicitly: ``setup_wizard`` writes ``openai_codex.model`` plus an
# ``llm_provider`` block carrying only ``active_provider``, which is then
# materialized from that leaf. Writing ``model`` here explicitly instead would
# create a second, later-diverging source of truth.
COMPAT_LLM_PROVIDER_MODEL = COMPAT_MAIN_MODEL
