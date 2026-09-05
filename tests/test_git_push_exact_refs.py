"""Real disposable Git refs prove preflight and push use the same target."""

import subprocess

import pytest

from src.tools.git_ops import build_git_command


def git(repo, *args):
    return subprocess.check_output(["git", "-C", str(repo), *args], text=True).strip()


@pytest.mark.parametrize("branch", [":target", "+source:target", "source:*", "source:", "a:b:c"])
def test_invalid_push_refspec_rejected(branch):
    with pytest.raises(ValueError, match="push requires"):
        build_git_command("push", {"branch": branch})


@pytest.mark.parametrize("failure", ["first_governor", "second_governor", "evidence", "tracking"])
async def test_handler_requires_exact_evidence_and_governor_approval(failure):
    from src.tools.handlers.devops import DevOpsTools

    calls = []
    approvals = []

    class Handler:
        def _resolve_host(self, host):
            return ("localhost", "", "linux")

        def _govern_command(self, command, host):
            approvals.append(command)
            deny = (failure == "first_governor" and len(approvals) == 1) or (
                failure == "second_governor" and len(approvals) == 2
            )
            return not deny, "policy denial", None

        async def _exec_command(self, address, command, user):
            calls.append(command)
            if failure == "evidence":
                return 0, "FRESH:without evidence"
            return 0, "ODIN_PUSH:" + "a" * 40 + ":refs/heads/destination:"

    result = await DevOpsTools._handle_git_ops(Handler(), {
        "host": "localhost", "action": "push", "params": {
            "branch": "source:destination", "set_upstream": failure == "tracking",
        },
    })
    assert len(calls) == (0 if failure == "first_governor" else 1)
    if "governor" in failure:
        assert result == "policy denial"
    else:
        assert isinstance(result, tuple) and result[1] == 1
        assert "missing" in result[0]


def test_other_source_destination_and_force_lease(tmp_path):
    remote = tmp_path / "remote.git"
    repo = tmp_path / "work"
    subprocess.run(["git", "init", "--bare", str(remote)], check=True, capture_output=True)
    subprocess.run(["git", "init", str(repo)], check=True, capture_output=True)
    git(repo, "config", "user.email", "test@example.com")
    git(repo, "config", "user.name", "Test")
    git(repo, "commit", "--allow-empty", "-m", "base")
    base = git(repo, "rev-parse", "HEAD")
    git(repo, "remote", "add", "origin", str(remote))
    git(repo, "branch", "source")
    git(repo, "push", "origin", "source:destination")
    git(repo, "commit", "--allow-empty", "-m", "remote ahead")
    git(repo, "push", "origin", "HEAD:destination")
    params = {"repo": str(repo), "branch": "source:destination", "force": True}
    check, push = build_git_command("push", params)
    output = subprocess.check_output(check, shell=True, text=True)
    assert "STALE:" in output  # HEAD is fresh; supplied source is not.
    ahead = git(repo, "rev-parse", "HEAD")
    git(repo, "branch", "-f", "source", ahead)
    git(repo, "checkout", "--detach", base)
    output = subprocess.check_output(check, shell=True, text=True)
    assert "FRESH:" in output  # HEAD is now stale, supplied source is fresh.
    assert f"ODIN_PUSH:{ahead}:refs/heads/destination:{ahead}" in output
    resolved = push.replace("__ODIN_SOURCE__", ahead).replace(
        "__ODIN_DEST__", "refs/heads/destination"
    ).replace("__ODIN_REMOTE__", ahead)
    assert f"--force-with-lease=refs/heads/destination:{ahead}" in resolved
    git(repo, "commit", "--allow-empty", "-m", "racing remote")
    racing = git(repo, "rev-parse", "HEAD")
    git(repo, "push", f"--force-with-lease=refs/heads/destination:{ahead}",
        "origin", "HEAD:destination")
    result = subprocess.run(resolved, shell=True, capture_output=True, text=True)
    assert result.returncode != 0
    assert git(remote, "rev-parse", "refs/heads/destination") == racing


def test_set_upstream_survives_pinned_commit_push(tmp_path):
    remote = tmp_path / "remote.git"
    repo = tmp_path / "work"
    subprocess.run(["git", "init", "--bare", str(remote)], check=True, capture_output=True)
    subprocess.run(["git", "init", "-b", "source", str(repo)], check=True, capture_output=True)
    git(repo, "config", "user.email", "test@example.com")
    git(repo, "config", "user.name", "Test")
    git(repo, "commit", "--allow-empty", "-m", "base")
    git(repo, "remote", "add", "origin", str(remote))
    check, push = build_git_command("push", {
        "repo": str(repo), "branch": "source:destination", "set_upstream": True,
    })
    output = subprocess.check_output(check, shell=True, text=True)
    assert "FRESH:" in output
    sha = git(repo, "rev-parse", "source")
    resolved = push.replace("__ODIN_SOURCE__", sha).replace(
        "__ODIN_DEST__", "refs/heads/destination"
    ).replace("__ODIN_BRANCH__", "destination").replace("__ODIN_TRACK__", "source")
    subprocess.run(resolved, shell=True, check=True, capture_output=True)
    assert git(repo, "rev-parse", "--abbrev-ref", "source@{upstream}") == "origin/destination"


@pytest.mark.parametrize("branch", [
    "HEAD", "HEAD:alternate", "source:alternate", "refs/heads/source:refs/heads/alternate", "",
])
async def test_handler_exact_head_and_alternate_refspec(tmp_path, branch):
    from src.tools.handlers.devops import DevOpsTools

    remote = tmp_path / "remote.git"
    repo = tmp_path / "work"
    subprocess.run(["git", "init", "--bare", str(remote)], check=True, capture_output=True)
    subprocess.run(["git", "init", "-b", "source", str(repo)], check=True, capture_output=True)
    git(repo, "config", "user.email", "test@example.com")
    git(repo, "config", "user.name", "Test")
    git(repo, "commit", "--allow-empty", "-m", "base")
    base = git(repo, "rev-parse", "HEAD")
    git(repo, "remote", "add", "origin", str(remote))
    git(repo, "push", "-u", "origin", "source:alternate")
    git(repo, "commit", "--allow-empty", "-m", "new source")
    expected = git(repo, "rev-parse", "HEAD")
    destination = "source" if branch == "HEAD" else "alternate"
    calls = []

    class Handler:
        def _resolve_host(self, host):
            return ("localhost", "", "linux")

        def _govern_command(self, command, host):
            return True, "", None

        async def _exec_command(self, address, command, user):
            calls.append(command)
            result = subprocess.run(command, shell=True, capture_output=True, text=True)
            if len(calls) == 1:
                # Actual push and tracking must remain bound to the checked
                # branch even if HEAD switches between the two shell commands.
                git(repo, "checkout", "-b", "unrelated", base)
            return result.returncode, result.stdout + result.stderr

    result = await DevOpsTools._handle_git_ops(Handler(), {
        "host": "localhost", "action": "push", "params": {
            "repo": str(repo), "branch": branch, "force": True, "set_upstream": True,
        },
    })
    assert isinstance(result, tuple) and result[1] == 0, result
    assert git(remote, "rev-parse", "refs/heads/" + destination) == expected
    refs = git(remote, "for-each-ref", "--format=%(refname)").splitlines()
    assert "refs/heads/HEAD" not in refs
    assert "refs/heads/unrelated" not in refs
    assert git(repo, "rev-parse", "--abbrev-ref", "source@{upstream}") == "origin/" + destination
    assert git(repo, "config", "--get-regexp", r"branch\..*\.merge") == (
        "branch.source.merge refs/heads/" + destination
    )
