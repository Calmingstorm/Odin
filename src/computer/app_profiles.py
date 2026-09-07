"""Fixed application and task offering, separate from measured input readiness."""

ISOLATED_PROFILES = frozenset({"drawing", "xed"})
ATTACHED_NATIVE_PROFILES = frozenset({"xed", "writer", "inkscape"})
ATTACHED_PROFILES = ISOLATED_PROFILES | ATTACHED_NATIVE_PROFILES
NOT_OFFERED_PROFILES = frozenset({"libreoffice", "calc", "draw",
                                 "libreoffice-calc", "libreoffice-draw"})
WAYLAND_PROFILES = frozenset({"inkscape"})
WRITER_KEYS = frozenset({"Return", "Escape", "BackSpace", "Delete", "space",
                         "ctrl+a", "ctrl+b", "ctrl+s", "ctrl+shift+s"})


def application_profile(app, *, platform, environment):
    """Pure public declarations, never probes, permission grants or success claims."""
    if platform == "wayland":
        if environment != "existing_session" or app not in WAYLAND_PROFILES:
            return None
        return {"id": app, "label": "Inkscape", "input": "supported", "reason": None,
                "qualification": "pending_composed_task",
                "qualified_tasks": [],
                "not_offered_tasks": ["File dialogs", "Open/new/close/reopen",
                                      "Other applications"],
                "task_scope": "Focused native Inkscape canvas and bounded keyboard input. "
                              "Operator opens the document. Dialogs are refused. "
                              "Per-session compositor qualification and portal consent "
                              "are required."}
    attached = environment == "existing_session"
    profiles = ATTACHED_PROFILES if attached else ISOLATED_PROFILES
    if (platform != "x11" or environment not in {"isolated", "existing_session"}
            or app not in profiles):
        return None
    capture_only = attached and app not in ATTACHED_NATIVE_PROFILES
    labels = {"drawing": "Drawing", "xed": "Xed", "inkscape": "Inkscape",
              "writer": "LibreOffice Writer only"}
    result = {"id": app, "label": labels[app],
              "input": "capture_only" if capture_only else "supported",
              "reason": "attached_application_provenance_unavailable" if capture_only else None}
    if app == "writer":
        result.update(
            qualification="partial_isolated_fixture",
            qualified_tasks=["Short ASCII note, paragraph break, bold formatting and GUI ODT save"],
            not_offered_tasks=["Document close/reopen", "Open/new document", "Pointer/menu input",
                               "Calc/Draw or other LibreOffice components"],
            task_scope="Keyboard-only Writer note and save. Operator opens and focuses a new "
                       "document. Close/reopen is not offered; "
                       "save evidence is not reopen evidence.",
            input_operations=["type", "key"], input_keys=sorted(WRITER_KEYS))
    elif app == "inkscape":
        result.update(
            qualification="recorded_tasks_only",
            qualified_tasks=["Simple shapes / three-part house and GUI SVG save"],
            not_offered_tasks=["Disk close/reopen qualification"],
            task_scope="See R6 drawing/save evidence and fixture limits; "
                       "arbitrary tasks are not qualified.")
    return result


def validate_profile_action(app, inp):
    """No Writer pointer/menu or document lifecycle input through the offered tool.

    Scope is still checked independently before every native input. This narrow
    keyboard subset preserves the measured note/bold/save task without pretending
    arbitrary coordinates or menu navigation can be classified as safe editing.
    """
    from .models import ComputerError

    if app in NOT_OFFERED_PROFILES:
        raise ComputerError("unsupported_app")
    if app == "writer" and (inp.get("operation") not in {"type", "key"}
                            or inp.get("operation") == "key" and inp.get("key") not in WRITER_KEYS):
        raise ComputerError("application_task_not_offered")


def validate_profile(app, *, platform, environment):
    from .models import ComputerError

    if not isinstance(app, str) or app not in ATTACHED_PROFILES:
        raise ComputerError("unsupported_app")
    if platform == "wayland":
        if app not in WAYLAND_PROFILES or environment != "existing_session":
            raise ComputerError("application_environment_unsupported")
        return
    if app not in ISOLATED_PROFILES and (platform, environment) != ("x11", "existing_session"):
        raise ComputerError("application_environment_unsupported")


def validate_attached_only_profile(app, *, platform, environment):
    """Other custom adapter names stay backend-owned; production validates all."""
    if app in (ATTACHED_NATIVE_PROFILES - ISOLATED_PROFILES) | NOT_OFFERED_PROFILES:
        validate_profile(app, platform=platform, environment=environment)
