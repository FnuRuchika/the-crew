"""Voice API tests with a mocked ElevenLabs transport (no network, no key, temp cache)."""

from __future__ import annotations

import json
import logging

import httpx
import pytest
from fastapi.testclient import TestClient

import main
from services.elevenlabs_service import VOICE_PROFILES, ElevenLabsService, VoiceConfig, VoiceRole

FAKE_KEY = "el-test-key-should-never-appear-anywhere"
LINE = "Mrs. Parker? Your grandson Daniel has been arrested."
MP3 = b"ID3\x03fake-mp3-bytes"

client = TestClient(main.app)


@pytest.fixture(autouse=True)
def _reset():
    main._voice_hits.clear()
    yield


def use_voice(tmp_path, handler, key: str | None = FAKE_KEY, fallbacks=("backup_model",)) -> list[httpx.Request]:
    seen: list[httpx.Request] = []

    def wrapped(req: httpx.Request) -> httpx.Response:
        seen.append(req)
        return handler(req)

    main.app.state.voice = ElevenLabsService(
        VoiceConfig(api_key=key, model="primary_model", fallback_models=fallbacks, timeout_seconds=5, cache_dir=tmp_path),
        transport=httpx.MockTransport(wrapped),
    )
    return seen


def audio(_req=None) -> httpx.Response:
    return httpx.Response(200, content=MP3, headers={"content-type": "audio/mpeg"})


def test_generates_then_serves_from_cache(tmp_path, caplog):
    caplog.set_level(logging.DEBUG)
    seen = use_voice(tmp_path, audio)
    r1 = client.post("/api/voice/speak", json={"role": "caller", "text": LINE})
    assert r1.status_code == 200 and r1.content == MP3
    assert r1.headers["content-type"] == "audio/mpeg" and r1.headers["x-voice-cache"] == "miss"
    r2 = client.post("/api/voice/speak", json={"role": "caller", "text": "  " + LINE + " "})  # whitespace-normalised
    assert r2.status_code == 200 and r2.content == MP3 and r2.headers["x-voice-cache"] == "hit"
    assert len(seen) == 1  # second request never reached ElevenLabs
    assert len(list(tmp_path.glob("*.mp3"))) == 1

    req = seen[0]
    assert req.headers["xi-api-key"] == FAKE_KEY and FAKE_KEY not in str(req.url)
    assert VOICE_PROFILES[VoiceRole.caller].voice_id in req.url.path
    body = json.loads(req.content)
    assert body["text"] == LINE and body["model_id"] == "primary_model"
    assert FAKE_KEY not in caplog.text and FAKE_KEY.encode() not in r1.content
    assert FAKE_KEY not in json.dumps(dict(r1.headers))


def test_roles_use_distinct_voices_and_separate_cache(tmp_path):
    seen = use_voice(tmp_path, audio)
    for role in ("caller", "guardian", "family_female", "family_male"):
        assert client.post("/api/voice/speak", json={"role": role, "text": "Same words."}).status_code == 200
    assert len({r.url.path for r in seen}) == 4
    assert len(list(tmp_path.glob("*.mp3"))) == 4


def test_fallback_model_on_upstream_outage(tmp_path):
    def handler(req):
        return httpx.Response(503, json={}) if json.loads(req.content)["model_id"] == "primary_model" else audio()

    seen = use_voice(tmp_path, handler)
    r = client.post("/api/voice/speak", json={"role": "guardian", "text": LINE})
    assert r.status_code == 200 and [json.loads(x.content)["model_id"] for x in seen] == ["primary_model", "backup_model"]


@pytest.mark.parametrize(
    "reply,code,status",
    [
        (httpx.Response(401, json={"detail": {"status": "quota_exceeded"}}), "quota_exceeded", 502),
        (httpx.Response(401, json={"detail": {"status": "invalid_api_key"}}), "auth_failed", 502),
        (httpx.Response(402, json={"detail": {"status": "payment_required"}}), "voice_unavailable_on_plan", 502),
        (httpx.Response(404, json={"detail": {"status": "voice_not_found"}}), "voice_unavailable_on_plan", 502),
        (httpx.Response(429, json={}), "rate_limited", 429),
        (httpx.Response(200, content=b"", headers={"content-type": "application/json"}), "upstream_error", 502),
    ],
)
def test_upstream_errors_are_clean_and_not_cached(tmp_path, reply, code, status):
    use_voice(tmp_path, lambda _: reply, fallbacks=())
    r = client.post("/api/voice/speak", json={"role": "caller", "text": LINE})
    assert r.status_code == status and r.json()["error"]["code"] == code
    assert list(tmp_path.glob("*.mp3")) == []


def test_timeout(tmp_path):
    def boom(req):
        raise httpx.ReadTimeout("slow", request=req)

    use_voice(tmp_path, boom, fallbacks=())
    r = client.post("/api/voice/speak", json={"role": "caller", "text": LINE})
    assert r.status_code == 504 and r.json()["error"]["code"] == "timeout"


def test_missing_key_503_but_cached_audio_still_served(tmp_path):
    use_voice(tmp_path, audio)
    assert client.post("/api/voice/speak", json={"role": "caller", "text": LINE}).status_code == 200
    seen = use_voice(tmp_path, audio, key=None)  # same cache dir, no key
    assert client.post("/api/voice/speak", json={"role": "caller", "text": LINE}).status_code == 200
    r = client.post("/api/voice/speak", json={"role": "caller", "text": "A line that was never cached."})
    assert r.status_code == 503 and r.json()["error"]["code"] == "not_configured"
    assert seen == [] and client.get("/api/voice/status").json()["configured"] is False


@pytest.mark.parametrize(
    "payload",
    [{"role": "narrator", "text": "hi"}, {"role": "caller", "text": "   "}, {"role": "caller", "text": "x" * 401}, {"role": "caller"}, {"role": "caller", "text": "hi", "voice_id": "abc"}],
)
def test_input_validation(tmp_path, payload):
    seen = use_voice(tmp_path, audio)
    r = client.post("/api/voice/speak", json=payload)
    assert r.status_code == 422 and r.json()["error"]["code"] == "invalid_input"
    assert seen == []


def test_rate_limit_counts_only_new_generations(tmp_path):
    use_voice(tmp_path, audio)
    for i in range(main.VOICE_RATE_LIMIT):
        assert client.post("/api/voice/speak", json={"role": "caller", "text": f"Line {i}"}).status_code == 200
    assert client.post("/api/voice/speak", json={"role": "caller", "text": "One too many"}).status_code == 429
    assert client.post("/api/voice/speak", json={"role": "caller", "text": "Line 0"}).status_code == 200  # cached: free
