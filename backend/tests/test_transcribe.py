"""Live Call speech-to-text tests with a mocked ElevenLabs transport (no network, no key)."""

from __future__ import annotations

import logging

import httpx
import pytest
from fastapi.testclient import TestClient

import main
from services.elevenlabs_service import ElevenLabsService, VoiceConfig

FAKE_KEY = "el-stt-test-key-never-logged"
WEBM = b"\x1a\x45\xdf\xa3" + b"\x00" * 4000
WAV = b"RIFF\x00\x00\x00\x00WAVEfmt " + b"\x00" * 4000
TRANSCRIPT = "I'm calling from your bank. Don't hang up."

client = TestClient(main.app)


@pytest.fixture(autouse=True)
def _reset():
    main._stt_hits.clear()
    yield


def use_stt(tmp_path, handler, key: str | None = FAKE_KEY) -> list[httpx.Request]:
    seen: list[httpx.Request] = []

    def wrapped(req: httpx.Request) -> httpx.Response:
        seen.append(req)
        return handler(req)

    main.app.state.voice = ElevenLabsService(
        VoiceConfig(api_key=key, timeout_seconds=5, cache_dir=tmp_path / "cache"), transport=httpx.MockTransport(wrapped)
    )
    return seen


def ok(_req=None) -> httpx.Response:
    return httpx.Response(200, json={"text": f"  {TRANSCRIPT}  ", "language_code": "eng", "language_probability": 0.97})


def post(data: bytes = WEBM, mime: str = "audio/webm;codecs=opus"):
    return client.post("/api/transcribe", files={"file": ("rec.webm", data, mime)})


def test_transcribes_in_memory_without_logging_or_storing(tmp_path, caplog, monkeypatch):
    caplog.set_level(logging.DEBUG)
    monkeypatch.chdir(tmp_path)
    seen = use_stt(tmp_path, ok)
    r = post()
    assert r.status_code == 200, r.text
    assert r.json() == {"source": "elevenlabs", "text": TRANSCRIPT, "language_code": "eng", "model": "scribe_v2", "latency_ms": r.json()["latency_ms"]}
    req = seen[0]
    assert req.url.path == "/v1/speech-to-text" and req.headers["xi-api-key"] == FAKE_KEY and FAKE_KEY not in str(req.url)
    body = req.content
    assert b'name="model_id"' in body and b"scribe_v2" in body and WEBM[:4] in body
    assert FAKE_KEY not in caplog.text and TRANSCRIPT not in caplog.text  # neither key nor transcript is logged
    assert list(tmp_path.rglob("*")) == []  # nothing written to disk (cwd or cache dir)


def test_wav_accepted():
    assert post(WAV, "audio/wav").status_code in (200, 503)  # passes validation


@pytest.mark.parametrize(
    "data,mime,status,code",
    [
        (WEBM, "text/plain", 415, "unsupported_audio"),
        (WEBM, "video/webm", 415, "unsupported_audio"),
        (b"not really audio at all" * 100, "audio/webm", 415, "unsupported_audio"),  # spoofed MIME
        (WAV, "audio/webm", 415, "unsupported_audio"),  # mismatched container
        (WEBM[:500], "audio/webm", 422, "audio_too_short"),
        (b"\x1a\x45\xdf\xa3" + b"\x00" * (main.MAX_AUDIO_BYTES + 10), "audio/webm", 413, "audio_too_large"),
    ],
)
def test_input_validation_never_calls_elevenlabs(tmp_path, data, mime, status, code):
    seen = use_stt(tmp_path, ok)
    r = post(data, mime)
    assert r.status_code == status and r.json()["error"]["code"] == code
    assert seen == []


def test_missing_file_field(tmp_path):
    use_stt(tmp_path, ok)
    r = client.post("/api/transcribe", data={"x": "1"})
    assert r.status_code == 422 and r.json()["error"]["code"] == "invalid_input"


@pytest.mark.parametrize(
    "reply,code,status",
    [
        (httpx.Response(200, json={"text": "   "}), "no_speech", 422),
        (httpx.Response(200, content=b"<html>", headers={"content-type": "text/html"}), "malformed_response", 502),
        (httpx.Response(401, json={"detail": {"status": "invalid_api_key"}}), "auth_failed", 502),
        (httpx.Response(401, json={"detail": {"status": "quota_exceeded"}}), "quota_exceeded", 502),
        (httpx.Response(429, json={}), "rate_limited", 429),
        (httpx.Response(422, json={"detail": [{"msg": "bad"}]}), "unsupported_audio", 422),
    ],
)
def test_upstream_errors_never_fake_a_transcript(tmp_path, reply, code, status):
    use_stt(tmp_path, lambda _: reply)
    r = post()
    assert r.status_code == status and r.json()["error"]["code"] == code and "text" not in r.json()


def test_falls_back_to_second_model_on_outage(tmp_path):
    seen = use_stt(tmp_path, lambda req: httpx.Response(503, json={}) if b"scribe_v2" in req.content else ok())
    r = post()
    assert r.status_code == 200 and r.json()["model"] == "scribe_v1" and len(seen) == 2


def test_timeout_and_missing_key(tmp_path):
    def boom(req):
        raise httpx.ReadTimeout("slow", request=req)

    use_stt(tmp_path, boom)
    assert post().json()["error"]["code"] == "timeout"
    seen = use_stt(tmp_path, ok, key=None)
    r = post()
    assert r.status_code == 503 and r.json()["error"]["code"] == "not_configured" and seen == []


def test_rate_limit(tmp_path):
    use_stt(tmp_path, ok)
    codes = [post().status_code for _ in range(main.STT_RATE_LIMIT + 1)]
    assert codes[-1] == 429 and all(c == 200 for c in codes[:-1])
