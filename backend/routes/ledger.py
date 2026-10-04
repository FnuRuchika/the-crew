"""Evidence Ledger API. Returns only safe operation data; never connection details."""

from __future__ import annotations

import logging
import uuid

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from db.database import Database, LedgerOffline
from db.ledger_repository import OperationNotFound, append_events, complete_operation, create_operation, get_ledger
from models.ledger import AppendEvents, CompleteOperation, CreateOperation

log = logging.getLogger("the_crew.ledger")
router = APIRouter(prefix="/api")


def _err(status: int, code: str, message: str, retryable: bool) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": {"code": code, "message": message, "retryable": retryable}})


OFFLINE = ("ledger_offline", "The evidence ledger is temporarily offline. The operation continues normally.")


def _db(request: Request) -> Database:
    return request.app.state.db


async def _run(request: Request, fn):
    try:
        async with _db(request).connection() as conn:
            return await fn(conn)
    except LedgerOffline:
        return _err(503, *OFFLINE, True)
    except OperationNotFound:
        return _err(404, "operation_not_found", "No such operation.", False)
    except Exception as e:  # noqa: BLE001: never leak driver/connection details
        log.warning("ledger query failed (%s)", type(e).__name__)
        return _err(503, *OFFLINE, True)


@router.get("/ledger/status")
async def ledger_status(request: Request) -> dict:
    db = _db(request)
    if db.configured and not db.online:
        await db.start()  # no-op while the breaker is open
    return {"configured": db.configured, "online": db.online, "engine": "tiger_data" if db.online else None, "timescaledb": db.timescale_version if db.online else None}


@router.post("/operations", status_code=201)
async def post_operation(body: CreateOperation, request: Request):
    return await _run(request, lambda conn: create_operation(conn, body))


@router.post("/operations/{op_id}/events")
async def post_events(op_id: uuid.UUID, body: AppendEvents, request: Request):
    async def go(conn):
        return {"accepted": len(body.events), **(await append_events(conn, op_id, body.events))}

    return await _run(request, go)


@router.patch("/operations/{op_id}/complete")
async def patch_complete(op_id: uuid.UUID, body: CompleteOperation, request: Request):
    async def go(conn):
        await complete_operation(conn, op_id, body)
        return {"ok": True}

    return await _run(request, go)


@router.get("/operations/{op_id}/ledger")
async def get_operation_ledger(op_id: uuid.UUID, request: Request):
    return await _run(request, lambda conn: get_ledger(conn, op_id))
