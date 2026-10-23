from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import os
import tempfile
import time
import uuid
from pathlib import Path

import aiohttp

from ..odin_log import get_logger
from .codex_quota import CodexQuotaTracker, limited_windows
from .errors import LLMAuthError, LLMRateLimitError

log = get_logger("codex_auth")

# A 401/invalidated-token account can't recover until the user re-auths, so the
# pool sets it aside for this long (vs the 60s rate-limit window) before retrying
# it — avoids thrashing a known-bad account, while still recovering on its own.
AUTH_FAILED_BACKOFF_SECONDS = 600


def _atomic_write_secure(path: Path, content: str) -> None:
    """Write content to a file atomically with 0600 permissions."""
    fd, name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    tmp = Path(name)
    try:
        try:
            remaining = memoryview(content.encode())
            while remaining:
                written = os.write(fd, remaining)
                if written <= 0:
                    raise OSError("Credential write made no progress")
                remaining = remaining[written:]
            os.fsync(fd)
        finally:
            os.close(fd)
        tmp.replace(path)
    finally:
        tmp.unlink(missing_ok=True)


def mark_authorized_account(creds: dict) -> dict:
    """Fence shadows from an older login while keeping refresh recovery intact."""
    return {**creds, "_authorization_revision": uuid.uuid4().hex}


def merge_authorized_account(raw: dict | list, creds: dict) -> list:
    """Add an authorized account, replacing only the same identified account."""
    accounts = list(raw) if isinstance(raw, list) else [raw]
    creds = mark_authorized_account(creds)
    account_id = creds.get("account_id")
    for index, existing in enumerate(accounts):
        if (account_id and isinstance(existing, dict)
                and existing.get("account_id") == account_id):
            accounts[index] = {**existing, **creds}
            return accounts
    accounts.append(creds)
    return accounts

# OAuth constants for OpenAI Codex CLI
CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann"
AUTH_URL = "https://auth.openai.com/oauth/authorize"
TOKEN_URL = "https://auth.openai.com/oauth/token"
REDIRECT_URI = "http://localhost:1455/auth/callback"
DEVICE_REDIRECT_URI = "https://auth.openai.com/deviceauth/callback"
DEVICE_USERCODE_URL = "https://auth.openai.com/api/accounts/deviceauth/usercode"
DEVICE_TOKEN_URL = "https://auth.openai.com/api/accounts/deviceauth/token"
DEVICE_VERIFY_URL = "https://auth.openai.com/codex/device"
SCOPES = "openid profile email offline_access"

# Refresh 5 minutes before expiry
REFRESH_MARGIN = 300


def _generate_pkce() -> tuple[str, str]:
    """Generate PKCE code_verifier and code_challenge (S256)."""
    verifier_bytes = os.urandom(32)
    code_verifier = base64.urlsafe_b64encode(verifier_bytes).rstrip(b"=").decode()
    challenge_hash = hashlib.sha256(code_verifier.encode()).digest()
    code_challenge = base64.urlsafe_b64encode(challenge_hash).rstrip(b"=").decode()
    return code_verifier, code_challenge


def _decode_jwt_payload(token: str) -> dict:
    """Decode the payload section of a JWT without verification.

    Flattens OpenAI's nested claim objects (https://api.openai.com/profile,
    https://api.openai.com/auth) into top-level keys for easier access.
    """
    parts = token.split(".")
    if len(parts) < 2:
        return {}
    payload = parts[1]
    padding = 4 - len(payload) % 4
    if padding != 4:
        payload += "=" * padding
    try:
        data = json.loads(base64.urlsafe_b64decode(payload))
    except Exception:
        return {}
    profile = data.get("https://api.openai.com/profile", {})
    auth = data.get("https://api.openai.com/auth", {})
    if isinstance(profile, dict):
        for k, v in profile.items():
            if k not in data:
                data[k] = v
    if isinstance(auth, dict):
        for k, v in auth.items():
            if k not in data:
                data[k] = v
    return data


def _reloaded_credentials(auth: CodexAuth, record: dict) -> dict:
    """The record a reloaded account serves: the file's, unless the retained
    auth holds a newer rotation whose write failed (the file's refresh token
    was already used to make it)."""
    pending = auth._unpersisted
    return dict(pending) if pending is not None else dict(record)


