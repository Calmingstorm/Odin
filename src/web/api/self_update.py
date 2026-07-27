"""Self-update route registrars (RFC-003 P5 size split).

Carved from config_admin.py to honor the module-size gate; same verbatim
section, same registrar shape, same composition position.
"""

from __future__ import annotations

import asyncio
import os
import subprocess
from pathlib import Path

from aiohttp import web

from ... import restart
from ...odin_log import get_logger

log = get_logger("web.api")


def _repo_root() -> str:
    """Repo root = nearest ancestor of this module containing pyproject.toml.

    Derived by marker rather than a fixed number of dirname hops: the
    RFC-003 package split moved this module one level deeper
    (src/web/api.py -> src/web/api/self_update.py) and the old 3-hop
    derivation silently pointed base at <repo>/src — so the updater's
    pip reinstall step never ran (src/.venv does not exist), config.yml
    preservation joined the wrong directory, and the bot kept reporting
    the pre-update version from stale package metadata.
    """

    path = os.path.dirname(os.path.abspath(__file__))
    for _ in range(8):
        if os.path.isfile(os.path.join(path, "pyproject.toml")):
            return path
        parent = os.path.dirname(path)
        if parent == path:
            break
        path = parent
    # Fallback: historical layout, src/web/api/ is three levels below root
    return os.path.dirname(
        os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    )


