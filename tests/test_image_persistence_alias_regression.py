"""Image intent must not bypass canonical/legacy spelling reconciliation."""
import pytest
import yaml

from src.config.persistence import patch_config_paths


@pytest.mark.parametrize("canonical", ["new", "${DB_PATH}"])
def test_equal_canonical_leaf_does_not_skip_stale_alias(tmp_path, monkeypatch, canonical):
    monkeypatch.setenv("DB_PATH", "new")
    path = tmp_path / "config.yml"
    path.write_text(f"search:\n  search_db_path: {canonical}\n  chromadb_path: old\n")
    patch_config_paths(
        [(("search", "search_db_path"), "new", ("chromadb_path",))], path=path,
    )
    result = yaml.safe_load(path.read_text())
    assert result["search"]["search_db_path"] == canonical
    assert result["search"]["chromadb_path"] == "new"
