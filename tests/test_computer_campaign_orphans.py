"""Disposable synthetic bytes only; crash before SQLite publication."""
import multiprocessing
import os
import uuid

import pytest

from src.computer.models import RequestContext
from src.computer.store import ComputerStore


def crash_writer(db, directory, session_id):
    store = ComputerStore(db, directory)
    real_fsync = os.fsync

    def crash_after_fsync(fd):
        real_fsync(fd)
        os._exit(0)

    os.fsync = crash_after_fsync
    store.put_evidence(session_id, b"private synthetic fixture")


@pytest.mark.parametrize("operation", ["prune", "purge_evidence"])
def test_crash_orphan_removed_but_operator_files_preserved(tmp_path, operation):
    db, directory = tmp_path / "db", tmp_path / "evidence"
    store = ComputerStore(db, directory)
    context = RequestContext("owner", "channel", "turn", "host")
    grant = store.create_session(context, "drawing")
    tracked = store.put_evidence(grant.session_id, b"tracked synthetic fixture")
    process = multiprocessing.get_context("fork").Process(
        target=crash_writer, args=(db, directory, grant.session_id))
    process.start()
    process.join(5)
    assert process.exitcode == 0
    orphans = set(os.listdir(directory)) - {tracked}
    assert len(orphans) == 1
    operator = directory / "operator-notes.txt"
    operator.write_bytes(b"operator file")
    unsafe = directory / uuid.uuid4().hex
    unsafe.write_bytes(b"non-private unrelated file")
    unsafe.chmod(0o644)
    link = directory / uuid.uuid4().hex
    link.symlink_to(operator)
    getattr(store, operation)()
    assert not any((directory / name).exists() for name in orphans)
    assert operator.read_bytes() == b"operator file"
    assert unsafe.exists() and link.is_symlink()
    assert (directory / tracked).exists() is (operation == "prune")
    store.close()
