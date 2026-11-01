"""Desktop-only admission, ownership and input policy independent of tool presentation."""

from .models import BackendCapabilities, ComputerError, RequestContext, SessionGrant

MAX_TASK_SECONDS = 4 * 3600  # Absolute lifetime, never renewed by activity.
IDLE_TASK_SECONDS = 30 * 60
MAX_ACTIONS = 2000
MAX_INPUT_SECONDS = 2.0
# Native dispatch/release remains independently leased at <= MAX_INPUT_SECONDS.
# Privileged startup and post-release capture are not injected input.
MAX_ACTION_RPC_SECONDS = 5.0
# Typed text runs in one input lease per few dozen keys, each with its own
# worker start and per-key checks (about 25 ms a key, measured 2026-11-01). The
# costliest supported character, AltGr+Shift+key, is six key events: about
# 150 ms with checks, plus its share of lease starts.
TEXT_RPC_SECONDS_PER_CHARACTER = 0.2
MAX_POINTS = 256
MAX_BATCH = 8
FRAME_FRESH_SECONDS = 5.0
DELIVERED_GROUNDING_SECONDS = 120.0
# Selection binding must outlive a real observe->plan->select cycle: a thinking
# model reads references and deliberates between target inventory and selection.
# Frame freshness (5s) is re-checked independently at action time, so a generous
# bounded window here does not loosen action/observation freshness.
SELECTION_BINDING_SECONDS = 300.0
STOP_TIMEOUT_SECONDS = 3.0
# Existing-session teardown must allow the privileged capture alarm (5s),
# wrapper exit and exact-identity census. Isolated stop keeps its original bound.
ATTACHED_STOP_TIMEOUT_SECONDS = 10.0
# Portal consent plus isolated same-stack qualification are pre-input phases.
# This never extends the independent two-second active input lease.
WAYLAND_START_TIMEOUT_SECONDS = 180.0


def foreground(context: RequestContext) -> None:
    if (
        not isinstance(context, RequestContext)
        or context.origin != "foreground"
        or context.surface not in {"discord", "webui"}
    ):
        raise ComputerError("foreground_only")


def owned(context: RequestContext, grant: SessionGrant, *, same_turn: bool = True) -> None:
    if (
        context.owner_id != grant.owner_id
        or context.channel_id != grant.channel_id
        or context.host_id != grant.host_id
        or (same_turn and context.turn_id != grant.turn_id)
    ):
        raise ComputerError("not_found")


def exact_keys(value: dict, allowed: set[str], required: set[str] | None = None) -> None:
    if not isinstance(value, dict) or set(value) - allowed or (required or set()) - set(value):
        raise ComputerError("invalid_arguments")


def integer(value, minimum: int, maximum: int) -> int:
    if type(value) is not int or not minimum <= value <= maximum:
        raise ComputerError("invalid_bounds")
    return value


def input_eligible(capabilities: BackendCapabilities) -> None:
    if type(capabilities) is not BackendCapabilities:
        raise ComputerError("backend_capabilities_unknown")
    if capabilities.environment == "existing_session" and (
        not (capabilities.owned_input_release == "verified" or (
            capabilities.platform == "wayland" and capabilities.backend == "hyprland"
            and capabilities.owned_input_release == "hyprland_best_effort"
        ))
        or capabilities.application_preserving_detach != "verified"
    ):
        raise ComputerError("assisted_input_lifecycle_unproven")


def observation_input(grant, live, observation) -> None:
    input_eligible(live.capabilities)
    source = observation.source
    if (
        observation.session_id != grant.session_id
        or observation.generation != grant.generation
        or source.consent_generation != grant.consent_generation
    ):
        raise ComputerError("stale_observation_binding")
    if source.source_id not in observation.scope.input_sources:
        raise ComputerError("input_not_granted")
    if source.pixel_to_input is None:
        raise ComputerError("input_mapping_unknown")
    if not observation.focused:
        raise ComputerError("input_focus_unavailable")


def action_rpc_seconds(payload) -> float:
    """Bound for one backend act: the fixed allowance plus typed text's own work."""
    text = (payload.get("text") if type(payload) is dict
            and payload.get("type") in {"type", "replace_field_pixels"} else None)
    return MAX_ACTION_RPC_SECONDS + (
        TEXT_RPC_SECONDS_PER_CHARACTER * len(text) if type(text) is str else 0.0)