def register_self_update(routes: web.RouteTableDef, bot) -> None:
    """Self-Update (verbatim from the monolith)."""
    # ------------------------------------------------------------------
    # Self-Update
    # ------------------------------------------------------------------

    @routes.get("/api/update/check")
    async def check_update(_request: web.Request) -> web.Response:
        from src.version import get_version
        current = get_version()
        try:
            import subprocess
            result = subprocess.run(
                ["gh", "api", "repos/Calmingstorm/Odin/releases/latest", "--jq", ".tag_name,.body"],
                capture_output=True, text=True, timeout=15,
            )
            if result.returncode != 0:
                return web.json_response(
                    {"current": current, "error": "Failed to check GitHub"}, status=502
                )
            lines = result.stdout.strip().split("\n", 1)
            latest_tag = lines[0].strip()
            changelog = lines[1].strip() if len(lines) > 1 else ""
            latest_version = latest_tag.lstrip("v")
            update_available = latest_version != current and latest_tag != f"v{current}"
            return web.json_response({
                "current": current,
                "latest": latest_tag,
                "update_available": update_available,
                "changelog": changelog[:2000],
            })
        except Exception as e:
            return web.json_response({"current": current, "error": str(e)}, status=502)

    @routes.post("/api/update/apply")
    async def apply_update(request: web.Request) -> web.Response:
        import re as _re
        import shutil
        try:
            data = await request.json()
        except Exception:
            data = {}
        target = data.get("version", "latest")
        base = _repo_root()

        # Self-update mutates a git checkout; .deb installs ship without one
        # (their upgrade path is apt). A linked worktree's .git is a FILE,
        # so ask git itself rather than probing the filesystem. Fail closed
        # to the friendly 409 before resolving tags or touching anything.
        try:
            r = subprocess.run(
                ["git", "-C", base, "rev-parse", "--is-inside-work-tree"],
                capture_output=True, text=True, timeout=10,
            )
            is_git = r.returncode == 0 and r.stdout.strip() == "true"
        except Exception:
            is_git = False
        if not is_git:
            return web.json_response({
                "error": (
                    "This install is not a git checkout, so self-update "
                    "cannot run. For .deb installs, upgrade via apt."
                ),
            }, status=409)

        # Resolve "latest" to actual release tag
        if target == "latest":
            r = subprocess.run(
                ["gh", "api", "repos/Calmingstorm/Odin/releases/latest", "--jq", ".tag_name"],
                capture_output=True, text=True, timeout=15,
            )
            if r.returncode != 0 or not r.stdout.strip():
                return web.json_response(
                    {"error": "Failed to resolve latest release tag"}, status=502
                )
            target = r.stdout.strip()

        # Validate tag format
        if not _re.fullmatch(r"v?\d+\.\d+\.\d+", target):
            return web.json_response({"error": f"Invalid version format: {target}"}, status=400)

        try:
            # Backup user-modified config files before updating
            _preserve = {"config.yml", ".env"}
            _backups: dict[str, bytes] = {}
            for fname in _preserve:
                fpath = os.path.join(base, fname)
                if os.path.exists(fpath):
                    _backups[fname] = open(fpath, "rb").read()

            # Check for unexpected dirty files (anything besides config.yml/.env)
            r = subprocess.run(
                ["git", "-C", base, "diff", "--name-only", "HEAD"],
                capture_output=True, text=True, timeout=10,
            )
            dirty = [
                f for f in r.stdout.strip().splitlines() if f.strip() and f.strip() not in _preserve
            ]
            if dirty:
                return web.json_response({
                    "error": (
                        f"Worktree has unexpected modifications ({', '.join(dirty[:5])}). "
                        "Only config.yml and .env are preserved automatically."
                    ),
                }, status=409)

            # PREFLIGHT: the incoming code runs local commands in a validated
            # workspace outside the install and REFUSES to run without one.
            # This updater re-execs in place, so systemd never starts the
            # service and never applies StateDirectory= — meaning an update
            # could succeed and leave Odin unable to run any local command
            # (PR #239 round-4 review, verified against the live install).
            # Provision it here, BEFORE committing to the update, and refuse
            # the update rather than transition to code that cannot work.
            ws_error = _ensure_local_workspace_for_update(bot, base)
            if ws_error:
                return web.json_response({
                    "error": (
                        "update refused: the local command workspace could not be "
                        f"provisioned, so the updated Odin would be unable to run "
                        f"local commands. {ws_error}"
                    ),
                }, status=409)

            # Reset only the preserved config files for clean pull
            for fname in _preserve:
                subprocess.run(
                    ["git", "-C", base, "checkout", "--", fname],
                    capture_output=True, timeout=10,
                )

            # Record current ref for potential rollback
            r = subprocess.run(
                ["git", "-C", base, "rev-parse", "HEAD"],
                capture_output=True, text=True, timeout=5,
            )
            prev_ref = r.stdout.strip() if r.returncode == 0 else None

            # Fetch and update master to the release tag's commit
            steps = [
                (["git", "-C", base, "fetch", "--tags", "origin"], "fetch"),
                (["git", "-C", base, "checkout", "master"], "checkout master"),
                (["git", "-C", base, "merge", "--ff-only", target], "fast-forward to release tag"),
            ]
            def _rollback(reason: str) -> web.Response:
                if prev_ref:
                    subprocess.run(
                    ["git", "-C", base, "checkout", "master"], capture_output=True, timeout=10
                )
                    subprocess.run(
                    ["git", "-C", base, "reset", "--hard", prev_ref],
                    capture_output=True,
                    timeout=10,
                )
                # Restore config backups even on failure
                for fname, data in _backups.items():
                    open(os.path.join(base, fname), "wb").write(data)
                return web.json_response({"error": reason}, status=500)

            for cmd, label in steps:
                r = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
                if r.returncode != 0:
                    return _rollback(f"{label} failed: {r.stderr.strip()}")

            # Restore user config files after update
            for fname, data in _backups.items():
                open(os.path.join(base, fname), "wb").write(data)

            # Stale build metadata (a leftover odin_bot.egg-info, e.g.
            # root-owned from a manual install) can poison the reinstall and
            # keep importlib.metadata reporting the previous version — the
            # updater then re-offers the release it just applied.
            egg_info = os.path.join(base, "odin_bot.egg-info")
            if os.path.isdir(egg_info):
                shutil.rmtree(egg_info, ignore_errors=True)

            # Install/update dependencies
            venv_pip = os.path.join(base, ".venv", "bin", "pip")
            if os.path.exists(venv_pip):
                r = subprocess.run(
                    [venv_pip, "install", "-q", base], capture_output=True, text=True, timeout=120
                )
                if r.returncode != 0:
                    return _rollback(f"dependency install failed: {r.stderr.strip()}")

            # Nuke pycache
            for root, dirs, _files in os.walk(base):
                for d in dirs:
                    if d == "__pycache__":
                        shutil.rmtree(os.path.join(root, d), ignore_errors=True)

            # Record restart intent, then trigger the normal graceful
            # shutdown; main() re-execs in place once the loop drains, so
            # coming back does not depend on the unit's Restart= policy.
            restart.request_restart()
            asyncio.get_running_loop().call_later(2, lambda: os.kill(os.getpid(), 15))
            return web.json_response({
                "status": "updating",
                "version": target,
                "previous": prev_ref[:12] if prev_ref else None,
                "message": f"Updated master to {target}. Restarting in place in 2 seconds...",
            })
        except Exception as e:
            return web.json_response({"error": str(e)}, status=500)

    @routes.post("/api/loops/stop-all")
    async def stop_all_loops(_request: web.Request) -> web.Response:
        result = bot.loop_manager.stop_loop("all")
        return web.json_response({"result": result})


