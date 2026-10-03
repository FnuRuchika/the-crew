"""Request/response models for live transmission analysis.

Gemini's output is untrusted: everything it returns is validated and normalised here
before it reaches the frontend. Gemini *interprets*; it never decides the risk score.
"""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, ConfigDict, Field, field_validator

MAX_INPUT_CHARS = 2000
MIN_INPUT_CHARS = 3
MAX_SIGNALS = 12


class SignalType(str, Enum):
    artificial_urgency = "artificial_urgency"
    emotional_leverage = "emotional_leverage"
    authority_impersonation = "authority_impersonation"
    isolation_secrecy = "isolation_secrecy"
    unusual_payment_request = "unusual_payment_request"
    credential_request = "credential_request"
    remote_access_request = "remote_access_request"
    suspicious_link = "suspicious_link"
    family_emergency = "family_emergency"
    romance_manipulation = "romance_manipulation"
    prize_investment_claim = "prize_investment_claim"
    other_manipulation = "other_manipulation"


SIGNAL_DESCRIPTIONS: dict[SignalType, str] = {
    SignalType.artificial_urgency: "Time pressure, deadlines, 'immediately', threats of consequences for delay.",
    SignalType.emotional_leverage: "Fear, panic, guilt, shame or love used to override careful thinking.",
    SignalType.authority_impersonation: "Claims to be a bank, police, government, court, tech support, employer, etc.",
    SignalType.isolation_secrecy: "Don't hang up, don't tell anyone, keep it secret, don't contact the bank/family.",
    SignalType.unusual_payment_request: "Gift cards, wire transfers, crypto, payment apps, cash pickup, moving money to a 'safe' account.",
    SignalType.credential_request: "Asks for passwords, PINs, one-time codes (OTP), card numbers, gift-card numbers, SSN.",
    SignalType.remote_access_request: "Asks to install software, share screen, or give remote control of a device.",
    SignalType.suspicious_link: "Pushes the recipient to click or visit a link or unfamiliar website.",
    SignalType.family_emergency: "Claims a relative is arrested, hurt, stranded or in trouble.",
    SignalType.romance_manipulation: "Affection or a relationship used to request money or favours.",
    SignalType.prize_investment_claim: "Prizes, lotteries, guaranteed returns, investment or crypto opportunities.",
    SignalType.other_manipulation: "Any other social-engineering tactic not covered above.",
}


class AnalyzeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str = Field(..., description="The intercepted communication to analyse.")

    @field_validator("text")
    @classmethod
    def _validate_text(cls, v: str) -> str:
        # Strip control characters except newlines/tabs; collapse surrounding whitespace.
        cleaned = "".join(ch for ch in v if ch in "\n\t" or ch.isprintable()).strip()
        if len(cleaned) < MIN_INPUT_CHARS:
            raise ValueError(f"Message must be at least {MIN_INPUT_CHARS} characters.")
        if len(cleaned) > MAX_INPUT_CHARS:
            raise ValueError(f"Message must be at most {MAX_INPUT_CHARS} characters.")
        return cleaned


# ─────────── What Gemini must return (validated) ───────────


class GeminiSignal(BaseModel):
    model_config = ConfigDict(extra="ignore")

    type: SignalType
    label: str = Field(..., max_length=80)
    confidence: float
    evidence: str = Field(..., max_length=400)
    explanation: str = Field(..., max_length=500)

    @field_validator("type", mode="before")
    @classmethod
    def _coerce_type(cls, v: object) -> object:
        # Unknown categories are kept but downgraded to the generic bucket.
        if isinstance(v, str) and v not in SignalType._value2member_map_:
            return SignalType.other_manipulation
        return v

    @field_validator("confidence", mode="before")
    @classmethod
    def _clamp_confidence(cls, v: object) -> float:
        f = float(v)  # raises -> validation error on garbage
        return max(0.0, min(1.0, f))

    @field_validator("label", "evidence", "explanation", mode="before")
    @classmethod
    def _strip(cls, v: object) -> object:
        return v.strip() if isinstance(v, str) else v


class GeminiAnalysis(BaseModel):
    model_config = ConfigDict(extra="ignore")

    is_suspicious: bool
    signals: list[GeminiSignal] = Field(default_factory=list)
    claimed_identity: str | None = Field(default=None, max_length=200)
    requested_action: str | None = Field(default=None, max_length=200)
    summary: str = Field(..., max_length=800)

    @field_validator("signals")
    @classmethod
    def _cap(cls, v: list[GeminiSignal]) -> list[GeminiSignal]:
        return v[:MAX_SIGNALS]

    @field_validator("claimed_identity", "requested_action", mode="before")
    @classmethod
    def _empty_to_none(cls, v: object) -> object:
        if isinstance(v, str) and v.strip().lower() in {"", "none", "null", "n/a", "unknown"}:
            return None
        return v


# ─────────── What the API returns to the frontend ───────────


class AnalyzedSignal(GeminiSignal):
    """A Gemini signal plus our own grounding check against the original text."""

    evidence_verbatim: bool = Field(..., description="Evidence was found in the submitted text.")
    evidence_start: int | None = None
    evidence_end: int | None = None


class AnalysisResult(BaseModel):
    is_suspicious: bool
    signals: list[AnalyzedSignal]
    claimed_identity: str | None
    requested_action: str | None
    summary: str


class AnalyzeResponse(BaseModel):
    source: str = "gemini"
    model: str
    latency_ms: int
    analysis: AnalysisResult


class ErrorBody(BaseModel):
    code: str
    message: str
    retryable: bool


class ErrorResponse(BaseModel):
    error: ErrorBody
