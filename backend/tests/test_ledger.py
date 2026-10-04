"""Evidence Ledger tests.

Part 1 needs no network (validation, offline behaviour, circuit breaker).
Part 2 runs against the REAL Tiger Data service in DATABASE_URL (skipped if unset) and
deletes every row it creates.
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
import uuid
from datetime import datetime, timedelta, timezone

import asyncpg
import pytest
from fastapi.testclient import TestClient

import main
from db.database import Database
from db.ledger_repository import evidence_key, same_evidence

NOW = lambda: datetime.now(timezone.utc)  # noqa: E731
iso = lambda d: d.isoformat()  # noqa: E731


@pytest.fixture
def offline_db():
    original = main.app.state.db
    main.app.state.db = Database(None)
    yield
    main.app.state.db = original


# ─────────── Part 1: no network ───────────


def test_evidence_key_normalises_case_punctuation_and_quotes():
    assert evidence_key("Don’t hang up!", "x") == evidence_key("  don't   HANG up ", "x") == "don't hang up"
    assert evidence_key("Transfer $900 immediately.", "x") == "transfer $900 immediately"
    assert evidence_key(None, "New recipient") == "new recipient"


def test_same_evidence_matches_paraphrased_quotes_only():
    k = lambda x: evidence_key(x, "x")  # noqa: E731
    assert same_evidence(k("this is the fraud department at your bank"), k("fraud department at your bank"))
    assert same_evidence(k("don't hang up and don't tell anyone"), k("Don't hang up, and don't tell anyone about this call."))
    assert not same_evidence(k("immediately"), k("Someone has compromised your account"))
    assert not same_evidence(k("Transfer $900"), k("Buy gift cards"))


def test_offline_ledger_answers_fast_with_clean_error(offline_db):
    client = TestClient(main.app)
    t = time.perf_counter()
    r = client.post("/api/operations", json={"mode": "live_call"})
    assert r.status_code == 503 and r.json()["error"]["code"] == "ledger_offline"
    assert (time.perf_counter() - t) < 0.5
    assert client.get("/api/ledger/status").json() == {"configured": False, "online": False, "engine": None, "timescaledb": None}
    op = uuid.uuid4()
    ev = {"events": [{"kind": "risk", "occurred_at": iso(NOW()), "seq": 1, "score": 40, "level": "elevated"}]}
    assert client.post(f"/api/operations/{op}/events", json=ev).json()["error"]["code"] == "ledger_offline"
    assert client.get(f"/api/operations/{op}/ledger").status_code == 503


def test_breaker_fails_fast_and_never_logs_connection_details(caplog):
    caplog.set_level(logging.DEBUG)
    secret_url = "postgresql://crew_user:sup3r-secret-pw@127.0.0.1:1/crew_db"
    db = Database(secret_url, connect_timeout=1, cooldown_seconds=30)
    assert asyncio.run(db.start()) is False and db.online is False
    t = time.perf_counter()
    assert asyncio.run(db.start()) is False  # breaker open: no network attempt
    assert (time.perf_counter() - t) < 0.05
    for leak in ("sup3r-secret-pw", "crew_user", "crew_db", secret_url):
        assert leak not in caplog.text


@pytest.mark.parametrize(
    "event",
    [
        {"kind": "explode", "occurred_at": "2026-01-01T00:00:00Z", "seq": 1},
        {"kind": "risk", "occurred_at": iso(NOW()), "seq": 1, "score": 140, "level": "critical"},
        {"kind": "risk", "occurred_at": iso(NOW()), "seq": 1, "score": 40, "level": "spicy"},
        {"kind": "risk", "occurred_at": "2026-10-03T12:00:00", "seq": 1, "score": 40, "level": "low"},  # naive time
        {"kind": "risk", "occurred_at": iso(NOW() + timedelta(days=3)), "seq": 1, "score": 40, "level": "low"},
        {"kind": "signal", "occurred_at": iso(NOW()), "seq": 1, "signal_type": "urgency", "label": "U", "evidence": "x" * 301, "detected_by": "grifter", "source": "gemini"},
        {"kind": "signal", "occurred_at": iso(NOW()), "seq": 1, "signal_type": "DROP TABLE", "label": "U", "detected_by": "grifter", "source": "gemini"},
        {"kind": "agent", "occurred_at": iso(NOW()), "seq": 1, "agent": "hacker", "action": "active"},
        {"kind": "milestone", "occurred_at": iso(NOW()), "seq": 1, "milestone": "operation_started", "title": "x", "transcript": "full call"},
    ],
)
def test_event_validation(offline_db, event):
    r = TestClient(main.app).post(f"/api/operations/{uuid.uuid4()}/events", json={"events": [event]})
    assert r.status_code == 422 and r.json()["error"]["code"] == "invalid_input"


def test_other_validation(offline_db):
    c = TestClient(main.app)
    assert c.post("/api/operations", json={"mode": "phone"}).status_code == 422
    assert c.post("/api/operations", json={"mode": "typed", "scenario": "<script>"}).status_code == 422
    assert c.get("/api/operations/not-a-uuid/ledger").status_code == 422
    assert c.post(f"/api/operations/{uuid.uuid4()}/events", json={"events": []}).status_code == 422
    assert c.patch(f"/api/operations/{uuid.uuid4()}/complete", json={"final_status": "won", "peak_risk": 5}).status_code == 422


# ─────────── Part 2: REAL Tiger Data ───────────

REAL = bool((os.getenv("DATABASE_URL") or "").strip())


@pytest.fixture(scope="module")
def real_client():
    if not REAL:
        pytest.skip("DATABASE_URL not set")
    created: list[str] = []
    with TestClient(main.app) as client:  # runs lifespan → connects + migrates
        for _ in range(60):
            if client.get("/api/ledger/status").json()["online"]:
                break
            time.sleep(0.25)
        assert client.get("/api/ledger/status").json()["online"], "Tiger Data did not come online"
        client.created = created  # type: ignore[attr-defined]
        yield client

    async def cleanup():
        conn = await asyncpg.connect(os.environ["DATABASE_URL"], statement_cache_size=0)
        try:
            await conn.execute("DELETE FROM crew.operations WHERE id = ANY($1::uuid[])", created)
        finally:
            await conn.close()

    if created:
        asyncio.run(cleanup())


def _op(client, mode="live_call") -> str:
    r = client.post("/api/operations", json={"mode": mode, "scenario": "pytest"})
    assert r.status_code == 201, r.text
    client.created.append(r.json()["id"])
    return r.json()["id"]


def test_real_full_operation_lifecycle_and_chronological_ledger(real_client):
    c = real_client
    op = _op(c)
    t = NOW() - timedelta(seconds=30)
    at = lambda s: iso(t + timedelta(seconds=s))  # noqa: E731
    batch1 = [
        {"kind": "milestone", "milestone": "segment_analyzed", "occurred_at": at(1), "seq": 1, "title": "Segment 1 analyzed"},
        {"kind": "signal", "occurred_at": at(2), "seq": 2, "signal_type": "authority_impersonation", "label": "Authority impersonation", "confidence": 0.9,
         "evidence": "I'm calling from your bank", "explanation": "Claims to be the bank.", "detected_by": "grifter", "source": "gemini"},
        {"kind": "agent", "occurred_at": at(3), "seq": 3, "agent": "grifter", "action": "active", "reason": "Manipulation language detected"},
        {"kind": "risk", "occurred_at": at(4), "seq": 4, "score": 27, "level": "low"},
    ]
    r1 = c.post(f"/api/operations/{op}/events", json={"events": batch1}).json()
    assert r1["signals_new"] == 1 and r1["signals_duplicate"] == 0

    # Re-analysis of the whole conversation re-reports the same evidence (different case/punctuation).
    batch2 = [
        {"kind": "signal", "occurred_at": at(10), "seq": 5, "signal_type": "authority_impersonation", "label": "Authority impersonation", "confidence": 0.95,
         "evidence": "i'm calling from your BANK.", "explanation": "Claims to be the bank.", "detected_by": "grifter", "source": "gemini"},
        {"kind": "signal", "occurred_at": at(11), "seq": 6, "signal_type": "unusual_payment_request", "label": "Unusual payment request", "confidence": 0.95,
         "evidence": "Transfer nine hundred dollars", "explanation": "Asks to move money.", "detected_by": "lookout", "source": "gemini"},
        {"kind": "agent", "occurred_at": at(12), "seq": 7, "agent": "lookout", "action": "active", "reason": "Payment request identified"},
        {"kind": "risk", "occurred_at": at(13), "seq": 8, "score": 87, "level": "critical"},
        {"kind": "intervention", "occurred_at": at(14), "seq": 9, "trigger_score": 87, "reasons": ["Authority impersonation", "Unusual payment request"]},
    ]
    r2 = c.post(f"/api/operations/{op}/events", json={"events": batch2}).json()
    assert r2["signals_new"] == 1 and r2["signals_duplicate"] == 1

    # A network retry of the same batch inserts nothing new.
    r3 = c.post(f"/api/operations/{op}/events", json={"events": batch2}).json()
    assert r3["signals_new"] == 0 and r3["inserted"] == 0

    # Gemini paraphrases the same quote on a later pass → same signal, not a new row.
    para = [{"kind": "signal", "occurred_at": at(15), "seq": 13, "signal_type": "unusual_payment_request", "label": "Unusual payment request",
             "confidence": 0.9, "evidence": "transfer nine hundred dollars to our secure account", "detected_by": "lookout", "source": "gemini"}]
    r4 = c.post(f"/api/operations/{op}/events", json={"events": para}).json()
    assert r4["signals_new"] == 0 and r4["signals_duplicate"] == 1

    batch3 = [
        {"kind": "action", "occurred_at": at(20), "seq": 14, "action_selected": "exit", "title": "Chose: end the call"},
        {"kind": "agent", "occurred_at": at(21), "seq": 15, "agent": "getaway", "action": "active", "reason": "Safe exit"},
        {"kind": "outcome", "occurred_at": at(22), "seq": 16, "outcome": "Call ended safely. No money sent.", "agent": "getaway"},
    ]
    c.post(f"/api/operations/{op}/events", json={"events": batch3})
    assert c.patch(f"/api/operations/{op}/complete", json={"final_status": "safe_exit", "peak_risk": 87, "outcome": "Call ended safely. No money sent."}).json() == {"ok": True}

    L = c.get(f"/api/operations/{op}/ledger").json()
    assert L["source"] == "tiger_data" and L["operation"]["status"] == "safe_exit" and L["operation"]["peak_risk"] == 87
    kinds = [e["kind"] for e in L["entries"]]
    assert kinds == ["operation_started", "segment_analyzed", "signal", "agent", "risk", "signal", "agent", "risk", "intervention",
                     "action_selected", "agent", "outcome", "operation_closed"]
    times = [e["at"] for e in L["entries"][1:-1]]
    assert times == sorted(times), "ledger must be chronological"
    sig = [e for e in L["entries"] if e["kind"] == "signal"]
    assert len(sig) == 2 and sig[0]["times_seen"] == 2 and sig[0]["confidence"] == pytest.approx(0.95) and sig[1]["times_seen"] == 2
    assert sig[0]["evidence"] == "I'm calling from your bank"  # first wording kept
    assert [e["title"] for e in L["entries"] if e["kind"] == "risk"] == ["Risk increased to 27: LOW", "Risk increased to 87: CRITICAL"]
    s = L["summary"]
    assert s["signals_detected"] == 2 and s["repeat_observations"] == 2 and s["crew_deployed"] == ["grifter", "lookout", "getaway"]
    assert s["intervention"]["trigger_score"] == 87 and s["intervention"]["action_selected"] == "exit" and s["intervention"]["outcome"].startswith("Call ended")
    esc = L["escalation"]
    assert esc["seconds_to_critical"] == pytest.approx(11, abs=0.01) and [p["score"] for p in esc["trajectory"]] == [27, 87]


def test_real_unknown_operation_404(real_client):
    assert real_client.get(f"/api/operations/{uuid.uuid4()}/ledger").json()["error"]["code"] == "operation_not_found"


def test_real_case_file_amount_protected(real_client):
    op = _op(real_client, "case_file")
    real_client.patch(f"/api/operations/{op}/complete", json={"final_status": "protected", "peak_risk": 94, "amount_protected": "2500.00", "threat_type": "Grandparent / bail scam", "outcome": "Payment prevented"})
    L = real_client.get(f"/api/operations/{op}/ledger").json()
    assert L["summary"]["amount_protected"] == 2500.0 and L["operation"]["mode"] == "case_file"


def test_real_hypertables_and_columnstore_policies(real_client):
    async def q():
        conn = await asyncpg.connect(os.environ["DATABASE_URL"], statement_cache_size=0)
        try:
            ht = {r["hypertable_name"] for r in await conn.fetch("SELECT hypertable_name FROM timescaledb_information.hypertables WHERE hypertable_schema='crew'")}
            jobs = {r["hypertable_name"] for r in await conn.fetch("SELECT hypertable_name FROM timescaledb_information.jobs WHERE hypertable_schema='crew' AND proc_name ILIKE '%columnstore%' OR (hypertable_schema='crew' AND proc_name ILIKE '%compress%')")}
            return ht, jobs
        finally:
            await conn.close()

    ht, jobs = asyncio.run(q())
    assert ht == {"risk_events", "agent_events", "milestones"} and jobs == ht
