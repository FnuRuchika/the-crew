# THE CREW

**Stop the heist before the vault opens.**
RowdyHacks 2026 · **SWIVEL: The Social Engineering Shield**

Social-engineering scammers don't hack the account. They manipulate the person who holds the key.
THE CREW is an AI counter-heist team that notices manipulation *while it is happening*, builds up
explainable evidence, steps in at the moment money is about to move, and gets the person to a trusted
human before anything leaves the vault.

---

## Quick start

Two modes, chosen from Mission Control:

| Mode | Needs | What it is |
|---|---|---|
| **Run Case File 001** | Frontend only | Scripted Eleanor Parker demo. Works fully offline. |
| **Test the Crew** | Frontend + backend + `GEMINI_API_KEY` | Live Gemini analysis of any message a judge types. |

### Frontend (always)

```bash
npm install
npm run dev        # → http://localhost:5173
```

### Backend (for Test the Crew)

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env          # then paste your key into GEMINI_API_KEY=
.venv/bin/uvicorn main:app --reload --port 8000
```

In dev, Vite proxies `/api` → `http://127.0.0.1:8000`, so the browser never needs the backend URL
and **the Gemini key never leaves the server**. Without the backend or key, Test the Crew shows a clear
"offline" system message with Retry. Case File 001 is unaffected.

