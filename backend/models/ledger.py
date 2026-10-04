"""Validated shapes for the Evidence Ledger API.

Only what's needed to explain a safety decision is accepted: short evidence phrases,
labels, scores, agent actions. No audio, no transcripts, no free-form blobs.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Annotated, Literal, Union

from pydantic import BaseModel, ConfigDict, Field, field_validator

AgentId = Literal["mastermind", "grifter", "lookout", "insideMan", "safecracker", "fixer", "getaway"]
Mode = Literal["case_file", "typed", "live_call"]
RiskLevel = Literal["low", "elevated", "high", "critical"]
ActionId = Literal["call-trusted-contact", "verify-claimed-person", "wait", "exit"]
FinalStatus = Literal["protected", "safe_exit", "assessed", "abandoned"]

MAX_EVENTS_PER_BATCH = 100


def _check_time(v: datetime) -> datetime:
    if v.tzinfo is None:
        raise ValueError("Timestamp must include a timezone.")
    now = datetime.now(timezone.utc)
    if v > now + timedelta(minutes=5) or v < now - timedelta(days=2):
        raise ValueError("Timestamp is outside the accepted window.")
    return v


class _Event(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    occurred_at: datetime
    seq: int = Field(..., ge=0, le=1_000_000)

    _t = field_validator("occurred_at")(_check_time)


class SignalEvent(_Event):
    kind: Literal["signal"]
    signal_type: str = Field(..., pattern=r"^[a-z][a-z_-]{1,39}$")
    label: str = Field(..., min_length=1, max_length=80)
    confidence: float | None = Field(default=None, ge=0, le=1)
    severity: Literal["low", "medium", "high"] | None = None
    evidence: str | None = Field(default=None, max_length=300)
    explanation: str | None = Field(default=None, max_length=500)
    detected_by: AgentId
    source: Literal["scripted_rules", "payment_rules", "identity_rules", "gemini"]


class RiskEvent(_Event):
    kind: Literal["risk"]
    score: int = Field(..., ge=0, le=100)
    level: RiskLevel
    reason: str | None = Field(default=None, max_length=200)


class AgentEvent(_Event):
    kind: Literal["agent"]
    agent: AgentId
    action: Literal["active", "monitoring", "standby", "complete"]
    reason: str | None = Field(default=None, max_length=240)


class InterventionEvent(_Event):
    kind: Literal["intervention"]
    trigger_score: int = Field(..., ge=0, le=100)
    reasons: list[Annotated[str, Field(min_length=1, max_length=80)]] = Field(default_factory=list, max_length=12)


class ActionEvent(_Event):
    kind: Literal["action"]
    action_selected: ActionId
    title: str = Field(..., min_length=1, max_length=160)


class OutcomeEvent(_Event):
    kind: Literal["outcome"]
    outcome: str = Field(..., min_length=1, max_length=200)
    agent: AgentId | None = None


class MilestoneEvent(_Event):
    kind: Literal["milestone"]
    milestone: Literal["operation_started", "segment_analyzed", "payment_initiated", "verification", "note"]
    agent: AgentId | None = None
    title: str = Field(..., min_length=1, max_length=160)
    detail: str | None = Field(default=None, max_length=300)


LedgerEvent = Annotated[
    Union[SignalEvent, RiskEvent, AgentEvent, InterventionEvent, ActionEvent, OutcomeEvent, MilestoneEvent],
    Field(discriminator="kind"),
]


class CreateOperation(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    mode: Mode
    scenario: str | None = Field(default=None, max_length=80, pattern=r"^[A-Za-z0-9 _.:-]*$")
    started_at: datetime | None = None

    _t = field_validator("started_at")(lambda v: v if v is None else _check_time(v))


class AppendEvents(BaseModel):
    model_config = ConfigDict(extra="forbid")

    events: list[LedgerEvent] = Field(..., min_length=1, max_length=MAX_EVENTS_PER_BATCH)


class CompleteOperation(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    final_status: FinalStatus
    peak_risk: int = Field(..., ge=0, le=100)
    amount_protected: Decimal | None = Field(default=None, ge=0, le=Decimal("1000000000"), decimal_places=2)
    threat_type: str | None = Field(default=None, max_length=120)
    outcome: str | None = Field(default=None, max_length=200)
    ended_at: datetime | None = None

    _t = field_validator("ended_at")(lambda v: v if v is None else _check_time(v))
