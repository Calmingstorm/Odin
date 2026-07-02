"""Structured plan persistence for plan-then-execute workflows.

When a user says "plan X", the LLM generates a plan without executing.
The plan is stored server-side so "do it" / "execute" can resolve and
run the most recent pending plan for that user+channel.
"""
from __future__ import annotations

import json
import os
import time
import uuid
from dataclasses import dataclass, field, asdict
from pathlib import Path

from ..odin_log import get_logger

log = get_logger("planning")

DEFAULT_EXPIRY_SECONDS = 86400  # 24 hours


@dataclass
class ExecutionPlan:
    """A structured execution plan pending user approval."""

    plan_id: str
    user_id: str
    channel_id: str
    original_request: str
    summary: str
    steps: list[dict] = field(default_factory=list)
    created_at: float = 0.0
    expires_at: float = 0.0
    status: str = "pending"  # pending, executing, completed, expired, cancelled

    def is_expired(self) -> bool:
        return time.time() > self.expires_at

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict) -> ExecutionPlan:
        return cls(**{k: v for k, v in data.items() if k in cls.__dataclass_fields__})


class PlanStore:
    """Manages pending execution plans with user+channel scoping."""

    def __init__(self, persist_path: str = "./data/plans.json") -> None:
        self._path = Path(persist_path)
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._plans: dict[str, ExecutionPlan] = {}
        self._load()

    def _load(self) -> None:
        if self._path.exists():
            try:
                data = json.loads(self._path.read_text())
                for pid, pdata in data.items():
                    self._plans[pid] = ExecutionPlan.from_dict(pdata)
            except Exception as e:
                log.warning("Failed to load plans: %s", e)

    def _save(self) -> None:
        tmp = self._path.with_suffix(".tmp")
        # Plans embed the user's original request; write 0600 so they aren't
        # world-readable (default umask left them 0644).
        payload = json.dumps(
            {pid: p.to_dict() for pid, p in self._plans.items()},
            indent=2,
        )
        fd = os.open(str(tmp), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        try:
            os.write(fd, payload.encode())
            os.fsync(fd)
        finally:
            os.close(fd)
        tmp.replace(self._path)

    def create(
        self,
        *,
        user_id: str,
        channel_id: str,
        original_request: str,
        summary: str,
        steps: list[dict] | None = None,
        expiry_seconds: int = DEFAULT_EXPIRY_SECONDS,
    ) -> ExecutionPlan:
        now = time.time()
        # 1-second granularity meant two plans by the same user in the same
        # second collided (dict overwrite); add a short random suffix.
        plan_id = f"plan-{int(now)}-{user_id[:8]}-{uuid.uuid4().hex[:6]}"
        plan = ExecutionPlan(
            plan_id=plan_id,
            user_id=user_id,
            channel_id=channel_id,
            original_request=original_request,
            summary=summary,
            steps=steps or [],
            created_at=now,
            expires_at=now + expiry_seconds,
        )
        self._plans[plan_id] = plan
        self._prune_expired()
        self._save()
        log.info("Plan created: %s for user %s in channel %s", plan_id, user_id, channel_id)
        return plan

    def get_pending(self, user_id: str, channel_id: str) -> ExecutionPlan | None:
        """Get the most recent pending plan for a user+channel."""
        self._prune_expired()
        candidates = [
            p for p in self._plans.values()
            if p.user_id == user_id
            and p.channel_id == channel_id
            and p.status == "pending"
            and not p.is_expired()
        ]
        if not candidates:
            return None
        return max(candidates, key=lambda p: p.created_at)

    def mark_executing(self, plan_id: str) -> bool:
        plan = self._plans.get(plan_id)
        if plan and plan.status == "pending":
            plan.status = "executing"
            self._save()
            return True
        return False

    def mark_completed(self, plan_id: str) -> None:
        plan = self._plans.get(plan_id)
        if plan:
            plan.status = "completed"
            self._save()

    def mark_cancelled(self, plan_id: str) -> None:
        plan = self._plans.get(plan_id)
        if plan:
            plan.status = "cancelled"
            self._save()

    def list_pending(self, user_id: str | None = None, channel_id: str | None = None) -> list[ExecutionPlan]:
        self._prune_expired()
        results = []
        for p in self._plans.values():
            if p.status != "pending" or p.is_expired():
                continue
            if user_id and p.user_id != user_id:
                continue
            if channel_id and p.channel_id != channel_id:
                continue
            results.append(p)
        return sorted(results, key=lambda p: p.created_at, reverse=True)

    def _prune_expired(self) -> None:
        expired = [pid for pid, p in self._plans.items() if p.is_expired() and p.status == "pending"]
        for pid in expired:
            self._plans[pid].status = "expired"
        if expired:
            self._save()
