#!/usr/bin/env python3
"""Finite, isolated source benchmark. No bot startup, live config, or desktop access.

Run with the dev venv Python. Archive base/current HEAD into an owned /tmp
directory. Warm persistent workers, then randomize interleaved batch order.
Raw batch ns and per-operation summaries are retained beside the archives.
"""

import argparse
import asyncio
import hashlib
import json
import math
import os
import random
import statistics
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from types import SimpleNamespace


async def worker(root, mode):
    sys.path.insert(0, str(root))
    os.chdir(root)
    from src.config.schema import Config
    from src.discord.tool_catalog import ToolCatalog
    from src.discord.tool_loop import ToolLoopRunner
    from src.permissions.manager import PermissionManager
    from src.tools.executor import ToolExecutor

    state = root / "benchmark-state"
    state.mkdir(mode=0o700)
    config = Config(discord={"token": "benchmark-placeholder-not-a-credential"})
    config.tools.ssh_pool.enabled = False
    skills = SimpleNamespace(get_tool_definitions=lambda: [])
    permissions = PermissionManager({}, overrides_path=str(state / "permissions.json"))
    executor = ToolExecutor(config.tools, memory_path=str(state / "memory.json"), app_config=config)
    catalog = ToolCatalog(get_config=lambda: config, skill_manager=skills)
    runner = ToolLoopRunner.__new__(ToolLoopRunner)
    runner._get_config = lambda: config
    runner._tool_catalog = catalog
    runner._permissions = permissions
    runner._get_computer = lambda: None
    turn = SimpleNamespace(messages=[{"role": "user", "content": "List my notes."}])
    lifecycle = None
    lifecycle_evidence = {}
    if mode != "base":
        from src.computer.integration import ComputerIntegration
        from src.computer.manager import ComputerLifecycle

        config.computer.enabled = mode == "idle"
        config.computer.storage_dir = str(state)
        bot = SimpleNamespace(config=config, tool_catalog=catalog, skill_manager=skills)
        # Real integration/controller/store. Inject the real constructor solely
        # to skip desktop profile preflight: this measures idle, not readiness.
        lifecycle = ComputerLifecycle(bot, factory=ComputerIntegration)
        before = set(asyncio.all_tasks())
        start = time.perf_counter_ns()
        await lifecycle.start()
        lifecycle_evidence["start_ns"] = time.perf_counter_ns() - start
        lifecycle_evidence["new_tasks"] = sorted(
            t.get_name() for t in set(asyncio.all_tasks()) - before
        )
        lifecycle_evidence["service_constructed"] = lifecycle._service is not None
        executor.computer_reserved = lifecycle.reserves_tool
        if mode == "idle":
            runner._get_computer = lambda: lifecycle
        catalog.computer_available = lambda: lifecycle.enabled
        assert bool(lifecycle._service) == (mode == "idle")
        assert len(set(asyncio.all_tasks()) - before) == (1 if mode == "idle" else 0)

    # Block any accidental network or desktop subprocess after construction.
    def guard(event, args):
        if event in {"socket.connect", "subprocess.Popen", "os.system"}:
            raise RuntimeError("Benchmark forbids external I/O: " + event)

    sys.addaudithook(guard)
    definitions = catalog.merged_definitions()
    ordinary = [d for d in definitions if not d["name"].startswith("computer_")]
    encoded = json.dumps(ordinary, sort_keys=True, separators=(",", ":")).encode()
    (state / "ordinary-catalog.json").write_bytes(encoded)
    allowed = ["memory_manage", "search_history", "read_file"]

    def scoped():
        result = runner._scoped_tools_for_request(user_id="bench", api_allowed=allowed)
        assert result
        return result

    def preprocess():
        # Actual newly added frame-preparation branch plus existing request
        # scoping. Deliberately not an entire model/provider request pipeline.
        if mode != "base":
            assert not runner._computer_frames(turn)
        return scoped()

    async def dispatch():
        # Real handler's pure validation branch, no file/thread/network work.
        result = await executor.execute("memory_manage", {"action": "get"}, user_id="bench")
        assert "'key' is required" in result.output

    async def measure(kind, count):
        start = time.perf_counter_ns()
        if kind == "dispatch":
            for _ in range(count):
                await dispatch()
        elif kind == "workload":
            for _ in range(count):
                preprocess()
                await dispatch()
        else:
            operation = {
                "cached_catalog": catalog.merged_definitions,
                "uncached_catalog": lambda: (catalog.invalidate(), catalog.merged_definitions()),
                "scoped": scoped,
                "preprocess": preprocess,
            }[kind]
            for _ in range(count):
                operation()
        return time.perf_counter_ns() - start

    print(
        json.dumps(
            {
                "ready": True,
                "catalog_sha256": hashlib.sha256(encoded).hexdigest(),
                "ordinary_count": len(ordinary),
                "total_count": len(definitions),
                "lifecycle": lifecycle_evidence,
            }
        ),
        flush=True,
    )
    for line in sys.stdin:
        command = json.loads(line)
        if command["kind"] == "close":
            if lifecycle:
                await lifecycle.close()
                assert lifecycle._service is None
                assert lifecycle._janitor is None
            print(
                json.dumps({"closed": True, "remaining_tasks": len(asyncio.all_tasks()) - 1}),
                flush=True,
            )
            return
        duration = await measure(command["kind"], command["count"])
        print(json.dumps({"ns": duration}), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--worker", choices=["base", "disabled", "idle"])
    parser.add_argument("--root", type=Path)
    args = parser.parse_args()
    if args.worker:
        asyncio.run(worker(args.root, args.worker))
        return
    repo = Path(__file__).resolve().parents[2]
    if subprocess.check_output(["git", "diff", "HEAD", "--", "src"], cwd=repo):
        raise SystemExit(
            "Refusing: source has uncommitted differences; archive would misrepresent it"
        )
    output = Path(tempfile.mkdtemp(prefix="odin-r5-overhead-"))
    refs = {"base": "d5fc7eb", "disabled": "HEAD", "idle": "HEAD"}
    processes = {}
    evidence = {
        "root": str(output),
        "seed": 350,
        "rounds": 30,
        "python": sys.version,
        "source": {},
        "ready": {},
        "samples": [],
        "close": {},
    }
    script = Path(__file__).resolve()
    try:
        for mode, ref in refs.items():
            root = output / mode
            root.mkdir()
            evidence["source"][mode] = subprocess.check_output(
                ["git", "rev-parse", ref], cwd=repo, text=True
            ).strip()
            archive = subprocess.run(
                ["git", "archive", ref], cwd=repo, capture_output=True, check=True
            )
            subprocess.run(["tar", "-x", "-C", str(root)], input=archive.stdout, check=True)
            env = {
                "PATH": os.environ.get("PATH", ""),
                "HOME": str(root),
                "PYTHONHASHSEED": "350",
                "LANG": "C.UTF-8",
            }
            log = open(output / (mode + ".stderr"), "w")
            proc = subprocess.Popen(
                [sys.executable, str(script), "--worker", mode, "--root", str(root)],
                cwd=root,
                env=env,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=log,
                text=True,
            )
            processes[mode] = (proc, log)
            evidence["ready"][mode] = json.loads(proc.stdout.readline())
        catalogs = [
            (output / mode / "benchmark-state/ordinary-catalog.json").read_bytes() for mode in refs
        ]
        evidence["ordinary_catalog_byte_equal"] = len(set(catalogs)) == 1
        if not evidence["ordinary_catalog_byte_equal"]:
            raise RuntimeError("Ordinary catalog mismatch; comparison refused")
        counts = {
            "cached_catalog": 100000,
            "uncached_catalog": 1000,
            "scoped": 10000,
            "preprocess": 10000,
            "dispatch": 1000,
            "workload": 1000,
        }
        rng = random.Random(350)

        def request(mode, kind, count):
            proc = processes[mode][0]
            proc.stdin.write(json.dumps({"kind": kind, "count": count}) + "\n")
            proc.stdin.flush()
            return json.loads(proc.stdout.readline())

        for _ in range(3):
            for mode in refs:
                for kind, count in counts.items():
                    request(mode, kind, count)
        for iteration in range(30):
            jobs = [(mode, kind) for mode in refs for kind in counts]
            rng.shuffle(jobs)
            for mode, kind in jobs:
                result = request(mode, kind, counts[kind])
                evidence["samples"].append(
                    {
                        "round": iteration,
                        "mode": mode,
                        "kind": kind,
                        "count": counts[kind],
                        "ns": result["ns"],
                    }
                )
        evidence["summary"] = {}
        for kind in counts:
            modes = {}
            for mode in refs:
                values = sorted(
                    s["ns"] / s["count"]
                    for s in evidence["samples"]
                    if s["mode"] == mode and s["kind"] == kind
                )
                median = statistics.median(values)
                modes[mode] = {
                    "median_ns_per_op": median,
                    "p95_ns_per_op": values[math.ceil(0.95 * len(values)) - 1],
                    "min_ns_per_op": min(values),
                    "max_ns_per_op": max(values),
                    "mad_percent": statistics.median(abs(v - median) for v in values)
                    / median
                    * 100,
                }
            modes["disabled_delta_percent"] = (
                modes["disabled"]["median_ns_per_op"] / modes["base"]["median_ns_per_op"] - 1
            ) * 100
            evidence["summary"][kind] = modes
        for mode in refs:
            evidence["close"][mode] = request(mode, "close", 0)
            assert processes[mode][0].wait(timeout=10) == 0
    finally:
        for proc, log in processes.values():
            if proc.poll() is None:
                proc.kill()
                proc.wait()
            log.close()
        (output / "results.json").write_text(json.dumps(evidence, indent=2) + "\n")
        print(str(output / "results.json"), flush=True)
    print(json.dumps(evidence.get("summary", {}), indent=2))


if __name__ == "__main__":
    main()
