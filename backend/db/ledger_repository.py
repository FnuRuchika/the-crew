"""Evidence Ledger queries. Pure SQL over an asyncpg connection; no FastAPI, no services."""

from __future__ import annotations

import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import asyncpg

from models.ledger import (
    ActionEvent,
    AgentEvent,
    CompleteOperation,
    CreateOperation,
    InterventionEvent,
    MilestoneEvent,
    OutcomeEvent,
    RiskEvent,
    SignalEvent,
)

AGENT_NAMES = {
    "mastermind": "MASTERMIND", "grifter": "GRIFTER", "lookout": "LOOKOUT", "insideMan": "INSIDE MAN",
    "safecracker": "SAFECRACKER", "fixer": "FIXER", "getaway": "GETAWAY DRIVER",
}


class OperationNotFound(Exception):
    pass


def evidence_key(evidence: str | None, label: str) -> str:
    """Normalised dedupe key: same tactic + same words ⇒ same signal, regardless of case/punctuation."""
    text = (evidence or label).lower().replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')
    text = re.sub(r"[^a-z0-9$' ]+", " ", text)
    return " ".join(text.split())[:300] or "-"


def same_evidence(a: str, b: str) -> bool:
    """Semantically the same evidence: identical, one phrase contains the other, or ≥60% word overlap.

    Gemini re-analyses the whole conversation and may quote the same moment slightly
    differently ("this is the fraud department at your bank" vs "fraud department at your bank").
    """
    if a == b:
        return True
    if (f" {a} " in f" {b} ") or (f" {b} " in f" {a} "):
        return True
    wa, wb = set(a.split()), set(b.split())
    return bool(wa and wb) and len(wa & wb) / len(wa | wb) >= 0.6


async def create_operation(conn: asyncpg.Connection, body: CreateOperation) -> dict[str, Any]:
    row = await conn.fetchrow(
        "INSERT INTO crew.operations (mode, scenario, started_at) VALUES ($1, $2, COALESCE($3, now())) RETURNING id, started_at",
        body.mode, body.scenario, body.started_at,
    )
    return {"id": str(row["id"]), "started_at": row["started_at"].isoformat()}


async def _require_operation(conn: asyncpg.Connection, op_id: uuid.UUID, lock: bool = False) -> asyncpg.Record:
    # FOR UPDATE serialises concurrent appends to one operation, so evidence matching is race-free.
    row = await conn.fetchrow("SELECT * FROM crew.operations WHERE id = $1" + (" FOR UPDATE" if lock else ""), op_id)
    if row is None:
        raise OperationNotFound()
    return row


async def append_events(conn: asyncpg.Connection, op_id: uuid.UUID, events: list) -> dict[str, int]:
    """Persist a batch atomically. Retries are safe: every insert is idempotent."""
    counts = {"inserted": 0, "signals_new": 0, "signals_duplicate": 0}
    async with conn.transaction():
        await _require_operation(conn, op_id, lock=True)
        for e in events:
            if isinstance(e, SignalEvent):
                key = evidence_key(e.evidence, e.label)
                existing = await conn.fetch(
                    "SELECT id, evidence_key FROM crew.signals WHERE operation_id = $1 AND signal_type = $2 ORDER BY id", op_id, e.signal_type
                )
                match = next((r for r in existing if same_evidence(r["evidence_key"], key)), None)
                if match is not None:
                    # Same evidence observed again (re-analysis, paraphrase or retry): update, never duplicate.
                    await conn.execute(
                        """UPDATE crew.signals SET
                               confidence   = GREATEST(confidence, $2),
                               last_seen_at = GREATEST(last_seen_at, $3),
                               times_seen   = times_seen + ($4 > last_seq)::int,
                               last_seq     = GREATEST(last_seq, $4)
                           WHERE id = $1""",
                        match["id"], e.confidence, e.occurred_at, e.seq,
                    )
                    counts["signals_duplicate"] += 1
                    continue
                inserted = await conn.fetchval(
                    """
                    INSERT INTO crew.signals (operation_id, first_seen_at, last_seen_at, seq, last_seq, signal_type, evidence_key,
                                              label, confidence, severity, evidence, explanation, detected_by, source)
                    VALUES ($1, $2, $2, $3, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                    ON CONFLICT (operation_id, signal_type, evidence_key) DO UPDATE SET
                        confidence   = GREATEST(crew.signals.confidence, EXCLUDED.confidence),
                        last_seen_at = GREATEST(crew.signals.last_seen_at, EXCLUDED.last_seen_at),
                        times_seen   = crew.signals.times_seen + (EXCLUDED.seq > crew.signals.last_seq)::int,
                        last_seq     = GREATEST(crew.signals.last_seq, EXCLUDED.seq)
                    RETURNING (xmax = 0)
                    """,
                    op_id, e.occurred_at, e.seq, e.signal_type, key,
                    e.label, e.confidence, e.severity, e.evidence, e.explanation, e.detected_by, e.source,
                )
                counts["signals_new" if inserted else "signals_duplicate"] += 1
                counts["inserted"] += int(bool(inserted))
            elif isinstance(e, RiskEvent):
                r = await conn.execute(
                    "INSERT INTO crew.risk_events (operation_id, occurred_at, seq, score, level, reason) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING",
                    op_id, e.occurred_at, e.seq, e.score, e.level, e.reason,
                )
                counts["inserted"] += int(r.endswith(" 1"))
                await conn.execute("UPDATE crew.operations SET peak_risk = GREATEST(peak_risk, $2) WHERE id = $1", op_id, e.score)
            elif isinstance(e, AgentEvent):
                r = await conn.execute(
                    "INSERT INTO crew.agent_events (operation_id, occurred_at, seq, agent, action, reason) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING",
                    op_id, e.occurred_at, e.seq, e.agent, e.action, e.reason,
                )
                counts["inserted"] += int(r.endswith(" 1"))
            elif isinstance(e, InterventionEvent):
                r = await conn.execute(
                    "INSERT INTO crew.interventions (operation_id, occurred_at, seq, trigger_score, reasons) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
                    op_id, e.occurred_at, e.seq, e.trigger_score, e.reasons,
                )
                counts["inserted"] += int(r.endswith(" 1"))
            elif isinstance(e, ActionEvent):
                await conn.execute(
                    """UPDATE crew.interventions SET action_selected = $2, action_at = $3
                       WHERE id = (SELECT id FROM crew.interventions WHERE operation_id = $1 ORDER BY occurred_at DESC LIMIT 1)""",
                    op_id, e.action_selected, e.occurred_at,
                )
                counts["inserted"] += await _milestone(conn, op_id, e.occurred_at, e.seq, "action_selected", "fixer", e.title, None)
            elif isinstance(e, OutcomeEvent):
                await conn.execute(
                    """UPDATE crew.interventions SET outcome = $2, outcome_at = $3
                       WHERE id = (SELECT id FROM crew.interventions WHERE operation_id = $1 ORDER BY occurred_at DESC LIMIT 1)""",
                    op_id, e.outcome, e.occurred_at,
                )
                counts["inserted"] += await _milestone(conn, op_id, e.occurred_at, e.seq, "outcome", e.agent, e.outcome, None)
            elif isinstance(e, MilestoneEvent):
                counts["inserted"] += await _milestone(conn, op_id, e.occurred_at, e.seq, e.milestone, e.agent, e.title, e.detail)
    return counts


