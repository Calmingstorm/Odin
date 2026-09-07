"""Load optional distro GI in a worker without enabling global site packages.

Debian installs python3-gi outside the application venv. Only the fixed,
root-owned distro path is considered, and only in the native desktop worker.
No .pth files, environment paths, package installation or bus activation.
"""
from __future__ import annotations

import importlib
import importlib.machinery
import importlib.util
import stat
import sys
from pathlib import Path


def load_gi():
    try:
        return importlib.import_module("gi")
    except ModuleNotFoundError as exc:
        if exc.name != "gi":
            raise
    directory = Path("/usr/lib/python3/dist-packages")
    for path in (directory, *directory.parents):
        info = path.lstat()
        if (not stat.S_ISDIR(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022):
            raise ImportError("untrusted_distro_gi_path")
    # Load only gi from the trusted directory. Do not expose unrelated distro
    # modules to the venv; extension ABI compatibility is checked by the loader.
    spec = importlib.machinery.PathFinder.find_spec("gi", [str(directory)])
    if spec is None or spec.loader is None:
        raise ImportError("distro_gi_unavailable")
    module = importlib.util.module_from_spec(spec)
    sys.modules["gi"] = module
    try:
        spec.loader.exec_module(module)
    except BaseException:
        sys.modules.pop("gi", None)
        raise
    return module
