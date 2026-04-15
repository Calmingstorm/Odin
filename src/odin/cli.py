"""Command-line interface for Odin."""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import sys

from src.odin.plan_loader import load_plan
from src.odin.planner import PlanValidationError, Planner
from src.odin.registry import ToolRegistry
from src.odin.reporter import Reporter


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="odin", description="Odin execution agent")
    sub = parser.add_subparsers(dest="command")

    run_p = sub.add_parser("run", help="Execute a plan")
    run_p.add_argument("plan", help="Path to a YAML plan file, or inline JSON")
    run_p.add_argument("--json", action="store_true", dest="json_output", help="JSON output")
    run_p.add_argument("-v", "--verbose", action="store_true")

    val_p = sub.add_parser("validate", help="Validate a plan without executing")
    val_p.add_argument("plan", help="Path to a YAML plan file")

    sub.add_parser("list-tools", help="List registered tools")

    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(0)

    logging.basicConfig(
        level=logging.DEBUG if getattr(args, "verbose", False) else logging.WARNING,
        format="%(levelname)s %(name)s: %(message)s",
    )

    exit_code = asyncio.run(_dispatch(args))
    sys.exit(exit_code)


async def _dispatch(args: argparse.Namespace) -> int:
    if args.command == "list-tools":
        registry = ToolRegistry.with_defaults()
        for name in registry.list_tools():
            print(f"  {name}")
        return 0

    if args.command == "validate":
        plan = load_plan(args.plan)
        planner = Planner(ToolRegistry.with_defaults())
        errors = planner.validate(plan)
        if errors:
            for e in errors:
                print(f"ERROR: {e}", file=sys.stderr)
            return 2
        print("Plan is valid.")
        return 0

    if args.command == "run":
        plan = load_plan(args.plan)
        planner = Planner(ToolRegistry.with_defaults())

        try:
            result = await planner.execute(plan)
        except PlanValidationError as exc:
            for e in exc.errors:
                print(f"ERROR: {e}", file=sys.stderr)
            return 2

        if args.json_output:
            print(Reporter.to_json(result))
        else:
            print(Reporter.to_summary(result))

        return 0 if result.success else 1

    return 0
