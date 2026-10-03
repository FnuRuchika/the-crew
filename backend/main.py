"""THE CREW: backend API.

Run (from backend/):  uvicorn main:app --reload --port 8000
"""

from __future__ import annotations

import logging
import os
import time
from collections import defaultdict, deque
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

load_dotenv(Path(__file__).parent / ".env")

from models.analysis import MAX_INPUT_CHARS, AnalyzeRequest, AnalyzeResponse, ErrorResponse  # noqa: E402
from services.gemini_service import GeminiConfig, GeminiError, GeminiService  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
log = logging.getLogger("the_crew")

ORIGINS = [
    o.strip()
    for o in (os.getenv("FRONTEND_ORIGINS") or "http://localhost:5173,http://127.0.0.1:5173").split(",")
    if o.strip()
]

app = FastAPI(title="THE CREW API", version="0.2.0", docs_url="/api/docs", openapi_url="/api/openapi.json")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

app.state.gemini = GeminiService(GeminiConfig.from_env())


def error(status: int, code: str, message: str, retryable: bool) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content=ErrorResponse(error={"code": code, "message": message, "retryable": retryable}).model_dump(),
    )


# Tiny in-memory rate limit per client IP: protects the demo key from accidental floods.
RATE_LIMIT = int(os.getenv("RATE_LIMIT_PER_MINUTE") or 12)
_hits: dict[str, deque[float]] = defaultdict(deque)


def rate_limited(ip: str) -> bool:
    now = time.monotonic()
    q = _hits[ip]
    while q and now - q[0] > 60:
        q.popleft()
    if len(q) >= RATE_LIMIT:
        return True
    q.append(now)
    return False


@app.exception_handler(RequestValidationError)
async def on_validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
    # Report the first problem without echoing the submitted text back.
    first = exc.errors()[0] if exc.errors() else {}
    msg = str(first.get("msg", "Invalid request.")).removeprefix("Value error, ")
    return error(422, "invalid_input", msg, False)


@app.get("/api/health")
async def health() -> dict:
    svc: GeminiService = app.state.gemini
    return {
        "status": "ok",
        "gemini_configured": svc.configured,
        "model": svc.config.model,
        "max_input_chars": MAX_INPUT_CHARS,
    }


@app.post(
    "/api/analyze",
    response_model=AnalyzeResponse,
    responses={422: {"model": ErrorResponse}, 429: {"model": ErrorResponse}, 502: {"model": ErrorResponse}, 503: {"model": ErrorResponse}, 504: {"model": ErrorResponse}},
)
async def analyze(body: AnalyzeRequest, request: Request):
    ip = request.client.host if request.client else "unknown"
    if rate_limited(ip):
        return error(429, "rate_limited", "Too many analyses in a minute. Please wait a moment.", True)
    svc: GeminiService = app.state.gemini
    try:
        # Submitted text is analysed in memory only; it is never logged or stored.
        return await svc.analyze(body.text)
    except GeminiError as e:
        log.warning("analysis failed: %s", e.code)
        return error(e.status, e.code, e.message, e.retryable)
