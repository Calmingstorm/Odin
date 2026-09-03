from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import os
import time
from pathlib import Path

import aiohttp

from ..odin_log import get_logger
from .codex_quota import CodexQuotaTracker
from .errors import LLMAuthError, LLMRateLimitError

log = get_logger("codex_auth")

# A 401/invalidated-token account can't recover until the user re-auths, so the
# pool sets it aside for this long (vs the 60s rate-limit window) before retrying
# it — avoids thrashing a known-bad account, while still recovering on its own.
AUTH_FAILED_BACKOFF_SECONDS = 600


def _atomic_write_secure(path: Path, content: str) -> None:
    """Write content to a file atomically with 0600 permissions."""
    tmp = path.with_suffix(".tmp")
    fd = os.open(str(tmp), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    try:
        os.write(fd, content.encode())
        os.fsync(fd)
    finally:
        os.close(fd)
    tmp.rename(path)

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


class CodexAuth:
    def __init__(self, credentials_path: str, on_save=None) -> None:
        self._path = Path(credentials_path)
        self._credentials: dict | None = None
        self._refresh_lock = asyncio.Lock()
        # Called with the new creds dict after every successful _save().
        # OpenAI refresh tokens are single-use, so whoever owns the canonical
        # multi-account file must see every rotation — otherwise a restart
        # resurrects a burned refresh token and the account dies on next use.
        self.on_save = on_save

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
        self._path.parent.mkdir(parents=True, exist_ok=True)
        _atomic_write_secure(self._path, json.dumps(creds, indent=2))
        self._credentials = creds
        if self.on_save is not None:
            try:
                self.on_save(creds)
            except Exception as e:
                log.warning("Failed to propagate refreshed Codex credentials: %s", e)

    async def get_access_token(self) -> str:
        """Return a valid access token, refreshing if needed.

        Uses a lock to prevent concurrent refresh attempts — OpenAI
        refresh tokens are single-use, so two simultaneous refreshes
        cause the second to fail with 'refresh_token_reused'.
        """
        creds = self._load()
        expires_at = creds.get("expires_at", 0)

        if time.time() >= expires_at - REFRESH_MARGIN:
            async with self._refresh_lock:
                # Re-check after acquiring lock — another coroutine may have refreshed
                creds = self._load()
                if time.time() >= creds.get("expires_at", 0) - REFRESH_MARGIN:
                    log.info("Access token expired or expiring soon, refreshing...")
                    await self._refresh(creds)
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
            self._credentials = None

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
                await self._refresh(creds)
                return True
            except Exception as e:
                log.warning("Reactive Codex token refresh failed: %s", e)
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
                    log.error("Token refresh failed (%d): %s", resp.status, body)
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

        self._save(new_creds)
        log.info("Codex tokens refreshed successfully")

    def mark_rate_limited(self, seconds: float = 60) -> None:
        """Mark this credential set as unavailable for ``seconds`` (default 60s)."""
        self._rate_limited_until = time.time() + seconds

    def is_rate_limited(self) -> bool:
        return time.time() < getattr(self, "_rate_limited_until", 0)

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
            "originator": "pi",
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
                    raise RuntimeError(f"Token exchange failed ({resp.status}): {body}")
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
                    raise RuntimeError(f"Device code request failed ({resp.status}): {body}")
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
                    raise RuntimeError(f"Device auth polling failed ({resp.status}): {body}")

        raise TimeoutError("Device authorization timed out — user did not complete login")


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
        self._init_accounts()

    def _init_accounts(self) -> None:
        """Load credentials and create CodexAuth instances.

        Token refreshes rotate single-use refresh tokens into the per-account
        shadow files, while re-auth/account edits rewrite the canonical file.
        For the same account (matched by account_id), whichever side is newer
        (by expires_at) wins — blindly overwriting a rotated shadow with stale
        canonical creds burns the refresh-token chain, which is how all
        accounts used to die together on every restart/reload. A different
        account_id at the same slot (account deleted/reordered) means the
        canonical entry is authoritative.
        """
        if not self._path.exists():
            return
        try:
            raw = json.loads(self._path.read_text())
        except Exception:
            return

        if isinstance(raw, list):
            valid_count = 0
            canonical_dirty = False
            for i, creds in enumerate(raw):
                if not isinstance(creds, dict) or not creds.get("access_token"):
                    continue
                individual_path = self._path.parent / f"codex_auth_{i}.json"
                shadow = self._load_creds_file(individual_path)
                same_account = (
                    shadow is not None
                    and bool(creds.get("account_id"))
                    and shadow.get("account_id") == creds.get("account_id")
                )
                if (
                    # same_account (above) already requires shadow is not
                    # None; mypy doesn't carry that through the variable.
                    same_account
                    and shadow.get("access_token")  # type: ignore[union-attr]
                    and shadow.get("expires_at", 0) >= creds.get("expires_at", 0)  # type: ignore[union-attr]
                ):
                    # Shadow holds newer (rotated) tokens — keep it and pull
                    # the canonical entry up to date instead of the reverse.
                    if shadow != creds:
                        raw[i] = shadow
                        canonical_dirty = True
                else:
                    _atomic_write_secure(individual_path, json.dumps(creds, indent=2))
                auth = CodexAuth(str(individual_path), on_save=self._canonical_sync(i))
                self._accounts.append(auth)
                valid_count = i + 1
            if canonical_dirty:
                _atomic_write_secure(self._path, json.dumps(raw, indent=2))
            # Remove stale shadow files from previous larger pools
            for j in range(valid_count, valid_count + 20):
                stale = self._path.parent / f"codex_auth_{j}.json"
                if stale.exists():
                    stale.unlink()
                else:
                    break
            log.info("Codex auth pool: %d account(s) loaded", len(self._accounts))
        elif isinstance(raw, dict) and raw.get("access_token"):
            # Single account (backward compat) — use the file directly
            self._accounts.append(CodexAuth(str(self._path)))
            log.info("Codex auth pool: 1 account loaded (single format)")

    @staticmethod
    def _load_creds_file(path: Path) -> dict | None:
        if not path.exists():
            return None
        try:
            data = json.loads(path.read_text())
        except Exception:
            return None
        return data if isinstance(data, dict) else None

    def _canonical_sync(self, index: int):
        """Build an on_save hook that mirrors account *index* back to the canonical file."""
        def _sync(creds: dict) -> None:
            try:
                raw = json.loads(self._path.read_text())
            except Exception:
                return
            if not isinstance(raw, list) or index >= len(raw):
                return
            raw[index] = creds
            _atomic_write_secure(self._path, json.dumps(raw, indent=2))
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
        return self.quota.view(current_key=current, known_keys=known)

    def eligible_account_ids_snapshot(self) -> frozenset[str]:
        """Stable non-secret IDs for accounts eligible to serve right now."""
        result: set[str] = set()
        for auth in self._accounts:
            if auth.is_rate_limited() or not auth.is_configured():
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

    async def acquire(self) -> tuple[str, str | None, int]:
        """Pick a healthy account and return (access_token, account_id, index).

        The index pins the account to the request, so failure marking can
        target the account that actually served it — concurrent requests
        rotate the pool underneath each other, and penalizing "whatever is
        current now" benches healthy accounts. Token refresh happens OUTSIDE
        the pool lock: a slow refresh must not serialize unrelated LLM
        traffic, and the per-account refresh lock already prevents
        refresh-token reuse.
        """
        if not self._accounts:
            raise LLMAuthError("No Codex credentials configured.", provider="codex")
        errors: list[tuple[int, str]] = []
        for _ in range(len(self._accounts)):
            async with self._pool_lock:
                if not self._accounts:
                    raise LLMAuthError("No Codex credentials configured.", provider="codex")
                self._current_index %= len(self._accounts)
                idx = self._current_index
                auth = self._accounts[idx]
                if auth.is_rate_limited():
                    self._rotate()
                    continue
            try:
                token = await auth.get_access_token()
            except Exception as e:
                log.warning(
                    "Codex account %s failed: %s — rotating to next",
                    self._account_label(auth, idx), e,
                )
                errors.append((idx, str(e)))
                async with self._pool_lock:
                    auth.mark_rate_limited()
                    if (len(self._accounts) > 1
                            and self._accounts[self._current_index % len(self._accounts)] is auth):
                        self._rotate()
                continue
            return token, auth.get_account_id(), idx
        # Pool exhaustion is part of the typed taxonomy (PR #242 review
        # blocker #7): every rotation avenue is spent by the time these
        # raise, so the shared recovery must FAST-FAIL them — never treat
        # them as unclassified defects, and the subsystem guard must not
        # count quota exhaustion as generic subsystem failure. Both types
        # subclass RuntimeError, so legacy handlers are unaffected.
        if errors:
            raise LLMAuthError(
                f"All {len(self._accounts)} Codex accounts failed: "
                + "; ".join(f"#{i}: {err}" for i, err in errors),
                provider="codex",
            )
        raise LLMRateLimitError(
            f"All {len(self._accounts)} Codex accounts are rate-limited or "
            "backing off; retry shortly.",
            provider="codex",
        )

    async def get_access_token(self) -> str:
        """Get a token from a healthy account, rotating on failure or rate-limit."""
        token, _, _ = await self.acquire()
        return token

    async def token_for(self, index: int) -> tuple[str, str | None]:
        """Return (access_token, account_id) for a specific account index."""
        async with self._pool_lock:
            if not self._accounts or index >= len(self._accounts):
                raise RuntimeError(f"Codex account index {index} out of range")
            auth = self._accounts[index]
        return await auth.get_access_token(), auth.get_account_id()

    def get_account_id(self) -> str | None:
        if not self._accounts:
            return None
        return self.current.get_account_id()

    async def mark_limited(self, index: int) -> None:
        """Mark the *given* account rate-limited; rotate only if it is still current."""
        if not self._accounts:
            return
        async with self._pool_lock:
            if index >= len(self._accounts):
                return
            account = self._accounts[index]
            account.mark_rate_limited()
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
            if index >= len(self._accounts):
                return False
            account = self._accounts[index]
            account.mark_rate_limited(AUTH_FAILED_BACKOFF_SECONDS)
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
        """Force an immediate token refresh for the given account (reactive 401)."""
        if not self._accounts:
            return False
        async with self._pool_lock:
            if index >= len(self._accounts):
                return False
            account = self._accounts[index]
        # The account's own refresh lock guards the single-use refresh token;
        # run outside the pool lock so a slow refresh doesn't stall the pool.
        return await account.force_refresh(stale_token)

    def _rotate(self) -> None:
        self._current_index = (self._current_index + 1) % len(self._accounts)

    async def set_active(self, index: int) -> None:
        """Switch the active account to the given index."""
        if index < 0 or index >= len(self._accounts):
            raise ValueError(f"index {index} out of range (0-{len(self._accounts)-1})")
        async with self._pool_lock:
            self._current_index = index
            try:
                email = self._accounts[index]._load().get("email", f"account {index}")
            except Exception:
                email = f"account {index}"
            log.info("Active Codex account switched to %s (#%d)", email, index)

    def reload(self) -> None:
        """Reload the pool from the canonical credentials file (sync compat)."""
        self._accounts.clear()
        self._current_index = 0
        self._init_accounts()
        log.info("Codex auth pool reloaded: %d account(s)", len(self._accounts))

    async def reload_async(self) -> int:
        """Reload under lock to avoid racing in-flight token operations."""
        async with self._pool_lock:
            self._accounts.clear()
            self._init_accounts()
            self._current_index = min(self._current_index, max(len(self._accounts) - 1, 0))
            log.info("Codex auth pool reloaded (async): %d account(s)", len(self._accounts))
            return len(self._accounts)
