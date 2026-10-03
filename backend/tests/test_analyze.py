"""API tests with a mocked Gemini transport (no network, no key needed)."""

from __future__ import annotations

import json
import logging

import httpx
import pytest
from fastapi.testclient import TestClient

import main
from services.gemini_service import GeminiConfig, GeminiService, locate_evidence

BANK = "I'm calling from your bank. Don't hang up. Someone compromised your account. Transfer $900 immediately."
FAKE_KEY = "test-key-should-never-appear-in-logs"


def gemini_reply(obj: object, status: int = 200, finish: str = "STOP") -> httpx.Response:
    text = obj if isinstance(obj, str) else json.dumps(obj)
    return httpx.Response(status, json={"candidates": [{"content": {"parts": [{"text": text}]}, "finishReason": finish}]})


def use_gemini(handler, key: str | None = FAKE_KEY) -> list[httpx.Request]:
    seen: list[httpx.Request] = []

    def wrapped(req: httpx.Request) -> httpx.Response:
        seen.append(req)
        return handler(req)

    main.app.state.gemini = GeminiService(
        GeminiConfig(api_key=key, model="gemini-test", timeout_seconds=5), transport=httpx.MockTransport(wrapped)
    )
    return seen


@pytest.fixture(autouse=True)
def _reset():
    main._hits.clear()
    yield


client = TestClient(main.app)

GOOD = {
    "is_suspicious": True,
    "signals": [
        {"type": "artificial_urgency", "label": "Artificial urgency", "confidence": 0.94, "evidence": "Transfer $900 immediately", "explanation": "Time pressure."},
        {"type": "isolation_secrecy", "label": "Isolation & secrecy", "confidence": 0.9, "evidence": "Don’t hang up", "explanation": "Discourages verification."},
        {"type": "authority_impersonation", "label": "Authority", "confidence": 1.7, "evidence": "calling from your bank", "explanation": "Claims to be the bank."},
        {"type": "made_up_type", "label": "Odd", "confidence": 0.4, "evidence": "this phrase is not in the text", "explanation": "x"},
        {"type": "artificial_urgency", "label": "Artificial urgency", "confidence": 0.94, "evidence": "Transfer $900 immediately", "explanation": "dup"},
    ],
    "claimed_identity": "bank representative",
    "requested_action": "None",
    "summary": "Shows patterns commonly associated with social-engineering scams.",
}


def test_success_validates_grounds_and_normalises(caplog):
    caplog.set_level(logging.DEBUG)
    seen = use_gemini(lambda _: gemini_reply(GOOD))
    r = client.post("/api/analyze", json={"text": BANK})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["source"] == "gemini" and body["model"] == "gemini-test"
    sigs = body["analysis"]["signals"]
    assert len(sigs) == 4  # exact duplicate removed
    urgency, isolation, authority, other = sigs
    assert urgency["evidence_verbatim"] and BANK[urgency["evidence_start"]:urgency["evidence_end"]] == "Transfer $900 immediately"
    assert isolation["evidence_verbatim"]  # curly apostrophe still grounded
    assert BANK[isolation["evidence_start"]:isolation["evidence_end"]] == "Don't hang up"
    assert authority["confidence"] == 1.0  # clamped
    assert other["type"] == "other_manipulation" and other["evidence_verbatim"] is False
    assert body["analysis"]["requested_action"] is None
    # Key travels in a header, never in the URL, and is never logged.
    assert seen[0].headers["x-goog-api-key"] == FAKE_KEY
    assert FAKE_KEY not in str(seen[0].url)
    assert FAKE_KEY not in caplog.text
    assert BANK not in caplog.text  # submitted text is not logged
    sent = json.loads(seen[0].content)
    assert sent["generationConfig"]["responseMimeType"] == "application/json"
    assert sent["generationConfig"]["temperature"] == 0


def test_benign_message_empty_signals():
    use_gemini(lambda _: gemini_reply({"is_suspicious": False, "signals": [], "summary": "Routine family message."}))
    r = client.post("/api/analyze", json={"text": "Hi Mom, dinner is at 7 tonight. Can you bring dessert?"})
    assert r.status_code == 200 and r.json()["analysis"]["signals"] == []


@pytest.mark.parametrize(
    "reply,code",
    [
        (gemini_reply("{not json"), "malformed_response"),
        (gemini_reply({"signals": "nope"}), "malformed_response"),
        (httpx.Response(200, json={"candidates": []}), "malformed_response"),
        (gemini_reply({}, finish="SAFETY"), "blocked"),
        (httpx.Response(429, json={}), "rate_limited"),
        (httpx.Response(403, json={}), "auth_failed"),
        (httpx.Response(404, json={}), "model_unavailable"),
        (httpx.Response(500, json={}), "upstream_error"),
    ],
)
def test_upstream_failures_map_to_clean_errors(reply, code):
    use_gemini(lambda _: reply)
    r = client.post("/api/analyze", json={"text": BANK})
    assert r.status_code >= 400
    err = r.json()["error"]
    assert err["code"] == code and err["message"] and isinstance(err["retryable"], bool)


def test_timeout():
    def boom(req):
        raise httpx.ReadTimeout("slow", request=req)

    use_gemini(boom)
    r = client.post("/api/analyze", json={"text": BANK})
    assert r.status_code == 504 and r.json()["error"] == {"code": "timeout", "message": "Gemini took too long to respond.", "retryable": True}


def test_missing_key_is_503_and_never_calls_gemini():
    seen = use_gemini(lambda _: gemini_reply(GOOD), key=None)
    r = client.post("/api/analyze", json={"text": BANK})
    assert r.status_code == 503 and r.json()["error"]["code"] == "not_configured"
    assert seen == []
    assert client.get("/api/health").json()["gemini_configured"] is False


@pytest.mark.parametrize("payload", [{"text": ""}, {"text": "  \n "}, {"text": "x" * 2001}, {}, {"text": "hello", "extra": 1}])
def test_input_validation(payload):
    seen = use_gemini(lambda _: gemini_reply(GOOD))
    r = client.post("/api/analyze", json=payload)
    assert r.status_code == 422 and r.json()["error"]["code"] == "invalid_input"
    assert seen == []


def test_rate_limit_per_ip():
    use_gemini(lambda _: gemini_reply(GOOD))
    codes = [client.post("/api/analyze", json={"text": BANK}).status_code for _ in range(main.RATE_LIMIT + 1)]
    assert codes[-1] == 429 and all(c == 200 for c in codes[:-1])


def test_cors_only_allows_frontend_origin():
    ok = client.options("/api/analyze", headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "POST"})
    bad = client.options("/api/analyze", headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "POST"})
    assert ok.headers.get("access-control-allow-origin") == "http://localhost:5173"
    assert "access-control-allow-origin" not in bad.headers


def test_locate_evidence_tolerates_whitespace_and_case():
    text = "Buy $2,000 in gift cards   and READ me the numbers."
    s, e = locate_evidence(text, "read me the numbers")
    assert text[s:e] == "READ me the numbers"
    s, e = locate_evidence(text, "gift cards and read")
    assert text[s:e] == "gift cards   and READ"
    assert locate_evidence(text, "wire transfer") is None
