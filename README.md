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

## Integration map (future phases)

| Integration | Where it connects | Notes |
|---|---|---|
| **FastAPI backend** | ✅ `backend/` (Phase 2). Later: `src/services/index.ts` → `crew: createRemoteCrew(...)` implementing `Crew` | All keys live server-side. The browser never sees them. |
| **Google Gemini** | ✅ Phase 2: **Grifter** in *Test the Crew* (`backend/services/gemini_service.py`). Next: Mastermind (`Mastermind.plan` / `classifyThreat`), and the Grifter inside Case File 001 via `ConversationAnalyst.analyze` | Structured output. The deterministic engine keeps the safety decision. |
| **ElevenLabs** | `VoiceService` in `src/services/contracts.ts` (Phase 1: browser SpeechSynthesis via "Read this to me") | Calm spoken intervention. Later, live call audio → transcript → Grifter. |
| **Tiger Data / PostgreSQL** | `MissionEventStore` (Phase 1: in-memory, already receives every `MissionEvent`) | Hypertable of timestamped mission / risk / intervention events. Lookout payee history can come from here too. |
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
