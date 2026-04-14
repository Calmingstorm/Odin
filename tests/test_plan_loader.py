"""Tests for plan loading from JSON strings and dicts."""

from __future__ import annotations

import json

import pytest

from src.odin.plan_loader import load_plan


def test_load_from_dict():
    plan = load_plan({
        "name": "test",
        "steps": [
            {"id": "a", "tool": "shell", "params": {"command": "echo hi"}},
        ],
    })
    assert plan.name == "test"
    assert len(plan.steps) == 1
    assert plan.steps[0].id == "a"


def test_load_from_json_string():
    data = json.dumps({
        "name": "json-plan",
        "steps": [
            {"id": "s1", "tool": "shell", "params": {"command": "ls"}},
            {"id": "s2", "tool": "shell", "depends_on": "s1"},
        ],
    })
    plan = load_plan(data)
    assert plan.name == "json-plan"
    assert plan.steps[1].depends_on == ("s1",)


def test_load_depends_on_list():
    plan = load_plan({
        "name": "multi-dep",
        "steps": [
            {"id": "a", "tool": "echo"},
            {"id": "b", "tool": "echo"},
            {"id": "c", "tool": "echo", "depends_on": ["a", "b"]},
        ],
    })
    assert plan.steps[2].depends_on == ("a", "b")


def test_load_with_options():
    plan = load_plan({
        "name": "opts",
        "steps": [
            {
                "id": "x",
                "tool": "shell",
                "timeout": 60,
                "retries": 3,
                "continue_on_failure": True,
            },
        ],
    })
    assert plan.steps[0].timeout == 60.0
    assert plan.steps[0].retries == 3
    assert plan.steps[0].continue_on_failure is True


def test_load_missing_name():
    with pytest.raises(ValueError, match="name"):
        load_plan({"steps": [{"id": "a", "tool": "x"}]})


def test_load_missing_steps():
    with pytest.raises(ValueError, match="steps"):
        load_plan({"name": "no-steps"})


def test_load_bad_json():
    with pytest.raises(ValueError, match="Cannot parse"):
        load_plan("{invalid json")
