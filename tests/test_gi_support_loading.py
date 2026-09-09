"""Exercise GI loading without importing GI or contacting a desktop/bus."""

import importlib.machinery
import stat
import sys
from types import SimpleNamespace
from unittest.mock import MagicMock, Mock

import pytest

from src.computer.runtime import gi_support


@pytest.fixture
def fallback(monkeypatch):
    """Replace every external boundary before load_gi can reach the host."""
    importer = Mock(side_effect=ModuleNotFoundError("missing gi", name="gi"))
    monkeypatch.setattr(gi_support.importlib, "import_module", importer)
    paths = []
    for name in ("/usr/lib/python3/dist-packages", "/usr/lib/python3", "/usr/lib", "/usr", "/"):
        path = MagicMock()
        path.__str__.return_value = name
        path.lstat.return_value = SimpleNamespace(st_mode=stat.S_IFDIR | 0o755, st_uid=0)
        paths.append(path)
    paths[0].parents = tuple(paths[1:])
    constructor = Mock(return_value=paths[0])
    monkeypatch.setattr(gi_support, "Path", constructor)
    finder = Mock(return_value=None)
    monkeypatch.setattr(gi_support.importlib.machinery.PathFinder, "find_spec", finder)
    # Restore any pre-existing module after each test, including successful loads.
    monkeypatch.setitem(sys.modules, "gi", None)
    monkeypatch.delitem(sys.modules, "gi", raising=False)
    return SimpleNamespace(importer=importer, paths=paths, constructor=constructor, finder=finder)


def test_normal_import_never_checks_distro_path(fallback):
    existing = SimpleNamespace()
    fallback.importer.side_effect = None
    fallback.importer.return_value = existing

    assert gi_support.load_gi() is existing
    fallback.importer.assert_called_once_with("gi")
    fallback.constructor.assert_not_called()
    fallback.finder.assert_not_called()


def test_nested_missing_dependency_is_rethrown(fallback):
    error = ModuleNotFoundError("missing dependency", name="gi._gi")
    fallback.importer.side_effect = error

    with pytest.raises(ModuleNotFoundError) as caught:
        gi_support.load_gi()

    assert caught.value is error
    fallback.constructor.assert_not_called()
    fallback.finder.assert_not_called()


@pytest.mark.parametrize("index", range(5), ids=["directory", "python3", "lib", "usr", "root"])
@pytest.mark.parametrize(
    ("mode", "uid"),
    [
        (stat.S_IFLNK | 0o755, 0),
        (stat.S_IFREG | 0o755, 0),
        (stat.S_IFDIR | 0o755, 1000),
        (stat.S_IFDIR | 0o775, 0),
        (stat.S_IFDIR | 0o757, 0),
    ],
    ids=["symlink", "file", "nonroot", "group-writable", "world-writable"],
)
def test_untrusted_path_or_parent_refused(fallback, index, mode, uid):
    fallback.paths[index].lstat.return_value = SimpleNamespace(st_mode=mode, st_uid=uid)

    with pytest.raises(ImportError, match="^untrusted_distro_gi_path$"):
        gi_support.load_gi()

    for path in fallback.paths[: index + 1]:
        path.lstat.assert_called_once_with()
    for path in fallback.paths[index + 1 :]:
        path.lstat.assert_not_called()
    fallback.finder.assert_not_called()
    assert "gi" not in sys.modules


@pytest.mark.parametrize("spec", [None, importlib.machinery.ModuleSpec("gi", None)])
def test_missing_spec_or_loader_refused(fallback, spec):
    fallback.finder.return_value = spec

    with pytest.raises(ImportError, match="^distro_gi_unavailable$"):
        gi_support.load_gi()

    fallback.finder.assert_called_once_with("gi", ["/usr/lib/python3/dist-packages"])
    assert "gi" not in sys.modules


def test_trusted_restricted_spec_loads_without_changing_search_path(fallback):
    before_path = list(sys.path)
    loader = Mock()
    loader.create_module.return_value = None

    def execute(module):
        assert sys.modules["gi"] is module
        module.loaded = True

    loader.exec_module.side_effect = execute
    spec = importlib.machinery.ModuleSpec("gi", loader)
    fallback.finder.return_value = spec

    module = gi_support.load_gi()

    assert module is sys.modules["gi"]
    assert module.__spec__ is spec
    assert module.loaded is True
    loader.create_module.assert_called_once_with(spec)
    loader.exec_module.assert_called_once_with(module)
    fallback.constructor.assert_called_once_with("/usr/lib/python3/dist-packages")
    fallback.finder.assert_called_once_with("gi", ["/usr/lib/python3/dist-packages"])
    for path in fallback.paths:
        path.lstat.assert_called_once_with()
    assert sys.path == before_path


@pytest.mark.parametrize("error", [RuntimeError("bad extension"), KeyboardInterrupt()])
def test_exec_failure_removes_partial_module_and_rethrows(fallback, error):
    before_path = list(sys.path)
    loader = Mock()
    loader.create_module.return_value = None

    def execute(module):
        assert sys.modules["gi"] is module
        raise error

    loader.exec_module.side_effect = execute
    fallback.finder.return_value = importlib.machinery.ModuleSpec("gi", loader)

    with pytest.raises(type(error)) as caught:
        gi_support.load_gi()

    assert caught.value is error
    loader.exec_module.assert_called_once()
    assert "gi" not in sys.modules
    assert sys.path == before_path