def _ensure_local_workspace_for_update(bot=None, base: str | None = None) -> str | None:
    """Provision the local command workspace ahead of an in-place update.

    Returns None on success, or an operator-actionable message on failure.

    Delegates to the SINGLE authoritative implementation rather than
    reimplementing a weaker contract here. An independent copy accepted
    workspaces the runtime then rejected — a relative path, a symlink, one
    inside the install — and could create a directory the restarted executor
    would refuse, or provision a different directory from the one it actually
    uses (PR #239 round-5 review reproduced four such mismatches).

    The configuration comes from the LIVE bot when available, so the path
    checked here is the path the restarted process will use, including any
    alternate config file or environment substitution already applied.
    """
    from ...tools.workspace import (
        WorkspaceError,
        provision_workspace,
        provisioning_hint,
    )

    configured = _live_workspace_setting(bot)
    if not configured:
        return None  # nothing configured to validate; runtime default applies

    try:
        provision_workspace(configured, protected_roots=_live_protected_roots(bot, base))
        return None
    except WorkspaceError as exc:
        return f"{exc} {provisioning_hint(configured)}"
    except Exception as exc:  # pragma: no cover - defensive
        return f"{exc} {provisioning_hint(configured)}"


def _live_workspace_setting(bot) -> str:
    """The workspace path the RESTARTED process will actually use."""
    try:
        configured = bot.config.tools.local_working_dir
        if isinstance(configured, str) and configured.strip():
            return configured.strip()
    except Exception:
        pass
    try:
        from ...config.schema import ToolsConfig

        return ToolsConfig().local_working_dir
    except Exception:  # pragma: no cover - schema import cannot realistically fail
        return "/var/lib/odin-workspace"


def _live_protected_roots(bot, base: str | None) -> list[str]:
    """Install root plus canonical live-data roots, from the LIVE config.

    Delegates to the ONE shared derivation so the preflight cannot approve a
    workspace the restarted executor refuses. Deriving them here separately
    omitted live memory.json entirely, so with audit/trajectory paths relocated
    the updater created a workspace beside memory.json, reported success, and
    handed over to an executor that rejected every local command (PR #239
    round-6 review, reproduced).

    The live memory path is read from the running executor when reachable —
    that is the value wiring actually supplied — and falls back to the shared
    default otherwise.
    """
    from src.tools.workspace import DEFAULT_MEMORY_PATH, command_protected_roots

    tools = getattr(getattr(bot, "config", None), "tools", None)
    memory_path = getattr(getattr(bot, "tool_executor", None), "_memory_path", None)
    return command_protected_roots(
        Path(base).resolve() if base else Path(__file__).resolve().parents[3],
        audit_log_path=getattr(tools, "audit_log_path", None),
        trajectory_path=getattr(tools, "trajectory_path", None),
        memory_path=memory_path or DEFAULT_MEMORY_PATH,
    )