async def _milestone(conn, op_id, at, seq, kind, agent, title, detail) -> int:
    r = await conn.execute(
        "INSERT INTO crew.milestones (operation_id, occurred_at, seq, kind, agent, title, detail) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING",
        op_id, at, seq, kind, agent, title, detail,
    )
    return int(r.endswith(" 1"))


async def complete_operation(conn: asyncpg.Connection, op_id: uuid.UUID, body: CompleteOperation) -> None:
    async with conn.transaction():
        await _require_operation(conn, op_id)
        await conn.execute(
            """UPDATE crew.operations SET
                   ended_at = GREATEST(started_at, COALESCE($2, now())),
                   final_status = $3, peak_risk = GREATEST(peak_risk, $4),
                   amount_protected = $5, threat_type = $6, outcome = $7
               WHERE id = $1""",
            op_id, body.ended_at, body.final_status, body.peak_risk, body.amount_protected, body.threat_type, body.outcome,
        )


# Chronological reconstruction. The time-window predicate lets TimescaleDB exclude every
# hypertable chunk outside this operation's lifetime.
LEDGER_SQL = """
WITH op AS (
    SELECT id, started_at - interval '1 minute' AS t0, COALESCE(ended_at, now()) + interval '5 minutes' AS t1
    FROM crew.operations WHERE id = $1
)
SELECT * FROM (
    SELECT 'signal' AS kind, s.first_seen_at AS at, s.seq, s.detected_by AS agent, s.label AS title,
           s.explanation AS detail, s.evidence, NULL::smallint AS score, NULL::text AS level,
           s.signal_type AS subtype, s.confidence, s.times_seen
    FROM crew.signals s WHERE s.operation_id = $1
  UNION ALL
    SELECT 'risk', r.occurred_at, r.seq, 'safecracker', NULL, r.reason, NULL, r.score, r.level, NULL, NULL, NULL
    FROM crew.risk_events r, op WHERE r.operation_id = $1 AND r.occurred_at BETWEEN op.t0 AND op.t1
  UNION ALL
    SELECT 'agent', a.occurred_at, a.seq, a.agent, a.action, a.reason, NULL, NULL, NULL, NULL, NULL, NULL
    FROM crew.agent_events a, op WHERE a.operation_id = $1 AND a.occurred_at BETWEEN op.t0 AND op.t1
  UNION ALL
    SELECT 'intervention', i.occurred_at, i.seq, 'fixer', 'Intervention triggered', array_to_string(i.reasons, ' · '),
           NULL, i.trigger_score, 'critical', NULL, NULL, NULL
    FROM crew.interventions i WHERE i.operation_id = $1
  UNION ALL
    SELECT m.kind, m.occurred_at, m.seq, m.agent, m.title, m.detail, NULL, NULL, NULL, NULL, NULL, NULL
    FROM crew.milestones m, op WHERE m.operation_id = $1 AND m.occurred_at BETWEEN op.t0 AND op.t1
) entries
ORDER BY at, seq
"""

