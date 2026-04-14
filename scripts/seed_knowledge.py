#!/usr/bin/env python3
"""Seed the knowledge base with infrastructure documentation.

Run this once (or after updating docs) to ingest the seed documents.
Can be run inside the container or externally with the right Python path.

Usage: python -m scripts.seed_knowledge
"""
import asyncio
import sys
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.config import load_config
from src.search.embedder import LocalEmbedder
from src.knowledge.store import KnowledgeStore
from src.logging import setup_logging, get_logger


async def main():
    config = load_config()
    setup_logging(level="INFO")
    log = get_logger("seed")

    if not config.search.enabled:
        log.error("Search is not enabled in config — cannot seed knowledge base")
        return

    embedder = LocalEmbedder()
    from pathlib import Path as _P
    search_dir = _P(config.search.search_db_path)
    search_dir.mkdir(parents=True, exist_ok=True)
    store = KnowledgeStore(str(search_dir / "knowledge.db"))

    if not store.available:
        log.error("Knowledge store not available — SQLite init failed")
        return

    seed_dir = Path("data/knowledge-seed")
    if not seed_dir.exists():
        log.warning("No seed directory found at %s", seed_dir)
        return

    total = 0
    for md_file in sorted(seed_dir.glob("*.md")):
        content = md_file.read_text()
        source = f"seed/{md_file.name}"
        chunks = await store.ingest(content, source, embedder, uploader="seed-script")
        log.info("  %s: %d chunks", md_file.name, chunks)
        total += chunks

    log.info("Seeding complete: %d total chunks across %d files",
             total, len(list(seed_dir.glob("*.md"))))
    log.info("Knowledge base now has %d total chunks", store.count())


if __name__ == "__main__":
    asyncio.run(main())
