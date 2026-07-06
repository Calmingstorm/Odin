"""Self-update route registrars (RFC-003 P5 size split).

Carved from config_admin.py to honor the module-size gate; same verbatim
section, same registrar shape, same composition position.
"""

from __future__ import annotations

import asyncio

from aiohttp import web

from ...odin_log import get_logger

log = get_logger("web.api")


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
        import os
        import re as _re
        import shutil
        import subprocess
        try:
            data = await request.json()
        except Exception:
            data = {}
        target = data.get("version", "latest")
        base = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

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

            # Graceful shutdown — systemd Restart=always will restart with new code
            asyncio.get_event_loop().call_later(2, lambda: os.kill(os.getpid(), 15))
            return web.json_response({
                "status": "updating",
                "version": target,
                "previous": prev_ref[:12] if prev_ref else None,
                "message": f"Updated master to {target}. Restarting in 2 seconds...",
            })
        except Exception as e:
            return web.json_response({"error": str(e)}, status=500)

    @routes.post("/api/loops/stop-all")
    async def stop_all_loops(_request: web.Request) -> web.Response:
        result = bot.loop_manager.stop_loop("all")
        return web.json_response({"result": result})
