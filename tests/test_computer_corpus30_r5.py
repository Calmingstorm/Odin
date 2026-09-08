"""Acceptance harness contracts, not substitutes for actual native GUI runs."""

import asyncio
import importlib.util
import itertools
import json
from pathlib import Path
from types import SimpleNamespace

import pytest

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts/computer-feasibility/corpus30-xed.py"
spec = importlib.util.spec_from_file_location("corpus30_xed_test", SCRIPT)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def test_fifteen_distinct_predeclared_workflows():
    assert set(module.PLANS) == set(range(1, 16))
    assert len({p[0] for p in module.PLANS.values()}) == 15
    assert module.PLANS[2][1].encode() != module.PLANS[2][1].encode("ascii", "ignore")


class InertXed(module.XedCorpus):
    """Run real note/export orchestration with inert native boundaries.

    Fixture observations and exported bytes do not claim to exercise Xed itself.
    """

    def __init__(self, out, *, close_works=True):
        self.out = out
        self.task = "inert-xed"
        self.backend = SimpleNamespace(last_native_observation={"window": {"title": ""}})
        self.events = []
        self.close_works = close_works
        self.closed = False

    async def act(self, operation, **fields):
        self.events.append((operation, fields))
        if operation == "click":
            assert fields == {"x": 117, "y": 102}
            if self.close_works:
                self.backend.last_native_observation["window"]["title"] = "Untitled"
                self.closed = True

    async def text(self, text):
        self.events.append(("text", text))

    async def key(self, key):
        self.events.append(("key", key))

    async def modal(self, present):
        self.events.append(("modal", present))

    async def save_as(self, name):
        self.events.append(("save", name))
        # Case 9 performs another save-as after this first save.
        self.backend.last_native_observation["window"]["title"] = (
            "copy-09.txt" if name == "case-09.txt" else name
        )

    async def observe(self):
        self.events.append(("observe", self.backend.last_native_observation["window"]["title"]))
        (self.out / "current.png").write_bytes(b"inert-frame")

    async def reopen(self, name):
        assert self.closed, "reopen must follow a successful close"
        self.events.append(("reopen", name))
        self.backend.last_native_observation["window"]["title"] = name


def exported_bytes(monkeypatch, run, payloads):
    """Replace native export only; retain XedCorpus's exact comparison."""
    remaining = iter(payloads)

    async def export(self, name, expected=None):
        assert self is run
        blob = next(remaining)
        run.events.append(("export", name, blob))
        return blob

    monkeypatch.setattr(module.HELPER.Corpus, "export", export)
    # Mismatches hit the real deadline immediately rather than sleeping 10s.
    clock = itertools.count(step=11)
    monkeypatch.setattr(module, "time", SimpleNamespace(monotonic=lambda: next(clock)))


@pytest.mark.parametrize("number", range(1, 16))
def test_no_clipboard_key_surface_expansion(tmp_path, monkeypatch, number):
    run = InertXed(tmp_path)
    expected = module.PLANS[number][1]
    initial = (expected + "\n").encode()
    final = (expected + f" [reopened-{number:02d}]\n").encode()
    exported_bytes(monkeypatch, run, [initial] * (2 if number == 9 else 1) + [final])
    asyncio.run(run.note(number))
    assert not {"ctrl+c", "ctrl+v", "ctrl+x"} & {
        event[1] for event in run.events if event[0] == "key"
    }


def test_success_requires_actual_close_and_exact_reopened_export(tmp_path, monkeypatch):
    run = InertXed(tmp_path)
    initial = "Name\tReading\nCafé\t23°C\nΔelta\tnaïve\n".encode()
    final = "Name\tReading\nCafé\t23°C\nΔelta\tnaïve [reopened-02]\n".encode()
    exported_bytes(monkeypatch, run, [initial, final])
    result = asyncio.run(run.note(2))
    assert result == {
        "variant": "unicode_tab_fields",
        "artifact": "case-02.txt",
        "saved_tab_closed": True,
        "disk_reopen_edit_exact": True,
        "exact_utf8": final.decode(),
    }
    events = run.events
    close = events.index(("click", {"x": 117, "y": 102}))
    reopen = events.index(("reopen", "case-02.txt"))
    assert close < reopen
    assert events[close + 1] == ("observe", "Untitled")
    assert [event for event in events if event[0] == "export"] == [
        ("export", "case-02.txt", initial),
        ("export", "case-02.txt", final),
    ]
    assert events.index(("text", " [reopened-02]")) > reopen
    assert events.index(("key", "ctrl+s")) > reopen