# Timescale time_bucket: compact risk trajectory + "when did risk escalate?"
ESCALATION_SQL = """
SELECT time_bucket('5 seconds', occurred_at) AS bucket, max(score) AS score
FROM crew.risk_events
WHERE operation_id = $1 AND occurred_at BETWEEN $2 AND $3
GROUP BY bucket ORDER BY bucket
"""


def _iso(v: datetime | None) -> str | None:
    return v.isoformat() if v else None


async def get_ledger(conn: asyncpg.Connection, op_id: uuid.UUID) -> dict[str, Any]:
    op = await _require_operation(conn, op_id)
    rows = await conn.fetch(LEDGER_SQL, op_id)
    # Same time window as LEDGER_SQL, so TimescaleDB only scans this operation's chunks.
    t0 = op["started_at"] - timedelta(minutes=1)
    t1 = (op["ended_at"] or datetime.now(timezone.utc)) + timedelta(minutes=5)
    buckets = await conn.fetch(ESCALATION_SQL, op_id, t0, t1)
    intervention = await conn.fetchrow(
        "SELECT occurred_at, trigger_score, reasons, action_selected, outcome FROM crew.interventions WHERE operation_id = $1 ORDER BY occurred_at LIMIT 1",
        op_id,
    )

    entries: list[dict[str, Any]] = [{"at": _iso(op["started_at"]), "kind": "operation_started", "agent": "mastermind", "title": "Operation started", "detail": op["scenario"]}]
    prev_score = 0
    deployed: list[str] = []
    for r in rows:
        k = r["kind"]
        e: dict[str, Any] = {"at": _iso(r["at"]), "kind": k, "agent": r["agent"], "detail": r["detail"]}
        if k == "signal":
            e |= {"title": f"{r['title']} detected", "evidence": r["evidence"], "signal_type": r["subtype"],
                  "confidence": r["confidence"], "times_seen": r["times_seen"]}
        elif k == "risk":
            verb = "increased" if r["score"] > prev_score else "decreased" if r["score"] < prev_score else "held"
            e |= {"title": f"Risk {verb} to {r['score']}: {r['level'].upper()}", "score": r["score"], "level": r["level"]}
            prev_score = r["score"]
        elif k == "agent":
            name = AGENT_NAMES.get(r["agent"], r["agent"])
            e["title"] = {"active": f"{name} deployed", "monitoring": f"{name} monitoring", "complete": f"{name} stood down", "standby": f"{name} on standby"}[r["title"]]
            if r["title"] in ("active", "monitoring") and r["agent"] not in deployed and r["agent"] != "mastermind":
                deployed.append(r["agent"])
        elif k == "intervention":
            e |= {"title": r["title"], "score": r["score"], "level": "critical"}
        else:
            e["title"] = r["title"]
        entries.append(e)
    if op["ended_at"]:
        entries.append({"at": _iso(op["ended_at"]), "kind": "operation_closed", "agent": "mastermind", "title": "Operation closed", "detail": op["outcome"]})

    critical_at = next((r["at"] for r in rows if r["kind"] == "risk" and r["level"] == "critical"), None)
    first_signal = next((r["at"] for r in rows if r["kind"] == "signal"), None)
    signals = [r for r in rows if r["kind"] == "signal"]
    return {
        "source": "tiger_data",
        "operation": {
            "id": str(op["id"]), "mode": op["mode"], "scenario": op["scenario"], "status": op["final_status"],
            "started_at": _iso(op["started_at"]), "ended_at": _iso(op["ended_at"]),
            "peak_risk": op["peak_risk"], "threat_type": op["threat_type"], "outcome": op["outcome"],
            "amount_protected": float(op["amount_protected"]) if op["amount_protected"] is not None else None,
        },
        "summary": {
            "peak_risk": op["peak_risk"],
            "signals_detected": len(signals),
            "repeat_observations": sum((r["times_seen"] or 1) - 1 for r in signals),
            "crew_deployed": deployed,
            "intervention": None if intervention is None else {
                "at": _iso(intervention["occurred_at"]), "trigger_score": intervention["trigger_score"],
                "reasons": list(intervention["reasons"]), "action_selected": intervention["action_selected"], "outcome": intervention["outcome"],
            },
            "outcome": op["outcome"],
            "amount_protected": float(op["amount_protected"]) if op["amount_protected"] is not None else None,
        },
        "escalation": {
            "trajectory": [{"at": _iso(b["bucket"]), "score": b["score"]} for b in buckets],
            "first_signal_at": _iso(first_signal),
            "critical_at": _iso(critical_at),
            "seconds_to_critical": (critical_at - first_signal).total_seconds() if critical_at and first_signal else None,
        },
        "entries": entries,
    }
