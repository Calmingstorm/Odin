"""Entry point for running Odin via `python -m src`."""

import sys


def main():
    from src.discord.client import run_bot

    try:
        run_bot()
    except KeyboardInterrupt:
        sys.exit(0)


if __name__ == "__main__":
    main()
