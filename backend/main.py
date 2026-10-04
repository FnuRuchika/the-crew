"""THE CREW: backend API.

Run (from backend/):  uvicorn main:app --reload --port 8000
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, File, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, ConfigDict

load_dotenv(Path(__file__).parent / ".env")

from models.analysis import MAX_INPUT_CHARS, AnalyzeRequest, AnalyzeResponse, ErrorResponse  # noqa: E402
from services.elevenlabs_service import MAX_TEXT_CHARS, ElevenLabsService, VoiceConfig, VoiceError, VoiceRole  # noqa: E402
from services.gemini_service import GeminiConfig, GeminiError, GeminiService  # noqa: E402
from db.database import Database  # noqa: E402
from routes.ledger import router as ledger_router  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
log = logging.getLogger("the_crew")

ORIGINS = [
    o.strip()
    for o in (os.getenv("FRONTEND_ORIGINS") or "http://localhost:5173,http://127.0.0.1:5173").split(",")
    if o.strip()
]

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Connect to Tiger Data in the background: the API (and every safety feature) is
    # available immediately, whether or not the ledger comes online.
    task = asyncio.create_task(app.state.db.start())
    yield
    task.cancel()
    await app.state.db.close()


app = FastAPI(title="THE CREW API", version="0.3.0", docs_url="/api/docs", openapi_url="/api/openapi.json", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ORIGINS,
    allow_methods=["GET", "POST", "PATCH"],
    allow_headers=["Content-Type"],
    expose_headers=["X-Voice-Cache"],
)

app.state.gemini = GeminiService(GeminiConfig.from_env())
app.state.voice = ElevenLabsService(VoiceConfig.from_env())
app.state.db = Database.from_env()
app.include_router(ledger_router)


def error(status: int, code: str, message: str, retryable: bool) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content=ErrorResponse(error={"code": code, "message": message, "retryable": retryable}).model_dump(),
    )


# Tiny in-memory rate limit per client IP: protects the demo key from accidental floods.
RATE_LIMIT = int(os.getenv("RATE_LIMIT_PER_MINUTE") or 12)
VOICE_RATE_LIMIT = int(os.getenv("VOICE_RATE_LIMIT_PER_MINUTE") or 30)  # uncached generations only
_hits: dict[str, deque[float]] = defaultdict(deque)
_voice_hits: dict[str, deque[float]] = defaultdict(deque)
STT_RATE_LIMIT = int(os.getenv("STT_RATE_LIMIT_PER_MINUTE") or 20)
_stt_hits: dict[str, deque[float]] = defaultdict(deque)


def rate_limited(ip: str, bucket: dict[str, deque[float]] | None = None, limit: int | None = None) -> bool:
    bucket = _hits if bucket is None else bucket
    limit = RATE_LIMIT if limit is None else limit
    now = time.monotonic()
    q = bucket[ip]
    while q and now - q[0] > 60:
        q.popleft()
    if len(q) >= limit:
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


# ─────────── Voice (ElevenLabs) ───────────


class SpeakRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: VoiceRole
    text: str


@app.get("/api/voice/status")
async def voice_status() -> dict:
    svc: ElevenLabsService = app.state.voice
    return {"configured": svc.configured, "model": svc.config.model, "max_text_chars": MAX_TEXT_CHARS}


@app.post("/api/voice/speak", responses={200: {"content": {"audio/mpeg": {}}}, 422: {"model": ErrorResponse}, 503: {"model": ErrorResponse}})
async def voice_speak(body: SpeakRequest, request: Request):
    svc: ElevenLabsService = app.state.voice
    ip = request.client.host if request.client else "unknown"
    try:
        # Cached clips are free; only fresh generations count toward the rate limit.
        if not svc.cached(body.role, body.text) and rate_limited(ip, _voice_hits, VOICE_RATE_LIMIT):
            return error(429, "rate_limited", "Too many new voice clips in a minute. Please wait a moment.", True)
        result = await svc.speak(body.role, body.text)
    except VoiceError as e:
        log.warning("voice failed: %s", e.code)
        return error(e.status, e.code, e.message, e.retryable)
    return Response(
        content=result.audio,
        media_type="audio/mpeg",
        headers={"X-Voice-Cache": "hit" if result.cache_hit else "miss", "Cache-Control": "private, max-age=86400"},
    )


# ─────────── Live Call: speech-to-text ───────────

MAX_AUDIO_BYTES = 10 * 1024 * 1024  # ~30s of browser audio is well under 1 MB
MIN_AUDIO_BYTES = 1024
ALLOWED_AUDIO = {
    "audio/webm": "audio/webm",
    "audio/ogg": "audio/ogg",
    "audio/mp4": "audio/mp4",
    "audio/x-m4a": "audio/mp4",
    "audio/m4a": "audio/mp4",
    "audio/mpeg": "audio/mpeg",
    "audio/mp3": "audio/mpeg",
    "audio/wav": "audio/wav",
    "audio/x-wav": "audio/wav",
    "audio/wave": "audio/wav",
    "audio/aac": "audio/aac",
}


def sniff_audio(head: bytes) -> str | None:
    """Check the bytes really are audio (the declared MIME type alone is easy to fake)."""
    if head.startswith(b"\x1a\x45\xdf\xa3"):
        return "audio/webm"
    if head.startswith(b"OggS"):
        return "audio/ogg"
    if head[4:8] == b"ftyp":
        return "audio/mp4"
    if head.startswith(b"RIFF") and head[8:12] == b"WAVE":
        return "audio/wav"
    if head.startswith(b"ID3") or (len(head) > 1 and head[0] == 0xFF and (head[1] & 0xE0) == 0xE0):
        return "audio/mpeg"  # MPEG frame sync also covers ADTS AAC
    return None


@app.post("/api/transcribe", responses={422: {"model": ErrorResponse}, 413: {"model": ErrorResponse}, 503: {"model": ErrorResponse}})
async def transcribe(request: Request, file: UploadFile = File(...)):
    """Accepts one recorded segment, returns its transcript. Audio stays in memory and is discarded."""
    ip = request.client.host if request.client else "unknown"
    declared = (file.content_type or "").split(";")[0].strip().lower()
    mime = ALLOWED_AUDIO.get(declared)
    if not mime:
        return error(415, "unsupported_audio", "Please send a webm, ogg, mp4/m4a, mp3, wav or aac audio recording.", False)
    audio = await file.read(MAX_AUDIO_BYTES + 1)
    await file.close()
    if len(audio) > MAX_AUDIO_BYTES:
        return error(413, "audio_too_large", "Recording is too large. Keep segments under about 30 seconds.", False)
    if len(audio) < MIN_AUDIO_BYTES:
        return error(422, "audio_too_short", "Recording is too short. Speak for at least a second.", False)
    sniffed = sniff_audio(audio[:16])
    if sniffed is None or (sniffed != mime and not (mime == "audio/aac" and sniffed == "audio/mpeg")):
        return error(415, "unsupported_audio", "That file doesn't look like the audio type it claims to be.", False)
    if rate_limited(ip, _stt_hits, STT_RATE_LIMIT):
        return error(429, "rate_limited", "Too many recordings in a minute. Please wait a moment.", True)
    svc: ElevenLabsService = app.state.voice
    try:
        result = await svc.transcribe(audio, mime)
    except VoiceError as e:
        log.warning("transcription failed: %s", e.code)
        return error(e.status, e.code, e.message, e.retryable)
    finally:
        del audio  # nothing is written to disk; drop our reference immediately
    return {"source": "elevenlabs", "text": result.text, "language_code": result.language_code, "model": result.model, "latency_ms": result.latency_ms}
