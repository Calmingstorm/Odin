"""Durable, deliberately small onboarding publication coordinator.

This is not a second configuration writer.  It composes the existing leaf
round-trip config writer, the declared environment editor, and the durable
initialization gate.  Those stores cannot make a cross-file transaction, so a
failed publication *intentionally* leaves initialization pending for an
operator retry rather than lying that setup completed.
"""
from __future__ import annotations

import asyncio
import os
from dataclasses import dataclass, field
from typing import Any

from ..config.environment import EnvironmentSource, edit_environment
from ..config.initialization import (
    InitializationAlreadyCompleteError,
    InitializationMode,
    InitializationRecoveryRequiredError,
    InitializationStore,
)
from ..config.persistence import (
    _run_settled,
    config_transaction,
    patch_config_paths,
    submitted_leaves,
)
from ..config.schema import Config


class OnboardingError(RuntimeError):
    """A safe-to-display onboarding failure."""


@dataclass(frozen=True, slots=True)
class OnboardingSubmitResult:
    """Durable publication and optional gateway activation are separate facts."""

    persisted: bool
    gateway_attached: bool | None
    activation_detail: str = ""
    config_committed: bool = False
    environment_committed: bool = False
    initialization_complete: bool = False


@dataclass(slots=True)
class OnboardingCoordinator:
    """Active-installation onboarding context supplied at application startup.

    ``initialization_store`` and ``environment_source`` are explicit startup
    context, never inferred from the current directory.  ``legacy_loopback``
    is the already-verified listener decision used only to migrate an install
    which predates the initialization record.
    """

    initialization_store: InitializationStore
    environment_source: EnvironmentSource
    legacy_loopback_restricted: bool
    _lock: asyncio.Lock = field(default_factory=asyncio.Lock, init=False, repr=False)

    async def state(self):
        return await asyncio.to_thread(
            self.initialization_store.state,
            legacy_loopback_restricted=self.legacy_loopback_restricted,
        )

    async def submit(
        self,
        bot: Any,
        *,
        discord_token: str | None,
        web_api_token: str | None,
        config_updates: dict[str, Any] | None = None,
    ) -> OnboardingSubmitResult:
        """Publish only setup-owned credentials, then mark state complete.

        The async lock and ``config_transaction`` serialize in-process setup
        with every ordinary config writer. The synchronous publisher runs
        inside ``InitializationStore.complete``: it writes config then env,
        and the store publishes complete last. Multi-file atomicity does not
        exist, so failures are reconciled from the durable state record.
        """
        async with self._lock:
            state = await self.state()
            if state.mode is InitializationMode.COMPLETE:
                raise InitializationAlreadyCompleteError("initialization is already complete")
            if state.mode is InitializationMode.RECOVERY:
                raise InitializationRecoveryRequiredError(state.detail or "state needs recovery")

            async with config_transaction():
                current = bot.config.model_dump()
                updates: dict[str, Any] = config_updates.copy() if config_updates else {}
                for key in updates:
                    if key not in {"timezone", "tools", "browser", "comfyui"}:
                        raise OnboardingError("setup includes an unsupported configuration field")
                # Setup is leaf-scoped. It must not replace a legacy operator's
                # unrelated settings with a fresh-install template.
                for key, value in updates.items():
                    if key == "timezone":
                        current[key] = value
                    elif key in {"tools", "browser", "comfyui"}:
                        if not isinstance(value, dict):
                            raise OnboardingError("setup configuration is invalid")
                        current[key].update(value)
                if web_api_token is not None:
                    current["web"]["api_token"] = web_api_token
                    # The web credential is one setup-owned leaf. Do not erase
                    # hosts, timezone, or features submitted with it.
                    updates.setdefault("web", {})["api_token"] = web_api_token
                if discord_token is not None:
                    current["discord"]["token"] = discord_token
                try:
                    candidate = Config(**current)
                    health = getattr(bot, "health_server", None)
                    if health is not None:
                        health.validate_web_credential_transition(candidate.web)
                except Exception as exc:
                    raise OnboardingError("setup configuration is invalid") from exc
                changes = submitted_leaves(updates, candidate.model_dump(), Config)

                # One settled synchronous publisher runs under the durable
                # initialization lock.  _run_settled waits for its worker even
                # after request cancellation, so the async config lock cannot
                # be released while a write still mutates either file.
                config_committed = False
                environment_committed = False

                def publish() -> None:
                    nonlocal config_committed, environment_committed
                    def files() -> None:
                        nonlocal config_committed, environment_committed
                        if changes:
                            patch_config_paths(
                                changes,
                                path=self.initialization_store.binding.config_path,
                            )
                            config_committed = True
                        if discord_token is not None:
                            result = edit_environment(
                                self.environment_source,
                                {"DISCORD_TOKEN": discord_token},
                            )
                            environment_committed = True
                            if not result.durable:
                                raise OnboardingError(
                                    "setup environment durability could not be confirmed"
                                )
                    self.initialization_store.complete(files)

                exc, cancelled = await _run_settled(publish)
                observed = await self.state()
                if exc is not None:
                    # Config/env publication can fail after a file commit, and
                    # completion durability can fail after its rename.  Read
                    # the record rather than inventing a pending outcome.
                    # A directory fsync can fail after the state-file rename.
                    # A complete record is authoritative: reconcile below and
                    # never invite a destructive replay of setup writes.
                    if observed.mode is not InitializationMode.COMPLETE:
                        reconciled = bot.config.model_copy(deep=True)
                        if config_committed:
                            reconciled = candidate.model_copy(deep=True)
                            if not environment_committed:
                                reconciled.discord.token = bot.config.discord.token
                        if environment_committed and discord_token is not None:
                            reconciled.discord.token = discord_token
                            os.environ["DISCORD_TOKEN"] = discord_token
                        bot.config = reconciled
                        if cancelled:
                            raise asyncio.CancelledError
                        raise OnboardingError(
                            "setup publication failed; "
                            f"config_committed={config_committed}; "
                            f"environment_committed={environment_committed}; "
                            f"current setup mode is {observed.mode.value}"
                        ) from exc
                # Runtime publication follows durable config exactly as generic
                # config does.  Update process environment only after the
                # declared source accepted it, so an inherited old token cannot
                # later reassert itself.
                bot.config = candidate
                health = getattr(bot, "health_server", None)
                publish_web = getattr(health, "publish_web_config", None)
                if publish_web is not None:
                    publish_web(candidate.web)
                if discord_token is not None:
                    os.environ["DISCORD_TOKEN"] = discord_token
                # InitializationStore.complete made state complete only after
                # both synchronous publications returned.
                # The credential is durable before activation is attempted.
                # A gateway failure is not a failed write, and cannot revive
                # an inherited stale process token.
                attached: bool | None = None
                detail = ""
                # Do not attach a gateway after an explicitly cancelled
                # request. Durable startup desired state consumes it later.
                if cancelled:
                    raise asyncio.CancelledError
                if discord_token is not None:
                    supervisor = getattr(bot, "connection_supervisor", None)
                    if supervisor is None:
                        detail = "Discord credential saved; gateway activation is unavailable"
                    else:
                        try:
                            await supervisor.attach(discord_token)
                            attached = True
                        except Exception as exc:
                            attached = False
                            detail = (
                                "Discord credential saved; gateway activation failed: "
                                f"{type(exc).__name__}"
                            )
                return OnboardingSubmitResult(
                    persisted=True,
                    gateway_attached=attached,
                    activation_detail=detail,
                    config_committed=config_committed,
                    environment_committed=environment_committed,
                    initialization_complete=True,
                )

