"""Launch containment for the isolated tier, never attached application policy."""

ISOLATED_PROFILES = frozenset({"drawing", "xed"})


def application_profile(app, *, platform, environment):
    """Describe isolated launches only. Attached sessions have no app profile."""
    if platform != "x11" or environment != "isolated" or app not in ISOLATED_PROFILES:
        return None
    return {
        "id": app,
        "label": {"drawing": "Drawing", "xed": "Xed"}[app],
        "input": "supported",
        "reason": None,
    }


def validate_profile(app, *, platform, environment):
    """Only the sandbox launcher has a fixed executable offering."""
    from .models import ComputerError

    if environment == "existing_session":
        return
    if not isinstance(app, str) or app not in ISOLATED_PROFILES:
        raise ComputerError("unsupported_app")
    if (platform, environment) != ("x11", "isolated"):
        raise ComputerError("application_environment_unsupported")
