"""Repeatable schema initialisation: `cd backend && .venv/bin/python -m db.migrate`

Applies any pending migrations to the database in DATABASE_URL and reports the result.
Prints no connection details.
"""

from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

import asyncpg
from dotenv import load_dotenv

from db.database import apply_migrations

load_dotenv(Path(__file__).resolve().parent.parent / ".env")


async def main() -> int:
    url = (os.getenv("DATABASE_URL") or "").strip()
    if not url:
        print("DATABASE_URL is not set in backend/.env")
        return 1
    try:
        conn = await asyncio.wait_for(asyncpg.connect(url, statement_cache_size=0), timeout=15)
    except Exception as e:  # noqa: BLE001
        print(f"Could not connect to the database ({type(e).__name__}).")
        return 1
    try:
        applied = await apply_migrations(conn)
        versions = [r["version"] for r in await conn.fetch("SELECT version FROM crew.schema_migrations ORDER BY version")]
        hypertables = [r["hypertable_name"] for r in await conn.fetch(
            "SELECT hypertable_name FROM timescaledb_information.hypertables WHERE hypertable_schema = 'crew' ORDER BY 1")]
        print(f"Applied now: {applied or 'nothing (already up to date)'}")
        print(f"Schema version(s): {', '.join(versions)}")
        print(f"Hypertables: {', '.join(hypertables)}")
        return 0
    finally:
        await conn.close()


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
