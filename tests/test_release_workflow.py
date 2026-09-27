"""Release tags are validated before version metadata can be changed."""

import os
import subprocess
from pathlib import Path

import pytest
import yaml

WORKFLOWS = Path(__file__).resolve().parents[1] / ".github" / "workflows"


def _steps():
    workflow = yaml.safe_load((WORKFLOWS / "release.yml").read_text())
    return {
        step.get("id", step.get("name")): step for step in workflow["jobs"]["build-deb"]["steps"]
    }


def _bash(source, cwd, **env):
    return subprocess.run(
        ["bash", "-e", "-c", source],
        cwd=cwd,
        env={"PATH": os.environ["PATH"], **env},
        capture_output=True,
        text=True,
        timeout=30,
    )


def _release_version(tmp_path, tag):
    steps = _steps()
    project = tmp_path / "pyproject.toml"
    project.write_text('[project]\nname = "fixture"\nversion = "0.0.0"\n')
    output = tmp_path / "github_output"
    output.write_text("")
    extracted = _bash(
        steps["version"]["run"], tmp_path, GITHUB_REF_NAME=tag, GITHUB_OUTPUT=str(output)
    )
    if extracted.returncode:
        return extracted.returncode, project.read_text()
    version = dict(line.split("=", 1) for line in output.read_text().splitlines())["version"]
    set_version = steps["Set version in pyproject.toml"]
    assert set_version["env"] == {"VERSION": "${{ steps.version.outputs.version }}"}
    changed = _bash(set_version["run"], tmp_path, VERSION=version)
    return changed.returncode, project.read_text()


def test_valid_release_tag_sets_package_version(tmp_path):
    result, project = _release_version(tmp_path, "v4.7.0")
    assert result == 0
    assert 'version = "4.7.0"' in project


@pytest.mark.parametrize(
    "tag",
    [
        "v1.2.3$(printf${IFS}INJECTED)",
        "v1.2.3`printf${IFS}INJECTED`",
        'v1.2.3";printf${IFS}INJECTED;"',
        "v1.2.3&INJECTED",
        "v1.2/3",
        "vnext",
    ],
)
def test_hostile_or_malformed_tag_rejected_before_use(tmp_path, tag):
    result, project = _release_version(tmp_path, tag)
    assert result != 0
    assert 'version = "0.0.0"' in project
    assert "INJECTED" not in project


def test_release_workflow_never_substitutes_expressions_into_shell_source():
    offenders = []
    for path in [WORKFLOWS / "release.yml"]:
        workflow = yaml.safe_load(path.read_text())
        for job in workflow.get("jobs", {}).values():
            for step in job.get("steps", []):
                if "${{" in str(step.get("run", "")):
                    offenders.append((path.name, step.get("name")))
    assert offenders == []