class CodexAuth:
    # Rotated credentials whose write failed. The refresh already consumed the
    # previous single-use token, so these outlive the failed write, cache
    # invalidation and later requests until a write succeeds.
    _unpersisted: dict | None = None

    def __init__(self, credentials_path: str, on_save=None, save_guard=None) -> None:
        self._path = Path(credentials_path)
        self._credentials: dict | None = None
        self._refresh_lock = asyncio.Lock()
        # Called with the new creds dict after every successful _save().
        # OpenAI refresh tokens are single-use, so whoever owns the canonical
        # multi-account file must see every rotation — otherwise a restart
        # resurrects a burned refresh token and the account dies on next use.
        self.on_save = on_save
        self.save_guard = save_guard

    def is_configured(self) -> bool:
        """Check if credentials file exists and has tokens."""
        if self._credentials:
            return True
        if self._path.exists():
            try:
                data = json.loads(self._path.read_text())
                return bool(data.get("access_token"))
            except Exception:
                return False
        return False

    def _load(self) -> dict:
        if self._credentials:
            return self._credentials
        if not self._path.exists():
            raise RuntimeError("Codex credentials not found. Run scripts/codex_login.py first.")
        self._credentials = json.loads(self._path.read_text())
        return self._credentials

    def _save(self, creds: dict) -> None:
        # Check BEFORE touching either canonical or shadow storage. A retired
        # refresh may finish after deletion/re-auth, but must never publish.
        if self.save_guard is not None and not self.save_guard():
            raise LLMAuthError("Codex account changed during refresh.", provider="codex")
        # The server has rotated the single-use refresh token: only *creds*
        # can refresh from here on. Hold them before the write so a failed
        # write (a full disk) is retried rather than losing the account.
        self._credentials = creds
        self._unpersisted = creds
        self._persist(creds)

    def _persist(self, creds: dict) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        _atomic_write_secure(self._path, json.dumps(creds, indent=2))
        if self._unpersisted is creds:
            self._unpersisted = None
        if self.on_save is not None:
            try:
                self.on_save(creds)
            except Exception as e:
                from ..observability.diagnostics import safe_error

                log.warning("Failed to propagate refreshed Codex credentials: %s", safe_error(e))

    async def get_access_token(self) -> str:
        """Return a valid access token, refreshing if needed.

        Uses a lock to prevent concurrent refresh attempts — OpenAI
        refresh tokens are single-use, so two simultaneous refreshes
        cause the second to fail with 'refresh_token_reused'.
        """
        self._retry_unpersisted()
        creds = self._load()
        expires_at = creds.get("expires_at", 0)

        if time.time() >= expires_at - REFRESH_MARGIN:
            async with self._refresh_lock:
                # Re-check after acquiring lock — another coroutine may have refreshed
                creds = self._load()
                if time.time() >= creds.get("expires_at", 0) - REFRESH_MARGIN:
                    log.info("Access token expired or expiring soon, refreshing...")
                    await self._refresh_shielded(creds)
                # _load()/_refresh() above always leave _credentials set;
                # mypy only sees the Optional attribute declaration.
                creds = self._credentials  # type: ignore[assignment]

        return creds["access_token"]

    def get_account_id(self) -> str | None:
        """Return the ChatGPT account ID from stored credentials."""
        creds = self._load()
        return creds.get("account_id")

    async def invalidate_current(self) -> None:
        """Drop the in-memory cached credentials so the next
        get_access_token() reloads from disk (and re-checks expiry/refresh).

        Used to force a token refresh after a reactive 401. Safe to call
        when nothing is cached yet — it is then a no-op. Held under the
        refresh lock so it doesn't race an in-flight refresh.
        """
        async with self._refresh_lock:
            # Unsaved rotated credentials are newer than the file: keep them.
            if self._unpersisted is None:
                self._credentials = None

    def _retry_unpersisted(self) -> None:
        """Write rotated credentials an earlier write failed to save."""
        creds = self._unpersisted
        if creds is None:
            return
        if self.save_guard is not None and not self.save_guard():
            return  # a retired or replaced account never publishes
        try:
            self._persist(creds)
        except OSError as e:
            from ..observability.diagnostics import safe_error

            log.warning("Refreshed Codex credentials are still unsaved: %s", safe_error(e))
        else:
            # Serve what was just saved: a pool reload may have reset the
            # cache from the older file, whose refresh token is already used.
            if self._credentials is None or (
                self._credentials.get("expires_at", 0) <= creds.get("expires_at", 0)
            ):
                self._credentials = creds
            log.info("Saved refreshed Codex credentials after an earlier write failure")

    async def mark_current_auth_failed(self) -> bool:
        """Single-account auth has nothing to rotate to — returns False so the
        caller surfaces the 401 (this account must be re-authed)."""
        return False

    async def force_refresh(self, stale_token: str | None = None) -> bool:
        """Refresh the token now, regardless of expiry (reactive 401 handling).

        The expiry-driven get_access_token() will happily re-serve a
        server-revoked-but-unexpired bearer; this actually exercises the
        refresh token. ``stale_token`` is the bearer the failing request
        used — if the stored token already differs, another coroutine
        refreshed first and this call is a no-op success. Returns False
        when the refresh itself fails (account needs re-auth).
        """
        async with self._refresh_lock:
            try:
                creds = self._load()
            except Exception:
                return False
            if stale_token and creds.get("access_token") != stale_token:
                return True
            try:
                await self._refresh_shielded(creds)
                return True
            except Exception as e:
                from ..observability.diagnostics import safe_error

                log.warning("Reactive Codex token refresh failed: %s", safe_error(e))
                return False

    async def _refresh(self, creds: dict) -> None:
        """Refresh the access token using the refresh token."""
        refresh_token = creds.get("refresh_token")
        if not refresh_token:
            raise RuntimeError("No refresh token available. Run scripts/codex_login.py again.")

        async with aiohttp.ClientSession(
            auto_decompress=False,
            timeout=aiohttp.ClientTimeout(total=30),
        )as session:
            async with session.post(
                TOKEN_URL,
                data={
                    "grant_type": "refresh_token",
                    "client_id": CLIENT_ID,
                    "refresh_token": refresh_token,
                },
                headers={
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Accept-Encoding": "identity",
                },
            ) as resp:
                if resp.status != 200:
                    body = (await resp.read()).decode("utf-8", errors="replace")
                    from ..observability.diagnostics import safe_error

                    log.error("Token refresh failed (%d): %s", resp.status, safe_error(body))
                    raise RuntimeError(
                        f"Codex token refresh failed (HTTP {resp.status}). "
                        "Run scripts/codex_login.py to re-authenticate."
                    )
                raw = await resp.read()
                data = json.loads(raw)

        new_creds = {
            "access_token": data["access_token"],
            "refresh_token": data.get("refresh_token", refresh_token),
            "expires_at": int(time.time()) + data.get("expires_in", 3600),
        }

        # Extract account ID from JWT
        payload = _decode_jwt_payload(data["access_token"])
        if "chatgpt_account_id" in payload:
            new_creds["account_id"] = payload["chatgpt_account_id"]
        elif creds.get("account_id"):
            new_creds["account_id"] = creds["account_id"]

        if "email" in payload:
            new_creds["email"] = payload["email"]
        elif creds.get("email"):
            new_creds["email"] = creds["email"]

        if "chatgpt_plan_type" in payload:
            new_creds["plan_type"] = payload["chatgpt_plan_type"]
        elif creds.get("plan_type"):
            new_creds["plan_type"] = creds["plan_type"]

        if creds.get("label"):
            new_creds["label"] = creds["label"]

        if "_authorization_revision" in creds:
            new_creds["_authorization_revision"] = creds["_authorization_revision"]

        self._save(new_creds)
        log.info("Codex tokens refreshed successfully")

    async def _refresh_shielded(self, creds: dict) -> None:
        """Persist a completed single-use refresh even during shutdown."""
        task = asyncio.create_task(self._refresh(creds))
        try:
            await asyncio.shield(task)
        except asyncio.CancelledError:
            try:
                await task
            finally:
                raise

    def mark_rate_limited(self, seconds: float = 60) -> None:
        """Mark this credential set as unavailable for ``seconds`` (default 60s)."""
        self._rate_limit_marked_at = time.time()
        self._rate_limited_until = time.time() + seconds

    def is_rate_limited(self) -> bool:
        return time.time() < getattr(self, "_rate_limited_until", 0)

    def clear_rate_limit(self) -> None:
        """Clear a stale local bench after operator activation or fresh quota data."""
        self._rate_limited_until = 0.0
        self._rate_limit_marked_at = 0.0

    @staticmethod
    def build_auth_url() -> tuple[str, str]:
        """Build the authorization URL and return (url, code_verifier)."""
        code_verifier, code_challenge = _generate_pkce()
        state = base64.urlsafe_b64encode(os.urandom(16)).rstrip(b"=").decode()

        params = {
            "response_type": "code",
            "client_id": CLIENT_ID,
            "redirect_uri": REDIRECT_URI,
            "scope": SCOPES,
            "code_challenge": code_challenge,
            "code_challenge_method": "S256",
            "state": state,
            "id_token_add_organizations": "true",
            "codex_cli_simplified_flow": "true",
            "originator": "odin",
        }
        from urllib.parse import urlencode
        return f"{AUTH_URL}?{urlencode(params)}", code_verifier

    @staticmethod
    async def exchange_code(
        code: str,
        code_verifier: str,
        redirect_uri: str = REDIRECT_URI,
    ) -> dict:
        """Exchange authorization code for tokens."""
        async with aiohttp.ClientSession(
            auto_decompress=False,
            timeout=aiohttp.ClientTimeout(total=30),
        )as session:
            async with session.post(
                TOKEN_URL,
                data={
                    "grant_type": "authorization_code",
                    "code": code,
                    "redirect_uri": redirect_uri,
                    "client_id": CLIENT_ID,
                    "code_verifier": code_verifier,
                },
                headers={
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Accept-Encoding": "identity",
                },
            ) as resp:
                if resp.status != 200:
                    body = (await resp.read()).decode("utf-8", errors="replace")
                    from ..observability.diagnostics import safe_error

                    raise RuntimeError(f"Token exchange failed ({resp.status}): {safe_error(body)}")
                raw = await resp.read()
                data = json.loads(raw)

        creds = {
            "access_token": data["access_token"],
            "refresh_token": data.get("refresh_token", ""),
            "expires_at": int(time.time()) + data.get("expires_in", 3600),
        }

        payload = _decode_jwt_payload(data["access_token"])
        if "chatgpt_account_id" in payload:
            creds["account_id"] = payload["chatgpt_account_id"]
        if "email" in payload:
            creds["email"] = payload["email"]
        if "chatgpt_plan_type" in payload:
            creds["plan_type"] = payload["chatgpt_plan_type"]

        return creds

    @staticmethod
    async def request_device_code() -> dict:
        """Request a device code for headless authentication.

        Returns dict with device_auth_id, user_code, interval, and verify_url.
        """
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=30)) as session:
            async with session.post(
                DEVICE_USERCODE_URL,
                json={"client_id": CLIENT_ID},
            ) as resp:
                if resp.status != 200:
                    body = (await resp.read()).decode("utf-8", errors="replace")
                    from ..observability.diagnostics import safe_error

                    raise RuntimeError(
                        f"Device code request failed ({resp.status}): {safe_error(body)}"
                    )
                data = json.loads(await resp.read())

        return {
            "device_auth_id": data["device_auth_id"],
            "user_code": data["user_code"],
            "interval": int(data.get("interval", 5)),
            "verify_url": DEVICE_VERIFY_URL,
        }

    @staticmethod
    async def poll_device_auth(
        device_auth_id: str,
        user_code: str,
        interval: int = 5,
        timeout: int = 900,
    ) -> dict:
        """Poll for device authorization completion, then exchange for tokens.

        Returns credentials dict on success, raises on timeout/error.
        """
        deadline = time.time() + timeout
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=30)) as session:
            while time.time() < deadline:
                await asyncio.sleep(interval)
                async with session.post(
                    DEVICE_TOKEN_URL,
                    json={"device_auth_id": device_auth_id, "user_code": user_code},
                ) as resp:
                    if resp.status == 200:
                        data = json.loads(await resp.read())
                        return await CodexAuth.exchange_code(
                            data["authorization_code"],
                            data["code_verifier"],
                            redirect_uri=DEVICE_REDIRECT_URI,
                        )
                    if resp.status in (403, 404):
                        continue
                    body = (await resp.read()).decode("utf-8", errors="replace")
                    from ..observability.diagnostics import safe_error

                    raise RuntimeError(
                        f"Device auth polling failed ({resp.status}): {safe_error(body)}"
                    )

        raise TimeoutError("Device authorization timed out — user did not complete login")


