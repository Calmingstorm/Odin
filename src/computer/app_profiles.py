"""Fixed profile eligibility, not evidence of successful GUI qualification."""

ISOLATED_PROFILES = frozenset({"drawing", "xed"})
ATTACHED_NATIVE_PROFILES = frozenset({"xed", "libreoffice", "inkscape"})
ATTACHED_PROFILES = ISOLATED_PROFILES | ATTACHED_NATIVE_PROFILES


def validate_profile(app, *, platform, environment):
    from .models import ComputerError

    if not isinstance(app, str) or app not in ATTACHED_PROFILES:
        raise ComputerError("unsupported_app")
    if app not in ISOLATED_PROFILES and (platform, environment) != ("x11", "existing_session"):
        raise ComputerError("application_environment_unsupported")


def validate_attached_only_profile(app, *, platform, environment):
    """Other custom adapter names stay backend-owned; production validates all."""
    if app in ATTACHED_NATIVE_PROFILES - ISOLATED_PROFILES:
        validate_profile(app, platform=platform, environment=environment)
