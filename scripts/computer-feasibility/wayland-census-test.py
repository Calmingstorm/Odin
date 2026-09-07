"""Pure cgroup ownership binding tests. No Docker/process/desktop operation."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('wayland_census', Path(__file__).with_name('wayland-process-ledger.py'))
ledger = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ledger)


class CgroupOwnershipTest(unittest.TestCase):
    def test_exact_systemd_container(self):
        cid = 'a' * 64
        path = '/system.slice/docker-' + cid + '.scope'
        self.assertEqual(ledger.owned_group_path(['0::' + path], cid), path)

    def test_exact_cgroupfs_container(self):
        cid = 'a' * 64
        path = '/docker/' + cid
        self.assertEqual(ledger.owned_group_path(['0::' + path], cid), path)

    def test_reused_pid_unrelated_group_rejected(self):
        for path in ('/', '/system.slice/odin.service', '/docker/' + 'b' * 64,
                     '/system.slice/docker-' + 'a' * 64 + '.scope/../../odin.service'):
            with self.subTest(path=path), self.assertRaises(ValueError):
                ledger.owned_group_path(['0::' + path], 'a' * 64)

    def test_short_or_noncanonical_container_ids_rejected(self):
        for cid in ('', 'abc123', 'A' * 64, 'x' * 64, '../' * 22):
            with self.subTest(cid=cid), self.assertRaises(ValueError):
                ledger.owned_group_path(['0::/docker/' + cid], cid)


if __name__ == '__main__': unittest.main()
