"""One-shot trusted scheduled dispatch provenance, never tool input."""

from contextvars import ContextVar

scheduled_dispatch: ContextVar[bool] = ContextVar("scheduled_dispatch", default=False)


def consume_scheduled_dispatch() -> bool:
    """Consume before creating tasks so descendants cannot inherit authority."""
    scheduled = scheduled_dispatch.get()
    scheduled_dispatch.set(False)
    return scheduled
