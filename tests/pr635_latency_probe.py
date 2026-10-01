"""Compare foreground return latency in development trees, not live services."""
import asyncio
import json
import statistics
import sys
import time


async def main():
    sys.path.insert(0, sys.argv[1])
    from src.tools.local_supervisor import shutdown_local_supervisors
    from src.tools.ssh import run_local_command

    kwargs = {} if sys.argv[2] == "master" else {"command_shell": sys.argv[2]}
    samples = []
    try:
        for index in range(65):
            start = time.perf_counter()
            assert await run_local_command("printf harmless", **kwargs) == (0, "harmless")
            if index >= 5:
                samples.append(1000 * (time.perf_counter() - start))
    finally:
        await shutdown_local_supervisors()
    print(json.dumps({"mode": sys.argv[2], "median": statistics.median(samples),
                      "mean": statistics.mean(samples), "stdev": statistics.stdev(samples)}))


if __name__ == "__main__":
    asyncio.run(main())
