"""THE CREW's voice: ElevenLabs text-to-speech.

Independent of the Gemini service. The browser asks for a *role* (caller, guardian, …)
plus a short line of text; the server picks the voice, calls ElevenLabs with the key held
server-side, and caches the MP3 on disk so each line is generated once.

Voices are ElevenLabs *premade* stock voices: no cloning, no real-person imitation.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import time
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path

import httpx

log = logging.getLogger("the_crew.voice")

API_ROOT = "https://api.elevenlabs.io/v1"
DEFAULT_MODEL = "eleven_v4"
DEFAULT_FALLBACK_MODELS = ("eleven_multilingual_v2",)
OUTPUT_FORMAT = "mp3_44100_128"
MAX_TEXT_CHARS = 400
DEFAULT_CACHE_DIR = Path(__file__).resolve().parent.parent / ".voice-cache"


class VoiceRole(str, Enum):
    caller = "caller"  # the scam caller in Case File 001
    guardian = "guardian"  # THE CREW's calm protective intervention voice
    family_female = "family_female"  # trusted contact (Sarah, daughter)
    family_male = "family_male"  # claimed person (Daniel, grandson)


@dataclass(frozen=True)
class VoiceProfile:
    voice_id: str
    name: str
    stability: float
    similarity_boost: float
    style: float
    speed: float


# Premade ElevenLabs voices verified available to this account's plan.
VOICE_PROFILES: dict[VoiceRole, VoiceProfile] = {
    # Smooth, plausible middle-aged American man: believable, not cartoonish.
    VoiceRole.caller: VoiceProfile("cjVigY5qzO86Huf0OWal", "Eric", stability=0.38, similarity_boost=0.75, style=0.35, speed=1.05),
    # Warm and steady, a little slower: calm, never alarming.
    VoiceRole.guardian: VoiceProfile("XrExE9yKIg1WjnnlVkGX", "Matilda", stability=0.8, similarity_boost=0.75, style=0.05, speed=0.92),
    VoiceRole.family_female: VoiceProfile("cgSgspJ2msm6clMCkdW9", "Jessica", stability=0.5, similarity_boost=0.75, style=0.25, speed=1.0),
    VoiceRole.family_male: VoiceProfile("TX3LPaxmHKxFdv7VOQHJ", "Liam", stability=0.5, similarity_boost=0.75, style=0.25, speed=1.0),
}

# Upstream conditions where trying the next model is worthwhile.
FALLBACK_CODES = {"voice_unavailable", "upstream_error", "timeout", "model_unavailable"}


class VoiceError(Exception):
    def __init__(self, code: str, message: str, status: int, retryable: bool):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status
        self.retryable = retryable


@dataclass(frozen=True)
class VoiceConfig:
    api_key: str | None
    model: str = DEFAULT_MODEL
    fallback_models: tuple[str, ...] = DEFAULT_FALLBACK_MODELS
    timeout_seconds: float = 20
    cache_dir: Path = field(default=DEFAULT_CACHE_DIR)

    @property
    def models(self) -> tuple[str, ...]:
        return (self.model, *(m for m in self.fallback_models if m != self.model))

    @classmethod
    def from_env(cls) -> "VoiceConfig":
        raw_fb = os.getenv("ELEVENLABS_FALLBACK_MODELS")
        return cls(
            api_key=(os.getenv("ELEVENLABS_API_KEY") or "").strip() or None,
            model=(os.getenv("ELEVENLABS_MODEL") or DEFAULT_MODEL).strip(),
            fallback_models=tuple(m.strip() for m in raw_fb.split(",") if m.strip()) if raw_fb is not None else DEFAULT_FALLBACK_MODELS,
            timeout_seconds=float(os.getenv("ELEVENLABS_TIMEOUT_SECONDS") or 20),
            cache_dir=Path(os.getenv("VOICE_CACHE_DIR") or DEFAULT_CACHE_DIR),
        )


@dataclass(frozen=True)
class SpeechResult:
    audio: bytes
    cache_hit: bool
    model: str
    voice_name: str


def cache_key(role: VoiceRole, text: str, config: VoiceConfig) -> str:
    """Stable key: same role + text + voice + settings + model chain ⇒ same file."""
    p = VOICE_PROFILES[role]
    material = json.dumps(
        {"t": text, "v": p.voice_id, "s": [p.stability, p.similarity_boost, p.style, p.speed], "m": config.models, "f": OUTPUT_FORMAT},
        sort_keys=True,
    )
    return hashlib.sha256(material.encode()).hexdigest()[:32]


def normalise_text(text: str) -> str:
    cleaned = " ".join("".join(ch for ch in text if ch.isprintable()).split())
    if not cleaned:
        raise VoiceError("invalid_input", "Text is required.", 422, False)
    if len(cleaned) > MAX_TEXT_CHARS:
        raise VoiceError("invalid_input", f"Text must be at most {MAX_TEXT_CHARS} characters.", 422, False)
    return cleaned


class ElevenLabsService:
    def __init__(self, config: VoiceConfig, transport: httpx.AsyncBaseTransport | None = None):
        self.config = config
        self._transport = transport  # injectable for tests

    @property
    def configured(self) -> bool:
        return self.config.api_key is not None

    def _cache_path(self, key: str) -> Path:
        return self.config.cache_dir / f"{key}.mp3"

    def cached(self, role: VoiceRole, text: str) -> bool:
        return self._cache_path(cache_key(role, normalise_text(text), self.config)).exists()

    async def speak(self, role: VoiceRole, text: str) -> SpeechResult:
        text = normalise_text(text)
        profile = VOICE_PROFILES[role]
        path = self._cache_path(cache_key(role, text, self.config))
        if path.exists():
            return SpeechResult(path.read_bytes(), True, "cache", profile.name)
        if not self.config.api_key:
            raise VoiceError("not_configured", "Voice is offline: ELEVENLABS_API_KEY is not set on the server.", 503, False)

        last: VoiceError | None = None
        for model in self.config.models:
            try:
                audio = await self._synthesize(model, profile, text)
            except VoiceError as e:
                last = e
                if e.code not in FALLBACK_CODES:
                    raise
                log.warning("voice model %s failed (%s); trying next model if any", model, e.code)
                continue
            self._write_cache(path, audio)
            log.info("voice generated: role=%s model=%s chars=%d bytes=%d", role.value, model, len(text), len(audio))
            return SpeechResult(audio, False, model, profile.name)
        assert last is not None
        raise last

    def _write_cache(self, path: Path, audio: bytes) -> None:
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            tmp = path.with_suffix(".tmp")
            tmp.write_bytes(audio)
            tmp.replace(path)  # atomic: never serve half-written audio
        except OSError as e:
            log.warning("voice cache write failed (%s)", type(e).__name__)

    async def _synthesize(self, model: str, p: VoiceProfile, text: str) -> bytes:
        url = f"{API_ROOT}/text-to-speech/{p.voice_id}"
        body = {
            "text": text,
            "model_id": model,
            "voice_settings": {
                "stability": p.stability,
                "similarity_boost": p.similarity_boost,
                "style": p.style,
                "use_speaker_boost": True,
                "speed": p.speed,
            },
        }
        started = time.perf_counter()
        try:
            async with httpx.AsyncClient(timeout=self.config.timeout_seconds, transport=self._transport) as client:
                # Key in a header, never a URL; never logged.
                resp = await client.post(url, params={"output_format": OUTPUT_FORMAT}, json=body, headers={"xi-api-key": self.config.api_key})
        except httpx.TimeoutException as e:
            raise VoiceError("timeout", "Voice generation took too long.", 504, True) from e
        except httpx.HTTPError as e:
            raise VoiceError("upstream_unreachable", "Couldn't reach ElevenLabs.", 502, True) from e

        if resp.status_code == 200 and resp.headers.get("content-type", "").startswith("audio/") and resp.content:
            log.debug("voice upstream ok in %dms", int((time.perf_counter() - started) * 1000))
            return resp.content
        status = _detail_status(resp)
        if resp.status_code == 429:
            raise VoiceError("rate_limited", "ElevenLabs rate limit reached. Retry shortly.", 429, True)
        if status == "quota_exceeded":
            raise VoiceError("quota_exceeded", "ElevenLabs character quota is used up.", 502, False)
        if resp.status_code in (401, 403):
            raise VoiceError("auth_failed", "ElevenLabs rejected the server's API key.", 502, False)
        if resp.status_code == 402 or status in {"voice_not_found", "payment_required"}:
            raise VoiceError("voice_unavailable_on_plan", "This voice isn't available on the current ElevenLabs plan.", 502, False)
        if resp.status_code in (400, 404, 422) and "model" in (status or ""):
            raise VoiceError("model_unavailable", f"Model '{model}' isn't available.", 502, False)
        if resp.status_code in (500, 502, 503):
            raise VoiceError("voice_unavailable", "ElevenLabs is temporarily unavailable.", 503, True)
        log.warning("ElevenLabs HTTP %s (%s)", resp.status_code, status)
        raise VoiceError("upstream_error", f"ElevenLabs returned an error ({resp.status_code}).", 502, True)


def _detail_status(resp: httpx.Response) -> str | None:
    try:
        detail = resp.json().get("detail")
    except (ValueError, AttributeError):
        return None
    return detail.get("status") if isinstance(detail, dict) else None