class _PinnedAccountIndex(int):
    """Displayed slot plus request ownership, without changing the tuple API.

    Numeric slots are operator selections, not durable request identities. A
    lease returned by acquire follows the same auth across reorders and expires
    on removal/re-authorization, including remove/re-add of the same account ID.
    Keep the lease intact for downstream marking, refresh and retry lookup.
    """

    _pool: CodexAuthPool
    _auth: CodexAuth

    def __new__(cls, index: int, pool: CodexAuthPool, auth: CodexAuth) -> _PinnedAccountIndex:
        lease = super().__new__(cls, index)
        lease._pool = pool
        lease._auth = auth
        return lease


class CodexAuthPool:
    """Manages multiple CodexAuth credential sets with automatic rotation.

    Supports two file formats:
    - Single object (backward compat): {"access_token": ..., ...}
    - Array of objects: [{"access_token": ...}, {"access_token": ...}]

    On 429/quota errors, call mark_current_limited() to rotate to the next
    available credential set. Rotation is round-robin with backoff.
    """

    def __init__(self, credentials_path: str) -> None:
        self._path = Path(credentials_path)
        self._accounts: list[CodexAuth] = []
        self._current_index = 0
        self._pool_lock = asyncio.Lock()
        # Pool-owned so the primary and auxiliary clients, which share this
        # pool by identity, contribute to ONE account-scoped quota view.
        self.quota = CodexQuotaTracker()
        self._quota_check_failures: dict[str, str] = {}
        self._manual_active_index: int | None = None
        self._generation = 0
        self._canonical_indices: list[int] = []
        self._loaded_records: dict[int, dict] = {}
        self._loaded_auths: dict[int, CodexAuth] = {}
        self._init_accounts()

    def _init_accounts(self) -> None:
        """Reload credentials and invalidate telemetry at the mutation boundary.

        Account identity, not canonical/display slot, determines whether quota
        belongs to an unchanged authorization. A remove/re-add or replacement
        must not wait for a status view to discard the old plan and failure.
        """
        from .account_key import opaque_account_key

        previous = {
            key: record for record in getattr(self, "_loaded_records", {}).values()
            if (key := opaque_account_key(record.get("account_id")))
        }
        self._load_accounts()
        current = {
            key: record for record in self._loaded_records.values()
            if (key := opaque_account_key(record.get("account_id")))
        }
        unchanged = {
            key for key, record in current.items()
            if key in previous and self._same_credentials(record, previous[key])
        }
        self.quota.forget_missing(unchanged)
        for key in list(self._quota_check_failures):
            if key not in unchanged:
                del self._quota_check_failures[key]

    def _load_accounts(self) -> None:
        """Load credentials and create CodexAuth instances.

        Token refreshes rotate single-use refresh tokens into the per-account
        shadow files, while re-auth/account edits rewrite the canonical file.
        For the same account (matched by account_id), whichever side is newer
        (by expires_at) wins — blindly overwriting a rotated shadow with stale
        canonical creds burns the refresh-token chain, which is how all
        accounts used to die together on every restart/reload. A different
        account_id at the same slot (account deleted/reordered) means the
        canonical entry is authoritative.

        A load is transactional: the files are written before anything in
        memory changes, the canonical file last. A write that fails (a full
        disk) leaves the pool as it was, with any rotation whose own write
        failed, and raises; only a complete load replaces it.
        """
        generation = getattr(self, "_generation", 0) + 1
        previous_records = getattr(self, "_loaded_records", {})
        previous_auths = getattr(self, "_loaded_auths", {})
        retained_auths: set[CodexAuth] = set()

        def continuing_auth(index: int, expected: dict, path: Path) -> tuple[CodexAuth, bool]:
            # Bearer/expiry edits do not replace a single-use refresh chain.
            # Retain the AUTH, not just its lock: an in-flight rotation must
            # publish through the newly bound guard/hook and update the cache
            # that queued callers re-check. Account identity follows reorder;
            # never hand a successor to a different authorization or slot owner.
            # Returns the auth and whether its rate limit is reset at commit.
            candidates = [
                auth for old_index, auth in previous_auths.items()
                if auth not in retained_auths and old_index in previous_records
                and (self._same_refresh_chain(expected, previous_records[old_index])
                     or (old_index == index and auth._path == path
                         and self._same_credentials(expected, previous_records[old_index])))
            ]
            if len(candidates) != 1:
                return CodexAuth(str(path)), False
            auth = candidates[0]
            retained_auths.add(auth)
            old_record = next(
                previous_records[i] for i, old in previous_auths.items() if old is auth
            )
            # Preserve replacement's existing health-reset semantics even
            # though we now retain its refresh-chain synchronization owner.
            return auth, not self._same_credentials(expected, old_record)

        # The plan: (index, expected record, path, auth, reset rate limit),
        # then the writes it needs. Nothing below changes the pool until the
        # writes have all succeeded.
        planned: list[tuple[int, dict, Path, CodexAuth, bool]] = []
        shadow_writes: list[tuple[Path, str]] = []
        stale_shadows: list[Path] = []
        canonical: str | None = None
        single = False
        raw = None
        if self._path.exists():
            try:
                raw = json.loads(self._path.read_text())
            except Exception:
                raw = None

        if isinstance(raw, list):
            valid_count = 0
            canonical_dirty = False
            for i, creds in enumerate(raw):
                if not isinstance(creds, dict) or not creds.get("access_token"):
                    continue
                individual_path = self._path.parent / f"codex_auth_{i}.json"
                shadow = self._load_creds_file(individual_path)
                # In a running pool we can distinguish a replaced shadow from
                # a stale pre-login shadow: canonical is unchanged from our
                # loaded revision, but the same-account shadow is not. Expiry
                # is not an authorization revision (a new plan/session can
                # have an earlier expiry). An edited canonical still wins.
                shadow_replaced = (
                    shadow is not None
                    and bool(creds.get("account_id"))
                    and shadow.get("account_id") == creds.get("account_id")
                    and i in previous_records
                    and self._same_credentials(creds, previous_records[i])
                    and not self._same_credentials(shadow, previous_records[i])
                )
                same_account = (
                    shadow is not None
                    and bool(creds.get("account_id"))
                    and shadow.get("account_id") == creds.get("account_id")
                    and shadow.get("_authorization_revision")
                    == creds.get("_authorization_revision")
                    and (i not in previous_records
                         or self._same_credentials(creds, previous_records[i]))
                )
                if (
                    (same_account or shadow_replaced)
                    and shadow is not None and shadow.get("access_token")
                    and (shadow_replaced
                         or shadow.get("expires_at", 0) >= creds.get("expires_at", 0))
                ):
                    # Keep rotated or explicitly replaced shadow tokens and
                    # pull the canonical entry up to date, not the reverse.
                    if shadow is not None and "label" in creds:
                        shadow = {**shadow, "label": creds["label"]}
                        shadow_writes.append((individual_path, json.dumps(shadow, indent=2)))
                    if shadow != creds:
                        raw[i] = shadow
                        canonical_dirty = True
                else:
                    shadow_writes.append((individual_path, json.dumps(creds, indent=2)))
                expected = dict(raw[i])
                auth, reset = continuing_auth(i, expected, individual_path)
                planned.append((i, expected, individual_path, auth, reset))
                valid_count = i + 1
            if canonical_dirty:
                canonical = json.dumps(raw, indent=2)
            # Remove stale shadow files from previous larger pools
            for j in range(valid_count, valid_count + 20):
                stale = self._path.parent / f"codex_auth_{j}.json"
                if not stale.exists():
                    break
                stale_shadows.append(stale)
        elif isinstance(raw, dict) and raw.get("access_token"):
            # Single account (backward compat) — use the file directly
            single = True
            expected = dict(raw)
            auth, reset = continuing_auth(0, expected, self._path)
            planned.append((0, expected, self._path, auth, reset))

        for path, content in shadow_writes:
            _atomic_write_secure(path, content)
        for stale in stale_shadows:
            stale.unlink(missing_ok=True)
        if canonical is not None:
            # Last: until it is replaced, the pool kept on a failure still
            # matches the canonical file its save guards check.
            _atomic_write_secure(self._path, canonical)

        self._generation = generation
        self._canonical_indices = [index for index, *_ in planned]
        self._loaded_records = {}
        self._loaded_auths = {}
        accounts: list[CodexAuth] = []
        for index, expected, path, auth, reset in planned:
            if reset:
                auth.clear_rate_limit()
            auth._path = path
            # The reconciled canonical/shadow record is authoritative now,
            # even when retaining an auth's single-use refresh lock. Never
            # let an older lazy _load cache outlive a credential reload.
            # The one exception is a rotation whose write failed: it is
            # newer than this file and its refresh token is the live one.
            auth._credentials = _reloaded_credentials(auth, expected)
            if single:
                auth.on_save = self._single_sync(expected)
            else:
                auth.on_save = self._canonical_sync(index, expected, generation)
            auth.save_guard = self._save_guard(index, expected, generation)
            self._loaded_records[index] = expected
            self._loaded_auths[index] = auth
            accounts.append(auth)
        self._accounts[:] = accounts
        if single:
            log.info("Codex auth pool: 1 account loaded (single format)")
        elif isinstance(raw, list):
            log.info("Codex auth pool: %d account(s) loaded", len(self._accounts))

    @staticmethod
    def _single_sync(expected: dict):
        """The on_save hook of the single-account format: the file is the record."""
        def update_expected(creds: dict) -> None:
            expected.clear()
            expected.update(creds)
        return update_expected

    @staticmethod
    def _load_creds_file(path: Path) -> dict | None:
        if not path.exists():
            return None
        try:
            data = json.loads(path.read_text())
        except Exception:
            return None
        return data if isinstance(data, dict) else None

    @property
    def generation(self) -> int:
        """Account-list revision, including reloads on the same pool object."""
        return getattr(self, "_generation", 0)

    @staticmethod
    def canonical_index(raw: dict | list, index: int) -> int:
        """Translate a displayed valid-account slot to its canonical record."""
        rows = raw if isinstance(raw, list) else [raw]
        valid = [i for i, row in enumerate(rows)
                 if isinstance(row, dict) and row.get("access_token")]
        if index < 0 or index >= len(valid):
            raise ValueError("account index out of range")
        return valid[index]

    @staticmethod
    def _same_credentials(left: dict, right: dict) -> bool:
        # Labels and other operator metadata may change during refresh.
        return all(left.get(key) == right.get(key) for key in (
            "access_token", "refresh_token", "account_id", "expires_at", "_authorization_revision",
        ))

    @staticmethod
    def _same_refresh_chain(left: dict, right: dict) -> bool:
        return bool(left.get("account_id") and left.get("refresh_token")) and all(
            left.get(key) == right.get(key)
            for key in ("account_id", "refresh_token", "_authorization_revision")
        )

    def _save_guard(self, index: int, expected: dict, generation: int):
        def _guard() -> bool:
            if self.generation != generation:
                return False
            try:
                raw = json.loads(self._path.read_text())
                row = raw[index] if isinstance(raw, list) else raw if index == 0 else None
                return isinstance(row, dict) and self._same_credentials(row, expected)
            except (OSError, ValueError, IndexError):
                return False
        return _guard

    def _canonical_sync(self, index: int, expected: dict | None = None,
                        generation: int | None = None):
        """Build an on_save hook that mirrors account *index* back to the canonical file."""
        def _sync(creds: dict) -> None:
            if generation is not None and self.generation != generation:
                return
            try:
                raw = json.loads(self._path.read_text())
            except Exception:
                return
            if not isinstance(raw, list) or index >= len(raw):
                return
            if expected is not None and (
                not isinstance(raw[index], dict)
                or not self._same_credentials(raw[index], expected)
            ):
                return
            if isinstance(raw[index], dict) and "label" in raw[index]:
                creds["label"] = raw[index]["label"]
            raw[index] = creds
            _atomic_write_secure(self._path, json.dumps(raw, indent=2))
            if expected is not None:
                expected.clear()
                expected.update(creds)
        return _sync

    @staticmethod
    def _account_label(auth: CodexAuth, index: int) -> str:
        try:
            return auth._load().get("email", f"account {index}")
        except Exception:
            return f"account {index}"

    def is_configured(self) -> bool:
        return any(a.is_configured() for a in self._accounts)

    @property
    def account_count(self) -> int:
        return len(self._accounts)

    def account_display_name(self, index: int) -> str:
        """Operator-assigned ``label`` from the credential record, else a slot name.

        Never the email or raw account id: this string is rendered in chat.
        """
        try:
            label = self._accounts[index]._load().get("label")
        except Exception:
            label = None
        if isinstance(label, str) and label.strip():
            return label.strip()[:40]
        return f"account {index + 1}"

    def describe_accounts(self) -> list[dict]:
        """Per-slot, display-safe facts: opaque key, label, selection, health."""
        from .account_key import opaque_account_key

        rows: list[dict] = []
        current = self._current_index % len(self._accounts) if self._accounts else -1
        for index, auth in enumerate(self._accounts):
            rows.append(
                {
                    "index": index,
                    "key": opaque_account_key(auth.get_account_id()),
                    "label": self.account_display_name(index),
                    "is_current": index == current,
                    "rate_limited": auth.is_rate_limited(),
                    "configured": auth.is_configured(),
                }
            )
        return rows

    def quota_view(self):
        """The tracker's view keyed to the CURRENT account; removed accounts drop."""
        rows = self.describe_accounts()
        known = [row["key"] for row in rows if row["key"]]
        current = next((row["key"] for row in rows if row["is_current"]), None)
        self.quota.forget_missing(known)
        failures = getattr(self, "_quota_check_failures", None)
        if failures is not None:
            for key in list(failures):
                if key not in known:
                    del failures[key]
        return self.quota.view(current_key=current, known_keys=known)

    def _quota_key(self, index: int) -> str | None:
        from .account_key import opaque_account_key

        if index < 0 or index >= len(self._accounts):
            return None
        try:
            return opaque_account_key(self._accounts[index].get_account_id())
        except Exception:
            # One unreadable account slot must not make the entire pool fail.
            return None

    def quota_check_failure(self, index: int) -> str | None:
        key = self._quota_key(index)
        return getattr(self, "_quota_check_failures", {}).get(key) if key else None

    def set_quota_check_failure(self, index: int, reason: str | None) -> None:
        key = self._quota_key(index)
        if key is None:
            return
        failures = getattr(self, "_quota_check_failures", None)
        if failures is None:
            failures = self._quota_check_failures = {}
        if reason is None:
            failures.pop(key, None)
        else:
            # Only operator-safe categories belong here; never exception text.
            failures[key] = reason[:80]

    def clear_quota_check_failure_for_account(self, account_id: str | None) -> None:
        """A successful reply clears only its pinned account's display failure.

        Never translate through an index here: a reload/reorder may have moved
        another account into the request's original slot while it was awaiting
        its reply. Success does not discard the freshly observed quota.
        """
        from .account_key import opaque_account_key

        key = opaque_account_key(account_id)
        if key:
            getattr(self, "_quota_check_failures", {}).pop(key, None)

    def _quota_reset(self, index: int, *, now: float | None = None) -> float | None:
        """Known exhaustion lasts only until a reported future reset."""
        import time

        key = self._quota_key(index)
        tracker = getattr(self, "quota", None)
        snapshot = tracker.snapshot_for(key) if tracker is not None and key else None
        if snapshot is None:
            return None
        # A fresh successful quota observation showing room supersedes a
        # local 429 backoff left from an older response.
        reported = [
            window for window in (snapshot.primary, snapshot.secondary)
            if window is not None and window.window_minutes is not None
            and window.window_minutes > 0
        ]
        if reported and all(window.used_percent < 100 for window in reported):
            auth = self._accounts[index]
            marked_at = getattr(auth, "_rate_limit_marked_at", None)
            if not isinstance(marked_at, (int, float)):
                marked_at = None
            clear_bench = getattr(auth, "clear_rate_limit", None)
            # Older quota responses can finish after a newer 429.
            if clear_bench is not None and (
                marked_at is None or snapshot.observed_at > marked_at
            ):
                clear_bench()
        now = time.time() if now is None else now
        # The upstream type identifies which window reached its limit; an
        # unrelated, merely reported window is not inferred exhausted.
        limited = limited_windows(snapshot, now)
        return max(limited.values()) if limited else None

    def eligible_account_ids_snapshot(self) -> frozenset[str]:
        """Stable non-secret IDs for accounts eligible to serve right now."""
        result: set[str] = set()
        for index, auth in enumerate(self._accounts):
            if not auth.is_configured():
                continue
            if self._quota_reset(index) is not None:
                continue
            if auth.is_rate_limited():
                continue
            account_id = auth.get_account_id()
            if isinstance(account_id, str) and account_id:
                result.add(account_id)
        return frozenset(result)

    @property
    def current(self) -> CodexAuth:
        if not self._accounts:
            raise LLMAuthError("No Codex credentials configured.", provider="codex")
        return self._accounts[self._current_index]

    def _resolve_index(self, index: int) -> int | None:
        """Resolve a request lease or literal operator slot under _pool_lock."""
        if isinstance(index, _PinnedAccountIndex):
            if index._pool is not self:
                return None
            return next((i for i, auth in enumerate(self._accounts)
                         if auth is index._auth), None)
        return index if 0 <= index < len(self._accounts) else None

    async def _acquired(self, token: str, auth: CodexAuth) -> tuple[str, str | None, int]:
        # Refresh awaits outside the pool lock. Rebind the displayed slot only
        # AFTER it completes, and never issue a lease for a retired auth.
        async with self._pool_lock:
            index = next((i for i, current in enumerate(self._accounts) if current is auth), None)
            if index is None:
                raise LLMAuthError("Codex account changed during acquisition.", provider="codex")
            return token, auth.get_account_id(), _PinnedAccountIndex(index, self, auth)

    async def acquire(self) -> tuple[str, str | None, int]:
        """Pick a healthy account and return (access_token, account_id, index).

        The returned index is an int-compatible ownership lease, so failure marking can
        target the account that actually served it — concurrent requests
        rotate/reload the pool underneath each other. Preserve this value for
        mark_limited/mark_auth_failed/force_refresh/token_for, not int(index):
        a literal int means an operator's current slot. Token refresh happens OUTSIDE
        the pool lock: a slow refresh must not serialize unrelated LLM
        traffic, and the per-account refresh lock already prevents
        refresh-token reuse.
        """
        if not self._accounts:
            raise LLMAuthError("No Codex credentials configured.", provider="codex")
        errors: list[tuple[int, str]] = []
        # A WebUI activation is an explicit operator override. Honour it until
        # that account itself receives an actual 429; passive quota snapshots
        # must not immediately undo the operator's choice.
        manual_index = getattr(self, "_manual_active_index", None)
        if manual_index is not None:
            if manual_index < len(self._accounts):
                auth = self._accounts[manual_index]
                self._current_index = manual_index
                try:
                    token = await auth.get_access_token()
                    return await self._acquired(token, auth)
                except Exception as e:
                    errors.append((manual_index, str(e)))
                    self._manual_active_index = None
            else:
                self._manual_active_index = None

        # If every slot is benched/exhausted, do not reject locally. Stored
        # quota can be stale and the upstream service is the authority. Pick
        # the account expected to recover first, falling back to the first
        # account if no reset is known.
        available = []
        for i, auth in enumerate(self._accounts):
            if not auth.is_configured():
                continue
            quota_reset = self._quota_reset(i)
            if not auth.is_rate_limited() and quota_reset is None:
                available.append(i)
        if not available:
            import time

            now = time.time()
            def retry_at(index: int) -> float:
                auth = self._accounts[index]
                quota_reset = self._quota_reset(index)
                local_reset = getattr(auth, "_rate_limited_until", 0.0)
                return min((v for v in (quota_reset, local_reset) if v and v > now), default=now)

            if self._accounts:
                self._current_index = min(range(len(self._accounts)), key=retry_at)
        for _ in range(len(self._accounts)):
            async with self._pool_lock:
                if not self._accounts:
                    raise LLMAuthError("No Codex credentials configured.", provider="codex")
                self._current_index %= len(self._accounts)
                idx = self._current_index
                auth = self._accounts[idx]
                quota_reset = self._quota_reset(idx)
                locally_limited = quota_reset is not None or auth.is_rate_limited()
                if locally_limited and available:
                    self._rotate()
                    continue
            try:
                token = await auth.get_access_token()
                return await self._acquired(token, auth)
            except Exception as e:
                log.warning(
                    "Codex account %s failed: %s — rotating to next",
                    self._account_label(auth, idx), e,
                )
                from ..observability.diagnostics import safe_error

                errors.append((idx, safe_error(e)))
                async with self._pool_lock:
                    auth.mark_rate_limited()
                    if (len(self._accounts) > 1
                            and self._accounts[self._current_index % len(self._accounts)] is auth):
                        self._rotate()
                continue
        if errors:
            raise LLMAuthError(
                f"All {len(self._accounts)} Codex accounts failed: "
                + "; ".join(f"#{i}: {err}" for i, err in errors),
                provider="codex",
            )
        # The upstream gets the request even when every local slot looks
        # exhausted. It can reject stale quota information authoritatively.
        if self._accounts and not errors:
            idx = self._current_index % len(self._accounts)
            auth = self._accounts[idx]
            try:
                token = await auth.get_access_token()
                return await self._acquired(token, auth)
            except Exception as e:
                errors.append((idx, str(e)))
        if errors:
            raise LLMAuthError(
                f"All {len(self._accounts)} Codex accounts failed: "
                + "; ".join(f"#{i}: {err}" for i, err in errors), provider="codex"
            )
        raise LLMRateLimitError("No configured Codex accounts.", provider="codex")

    async def get_access_token(self) -> str:
        """Get a token from a healthy account, rotating on failure or rate-limit."""
        token, _, _ = await self.acquire()
        return token

    async def token_for(self, index: int) -> tuple[str, str | None]:
        """Return credentials for a request lease (or literal current slot)."""
        async with self._pool_lock:
            resolved = self._resolve_index(index)
            if resolved is None:
                raise RuntimeError(f"Codex account index {index} out of range")
            auth = self._accounts[resolved]
        token = await auth.get_access_token()
        token, account_id, _ = await self._acquired(token, auth)
        return token, account_id

    def get_account_id(self) -> str | None:
        if not self._accounts:
            return None
        return self.current.get_account_id()

    async def mark_limited(self, index: int) -> None:
        """Mark the lease owner (or literal slot); rotate only if still current."""
        if not self._accounts:
            return
        async with self._pool_lock:
            resolved = self._resolve_index(index)
            if resolved is None:
                return
            index = resolved
            account = self._accounts[index]
            import time

            reset = self._quota_reset(index)
            if getattr(self, "_manual_active_index", None) == index:
                self._manual_active_index = None
            account.mark_rate_limited(max(0.0, reset - time.time()) if reset else 60.0)
            label = self._account_label(account, index)
            if len(self._accounts) > 1:
                if self._current_index == index:
                    self._rotate()
                log.warning("Codex %s hit rate limit, active account now %d/%d",
                            label, self._current_index + 1, len(self._accounts))
            else:
                log.warning("Codex %s hit rate limit (only account, no rotation)", label)

    async def mark_current_limited(self) -> None:
        """Mark the current account as rate-limited and rotate to the next."""
        if not self._accounts:
            return
        await self.mark_limited(self._current_index)

    async def invalidate_current(self) -> None:
        """Force a token refresh for the *currently active* account.

        Clears that account's in-memory credentials so the next
        get_access_token() reloads from disk and re-checks expiry. Does
        NOT rotate — used for reactive 401 handling where the cached
        bearer is stale but the account itself is still usable. Safe to
        call when no account is configured or nothing is cached (no-op).
        """
        if not self._accounts:
            return
        async with self._pool_lock:
            current = self._accounts[self._current_index]
        # invalidate_current() takes the inner account's own refresh lock;
        # call it outside the pool lock to keep lock ordering simple.
        await current.invalidate_current()

    async def mark_auth_failed(self, index: int) -> bool:
        """Mark the *given* account auth-failed (401/invalidated) and rotate off it.

        Distinct from rate-limit rotation: an invalidated token won't recover
        until re-auth, so set the account aside for a longer window
        (AUTH_FAILED_BACKOFF_SECONDS) rather than retrying it every minute.
        Rotation happens only if the failed account is still current. Returns
        True if another account is available, False if this is the only one
        (caller should surface the error).
        """
        if not self._accounts:
            return False
        async with self._pool_lock:
            resolved = self._resolve_index(index)
            if resolved is None:
                return False
            index = resolved
            account = self._accounts[index]
            account.mark_rate_limited(AUTH_FAILED_BACKOFF_SECONDS)
            if getattr(self, "_manual_active_index", None) == index:
                self._manual_active_index = None
            label = self._account_label(account, index)
            if len(self._accounts) > 1:
                if self._current_index == index:
                    self._rotate()
                log.warning(
                    "Codex %s auth failed (401/invalidated), active account now %d/%d",
                    label, self._current_index + 1, len(self._accounts),
                )
                return True
            log.warning("Codex %s auth failed (401), only account — cannot rotate", label)
            return False

    async def mark_current_auth_failed(self) -> bool:
        """Mark the current account auth-failed and rotate (see mark_auth_failed)."""
        if not self._accounts:
            return False
        return await self.mark_auth_failed(self._current_index)

    async def force_refresh(self, index: int, stale_token: str | None = None) -> bool:
        """Refresh the lease owner (or literal slot); retired leases fail closed."""
        if not self._accounts:
            return False
        async with self._pool_lock:
            resolved = self._resolve_index(index)
            if resolved is None:
                return False
            account = self._accounts[resolved]
        # The account's own refresh lock guards the single-use refresh token;
        # run outside the pool lock so a slow refresh doesn't stall the pool.
        refreshed = await account.force_refresh(stale_token)
        async with self._pool_lock:
            return refreshed and any(auth is account for auth in self._accounts)

    def _rotate(self) -> None:
        count = len(self._accounts)
        for offset in range(1, count):
            candidate = (self._current_index + offset) % count
            quota_reset = self._quota_reset(candidate)
            if quota_reset is None and not self._accounts[candidate].is_rate_limited():
                self._current_index = candidate
                return
        # Preserve the old fallback; acquire raises the existing typed
        # pool-exhaustion error if none of the accounts can serve.
        self._current_index = (self._current_index + 1) % count

    async def set_active(self, index: int) -> None:
        """Switch the active account to the given index."""
        if index < 0 or index >= len(self._accounts):
            raise ValueError(f"index {index} out of range (0-{len(self._accounts)-1})")
        async with self._pool_lock:
            self._current_index = index
            self._manual_active_index = index
            clear_bench = getattr(self._accounts[index], "clear_rate_limit", None)
            if clear_bench is not None:
                clear_bench()
            try:
                email = self._accounts[index]._load().get("email", f"account {index}")
            except Exception:
                email = f"account {index}"
            log.info("Active Codex account switched to %s (#%d)", email, index)

    def reload(self) -> None:
        """Reload the pool from the canonical credentials file (sync compat).

        A reload that raises leaves the pool as it was (see _load_accounts).
        """
        self._init_accounts()
        self._current_index = 0
        self._manual_active_index = None
        log.info("Codex auth pool reloaded: %d account(s)", len(self._accounts))

    async def reload_async(self) -> int:
        """Reload under lock to avoid racing in-flight token operations.

        A reload that raises leaves the pool as it was (see _load_accounts).
        """
        async with self._pool_lock:
            self._init_accounts()
            self._manual_active_index = None
            self._current_index = min(self._current_index, max(len(self._accounts) - 1, 0))
            log.info("Codex auth pool reloaded (async): %d account(s)", len(self._accounts))
            return len(self._accounts)
