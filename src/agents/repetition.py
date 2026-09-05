"""Private result-aware backstop, independent of chat's stuck-loop policy."""

import hashlib
import json
from dataclasses import dataclass

_REPEAT_NUDGE_AT = 3


@dataclass
class RepetitionGuard:
    fingerprint: str = ""
    repeats: int = 0

    def observe(self, calls: list[dict], results: list[dict]) -> str:
        """Compare ordered calls AND outcomes, never correlation IDs or timing.

        Parent-prevented calls are not repeated executions. Changed inputs or
        results reset the streak. Retain only a digest, not another payload copy.
        """
        pairs = [
            {
                "name": c["name"],
                "input": c["input"],
                "result": r["result"],
                "status": r["status"],
                "uncertain_outcome": r.get("uncertain_outcome", False),
            }
            for c, r in zip(calls, results, strict=True)
            if r["status"] not in {"not_executed", "invalid_arguments", "interrupted_effect_free"}
        ]
        fingerprint = (
            hashlib.sha256(json.dumps(pairs, sort_keys=True, default=str).encode()).hexdigest()
            if pairs
            else ""
        )
        if fingerprint and fingerprint == self.fingerprint:
            self.repeats += 1
        else:
            self.fingerprint, self.repeats = fingerprint, 1 if fingerprint else 0
        if self.repeats == _REPEAT_NUDGE_AT:
            return "nudge"
        if self.repeats > _REPEAT_NUDGE_AT:
            return "stop"
        return ""
