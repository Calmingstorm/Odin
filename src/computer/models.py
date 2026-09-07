"""Dependency-light server authority and evidence records."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, Literal

from .geometry import AffineTransform, SourceGeometry, dimension, opaque_id

if TYPE_CHECKING:
    from .vision import FrameMetadata


class ComputerError(ValueError):
    """A bounded safe error suitable for a tool response."""

    def __init__(self, code: str):
        self.code = code
        super().__init__(code)


@dataclass(frozen=True)
class RequestContext:
    """Construct exclusively from authenticated transport state, never model arguments."""

    owner_id: str
    channel_id: str
    turn_id: str
    host_id: str
    origin: str = "foreground"
    surface: str = "discord"

    def __post_init__(self):
        for value in (self.owner_id, self.channel_id, self.turn_id, self.host_id):
            if not isinstance(value, str) or not value or len(value) > 256:
                raise ComputerError("invalid_provenance")


@dataclass(frozen=True)
class SessionGrant:
    session_id: str
    owner_id: str
    channel_id: str
    turn_id: str
    host_id: str
    generation: int
    state: str
    app: str
    created_at: float
    expires_at: float
    actions: int = 0
    consent_generation: int = 1
    platform: str = "x11"
    environment: str = "isolated"

    def public(self) -> dict[str, Any]:
        return {"session_id": self.session_id, "generation": self.generation,
                "state": self.state, "app": self.app, "actions": self.actions,
                "expires_at": self.expires_at, "consent_generation": self.consent_generation,
                "platform": self.platform, "environment": self.environment}


@dataclass(frozen=True)
class BackendCapabilities:
    """Platform and lifecycle authority are independent."""
    platform: str
    environment: str
    pointer_separation: str = "unknown"
    keyboard_separation: str = "unknown"
    owned_input_release: str = "unknown"
    application_preserving_detach: str = "unknown"

    def __post_init__(self):
        if self.platform not in {"x11", "wayland"} or self.environment not in {
            "isolated", "existing_session"
        }:
            raise ComputerError("unsupported_backend_contract")
        if any(v not in {"independent", "shared", "unknown"} for v in (
            self.pointer_separation, self.keyboard_separation
        )):
            raise ComputerError("invalid_input_separation")
        if any(type(v) is not str or v not in {"verified", "failed", "unknown"} for v in (
            self.owned_input_release, self.application_preserving_detach
        )):
            raise ComputerError("invalid_input_lifecycle")

    def public(self) -> dict[str, Any]:
        """Report limitations without inventing a platform-wide input guarantee."""
        limitations = []
        for kind in ("pointer", "keyboard"):
            separation = getattr(self, f"{kind}_separation")
            if separation != "independent":
                limitations.append(f"{kind}_separation_{separation}")
        for kind in ("owned_input_release", "application_preserving_detach"):
            if getattr(self, kind) != "verified":
                limitations.append(f"{kind}_{getattr(self, kind)}")
        return {"platform": self.platform, "environment": self.environment,
                "pointer_separation": self.pointer_separation,
                "keyboard_separation": self.keyboard_separation,
                "owned_input_release": self.owned_input_release,
                "application_preserving_detach": self.application_preserving_detach,
                "limitations": limitations}


@dataclass(frozen=True)
class CaptureScope:
    """Capture consent does not grant input reach or task authority."""
    consent_generation: int
    capture_sources: frozenset[str]
    input_sources: frozenset[str] = frozenset()

    def __post_init__(self):
        if type(self.consent_generation) is not int or not 1 <= self.consent_generation < 2**63:
            raise ComputerError("invalid_consent_generation")
        for name in ("capture_sources", "input_sources"):
            values = frozenset(getattr(self, name))
            for value in values:
                opaque_id(value)
            object.__setattr__(self, name, values)
        if not self.input_sources <= self.capture_sources:
            raise ComputerError("input_outside_capture_scope")


@dataclass(frozen=True)
class BackendObservation:
    """Trusted adapter metadata with untrusted pixels; never native window IDs."""
    source: SourceGeometry
    scope: CaptureScope
    width: int
    height: int
    delivered_to_source: AffineTransform
    image_bytes: bytes = field(repr=False)
    focused: bool = False
    modal: str | None = None
    crop: tuple[int, int, int, int] | None = None
    rotation: Literal[0, 90, 180, 270] = 0
    resize_scale: tuple[int, int] = (1, 1)
    resize_rounding: Literal["nearest", "floor"] = "nearest"
    modal_kind: str | None = None
    accessibility: tuple[dict, ...] = ()

    def __post_init__(self):
        dimension(self.width)
        dimension(self.height)
        if (type(self.source) is not SourceGeometry or type(self.scope) is not CaptureScope
                or type(self.delivered_to_source) is not AffineTransform
                or type(self.image_bytes) is not bytes or type(self.focused) is not bool):
            raise ComputerError("invalid_backend_observation")
        if self.modal is not None:
            opaque_id(self.modal)
        if self.modal_kind not in {None, "safe_application", "unrecognized"}:
            raise ComputerError("invalid_modal_classification")
        if self.modal is None and self.modal_kind is not None:
            raise ComputerError("invalid_modal_classification")
        if type(self.accessibility) is not tuple or len(self.accessibility) > 128:
            raise ComputerError("invalid_accessibility_metadata")
        if (self.source.source_id not in self.scope.capture_sources
                or self.source.consent_generation != self.scope.consent_generation):
            raise ComputerError("capture_not_granted")
        for x, y in ((0, 0), (self.width, 0), (0, self.height), (self.width, self.height)):
            sx, sy = self.delivered_to_source.map_point(x, y)
            if not (0 <= sx <= self.source.pixel_width and 0 <= sy <= self.source.pixel_height):
                raise ComputerError("capture_transform_outside_source")


@dataclass(frozen=True)
class Observation:
    observation_id: str
    session_id: str
    generation: int
    captured_at: float
    width: int
    height: int
    source: SourceGeometry
    scope: CaptureScope
    delivered_to_source: AffineTransform
    focused: bool
    modal: str | None
    evidence_id: str
    image_sha256: str
    frame_metadata: FrameMetadata | None = None
    modal_kind: str | None = None
    accessibility: tuple[dict, ...] = ()

    @property
    def geometry(self) -> tuple:
        return (self.source, self.scope, self.width, self.height, self.delivered_to_source,
                self.focused, self.modal, self.modal_kind)

    def public(self) -> dict[str, Any]:
        return {"observation_id": self.observation_id, "session_id": self.session_id,
                "generation": self.generation, "width": self.width, "height": self.height,
                "captured_monotonic_ns": max(1, int(self.captured_at * 1_000_000_000)),
                "frame_metadata": (None if self.frame_metadata is None
                                   else self.frame_metadata.public()),
                "capture_time_basis": "request_start_lower_bound",
                "source": self.source.public(), "modal": self.modal, "focused": self.focused,
                "modal_kind": self.modal_kind,
                "consent_generation": self.scope.consent_generation,
                "capture_sources": sorted(self.scope.capture_sources),
                "input_sources": sorted(self.scope.input_sources),
                "evidence_id": self.evidence_id,
                "delivered_to_source": self.delivered_to_source.public(),
                "untrusted_desktop_data": True}


@dataclass
class LiveSession:
    backend: Any
    deadline: float
    observations: dict[str, Observation] = field(default_factory=dict)
    modal_identity: Any = None
    capabilities: BackendCapabilities | None = None