**Getting a Gemini API key:** go to [Google AI Studio → API keys](https://aistudio.google.com/apikey),
sign in, click *Create API key*, and paste it into `backend/.env` as `GEMINI_API_KEY=...`. The free tier
is enough for a demo. `backend/.env` is git-ignored.

| Script | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Typecheck + production build to `dist/` |
| `npm run typecheck` | TypeScript only |
| `npm run test:risk` | Deterministic risk-engine checks (no network) |
| `npm run smoke:live` | Sends the 3 reference messages to the running backend (needs key) |
| `npm run prewarm:voice` | Generates and caches all Case File 001 + Live Call demo voice clips (needs backend + `ELEVENLABS_API_KEY`) |
| `npm run test:live` | Live Call session logic checks (no network) |
| `npm run db:migrate` | Apply Evidence Ledger migrations to Tiger Data (`DATABASE_URL`) |
| `cd backend && .venv/bin/pip install -r requirements-dev.txt && .venv/bin/python -m pytest` | Backend tests (mocked Gemini, no key needed) |

## Demo script (≈ 2 minutes)

1. **Mission control**: tagline, crew roster, how the shield works. Click **RUN CASE FILE 001**.
2. **Active operation**: press **Next event** (or **→** / **N**), or turn on **Auto play**.
   - "Your grandson Daniel has been arrested." → family emergency claim · **14%**
   - "He needs $2,500 for bail." → **Grifter activated**: emotional leverage · **39%** · Lookout starts monitoring
   - "Send it immediately." → artificial urgency · **58%**
   - "Don't tell his parents." → isolation & secrecy · **76%**
   - Caller sends payment details → Eleanor's banking app opens
3. **Payment attempt**: **Submit payment**. Lookout: new recipient + unusual amount. Inside Man: caller number ≠ Daniel's trusted number. Safecracker combines the evidence → **94% CRITICAL**.
4. **Intervention**: "THE HEIST IS IN PROGRESS". Plain-language evidence, no blame, large buttons.
   Main route: **CALL SARAH — DAUGHTER**. (Every other option works too: *Verify Daniel*, *Wait 10 minutes*, which shows the caller escalating the pressure, and *End the call safely*.)
5. **Trusted verification**: the Inside Man calls Sarah on her *saved* number → "Daniel is safe. Do not send this payment."
6. **Getaway Driver**: payment stopped, safe-exit checklist → **$2,500 PROTECTED** → **Mission report** with a chronological timeline.

**Reset** in the header restarts at any point. The demo controls stay available above every overlay.

## How it answers the SWIVEL questions

| Question | THE CREW |
|---|---|
| What does the shield notice? | Conversation tactics (emergency claim, emotional leverage, urgency, isolation, authority, pressure escalation), payment anomalies (new recipient, unusual amount) and identity inconsistencies (caller number vs. trusted record). |
| When does it intervene? | Not on a hunch. Only when money is in flight **and** risk is critical (≥ 80) **and** at least two crew members independently found evidence (`src/engine/interventionPolicy.ts`). |
| What happens after? | The payment is held. The Fixer offers smart friction: call a trusted contact, verify on a known number, a 10-minute cool-down, or a safe exit. The Getaway Driver walks the person out of the scam. |
| Why would the user listen? | Every warning says exactly what was noticed in plain words, never shames, and the verdict comes from someone they already trust, reached on a number from their own contacts. |

## Architecture

```
src/
  types/            Domain model: Agent, RiskSignal, ConversationEvent, Payment, TrustedContact,
                    Mission, Intervention, MissionEvent, OperationState …
  data/
    crew.ts         Agent roster (who they are)
    signalCatalog.ts Signal labels + plain-language explanations
    scenarios/      CASE FILE 001: Eleanor's profile, contacts, payee history, call script,
                    verification scripts. All story content lives here.
  agents/           One module per crew member, each implementing an async contract (contracts.ts)
    mastermind.ts   Decides who to deploy and why; classifies the threat
    grifter.ts      Conversation manipulation patterns
    lookout.ts      Payment vs. the user's own history (real logic)
    insideMan.ts    Claimed identity vs. trusted numbers / payees (real logic)
    safecracker.ts  Evidence fusion via the risk engine
    fixer.ts        Builds the empathetic intervention + safe actions
    getawayDriver.ts Safe-exit plan
    index.ts        Agent registry (swap mocks for real agents here)
  engine/
    riskEngine.ts   Swappable RiskEngine; Phase 1 = explainable noisy-OR rules
    interventionPolicy.ts  When friction is justified
  operation/        Pure state transitions (missionState.ts) + command-centre panels
  hooks/useOperation.ts   Sequences the story, calls agents, Next / Auto play / Reset
  intervention/     Intervention, verification, cool-down, getaway, protected screens
  mission-report/   Report builder (derived from state) + timeline
  services/         Integration seams: voice, physiological context, event store
  screens/          Landing + Operation
```

**Risk engine.** Each signal category has a weight (0–1). Weights combine as independent evidence
(`score = 1 − Π(1 − wᵢ)`), so the score rises with corroboration but never claims 100% certainty.
The demo progression 14 → 39 → 58 → 76 → 82 → 87 → 94 falls straight out of the weights in
`SIGNAL_WEIGHTS`. Every signal shows how many points it added, so the score is always explainable.

**Agents are async on purpose.** The UI only talks to `services.crew`. Replacing any mock with a
backend/LLM call that returns the same shapes (`RiskSignal[]`, `Deployment[]`, `Intervention`) needs no
UI changes.

## Test the Crew: live Gemini analysis (Phase 2)

```
Browser ──POST /api/analyze {text}──▶ FastAPI ──generateContent (JSON schema)──▶ Gemini
   ▲                                     │ validate + ground evidence
   └──── signals (+ evidence offsets) ◀──┘
   │
   └─▶ src/engine/liveRiskEngine.ts  (deterministic score, level, verdict)
```

**AI interprets. THE CREW decides.** Gemini plays THE GRIFTER: it returns structured signals
(`type`, `label`, `confidence`, exact `evidence` phrase, `explanation`), plus `claimed_identity`,
`requested_action` and a cautious `summary`. It is told never to recommend blocking or allowing
payments. The score is computed by our own engine.

**Backend safeguards** (`backend/`)
- Strict response schema (`responseMimeType: application/json`, `temperature: 0`), then Pydantic validation:
  unknown signal types → `other_manipulation`, confidence clamped to 0–1, max 12 signals, exact duplicates dropped.
- **Evidence grounding:** every evidence phrase is located in the submitted text (exact, then case/quote-insensitive,
  then whitespace-tolerant). Offsets are returned for highlighting. Ungrounded evidence is flagged.
- Input: 3–2,000 characters, control characters stripped, unknown fields rejected.
- Errors map to stable codes the UI explains: `not_configured`, `timeout`, `rate_limited`, `malformed_response`,
  `auth_failed`, `model_unavailable`, `blocked`, `upstream_error`, `backend_unreachable`. **No fallback ever
  fabricates an AI result.**
- Key sent in the `x-goog-api-key` header (never in a URL), never logged. Submitted text is never logged or stored.
- CORS allows only `FRONTEND_ORIGINS` (default `http://localhost:5173`, `http://127.0.0.1:5173`). In-memory rate limit: 12 requests/minute/IP.

**Model:** `gemini-3.5-flash-lite` by default (about 2s, structured output). If it is overloaded, rate-limited or times out, the backend
retries once on `gemini-3.1-flash-lite` (`GEMINI_FALLBACK_MODELS`). The response says which model actually answered.
Auth and validation errors never trigger a fallback. Override the primary model with `GEMINI_MODEL`. In Oct 2026 testing, the larger
3.6–3.8 Flash models were returning `503 UNAVAILABLE` ("high demand").

### Live scoring logic (`src/engine/liveRiskEngine.ts`)

1. Each signal type has a fixed **base weight**: credential/OTP request 0.50 · remote access 0.50 · unusual payment 0.45 ·
   isolation/secrecy 0.43 · prize/investment 0.35 · urgency 0.31 · authority 0.30 · romance 0.30 · suspicious link 0.30 ·
   emotional leverage 0.29 · family emergency 0.20 · other 0.15.
2. `effective = base × confidence`. Signals under **0.35 confidence are ignored**.
3. Evidence not found in the message: `effective × 0.75`.
4. Only the **strongest signal per type** counts (no inflation by repetition).
5. Combine with the same noisy-OR as Case File 001: `risk = 1 − Π(1 − effective)`. It cannot exceed 100%.
6. Levels: < 30 low · 30 elevated · 55 high · 80 critical. High/critical shows **POTENTIAL HEIST DETECTED**.

Identical Gemini output always gives an identical score (`npm run test:risk` verifies this, along with
order-independence, the 100% cap, and that Case File 001's 14 → 94 progression is unchanged).

## Voice: ElevenLabs (Phase 3)

Case File 001 can be **heard**: the scam caller's lines are spoken as they appear, the intervention is spoken by a calm
guardian voice, and Sarah (or Daniel) answers the trusted verification call. The transcript, risk engine, crew and demo
controls are unchanged. Voice only *observes* the scripted operation (`src/voice/useCaseFileVoice.ts`), so **text-only is
always a complete fallback**.

| Role | Used for | Voice (ElevenLabs premade) |
|---|---|---|
| `caller` | Scam caller lines | Eric, smooth and plausible |
| `guardian` | "THE HEIST IS IN PROGRESS" + "Read this to me" | Matilda, warm and calm (slower, low style) |
| `family_female` | Sarah's verification lines | Jessica |
| `family_male` | Daniel's verification lines | Liam |

No cloned or real-person voices. Model: **`eleven_v4`**, with automatic fallback to `eleven_multilingual_v2`.

**Controls:** **Voice on/off** in the demo controls (remembered per browser). Auto play waits for each spoken line to finish.
If voice fails for any reason (no key, quota, outage, backend down), a subtle *Voice unavailable* label appears and the
demo continues as text. "Read this to me" falls back to the browser's built-in voice.

**Security:** the browser calls `POST /api/voice/speak {role, text}` on our backend; only the backend holds
`ELEVENLABS_API_KEY` (sent as the `xi-api-key` header, never logged). Roles are a fixed list, text is capped at 400
characters, and new generations are rate-limited to 30 per minute per IP (cached clips are free).

### Caching & prewarm (do this before judging)

```bash
# backend running (see Quick start), then:
npm run prewarm:voice
```

This generates all 13 Case File clips (about 910 characters, a one-time cost) into **`backend/.voice-cache/`**: one MP3
per line, keyed by a hash of role + text + voice + settings + model. Re-running costs nothing. During the demo:
- the backend serves clips straight from disk, **even if ElevenLabs is down or the key is removed**;
- the browser prefetches every clip when Case File 001 opens and keeps them in memory, so lines play instantly and Replay makes no new requests.

`backend/.voice-cache/` is **git-ignored**: generated audio isn't committed (licensing and repo size). Regenerate it on
any machine with `npm run prewarm:voice`. Changing a line's text, voice or model automatically creates a new cache entry.

## Live Call: spoken analysis (Phase 4)

**Mission Control → LIVE CALL.** Press **Start listening**, let the caller speak (phone on speaker), then press
**Stop & analyze**. Each 1–30s segment goes:

```
Microphone (MediaRecorder) → POST /api/transcribe → ElevenLabs Speech-to-Text (scribe_v2)
  → transcript appended to the session → POST /api/analyze (Gemini, whole conversation so far)
  → deterministic live risk engine → Mastermind deploys only the agents the evidence calls for
  → existing intervention design when risk reaches CRITICAL (≥ 80)
```

- **Session, not one-offs.** Every segment is re-assessed in context. Evidence is merged across segments
  (same tactic + same phrase = one entry, strongest confidence kept) and scored with the same engine as
  TEST THE CREW (strongest signal per tactic, noisy-OR, capped below 100%), so repetition can't inflate risk.
- **Crew:** GRIFTER for manipulation language · LOOKOUT for payment or account-access requests · INSIDE MAN when
  the caller claims an identity (bank, police, relative) · SAFECRACKER once 2+ tactics corroborate · FIXER at
  critical risk · GETAWAY DRIVER once the person picks a safe option.
- **LOAD DEMO AUDIO** (judging fallback): three pre-recorded caller segments (ElevenLabs TTS, cached by
  `npm run prewarm:voice`) are sent through the **same** `/api/transcribe` → Gemini pipeline. Nothing about the
  transcript is hard-coded.
- **Privacy:** the microphone starts only on click and is released on Stop. The backend handles audio in
  memory only: it is never written to disk or logged, and transcripts aren't logged. Audio is processed by
  ElevenLabs (STT) and the text by Gemini.
- **Failures:** mic blocked → clear message + retry + demo audio · STT failure → no fake transcript, Retry/Discard ·
  Gemini failure → transcript kept, "Analysis temporarily unavailable", Retry analysis. The session is never lost.
- `/api/transcribe` limits: 1 KB–10 MB, webm/ogg/mp4/m4a/mp3/wav/aac (declared type **and** file signature
  checked), 20 per minute per IP, 20s upstream timeout, fallback to `scribe_v1`.
- `npm run test:live` checks session windowing, evidence de-duplication and selective crew deployment.

## Evidence Ledger: Tiger Data (Phase 5)

**Gemini understands the conversation. ElevenLabs gives THE CREW ears and a voice. Tiger Data gives THE CREW memory.
THE CREW's deterministic policy engine decides when to intervene.**

Every operation (Case File 001, TEST THE CREW, Live Call) is recorded as a chronological, explainable evidence
trail in Tiger Data (PostgreSQL + TimescaleDB). The Mission Report and the end of a Live Call show the **Evidence
Ledger**, reconstructed from the database: what was noticed (with the exact evidence phrase), when risk escalated,
which agents responded, why THE CREW intervened, what the person chose, and the outcome.

### Setup

```bash
# backend/.env
DATABASE_URL=postgres://…?sslmode=require   # your Tiger Data service URI (never commit)

npm run db:migrate        # repeatable: applies pending migrations, prints only versions/hypertables
```
The backend also migrates automatically at startup (in the background: the API never waits on the database).

### Schema (`backend/db/migrations/`, schema `crew`)

| Table | Kind | Why |
|---|---|---|
| `operations` | PostgreSQL table | One row per operation: mode, start/end, peak risk, status, amount protected, threat, outcome |
| `signals` | PostgreSQL table, `UNIQUE(operation_id, signal_type, evidence_key)` | De-duplicated evidence entities: confidence, label, evidence phrase, explanation, detecting agent, source, `times_seen` |
| `interventions` | PostgreSQL table | Trigger score, reasons, action selected, outcome |
| `risk_events` | **Hypertable** (7-day chunks) | Risk score/level over time |
| `agent_events` | **Hypertable** | Crew deployments and stand-downs |
| `milestones` | **Hypertable** | Payment initiated, segment analyzed (metadata only), verification, action, outcome |

**TimescaleDB, used where it fits:** the three append-only event streams are hypertables. Ledger reads filter by
the operation's time window, so only the relevant chunks are scanned. A **columnstore policy** (segmented by
`operation_id`) compresses history after 7 days, and **`time_bucket`** powers the escalation analysis
("first warning sign → critical in N s", 5-second risk trajectory). Entities that need uniqueness (signals,
interventions) stay plain PostgreSQL. Foreign keys, CHECK constraints and indexes throughout.

### De-duplication
Gemini re-analyzes the whole conversation on every Live Call segment and often re-quotes the same moment.
A signal is the *same evidence* when it has the same tactic and its normalized phrase is identical, contained in
the other, or overlaps by at least 60% of words. The repeat updates the existing row (`times_seen`, max confidence) instead of
inserting a new one. Appends lock the operation row, so this is race-free, and they're idempotent under retries
(a re-sent event with the same `seq` changes nothing).

### Privacy: what is NOT stored
No audio (no binary columns exist), no full transcripts or typed messages (only the short evidence phrase
behind each signal, max 300 chars), no API keys, no `DATABASE_URL`, no IPs or device data. Case File 001 is fictional.

### Offline by design
The ledger is **never** on the safety path. Each operation keeps an in-memory session ledger. Events are mirrored to
Tiger Data in small background batches with 4-second timeouts. On the first failure the operation switches to
**Ledger offline** (subtle label, no retries, no error shown to the user) and the report shows the session copy.
The backend uses a small pool (1–4 connections) and a 30-second circuit breaker, and logs only exception types (never
hosts or credentials). "Operational intelligence powered by Tiger Data" appears only when the ledger was actually
reconstructed from the database.

## Integration map (future phases)

| Integration | Where it connects | Notes |
|---|---|---|
| **FastAPI backend** | ✅ `backend/` (Phase 2). Later: `src/services/index.ts` → `crew: createRemoteCrew(...)` implementing `Crew` | All keys live server-side. The browser never sees them. |
| **Google Gemini** | ✅ Phase 2: **Grifter** in *Test the Crew* (`backend/services/gemini_service.py`). Next: Mastermind (`Mastermind.plan` / `classifyThreat`), and the Grifter inside Case File 001 via `ConversationAnalyst.analyze` | Structured output. The deterministic engine keeps the safety decision. |
| **ElevenLabs** | ✅ Phase 3: `backend/services/elevenlabs_service.py` + `src/voice/` | Caller, guardian and family voices for Case File 001. Later: live call audio → transcript → Grifter. |
| **Tiger Data / PostgreSQL** | ✅ Phase 5: `backend/db/` + `backend/routes/ledger.py` + `src/ledger/` | Evidence Ledger (hypertables + columnstore + time_bucket). Later: Lookout payee history. |
| **Presage** | `PhysiologicalContextProvider` (Phase 1: disabled) | Opt-in only. At most **one weak signal** in the risk engine, never proof of a scam. |
| **Vultr** | Deploy the FastAPI service + `npm run build` static output | |
| **GoDaddy** | Domain pointing at the Vultr deployment | |
| **Auth** | Wrap `App` with a session provider. `TargetProfile` comes from the user's account. | |
| **Solana** | Not planned for now | Only if a payment rail needs it later. |

## Accessibility

- Intervention screens are simplified overlays: large type (20–28 px), large buttons, one decision at a time.
- Status is never colour-only: every agent status, risk level and severity has a text label and icon.
- `role="alertdialog"` on the intervention, focus is moved to the recommended action, and live regions announce new messages and signals.
- Respects `prefers-reduced-motion` (Framer Motion `MotionConfig reducedMotion="user"`).
- "Read this to me" speaks the warning aloud.
