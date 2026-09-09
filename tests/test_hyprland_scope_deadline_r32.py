"""Compile the shipping pure deadline rule, never connect to a compositor."""

import shutil
import subprocess
from pathlib import Path

import pytest


def test_native_scope_deadline_does_not_launder_delayed_authority(tmp_path):
    compiler = shutil.which("c++")
    if compiler is None:
        pytest.skip("C++ compiler required for native deadline rule")
    root = Path(__file__).resolve().parents[1]
    source = r'''
#include "scope-deadline.hpp"
using odin_scope::bounded_deadline;
static_assert(bounded_deadline(1000000000, 1250000000, 250) == 1250000000);
static_assert(bounded_deadline(1100000000, 1250000000, 250) == 1250000000);
static_assert(bounded_deadline(1249999999, 1250000000, 250) == 1250000000);
static_assert(bounded_deadline(1250000000, 1250000000, 250) == 0);
static_assert(bounded_deadline(1300000000, 1250000000, 250) == 0);
static_assert(bounded_deadline(1000000000, 1250000001, 250) == 0);
static_assert(bounded_deadline(1000000000, 1250000000, 30) == 1030000000);
static_assert(bounded_deadline(1000000000, 1250000000, 0) == 0);
static_assert(bounded_deadline(1000000000, 1250000000, 251) == 0);
static_assert(bounded_deadline(-1, 10, 1) == 0);
static_assert(bounded_deadline(9223372036854775807LL, 9223372036854775807LL, 250) == 0);
int main() {}
'''
    binary = tmp_path / "scope-deadline"
    subprocess.run(
        [compiler, "-std=c++17", "-Wall", "-Wextra", "-Werror", "-x", "c++", "-",
         "-I", str(root / "assets/hyprland-input"), "-o", str(binary)],
        input=source, text=True, capture_output=True, check=True, timeout=30,
    )
    subprocess.run([str(binary)], check=True, timeout=3)
