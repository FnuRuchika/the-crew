"""Tiger Data (PostgreSQL + TimescaleDB) connection management.

The ledger is *secondary* to THE CREW's safety flow. Everything here is designed to fail
fast and quietly:
  - short connect/query timeouts,
  - a circuit breaker: after a failure the ledger is "offline" for a cooldown and calls
    fail instantly instead of making a victim-facing flow wait on the network,
  - errors are logged by type only (asyncpg messages can contain hostnames).

DATABASE_URL is read from the environment and never logged, returned or echoed.
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncIterator

import asyncpg

log = logging.getLogger("the_crew.ledger")

MIGRATIONS_DIR = Path(__file__).parent / "migrations"
MIGRATION_LOCK_ID = 7_240_001  # pg_advisory_lock key: one migrator at a time


class LedgerOffline(Exception):
    """The ledger can't be reached right now. Callers fall back; nothing user-facing breaks."""


class Database:
    def __init__(
        self,
        url: str | None,
        *,
        connect_timeout: float = 6.0,
        query_timeout: float = 4.0,
        cooldown_seconds: float = 30.0,
        min_size: int = 1,
        max_size: int = 4,
    ):
        self._url = url
        self.connect_timeout = connect_timeout
        self.query_timeout = query_timeout
        self.cooldown_seconds = cooldown_seconds
        self._min, self._max = min_size, max_size
        self._pool: asyncpg.Pool | None = None
        self._offline_until = 0.0
        self._lock = asyncio.Lock()
        self.timescale_version: str | None = None
        self.last_error: str | None = None  # exception *type* only

    @classmethod
    def from_env(cls) -> "Database":
        return cls((os.getenv("DATABASE_URL") or "").strip() or None)

    @property
    def configured(self) -> bool:
        return self._url is not None

    @property
    def online(self) -> bool:
        return self._pool is not None

    def _trip(self, exc: BaseException) -> None:
        self.last_error = type(exc).__name__
        self._offline_until = time.monotonic() + self.cooldown_seconds
        log.warning("ledger offline (%s); retrying after %.0fs", self.last_error, self.cooldown_seconds)

    async def start(self) -> bool:
        """Open the pool and apply migrations. Never raises."""
        if not self._url:
            return False
        async with self._lock:
            if self._pool is not None:
                return True
            if time.monotonic() < self._offline_until:
                return False
            try:
                pool = await asyncio.wait_for(
                    asyncpg.create_pool(
                        self._url,
                        min_size=self._min,
                        max_size=self._max,
                        command_timeout=self.query_timeout,
                        timeout=self.connect_timeout,
                        statement_cache_size=0,  # safe behind connection poolers
                        max_inactive_connection_lifetime=120,
                    ),
                    timeout=self.connect_timeout + 2,
                )
                async with pool.acquire() as conn:
                    await apply_migrations(conn)
                    self.timescale_version = await conn.fetchval("SELECT extversion FROM pg_extension WHERE extname = 'timescaledb'")
                self._pool = pool
                self.last_error = None
                log.info("ledger online (timescaledb %s)", self.timescale_version)
                return True
            except Exception as e:  # noqa: BLE001: any failure means "offline", never a crash
                self._trip(e)
                return False

    @asynccontextmanager
    async def connection(self) -> AsyncIterator[asyncpg.Connection]:
        """A pooled connection, or LedgerOffline immediately if the breaker is open."""
        if self._pool is None and not await self.start():
            raise LedgerOffline()
        assert self._pool is not None
        try:
            async with self._pool.acquire(timeout=self.connect_timeout) as conn:
                yield conn
        except (OSError, asyncio.TimeoutError, asyncpg.exceptions.ConnectionDoesNotExistError,
                asyncpg.exceptions.InterfaceError, asyncpg.exceptions.CannotConnectNowError,
                asyncpg.exceptions.TooManyConnectionsError) as e:
            # Connectivity problem: drop the pool and open the breaker.
            pool, self._pool = self._pool, None
            self._trip(e)
            if pool is not None:
                pool.terminate()
            raise LedgerOffline() from e

    async def close(self) -> None:
        if self._pool is not None:
            await self._pool.close()
            self._pool = None


async def apply_migrations(conn: asyncpg.Connection) -> list[str]:
    """Apply db/migrations/*.sql in order, once each. Idempotent and concurrency-safe."""
    applied_now: list[str] = []
    await conn.execute("SELECT pg_advisory_lock($1)", MIGRATION_LOCK_ID)
    try:
        await conn.execute("CREATE SCHEMA IF NOT EXISTS crew")
        await conn.execute(
            "CREATE TABLE IF NOT EXISTS crew.schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())"
        )
        done = {r["version"] for r in await conn.fetch("SELECT version FROM crew.schema_migrations")}
        for path in sorted(MIGRATIONS_DIR.glob("*.sql")):
            version = path.stem
            if version in done:
                continue
            async with conn.transaction():
                await conn.execute(path.read_text())
                await conn.execute("INSERT INTO crew.schema_migrations (version) VALUES ($1)", version)
            applied_now.append(version)
            log.info("applied migration %s", version)
    finally:
        await conn.execute("SELECT pg_advisory_unlock($1)", MIGRATION_LOCK_ID)
    return applied_now
