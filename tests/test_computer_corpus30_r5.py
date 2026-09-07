"""Acceptance harness contracts, not substitutes for actual native GUI runs."""
import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT/'scripts/computer-feasibility/corpus30-xed.py'
spec = importlib.util.spec_from_file_location('corpus30_xed_test', SCRIPT)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def test_fifteen_distinct_predeclared_workflows():
    assert set(module.PLANS) == set(range(1, 16))
    assert len({p[0] for p in module.PLANS.values()}) == 15
    assert module.PLANS[2][1].encode() != module.PLANS[2][1].encode('ascii', 'ignore')


def test_no_clipboard_key_surface_expansion():
    source = SCRIPT.read_text()
    assert "self.key('ctrl+c')" not in source
    assert "self.key('ctrl+v')" not in source
    assert "self.key('ctrl+x')" not in source


def test_success_requires_actual_close_and_exact_reopened_export():
    source = SCRIPT.read_text()
    close_index = source.index("await self.act('click', x=117, y=102)")
    assert close_index < source.index('await self.reopen(name)')
    assert 'saved tab still active' in source
    assert "await self.export(name, (expected+f' [reopened-" in source


def test_each_case_owns_fresh_sandbox_and_preserves_failed_ledger():
    source = SCRIPT.read_text()
    assert "for number in map(int, args.cases.split(','))" in source
    assert "run = XedCorpus(" in source
    assert 'ledger.extend(run.ledger)' in source