def test_saved_tab_remaining_active_prevents_reopen(tmp_path, monkeypatch):
    run = InertXed(tmp_path, close_works=False)
    exported_bytes(monkeypatch, run, [(module.PLANS[1][1] + "\n").encode()])
    with pytest.raises(AssertionError, match="saved tab still active"):
        asyncio.run(run.note(1))
    assert not any(event[0] == "reopen" for event in run.events)


@pytest.mark.parametrize("wrong_stage", ["initial", "reopened"])
def test_inexact_export_fails_and_retains_mismatch(tmp_path, monkeypatch, wrong_stage):
    run = InertXed(tmp_path)
    initial = (module.PLANS[2][1] + "\n").encode()
    wrong = (module.PLANS[2][1] + (" [reopened-02]" if wrong_stage == "reopened" else "")).encode()
    exported_bytes(monkeypatch, run, [initial, wrong] if wrong_stage == "reopened" else [wrong])
    with pytest.raises(AssertionError, match="GUI artifact differs"):
        asyncio.run(run.note(2))
    records = [json.loads(line) for line in (tmp_path / "events.jsonl").read_text().splitlines()]
    mismatch = next(row for row in records if row["event"] == "exact_mismatch")
    assert mismatch["actual"] == wrong.decode()
    assert mismatch["expected"] == wrong.decode() + "\n"
    assert any(event[0] == "reopen" for event in run.events) == (wrong_stage == "reopened")


def test_each_case_owns_fresh_sandbox_and_preserves_failed_ledger(tmp_path, monkeypatch, capsys):
    runs = []
    preserved = {"task": "xed-01", "status": "fail", "error": "original failure", "detail": [7]}

    class InertRun:
        def __init__(self, args):
            self.args = args
            self.out = Path(args.evidence)
            self.out.mkdir()
            self.ledger = []
            self.errors = []
            runs.append(self)

        async def run(self):
            if self.args.start == 1:
                self.ledger.append(preserved.copy())
                raise RuntimeError("cleanup failed after task failed")
            if self.args.start == 2:
                raise RuntimeError("failed before ledger entry")
            self.ledger.append({"task": "xed-03", "status": "pass"})

        def record(self, event, **data):
            self.errors.append((event, data))

    monkeypatch.setattr(module, "XedCorpus", InertRun)
    status = tmp_path / "status.json"
    monkeypatch.setattr(
        module,
        "Path",
        lambda value: status if str(value) == "/tmp/corpus30-r5-status.txt" else Path(value),
    )
    root = tmp_path / "batch"
    asyncio.run(module.main(SimpleNamespace(evidence=str(root), cases="1,2,3")))
    assert [run.args.start for run in runs] == [1, 2, 3]
    assert all(run.args.app == "xed" and run.args.count == 1 for run in runs)
    assert len({id(run) for run in runs}) == len({id(run.ledger) for run in runs}) == 3
    assert [run.out for run in runs] == [root / f"case-{n:02d}" for n in (1, 2, 3)]
    ledger = json.loads((root / "ledger.json").read_text())
    assert ledger == [
        preserved,
        {
            "task": "xed-02",
            "status": "fail",
            "error": "RuntimeError('failed before ledger entry')",
        },
        {"task": "xed-03", "status": "pass"},
    ]
    assert runs[0].ledger == [preserved]
    assert [run.errors[0][0] for run in runs[:2]] == ["runner_error", "runner_error"]
    assert json.loads(status.read_text())["xed_ledger"] == ledger
    assert json.loads(capsys.readouterr().out) == {
        "event": "batch_result",
        "passed": 1,
        "attempted": 3,
        "evidence": str(root),
    }
